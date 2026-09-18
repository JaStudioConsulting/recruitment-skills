"use client";

import { Check, CircleAlert, Play, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ResumeFormEditor } from "@/components/workstation/resume-form";
import { FEATURES, FEATURE_GROUPS, missingRequired, requirementStates, type FeatureDefinition } from "@/lib/capabilities/catalog";
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

  const updateDraft = (next: CapabilityDraft) => {
    const updated = { ...next, updatedAt: new Date().toISOString() };
    onRunsChange({ ...runs, [feature.id]: updated });
    onDraftChange(updated);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!running) onOpenChange(next); }}>
      <DialogContent className="capability-dialog">
        <DialogHeader>
          <DialogTitle>Recruiting features</DialogTitle>
          <DialogDescription>Choose plain-language work, pick the AI and model, then review the saved draft. Nothing is sent or published.</DialogDescription>
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
            <div className="requirement-card"><h3>What this needs</h3>{requirements.map((requirement) => <div key={requirement.id} className={requirement.met ? "met" : "missing"}>{requirement.met ? <Check size={15} /> : <CircleAlert size={15} />}<span>{requirement.label}{requirement.required ? "" : " (optional)"}</span></div>)}</div>
            {feature.outside_world_note ? <p className="outside-note">{feature.outside_world_note}</p> : null}
            <label className="capability-extra">Additional facts or instructions<Textarea value={extraInput} onChange={(event) => setExtraInput(event.target.value)} placeholder="Paste only confirmed information needed for this run." /></label>
            <div className="ai-picker">
              <label>AI<select value={providerId} onChange={(event) => setProvider(event.target.value)}>{PROVIDERS.map((item) => <option key={item.id} value={item.id} disabled={!item.available}>{item.label} · {item.cost}{item.available ? "" : " · unavailable"}</option>)}</select></label>
              <label>Model<select value={model} onChange={(event) => { setModel(event.target.value); window.localStorage.setItem("tttg-ai-model", event.target.value); }}>{provider.models.map((item) => <option key={item}>{item}</option>)}</select></label>
            </div>
            <p className="provider-detail">{providerDetail}</p>
            {blockedReason ? <p className="capability-message">{blockedReason}</p> : null}
            {message ? <p className="capability-message" role="status">{message}</p> : null}
            {draft ? <DraftEditor draft={draft} onChange={updateDraft} /> : <div className="capability-empty">No saved draft for this feature yet.</div>}
          </section>
        </div>
        <DialogFooter>
          {draft?.resultKind === "resume" ? <Button variant="outline" onClick={() => { onOpenChange(false); onOpenBrandResume(); }}>Review and build PDF</Button> : null}
          <Button variant="outline" disabled={running} onClick={() => onOpenChange(false)}>Close</Button>
          {running ? <Button variant="destructive" onClick={() => void cancel()}><Square size={14} />Cancel</Button> : <Button disabled={!canRun} onClick={() => void run()}><Play size={15} />Run feature</Button>}
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

function featureStatus(feature: FeatureDefinition, requirements: ReturnType<typeof requirementStates>) {
  const blocked = runtimeBlock(feature);
  if (blocked) return { label: "Not available yet", tone: "blocked" };
  const missing = missingRequired(requirements);
  if (missing.length) return { label: `Needs ${missing[0].label.toLowerCase()}`, tone: "needs" };
  if (feature.runtime === "local_ai" || feature.runtime === "local_ai_web") return { label: "Local only", tone: "local" };
  return { label: "Ready", tone: "ready" };
}

function FeatureStatus({ feature, requirements }: { feature: FeatureDefinition; requirements: ReturnType<typeof requirementStates> }) {
  const status = featureStatus(feature, requirements);
  return <span className={`feature-status large ${status.tone}`}>{status.label}</span>;
}

