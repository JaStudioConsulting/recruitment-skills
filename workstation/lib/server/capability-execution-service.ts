import { prepareCapabilityFromContext } from "@/lib/capabilities/prepare";
import { ApiError } from "@/lib/server/api";
import {
  EXECUTABLE_RUN_EXECUTOR_IDS,
  executeBoundCapability,
  type BoundCapabilityExecution,
  type CapabilityExecutionResult,
} from "@/lib/server/capability-executors";
import type { WriteUpDraftReady } from "@/lib/server/capability-executors/write-up";
import {
  getCapabilityRun,
  transitionCapabilityRun,
  type CapabilityRunRecord,
} from "@/lib/server/capability-run-repository";
import {
  getCapabilityCaseContext,
} from "@/lib/server/case-repository";
import { connectorCapabilities } from "@/lib/server/connectors";
import {
  commitDraftReadyDocumentPackage,
} from "@/lib/server/write-up-package-repository";
import type {
  CaseDocument,
  GeneratedOutputKind,
} from "@/lib/workstation-types";

export type CapabilityExecutionResponse = {
  run: CapabilityRunRecord;
  reused: boolean;
  documents: CaseDocument[];
};

export type CapabilityExecutionDependencies = {
  getCapabilityRun: typeof getCapabilityRun;
  transitionCapabilityRun: typeof transitionCapabilityRun;
  getCapabilityCaseContext: typeof getCapabilityCaseContext;
  commitDraftReadyDocumentPackage: typeof commitDraftReadyDocumentPackage;
  prepareCapabilityFromContext?: typeof prepareCapabilityFromContext;
  executeCapability: (
    input: BoundCapabilityExecution,
  ) => CapabilityExecutionResult | Promise<CapabilityExecutionResult>;
};

const DEFAULT_DEPENDENCIES: CapabilityExecutionDependencies = {
  getCapabilityRun,
  transitionCapabilityRun,
  getCapabilityCaseContext,
  commitDraftReadyDocumentPackage,
  prepareCapabilityFromContext,
  executeCapability: executeBoundCapability,
};

const REUSABLE_STATUSES = new Set<CapabilityRunRecord["status"]>([
  "draft_ready",
  "awaiting_visual_qa",
  "completed",
]);

function sameStrings(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function runInput(run: CapabilityRunRecord) {
  const { extraInput, provider, model } = run.input;
  if (typeof extraInput !== "string" || typeof provider !== "string" || typeof model !== "string") {
    throw new ApiError(409, "The prepared capability run has an invalid immutable input snapshot.");
  }
  return { extraInput, provider, model, now: run.preparedAt };
}

function emailDocument(result: WriteUpDraftReady) {
  return [
    result.bundle.emailSubject ? `Subject: ${result.bundle.emailSubject}` : "",
    result.bundle.presentationEmailText,
  ].filter(Boolean).join("\n\n");
}

function outputDocuments(result: WriteUpDraftReady): Array<[
  GeneratedOutputKind,
  CaseDocument["content"],
]> {
  return [
    ["resume", result.bundle.resume],
    ["submission", result.bundle.submission],
    ["email", emailDocument(result)],
    ["loxo_update", result.bundle.loxoNoteText],
  ];
}

function errorEvidence(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: "UnknownError", message: "Capability execution failed." };
}

export async function executePreparedCapability(
  userId: string,
  caseId: string,
  runId: string,
): Promise<CapabilityExecutionResponse> {
  return executePreparedCapabilityWithDependencies(
    userId,
    caseId,
    runId,
    DEFAULT_DEPENDENCIES,
  );
}

