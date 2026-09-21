/**
 * Approval-gated rejection core for a host-supplied Loxo transport.
 *
 * This repository does not ship browser automation or a live mutation adapter.
 * A consumer must import executeRejectManifest(...) and provide a transport with
 * getJSON(path) and createPersonEvent(payload). Direct execution fails closed.
 */
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  asPositiveInteger,
  candidateList,
  candidatePersonId,
  deriveStageId,
  eventList,
  normalizeBaseUrl,
  validateStageDefinitions,
} from "./pull_pipeline.mjs";

function configuredStageId(value, stages, label) {
  const id = asPositiveInteger(value, label);
  if (!stages.some((stage) => stage.id === id)) {
    throw new TypeError(`${label} must reference a configured stage.`);
  }
  return id;
}

function boundedInteger(value, fallback, label, maximum) {
  if (value == null) return fallback;
  const parsed = asPositiveInteger(value, label);
  if (parsed > maximum) throw new TypeError(`${label} must be at most ${maximum}.`);
  return parsed;
}

export function validateRejectConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Reject config must be an object.");
  }
  const stages = validateStageDefinitions(value.stages);
  const appliedStageId = configuredStageId(value.appliedStageId, stages, "appliedStageId");
  const rejectedStageId = configuredStageId(value.rejectedStageId, stages, "rejectedStageId");
  if (appliedStageId === rejectedStageId) throw new TypeError("appliedStageId and rejectedStageId must differ.");
  return {
    agencyId: asPositiveInteger(value.agencyId, "agencyId"),
    jobId: asPositiveInteger(value.jobId, "jobId"),
    baseUrl: normalizeBaseUrl(value.baseUrl),
    stages,
    appliedStageId,
    rejectedStageId,
    rejectedActivityTypeId: asPositiveInteger(value.rejectedActivityTypeId, "rejectedActivityTypeId"),
    pageSize: boundedInteger(value.pageSize, 250, "pageSize", 250),
    maxPages: boundedInteger(value.maxPages, 20, "maxPages", 1000),
  };
}

function validManifestId(value) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(result)) {
    throw new TypeError("manifestId must be a stable non-empty identifier.");
  }
  return result;
}

function validateManifest(rawManifest, config) {
  if (!rawManifest || typeof rawManifest !== "object" || Array.isArray(rawManifest)) {
    throw new TypeError("Reject manifest must be an object.");
  }
  const agencyId = asPositiveInteger(rawManifest.agencyId, "manifest agencyId");
  const jobId = asPositiveInteger(rawManifest.jobId, "manifest jobId");
  if (agencyId !== config.agencyId || jobId !== config.jobId) {
    throw new TypeError("Reject manifest agencyId and jobId must match the validated config.");
  }
  if (!Array.isArray(rawManifest.actions) || rawManifest.actions.length === 0) {
    throw new TypeError("Reject manifest actions must be a non-empty array.");
  }
  const seen = new Set();
  const actions = rawManifest.actions.map((action, index) => {
    if (!action || typeof action !== "object" || Array.isArray(action)) {
      throw new TypeError(`actions[${index}] must be an object.`);
    }
    const personId = asPositiveInteger(action.personId, `actions[${index}].personId`);
    if (seen.has(personId)) throw new TypeError(`Duplicate reject action for person ${personId}.`);
    seen.add(personId);
    const expectedCurrentStageId = configuredStageId(action.expectedCurrentStageId, config.stages, `actions[${index}].expectedCurrentStageId`);
    if (expectedCurrentStageId === config.rejectedStageId) {
      throw new TypeError(`actions[${index}] already expects the rejected stage.`);
    }
    const reason = typeof action.reason === "string" ? action.reason.trim() : "";
    if (!reason || reason.length > 2000) {
      throw new TypeError(`actions[${index}].reason must contain itemized rejection evidence.`);
    }
    return { personId, expectedCurrentStageId, reason };
  });
  return {
    manifestId: validManifestId(rawManifest.manifestId),
    agencyId,
    jobId,
    actions,
  };
}

function digestPreview(preview) {
  return createHash("sha256").update(JSON.stringify(preview)).digest("hex");
}

export function buildRejectPreview(rawConfig, rawManifest) {
  const config = validateRejectConfig(rawConfig);
  const manifest = validateManifest(rawManifest, config);
  const immutable = {
    manifestId: manifest.manifestId,
    agencyId: manifest.agencyId,
    jobId: manifest.jobId,
    rejectedStageId: config.rejectedStageId,
    rejectedActivityTypeId: config.rejectedActivityTypeId,
    action: "reject",
    actions: manifest.actions,
  };
  return {
    ...immutable,
    manifestDigest: digestPreview(immutable),
  };
}

