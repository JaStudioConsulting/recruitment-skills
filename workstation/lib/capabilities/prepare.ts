import { sha256 } from "../orchestration/stable-hash";
import { isResumeForm, resumeFormHasContent } from "../resume-form";
import { sourceEvidenceRef, sourceIsUsable } from "../source-intake";
import type { CandidateCase, CandidateRecord, ConnectorCapability, RoleRecord } from "../workstation-types";
import { featureByPrimaryCapability, type FeatureDefinition, type FeatureRequirement } from "./catalog";
import { capabilityById, type CapabilityRegistryItem, type ImplementationStatus } from "./registry";

export type CapabilityPreparationContext = {
  candidateCase: CandidateCase;
  role: RoleRecord;
  candidate: CandidateRecord;
  connectors: ConnectorCapability[];
  /** Executor IDs with a mounted server dispatcher in this deployment. */
  availableExecutorIds: readonly string[];
};

export type CapabilityPreparationOptions = {
  extraInput: string;
  provider: string;
  model: string;
  now?: string;
};

export type PreparedRequirement = FeatureRequirement & { met: boolean };

export type PreparedCapability = {
  capabilityId: string;
  executorId: string | null;
  supportingAuthorityIds: string[];
  supportingAuthorities: Array<{ id: string; authorityDigest: string }>;
  authorityDigest: string;
  implementationStatus: ImplementationStatus;
  outputKind: string | null;
  actionLabel: string;
  requirements: PreparedRequirement[];
  missing: string[];
  sourceRefs: string[];
  inputSnapshotHash: string;
  canExecute: boolean;
  blocker: string;
  canonicalIncomplete: string;
  preparedAt: string;
};

export type CapabilityPreparationDependencies = {
  capabilityById: typeof capabilityById;
  featureByPrimaryCapability: typeof featureByPrimaryCapability;
};

function normalizeInputKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function structuredInputValues(extraInput: string): Map<string, string> {
  const values = new Map<string, string>();
  const trimmed = extraInput.trim();
  if (!trimmed) return values;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const [key, value] of Object.entries(parsed)) {
        if (["string", "number", "boolean"].includes(typeof value)) {
          values.set(normalizeInputKey(key), String(value).trim());
        }
      }
      return values;
    }
  } catch {
    // Human-entered key/value lines are handled below.
  }
  for (const line of trimmed.split(/\r?\n/)) {
    const match = line.match(/^([^:]+):\s*(.+)$/);
    if (match) values.set(normalizeInputKey(match[1]), match[2].trim());
  }
  return values;
}

const DEFAULT_PREPARATION_DEPENDENCIES: CapabilityPreparationDependencies = {
  capabilityById,
  featureByPrimaryCapability,
};

function activeResumeSourceRefs(context: CapabilityPreparationContext) {
  return context.candidateCase.sources
    .filter((source) => source.kind === "resume" && sourceIsUsable(source))
    .map(sourceEvidenceRef)
    .sort();
}

function reviewedResumeSourcesChanged(context: CapabilityPreparationContext) {
  const resume = context.candidateCase.documents.resume;
  if (!isResumeForm(resume?.content) || resume.content.reviewed !== true || !resumeFormHasContent(resume.content)) {
    return false;
  }
  const activeRefs = activeResumeSourceRefs(context);
  const reviewedRefs = [...(resume.sourceRefs ?? [])].sort();
  return activeRefs.length > 0 && (
    activeRefs.length !== reviewedRefs.length ||
    activeRefs.some((sourceRef, index) => sourceRef !== reviewedRefs[index])
  );
}

