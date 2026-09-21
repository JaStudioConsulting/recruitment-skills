import generatedRegistry from "../../generated/capability-registry.json";

export const WORKFLOW_GROUPS = [
  "candidate_work",
  "job_client_work",
  "sourcing",
  "pipeline_tracker",
  "writing",
  "artifacts",
] as const;

export type WorkflowGroup = (typeof WORKFLOW_GROUPS)[number];
export type ImplementationStatus = "working" | "partial" | "interface_only" | "blocked" | "not_applicable";
export type ApprovalRequirement = "none" | "preview" | "explicit";
export type CapabilityOperation = {
  id: string;
  label: string;
  stage: string;
  approval: ApprovalRequirement;
  output: string;
};
export type RegistryExecutorFeature = {
  id: string;
  label: string;
  runtime: string;
  mounted: boolean;
  resultKind: string;
  operationId: string;
  supportingCapabilityIds: string[];
  supportingAuthorities: Array<{ id: string; authorityDigest: string }>;
};

export type CapabilityRegistryItem = {
  id: string;
  label: string;
  summary: string;
  authorityPath: string;
  relatedPaths: string[];
  authorityDigest: string;
  repositoryGroup: string;
  repositoryStatus: string;
  workflowGroup: WorkflowGroup;
  inputs: string[];
  context: string[];
  output: string;
  runtime: string;
  operations: CapabilityOperation[];
  executorFeatures: RegistryExecutorFeature[];
  implementation: {
    status: ImplementationStatus;
    blocker: string;
    evidence: string[];
  };
};

export const CAPABILITY_REGISTRY = generatedRegistry.capabilities as CapabilityRegistryItem[];

export function capabilityById(id: string): CapabilityRegistryItem | undefined {
  return CAPABILITY_REGISTRY.find((item) => item.id === id);
}

export function capabilitiesForGroup(group: WorkflowGroup): CapabilityRegistryItem[] {
  return CAPABILITY_REGISTRY.filter((item) => item.workflowGroup === group);
}

export function implementationCounts(): Record<ImplementationStatus, number> {
  return CAPABILITY_REGISTRY.reduce<Record<ImplementationStatus, number>>((counts, item) => {
    counts[item.implementation.status] += 1;
    return counts;
  }, { working: 0, partial: 0, interface_only: 0, blocked: 0, not_applicable: 0 });
}
