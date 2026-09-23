import { featureById } from "@/lib/capabilities/catalog";
import { structuredInputValues } from "@/lib/capabilities/prepare";
import {
  isResumeForm,
  resumeFormHasContent,
  resumeFormToCandidate,
} from "@/lib/resume-form";
import { sourceIsUsable } from "@/lib/source-intake";
import { ApiError } from "@/lib/server/api";
import {
  persistCaseArtifact,
  type PersistCaseArtifactInput,
} from "@/lib/server/case-artifact-store";
import { buildManualArtifact } from "@/lib/server/manual-artifact";
import {
  DEFAULT_RESUME_BUILDER_URL,
  callResumeBuilder,
} from "@/lib/server/resume-builder";
import type {
  CapabilityRunRecord,
  CaseArtifactRecord,
} from "@/lib/server/capability-run-repository";
import type { CandidateCase } from "@/lib/workstation-types";
import {
  artifactExecutorDefinition,
  isArtifactExecutorId,
  type ArtifactExecutorId,
} from "./artifact-contract";

export {
  ARTIFACT_EXECUTOR_IDS,
  isArtifactExecutorId,
  type ArtifactExecutorId,
} from "./artifact-contract";

export type ArtifactCapabilityExecutionInput = {
  userId: string;
  caseId: string;
  run: CapabilityRunRecord;
  candidateCase: CandidateCase;
};

export type ArtifactCapabilityExecutionResult = {
  status: "awaiting_visual_qa";
  capabilityId: string;
  executorId: ArtifactExecutorId;
  outputKind: "pdf";
  artifact: {
    id: string;
    filename: string;
    contentType: string;
    sha256: string;
    sizeBytes: number;
    revision: number;
    visualQaStatus: "pending";
  };
  canonicalIncomplete: {
    visualQaPassed: false;
    completed: false;
  };
};

export type ArtifactCapabilityExecutorDependencies = {
  callResumeBuilder: typeof callResumeBuilder;
  buildManualArtifact: typeof buildManualArtifact;
  persistCaseArtifact: (input: PersistCaseArtifactInput) => Promise<CaseArtifactRecord>;
  endpoint?: string;
  token?: string;
};

function executorDefinition(run: CapabilityRunRecord) {
  const executorId = run.executorId;
  if (!isArtifactExecutorId(executorId)) {
    throw new ApiError(409, "The prepared run has no canonical PDF executor.");
  }
  const definition = artifactExecutorDefinition(executorId)!;
  if (run.capabilityId !== definition.capabilityId) {
    throw new ApiError(
      409,
      `The prepared run pair ${run.capabilityId}:${executorId} is not a canonical PDF executor.`,
    );
  }
  return { executorId, ...definition };
}

function absoluteDownloadUrl(downloadUrl: string, endpoint?: string): string {
  try {
    if (/^https?:\/\//i.test(downloadUrl)) return new URL(downloadUrl).toString();
    if (!endpoint?.trim()) throw new Error("missing endpoint");
    return new URL(downloadUrl, endpoint).toString();
  } catch {
    throw new ApiError(502, "The PDF builder returned an invalid download URL.");
  }
}

function parsedManualPayload(run: CapabilityRunRecord): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(run.input.extraInput);
  } catch {
    throw new ApiError(
      422,
      "The prepared PDF input must be a valid JSON object matching the repository builder contract.",
    );
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ApiError(
      422,
      "The prepared PDF input must be a valid JSON object matching the repository builder contract.",
    );
  }
  return value as Record<string, unknown>;
}

function brandedResumeCandidate(candidateCase: CandidateCase): Record<string, unknown> {
  const stored = candidateCase.documents.resume?.content;
  if (isResumeForm(stored) && stored.reviewed === true && resumeFormHasContent(stored)) {
    const candidate = resumeFormToCandidate(stored);
    const skills = Array.isArray(candidate.skills) ? candidate.skills : [];
    if (skills.length % 2 !== 0) {
      throw new ApiError(
        422,
        `Core Skills count is odd (${skills.length}). Add or remove one source-backed skill before building.`,
      );
    }
    return candidate;
  }
  throw new ApiError(
    409,
    "Open Generated > Resume > Edit, compare the form with the original resume, and Save changes before preparing the branded PDF.",
  );
}

function hasReviewedSource(candidateCase: CandidateCase, kinds: readonly string[]) {
  return candidateCase.sources.some((source) =>
    kinds.includes(source.kind) &&
    source.lifecycleStatus === "reviewed" &&
    source.reviewStatus === "reviewed" &&
    sourceIsUsable(source),
  );
}

function assertBrandedResumeGrounding(candidateCase: CandidateCase) {
  const missing: string[] = [];
  if (!hasReviewedSource(candidateCase, ["job_description"])) {
    missing.push("reviewed job description");
  }
  if (!candidateCase.notes.trim() && !hasReviewedSource(candidateCase, ["call_notes", "transcript"])) {
    missing.push("reviewed call notes or transcript");
  }
  if (missing.length) {
    throw new ApiError(
      409,
      `The branded resume cannot be grounded for this role. Add ${missing.join(" and ")} before preparing the PDF.`,
    );
  }
}

function brandedResumeMode(run: CapabilityRunRecord): "named_submission" | "internal_mpc" {
  if (!run.input.extraInput.trim()) return "named_submission";
  const mode = structuredInputValues(run.input.extraInput).get("resume_mode");
  if (mode === "named_submission") return "named_submission";
  if (mode === "internal_mpc") return "internal_mpc";
  if (mode === "external_blind_mpc") {
    throw new ApiError(
      422,
      "External blind MPC resumes are not supported because verified anonymization is not implemented.",
    );
  }
  throw new ApiError(422, "Presentation mode must be named_submission or internal_mpc.");
}

