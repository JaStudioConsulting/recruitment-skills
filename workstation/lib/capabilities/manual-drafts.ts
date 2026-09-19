import { emptyResumeForm } from "../resume-form";
import { EMPTY_SUBMISSION } from "../workstation-types";
import type { FeatureDefinition } from "./catalog";
import type { CapabilityDraft } from "./types";
import { emptyArtifactPayload } from "./manual-artifacts";

export function fillInAvailable(feature: FeatureDefinition): boolean {
  return feature.runtime !== "loxo_read_adapter" && feature.runtime !== "tracker_read_adapter" && feature.runtime !== "server_pending";
}

export function createEmptyDraft(feature: FeatureDefinition, now = new Date().toISOString()): CapabilityDraft {
  if (!fillInAvailable(feature)) throw new Error("Fill-in mode is not available for this feature.");
  const base: CapabilityDraft = {
    featureId: feature.id,
    title: "",
    resultKind: feature.result_kind,
    status: "draft",
    provider: "manual",
    model: "none",
    updatedAt: now,
    unknowns: [],
  };
  if (feature.result_kind === "resume") return { ...base, resume: emptyResumeForm() };
  if (feature.result_kind === "submission") return { ...base, submission: { ...EMPTY_SUBMISSION }, emailDraft: "", loxoUpdate: "" };
  if (feature.result_kind === "document") return { ...base, document: "" };
  if (feature.result_kind === "form") return { ...base, fields: (feature.fields ?? []).map((label) => ({ label, value: "" })) };
  if (feature.result_kind === "table") return { ...base, table: { columns: [...(feature.columns ?? [])], rows: [(feature.columns ?? []).map(() => "")] } };
  return { ...base, document: "", artifactPayload: emptyArtifactPayload(feature.id) };
}

export function labelledFieldsText(fields: readonly { label: string; value: string }[]): string {
  return fields.map((field) => `${field.label}: ${field.value}`).join("\n");
}

export function tableText(columns: readonly string[], rows: readonly (readonly string[])[]): string {
  return [columns, ...rows].map((row) => row.join("\t")).join("\n");
}