function requirementState(
  requirement: FeatureRequirement,
  context: CapabilityPreparationContext,
  extraInput: string,
) {
  if (requirement.kind === "role") return Boolean(context.role.id);
  if (requirement.kind === "user_input") {
    if (!requirement.input_keys?.length) return Boolean(extraInput.trim());
    const inputValues = structuredInputValues(extraInput);
    return requirement.input_keys.every((key) => {
      const value = inputValues.get(normalizeInputKey(key));
      if (!value) return false;
      return !requirement.allowed_values?.length || requirement.allowed_values.includes(value);
    });
  }
  if (requirement.kind === "adapter") {
    return context.connectors.some((connector) => connector.id === requirement.adapter && connector.status === "available");
  }
  if (requirement.kind === "reviewed_resume_document") {
    const resume = context.candidateCase.documents.resume?.content;
    if (!isResumeForm(resume)) return false;
    const currentResumeSourceRefs = activeResumeSourceRefs(context);
    const reviewedSourceRefs = [...(context.candidateCase.documents.resume?.sourceRefs ?? [])].sort();
    return resume.reviewed === true &&
      resumeFormHasContent(resume) &&
      currentResumeSourceRefs.length > 0 &&
      reviewedSourceRefs.length === currentResumeSourceRefs.length &&
      reviewedSourceRefs.every((sourceRef, index) => sourceRef === currentResumeSourceRefs[index]);
  }
  const reviewedSourcePresent = context.candidateCase.sources.some(
    (source) => sourceIsUsable(source) &&
      source.lifecycleStatus === "reviewed" &&
      source.reviewStatus === "reviewed" &&
      requirement.source_kinds?.includes(source.kind),
  );
  const reviewedTypedNotesPresent = Boolean(context.candidateCase.notes.trim()) &&
    Boolean(requirement.source_kinds?.includes("call_notes"));
  if (requirement.kind === "reviewed_source") {
    return reviewedSourcePresent || reviewedTypedNotesPresent;
  }
  const sourcePresent = context.candidateCase.sources.some(
    (source) => sourceIsUsable(source) && requirement.source_kinds?.includes(source.kind),
  );
  const typedNotesPresent = Boolean(context.candidateCase.notes.trim()) &&
    Boolean(requirement.source_kinds?.includes("call_notes"));
  return sourcePresent || typedNotesPresent ||
    (requirement.kind === "source_or_input" && Boolean(extraInput.trim()));
}

function actionLabel(capability: CapabilityRegistryItem, executor: FeatureDefinition | undefined) {
  const operation = capability.operations.find((item) => item.id === executor?.operation_id) ?? capability.operations[0];
  if (operation?.approval === "explicit") return "Preview changes";
  if (!executor) return "Open guidance";
  if (executor.result_kind === "pdf") return "Prepare PDF";
  if (executor.result_kind === "table") return "Prepare review";
  if (executor.result_kind === "submission") return "Create draft package";
  return "Create draft";
}

function hardBlocker(
  capability: CapabilityRegistryItem,
  executor: FeatureDefinition | undefined,
  missingRequirements: PreparedRequirement[],
  availableExecutorIds: readonly string[],
  sourceReviewReason: string,
  resumeSourcesChanged: boolean,
) {
  if (capability.implementation.status === "blocked" || capability.implementation.status === "interface_only") {
    return capability.implementation.blocker;
  }
  if (capability.implementation.status === "not_applicable") return "This repository entry is not a direct user workflow.";
  if (!executor) return capability.implementation.blocker || "No canonical executor is connected for this capability.";
  if (!availableExecutorIds.includes(executor.id)) {
    return capability.implementation.blocker || `No mounted server executor is connected for ${capability.id}.`;
  }
  if (sourceReviewReason) {
    return `Human review required before this workflow can run: ${sourceReviewReason} Open Generated > Submission, choose Edit, verify the retained fields, and Save.`;
  }
  if (resumeSourcesChanged && missingRequirements.some((requirement) => requirement.kind === "reviewed_resume_document")) {
    return "Resume sources changed after this form was reviewed. Open Generated > Resume, choose Edit, verify the current source content, and Save again.";
  }
  if (missingRequirements.some((requirement) => requirement.kind === "adapter")) {
    return capability.implementation.blocker || `Missing required adapter: ${missingRequirements.map((item) => item.label).join(", ")}.`;
  }
  const missing = missingRequirements.map((requirement) => requirement.label);
  if (missing.length) return `Missing required input: ${missing.join(", ")}.`;
  return "";
}

