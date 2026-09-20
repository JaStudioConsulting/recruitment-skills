import capabilityCatalog from "../../../skills/capabilities.json";
import featureCatalog from "../../capability-features.json";
import type { CandidateCase, ConnectorCapability, SourceKind } from "@/lib/workstation-types";

export const FEATURE_GROUPS = ["candidate", "role", "pipeline", "writing"] as const;
export type FeatureGroup = (typeof FEATURE_GROUPS)[number];
export type FeatureResultKind = "resume" | "submission" | "document" | "form" | "table" | "pdf";
export type FeatureRuntime = "local_ai" | "local_ai_web" | "server_pending" | "loxo_read_adapter" | "tracker_read_adapter";

export type FeatureRequirement = {
  id: string;
  label: string;
  kind: "source" | "source_or_input" | "user_input" | "role" | "adapter";
  source_kinds?: SourceKind[];
  adapter?: string;
  required: boolean;
};

export type FeatureDefinition = {
  id: string;
  label: string;
  group: FeatureGroup;
  capability_ids: string[];
  guide_paths: string[];
  contract_paths?: string[];
  result_kind: FeatureResultKind;
  fields?: string[];
  columns?: string[];
  runtime: FeatureRuntime;
  requirements: FeatureRequirement[];
  outside_world: boolean;
  outside_world_note?: string;
  server_tool?: string;
};

const knownCapabilities = new Set(capabilityCatalog.capabilities.map((capability) => capability.id));
const parsedFeatures = featureCatalog.features as FeatureDefinition[];
for (const feature of parsedFeatures) {
  for (const capabilityId of feature.capability_ids) {
    if (!knownCapabilities.has(capabilityId)) {
      throw new Error(`Feature ${feature.id} references unknown capability ${capabilityId}.`);
    }
  }
}

export const FEATURES: readonly FeatureDefinition[] = parsedFeatures;

export function featureById(id: string): FeatureDefinition | undefined {
  return FEATURES.find((feature) => feature.id === id);
}

export type RequirementState = FeatureRequirement & { met: boolean };

export function requirementStates(input: {
  feature: FeatureDefinition;
  activeCase: CandidateCase | null;
  roleSelected: boolean;
  extraInput: string;
  connectors: ConnectorCapability[];
}): RequirementState[] {
  const { feature, activeCase, roleSelected, extraInput, connectors } = input;
  return feature.requirements.map((requirement) => {
    let met = false;
    if (requirement.kind === "role") met = roleSelected;
    if (requirement.kind === "user_input") met = extraInput.trim().length > 0;
    if (requirement.kind === "adapter") {
      met = connectors.some((connector) => connector.id === requirement.adapter && connector.status === "available");
    }
    if (requirement.kind === "source" || requirement.kind === "source_or_input") {
      const reviewedSource = activeCase?.sources.some(
        (source) => source.lifecycleStatus === "reviewed" && requirement.source_kinds?.includes(source.kind),
      ) ?? false;
      met = reviewedSource || (requirement.kind === "source_or_input" && extraInput.trim().length > 0);
    }
    return { ...requirement, met };
  });
}

export function missingRequired(states: readonly RequirementState[]): RequirementState[] {
  return states.filter((requirement) => requirement.required && !requirement.met);
}

export function featureStatus(feature: FeatureDefinition, requirements: readonly RequirementState[]) {
  if (["server_pending", "loxo_read_adapter", "tracker_read_adapter"].includes(feature.runtime)) {
    return { label: "Not available yet", tone: "blocked" } as const;
  }
  const missing = missingRequired(requirements);
  if (missing.length === 0) return { label: "Ready to draft", tone: "ready" } as const;
  if (missing.every((requirement) => requirement.kind === "source" || requirement.kind === "source_or_input")) {
    return { label: "Needs sources", tone: "needs" } as const;
  }
  if (missing.every((requirement) => requirement.kind === "user_input")) {
    return { label: "Needs details", tone: "needs" } as const;
  }
  if (missing.every((requirement) => requirement.kind === "role")) {
    return { label: "Needs role", tone: "needs" } as const;
  }
  return { label: "Needs inputs", tone: "needs" } as const;
}