function DraftEditor({ draft, onChange }: { draft: CapabilityDraft; onChange: (draft: CapabilityDraft) => void }) {
  return <div className="capability-result"><div className="capability-result-title"><Input value={draft.title} aria-label="Draft title" onChange={(event) => onChange({ ...draft, title: event.target.value })} /><span>Draft</span></div>
    {draft.resultKind === "resume" && draft.resume ? <ResumeFormEditor value={draft.resume} onChange={(resume) => onChange({ ...draft, resume })} /> : null}
    {draft.resultKind === "submission" && draft.submission ? <SubmissionDraft value={draft.submission} onChange={(submission) => onChange({ ...draft, submission })} emailDraft={draft.emailDraft ?? ""} loxoUpdate={draft.loxoUpdate ?? ""} onEmail={(emailDraft) => onChange({ ...draft, emailDraft })} onLoxo={(loxoUpdate) => onChange({ ...draft, loxoUpdate })} /> : null}
    {(draft.resultKind === "document" || draft.resultKind === "pdf") ? <Textarea className="capability-document" value={draft.document ?? ""} onChange={(event) => onChange({ ...draft, document: event.target.value })} /> : null}
    {draft.resultKind === "pdf" && draft.artifact ? <div className="outside-note"><a href={draft.artifact.downloadUrl} target="_blank" rel="noreferrer">Download {draft.artifact.filename}</a><br />Visual review of every page is required before use.</div> : null}
    {draft.resultKind === "form" ? <div className="capability-fields">{(draft.fields ?? []).map((field, index) => <label key={`${field.label}-${index}`}>{field.label}<Textarea value={field.value} onChange={(event) => onChange({ ...draft, fields: draft.fields?.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item) })} /></label>)}</div> : null}
    {draft.resultKind === "table" && draft.table ? <div className="capability-table-wrap"><table><thead><tr>{draft.table.columns.map((column, index) => <th key={`${column}-${index}`}>{column}</th>)}</tr></thead><tbody>{draft.table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}><Input aria-label={`${draft.table?.columns[cellIndex]} row ${rowIndex + 1}`} value={cell} onChange={(event) => onChange({ ...draft, table: { columns: draft.table!.columns, rows: draft.table!.rows.map((item, itemIndex) => itemIndex === rowIndex ? item.map((value, valueIndex) => valueIndex === cellIndex ? event.target.value : value) : item) } })} /></td>)}</tr>)}</tbody></table></div> : null}
    {draft.unknowns.length ? <div className="unknowns"><strong>Confirm before use</strong><ul>{draft.unknowns.map((unknown, index) => <li key={index}>{unknown}</li>)}</ul></div> : null}
  </div>;
}

const SUBMISSION_FIELDS: Array<[keyof SubmissionDocument, string]> = [
  ["name", "Name"], ["title", "Title"], ["compensationTarget", "Compensation Target"], ["currentCompensation", "Current Compensation"],
  ["vacation", "Vacation"], ["location", "Location"], ["workStatus", "Work Status"], ["interviewAvailability", "Interview Availability"],
  ["startDateNotice", "Start Date / Notice Period"], ["reasonForLeaving", "Reason for Leaving"], ["profileSummary", "Profile Summary"],
];

function SubmissionDraft({ value, onChange, emailDraft, loxoUpdate, onEmail, onLoxo }: { value: SubmissionDocument; onChange: (value: SubmissionDocument) => void; emailDraft: string; loxoUpdate: string; onEmail: (value: string) => void; onLoxo: (value: string) => void }) {
  return <div className="capability-fields">{SUBMISSION_FIELDS.map(([key, label]) => <label key={key}>{label}<Textarea value={value[key]} onChange={(event) => onChange({ ...value, [key]: event.target.value })} /></label>)}<label>Email draft<Textarea value={emailDraft} onChange={(event) => onEmail(event.target.value)} /></label><label>Loxo update bullets<Textarea value={loxoUpdate} onChange={(event) => onLoxo(event.target.value)} /></label></div>;
}
