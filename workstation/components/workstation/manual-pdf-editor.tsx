"use client";

import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  INTERVIEW_TEXT_FIELDS,
  REFERENCE_ANSWER_FIELDS,
  setValueAtPath,
  stringAtPath,
  valueAtPath,
  type ManualProblem,
} from "@/lib/capabilities/manual-artifacts";

type Props = {
  featureId: string;
  payload: Record<string, unknown>;
  artifact?: { filename: string; downloadUrl: string };
  building: boolean;
  problems: ManualProblem[];
  fieldSources?: Record<string, string>;
  onChange: (payload: Record<string, unknown>, path: string) => void;
  onBuild: () => void;
};

const REFERENCE_REQUIRED = [
  ["candidate.full_name", "Candidate name"], ["candidate.position_applied_for", "Position applied for"],
  ["candidate.company_name", "Client company"], ["reference.full_name", "Reference name"],
  ["reference.job_title", "Reference job title"], ["reference.company_name", "Reference company"],
  ["reference.professional_relationship", "Professional relationship"], ["completed_by", "Completed by"], ["date", "Date"],
] as const;

function problemFor(problems: ManualProblem[], path: string) {
  return problems.find((problem) => problem.path === path)?.message;
}

function Field({ path, label, payload, problems, fieldSources, onChange, multiline = false, optional = false }: {
  path: string;
  label: string;
  payload: Record<string, unknown>;
  problems: ManualProblem[];
  fieldSources?: Record<string, string>;
  onChange: (payload: Record<string, unknown>, path: string) => void;
  multiline?: boolean;
  optional?: boolean;
}) {
  const problem = problemFor(problems, path);
  const control = multiline
    ? <Textarea value={stringAtPath(payload, path)} aria-label={label} aria-invalid={Boolean(problem)} onChange={(event) => onChange(setValueAtPath(payload, path, event.target.value), path)} />
    : <Input value={stringAtPath(payload, path)} aria-label={label} aria-invalid={Boolean(problem)} onChange={(event) => onChange(setValueAtPath(payload, path, event.target.value), path)} />;
  const source = fieldSources?.[`artifactPayload.${path}`];
  return <label className="manual-pdf-field">{label}{source ? <small className="autofill-source">from {source}</small> : optional ? <small>Optional</small> : null}{control}{problem ? <span className="field-problem">{problem}</span> : null}</label>;
}

function LinesField({ path, label, payload, problems, fieldSources, onChange, optional = false }: {
  path: string;
  label: string;
  payload: Record<string, unknown>;
  problems: ManualProblem[];
  fieldSources?: Record<string, string>;
  onChange: (payload: Record<string, unknown>, path: string) => void;
  optional?: boolean;
}) {
  const current = valueAtPath(payload, path);
  const text = Array.isArray(current) ? current.join("\n") : "";
  const problem = problemFor(problems, path);
  const source = fieldSources?.[`artifactPayload.${path}`];
  return <label className="manual-pdf-field">{label}{source ? <small className="autofill-source">from {source}</small> : optional ? <small>Optional, one per line</small> : <small>One per line</small>}<Textarea value={text} aria-label={label} aria-invalid={Boolean(problem)} onChange={(event) => onChange(setValueAtPath(payload, path, event.target.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)), path)} />{problem ? <span className="field-problem">{problem}</span> : null}</label>;
}

export function ManualPdfEditor({ featureId, payload, artifact, building, problems, fieldSources, onChange, onBuild }: Props) {
  return <div className="manual-pdf-editor">
    {featureId === "reference-check-pdf"
      ? <ReferenceFields payload={payload} problems={problems} fieldSources={fieldSources} onChange={onChange} />
      : <InterviewFields payload={payload} problems={problems} fieldSources={fieldSources} onChange={onChange} />}
    {problemFor(problems, "payload") ? <p className="field-problem">{problemFor(problems, "payload")}</p> : null}
    {artifact ? <div className="outside-note"><a href={artifact.downloadUrl} target="_blank" rel="noreferrer">Download {artifact.filename}</a><br />Visual review of every page is required before use.</div> : null}
    <Button className="manual-build-button" disabled={building} onClick={onBuild}>
      <FileText size={15} />{building ? "Building (the free server can take up to a minute to wake)" : "Build PDF"}
    </Button>
  </div>;
}

