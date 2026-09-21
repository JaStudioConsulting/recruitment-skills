export const ARTIFACT_EXECUTORS = {
  "brand-resume": {
    capabilityId: "brandedresume",
    tool: "build_pdf",
  },
  "interview-prep-pdf": {
    capabilityId: "interview-prep-material",
    tool: "build_interview_prep_pdf",
  },
  "reference-check-pdf": {
    capabilityId: "complete-reference-check",
    tool: "build_reference_check_pdf",
  },
} as const;

export type ArtifactExecutorId = keyof typeof ARTIFACT_EXECUTORS;

export const ARTIFACT_EXECUTOR_IDS = Object.freeze(
  Object.keys(ARTIFACT_EXECUTORS) as ArtifactExecutorId[],
);

export function isArtifactExecutorId(value: string | null): value is ArtifactExecutorId {
  return value !== null && Object.prototype.hasOwnProperty.call(ARTIFACT_EXECUTORS, value);
}

export function artifactExecutorDefinition(executorId: string | null) {
  return isArtifactExecutorId(executorId) ? ARTIFACT_EXECUTORS[executorId] : null;
}

export function isCanonicalArtifactExecutorPair(
  capabilityId: string,
  executorId: string | null,
): boolean {
  return artifactExecutorDefinition(executorId)?.capabilityId === capabilityId;
}
