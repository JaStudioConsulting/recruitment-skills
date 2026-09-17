"use client";

import type { OutputData } from "@editorjs/editorjs";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  CircleHelp,
  FileText,
  Link2,
  LoaderCircle,
  MessageCircleQuestion,
  Paperclip,
  Plus,
  RefreshCw,
  SearchCheck,
  Send,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { workstationApi } from "@/lib/api-client";
import { mergeCandidateCaseSnapshots } from "@/lib/case-merge";
import {
  EMPTY_RESUME,
  EMPTY_SUBMISSION,
  DOCUMENT_KINDS,
  type CandidateCase,
  type CandidateRecord,
  type CaseDocument,
  type ConnectorCapability,
  type DocumentKind,
  type RoleRecord,
  type SaveState,
  type SubmissionDocument,
} from "@/lib/workstation-types";
import { ResumeEditor } from "./resume-editor";

type User = { id: string; displayName: string };
type CreationMode = "role" | "candidate" | null;

const FONT_OPTIONS = ["System", "Avenir Next", "Georgia", "Bradley Hand", "Times New Roman"];
const SIZE_OPTIONS = [16, 18, 20, 22, 24];
const SOURCE_ACTIONS = [
  { kind: "resume", label: "Resume", accept: ".pdf,.doc,.docx,.txt", icon: FileText },
  { kind: "transcript", label: "Transcript", accept: ".pdf,.doc,.docx,.txt,.md", icon: FileText },
  { kind: "other", label: "File", accept: ".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg", icon: Paperclip },
] as const;

function saveLabel(state: SaveState) {
  return { saved: "Saved", saving: "Saving", unsaved: "Unsaved", failed: "Save failed" }[state];
}

function contentAsString(document: CaseDocument | undefined) {
  return typeof document?.content === "string" ? document.content : "";
}

function contentAsSubmission(document: CaseDocument | undefined) {
  if (document?.content && typeof document.content === "object" && !Array.isArray(document.content) && !("blocks" in document.content)) {
    return { ...EMPTY_SUBMISSION, ...(document.content as SubmissionDocument) };
  }
  return { ...EMPTY_SUBMISSION };
}

function contentAsResume(document: CaseDocument | undefined) {
  if (document?.content && typeof document.content === "object" && "blocks" in document.content) {
    return document.content as OutputData;
  }
  return EMPTY_RESUME;
}