type BuilderFailure = Exclude<
  | Awaited<ReturnType<typeof callResumeBuilder>>
  | Awaited<ReturnType<typeof buildManualArtifact>>,
  { status: "built" }
>;

function builderFailure(result: BuilderFailure): never {
  if (result.status === "refused") {
    const problems = "problems" in result
      ? result.problems.map((problem) => typeof problem === "string" ? problem : problem.message)
      : [];
    const detail = problems.filter(Boolean).join("; ") || ("detail" in result ? result.detail : "");
    throw new ApiError(422, detail || "The PDF builder refused the prepared input.");
  }
  throw new ApiError(503, "detail" in result ? result.detail : "The PDF builder is unavailable.");
}

function pendingResult(
  run: CapabilityRunRecord,
  executorId: ArtifactExecutorId,
  artifact: CaseArtifactRecord,
): ArtifactCapabilityExecutionResult {
  if (artifact.visualQaStatus !== "pending") {
    throw new ApiError(409, "A newly persisted PDF artifact must begin with pending visual QA.");
  }
  return {
    status: "awaiting_visual_qa",
    capabilityId: run.capabilityId,
    executorId,
    outputKind: "pdf",
    artifact: {
      id: artifact.id,
      filename: artifact.filename,
      contentType: artifact.contentType,
      sha256: artifact.sha256,
      sizeBytes: artifact.sizeBytes,
      revision: artifact.revision,
      visualQaStatus: "pending",
    },
    canonicalIncomplete: {
      visualQaPassed: false,
      completed: false,
    },
  };
}

export async function executeArtifactCapabilityWithDependencies(
  input: ArtifactCapabilityExecutionInput,
  dependencies: ArtifactCapabilityExecutorDependencies,
): Promise<ArtifactCapabilityExecutionResult> {
  const definition = executorDefinition(input.run);
  if (input.caseId !== input.run.caseId || input.caseId !== input.candidateCase.id) {
    throw new ApiError(409, "The prepared PDF run does not belong to the active candidate case.");
  }
  if (input.run.outputKind !== "pdf") {
    throw new ApiError(409, "The prepared artifact run must declare pdf as its output kind.");
  }

  if (definition.executorId === "brand-resume") {
    assertBrandedResumeGrounding(input.candidateCase);
    const endpoint = dependencies.endpoint?.trim() || DEFAULT_RESUME_BUILDER_URL;
    const feature = featureById(definition.executorId);
    const expectedBuilderDigest = feature?.builder_digest;
    if (!expectedBuilderDigest) {
      throw new ApiError(503, "The canonical branded-resume builder digest is missing.");
    }
    const mode = brandedResumeMode(input.run);
    const built = await dependencies.callResumeBuilder({
      mode,
      candidate: brandedResumeCandidate(input.candidateCase),
    }, {
      endpoint,
      token: dependencies.token,
    });
    if (built.status !== "built") return builderFailure(built);
    if (built.builderDigest !== expectedBuilderDigest) {
      throw new ApiError(409, "The hosted resume builder does not match the canonical repository builder. Nothing was saved.");
    }
    const artifact = await dependencies.persistCaseArtifact({
      userId: input.userId,
      caseId: input.caseId,
      runId: input.run.id,
      filename: built.filename,
      kind: input.run.capabilityId,
      executorId: definition.executorId,
      expectedDocument: {
        kind: "resume",
        revision: input.candidateCase.documents.resume.revision,
      },
      source: {
        downloadUrl: absoluteDownloadUrl(built.downloadUrl, endpoint),
        evidence: {
          executorId: definition.executorId,
          tool: definition.tool,
          sourceRefs: input.run.sourceRefs,
          expiresInSeconds: built.expiresInSeconds,
          contactRemoved: built.contactRemoved,
          notes: built.notes,
          builderDigest: built.builderDigest,
          resumeMode: mode,
          resumeDocumentRevision: input.candidateCase.documents.resume.revision,
        },
      },
    });
    return pendingResult(input.run, definition.executorId, artifact);
  }

  const feature = featureById(definition.executorId);
  if (!feature?.server_tool || feature.server_tool !== definition.tool) {
    throw new ApiError(503, `The ${definition.executorId} repository builder is not callable.`);
  }
  const payload = parsedManualPayload(input.run);
  const built = await dependencies.buildManualArtifact(
    definition.executorId,
    definition.tool,
    payload,
    { endpoint: dependencies.endpoint, token: dependencies.token },
  );
  if (built.status !== "built") return builderFailure(built);
  const artifact = await dependencies.persistCaseArtifact({
    userId: input.userId,
    caseId: input.caseId,
    runId: input.run.id,
    filename: built.filename,
    kind: input.run.capabilityId,
    executorId: definition.executorId,
    source: {
      downloadUrl: absoluteDownloadUrl(built.downloadUrl, dependencies.endpoint),
      evidence: {
        executorId: definition.executorId,
        tool: definition.tool,
        sourceRefs: input.run.sourceRefs,
      },
    },
  });
  return pendingResult(input.run, definition.executorId, artifact);
}

const DEFAULT_DEPENDENCIES = {
  callResumeBuilder,
  buildManualArtifact,
  persistCaseArtifact,
};

export function executeArtifactCapability(
  input: ArtifactCapabilityExecutionInput,
  config: { endpoint?: string; token?: string },
): Promise<ArtifactCapabilityExecutionResult> {
  return executeArtifactCapabilityWithDependencies(input, {
    ...DEFAULT_DEPENDENCIES,
    ...config,
  });
}
