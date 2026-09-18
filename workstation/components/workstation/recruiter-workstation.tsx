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
  Paperclip,
  Play,
  Plus,
  UploadCloud,
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
import { Textarea } from "@/components/ui/textarea";
import { workstationApi } from "@/lib/api-client";
import { mergeCandidateCaseSnapshots } from "@/lib/case-merge";
import {
  EMPTY_RESUME,
  EMPTY_SUBMISSION,
  STORED_DOCUMENT_KINDS,
  type CandidateCase,
  type CandidateRecord,
  type CaseDocument,
  type CaseSource,
  type ConnectorCapability,
  type RoleRecord,
  type SaveState,
  type SourceKind,
  type StoredDocumentKind,
  type SubmissionDocument,
} from "@/lib/workstation-types";

type User = { id: string; displayName: string };
type CreationMode = "role" | "candidate" | null;
type ResumeMode = "named_submission" | "internal_mpc" | "external_blind_mpc";
type WriteUpMode = "candidate_submission" | "full_package";

const FONT_OPTIONS = ["System", "Avenir Next", "Georgia", "Bradley Hand", "Times New Roman"];
const SIZE_OPTIONS = [16, 18, 20, 22, 24];
const SOURCE_ACTIONS = [
  { kind: "resume", label: "Resume", accept: ".pdf,.doc,.docx,.txt,.md", icon: FileText },
  { kind: "transcript", label: "Transcript", accept: ".pdf,.doc,.docx,.txt,.md", icon: FileText },
  { kind: "job_description", label: "Job description", accept: ".pdf,.doc,.docx,.txt,.md", icon: Paperclip },
  { kind: "call_notes", label: "Call notes", accept: ".txt,.md", icon: Paperclip },
] as const;
const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  job_description: "Job description",
  resume: "Resume",
  transcript: "Transcript",
  call_notes: "Call notes",
  pasted_text: "Pasted text",
  other: "Other",
};
const SOURCE_ACCEPT = ".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg";

function saveLabel(state: SaveState) {
  return { saved: "Saved", saving: "Saving", unsaved: "Unsaved", failed: "Save failed" }[state];
}

function contentAsString(document: CaseDocument | undefined) {
  return typeof document?.content === "string" ? document.content : "";
}