export function RecruiterWorkstation({ user }: { user: User }) {
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [candidates, setCandidates] = useState<CandidateRecord[]>([]);
  const [cases, setCases] = useState<CandidateCase[]>([]);
  const [connectors, setConnectors] = useState<ConnectorCapability[]>([]);
  const [roleId, setRoleId] = useState("");
  const [candidateId, setCandidateId] = useState("");
  const [activeCase, setActiveCase] = useState<CandidateCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [creationMode, setCreationMode] = useState<CreationMode>(null);
  const [creationPrimary, setCreationPrimary] = useState("");
  const [creationSecondary, setCreationSecondary] = useState("");
  const [notes, setNotes] = useState("");
  const [notesFont, setNotesFont] = useState("System");
  const [notesSize, setNotesSize] = useState(20);
  const [caseStatus, setCaseStatus] = useState("active");
  const [caseSaveState, setCaseSaveState] = useState<SaveState>("saved");
  const [documentSaveState, setDocumentSaveState] = useState<SaveState>("saved");
  const [writeUp, setWriteUp] = useState("");
  const [submission, setSubmission] = useState<SubmissionDocument>({ ...EMPTY_SUBMISSION });
  const [email, setEmail] = useState("");
  const [resume, setResume] = useState<OutputData>(EMPTY_RESUME);
  const [activeTab, setActiveTab] = useState<DocumentKind>("resume");
  const [actionMessage, setActionMessage] = useState("");
  const [updateOpen, setUpdateOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pastedSource, setPastedSource] = useState("");
  const caseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const documentTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const activeCaseRef = useRef<CandidateCase | null>(null);
  const caseDraftRef = useRef({ notes: "", notesFont: "System", notesSize: 20, status: "active" });
  const caseEditVersionRef = useRef(0);
  const caseSavePromiseRef = useRef<Promise<boolean> | null>(null);
  const documentDraftRef = useRef<Record<DocumentKind, CaseDocument["content"]>>({
    resume: EMPTY_RESUME,
    write_up: "",
    submission: { ...EMPTY_SUBMISSION },
    email: "",
  });
  const documentVersionRef = useRef<Record<DocumentKind, number>>({ resume: 0, write_up: 0, submission: 0, email: 0 });
  const documentSavedVersionRef = useRef<Record<DocumentKind, number>>({ resume: 0, write_up: 0, submission: 0, email: 0 });
  const documentSavePromisesRef = useRef<Partial<Record<DocumentKind, Promise<boolean>>>>({});

  const storeCaseRecord = useCallback((next: CandidateCase) => {
    const merged = mergeCandidateCaseSnapshots(activeCaseRef.current, next);
    activeCaseRef.current = merged;
    setActiveCase(merged);
    setCases((current) => [merged, ...current.filter((item) => item.id !== merged.id)]);
  }, []);

  const replaceCase = useCallback((next: CandidateCase) => {
    storeCaseRecord(next);
    setNotes(next.notes);
    setNotesFont(next.notesFont);
    setNotesSize(next.notesSize);
    setCaseStatus(next.status);
    setWriteUp(contentAsString(next.documents.write_up));
    setSubmission(contentAsSubmission(next.documents.submission));
    setEmail(contentAsString(next.documents.email));
    setResume(contentAsResume(next.documents.resume));
    caseDraftRef.current = { notes: next.notes, notesFont: next.notesFont, notesSize: next.notesSize, status: next.status };
    caseEditVersionRef.current = 0;
    documentDraftRef.current = {
      resume: contentAsResume(next.documents.resume),
      write_up: contentAsString(next.documents.write_up),
      submission: contentAsSubmission(next.documents.submission),
      email: contentAsString(next.documents.email),
    };
    documentVersionRef.current = { resume: 0, write_up: 0, submission: 0, email: 0 };
    documentSavedVersionRef.current = { resume: 0, write_up: 0, submission: 0, email: 0 };
    setCaseSaveState("saved");
    setDocumentSaveState("saved");
  }, [storeCaseRecord]);

  const loadWorkspace = useCallback(async () => {
    try {
      const payload = await workstationApi.load();
      setRoles(payload.roles);
      setCandidates(payload.candidates);
      setCases(payload.cases);
      setConnectors(payload.connectors);
      const mostRecent = payload.cases[0];
      if (mostRecent) {
        setRoleId(mostRecent.roleId);
        setCandidateId(mostRecent.candidateId);
        replaceCase(mostRecent);
      }
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "The workstation could not load.");
    } finally {
      setLoading(false);
    }
  }, [replaceCase]);

  useEffect(() => {
    // Initial remote state belongs in an effect; later reloads are explicit events.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadWorkspace();
  }, [loadWorkspace]);

  const changeCaseDraft = useCallback((patch: Partial<typeof caseDraftRef.current>) => {
    caseDraftRef.current = { ...caseDraftRef.current, ...patch };
    caseEditVersionRef.current += 1;
    setCaseSaveState("unsaved");
  }, []);

  const persistCase = useCallback(async () => {
    if (caseTimer.current) clearTimeout(caseTimer.current);
    if (caseSavePromiseRef.current) return caseSavePromiseRef.current;

    const run = async () => {
      try {
        while (activeCaseRef.current) {
          const current = activeCaseRef.current;
          const version = caseEditVersionRef.current;
          const draft = { ...caseDraftRef.current };
          setCaseSaveState("saving");
          const next = await workstationApi.updateCase(current.id, {
            expectedRevision: current.revision,
            ...draft,
          });
          if (activeCaseRef.current?.id !== current.id) return true;
          storeCaseRecord(next);
          if (caseEditVersionRef.current === version) {
            caseEditVersionRef.current = 0;
            setCaseSaveState("saved");
            return true;
          }
        }
        return true;
      } catch (error) {
        setCaseSaveState("failed");
        setActionMessage(error instanceof Error ? error.message : "Notes were not saved.");
        return false;
      }
    };

    const pending = run().finally(() => { caseSavePromiseRef.current = null; });
    caseSavePromiseRef.current = pending;
    return pending;
  }, [storeCaseRecord]);

  useEffect(() => {
    if (!activeCase || caseEditVersionRef.current === 0) return;
    if (caseTimer.current) clearTimeout(caseTimer.current);
    caseTimer.current = setTimeout(() => void persistCase(), 750);
    return () => { if (caseTimer.current) clearTimeout(caseTimer.current); };
  }, [activeCase, notes, notesFont, notesSize, caseStatus, persistCase]);

  const persistDocument = useCallback(async (kind: DocumentKind) => {
    if (documentTimers.current[kind]) clearTimeout(documentTimers.current[kind]);
    const existingPromise = documentSavePromisesRef.current[kind];
    if (existingPromise) return existingPromise;

    const run = async () => {
      try {
        while (activeCaseRef.current) {
          const current = activeCaseRef.current;
          const version = documentVersionRef.current[kind];
          if (version === documentSavedVersionRef.current[kind]) return true;
          setDocumentSaveState("saving");
          const document = await workstationApi.saveDocument(current.id, kind, {
            expectedRevision: current.documents[kind].revision,
            content: documentDraftRef.current[kind],
          });
          if (activeCaseRef.current?.id !== current.id) return true;
          const next = {
            ...activeCaseRef.current,
            documents: { ...activeCaseRef.current.documents, [kind]: document },
          };
          storeCaseRecord(next);
          documentSavedVersionRef.current[kind] = version;
          if (documentVersionRef.current[kind] === version) {
            const allSaved = DOCUMENT_KINDS.every(
              (item) => documentVersionRef.current[item] === documentSavedVersionRef.current[item],
            );
            setDocumentSaveState(allSaved ? "saved" : "unsaved");
            return true;
          }
        }
        return true;
      } catch (error) {
        setDocumentSaveState("failed");
        setActionMessage(error instanceof Error ? error.message : "The document was not saved.");
        return false;
      }
    };

    const pending = run().finally(() => { delete documentSavePromisesRef.current[kind]; });
    documentSavePromisesRef.current[kind] = pending;
    return pending;
  }, [storeCaseRecord]);

  const flushDocuments = useCallback(async () => {
    const dirtyKinds = DOCUMENT_KINDS.filter(
      (kind) => documentVersionRef.current[kind] !== documentSavedVersionRef.current[kind],
    );
    if (!dirtyKinds.length) return true;
    return (await Promise.all(dirtyKinds.map((kind) => persistDocument(kind)))).every(Boolean);
  }, [persistDocument]);

  const openSelectedCase = useCallback(async (nextRoleId: string, nextCandidateId: string) => {
    if (caseSaveState !== "saved") {
      const saved = await persistCase();
      if (!saved) return;
    }
    if (documentSaveState !== "saved") {
      const saved = await flushDocuments();
      if (!saved) return;
    }
    if (!nextRoleId || !nextCandidateId) {
      setRoleId(nextRoleId);
      setCandidateId(nextCandidateId);
      activeCaseRef.current = null;
      setActiveCase(null);
      return;
    }
    setLoading(true);
    try {
      const existing = cases.find((item) => item.roleId === nextRoleId && item.candidateId === nextCandidateId);
      const next = existing || await workstationApi.openCase({ roleId: nextRoleId, candidateId: nextCandidateId });
      setRoleId(nextRoleId);
      setCandidateId(nextCandidateId);
      replaceCase(next);
      setActionMessage("");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "The candidate case could not open.");
    } finally {
      setLoading(false);
    }
  }, [caseSaveState, cases, documentSaveState, flushDocuments, persistCase, replaceCase]);

  const scheduleDocumentSave = useCallback((kind: DocumentKind, content: CaseDocument["content"]) => {
    if (!activeCaseRef.current) return;
    documentDraftRef.current[kind] = content;
    documentVersionRef.current[kind] += 1;
    setDocumentSaveState("unsaved");
    if (documentTimers.current[kind]) clearTimeout(documentTimers.current[kind]);
    documentTimers.current[kind] = setTimeout(() => void persistDocument(kind), 1100);
  }, [persistDocument]);

  const submitCreation = async () => {
    if (!creationMode || !creationPrimary.trim()) return;
    try {
      if (creationMode === "role") {
        const created = await workstationApi.createRole({ title: creationPrimary.trim(), client: creationSecondary.trim() });
        setRoles((current) => [created, ...current]);
        setRoleId(created.id);
        if (candidateId) await openSelectedCase(created.id, candidateId);
      } else {
        const created = await workstationApi.createCandidate({ name: creationPrimary.trim(), currentTitle: creationSecondary.trim() });
        setCandidates((current) => [created, ...current]);
        setCandidateId(created.id);
        if (roleId) await openSelectedCase(roleId, created.id);
      }
      setCreationMode(null); setCreationPrimary(""); setCreationSecondary("");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "The record could not be created.");
    }
  };

  const uploadSource = async (kind: string, file?: File) => {
    if (!activeCase || !file) return;
    if (caseSaveState !== "saved" && !(await persistCase())) return;
    if (documentSaveState !== "saved" && !(await flushDocuments())) return;
    setActionMessage(`Uploading ${file.name}...`);
    try {
      const next = await workstationApi.uploadSource(activeCase.id, kind, file);
      replaceCase(next);
      setActionMessage(`${file.name} was added as an immutable source.`);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "The source could not be uploaded.");
    }
  };

  const assistant = activeCase?.assistant || {
    missing: ["Select a role and candidate to start."],
    askNext: [],
    fitConcern: "No candidate case is open.",
    nextAction: "Choose the current role and candidate.",
  };
  const pdfCapability = connectors.find((item) => item.id === "pdf");
  const externalCapabilities = connectors.filter((item) => item.id !== "pdf");

  const internalUnconfirmed = useMemo(() => {
    if (!activeCase) return 0;
    return activeCase.facts.filter((fact) => fact.status !== "confirmed").length;
  }, [activeCase]);

  if (loading && !roles.length && !candidates.length) {
    return <main className="center-state"><LoaderCircle className="spin" /> Loading workstation</main>;
  }

  return (
    <main className="workstation-shell">
      <header className="brand-bar">
        <div className="brand-lockup"><span className="brand-wordmark">TOP TIER TALENT GROUP</span><span className="brand-line" /></div>
        <div className="brand-title"><strong>Recruiter Workstation</strong><span>One workspace. From conversation to submission.</span></div>
        <div className="operator"><span className={`save-dot ${caseSaveState}`}><Check size={13} /></span><span>{saveLabel(caseSaveState)}</span><span className="operator-name">{user.displayName}</span></div>
      </header>

      <section className="context-bar" aria-label="Current recruiting case">
        <ContextSelect label="Role" value={roleId} onChange={(value) => void openSelectedCase(value, candidateId)} onAdd={() => setCreationMode("role")} disabled={caseSaveState === "saving"}>
          <option value="">Select a role...</option>
          {roles.map((item) => <option key={item.id} value={item.id}>{item.title}{item.client ? ` · ${item.client}` : ""}</option>)}
        </ContextSelect>
        <ContextSelect label="Candidate" value={candidateId} onChange={(value) => void openSelectedCase(roleId, value)} onAdd={() => setCreationMode("candidate")} disabled={caseSaveState === "saving"}>
          <option value="">Select a candidate...</option>
          {candidates.map((item) => <option key={item.id} value={item.id}>{item.name}{item.currentTitle ? ` · ${item.currentTitle}` : ""}</option>)}
        </ContextSelect>
        <label className="context-control status-control"><span>Status</span><div className="select-wrap"><select value={caseStatus} disabled={!activeCase} onChange={(event) => { if (!activeCase) return; const status = event.target.value; setCaseStatus(status); changeCaseDraft({ status }); void persistCase(); }}><option value="active">Active</option><option value="screening">Screening</option><option value="submission_ready">Submission ready</option><option value="on_hold">On hold</option><option value="closed">Closed</option></select><ChevronDown size={16} /></div></label>
      </section>

      {pageError ? <div className="error-banner"><AlertTriangle size={17} />{pageError}<Button size="sm" variant="outline" onClick={() => { setLoading(true); setPageError(""); void loadWorkspace(); }}>Retry</Button></div> : null}

      <section className="desk-grid">
        <section className="notes-pane" aria-label="Apple Pencil and typed notes">
          <div className="pane-toolbar notes-toolbar"><div><h2>Notes</h2><span className={`save-state ${caseSaveState}`}>{saveLabel(caseSaveState)}</span></div><div className="notes-controls"><label>Font<select value={notesFont} disabled={!activeCase} onChange={(event) => { const notesFont = event.target.value; setNotesFont(notesFont); changeCaseDraft({ notesFont }); }}>{FONT_OPTIONS.map((font) => <option key={font}>{font}</option>)}</select></label><label>Size<select value={notesSize} disabled={!activeCase} onChange={(event) => { const notesSize = Number(event.target.value); setNotesSize(notesSize); changeCaseDraft({ notesSize }); }}>{SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}</select></label></div></div>
          <Textarea className="scribble-surface" aria-label="Candidate notes" disabled={!activeCase} value={notes} onChange={(event) => { const notes = event.target.value; setNotes(notes); changeCaseDraft({ notes }); }} placeholder={activeCase ? "Write with Apple Pencil Scribble or type your call notes." : "Select a role and candidate to open a private case."} style={{ fontFamily: notesFont === "System" ? "var(--font-ui)" : notesFont, fontSize: `${notesSize}px` }} />
          <div className="source-area"><span>Add source</span><div className="source-actions">{SOURCE_ACTIONS.map(({ kind, label, accept, icon: Icon }) => <div key={kind}><input ref={(node) => { fileInputs.current[kind] = node; }} type="file" accept={accept} hidden onChange={(event) => { void uploadSource(kind, event.target.files?.[0]); event.currentTarget.value = ""; }} /><Button variant="outline" disabled={!activeCase} onClick={() => fileInputs.current[kind]?.click()}><Icon size={18} />{label}</Button></div>)}<Button variant="outline" disabled={!activeCase} onClick={() => setPasteOpen(true)}><Link2 size={18} />Paste source</Button></div><div className="source-summary">{activeCase?.sources.length ? activeCase.sources.map((source) => <span key={source.id}>{source.kind}: {source.filename}</span>) : <span>No sources attached.</span>}</div></div>
        </section>

        <section className="document-pane" aria-label="Candidate document workspace">
          {activeCase ? <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as DocumentKind)} className="document-tabs"><div className="document-tabbar"><TabsList><TabsTrigger value="resume">Resume</TabsTrigger><TabsTrigger value="write_up">Write-Up</TabsTrigger><TabsTrigger value="submission">Submission</TabsTrigger><TabsTrigger value="email">Email</TabsTrigger></TabsList><span className={`save-state ${documentSaveState}`}>{saveLabel(documentSaveState)}</span></div>
            <TabsContent value="resume" className="document-scroll"><div className="document-actionbar"><span>Working resume · revision {activeCase.documents.resume.revision}</span><Button size="sm" variant="outline" disabled={pdfCapability?.status !== "available" || documentSaveState !== "saved"} onClick={() => setActionMessage(pdfCapability?.detail || "PDF builder is not connected.")}><FileText size={16} />Generate PDF</Button></div><ResumeEditor caseId={activeCase.id} data={resume} onChange={(data) => { setResume(data); scheduleDocumentSave("resume", data); }} /></TabsContent>
            <TabsContent value="write_up" className="document-scroll"><DocumentHeading title="Internal recruiter write-up" note="Classification, fit, responsibilities, logistics, risks, missing information, and next step." /><Textarea className="document-textarea" value={writeUp} onChange={(event) => { setWriteUp(event.target.value); scheduleDocumentSave("write_up", event.target.value); }} placeholder="Build the source-grounded internal assessment here." /></TabsContent>
            <TabsContent value="submission" className="document-scroll"><DocumentHeading title="Client submission" note={`${internalUnconfirmed} fact${internalUnconfirmed === 1 ? "" : "s"} still require confirmation. Unknown client-facing fields remain blank.`} /><SubmissionForm value={submission} onChange={(next) => { setSubmission(next); scheduleDocumentSave("submission", next); }} /></TabsContent>
            <TabsContent value="email" className="document-scroll"><DocumentHeading title="Presentation email draft" note="Editable draft only. No send action is available in this workstation." /><Textarea className="document-textarea email-editor" value={email} onChange={(event) => { setEmail(event.target.value); scheduleDocumentSave("email", event.target.value); }} placeholder="Prepare the short presentation email from confirmed facts and the approved submission." /></TabsContent>
          </Tabs> : <div className="document-empty"><FileText size={34} /><h2>Open a candidate case</h2><p>Select a role and candidate. The resume, write-up, submission, and email stay together here.</p></div>}
        </section>
      </section>

      <section className="assistant-strip" aria-label="Recruiter assistant guidance">
        <AssistantItem icon={AlertTriangle} label="Missing" text={assistant.missing.join("; ") || "No missing fields recorded."} tone="gold" />
        <AssistantItem icon={MessageCircleQuestion} label="Ask next" text={assistant.askNext[0] || "No question suggested yet."} />
        <AssistantItem icon={FileText} label="Fit/concern" text={assistant.fitConcern} />
        <AssistantItem icon={Check} label="Next action" text={assistant.nextAction} tone="green" />
      </section>

      <section className="action-bar" aria-label="Candidate case actions">
        <Button disabled={!activeCase} onClick={() => setActionMessage(activeCase ? "Review is read-only. A connected recruiter adapter is required for evidence-based evaluation." : "Open a case first.")}><SearchCheck size={18} />Review</Button>
        <Button variant="outline" disabled={!activeCase} onClick={() => setActionMessage(assistant.askNext.join("\n") || "No material questions are available until sources are attached.")}><CircleHelp size={18} />Questions</Button>
        <Button variant="outline" disabled={!activeCase} onClick={() => setActionMessage("Pitch Candidate is reserved for Phase 2. No research or outreach ran.")}><Send size={18} />Pitch Candidate</Button>
        <Button className="gold-button" disabled={!activeCase} onClick={() => setUpdateOpen(true)}><RefreshCw size={18} />Update</Button>
        <output className="action-message" aria-live="polite">{actionMessage}</output>
      </section>

      <Dialog open={Boolean(creationMode)} onOpenChange={(open) => { if (!open) setCreationMode(null); }}><DialogContent><DialogHeader><DialogTitle>{creationMode === "role" ? "Add role" : "Add candidate"}</DialogTitle><DialogDescription>This creates an internal workstation record only. It does not create a Loxo or Tracker record.</DialogDescription></DialogHeader><div className="dialog-fields"><label>{creationMode === "role" ? "Role title" : "Candidate name"}<Input value={creationPrimary} onChange={(event) => setCreationPrimary(event.target.value)} /></label><label>{creationMode === "role" ? "Client or company" : "Current title"}<Input value={creationSecondary} onChange={(event) => setCreationSecondary(event.target.value)} /></label></div><DialogFooter><Button variant="outline" onClick={() => setCreationMode(null)}>Cancel</Button><Button onClick={() => void submitCreation()} disabled={!creationPrimary.trim()}>Add</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}><DialogContent><DialogHeader><DialogTitle>Paste source text</DialogTitle><DialogDescription>The original text is stored as an immutable source attachment for this candidate case.</DialogDescription></DialogHeader><Textarea value={pastedSource} onChange={(event) => setPastedSource(event.target.value)} placeholder="Paste transcript, notes, or source text exactly as received." className="paste-source-textarea" /><DialogFooter><Button variant="outline" onClick={() => setPasteOpen(false)}>Cancel</Button><Button disabled={!activeCase || !pastedSource.trim()} onClick={() => { if (!activeCase || !pastedSource.trim()) return; const file = new File([pastedSource], `pasted-source-${new Date().toISOString().replaceAll(":", "-")}.txt`, { type: "text/plain" }); setPasteOpen(false); setPastedSource(""); void uploadSource("pasted_text", file); }}>Save source</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={updateOpen} onOpenChange={setUpdateOpen}><DialogContent><DialogHeader><DialogTitle>External update preview</DialogTitle><DialogDescription>No external changes have been prepared. Connected host adapters must provide a field-level preview before approval.</DialogDescription></DialogHeader><div className="connector-list">{externalCapabilities.map((capability) => <div key={capability.id}><strong>{capability.label}</strong><span className={`connector-status ${capability.status}`}>{capability.status.replace("_", " ")}</span><p>{capability.detail}</p></div>)}</div><DialogFooter><Button variant="outline" onClick={() => setUpdateOpen(false)}>Cancel</Button><Button disabled>Approve updates</Button></DialogFooter></DialogContent></Dialog>
    </main>
  );
}

