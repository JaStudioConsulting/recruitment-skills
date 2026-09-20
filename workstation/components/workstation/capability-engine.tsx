"use client";

import { Check, CircleAlert, ClipboardCopy, Play, Plus, Square, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ResumeFormEditor } from "@/components/workstation/resume-form";
import { ManualPdfEditor } from "@/components/workstation/manual-pdf-editor";
import { FEATURES, FEATURE_GROUPS, featureStatus, missingRequired, requirementStates, type FeatureDefinition } from "@/lib/capabilities/catalog";
import { fillInAvailable, labelledFieldsText, tableText } from "@/lib/capabilities/manual-drafts";
import { emptyArtifactPayload, validateManualArtifactPayload, type ManualProblem } from "@/lib/capabilities/manual-artifacts";
import { autofillCount, clearAutofillSource, createAutofilledDraft } from "@/lib/capabilities/deterministic-autofill";
import type { CapabilityDraft, CapabilityRunsDocument } from "@/lib/capabilities/types";
import { workstationApi } from "@/lib/api-client";
import type { CandidateCase, ConnectorCapability, SubmissionDocument } from "@/lib/workstation-types";

const GROUP_LABELS = { candidate: "On a candidate", role: "On a role", pipeline: "Pipeline", writing: "Writing" } as const;
const PROVIDERS = [
  { id: "gemini", label: "Gemini CLI", cost: "may bill the configured Google API key", models: ["auto", "gemini-2.5-flash-lite"], available: true, detail: "Tested deny-all policy; hooks, skills, shell, files, agents, and connectors are disabled." },
  { id: "claude", label: "Claude Code", cost: "subscription", models: ["sonnet", "opus", "haiku"], available: false, detail: "Not available: Claude Code sign-in expired. Run `claude` in Terminal, then /login." },
  { id: "codex", label: "Codex", cost: "subscription", models: ["configured model"], available: false, detail: "No proven no-shell mode on this installation." },
  { id: "opencode", label: "OpenCode", cost: "may bill a pay-per-use account", models: ["configured provider/model"], available: false, detail: "Deny-all tool policy is not proven." },
  { id: "hermes", label: "Hermes", cost: "unknown", models: ["configured model"], available: false, detail: "One-shot mode bypasses approvals." },
] as const;