export async function prepareCapabilityFromContext(
  capabilityId: string,
  context: CapabilityPreparationContext,
  options: CapabilityPreparationOptions,
  dependencies: CapabilityPreparationDependencies = DEFAULT_PREPARATION_DEPENDENCIES,
): Promise<PreparedCapability> {
  const capability = dependencies.capabilityById(capabilityId);
  if (!capability) throw new Error("Canonical capability was not found.");
  const executor = dependencies.featureByPrimaryCapability(capabilityId);
  const registryExecutor = capability.executorFeatures.find((item) => item.id === executor?.id);
  const supportingAuthorities = registryExecutor?.supportingAuthorities ?? [];
  const requirements = (executor?.requirements ?? []).map((requirement) => ({
    ...requirement,
    met: requirementState(requirement, context, options.extraInput),
  }));
  const missingRequirements = requirements.filter((requirement) => requirement.required && !requirement.met);
  const missing = missingRequirements.map((requirement) => requirement.label);
  const allowedKinds = new Set(requirements.flatMap((requirement) => requirement.source_kinds ?? []));
  const sourceRefs = context.candidateCase.sources
    .filter((source) => sourceIsUsable(source) && allowedKinds.has(source.kind))
    .map(sourceEvidenceRef);
  const hasUsableCallSource = context.candidateCase.sources.some(
    (source) => sourceIsUsable(source) &&
      (source.kind === "call_notes" || source.kind === "transcript"),
  );
  if (allowedKinds.has("call_notes") && context.candidateCase.notes.trim() && !hasUsableCallSource) {
    sourceRefs.push(`case-notes:${context.candidateCase.id}:${context.candidateCase.revision}`);
  }
  sourceRefs.sort();
  const blocker = hardBlocker(
    capability,
    executor,
    missingRequirements,
    context.availableExecutorIds,
    context.candidateCase.assistant.reviewRequired?.[0]?.reason ?? "",
    reviewedResumeSourcesChanged(context),
  );
  const preparedAt = options.now ?? new Date().toISOString();
  const inputSnapshotHash = await sha256({
    capabilityId,
    executorId: executor?.id ?? null,
    authorityDigest: capability.authorityDigest,
    supportingAuthorities,
    implementationStatus: capability.implementation.status,
    context: {
      caseId: context.candidateCase.id,
      caseRevision: context.candidateCase.revision,
      notes: context.candidateCase.notes,
      assistant: context.candidateCase.assistant,
      documents: Object.fromEntries(
        Object.entries(context.candidateCase.documents)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([kind, document]) => [kind, {
            revision: document.revision,
            content: document.content,
          }]),
      ),
      role: context.role,
      candidate: context.candidate,
    },
    sourceRefs,
    extraInput: options.extraInput,
    provider: options.provider,
    model: options.model,
    connectors: context.connectors.map(({ id, status }) => ({ id, status })).sort((left, right) => left.id.localeCompare(right.id)),
  });
  return {
    capabilityId,
    executorId: executor?.id ?? null,
    supportingAuthorityIds: executor?.supporting_capability_ids ?? [],
    supportingAuthorities,
    authorityDigest: capability.authorityDigest,
    implementationStatus: capability.implementation.status,
    outputKind: executor?.result_kind ?? null,
    actionLabel: actionLabel(capability, executor),
    requirements,
    missing,
    sourceRefs,
    inputSnapshotHash,
    canExecute: !blocker,
    blocker,
    canonicalIncomplete: capability.implementation.blocker,
    preparedAt,
  };
}
