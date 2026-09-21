import { env } from "cloudflare:workers";

import { FEATURES } from "../../capabilities/catalog";
import type { CandidateCase, CandidateRecord, RoleRecord } from "../../workstation-types";
import type { CapabilityRunRecord } from "../capability-run-repository";
import {
  executeArtifactCapability,
  isArtifactExecutorId,
  type ArtifactCapabilityExecutionResult,
} from "./artifact";
import {
  executeWriteUp,
  type WriteUpDraftReady,
} from "./write-up";

export const AVAILABLE_EXECUTOR_IDS = FEATURES
  .filter((feature) => feature.mounted)
  .map((feature) => feature.id);

/**
 * Only mounted executors may consume an immutable run. A dormant adapter may
 * stay covered by direct contract tests without becoming an executable
 * Workstation capability.
 */
export const EXECUTABLE_RUN_EXECUTOR_IDS = Object.freeze([...AVAILABLE_EXECUTOR_IDS]);

export type BoundCapabilityExecution = {
  userId: string;
  caseId: string;
  run: CapabilityRunRecord;
  capabilityId: string;
  executorId: string | null;
  candidateCase: CandidateCase;
  role: RoleRecord;
  candidate: CandidateRecord;
  sourceRefs: readonly string[];
  preparedAt: string;
};

export type CapabilityExecutionResult = WriteUpDraftReady | ArtifactCapabilityExecutionResult;

export function executeBoundCapability(
  input: BoundCapabilityExecution,
): CapabilityExecutionResult | Promise<CapabilityExecutionResult> {
  if (input.capabilityId === "write-up" && input.executorId === "write-up-candidate") {
    return executeWriteUp({
      mergedCase: input.candidateCase,
      role: input.role,
      candidate: input.candidate,
      sourceRefs: input.sourceRefs,
      now: input.preparedAt,
    });
  }
  if (isArtifactExecutorId(input.executorId)) {
    return executeArtifactCapability({
      userId: input.userId,
      caseId: input.caseId,
      run: input.run,
      candidateCase: input.candidateCase,
    }, {
      endpoint: env.RECRUITMENT_MCP_URL || process.env.RECRUITMENT_MCP_URL,
      token: env.BROKER_TOKEN || process.env.BROKER_TOKEN,
    });
  }
  throw new Error(
    `No mounted dispatcher matches ${input.capabilityId}:${input.executorId ?? "none"}.`,
  );
}