function validateApproval(approval, preview) {
  if (!approval || typeof approval !== "object" || approval.approved !== true) {
    throw new TypeError("Explicit approval of the exact reject preview is required.");
  }
  if (approval.action !== "reject" || approval.manifestId !== preview.manifestId) {
    throw new TypeError("Approval action and manifestId must match the reject preview.");
  }
  if (approval.manifestDigest !== preview.manifestDigest) {
    throw new TypeError("Approval manifest digest does not match the immutable reject preview.");
  }
  const personIds = Array.isArray(approval.personIds)
    ? approval.personIds.map((value, index) => asPositiveInteger(value, `approval.personIds[${index}]`))
    : [];
  const previewIds = preview.actions.map(({ personId }) => personId);
  if (JSON.stringify(personIds) !== JSON.stringify(previewIds)) {
    throw new TypeError("Approval personIds must exactly match the ordered reject preview.");
  }
}

function requireMutationTransport(transport) {
  if (!transport || typeof transport.getJSON !== "function" || typeof transport.createPersonEvent !== "function") {
    throw new TypeError("A declared transport with getJSON(path) and createPersonEvent(payload) is required. No live Loxo adapter is bundled.");
  }
  return transport;
}

function sameId(left, right) {
  return left != null && right != null && String(left) === String(right);
}

async function readCandidate(config, transport, personId) {
  for (let page = 1; page <= config.maxPages; page += 1) {
    const endpoint = `/agencies/${config.agencyId}/jobs/${config.jobId}/candidates.json?per_page=${config.pageSize}&page=${page}&person_id=${personId}`;
    const batch = candidateList(await transport.getJSON(endpoint));
    const found = batch.find((candidate) => sameId(candidatePersonId(candidate), personId));
    if (found) return found;
    if (batch.length < config.pageSize) return null;
  }
  throw new Error(`Candidate read reached maxPages=${config.maxPages}; refusing an incomplete precondition check.`);
}

async function readJobEvents(config, transport, personId) {
  const payload = await transport.getJSON(`/agencies/${config.agencyId}/person_events.json?person_id=${personId}&per_page=80`);
  return eventList(payload).filter((event) => sameId(event?.job_id, config.jobId));
}

function successfulStatus(response) {
  const status = typeof response === "number" ? response : response?.status;
  return Number.isInteger(status) && status >= 200 && status < 300;
}

export async function executeRejectManifest({ config: rawConfig, manifest: rawManifest, approval, transport: declaredTransport }) {
  const config = validateRejectConfig(rawConfig);
  const manifest = validateManifest(rawManifest, config);
  const preview = buildRejectPreview(config, manifest);
  validateApproval(approval, preview);
  const transport = requireMutationTransport(declaredTransport);
  const results = [];
  let aborted = false;

  for (let index = 0; index < manifest.actions.length; index += 1) {
    const action = manifest.actions[index];
    const candidate = await readCandidate(config, transport, action.personId);
    if (!candidate) {
      results.push({ personId: action.personId, result: "skipped", reason: "Candidate was not found in the target job during the precondition reread." });
      if (index === 0) aborted = true;
      if (aborted) break;
      continue;
    }
    if (candidate.rejected_at != null) {
      results.push({ personId: action.personId, result: "skipped", reason: "Candidate is already rejected in the target job." });
      if (index === 0) aborted = true;
      if (aborted) break;
      continue;
    }
    const beforeEvents = await readJobEvents(config, transport, action.personId);
    const currentStageId = deriveStageId(candidate, beforeEvents, config);
    if (currentStageId !== action.expectedCurrentStageId) {
      results.push({
        personId: action.personId,
        result: "skipped",
        reason: `Precondition stage changed from ${action.expectedCurrentStageId} to ${currentStageId ?? "unknown"}.`,
      });
      if (index === 0) aborted = true;
      if (aborted) break;
      continue;
    }

    let writeResponse;
    try {
      writeResponse = await transport.createPersonEvent({
        agencyId: config.agencyId,
        activityTypeId: config.rejectedActivityTypeId,
        jobId: config.jobId,
        personId: action.personId,
        notes: action.reason,
      });
    } catch (error) {
      results.push({ personId: action.personId, result: "unknown", reason: `Write result is unknown: ${error instanceof Error ? error.message : String(error)}` });
      aborted = true;
      break;
    }
    if (!successfulStatus(writeResponse)) {
      results.push({ personId: action.personId, result: "failed", reason: "The transport returned a non-success status. No retry was attempted." });
      aborted = true;
      break;
    }

    let reread;
    try {
      reread = await readCandidate(config, transport, action.personId);
    } catch (error) {
      results.push({ personId: action.personId, result: "unknown", reason: `Post-write readback failed: ${error instanceof Error ? error.message : String(error)}. No retry was attempted.` });
      aborted = true;
      break;
    }
    if (!reread || reread.rejected_at == null) {
      results.push({ personId: action.personId, result: "unknown", reason: "Post-write readback did not return a rejected_at value. No retry was attempted." });
      aborted = true;
      break;
    }
    results.push({ personId: action.personId, result: "verified", rejectedAt: reread.rejected_at });
  }

  return {
    manifestId: preview.manifestId,
    manifestDigest: preview.manifestDigest,
    aborted,
    results,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.error("No live Loxo mutation transport is bundled. Import executeRejectManifest(...) and supply a verified declared adapter.");
  process.exitCode = 2;
}
