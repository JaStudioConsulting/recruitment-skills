/**
 * Offline-safe core for pulling a Loxo job pipeline through a host-supplied
 * transport. This module contains no browser driver, credentials, account IDs,
 * or agency-specific workflow-stage IDs.
 *
 * A consumer must import pullPipeline(config, transport) and provide:
 *   transport.getJSON(relativePath) -> parsed JSON
 *
 * Direct execution fails closed because this repository does not ship a live
 * Loxo adapter.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BOT = /^(Loxo Agent|Loxo Bot)$/i;
const CONTACT = /phone call|voicemail|no answer|email|sms|text|meeting|screen|responded|intake|call -/i;

export function asPositiveInteger(value, label) {
  const parsed = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new TypeError(`${label} must be a positive integer.`);
  }
  return parsed;
}

export function normalizeBaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError("baseUrl must be an absolute HTTPS URL.");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new TypeError("baseUrl must be an HTTPS origin without credentials, path, query, or fragment.");
  }
  return parsed.href.replace(/\/$/, "");
}

export function validateStageDefinitions(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError("stages must be a non-empty array from the current agency workflow.");
  }
  const ids = new Set();
  const names = new Set();
  return value.map((stage, index) => {
    if (!stage || typeof stage !== "object" || Array.isArray(stage)) {
      throw new TypeError(`stages[${index}] must be an object.`);
    }
    const id = asPositiveInteger(stage.id, `stages[${index}].id`);
    const rawName = typeof stage.name === "string" ? stage.name : "";
    const name = rawName.trim();
    if (rawName !== name || !name || name.length > 120 || /[\u0000-\u001f]/.test(name)) {
      throw new TypeError(`stages[${index}].name must be a non-empty stage name without control characters.`);
    }
    const nameKey = name.toLocaleLowerCase("en-CA");
    if (ids.has(id)) throw new TypeError(`Duplicate workflow-stage id ${id}.`);
    if (names.has(nameKey)) throw new TypeError(`Duplicate workflow-stage name ${name}.`);
    ids.add(id);
    names.add(nameKey);
    return { id, name, include: stage.include === true };
  });
}

function assertConfiguredStage(stageId, stages, label) {
  const id = asPositiveInteger(stageId, label);
  if (!stages.some((stage) => stage.id === id)) {
    throw new TypeError(`${label} must reference a configured stage.`);
  }
  return id;
}

function optionalBoundedInteger(value, fallback, label, maximum) {
  if (value == null) return fallback;
  const parsed = asPositiveInteger(value, label);
  if (parsed > maximum) throw new TypeError(`${label} must be at most ${maximum}.`);
  return parsed;
}

export function validatePullConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Pipeline config must be an object.");
  }
  const stages = validateStageDefinitions(value.stages);
  if (!stages.some((stage) => stage.include)) {
    throw new TypeError("At least one configured stage must set include: true.");
  }
  const outputDir = typeof value.outputDir === "string" ? value.outputDir.trim() : "";
  if (!outputDir || !path.isAbsolute(outputDir)) {
    throw new TypeError("outputDir must be an explicit absolute path.");
  }
  const slug = typeof value.slug === "string" ? value.slug.trim() : "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(slug)) {
    throw new TypeError("slug must be an explicit filesystem-safe name.");
  }
  return {
    agencyId: asPositiveInteger(value.agencyId, "agencyId"),
    jobId: asPositiveInteger(value.jobId, "jobId"),
    baseUrl: normalizeBaseUrl(value.baseUrl),
    outputDir,
    slug,
    stages,
    appliedStageId: assertConfiguredStage(value.appliedStageId, stages, "appliedStageId"),
    pageSize: optionalBoundedInteger(value.pageSize, 250, "pageSize", 250),
    maxPages: optionalBoundedInteger(value.maxPages, 20, "maxPages", 1000),
  };
}

export function candidateList(payload) {
  const value = Array.isArray(payload) ? payload : payload?.candidates;
  if (!Array.isArray(value)) throw new TypeError("Candidate transport response must contain a candidates array.");
  return value;
}

export function eventList(payload) {
  const value = Array.isArray(payload) ? payload : payload?.person_events;
  if (!Array.isArray(value)) throw new TypeError("Event transport response must contain a person_events array.");
  return value;
}

export function candidatePerson(candidate) {
  return candidate?.person && typeof candidate.person === "object" ? candidate.person : candidate;
}

export function candidatePersonId(candidate) {
  const person = candidatePerson(candidate);
  const raw = person?.id ?? candidate?.person_id;
  try {
    return asPositiveInteger(raw, "candidate person id");
  } catch {
    return null;
  }
}

function sameId(left, right) {
  return left != null && right != null && String(left) === String(right);
}

function eventTime(event) {
  const parsed = Date.parse(event?.created_at || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

export function deriveStageId(candidate, jobEvents, config) {
  const stages = validateStageDefinitions(config?.stages);
  const configuredIds = new Set(stages.map(({ id }) => id));
  const direct = candidate?.workflow_stage_id;
  if (direct != null) {
    const parsed = typeof direct === "string" && /^\d+$/.test(direct) ? Number(direct) : direct;
    if (configuredIds.has(parsed)) return parsed;
  }

  const byName = new Map(stages.map(({ id, name }) => [name.toLocaleLowerCase("en-CA"), id]));
  const moves = (Array.isArray(jobEvents) ? jobEvents : [])
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => /^Moved to\s+/i.test(event?.activity_type?.name || ""))
    .sort((left, right) => eventTime(right.event) - eventTime(left.event) || left.index - right.index);
  for (const { event } of moves) {
    const name = event.activity_type.name.replace(/^Moved to\s+/i, "").trim().toLocaleLowerCase("en-CA");
    if (byName.has(name)) return byName.get(name);
  }

  if (candidate?.applied_at != null) {
    return assertConfiguredStage(config?.appliedStageId, stages, "appliedStageId");
  }
  return null;
}

function requireReadTransport(transport) {
  if (!transport || typeof transport.getJSON !== "function") {
    throw new TypeError("A declared transport with getJSON(path) is required. No live Loxo adapter is bundled.");
  }
  return transport;
}

function candidatesEndpoint(config, page) {
  return `/agencies/${config.agencyId}/jobs/${config.jobId}/candidates.json?per_page=${config.pageSize}&page=${page}`;
}

async function allCandidates(config, transport) {
  const all = [];
  for (let page = 1; page <= config.maxPages; page += 1) {
    const batch = candidateList(await transport.getJSON(candidatesEndpoint(config, page)));
    all.push(...batch);
    if (batch.length < config.pageSize) return all;
  }
  throw new Error(`Candidate pagination reached maxPages=${config.maxPages}; refusing a potentially truncated export.`);
}

function safeFilePart(value, fallback) {
  const cleaned = String(value || "").replace(/[^A-Za-z0-9 .-]/g, "").trim();
  return cleaned || fallback;
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export async function pullPipeline(rawConfig, declaredTransport, io = fs) {
  const config = validatePullConfig(rawConfig);
  const transport = requireReadTransport(declaredTransport);
  const stageById = new Map(config.stages.map((stage, index) => [stage.id, { ...stage, order: index }]));
  const all = await allCandidates(config, transport);
  const unique = new Map();
  for (const candidate of all) {
    const personId = candidatePersonId(candidate);
    if (personId == null) throw new TypeError("Every candidate must contain a valid person id.");
    unique.set(personId, candidate);
  }

  const resumeDir = path.join(config.outputDir, `${config.slug}_cvs`);
  io.mkdirSync(resumeDir, { recursive: true });
  const rows = [];

  for (const candidate of unique.values()) {
    const person = candidatePerson(candidate);
    const personId = candidatePersonId(candidate);
    const events = eventList(await transport.getJSON(`/agencies/${config.agencyId}/person_events.json?person_id=${personId}&per_page=80`));
    const jobEvents = events.filter((event) => sameId(event?.job_id, config.jobId));
    const stageId = deriveStageId(candidate, jobEvents, config);
    const stage = stageById.get(stageId);
    if (!stage?.include) continue;

    const location = person.location || [person.city, person.state].filter(Boolean).join(", ");
    const row = {
      stage: stage.name,
      _order: stage.order,
      person_id: personId,
      name: person.name || candidate.name || "",
      title: person.current_title || candidate.current_title || "",
      company: person.current_company || candidate.current_company || "",
      location,
      email: (person.emails || []).map((item) => item.value).filter(Boolean).join("; "),
      phone: (person.phones || []).map((item) => item.value).filter(Boolean).join("; "),
      linkedin: person.linkedin_url || "",
      has_resume: false,
      applied: candidate.applied_at != null || jobEvents.some((event) => /^applied$/i.test(event?.activity_type?.key || "")),
      contacted: false,
      contacts: [],
      snippet: "",
      loxo_url: `${config.baseUrl}/agencies/${config.agencyId}/people/${personId}`,
    };

    const resumePayload = await transport.getJSON(`/agencies/${config.agencyId}/people/${personId}/resumes.json`);
    if (!Array.isArray(resumePayload)) throw new TypeError("Resume transport response must be an array.");
    if (resumePayload.length > 0) {
      row.has_resume = true;
      let combined = "";
      for (const resume of resumePayload) {
        let text = resume.extracted_text;
        if (text == null) {
          const detail = await transport.getJSON(`/agencies/${config.agencyId}/people/${personId}/resumes/${asPositiveInteger(resume.id, "resume id")}`);
          text = detail?.extracted_text || "";
        }
        combined += `\n----- ${resume.name || "Resume"} -----\n${text || "(no extracted text)"}\n`;
      }
      row.snippet = combined.replace(/-----[^\n]*-----/g, "").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim().slice(0, 900);
      const filename = `${safeFilePart(row.stage, "Stage")} - ${safeFilePart(row.name, String(personId))}.txt`;
      io.writeFileSync(path.join(resumeDir, filename), `${row.name}\nStage: ${row.stage}\nPhone: ${row.phone || "-"}\nEmail: ${row.email || "-"}\nCurrent: ${row.title} at ${row.company}\nLoxo: ${row.loxo_url}\n${"=".repeat(50)}\n${combined}`);
    }

    const human = events.filter((event) => {
      const createdBy = event?.created_by_name || "";
      const activityName = event?.activity_type?.name || "";
      return createdBy && !BOT.test(createdBy) && (CONTACT.test(activityName) || event.email || event.sms || event.twilio_call);
    });
    row.contacted = human.length > 0;
    row.contacts = human.slice(0, 6).map((event) => `${String(event.created_at || "").slice(0, 10)} · ${event.created_by_name}: ${event.activity_type?.name || "Activity"}`);
    rows.push(row);
  }

  rows.sort((left, right) => left._order - right._order || left.name.localeCompare(right.name));
  rows.forEach((row) => delete row._order);
  const jsonPath = path.join(config.outputDir, `${config.slug}_pipeline.json`);
  const csvPath = path.join(config.outputDir, `${config.slug}_pipeline.csv`);
  io.writeFileSync(jsonPath, JSON.stringify(rows, null, 2));
  const columns = ["stage", "applied", "name", "title", "company", "location", "email", "phone", "linkedin", "has_resume", "contacted", "person_id", "loxo_url"];
  const csv = [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\n");
  io.writeFileSync(csvPath, csv);
  return {
    rows,
    jsonPath,
    csvPath,
    summary: {
      candidates: rows.length,
      resumes: rows.filter((row) => row.has_resume).length,
      applied: rows.filter((row) => row.applied).length,
      contacted: rows.filter((row) => row.contacted).length,
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.error("No live Loxo transport is bundled. Import pullPipeline(config, transport) and supply a verified declared adapter.");
  process.exitCode = 2;
}