function submissionHasContent(value: SubmissionDocument) {
  return Object.values(value).some((field) => field.trim().length > 0);
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
  const [submission, setSubmission] = useState<SubmissionDocument>({ ...EMPTY_SUBMISSION });
  const [actionMessage, setActionMessage] = useState("");
  const [brandOpen, setBrandOpen] = useState(false);
  const [resumeMode, setResumeMode] = useState<ResumeMode>("named_submission");
  const [writeUpOpen, setWriteUpOpen] = useState(false);
  const [writeUpMode, setWriteUpMode] = useState<WriteUpMode>("candidate_submission");
  const [resumeSourceId, setResumeSourceId] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pastedSource, setPastedSource] = useState("");
  const [pastedSourceKind, setPastedSourceKind] = useState<SourceKind>("call_notes");
  const [sourceBusy, setSourceBusy] = useState(false);
  const [sourcePanelOpen, setSourcePanelOpen] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [sourceReviewKinds, setSourceReviewKinds] = useState<Record<string, SourceKind>>({});
  const caseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const documentTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const multiFileInput = useRef<HTMLInputElement | null>(null);
  const activeCaseRef = useRef<CandidateCase | null>(null);
  const caseDraftRef = useRef({ notes: "", notesFont: "System", notesSize: 20, status: "active" });
  const caseEditVersionRef = useRef(0);
  const caseSavePromiseRef = useRef<Promise<boolean> | null>(null);
  const documentDraftRef = useRef<Record<StoredDocumentKind, CaseDocument["content"]>>({
    resume: EMPTY_RESUME,
    write_up: "",
    submission: { ...EMPTY_SUBMISSION },
    email: "",
    loxo_update: "",
  });
  const documentVersionRef = useRef<Record<StoredDocumentKind, number>>({ resume: 0, write_up: 0, submission: 0, email: 0, loxo_update: 0 });
  const documentSavedVersionRef = useRef<Record<StoredDocumentKind, number>>({ resume: 0, write_up: 0, submission: 0, email: 0, loxo_update: 0 });
  const documentSavePromisesRef = useRef<Partial<Record<StoredDocumentKind, Promise<boolean>>>>({});

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
    setSubmission(contentAsSubmission(next.documents.submission));
    const resumeSources = next.sources
      .filter((source) => source.kind === "resume")
      .sort((left, right) => right.captureTime.localeCompare(left.captureTime));
    setResumeSourceId(resumeSources[0]?.id ?? "");
    caseDraftRef.current = { notes: next.notes, notesFont: next.notesFont, notesSize: next.notesSize, status: next.status };
    caseEditVersionRef.current = 0;
    documentDraftRef.current = {
      resume: contentAsResume(next.documents.resume),
      write_up: contentAsString(next.documents.write_up),
      submission: contentAsSubmission(next.documents.submission),
      email: contentAsString(next.documents.email),
      loxo_update: contentAsString(next.documents.loxo_update),
    };
    documentVersionRef.current = { resume: 0, write_up: 0, submission: 0, email: 0, loxo_update: 0 };
    documentSavedVersionRef.current = { resume: 0, write_up: 0, submission: 0, email: 0, loxo_update: 0 };
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

  const persistDocument = useCallback(async (kind: StoredDocumentKind) => {
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
            const allSaved = STORED_DOCUMENT_KINDS.every(
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
    const dirtyKinds = STORED_DOCUMENT_KINDS.filter(
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

  const scheduleDocumentSave = useCallback((kind: StoredDocumentKind, content: CaseDocument["content"]) => {
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

  const uploadSources = async (files: readonly File[], kinds: readonly SourceKind[] = []) => {
    if (!activeCase || files.length === 0 || sourceBusy) return;
    if (caseSaveState !== "saved" && !(await persistCase())) return;
    if (documentSaveState !== "saved" && !(await flushDocuments())) return;
    setSourceBusy(true);
    setActionMessage(`Uploading ${files.length} source${files.length === 1 ? "" : "s"}...`);
    try {
      const next = await workstationApi.uploadSources(activeCase.id, files, kinds);
      replaceCase(next);
      setActionMessage(`${files.length} immutable source${files.length === 1 ? "" : "s"} added. Review the status below.`);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "The source could not be uploaded.");
    } finally {
      setSourceBusy(false);
    }
  };

  const reviewSource = async (sourceId: string, kind?: SourceKind) => {
    if (!activeCase || sourceBusy) return;
    setSourceBusy(true);
    setActionMessage("Saving source review...");
    try {
      const next = await workstationApi.reviewSource(activeCase.id, sourceId, kind);
      replaceCase(next);
      setActionMessage("Source classification reviewed and saved.");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "The source review could not be saved.");
    } finally {
      setSourceBusy(false);
    }
  };

  const assistant = activeCase?.assistant || {
    missing: ["Select a role and candidate to start."],
    askNext: [],
    fitConcern: "No candidate case is open.",
    nextAction: "Choose the current role and candidate.",
  };
  const pdfCapability = connectors.find((item) => item.id === "pdf");
  const unreviewedSourceCount = activeCase?.sources.filter((source) => source.lifecycleStatus !== "reviewed").length ?? 0;
  const questionMessage = !activeCase?.sources.length
    ? "Add the resume and call notes first. Add a JD only when you want a role-focused submission."
    : unreviewedSourceCount > 0
      ? `Review ${unreviewedSourceCount} source${unreviewedSourceCount === 1 ? "" : "s"} before an evidence-based question set can run.`
      : assistant.askNext.join("\n") || "No material questions have been generated because the recruiter runtime is not connected.";

  const internalUnconfirmed = useMemo(() => {
    if (!activeCase) return 0;
    return activeCase.facts.filter((fact) => fact.status !== "confirmed").length;
  }, [activeCase]);

  const resumeSources = useMemo(
    () => activeCase?.sources
      .filter((source) => source.kind === "resume")
      .sort((left, right) => right.captureTime.localeCompare(left.captureTime)) ?? [],
    [activeCase],
  );
  const selectedResume = resumeSources.find((source) => source.id === resumeSourceId) ?? resumeSources[0] ?? null;
  const resumeSourceUrl = activeCase && selectedResume
    ? `/api/cases/${activeCase.id}/sources/${selectedResume.id}?inline=1`
    : "";
  const hasSavedWriteUp = submissionHasContent(submission);

  const resumeReadinessMessage = (purpose: "brand" | "write_up") => {
    if (!activeCase) return "Select a role and candidate first.";
    if (!selectedResume) return "Add the candidate's resume first.";
    if (selectedResume.lifecycleStatus !== "reviewed") {
      return `Confirm ${selectedResume.filename} as the current resume in Sources first.`;
    }
    if (!selectedResume.parsedText) {
      return `${selectedResume.filename} is stored and viewable, but the recruiter parser must read it before ${purpose === "brand" ? "branding" : "writing the candidate up"}.`;
    }
    if (purpose === "write_up") {
      if (caseSaveState !== "saved") return "Wait for Notes to show Saved before writing the candidate up.";
      const reviewedCallSource = activeCase.sources.some((source) =>
        (source.kind === "call_notes" || source.kind === "transcript") &&
        source.lifecycleStatus === "reviewed" &&
        Boolean(source.parsedText?.trim()),
      );
      if (!notes.trim() && !reviewedCallSource) return "Add your call notes or a reviewed transcript before writing the candidate up.";
      if (writeUpMode === "full_package") {
        const reviewedJobDescription = activeCase.sources.some((source) =>
          source.kind === "job_description" &&
          source.lifecycleStatus === "reviewed" &&
          Boolean(source.parsedText?.trim()),
        );
        if (!reviewedJobDescription) return "Add and confirm a readable job description for the full after-call package, or choose Candidate submission draft.";
      }
      return writeUpMode === "full_package"
        ? "Sources are ready for the repository-defined full package. Generation still needs the authenticated recruiter runtime."
        : "Resume and call notes are ready for a candidate submission draft. Generation still needs the authenticated recruiter runtime.";
    }
    const selectedMode = {
      named_submission: "Named submission",
      internal_mpc: "Internal-team MPC",
      external_blind_mpc: "External-client blind MPC",
    }[resumeMode];
    return pdfCapability?.status === "available"
      ? `${selectedMode} is selected and the resume source is ready.`
      : `${selectedMode} is selected and the resume source is ready. Branding still needs the recruiter PDF connection.`;
  };

  const openBrandResume = () => {
    setActionMessage(resumeReadinessMessage("brand"));
    setBrandOpen(true);
  };
  const openCandidateWriteUp = () => {
    setActionMessage(resumeReadinessMessage("write_up"));
    setWriteUpOpen(true);
  };

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
      </section>

      {pageError ? <div className="error-banner"><AlertTriangle size={17} />{pageError}<Button size="sm" variant="outline" onClick={() => { setLoading(true); setPageError(""); void loadWorkspace(); }}>Retry</Button></div> : null}

      <section className="desk-grid">
        <section className="notes-pane" aria-label="Apple Pencil and typed notes">
          <div className="pane-toolbar notes-toolbar"><div><h2>Notes</h2><span className={`save-state ${caseSaveState}`}>{saveLabel(caseSaveState)}</span></div><div className="notes-controls"><label>Font<select value={notesFont} disabled={!activeCase} onChange={(event) => { const notesFont = event.target.value; setNotesFont(notesFont); changeCaseDraft({ notesFont }); }}>{FONT_OPTIONS.map((font) => <option key={font}>{font}</option>)}</select></label><label>Size<select value={notesSize} disabled={!activeCase} onChange={(event) => { const notesSize = Number(event.target.value); setNotesSize(notesSize); changeCaseDraft({ notesSize }); }}>{SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}</select></label></div></div>
          <Textarea className="scribble-surface" aria-label="Candidate notes" disabled={!activeCase} value={notes} onChange={(event) => { const notes = event.target.value; setNotes(notes); changeCaseDraft({ notes }); }} placeholder={activeCase ? "Write with Apple Pencil Scribble or type your call notes." : "Select a role and candidate to open a private case."} style={{ fontFamily: notesFont === "System" ? "var(--font-ui)" : notesFont, fontSize: `${notesSize}px` }} />
          <div className="source-area">
            <button type="button" className="source-toggle" aria-expanded={sourcePanelOpen} onClick={() => setSourcePanelOpen((open) => !open)}>
              <span>Sources <strong>{activeCase?.sources.length ?? 0}</strong></span>
              <small>{sourcePanelOpen ? "Close sources" : "Add or review"}</small>
              <ChevronDown size={17} aria-hidden="true" />
            </button>
            {sourcePanelOpen ? <div className="source-panel-content">
              <input ref={multiFileInput} type="file" accept={SOURCE_ACCEPT} multiple hidden onChange={(event) => { const files = Array.from(event.target.files || []); void uploadSources(files); event.currentTarget.value = ""; }} />
              <button
                type="button"
                className={`source-dropzone${dropActive ? " is-dragging" : ""}`}
                disabled={!activeCase || sourceBusy}
                onClick={() => multiFileInput.current?.click()}
                onDragEnter={(event) => { event.preventDefault(); setDropActive(true); }}
                onDragOver={(event) => { event.preventDefault(); setDropActive(true); }}
                onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropActive(false); }}
                onDrop={(event) => { event.preventDefault(); setDropActive(false); void uploadSources(Array.from(event.dataTransfer.files)); }}
              >
                <UploadCloud size={22} aria-hidden="true" />
                <span><strong>Drop resume, transcript, JD, and notes</strong><small>or tap to choose multiple files</small></span>
              </button>
              <div className="source-actions">{SOURCE_ACTIONS.map(({ kind, label, accept, icon: Icon }) => <div key={kind}><input ref={(node) => { fileInputs.current[kind] = node; }} type="file" accept={accept} hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadSources([file], [kind]); event.currentTarget.value = ""; }} /><Button size="sm" variant="outline" disabled={!activeCase || sourceBusy} onClick={() => fileInputs.current[kind]?.click()}><Icon size={15} aria-hidden="true" />{label}</Button></div>)}<Button size="sm" variant="outline" disabled={!activeCase || sourceBusy} onClick={() => setPasteOpen(true)}><Link2 size={15} aria-hidden="true" />Paste</Button></div>
              <div className="source-summary" aria-label="Attached source status">{activeCase?.sources.length ? activeCase.sources.map((source) => {
              const needsClassification = source.lifecycleStatus === "parsed" && source.classificationMethod === "uncertain";
              const reviewKind = sourceReviewKinds[source.id] || (source.kind === "other" ? "call_notes" : source.kind);
              return <div className="source-row" key={source.id}>
                <div className="source-row-copy"><strong title={source.filename}>{source.filename}</strong><span>{SOURCE_KIND_LABELS[source.kind]}</span></div>
                <span className={`source-status ${source.lifecycleStatus}`}>{source.lifecycleStatus}</span>
                {needsClassification ? <select aria-label={`Classify ${source.filename}`} value={reviewKind} onChange={(event) => setSourceReviewKinds((current) => ({ ...current, [source.id]: event.target.value as SourceKind }))}>{(["resume", "transcript", "job_description", "call_notes"] as SourceKind[]).map((kind) => <option key={kind} value={kind}>{SOURCE_KIND_LABELS[kind]}</option>)}</select> : null}
                {source.lifecycleStatus === "classified" || needsClassification ? <Button size="sm" variant="outline" disabled={sourceBusy} onClick={() => void reviewSource(source.id, needsClassification ? reviewKind : undefined)}>Confirm</Button> : null}
                {source.lifecycleStatus === "uploaded" ? <small>Parser pending</small> : null}
              </div>;
              }) : <span>No sources attached.</span>}</div>
            </div> : null}
          </div>
        </section>

        <section className="document-pane" aria-label="Candidate resume reference">
          {activeCase ? <>
            <div className="pane-toolbar resume-toolbar">
              <div><h2>Resume</h2>{selectedResume ? <span className={`source-status ${selectedResume.lifecycleStatus}`}>{selectedResume.lifecycleStatus}</span> : null}</div>
              <div className="resume-toolbar-actions">
                {resumeSources.length > 1 ? <label>Resume<select aria-label="Resume to view" value={selectedResume?.id ?? ""} onChange={(event) => setResumeSourceId(event.target.value)}>{resumeSources.map((source) => <option key={source.id} value={source.id}>{source.filename}</option>)}</select></label> : null}
                {resumeSourceUrl ? <Button asChild size="sm" variant="outline"><a href={resumeSourceUrl} target="_blank" rel="noreferrer">Open</a></Button> : null}
                <Button size="sm" className="gold-button" onClick={openBrandResume}><FileText size={16} />Brand resume</Button>
              </div>
            </div>
            <ResumeSourcePreview source={selectedResume} sourceUrl={resumeSourceUrl} />
          </> : <div className="document-empty"><FileText size={34} /><h2>Open a candidate case</h2><p>Select a role and candidate. The attached resume stays visible while you take notes.</p></div>}
        </section>
      </section>

      <section className="action-bar" aria-label="Candidate case actions">
        <Button disabled={!activeCase} onClick={openCandidateWriteUp}><Play size={18} aria-hidden="true" />{hasSavedWriteUp ? "Review write-up" : "Write up candidate"}</Button>
        <Button variant="outline" disabled={!activeCase} onClick={() => setActionMessage(questionMessage)}><CircleHelp size={18} aria-hidden="true" />Questions</Button>
        <output className="action-message" aria-live="polite">{actionMessage}</output>
      </section>

      <Dialog open={Boolean(creationMode)} onOpenChange={(open) => { if (!open) setCreationMode(null); }}><DialogContent><DialogHeader><DialogTitle>{creationMode === "role" ? "Add role" : "Add candidate"}</DialogTitle><DialogDescription>This creates an internal workstation record only. It does not create a Loxo or Tracker record.</DialogDescription></DialogHeader><div className="dialog-fields"><label>{creationMode === "role" ? "Role title" : "Candidate name"}<Input value={creationPrimary} onChange={(event) => setCreationPrimary(event.target.value)} /></label><label>{creationMode === "role" ? "Client or company" : "Current title"}<Input value={creationSecondary} onChange={(event) => setCreationSecondary(event.target.value)} /></label></div><DialogFooter><Button variant="outline" onClick={() => setCreationMode(null)}>Cancel</Button><Button onClick={() => void submitCreation()} disabled={!creationPrimary.trim()}>Add</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}><DialogContent><DialogHeader><DialogTitle>Paste source text</DialogTitle><DialogDescription>The original text is stored as an immutable source attachment for this candidate case.</DialogDescription></DialogHeader><label className="paste-kind">Source type<select value={pastedSourceKind} onChange={(event) => setPastedSourceKind(event.target.value as SourceKind)}><option value="call_notes">Call notes</option><option value="transcript">Transcript</option><option value="job_description">Job description</option><option value="resume">Resume</option><option value="pasted_text">Other pasted text</option></select></label><Textarea value={pastedSource} onChange={(event) => setPastedSource(event.target.value)} placeholder="Paste transcript, notes, or source text exactly as received." className="paste-source-textarea" /><DialogFooter><Button variant="outline" onClick={() => setPasteOpen(false)}>Cancel</Button><Button disabled={!activeCase || !pastedSource.trim() || sourceBusy} onClick={() => { if (!activeCase || !pastedSource.trim()) return; const file = new File([pastedSource], `pasted-${pastedSourceKind}-${new Date().toISOString().replaceAll(":", "-")}.txt`, { type: "text/plain" }); setPasteOpen(false); setPastedSource(""); void uploadSources([file], [pastedSourceKind]); }}>Save source</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={brandOpen} onOpenChange={setBrandOpen}><DialogContent className="writeup-dialog"><DialogHeader><DialogTitle>Brand resume</DialogTitle><DialogDescription>Choose the presentation mode defined by the recruitment-skills repository.</DialogDescription></DialogHeader><div className="writeup-mode-options" aria-label="Branded resume presentation mode"><button type="button" aria-pressed={resumeMode === "named_submission"} onClick={() => setResumeMode("named_submission")}><strong>Named submission</strong><span>Candidate name and real employers</span></button><button type="button" aria-pressed={resumeMode === "internal_mpc"} onClick={() => setResumeMode("internal_mpc")}><strong>Internal-team MPC</strong><span>Candidate name and real employers</span></button><button type="button" aria-pressed={resumeMode === "external_blind_mpc"} onClick={() => setResumeMode("external_blind_mpc")}><strong>External-client blind MPC</strong><span>No name, contact details, or real employer names</span></button></div><div className="writeup-readiness">{resumeReadinessMessage("brand")}</div><DialogFooter><Button onClick={() => setBrandOpen(false)}>Done</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={writeUpOpen} onOpenChange={setWriteUpOpen}><DialogContent className="writeup-dialog"><DialogHeader><DialogTitle>Candidate write-up</DialogTitle><DialogDescription>{hasSavedWriteUp ? "Review the saved candidate submission. Unknown facts remain blank." : "Choose an output set defined by the recruitment-skills repository. Every output stays source-grounded."}</DialogDescription></DialogHeader><div className="writeup-mode-options" aria-label="Candidate write-up output set"><button type="button" aria-pressed={writeUpMode === "candidate_submission"} onClick={() => setWriteUpMode("candidate_submission")}><strong>Candidate submission draft</strong><span>Submission-style write-up only</span></button><button type="button" aria-pressed={writeUpMode === "full_package"} onClick={() => setWriteUpMode("full_package")}><strong>Full after-call package</strong><span>Branded resume, submission, email draft, and Loxo bullets</span></button></div><div className="writeup-readiness">{resumeReadinessMessage("write_up")}</div><div className="writeup-dialog-body"><SubmissionForm value={submission} onChange={(next) => { setSubmission(next); scheduleDocumentSave("submission", next); }} /></div><DialogFooter><span className={`save-state ${documentSaveState}`}>{saveLabel(documentSaveState)} · {internalUnconfirmed} unconfirmed fact{internalUnconfirmed === 1 ? "" : "s"}</span><Button onClick={() => setWriteUpOpen(false)}>Done</Button></DialogFooter></DialogContent></Dialog>
    </main>
  );
}