export async function executePreparedCapabilityWithDependencies(
  userId: string,
  caseId: string,
  runId: string,
  dependencies: CapabilityExecutionDependencies,
): Promise<CapabilityExecutionResponse> {
  const run = await dependencies.getCapabilityRun(userId, caseId, runId);
  if (REUSABLE_STATUSES.has(run.status)) {
    return { run, reused: true, documents: [] };
  }
  if (run.status !== "prepared") {
    throw new ApiError(409, `Capability run ${run.status} cannot be executed.`);
  }

  const context = await dependencies.getCapabilityCaseContext(userId, caseId);
  const prepareCurrentCapability = dependencies.prepareCapabilityFromContext ?? prepareCapabilityFromContext;
  const currentPreparation = await prepareCurrentCapability(run.capabilityId, {
    ...context,
    connectors: connectorCapabilities,
    availableExecutorIds: EXECUTABLE_RUN_EXECUTOR_IDS,
  }, runInput(run));
  const preparedIdentityMatches = currentPreparation.canExecute &&
    currentPreparation.executorId === run.executorId &&
    sameStrings(currentPreparation.supportingAuthorityIds, run.supportingAuthorityIds) &&
    currentPreparation.authorityDigest === run.authorityDigest &&
    currentPreparation.inputSnapshotHash === run.inputSnapshotHash &&
    sameStrings(currentPreparation.sourceRefs, run.sourceRefs);

  if (!preparedIdentityMatches) {
    const refused = await dependencies.transitionCapabilityRun(userId, caseId, runId, {
      status: "refused",
      error: {
        code: "prepared_input_changed",
        message: "The case context changed after preparation.",
      },
    });
    throw new ApiError(409, "The case context changed after preparation. Prepare a new run.", {
      runId: refused.id,
      status: refused.status,
    });
  }

  await dependencies.transitionCapabilityRun(userId, caseId, runId, { status: "running" });
  let result: CapabilityExecutionResult | null = null;
  const documents: CaseDocument[] = [];
  try {
    result = await dependencies.executeCapability({
      userId,
      caseId,
      run,
      capabilityId: run.capabilityId,
      executorId: run.executorId,
      candidateCase: context.candidateCase,
      role: context.role,
      candidate: context.candidate,
      sourceRefs: run.sourceRefs,
      preparedAt: run.preparedAt,
    });

    if (result.status === "awaiting_visual_qa") {
      const ready = await dependencies.transitionCapabilityRun(userId, caseId, runId, {
        status: "awaiting_visual_qa",
        result,
        evidence: {
          executorId: run.executorId,
          authorityDigest: run.authorityDigest,
          inputSnapshotHash: run.inputSnapshotHash,
          sourceRefs: run.sourceRefs,
          artifactId: result.artifact.id,
          artifactSha256: result.artifact.sha256,
          visualQaStatus: result.artifact.visualQaStatus,
          canonicalPackageCompleted: false,
        },
      });
      return { run: ready, reused: false, documents };
    }

    const outputSourceRefs = result.bundle.sourceRefs;
    const documentRevisions = Object.fromEntries(
      outputDocuments(result).map(([kind]) => [
        kind,
        context.candidateCase.documents[kind].revision + 1,
      ]),
    );
    const committed = await dependencies.commitDraftReadyDocumentPackage(
      userId,
      caseId,
      runId,
      {
        documents: outputDocuments(result).map(([kind, content]) => ({
          kind,
          content,
          expectedRevision: context.candidateCase.documents[kind].revision,
        })),
        sourceRefs: outputSourceRefs,
        result: { ...result, documentRevisions },
        evidence: {
          executorId: run.executorId,
          authorityDigest: run.authorityDigest,
          inputSnapshotHash: run.inputSnapshotHash,
          sourceRefs: run.sourceRefs,
          outputSourceRefs,
          documentRevisions,
          canonicalPackageCompleted: false,
        },
      },
    );
    documents.push(...committed.documents);
    return { run: committed.run, reused: false, documents };
  } catch (error) {
    const documentRevisions = Object.fromEntries(
      documents.map((document) => [document.kind, document.revision]),
    );
    try {
      await dependencies.transitionCapabilityRun(userId, caseId, runId, {
        status: "failed",
        ...(result ? { result: { ...result, documentRevisions } } : {}),
        evidence: { documentRevisions, sourceRefs: run.sourceRefs },
        error: errorEvidence(error),
      });
    } catch {
      // Preserve the original execution failure if failure persistence also races.
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, error instanceof Error ? error.message : "Capability execution failed.");
  }
}
