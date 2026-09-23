import generatedRegistry from "../../generated/capability-registry.json";
import type { SourceKind } from "@/lib/workstation-types";

export const FEATURE_GROUPS = ["candidate", "role", "pipeline", "writing"] as const;
export type FeatureGroup = (typeof FEATURE_GROUPS)[number];
export type FeatureResultKind = "resume" | "submission" | "document" | "form" | "table" | "pdf";
export type FeatureRuntime = "deterministic_server" | "local_ai" | "local_ai_web" | "server_pending" | "loxo_read_adapter" | "tracker_read_adapter";

export type FeatureRequirement = {
  id: string;
  label: string;
  kind: "source" | "reviewed_source" | "source_or_input" | "user_input" | "role" | "adapter" | "reviewed_resume_document";
  source_kinds?: SourceKind[];
  adapter?: string;
  input_keys?: string[];
  allowed_values?: string[];
  required: boolean;
};

export type FeatureDefinition = {
  id: string;
  primary_capability_id: string;
  operation_id: string;
  label: string;
  group: FeatureGroup;
  capability_ids: string[];
  supporting_capability_ids: string[];
  guide_paths: string[];
  contract_paths?: string[];
  result_kind: FeatureResultKind;
  fields?: string[];
  columns?: string[];
  deliverables?: string[];
  runtime: FeatureRuntime;
  mounted: boolean;
  requirements: FeatureRequirement[];
  outside_world: boolean;
  outside_world_note?: string;
  server_tool?: string;
  builder_paths?: string[];
  builder_digest?: string;
};

const parsedFeatures = generatedRegistry.executors as FeatureDefinition[];

export const FEATURES: readonly FeatureDefinition[] = parsedFeatures;

export function featureById(id: string): FeatureDefinition | undefined {
  return FEATURES.find((feature) => feature.id === id);
}

export function featureByPrimaryCapability(capabilityId: string): FeatureDefinition | undefined {
  return FEATURES.find((feature) => feature.primary_capability_id === capabilityId);
}