function ContextSelect({ label, value, onChange, onAdd, disabled, children }: { label: string; value: string; onChange: (value: string) => void; onAdd: () => void; disabled: boolean; children: React.ReactNode }) {
  return <div className="context-control"><span>{label}</span><div className="context-select-row"><div className="select-wrap"><select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>{children}</select><ChevronDown size={16} /></div><Button size="icon" variant="outline" onClick={onAdd} aria-label={`Add ${label.toLowerCase()}`}><Plus size={18} /></Button></div></div>;
}

function ResumeSourcePreview({ source, sourceUrl }: { source: CaseSource | null; sourceUrl: string }) {
  if (!source) return <div className="document-empty"><FileText size={34} /><h2>Add the candidate&apos;s resume</h2><p>It will stay here for quick reference while you write call notes.</p></div>;
  if (source.contentType === "application/pdf") return <iframe className="resume-source-frame" src={sourceUrl} title={`${source.filename} resume preview`} />;
  if (source.contentType.startsWith("image/")) {
    return <div className="resume-source-scroll">
      {/* eslint-disable-next-line @next/next/no-img-element -- protected source blobs cannot use the public optimizer */}
      <img className="resume-source-image" src={sourceUrl} alt={`${source.filename} resume preview`} />
    </div>;
  }
  if (source.parsedText) return <div className="resume-source-scroll"><pre className="resume-source-text">{source.parsedText}</pre></div>;
  return <div className="document-empty"><FileText size={34} /><h2>{source.filename}</h2><p>This file is safely attached, but this format cannot be previewed inside the workstation yet.</p><Button asChild variant="outline"><a href={sourceUrl} target="_blank" rel="noreferrer">Open resume</a></Button></div>;
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