function ContextSelect({ label, value, onChange, onAdd, disabled, children }: { label: string; value: string; onChange: (value: string) => void; onAdd: () => void; disabled: boolean; children: React.ReactNode }) {
  return <div className="context-control"><span>{label}</span><div className="context-select-row"><div className="select-wrap"><select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>{children}</select><ChevronDown size={16} /></div><Button size="icon" variant="outline" onClick={onAdd} aria-label={`Add ${label.toLowerCase()}`}><Plus size={18} /></Button></div></div>;
}

function DocumentHeading({ title, note }: { title: string; note: string }) {
  return <div className="document-heading"><h2>{title}</h2><p>{note}</p></div>;
}

function AssistantItem({ icon: Icon, label, text, tone = "neutral" }: { icon: typeof AlertTriangle; label: string; text: string; tone?: string }) {
  return <div className={`assistant-item ${tone}`}><span className="assistant-icon"><Icon size={20} /></span><div><strong>{label}</strong><p>{text}</p></div></div>;
}

function SubmissionForm({ value, onChange }: { value: SubmissionDocument; onChange: (value: SubmissionDocument) => void }) {
  const fields: Array<[keyof SubmissionDocument, string]> = [
    ["name", "Name"], ["title", "Title"], ["compensationTarget", "Compensation Target"],
    ["currentCompensation", "Current Compensation"], ["vacation", "Vacation"], ["location", "Location"],
    ["workStatus", "Work Status"], ["interviewAvailability", "Interview Availability"],
    ["startDateNotice", "Start Date/Notice"], ["reasonForLeaving", "Reason for Leaving"],
  ];
  return <div className="submission-form">{fields.map(([key, label]) => <label key={key}>{label}<Input value={value[key]} placeholder="Not confirmed" onChange={(event) => onChange({ ...value, [key]: event.target.value })} /></label>)}<label className="wide">Profile Summary<Textarea value={value.profileSummary} onChange={(event) => onChange({ ...value, profileSummary: event.target.value })} placeholder="Concise, role-relevant, and sourced." /></label></div>;
}