export function CapabilityEngine({
  open,
  onOpenChange,
  activeCase,
  roleSelected,
  connectors,
  runs,
  onRunsChange,
  onDraftChange,
  onOpenBrandResume,
  initialFeatureId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeCase: CandidateCase | null;
  roleSelected: boolean;
  connectors: ConnectorCapability[];
  runs: CapabilityRunsDocument;
  onRunsChange: (runs: CapabilityRunsDocument) => void;
  onDraftChange: (draft: CapabilityDraft) => void;
  onOpenBrandResume: () => void;
  initialFeatureId?: string;
}) {
  const [featureId, setFeatureId] = useState(initialFeatureId || "brand-resume");
  const [extraInput, setExtraInput] = useState("");
  const [providerId, setProviderId] = useState("gemini");
  const [model, setModel] = useState("auto");
  const [running, setRunning] = useState(false);
  const [buildingPdf, setBuildingPdf] = useState(false);
  const [pdfProblems, setPdfProblems] = useState<ManualProblem[]>([]);
  const [message, setMessage] = useState("");
  const runIdRef = useRef("");

  useEffect(() => {
    if (!open) return;
    const savedProvider = window.localStorage.getItem("tttg-ai-provider");
    const savedModel = window.localStorage.getItem("tttg-ai-model");
    const provider = PROVIDERS.find((item) => item.id === savedProvider && item.available) ?? PROVIDERS[0];
    const timer = window.setTimeout(() => {
      setProviderId(provider.id);
      setModel(provider.models.includes(savedModel as never) ? String(savedModel) : provider.models[0]);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  const feature = FEATURES.find((item) => item.id === featureId) ?? FEATURES[0];
  const requirements = useMemo(() => requirementStates({ feature, activeCase, roleSelected, extraInput, connectors }), [feature, activeCase, roleSelected, extraInput, connectors]);
  const missing = missingRequired(requirements);
  const provider = PROVIDERS.find((item) => item.id === providerId) ?? PROVIDERS[0];
  const providerDetail = provider.id === "gemini" && feature.runtime === "local_ai_web"
    ? "Tested search-only policy; shell, files, URL fetch, hooks, skills, agents, MCP, and connectors are disabled."
    : provider.detail;
  const draft = runs[feature.id];
  const blockedReason = runtimeBlock(feature);
  const canRun = Boolean(activeCase) && !running && !blockedReason && provider.available && missing.length === 0;
  const canFill = Boolean(activeCase) && !running && !buildingPdf && fillInAvailable(feature);

  const setProvider = (nextId: string) => {
    const next = PROVIDERS.find((item) => item.id === nextId) ?? PROVIDERS[0];
    setProviderId(next.id);
    setModel(next.models[0]);
    window.localStorage.setItem("tttg-ai-provider", next.id);
    window.localStorage.setItem("tttg-ai-model", next.models[0]);
  };

  const run = async () => {
    if (!activeCase || !canRun) return;
    const runId = crypto.randomUUID();
    runIdRef.current = runId;
    setRunning(true);
    setMessage("Thinking. The result will be saved as a draft.");
    try {
      const response = await workstationApi.runCapability(activeCase.id, feature.id, { provider: provider.id, model, runId, extraInput });
      if (response.status !== "completed") {
        setMessage(response.detail);
        return;
      }
      const nextRuns = { ...runs, [feature.id]: response.draft };
      onRunsChange(nextRuns);
      onDraftChange(response.draft);
      setMessage("Draft saved to this case. Review and edit it before use.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The feature did not finish.");
    } finally {
      setRunning(false);
      runIdRef.current = "";
    }
  };

  const cancel = async () => {
    if (!activeCase || !runIdRef.current) return;
    setMessage("Cancelling...");
    await workstationApi.cancelCapability(activeCase.id, runIdRef.current).catch(() => ({ status: "not_running" as const }));
    setRunning(false);
    setMessage("Cancelled. No result was saved.");
  };

  const fillIn = () => {
    if (!activeCase || !canFill) return;
    if (draft && !window.confirm("Replace this feature's saved draft with a new fill-in draft from the reviewed sources?")) return;
    const filled = createAutofilledDraft(feature, activeCase);
    onRunsChange({ ...runs, [feature.id]: filled });
    onDraftChange(filled);
    setPdfProblems([]);
    const count = autofillCount(filled);
    setMessage(count ? `Auto-filled ${count} field${count === 1 ? "" : "s"}. Review before building.` : "Empty draft saved. Fill in only confirmed information.");
  };

  const buildManualPdf = async () => {
    if (!activeCase || !draft || draft.resultKind !== "pdf") return;
    const payload = draft.artifactPayload ?? emptyArtifactPayload(feature.id);
    const problems = validateManualArtifactPayload(feature.id, payload);
    setPdfProblems(problems);
    if (problems.length) {
      setMessage("Fix the named fields before building the PDF.");
      return;
    }
    setBuildingPdf(true);
    setMessage("Building (the free server can take up to a minute to wake)");
    try {
      const result = await workstationApi.buildCapabilityArtifact(activeCase.id, feature.id, payload);
      if (result.status !== "built") {
        setPdfProblems(result.problems);
        setMessage(result.detail);
        return;
      }
      const updated = { ...draft, artifact: { filename: result.filename, downloadUrl: result.downloadUrl }, updatedAt: new Date().toISOString() };
      onRunsChange({ ...runs, [feature.id]: updated });
      onDraftChange(updated);
      setMessage("PDF built as a draft. Inspect every page before use.");
    } catch (error) {
      setPdfProblems([{ path: "payload", message: error instanceof Error ? error.message : "The PDF builder did not finish." }]);
      setMessage(error instanceof Error ? error.message : "The PDF builder did not finish.");
    } finally {
      setBuildingPdf(false);
    }
  };

  const updateDraft = (next: CapabilityDraft) => {
    const updated = { ...next, updatedAt: new Date().toISOString() };
    setPdfProblems([]);
    onRunsChange({ ...runs, [feature.id]: updated });
    onDraftChange(updated);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!running) onOpenChange(next); }}>
      <DialogContent className="capability-dialog">
        <DialogHeader>
          <DialogTitle>Recruiting features</DialogTitle>
          <DialogDescription>Fill in a draft yourself on any host, or optionally draft with local AI. Nothing is sent or published.</DialogDescription>
        </DialogHeader>
        <div className="capability-layout">
          <nav className="capability-nav" aria-label="Recruiting features">
            {FEATURE_GROUPS.map((group) => <section key={group}><h3>{GROUP_LABELS[group]}</h3>{FEATURES.filter((item) => item.group === group).map((item) => {
              const itemRequirements = requirementStates({ feature: item, activeCase, roleSelected, extraInput: "", connectors });
              const status = featureStatus(item, itemRequirements);
              return <button type="button" key={item.id} aria-current={item.id === feature.id ? "page" : undefined} onClick={() => { setFeatureId(item.id); setExtraInput(""); setMessage(""); }}><span>{item.label}</span><small className={`feature-status ${status.tone}`}>{status.label}</small></button>;
            })}</section>)}
          </nav>
          <section className="capability-main">
            <div className="capability-heading"><div><h2>{feature.label}</h2><span className="draft-badge">Every result is a draft</span></div><FeatureStatus feature={feature} requirements={requirements} /></div>
            <div className="requirement-card"><h3>What AI drafting needs</h3>{requirements.map((requirement) => <div key={requirement.id} className={requirement.met ? "met" : "missing"}>{requirement.met ? <Check size={15} /> : <CircleAlert size={15} />}<span>{requirement.label}{requirement.required ? "" : " (optional)"}</span></div>)}</div>
            {feature.outside_world_note ? <p className="outside-note">{feature.outside_world_note}</p> : null}
            <label className="capability-extra">Additional facts or instructions<Textarea value={extraInput} onChange={(event) => setExtraInput(event.target.value)} placeholder="Paste only confirmed information needed for this run." /></label>
            <div className="ai-picker">
              <label>AI<select value={providerId} onChange={(event) => setProvider(event.target.value)}>{PROVIDERS.map((item) => <option key={item.id} value={item.id} disabled={!item.available}>{item.label} · {item.cost}{item.available ? "" : " · unavailable"}</option>)}</select></label>
              <label>Model<select value={model} onChange={(event) => { setModel(event.target.value); window.localStorage.setItem("tttg-ai-model", event.target.value); }}>{provider.models.map((item) => <option key={item}>{item}</option>)}</select></label>
            </div>
            <p className="provider-detail">{providerDetail}</p>
            {blockedReason ? <p className="capability-message">{blockedReason}</p> : null}
            {message ? <p className="capability-message" role="status">{message}</p> : null}
            {draft ? <DraftEditor feature={feature} draft={draft} onChange={updateDraft} buildingPdf={buildingPdf} pdfProblems={pdfProblems} onBuildPdf={() => void buildManualPdf()} /> : <div className="capability-empty">Choose Fill in myself to auto-fill an editable draft from reviewed sources. Unrecognized facts stay empty.</div>}
          </section>
        </div>
        <DialogFooter>
          {draft?.resultKind === "resume" ? <Button variant="outline" onClick={() => { onOpenChange(false); onOpenBrandResume(); }}>Review and build PDF</Button> : null}
          <Button variant="outline" disabled={running || buildingPdf} onClick={() => onOpenChange(false)}>Close</Button>
          {fillInAvailable(feature) ? <Button variant="outline" disabled={!canFill} onClick={fillIn}>Fill in myself</Button> : null}
          {running ? <Button variant="destructive" onClick={() => void cancel()}><Square size={14} />Cancel</Button> : <Button disabled={!canRun || buildingPdf} onClick={() => void run()}><Play size={15} />Draft with AI · Local only</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function runtimeBlock(feature: FeatureDefinition): string {
  if (feature.runtime === "server_pending") return "Not available yet: server update pending.";
  if (feature.runtime === "loxo_read_adapter") return "Not available yet: the read-only Loxo adapter is not connected.";
  if (feature.runtime === "tracker_read_adapter") return "Not available yet: the read-only Tracker adapter is not connected.";
  return "";
}

function FeatureStatus({ feature, requirements }: { feature: FeatureDefinition; requirements: ReturnType<typeof requirementStates> }) {
  const status = featureStatus(feature, requirements);
  return <span className={`feature-status large ${status.tone}`}>{status.label}</span>;
}

function DraftEditor({ feature, draft, onChange, buildingPdf, pdfProblems, onBuildPdf }: { feature: FeatureDefinition; draft: CapabilityDraft; onChange: (draft: CapabilityDraft) => void; buildingPdf: boolean; pdfProblems: ManualProblem[]; onBuildPdf: () => void }) {
  return <div className="capability-result"><div className="capability-result-title"><Input value={draft.title} aria-label="Draft title" onChange={(event) => onChange({ ...draft, title: event.target.value })} /><span>Draft</span></div>
    {autofillCount(draft) ? <p className="autofill-summary">Auto-filled {autofillCount(draft)} field{autofillCount(draft) === 1 ? "" : "s"}. Review before building.</p> : null}
    {draft.resultKind === "resume" && draft.resume ? <ResumeFormEditor value={draft.resume} fieldSources={draft.autofill} onChange={(resume, path) => onChange(path ? clearAutofillSource({ ...draft, resume }, path) : { ...draft, resume })} /> : null}
    {draft.resultKind === "submission" && draft.submission ? <SubmissionDraft value={draft.submission} fieldSources={draft.autofill} onChange={(submission, path) => onChange(clearAutofillSource({ ...draft, submission }, path))} emailDraft={draft.emailDraft ?? ""} loxoUpdate={draft.loxoUpdate ?? ""} onEmail={(emailDraft) => onChange(clearAutofillSource({ ...draft, emailDraft }, "emailDraft"))} onLoxo={(loxoUpdate) => onChange(clearAutofillSource({ ...draft, loxoUpdate }, "loxoUpdate"))} /> : null}
    {draft.resultKind === "document" ? <CopyBlock label="Document" text={draft.document ?? ""} source={draft.autofill?.document}><Textarea className="capability-document" aria-label="Document draft" value={draft.document ?? ""} onChange={(event) => onChange(clearAutofillSource({ ...draft, document: event.target.value }, "document"))} /></CopyBlock> : null}
    {draft.resultKind === "pdf" ? <ManualPdfEditor featureId={feature.id} payload={draft.artifactPayload ?? emptyArtifactPayload(feature.id)} artifact={draft.artifact} building={buildingPdf} problems={pdfProblems} fieldSources={draft.autofill} onChange={(artifactPayload, path) => onChange(clearAutofillSource({ ...draft, artifactPayload, artifact: undefined }, `artifactPayload.${path}`))} onBuild={onBuildPdf} /> : null}
    {draft.resultKind === "form" ? <CopyBlock label="Offer letter fields" text={labelledFieldsText(draft.fields ?? [])}><div className="capability-fields">{(draft.fields ?? []).map((field, index) => <label key={`${field.label}-${index}`}>{field.label}<SourceMarker source={draft.autofill?.[`fields.${index}.value`]} /><Textarea value={field.value} onChange={(event) => onChange(clearAutofillSource({ ...draft, fields: draft.fields?.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item) }, `fields.${index}.value`))} /></label>)}</div></CopyBlock> : null}
    {draft.resultKind === "table" && draft.table ? <TableDraft draft={draft} onChange={onChange} /> : null}
    {draft.unknowns.length ? <div className="unknowns"><strong>Confirm before use</strong><ul>{draft.unknowns.map((unknown, index) => <li key={index}>{unknown}</li>)}</ul></div> : null}
  </div>;
}

const SUBMISSION_FIELDS: Array<[keyof SubmissionDocument, string]> = [
  ["name", "Name"], ["title", "Title"], ["compensationTarget", "Compensation Target"], ["currentCompensation", "Current Compensation"],
  ["vacation", "Vacation"], ["location", "Location"], ["workStatus", "Work Status"], ["interviewAvailability", "Interview Availability"],
  ["startDateNotice", "Start Date / Notice Period"], ["reasonForLeaving", "Reason for Leaving"], ["profileSummary", "Profile Summary"],
];

function SubmissionDraft({ value, fieldSources, onChange, emailDraft, loxoUpdate, onEmail, onLoxo }: { value: SubmissionDocument; fieldSources?: Record<string, string>; onChange: (value: SubmissionDocument, path: string) => void; emailDraft: string; loxoUpdate: string; onEmail: (value: string) => void; onLoxo: (value: string) => void }) {
  return <div className="manual-output-stack"><CopyBlock label="Candidate submission" text={SUBMISSION_FIELDS.map(([key, label]) => `${label}: ${value[key]}`).join("\n")}><div className="capability-fields">{SUBMISSION_FIELDS.map(([key, label]) => <label key={key}>{label}<SourceMarker source={fieldSources?.[`submission.${key}`]} /><Textarea value={value[key]} onChange={(event) => onChange({ ...value, [key]: event.target.value }, `submission.${key}`)} /></label>)}</div></CopyBlock><CopyBlock label="Email draft" text={emailDraft} copyLabel="Copy all" source={fieldSources?.emailDraft}><Textarea aria-label="Email draft" value={emailDraft} onChange={(event) => onEmail(event.target.value)} /></CopyBlock><CopyBlock label="Loxo update bullets" text={loxoUpdate} source={fieldSources?.loxoUpdate}><Textarea aria-label="Loxo update bullets" value={loxoUpdate} onChange={(event) => onLoxo(event.target.value)} /></CopyBlock></div>;
}

function CopyBlock({ label, text, copyLabel = "Copy", source, children }: { label: string; text: string; copyLabel?: string; source?: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };
  return <section className="copy-block"><div className="copy-block-heading"><strong>{label}</strong>{source ? <SourceMarker source={source} /> : null}<Button type="button" size="sm" variant="outline" onClick={() => void copy()}><ClipboardCopy size={14} />{copied ? "Copied" : copyLabel}</Button></div>{children}</section>;
}

function TableDraft({ draft, onChange }: { draft: CapabilityDraft; onChange: (draft: CapabilityDraft) => void }) {
  const table = draft.table!;
  const updateCell = (rowIndex: number, cellIndex: number, value: string) => onChange(clearAutofillSource({ ...draft, table: { columns: table.columns, rows: table.rows.map((row, index) => index === rowIndex ? row.map((cell, column) => column === cellIndex ? value : cell) : row) } }, `table.rows.${rowIndex}.${cellIndex}`));
  return <CopyBlock label="Editable table" copyLabel="Copy as table" text={tableText(table.columns, table.rows)}><div className="capability-table-actions"><Button type="button" size="sm" variant="outline" onClick={() => onChange({ ...draft, table: { ...table, rows: [...table.rows, table.columns.map(() => "")] } })}><Plus size={14} />Add row</Button></div><div className="capability-table-wrap"><table><thead><tr>{table.columns.map((column, index) => <th key={`${column}-${index}`}>{column}</th>)}<th>Row</th></tr></thead><tbody>{table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}><SourceMarker source={draft.autofill?.[`table.rows.${rowIndex}.${cellIndex}`]} /><Input aria-label={`${table.columns[cellIndex]} row ${rowIndex + 1}`} value={cell} onChange={(event) => updateCell(rowIndex, cellIndex, event.target.value)} /></td>)}<td><Button type="button" size="sm" variant="outline" aria-label={`Remove row ${rowIndex + 1}`} onClick={() => onChange(clearAutofillSource({ ...draft, table: { ...table, rows: table.rows.filter((_, index) => index !== rowIndex) } }, `table.rows.${rowIndex}`))}><Trash2 size={14} />Remove row</Button></td></tr>)}</tbody></table></div></CopyBlock>;
}

function SourceMarker({ source }: { source?: string }) {
  return source ? <small className="autofill-source">from {source}</small> : null;
}
