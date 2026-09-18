import type { ResumeFormDocument } from "@/lib/resume-form";
import type { SubmissionDocument } from "@/lib/workstation-types";

export type EditableField = { label: string; value: string };
export type EditableTable = { columns: string[]; rows: string[][] };

export type CapabilityDraft = {
  featureId: string;
  title: string;
  resultKind: "resume" | "submission" | "document" | "form" | "table" | "pdf";
  status: "draft";
  provider: string;
  model: string;
  updatedAt: string;
  unknowns: string[];
  document?: string;
  fields?: EditableField[];
  table?: EditableTable;
  resume?: ResumeFormDocument;
  submission?: SubmissionDocument;
  emailDraft?: string;
  loxoUpdate?: string;
  artifact?: { filename: string; downloadUrl: string };
};

export type CapabilityRunsDocument = Record<string, CapabilityDraft>;

export type CapabilityRunRequest = {
  provider: string;
  model: string;
  runId: string;
  extraInput: string;
};

export type CapabilityRunResponse =
  | { status: "completed"; draft: CapabilityDraft }
  | { status: "cancelled"; detail: string }
  | { status: "local_only" | "unavailable" | "refused"; detail: string; missing?: string[] };