function ReferenceFields({ payload, problems, fieldSources, onChange }: Pick<Props, "payload" | "problems" | "fieldSources" | "onChange">) {
  return <>
    <p className="manual-required-note">Required: candidate, client, referee, relationship, completed-by, and date details. Every question answer is optional.</p>
    <fieldset className="manual-pdf-section"><legend>Required details</legend><div className="manual-pdf-grid">
      {REFERENCE_REQUIRED.map(([path, label]) => <Field key={path} path={path} label={label} payload={payload} problems={problems} fieldSources={fieldSources} onChange={onChange} />)}
    </div></fieldset>
    <fieldset className="manual-pdf-section"><legend>Reference answers</legend><div className="manual-pdf-grid">
      {REFERENCE_ANSWER_FIELDS.map(([path, label]) => <Field key={path} path={path} label={label} payload={payload} problems={problems} fieldSources={fieldSources} onChange={onChange} multiline optional />)}
      <LinesField path="answers.strengths" label="Main strengths" payload={payload} problems={problems} fieldSources={fieldSources} onChange={onChange} optional />
    </div></fieldset>
  </>;
}

function InterviewFields({ payload, problems, fieldSources, onChange }: Pick<Props, "payload" | "problems" | "fieldSources" | "onChange">) {
  const statusPath = "brief.source_control.publication_status";
  const statusProblem = problemFor(problems, statusPath);
  return <>
    <p className="manual-required-note">Required: all visible text, current role-status evidence, two authoritative sources, four approved JPEG/PNG paths available to the PDF server, their captions, and both evidence ledgers. The builder validates the four-page PDF and never fills missing content.</p>
    <fieldset className="manual-pdf-section"><legend>Source control and privacy</legend><div className="manual-pdf-grid">
      <label className="manual-pdf-field">Publication status<select aria-label="Publication status" aria-invalid={Boolean(statusProblem)} value={stringAtPath(payload, statusPath)} onChange={(event) => onChange(setValueAtPath(payload, statusPath, event.target.value), statusPath)}><option value="">Choose status</option><option value="draft_only">Draft only</option><option value="approved_for_candidate_use">Approved for candidate use</option></select>{statusProblem ? <span className="field-problem">{statusProblem}</span> : null}</label>
      <LinesField path="brief.source_control.authoritative_sources" label="Authoritative source identifiers" payload={payload} problems={problems} fieldSources={fieldSources} onChange={onChange} />
      <LinesField path="brief.privacy.banned_terms" label="Banned personal or stale terms" payload={payload} problems={problems} fieldSources={fieldSources} onChange={onChange} optional />
    </div></fieldset>
    {[
      ["Document details", ["brief.document.", "brief.source_control.as_of", "brief.source_control.role_status_evidence"]],
      ["Cover page", ["brief.cover."]], ["Role page", ["brief.role."]], ["Context page", ["brief.context."]],
      ["Decision page", ["brief.decision."]], ["Evidence ledgers", ["source_ledger", "asset_ledger"]],
    ].map(([title, prefixes]) => {
      const fields = INTERVIEW_TEXT_FIELDS.filter(([path]) => (prefixes as string[]).some((prefix) => path.startsWith(prefix)));
      return <fieldset className="manual-pdf-section" key={title as string}><legend>{title as string}</legend><div className="manual-pdf-grid">{fields.map(([path, label]) => <Field key={path} path={path} label={label} payload={payload} problems={problems} fieldSources={fieldSources} onChange={onChange} multiline={/(body|intro|deck|ledger|evidence)$/.test(path)} />)}</div></fieldset>;
    })}
  </>;
}
