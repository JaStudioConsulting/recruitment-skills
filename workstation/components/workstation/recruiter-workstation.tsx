"use client";

import {
  AlertTriangle,
  BookOpen,
  Edit3,
  FileText,
  FolderOpen,
  History,
  LoaderCircle,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Plus,
  Search,
  Trash2,
  Type,
  Upload,
  UploadCloud,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { HandwritingCanvas } from "@/components/workstation/handwriting-canvas";
import { ResumeFormEditor } from "@/components/workstation/resume-form";
import { WorkflowBrowser, type WorkflowExecutionFeedback } from "@/components/workstation/workflow-browser";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { workstationApi } from "@/lib/api-client";
import type {
  ArtifactVisualQaReview,
  CaseArtifactSummary,
} from "@/lib/artifact-browser";
import { mergeCandidateCaseSnapshots } from "@/lib/case-merge";
import { toResumeForm } from "@/lib/resume-form";
import type { CapabilityExecutionResponse } from "@/lib/server/capability-execution-service";
import type { CapabilityRunRecord } from "@/lib/server/capability-run-repository";
import {
  EMPTY_SUBMISSION,
  type CandidateCase,
  type CandidateRecord,
  type CaseDocument,
  type CaseSource,
  type DocumentVersion,
  type JobSource,
  type RoleRecord,
  type SaveState,
  type SourceKind,
  type SourceReviewRequirement,
  type SubmissionDocument,
} from "@/lib/workstation-types";
import { jobIdentitiesMatch, proposePastedSource, type UploadedSourceProposal } from "@/lib/source-intake";

type User = { id: string; displayName: string };
type CreationMode = "role" | "candidate" | null;
type NotesMode = "type" | "draw";
type WorkspaceView = "work" | "sources";
type SourceTarget = "job" | "candidate" | "new_candidate";
type OutputKind = "resume" | "submission" | "email" | "loxo_update";
export type OutputVersionState = { caseId: string; kind: OutputKind; versions: DocumentVersion[] };
type OutputEditSession = {
  caseId: string;
  kind: OutputKind;
  expectedRevision: number;
  sourceRefs: string[];
  capabilityRunId: string | null;
};
type CandidateIntakeContext = { roleId: string; caseId: string | null };
type LatestRequestCounter = { current: number };

export function beginLatestRequest(counter: LatestRequestCounter) {
  counter.current += 1;
  return counter.current;
}

export function latestRequestIsCurrent(counter: LatestRequestCounter, token: number) {
  return counter.current === token;
}

export function candidateIntakeContextIsCurrent(
  originating: CandidateIntakeContext,
  current: CandidateIntakeContext,
) {
  return originating.roleId === current.roleId && originating.caseId === current.caseId;
}

export function outputEditIsBusy(outputEditBusy: boolean, sourceBusy: boolean) {
  return outputEditBusy || sourceBusy;
}

export async function prepareCandidateContextChange({
  outputEditActive,
  caseSaveState,
  persistCase,
}: {
  outputEditActive: boolean;
  caseSaveState: SaveState;
  persistCase: () => Promise<boolean>;
}) {
  if (outputEditActive) return "output_edit" as const;
  if (caseSaveState !== "saved" && !(await persistCase())) return "notes_save_failed" as const;
  return "ready" as const;
}

const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  job_description: "Job description",
  resume: "Resume",
  transcript: "Transcript",
  call_notes: "Call notes",
  pasted_text: "Pasted text",
  other: "Other",
};
const JOB_SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  ...SOURCE_KIND_LABELS,
  call_notes: "Client notes",
  pasted_text: "Instructions",
};
export const JOB_SOURCE_KIND_OPTIONS = ["job_description", "call_notes", "pasted_text", "other"] as const satisfies readonly SourceKind[];
export const CANDIDATE_SOURCE_KIND_OPTIONS = ["resume", "transcript", "job_description", "call_notes", "pasted_text", "other"] as const satisfies readonly SourceKind[];
const SOURCE_ACCEPT = ".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg";
const PREFILL_FIELD_LABELS: Partial<Record<keyof SubmissionDocument, string>> = {
  name: "Name",
  title: "Title",
  location: "Location",
  profileSummary: "Profile Summary",
};

export function SourceTypeCorrectionControls({
  source,
  editing,
  selectedKind,
  options,
  labels = SOURCE_KIND_LABELS,
  busy,
  onEdit,
  onKindChange,
  onSave,
  onCancel,
}: {
  source: CaseSource;
  editing: boolean;
  selectedKind: SourceKind;
  options: readonly SourceKind[];
  labels?: Record<SourceKind, string>;
  busy: boolean;
  onEdit: () => void;
  onKindChange: (kind: SourceKind) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  if (!source.parsedText?.trim() || source.lifecycleStatus === "uploaded") return null;
  if (!editing) {
    return <Button size="sm" variant="outline" disabled={busy} aria-label={`Edit type for ${source.filename}`} onClick={onEdit}>Edit type</Button>;
  }
  return <div className="source-type-correction">
    <select aria-label={`Source type for ${source.filename}`} value={selectedKind} disabled={busy} onChange={(event) => onKindChange(event.target.value as SourceKind)}>
      {options.map((kind) => <option key={kind} value={kind}>{labels[kind]}</option>)}
    </select>
    <Button size="sm" variant="outline" disabled={busy} aria-label={`Save type for ${source.filename}`} onClick={onSave}>Save</Button>
    <Button size="sm" variant="outline" disabled={busy} aria-label={`Cancel type edit for ${source.filename}`} onClick={onCancel}>Cancel</Button>
  </div>;
}

export function AssistantReviewRequiredNotice({
  requirements,
}: {
  requirements?: readonly SourceReviewRequirement[];
}) {
  if (!requirements?.length) return null;
  const reason = requirements[0].reason
    .replace(/\s*Open Generated\s*>\s*Submission\s*>\s*Edit\s*>\s*Save\.?\s*$/i, "")
    .trim();
  return <aside className="assistant-review-required" role="status">
    <strong>Submission review required</strong>
    <span>{reason ? `${reason} ` : ""}Open Generated &gt; Submission &gt; Edit &gt; Save.</span>
  </aside>;
}

function saveLabel(state: SaveState) {
  return { saved: "Saved", saving: "Saving", unsaved: "Unsaved", failed: "Save failed" }[state];
}

function contentAsSubmission(document: CaseDocument | undefined) {
  if (document?.content && typeof document.content === "object" && !Array.isArray(document.content) && !("blocks" in document.content)) {
    return { ...EMPTY_SUBMISSION, ...(document.content as SubmissionDocument) };
  }
  return { ...EMPTY_SUBMISSION };
}

export function mergePersistedDocuments(candidateCase: CandidateCase, documents: readonly CaseDocument[]) {
  const nextDocuments = { ...candidateCase.documents };
  for (const document of documents) nextDocuments[document.kind] = document;
  return { ...candidateCase, documents: nextDocuments };
}

export function mergeSavedOutputEdit(candidateCase: CandidateCase, document: CaseDocument) {
  const merged = mergePersistedDocuments(candidateCase, [document]);
  if (document.kind !== "submission") return merged;
  const assistant = { ...merged.assistant };
  delete assistant.reviewRequired;
  return { ...merged, assistant };
}

export function editSessionForCurrentDocument(
  candidateCase: CandidateCase,
  kind: OutputKind,
  versions: readonly DocumentVersion[],
): OutputEditSession | null {
  const current = candidateCase.documents[kind];
  const lineage = versions.find((version) => version.kind === kind && version.revision === current.revision);
  if (!lineage) return null;
  return {
    caseId: candidateCase.id,
    kind,
    expectedRevision: current.revision,
    sourceRefs: [...lineage.sourceRefs],
    capabilityRunId: lineage.capabilityRunId,
  };
}

export function outputVersionsForScope(
  state: OutputVersionState | null,
  caseId: string,
  kind: OutputKind,
) {
  return state?.caseId === caseId && state.kind === kind ? state.versions : [];
}

export function editSessionForScopedDocument(
  candidateCase: CandidateCase,
  kind: OutputKind,
  state: OutputVersionState | null,
) {
  return editSessionForCurrentDocument(
    candidateCase,
    kind,
    outputVersionsForScope(state, candidateCase.id, kind),
  );
}

export async function loadScopedDocumentVersions(
  listVersions: (caseId: string, kind: OutputKind) => Promise<DocumentVersion[]>,
  request: { caseId: string; kind: OutputKind },
  isCurrent: (request: { caseId: string; kind: OutputKind }) => boolean,
  commit: (state: OutputVersionState) => void,
) {
  let versions: DocumentVersion[] = [];
  try {
    versions = await listVersions(request.caseId, request.kind);
  } catch {
    versions = [];
  }
  const state = { ...request, versions } satisfies OutputVersionState;
  if (isCurrent(request)) commit(state);
  return state;
}

export function saveEditedOutput(
  saveDocument: typeof workstationApi.saveDocument,
  session: OutputEditSession,
  content: CaseDocument["content"],
) {
  return saveDocument(session.caseId, session.kind, {
    expectedRevision: session.expectedRevision,
    content,
    origin: "edited",
    sourceRefs: [...session.sourceRefs],
    capabilityRunId: session.capabilityRunId,
  });
}

export function loadCapabilityRunsForCase(
  listCapabilityRuns: typeof workstationApi.listCapabilityRuns,
  caseId: string,
) {
  return listCapabilityRuns(caseId);
}

export function loadCaseArtifactsForCase(
  listCaseArtifacts: typeof workstationApi.listCaseArtifacts,
  caseId: string,
) {
  return listCaseArtifacts(caseId);
}

export async function loadScopedCaseResource<T>(
  load: (caseId: string) => Promise<T>,
  caseId: string,
  requestCounter: LatestRequestCounter,
  isCurrentCase: (caseId: string) => boolean,
  handlers: {
    onStart: () => void;
    onSuccess: (value: T) => void;
    onError: (error: unknown) => void;
    onFinish: () => void;
  },
) {
  if (!isCurrentCase(caseId)) return null;
  const requestToken = beginLatestRequest(requestCounter);
  handlers.onStart();
  try {
    const value = await load(caseId);
    if (isCurrentCase(caseId) && latestRequestIsCurrent(requestCounter, requestToken)) {
      handlers.onSuccess(value);
    }
    return value;
  } catch (error) {
    if (isCurrentCase(caseId) && latestRequestIsCurrent(requestCounter, requestToken)) {
      handlers.onError(error);
    }
    return null;
  } finally {
    if (isCurrentCase(caseId) && latestRequestIsCurrent(requestCounter, requestToken)) {
      handlers.onFinish();
    }
  }
}

export function capabilityExecutionMessage(
  executed: CapabilityExecutionResponse,
  canonicalIncomplete: string,
) {
  if (executed.run.status === "awaiting_visual_qa") {
    return `${executed.reused ? "Existing branded PDF loaded." : "Branded PDF saved."} Open the exact PDF and complete human visual QA before this run can complete.`;
  }
  if (executed.run.status === "draft_ready") {
    const draftState = executed.reused
      ? "Existing draft outputs remain available as read-only previews."
      : "Draft outputs were saved as read-only previews.";
    return [draftState, canonicalIncomplete.trim()].filter(Boolean).join(" ");
  }
  if (executed.run.status === "completed") {
    return "Workflow completed with persisted evidence.";
  }
  return `Workflow finished with status ${executed.run.status.replaceAll("_", " ")}.`;
}

export async function reviewCaseArtifactAndRefresh(
  reviewCaseArtifact: typeof workstationApi.reviewCaseArtifact,
  refreshRuns: (caseId: string) => Promise<unknown>,
  refreshArtifacts: (caseId: string) => Promise<unknown>,
  caseId: string,
  artifactId: string,
  review: ArtifactVisualQaReview,
) {
  const result = await reviewCaseArtifact(caseId, artifactId, review);
  await Promise.all([refreshRuns(caseId), refreshArtifacts(caseId)]);
  return result;
}

export function RecruiterWorkstation({ user }: { user: User }) {
  void user;
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [candidates, setCandidates] = useState<CandidateRecord[]>([]);
  const [cases, setCases] = useState<CandidateCase[]>([]);
  const [jobSourcesByRoleId, setJobSourcesByRoleId] = useState<Record<string, JobSource[]>>({});
  const [roleId, setRoleId] = useState("");
  const [candidateId, setCandidateId] = useState("");
  const [activeCase, setActiveCase] = useState<CandidateCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [creationMode, setCreationMode] = useState<CreationMode>(null);
  const [creationPrimary, setCreationPrimary] = useState("");
  const [creationSecondary, setCreationSecondary] = useState("");
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("work");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [addSourcesOpen, setAddSourcesOpen] = useState(false);
  const [sourceTarget, setSourceTarget] = useState<SourceTarget>("job");
  const [notes, setNotes] = useState("");
  const [notesDrawingSvg, setNotesDrawingSvg] = useState("");
  const [notesMode, setNotesMode] = useState<NotesMode>("draw");
  const [notesFocused, setNotesFocused] = useState(false);
  const [notesFont, setNotesFont] = useState("System");
  const [notesSize, setNotesSize] = useState(20);
  const [caseStatus, setCaseStatus] = useState("active");
  const [caseSaveState, setCaseSaveState] = useState<SaveState>("saved");
  const [actionMessage, setActionMessage] = useState("");
  const [actionErrorMessage, setActionErrorMessage] = useState("");
  const [resumeView, setResumeView] = useState<"source" | "form">("source");
  const [resumeSourceId, setResumeSourceId] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteScope, setPasteScope] = useState<"job" | "candidate">("candidate");
  const [pastedSource, setPastedSource] = useState("");
  const [pastedJobTitle, setPastedJobTitle] = useState("");
  const [pastedJobClient, setPastedJobClient] = useState("");
  const [pastedCandidateName, setPastedCandidateName] = useState("");
  const [pastedCandidateTitle, setPastedCandidateTitle] = useState("");
  const [pastedCandidateExistingId, setPastedCandidateExistingId] = useState("");
  const [pastedKindOverride, setPastedKindOverride] = useState<SourceKind | "">("");
  const [pendingJobFile, setPendingJobFile] = useState<{ file: File; proposal: UploadedSourceProposal } | null>(null);
  const [pendingCandidateFile, setPendingCandidateFile] = useState<{ file: File; proposal: UploadedSourceProposal } | null>(null);
  const [intakeBusy, setIntakeBusy] = useState(false);
  const [sourceBusy, setSourceBusy] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [sourceReviewKinds, setSourceReviewKinds] = useState<Record<string, SourceKind>>({});
  const [sourceTypeEditId, setSourceTypeEditId] = useState<string | null>(null);
  const [splitRatio, setSplitRatio] = useState(55);
  const [outputKind, setOutputKind] = useState<OutputKind>("submission");
  const [outputDraft, setOutputDraft] = useState<CaseDocument["content"] | null>(null);
  const [outputEditSession, setOutputEditSession] = useState<OutputEditSession | null>(null);
  const [outputEditBusy, setOutputEditBusy] = useState(false);
  const [outputVersionState, setOutputVersionState] = useState<OutputVersionState | null>(null);
  const [packageBusy, setPackageBusy] = useState(false);
  const [workflowsOpen, setWorkflowsOpen] = useState(false);
  const [deleteRoleOpen, setDeleteRoleOpen] = useState(false);
  const [deleteRoleBusy, setDeleteRoleBusy] = useState(false);
  const [workflowExecutionFeedback, setWorkflowExecutionFeedback] = useState<WorkflowExecutionFeedback | null>(null);
  const [capabilityRuns, setCapabilityRuns] = useState<CapabilityRunRecord[]>([]);
  const [capabilityRunsLoading, setCapabilityRunsLoading] = useState(false);
  const [capabilityRunsError, setCapabilityRunsError] = useState("");
  const [caseArtifacts, setCaseArtifacts] = useState<CaseArtifactSummary[]>([]);
  const [caseArtifactsLoading, setCaseArtifactsLoading] = useState(false);
  const [caseArtifactsError, setCaseArtifactsError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const pastedProposal = useMemo(() => proposePastedSource(pastedSource), [pastedSource]);
  const effectivePastedProposal = pendingJobFile?.proposal ?? pendingCandidateFile?.proposal ?? pastedProposal;
  const effectivePastedKind = pastedKindOverride || effectivePastedProposal.kind;
  const deskGridRef = useRef<HTMLDivElement | null>(null);
  const caseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceComposerFileInput = useRef<HTMLInputElement | null>(null);
  const activeCaseRef = useRef<CandidateCase | null>(null);
  const roleIdRef = useRef(roleId);
  const outputKindRef = useRef<OutputKind>(outputKind);
  const caseSelectionRequestRef = useRef(0);
  const capabilityRunsRequestRef = useRef(0);
  const caseArtifactsRequestRef = useRef(0);
  const caseDraftRef = useRef({ notes: "", notesDrawingSvg: "", notesFont: "System", notesSize: 20, status: "active" });
  const caseEditVersionRef = useRef(0);
  const caseSavePromiseRef = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    roleIdRef.current = roleId;
  }, [roleId]);

  useEffect(() => {
    outputKindRef.current = outputKind;
  }, [outputKind]);

  const activeRole = roles.find((role) => role.id === roleId) ?? null;

  const clearActionFeedback = useCallback(() => {
    setActionErrorMessage("");
    setActionMessage("");
  }, []);

  const closeAddSourcesDialog = useCallback(() => {
    setAddSourcesOpen(false);
    setDropActive(false);
    clearActionFeedback();
  }, [clearActionFeedback]);

  const closeCreationDialog = useCallback(() => {
    setCreationMode(null);
    setCreationPrimary("");
    setCreationSecondary("");
    clearActionFeedback();
  }, [clearActionFeedback]);

  const closePasteDialog = useCallback(() => {
    setPasteOpen(false);
    setPastedSource("");
    setPastedJobTitle("");
    setPastedJobClient("");
    setPastedCandidateName("");
    setPastedCandidateTitle("");
    setPastedCandidateExistingId("");
    setPastedKindOverride("");
    setPendingJobFile(null);
    setPendingCandidateFile(null);
    clearActionFeedback();
  }, [clearActionFeedback]);

  const openCreationDialog = (mode: Exclude<CreationMode, null>) => {
    clearActionFeedback();
    setCreationPrimary("");
    setCreationSecondary("");
    setCreationMode(mode);
  };

  const showActionError = useCallback((error: unknown, fallback: string) => {
    const message = error instanceof Error ? error.message : fallback;
    setActionErrorMessage(message);
    setActionMessage(message);
  }, []);

  const storeCaseRecord = useCallback((next: CandidateCase) => {
    const merged = mergeCandidateCaseSnapshots(activeCaseRef.current, next);
    activeCaseRef.current = merged;
    setActiveCase(merged);
    setCases((current) => [merged, ...current.filter((item) => item.id !== merged.id)]);
  }, []);

  const cacheCaseRecord = useCallback((next: CandidateCase) => {
    setCases((current) => {
      const existing = current.find((item) => item.id === next.id) ?? null;
      const merged = mergeCandidateCaseSnapshots(existing, next);
      return [merged, ...current.filter((item) => item.id !== merged.id)];
    });
  }, []);

  const loadCapabilityRuns = useCallback(async (caseId: string) => {
    const runs = await loadScopedCaseResource(
      (activeCaseId) => loadCapabilityRunsForCase(workstationApi.listCapabilityRuns, activeCaseId),
      caseId,
      capabilityRunsRequestRef,
      (activeCaseId) => activeCaseRef.current?.id === activeCaseId,
      {
        onStart: () => { setCapabilityRunsLoading(true); setCapabilityRunsError(""); },
        onSuccess: setCapabilityRuns,
        onError: (error) => setCapabilityRunsError(error instanceof Error ? error.message : "Run history could not be loaded."),
        onFinish: () => setCapabilityRunsLoading(false),
      },
    );
    return runs ?? [];
  }, []);

  const loadCaseArtifacts = useCallback(async (caseId: string) => {
    const artifacts = await loadScopedCaseResource(
      (activeCaseId) => loadCaseArtifactsForCase(workstationApi.listCaseArtifacts, activeCaseId),
      caseId,
      caseArtifactsRequestRef,
      (activeCaseId) => activeCaseRef.current?.id === activeCaseId,
      {
        onStart: () => { setCaseArtifactsLoading(true); setCaseArtifactsError(""); },
        onSuccess: setCaseArtifacts,
        onError: (error) => setCaseArtifactsError(error instanceof Error ? error.message : "Persisted PDFs could not be loaded."),
        onFinish: () => setCaseArtifactsLoading(false),
      },
    );
    return artifacts ?? [];
  }, []);

  const openWorkflowsDialog = () => {
    clearActionFeedback();
    setWorkflowExecutionFeedback(null);
    setWorkflowsOpen(true);
    if (activeCaseRef.current) {
      void Promise.all([loadCapabilityRuns(activeCaseRef.current.id), loadCaseArtifacts(activeCaseRef.current.id)]);
    }
  };

  const replaceCase = useCallback((next: CandidateCase) => {
    storeCaseRecord(next);
    setNotes(next.notes);
    setNotesDrawingSvg(next.notesDrawingSvg);
    setNotesMode(next.notesDrawingSvg ? "draw" : next.notes.trim() ? "type" : "draw");
    setNotesFont(next.notesFont);
    setNotesSize(next.notesSize);
    setCaseStatus(next.status);
    setOutputDraft(null);
    setOutputEditSession(null);
    setOutputEditBusy(false);
    setOutputVersionState(null);
    setSourceTypeEditId(null);
    const resumeSources = next.sources
      .filter((source) => source.kind === "resume")
      .sort((left, right) => right.captureTime.localeCompare(left.captureTime));
    setResumeSourceId(resumeSources[0]?.id ?? "");
    caseDraftRef.current = { notes: next.notes, notesDrawingSvg: next.notesDrawingSvg, notesFont: next.notesFont, notesSize: next.notesSize, status: next.status };
    caseEditVersionRef.current = 0;
    setCaseSaveState("saved");
    setCapabilityRuns([]);
    setCapabilityRunsError("");
    setCaseArtifacts([]);
    setCaseArtifactsError("");
    void loadCapabilityRuns(next.id);
    void loadCaseArtifacts(next.id);
  }, [loadCapabilityRuns, loadCaseArtifacts, storeCaseRecord]);

  const loadWorkspace = useCallback(async () => {
    try {
      const payload = await workstationApi.load();
      setRoles(payload.roles);
      setCandidates(payload.candidates);
      setCases(payload.cases);
      setJobSourcesByRoleId(payload.jobSourcesByRoleId);
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
        showActionError(error, "Notes were not saved.");
        return false;
      }
    };

    const pending = run().finally(() => { caseSavePromiseRef.current = null; });
    caseSavePromiseRef.current = pending;
    return pending;
  }, [showActionError, storeCaseRecord]);

  useEffect(() => {
    if (!activeCase || caseEditVersionRef.current === 0) return;
    if (caseTimer.current) clearTimeout(caseTimer.current);
    caseTimer.current = setTimeout(() => void persistCase(), 750);
    return () => { if (caseTimer.current) clearTimeout(caseTimer.current); };
  }, [activeCase, notes, notesDrawingSvg, notesFont, notesSize, caseStatus, persistCase]);

  const openSelectedCase = useCallback(async (nextRoleId: string, nextCandidateId: string) => {
    const requestToken = beginLatestRequest(caseSelectionRequestRef);
    setWorkflowExecutionFeedback(null);
    if (outputEditSession || outputEditBusy) {
      if (latestRequestIsCurrent(caseSelectionRequestRef, requestToken)) {
        setLoading(false);
        setActionMessage("Save or cancel the current output edit before changing candidate cases.");
      }
      return;
    }
    if (caseSaveState !== "saved") {
      const saved = await persistCase();
      if (!saved || !latestRequestIsCurrent(caseSelectionRequestRef, requestToken)) return;
    }
    if (!nextRoleId || !nextCandidateId) {
      if (!latestRequestIsCurrent(caseSelectionRequestRef, requestToken)) return;
      if (caseTimer.current) clearTimeout(caseTimer.current);
      roleIdRef.current = nextRoleId;
      setRoleId(nextRoleId);
      setCandidateId(nextCandidateId);
      setCandidateSearch("");
      activeCaseRef.current = null;
      setActiveCase(null);
      setNotes("");
      setNotesDrawingSvg("");
      setNotesMode("draw");
      setNotesFont("System");
      setNotesSize(20);
      setCaseStatus("active");
      setCaseSaveState("saved");
      caseDraftRef.current = { notes: "", notesDrawingSvg: "", notesFont: "System", notesSize: 20, status: "active" };
      caseEditVersionRef.current = 0;
      setResumeView("source");
      setResumeSourceId("");
      setOutputDraft(null);
      setOutputEditSession(null);
      setOutputEditBusy(false);
      setOutputVersionState(null);
      setSourceTypeEditId(null);
      setCapabilityRuns([]);
      setCapabilityRunsError("");
      setCapabilityRunsLoading(false);
      setCaseArtifacts([]);
      setCaseArtifactsError("");
      setCaseArtifactsLoading(false);
      setLoading(false);
      clearActionFeedback();
      return;
    }
    setLoading(true);
    try {
      const existing = cases.find((item) => item.roleId === nextRoleId && item.candidateId === nextCandidateId);
      const next = existing || await workstationApi.openCase({ roleId: nextRoleId, candidateId: nextCandidateId });
      if (!latestRequestIsCurrent(caseSelectionRequestRef, requestToken)) return;
      roleIdRef.current = nextRoleId;
      setRoleId(nextRoleId);
      setCandidateId(nextCandidateId);
      replaceCase(next);
      clearActionFeedback();
    } catch (error) {
      if (latestRequestIsCurrent(caseSelectionRequestRef, requestToken)) {
        showActionError(error, "The candidate case could not open.");
      }
    } finally {
      if (latestRequestIsCurrent(caseSelectionRequestRef, requestToken)) setLoading(false);
    }
  }, [caseSaveState, cases, clearActionFeedback, outputEditBusy, outputEditSession, persistCase, replaceCase, showActionError]);

  const deleteSelectedRole = useCallback(async () => {
    if (!activeRole || deleteRoleBusy) return;
    setDeleteRoleBusy(true);
    try {
      if (caseTimer.current) clearTimeout(caseTimer.current);
      await workstationApi.deleteRole(activeRole.id);
      roleIdRef.current = "";
      setRoleId("");
      setCandidateId("");
      activeCaseRef.current = null;
      setActiveCase(null);
      setDeleteRoleOpen(false);
      await loadWorkspace();
      setActionMessage("Job deleted.");
    } catch (error) {
      showActionError(error, "The Job could not be deleted.");
    } finally {
      setDeleteRoleBusy(false);
    }
  }, [activeRole, deleteRoleBusy, loadWorkspace, showActionError]);

  const startResize = useCallback((event: React.PointerEvent) => {
    event.preventDefault();
    setIsDragging(true);
    const move = (pointer: PointerEvent) => {
      const grid = deskGridRef.current;
      if (!grid) return;
      const rect = grid.getBoundingClientRect();
      setSplitRatio(Math.min(75, Math.max(25, ((pointer.clientX - rect.left) / rect.width) * 100)));
    };
    const stop = () => {
      setIsDragging(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }, []);


  const submitCreation = async () => {
    if (outputEditSession || outputEditBusy) {
      setActionMessage("Save or cancel the current output edit before creating another record.");
      return;
    }
    if (!creationMode || !creationPrimary.trim() || (creationMode === "role" && !creationSecondary.trim())) return;
    try {
      if (creationMode === "role") {
        const created = await workstationApi.createRole({ title: creationPrimary.trim(), client: creationSecondary.trim() });
        setRoles((current) => current.some((role) => role.id === created.id) ? current : [created, ...current]);
        await openSelectedCase(created.id, "");
      } else {
        const created = await workstationApi.createCandidate({ name: creationPrimary.trim(), currentTitle: creationSecondary.trim() });
        setCandidates((current) => [created, ...current]);
        setCandidateId(created.id);
        if (roleId) await openSelectedCase(roleId, created.id);
      }
      closeCreationDialog();
    } catch (error) {
      showActionError(error, "The record could not be created.");
    }
  };

  const uploadSources = async (files: readonly File[], kinds: readonly SourceKind[] = []) => {
    if (outputEditSession || outputEditBusy) {
      setActionMessage("Save or cancel the current output edit before changing candidate sources.");
      return false;
    }
    if (!activeCase || files.length === 0 || sourceBusy) return false;
    const uploadCaseId = activeCase.id;
    const existingSourceIds = new Set(activeCase.sources.map((source) => source.id));
    if (caseSaveState !== "saved" && !(await persistCase())) return false;
    setSourceBusy(true);
    setActionMessage(`Uploading ${files.length} source${files.length === 1 ? "" : "s"}...`);
    try {
      const next = await workstationApi.uploadSources(uploadCaseId, files, kinds);
      if (activeCaseRef.current?.id === uploadCaseId) replaceCase(next);
      else cacheCaseRecord(next);
      const addedCount = next.sources.filter((source) => !existingSourceIds.has(source.id)).length;
      const reusedCount = Math.max(0, files.length - addedCount);
      setActionMessage(addedCount === 0
        ? `${files.length === 1 ? "This source is" : "These sources are"} already attached. The existing immutable source ${files.length === 1 ? "was" : "records were"} reused.`
        : `${addedCount} immutable source${addedCount === 1 ? "" : "s"} added${reusedCount ? `; ${reusedCount} duplicate${reusedCount === 1 ? " was" : "s were"} reused` : ""}.`);
      return true;
    } catch (error) {
      showActionError(error, "The source could not be uploaded.");
      return false;
    } finally {
      setSourceBusy(false);
    }
  };

  const clearSourceTypeEdit = (sourceId: string) => {
    setSourceTypeEditId((current) => current === sourceId ? null : current);
    setSourceReviewKinds((current) => {
      const next = { ...current };
      delete next[sourceId];
      return next;
    });
    clearActionFeedback();
  };

  const beginSourceTypeEdit = (source: CaseSource) => {
    clearActionFeedback();
    setSourceReviewKinds((current) => ({ ...current, [source.id]: source.kind }));
    setSourceTypeEditId(source.id);
  };

  const reviewSource = async (sourceId: string, kind?: SourceKind) => {
    if (outputEditSession || outputEditBusy) {
      setActionMessage("Save or cancel the current output edit before reviewing candidate sources.");
      return;
    }
    if (!activeCase || sourceBusy) return;
    const reviewCaseId = activeCase.id;
    setSourceBusy(true);
    setActionMessage("Saving source review...");
    try {
      if (caseSaveState !== "saved" && !(await persistCase())) return;
      const before = contentAsSubmission(activeCaseRef.current?.documents.submission);
      const next = await workstationApi.reviewSource(reviewCaseId, sourceId, kind);
      const after = contentAsSubmission(next.documents.submission);
      const filled = (Object.keys(PREFILL_FIELD_LABELS) as Array<keyof SubmissionDocument>)
        .filter((field) => !before[field].trim() && after[field].trim())
        .map((field) => PREFILL_FIELD_LABELS[field]);
      if (activeCaseRef.current?.id !== reviewCaseId) {
        cacheCaseRecord(next);
      } else {
        const hasLocalEdits = caseEditVersionRef.current > 0;
        if (hasLocalEdits) storeCaseRecord(next);
        else replaceCase(next);
      }
      setActionMessage(filled.length
        ? `Resume confirmed. Filled blank Candidate Write-up fields: ${filled.join(", ")}. Review before use.`
        : "Source classification reviewed. Existing Candidate Write-up fields were preserved.");
      clearSourceTypeEdit(sourceId);
    } catch (error) {
      showActionError(error, "The source review could not be saved.");
    } finally {
      setSourceBusy(false);
    }
  };

  const uploadJobSources = async (files: readonly File[], kinds: readonly SourceKind[] = [], targetRoleId = roleId) => {
    if (!targetRoleId || files.length === 0 || sourceBusy) return false;
    const existingSourceIds = new Set((jobSourcesByRoleId[targetRoleId] ?? []).map((source) => source.id));
    setSourceBusy(true);
    setActionMessage(`Adding ${files.length} source${files.length === 1 ? "" : "s"} to this Job...`);
    try {
      const next = await workstationApi.uploadJobSources(targetRoleId, files, kinds);
      setJobSourcesByRoleId((current) => ({ ...current, [targetRoleId]: next }));
      const addedSources = next.filter((source) => !existingSourceIds.has(source.id));
      const reusedCount = Math.max(0, files.length - addedSources.length);
      const uncertain = addedSources.filter((source) => source.lifecycleStatus === "parsed" && source.classificationMethod === "uncertain").length;
      setActionMessage(addedSources.length === 0
        ? `${files.length === 1 ? "This Job source is" : "These Job sources are"} already attached. The existing immutable source ${files.length === 1 ? "was" : "records were"} reused.`
        : uncertain
          ? `${addedSources.length} Job source${addedSources.length === 1 ? "" : "s"} added; ${uncertain} needs classification${reusedCount ? `, and ${reusedCount} duplicate${reusedCount === 1 ? " was" : "s were"} reused` : ""}.`
          : `${addedSources.length} Job source${addedSources.length === 1 ? "" : "s"} parsed and ready${reusedCount ? `; ${reusedCount} duplicate${reusedCount === 1 ? " was" : "s were"} reused` : ""}.`);
      return true;
    } catch (error) {
      showActionError(error, "The Job source could not be uploaded.");
      return false;
    } finally {
      setSourceBusy(false);
    }
  };

  const resolveJobFolder = async (title: string, client: string) => {
    if (!title.trim() || !client.trim()) {
      setActionMessage("A reviewed Job title and client or company are required before creating a Job folder.");
      return null;
    }
    const existing = roles.find((role) => jobIdentitiesMatch(role, { title, client }));
    if (existing) {
      setRoleId(existing.id);
      return existing.id;
    }
    try {
      const created = await workstationApi.createRole({ title, client });
      setRoles((current) => current.some((role) => role.id === created.id) ? current : [created, ...current]);
      setRoleId(created.id);
      return created.id;
    } catch (error) {
      showActionError(error, "The detected Job could not be created.");
      return null;
    }
  };

  const openPasteDialog = (scope: "job" | "candidate", target: SourceTarget = scope) => {
    clearActionFeedback();
    setSourceTarget(target);
    setPasteScope(scope);
    setPastedSource("");
    setPastedJobTitle("");
    setPastedJobClient("");
    setPastedCandidateName("");
    setPastedCandidateTitle("");
    setPastedCandidateExistingId("");
    setPastedKindOverride("");
    setPendingJobFile(null);
    setPendingCandidateFile(null);
    setPasteOpen(true);
  };

  const openAddSources = (target?: SourceTarget) => {
    clearActionFeedback();
    const resolvedTarget = target ?? (!roleId ? "job" : activeCase ? "candidate" : "new_candidate");
    setSourceTarget(resolvedTarget);
    setDropActive(false);
    setAddSourcesOpen(true);
  };

  const startNewJobFromSource = async () => {
    clearActionFeedback();
    if (outputEditSession || outputEditBusy) {
      setActionMessage("Save or cancel the current output edit before changing Jobs.");
      return;
    }
    if (caseSaveState !== "saved" && !(await persistCase())) return;
    await openSelectedCase("", "");
    openAddSources("job");
  };

  const intakeUnassignedJobFile = async (file: File) => {
    if (intakeBusy || sourceBusy) return;
    setIntakeBusy(true);
    setActionMessage("Reading the source and identifying its Job...");
    try {
      const proposal = await workstationApi.proposeSource(file);
      if (proposal.kind === "job_description" && proposal.job?.autoCreateEligible) {
        const targetRoleId = await resolveJobFolder(proposal.job.title, proposal.job.client);
        if (!targetRoleId) return;
        const saved = await uploadJobSources([file], ["job_description"], targetRoleId);
        if (saved && candidateId) await openSelectedCase(targetRoleId, candidateId);
        else if (saved) clearActionFeedback();
        return;
      }
      setPendingJobFile({ file, proposal });
      setPasteScope("job");
      setPastedSource(proposal.parsedText ?? "");
      setPastedJobTitle(proposal.job?.title ?? "");
      setPastedJobClient(proposal.job?.client ?? "");
      setPastedKindOverride("");
      setPasteOpen(true);
      setActionMessage("Review the detected Job identity before saving the original file.");
    } catch (error) {
      showActionError(error, "The Job source could not be inspected.");
    } finally {
      setIntakeBusy(false);
    }
  };

  const intakeUnassignedCandidateFile = async (file: File) => {
    if (!roleId) {
      setActionMessage("Choose or create a Job before adding a candidate source.");
      return;
    }
    if (intakeBusy || sourceBusy) return;
    setIntakeBusy(true);
    setActionMessage("");
    try {
      const proposal = await workstationApi.proposeSource(file);
      setPendingCandidateFile({ file, proposal });
      setPendingJobFile(null);
      setPasteScope("candidate");
      setSourceTarget("new_candidate");
      setPastedSource(proposal.parsedText ?? "");
      setPastedCandidateName(proposal.candidate?.name ?? "");
      setPastedCandidateTitle(proposal.candidate?.currentTitle ?? "");
      setPastedCandidateExistingId("");
      setPastedKindOverride("");
      setPasteOpen(true);
    } catch (error) {
      showActionError(error, "The candidate source could not be inspected.");
    } finally {
      setIntakeBusy(false);
    }
  };

  const handleSourceFiles = async (files: readonly File[]) => {
    if (!files.length) return;
    const needsJobIdentity = sourceTarget === "job" && !roleId;
    const needsCandidateIdentity = sourceTarget === "new_candidate" || (sourceTarget !== "job" && !activeCase);
    if (files.length > 1 && (needsJobIdentity || needsCandidateIdentity)) {
      showActionError(
        new Error(needsJobIdentity
          ? "Add one Job source first so the Job can be identified. Add the remaining files after the Job opens."
          : "Add one resume first so the candidate can be identified. Add the remaining files after the candidate opens."),
        "Add one source first, then attach the remaining files after its workspace opens.",
      );
      return;
    }
    closeAddSourcesDialog();
    if (sourceTarget === "job") {
      if (roleId) {
        if (await uploadJobSources(files)) clearActionFeedback();
      }
      else await intakeUnassignedJobFile(files[0]);
      return;
    }
    if (sourceTarget === "new_candidate" || !activeCase) {
      await intakeUnassignedCandidateFile(files[0]);
      return;
    }
    if (await uploadSources(files)) clearActionFeedback();
  };

  const savePastedSource = async () => {
    const text = pastedSource.trim();
    if ((!pendingJobFile && !pendingCandidateFile && !text) || sourceBusy) return;
    const file = pendingJobFile?.file ?? pendingCandidateFile?.file ?? new File([text], effectivePastedProposal.filename, { type: "text/plain" });

    if (pasteScope === "candidate") {
      if (sourceTarget === "new_candidate" || !activeCase) {
        const creatingFromResume = effectivePastedKind === "resume";
        if (!roleId || (creatingFromResume ? !pastedCandidateName.trim() : !pastedCandidateExistingId)) {
          setActionMessage(creatingFromResume
            ? "Review the candidate name from the source before saving."
            : "Choose the candidate this source belongs to before saving.");
          return;
        }
        const intakeSelectionToken = beginLatestRequest(caseSelectionRequestRef);
        const originatingContext: CandidateIntakeContext = {
          roleId,
          caseId: activeCaseRef.current?.id ?? null,
        };
        const contextChange = await prepareCandidateContextChange({
          outputEditActive: Boolean(outputEditSession || outputEditBusy),
          caseSaveState,
          persistCase,
        });
        if (contextChange === "output_edit") {
          setActionMessage("Save or cancel the current output edit before creating another candidate case.");
          return;
        }
        if (contextChange !== "ready") return;
        const contextAfterNotesSave: CandidateIntakeContext = {
          roleId: roleIdRef.current,
          caseId: activeCaseRef.current?.id ?? null,
        };
        if (!candidateIntakeContextIsCurrent(originatingContext, contextAfterNotesSave) ||
            !latestRequestIsCurrent(caseSelectionRequestRef, intakeSelectionToken)) {
          closePasteDialog();
          setActionMessage("Candidate source was not saved because the workspace selection changed before saving.");
          return;
        }
        setSourceBusy(true);
        try {
          let savedCase: CandidateCase;
          let nextCandidateId: string;
          let staleCompletionMessage: string;
          if (creatingFromResume) {
            const result = await workstationApi.intakeCandidateResume({
              roleId,
              name: pastedCandidateName.trim(),
              currentTitle: pastedCandidateTitle.trim(),
              file,
            });
            setCandidates((current) => current.some((candidate) => candidate.id === result.candidate.id)
              ? current.map((candidate) => candidate.id === result.candidate.id ? result.candidate : candidate)
              : [result.candidate, ...current]);
            savedCase = result.candidateCase;
            nextCandidateId = result.candidate.id;
            staleCompletionMessage = "Candidate and resume saved. The workspace selection changed, so the current view was kept.";
          } else {
            const nextCase = cases.find((item) => item.roleId === roleId && item.candidateId === pastedCandidateExistingId)
              ?? await workstationApi.openCase({ roleId, candidateId: pastedCandidateExistingId });
            savedCase = await workstationApi.uploadSources(nextCase.id, [file], [effectivePastedKind]);
            nextCandidateId = pastedCandidateExistingId;
            staleCompletionMessage = "Candidate source saved. The workspace selection changed, so the current view was kept.";
          }
          const currentContext: CandidateIntakeContext = {
            roleId: roleIdRef.current,
            caseId: activeCaseRef.current?.id ?? null,
          };
          if (!candidateIntakeContextIsCurrent(originatingContext, currentContext) ||
              !latestRequestIsCurrent(caseSelectionRequestRef, intakeSelectionToken)) {
            cacheCaseRecord(savedCase);
            closePasteDialog();
            setActionMessage(staleCompletionMessage);
            return;
          }
          setCandidateId(nextCandidateId);
          replaceCase(savedCase);
          closePasteDialog();
          setWorkspaceView("work");
        } catch (error) {
          const currentContext: CandidateIntakeContext = {
            roleId: roleIdRef.current,
            caseId: activeCaseRef.current?.id ?? null,
          };
          if (candidateIntakeContextIsCurrent(originatingContext, currentContext) &&
              latestRequestIsCurrent(caseSelectionRequestRef, intakeSelectionToken)) {
            showActionError(error, "The candidate source could not be saved.");
          }
        } finally {
          setSourceBusy(false);
        }
        return;
      }
      const saved = await uploadSources([file], [effectivePastedKind]);
      if (saved) {
        closePasteDialog();
      }
      return;
    }

    let targetRoleId = roleId;
    if (!targetRoleId) {
      const title = pastedJobTitle.trim();
      const client = pastedJobClient.trim();
      if (effectivePastedKind !== "job_description" || !title || !client) {
        setActionMessage("A complete Job description with a reviewed Job title and client or company is required before creating a Job folder.");
        return;
      }
      const resolvedRoleId = await resolveJobFolder(title, client);
      if (!resolvedRoleId) return;
      targetRoleId = resolvedRoleId;
    }

    const saved = await uploadJobSources([file], [effectivePastedKind], targetRoleId);
    if (!saved) return;
    closePasteDialog();
    if (candidateId && targetRoleId !== activeCaseRef.current?.roleId) {
      await openSelectedCase(targetRoleId, candidateId);
    }
  };

  const reviewJobSource = async (sourceId: string, kind?: SourceKind) => {
    if (!roleId || sourceBusy) return;
    setSourceBusy(true);
    try {
      const next = await workstationApi.reviewJobSource(roleId, sourceId, kind);
      setJobSourcesByRoleId((current) => ({ ...current, [roleId]: next }));
      setActionMessage("Job source classified and ready for every candidate in this Job.");
      clearSourceTypeEdit(sourceId);
    } catch (error) {
      showActionError(error, "The Job source could not be classified.");
    } finally {
      setSourceBusy(false);
    }
  };

  const selectOutputKind = (kind: OutputKind) => {
    outputKindRef.current = kind;
    setOutputKind(kind);
  };

  const loadVersions = useCallback(async (kind: OutputKind) => {
    const current = activeCaseRef.current;
    if (!current) return null;
    const request = { caseId: current.id, kind };
    return loadScopedDocumentVersions(
      workstationApi.listDocumentVersions,
      request,
      (expected) => activeCaseRef.current?.id === expected.caseId && outputKindRef.current === expected.kind,
      setOutputVersionState,
    );
  }, []);

  const beginOutputEdit = async () => {
    const current = activeCaseRef.current;
    if (!current || outputEditIsBusy(outputEditBusy, sourceBusy)) return;
    const editKind = outputKindRef.current;
    clearActionFeedback();
    setOutputEditBusy(true);
    try {
      let versionState = outputVersionState;
      let session = editSessionForScopedDocument(current, editKind, versionState);
      if (!session) {
        versionState = await loadVersions(editKind);
        if (activeCaseRef.current?.id !== current.id || outputKindRef.current !== editKind) return;
        session = editSessionForScopedDocument(current, editKind, versionState);
      }
      if (!session) {
        setActionMessage("Edit mode was not opened because the current output provenance could not be loaded.");
        return;
      }
      setOutputDraft(current.documents[editKind].content);
      setOutputEditSession(session);
    } finally {
      setOutputEditBusy(false);
    }
  };

  const cancelOutputEdit = () => {
    setOutputDraft(null);
    setOutputEditSession(null);
    clearActionFeedback();
  };

  const saveOutputEdit = async () => {
    const session = outputEditSession;
    const draft = outputDraft;
    if (!session || draft === null || outputEditIsBusy(outputEditBusy, sourceBusy)) return;
    if (activeCaseRef.current?.id !== session.caseId) {
      setActionMessage("The active candidate case changed. This edit was not saved.");
      return;
    }
    setOutputEditBusy(true);
    try {
      const document = await saveEditedOutput(workstationApi.saveDocument, session, draft);
      if (activeCaseRef.current?.id === session.caseId) {
        storeCaseRecord(mergeSavedOutputEdit(activeCaseRef.current, document));
      }
      setOutputDraft(null);
      setOutputEditSession(null);
      await loadVersions(session.kind);
      setActionMessage(`Saved edited ${session.kind} revision ${document.revision} with its source and capability-run lineage preserved.`);
    } catch (error) {
      showActionError(error, "The edited output could not be saved.");
    } finally {
      setOutputEditBusy(false);
    }
  };

  const executeCapability = async (
    capabilityId: string,
    extraInput = "",
    feedbackTarget: "global" | "workflow" = "global",
  ) => {
    const current = activeCaseRef.current;
    const reportFeedback = (message: string, error = false) => {
      if (current && activeCaseRef.current?.id !== current.id) return;
      if (feedbackTarget === "workflow") {
        setWorkflowExecutionFeedback({
          caseId: current?.id ?? null,
          capabilityId,
          message,
          error,
        });
        return;
      }
      setActionErrorMessage(error ? message : "");
      setActionMessage(message);
    };
    if (!current) {
      reportFeedback("Select a Job folder and candidate before running a workflow.", true);
      return;
    }
    if (outputEditSession || outputEditBusy) {
      reportFeedback("Save or cancel the current output edit before running another workflow.", true);
      return;
    }
    if (packageBusy) {
      reportFeedback("Another workflow is already running for this candidate.", true);
      return;
    }
    setPackageBusy(true);
    reportFeedback(`Preparing the canonical ${capabilityId} workflow...`);
    try {
      if (caseSaveState !== "saved" && !(await persistCase())) {
        reportFeedback("Workflow not run because the current notes could not be saved.", true);
        return;
      }
      const executionCase = activeCaseRef.current;
      if (!executionCase || executionCase.id !== current.id) {
        reportFeedback("The active candidate case changed before the workflow could run.", true);
        return;
      }

      const prepared = await workstationApi.prepareCapability(executionCase.id, capabilityId, {
        extraInput,
        provider: "workstation",
        model: "canonical-registry",
      });
      if (!prepared.run) {
        reportFeedback(`Workflow not run: ${prepared.preparation.blocker || "This capability has no mounted canonical executor."}`, true);
        return;
      }

      reportFeedback(`Running the canonical ${capabilityId} executor...`);
      const executed = await workstationApi.executeCapabilityRun(executionCase.id, prepared.run.id);
      if (activeCaseRef.current?.id === executionCase.id) {
        if (executed.documents.length) {
          storeCaseRecord(mergePersistedDocuments(activeCaseRef.current, executed.documents));
        }
        const nextOutputKind = executed.documents.some((document) => document.kind === "submission")
          ? "submission"
          : executed.documents.find((document) => ["resume", "email", "loxo_update"].includes(document.kind))?.kind as OutputKind | undefined;
        if (nextOutputKind) {
          selectOutputKind(nextOutputKind);
          setResumeView("form");
          await loadVersions(nextOutputKind);
        }
        if (activeCaseRef.current?.id === executionCase.id) {
          reportFeedback(capabilityExecutionMessage(
            executed,
            prepared.preparation.canonicalIncomplete,
          ), executed.run.status === "failed");
        }
      }
    } catch (error) {
      reportFeedback(error instanceof Error ? error.message : "The canonical workflow could not run.", true);
    } finally {
      await Promise.all([
        loadCapabilityRuns(current.id),
        loadCaseArtifacts(current.id),
      ]);
      setPackageBusy(false);
    }
  };

  const reviewCaseArtifact = async (
    artifactId: string,
    review: ArtifactVisualQaReview,
  ) => {
    const reviewCaseId = activeCaseRef.current?.id;
    if (!reviewCaseId) throw new Error("Select a candidate case before reviewing a PDF.");
    try {
      const result = await reviewCaseArtifactAndRefresh(
        workstationApi.reviewCaseArtifact,
        loadCapabilityRuns,
        loadCaseArtifacts,
        reviewCaseId,
        artifactId,
        review,
      );
      if (activeCaseRef.current?.id === reviewCaseId) {
        setCapabilityRuns((current) => [
          result.run,
          ...current.filter((run) => run.id !== result.run.id),
        ]);
        setCaseArtifacts((current) => [
          result.artifact,
          ...current.filter((artifact) => artifact.id !== result.artifact.id),
        ]);
      }
      setActionMessage(result.run.status === "completed"
        ? "Human visual QA passed. The PDF run is completed with persisted evidence."
        : result.run.status === "failed"
          ? "Human visual QA failed. The PDF run is marked failed with persisted evidence."
          : "Human visual QA passed for this PDF. The run still awaits review of another persisted PDF.");
      return result;
    } catch (error) {
      showActionError(error, "Visual QA could not be saved.");
      throw error;
    }
  };


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
  const activeCandidate = candidates.find((candidate) => candidate.id === candidateId) ?? null;
  const outputVersions = activeCase
    ? outputVersionsForScope(outputVersionState, activeCase.id, outputKind)
    : [];
  const roleCandidates = useMemo(() => {
    const ids = new Set(cases.filter((item) => item.roleId === roleId).map((item) => item.candidateId));
    return candidates.filter((candidate) => ids.has(candidate.id));
  }, [candidates, cases, roleId]);
  const visibleRoleCandidates = roleCandidates.filter((candidate) => {
    const query = candidateSearch.trim().toLocaleLowerCase();
    return !query || `${candidate.name} ${candidate.currentTitle ?? ""}`.toLocaleLowerCase().includes(query);
  });
  const actionNeedsAttention = Boolean(actionMessage) && (
    actionMessage === actionErrorMessage ||
    /could not|failed|select|choose|save or cancel|required|not run|cannot|changed before|no mounted|review the candidate name/i.test(actionMessage)
  );
  const actionDialogOpen = addSourcesOpen || Boolean(creationMode) || pasteOpen || workflowsOpen || deleteRoleOpen;
  const pastedSourceCanSave = Boolean(pendingJobFile || pendingCandidateFile || pastedSource.trim()) && !sourceBusy && !intakeBusy && (
    pasteScope === "candidate"
      ? sourceTarget === "new_candidate" || !activeCase
        ? effectivePastedKind === "resume"
          ? Boolean(roleId && pastedCandidateName.trim())
          : Boolean(roleId && pastedCandidateExistingId)
        : Boolean(activeCase)
      : Boolean(roleId) || (effectivePastedKind === "job_description" && Boolean(pastedJobTitle.trim()) && Boolean(pastedJobClient.trim()))
  );
  const pastedSaveLabel = pasteScope === "candidate"
    ? sourceTarget === "new_candidate" || !activeCase
      ? effectivePastedKind === "resume" ? "Create candidate and save source" : "Save candidate source"
      : "Save candidate source"
    : roleId
      ? "Save to this Job"
      : "Create Job and save source";
  const effectivePastedFilename = pendingJobFile?.file.name ?? pendingCandidateFile?.file.name ?? effectivePastedProposal.filename;


  if (loading && !roles.length && !candidates.length) {
    return <main className="center-state"><LoaderCircle className="spin" /> Loading workstation</main>;
  }

  return (
    <main className="workstation-shell">
      <header className="brand-bar">
        <div className="brand-lockup"><span className="brand-wordmark">TOP TIER TALENT GROUP</span><h1>Recruiter Workstation</h1></div>
      </header>

      <section className="project-home" aria-label="Job workspace">
        <div className="project-title-row">
          <FolderOpen size={32} strokeWidth={1.8} aria-hidden="true" />
          <label className="sr-only" htmlFor="job-project-select">Job folder</label>
          <select
            id="job-project-select"
            className="project-switcher"
            value={roleId}
            disabled={caseSaveState === "saving"}
            onChange={(event) => { setCandidateSearch(""); void openSelectedCase(event.target.value, ""); }}
          >
            <option value="">Choose a Job</option>
            {roles.map((item) => <option key={item.id} value={item.id}>{item.title}{item.client ? ` · ${item.client}` : ""}</option>)}
          </select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button size="icon" variant="outline" className="project-menu-trigger" aria-label="Job options"><MoreHorizontal size={19} /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="project-menu-content">
              <DropdownMenuLabel>{activeRole?.title ?? "Job workspace"}</DropdownMenuLabel>
              <DropdownMenuItem onSelect={openWorkflowsDialog}><BookOpen />Workflows</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void startNewJobFromSource()}><UploadCloud />New Job from source</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openCreationDialog("role")}><FolderOpen />Add Job manually</DropdownMenuItem>
              <DropdownMenuItem disabled={!roleId} onSelect={() => openCreationDialog("candidate")}><UserRound />Add candidate manually</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" disabled={!activeRole} onSelect={() => setDeleteRoleOpen(true)}><Trash2 />Delete Job</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <button type="button" className="source-composer" aria-haspopup="dialog" onClick={() => openAddSources()}>
          <Plus size={22} aria-hidden="true" />
          <span>Add files or paste text</span>
        </button>

        <div className="workspace-tabs" role="tablist" aria-label="Job workspace view">
          <button id="work-tab" type="button" role="tab" aria-selected={workspaceView === "work"} aria-controls="work-panel" onClick={() => setWorkspaceView("work")}>Work</button>
          <button id="sources-tab" type="button" role="tab" aria-selected={workspaceView === "sources"} aria-controls="sources-panel" onClick={() => setWorkspaceView("sources")}>Sources</button>
        </div>
      </section>

      {pageError ? <div className="error-banner"><AlertTriangle size={17} />{pageError}<Button size="sm" variant="outline" onClick={() => { setLoading(true); setPageError(""); void loadWorkspace(); }}>Retry</Button></div> : null}

      {workspaceView === "work" ? <section
        id="work-panel"
        role="tabpanel"
        aria-labelledby="work-tab"
        ref={deskGridRef}
        className={`desk-grid${notesFocused ? " notes-focus" : ""}${isDragging ? " is-resizing" : ""}`}
        style={notesFocused ? undefined : { gridTemplateColumns: `238px minmax(280px, ${splitRatio}fr) 8px minmax(280px, ${100 - splitRatio}fr)` }}
      >
        <aside className="candidate-rail" aria-label="Candidates in this Job">
          <label className="candidate-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Search candidates</span><Input value={candidateSearch} onChange={(event) => setCandidateSearch(event.target.value)} placeholder="Search candidates" /></label>
          <div className="candidate-list">
            {visibleRoleCandidates.map((candidate) => <button key={candidate.id} type="button" className={candidate.id === candidateId ? "candidate-row active" : "candidate-row"} aria-current={candidate.id === candidateId ? "true" : undefined} onClick={() => void openSelectedCase(roleId, candidate.id)}><strong>{candidate.name}</strong><span><UserRound size={14} />{candidate.currentTitle || "Candidate"}</span></button>)}
            {!roleId ? <p>Choose a Job or add its description.</p> : !visibleRoleCandidates.length ? <p>Add a resume to start a candidate.</p> : null}
          </div>
        </aside>

        <section className="notes-pane" aria-label="Apple Pencil and typed notes">
          <div className="pane-toolbar notes-toolbar">
            <div className="candidate-heading"><h2>{activeCandidate?.name ?? "Notes"}</h2>{activeCandidate?.currentTitle ? <span>{activeCandidate.currentTitle}</span> : null}<span className="sr-only" aria-live="polite">{saveLabel(caseSaveState)}</span></div>
            <div className="notes-toolbar-actions">
              <div className="notes-mode-switch" aria-label="Notes input mode">
                <button type="button" aria-pressed={notesMode === "draw"} onClick={() => setNotesMode("draw")}>Draw</button>
                <button type="button" aria-pressed={notesMode === "type"} onClick={() => setNotesMode("type")}>Type</button>
              </div>
              <Button size="icon" variant="outline" className="notes-focus-button" onClick={() => setNotesFocused((focused) => !focused)} aria-label={notesFocused ? "Show resume panel" : "Hide resume panel"} title={notesFocused ? "Show resume" : "Hide resume"}>{notesFocused ? <PanelRightOpen size={17} /> : <PanelRightClose size={17} />}</Button>
            </div>
          </div>
          <div className="notes-workspace">
            <div className={notesMode === "type" ? "notes-mode-panel active" : "notes-mode-panel"} aria-hidden={notesMode !== "type"}>
              <Textarea className="scribble-surface" aria-label="Candidate typed notes" disabled={!activeCase} value={notes} onChange={(event) => { const notes = event.target.value; setNotes(notes); changeCaseDraft({ notes }); }} placeholder={activeCase ? "Type notes or use Apple Pencil Scribble." : "Select a Job folder and candidate to open a private case."} style={{ fontFamily: notesFont === "System" ? "var(--font-ui)" : notesFont, fontSize: `${notesSize}px` }} />
            </div>
            <div className={notesMode === "draw" ? "notes-mode-panel active" : "notes-mode-panel"} aria-hidden={notesMode !== "draw"}>
              {activeCase ? <HandwritingCanvas key={activeCase.id} caseId={activeCase.id} disabled={!activeCase} value={notesDrawingSvg} onChange={(notesDrawingSvg) => { setNotesDrawingSvg(notesDrawingSvg); changeCaseDraft({ notesDrawingSvg }); }} /> : <div className="handwriting-empty">Select a Job folder and candidate to start handwriting notes.</div>}
            </div>
          </div>
        </section>

        {!notesFocused ? <div className="pane-resizer" role="separator" aria-orientation="vertical" aria-label="Resize Notes and Resume panes" aria-valuenow={Math.round(splitRatio)} aria-valuemin={25} aria-valuemax={75} tabIndex={0} onPointerDown={startResize} onKeyDown={(event) => { if (event.key === "ArrowLeft") { event.preventDefault(); setSplitRatio((ratio) => Math.max(25, ratio - 3)); } if (event.key === "ArrowRight") { event.preventDefault(); setSplitRatio((ratio) => Math.min(75, ratio + 3)); } }}><div className="resizer-handle" /></div> : null}

        <section className="document-pane" aria-label="Candidate resume reference" aria-hidden={notesFocused}>
          {activeCase ? <>
            <div className="pane-toolbar resume-toolbar">
              <div><h2>{resumeView === "source" ? "Original" : "Outputs"}</h2></div>
              <div className="resume-toolbar-actions">
                <div className="resume-view-toggle" role="group" aria-label="Resume view">
                  <Button size="sm" variant={resumeView === "source" ? "default" : "outline"} aria-pressed={resumeView === "source"} onClick={() => setResumeView("source")}>Original</Button>
                  <Button size="sm" variant={resumeView === "form" ? "default" : "outline"} aria-pressed={resumeView === "form"} onClick={() => { setResumeView("form"); void loadVersions(outputKind); }}>Generated</Button>
                </div>
                {resumeView === "source" && resumeSources.length > 1 ? <label>Resume<select aria-label="Resume to view" value={selectedResume?.id ?? ""} onChange={(event) => setResumeSourceId(event.target.value)}>{resumeSources.map((source) => <option key={source.id} value={source.id}>{source.filename}</option>)}</select></label> : null}
                {resumeView === "source" && resumeSourceUrl ? <Button asChild size="sm" variant="outline"><a href={resumeSourceUrl} target="_blank" rel="noreferrer">Open</a></Button> : null}
              </div>
            </div>
            {resumeView === "form"
              ? <GeneratedOutputPanel key={`${activeCase.id}-${outputKind}-${activeCase.documents[outputKind].revision}`}
                  activeCase={activeCase}
                  kind={outputKind}
                  onKindChange={(kind) => { if (outputEditSession || outputEditIsBusy(outputEditBusy, sourceBusy)) return; selectOutputKind(kind); void loadVersions(kind); }}
                  editing={Boolean(outputEditSession)}
                  editBusy={outputEditIsBusy(outputEditBusy, sourceBusy)}
                  draft={outputDraft}
                  onEdit={() => void beginOutputEdit()}
                  onDraftChange={setOutputDraft}
                  onSave={() => void saveOutputEdit()}
                  onCancel={cancelOutputEdit}
                  versions={outputVersions}
                />
              : <ResumeSourcePreview source={selectedResume} sourceUrl={resumeSourceUrl} onAdd={() => openAddSources(activeCase ? "candidate" : "new_candidate")} />}
          </> : <div className="document-empty"><FileText size={34} /><h2>Open a candidate</h2><p>Select a Job folder and candidate. The attached resume stays visible while you take notes.</p></div>}
        </section>
      </section> : <section id="sources-panel" role="tabpanel" aria-labelledby="sources-tab" className="sources-workspace" aria-label="Sources">
        <section className="source-library" aria-labelledby="job-sources-heading">
          <header><div><h2 id="job-sources-heading">Job sources</h2>{activeRole ? <span>{activeRole.title}{activeRole.client ? ` · ${activeRole.client}` : ""}</span> : null}</div><Button variant="outline" disabled={!roleId} onClick={() => openAddSources("job")}><Plus size={16} />Add source</Button></header>
          <div className="source-library-list">{roleId && (jobSourcesByRoleId[roleId] ?? []).length ? (jobSourcesByRoleId[roleId] ?? []).map((source) => {
            const uncertain = source.lifecycleStatus === "parsed" && source.classificationMethod === "uncertain";
            const reviewKind = sourceReviewKinds[source.id] || source.kind;
            return <div className="source-library-row" key={source.id}><FileText size={18} /><div className="source-row-copy"><strong title={source.filename}>{source.filename}</strong><span>{JOB_SOURCE_KIND_LABELS[source.kind]}</span></div>{uncertain ? <><select aria-label={`Classify ${source.filename}`} value={reviewKind} onChange={(event) => setSourceReviewKinds((current) => ({ ...current, [source.id]: event.target.value as SourceKind }))}>{JOB_SOURCE_KIND_OPTIONS.map((kind) => <option key={kind} value={kind}>{JOB_SOURCE_KIND_LABELS[kind]}</option>)}</select><Button size="sm" variant="outline" onClick={() => void reviewJobSource(source.id, reviewKind)}>Use</Button></> : <SourceTypeCorrectionControls source={source} editing={sourceTypeEditId === source.id} selectedKind={reviewKind} options={JOB_SOURCE_KIND_OPTIONS} labels={JOB_SOURCE_KIND_LABELS} busy={sourceBusy} onEdit={() => beginSourceTypeEdit(source)} onKindChange={(kind) => setSourceReviewKinds((current) => ({ ...current, [source.id]: kind }))} onSave={() => void reviewJobSource(source.id, reviewKind)} onCancel={() => clearSourceTypeEdit(source.id)} />}</div>;
          }) : <div className="source-library-empty">{roleId ? "No Job sources yet." : "Choose a Job to see its sources."}</div>}</div>
        </section>
        <section className="source-library" aria-labelledby="candidate-sources-heading">
          <header><div><h2 id="candidate-sources-heading">Candidate sources</h2>{activeCandidate ? <span>{activeCandidate.name}</span> : null}</div><Button variant="outline" disabled={!roleId} onClick={() => openAddSources(activeCase ? "candidate" : "new_candidate")}><Plus size={16} />Add source</Button></header>
          <div className="source-library-list">{activeCase?.sources.length ? activeCase.sources.map((source) => {
            const needsClassification = source.lifecycleStatus === "parsed" && source.classificationMethod === "uncertain";
            const reviewKind = sourceReviewKinds[source.id] || source.kind;
            return <div className="source-library-row" key={source.id}><FileText size={18} /><div className="source-row-copy"><strong title={source.filename}>{source.filename}</strong><span>{SOURCE_KIND_LABELS[source.kind]}</span></div>{needsClassification ? <><select aria-label={`Classify ${source.filename}`} value={reviewKind} onChange={(event) => setSourceReviewKinds((current) => ({ ...current, [source.id]: event.target.value as SourceKind }))}>{CANDIDATE_SOURCE_KIND_OPTIONS.map((kind) => <option key={kind} value={kind}>{SOURCE_KIND_LABELS[kind]}</option>)}</select><Button size="sm" variant="outline" disabled={sourceBusy} onClick={() => void reviewSource(source.id, reviewKind)}>Use</Button></> : <SourceTypeCorrectionControls source={source} editing={sourceTypeEditId === source.id} selectedKind={reviewKind} options={CANDIDATE_SOURCE_KIND_OPTIONS} busy={sourceBusy} onEdit={() => beginSourceTypeEdit(source)} onKindChange={(kind) => setSourceReviewKinds((current) => ({ ...current, [source.id]: kind }))} onSave={() => void reviewSource(source.id, reviewKind)} onCancel={() => clearSourceTypeEdit(source.id)} />}</div>;
          }) : <div className="source-library-empty">{roleId ? "Select a candidate or add a resume." : "Choose a Job first."}</div>}</div>
        </section>
      </section>}

      <section className="action-bar" aria-label="Candidate case actions">
        <Button disabled={!activeCase || packageBusy || Boolean(outputEditSession) || outputEditBusy} onClick={() => void executeCapability("write-up")}>{packageBusy ? <LoaderCircle className="spin" size={18} /> : <Play size={18} aria-hidden="true" />}Create after-call package</Button>
        {!actionDialogOpen && actionNeedsAttention ? <output className="action-message attention" role="alert" aria-live="assertive">{actionMessage}</output> : <span className="sr-only" aria-live="polite">{actionMessage}</span>}
      </section>

      <Dialog open={addSourcesOpen} onOpenChange={(open) => { if (!open) closeAddSourcesDialog(); }}><DialogContent className="add-sources-dialog"><DialogHeader><DialogTitle>Add sources</DialogTitle><DialogDescription>Upload a file or paste the source exactly as received.</DialogDescription></DialogHeader>
        {roleId ? <label className="source-target-label">Add to<select aria-label="Source destination" value={sourceTarget} onChange={(event) => setSourceTarget(event.target.value as SourceTarget)}><option value="job">This Job</option>{activeCase ? <option value="candidate">{activeCandidate?.name ?? "Current candidate"}</option> : null}<option value="new_candidate">New candidate from source</option></select></label> : null}
        <input ref={sourceComposerFileInput} type="file" accept={SOURCE_ACCEPT} multiple={Boolean(roleId && sourceTarget !== "new_candidate")} hidden onChange={(event) => { const files = Array.from(event.target.files || []); void handleSourceFiles(files); event.currentTarget.value = ""; }} />
        <button type="button" className={`add-sources-dropzone${dropActive ? " is-dragging" : ""}`} onClick={() => sourceComposerFileInput.current?.click()} onDragEnter={(event) => { event.preventDefault(); setDropActive(true); }} onDragOver={(event) => { event.preventDefault(); setDropActive(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropActive(false); }} onDrop={(event) => { event.preventDefault(); setDropActive(false); void handleSourceFiles(Array.from(event.dataTransfer.files)); }}><UploadCloud size={28} /><span>Drag sources here</span></button>
        <div className="add-source-options"><button type="button" onClick={() => sourceComposerFileInput.current?.click()}><Upload size={23} /><span>Upload</span></button><button type="button" onClick={() => { closeAddSourcesDialog(); openPasteDialog(sourceTarget === "job" ? "job" : "candidate", sourceTarget); }}><Type size={23} /><span>Text input</span></button></div>
        {actionNeedsAttention ? <p className="dialog-action-error" role="alert">{actionMessage}</p> : null}
      </DialogContent></Dialog>

      <Dialog open={Boolean(creationMode)} onOpenChange={(open) => { if (!open) closeCreationDialog(); }}><DialogContent><DialogHeader><DialogTitle>{creationMode === "role" ? "New Job folder" : "Add candidate"}</DialogTitle><DialogDescription>{creationMode === "role" ? "Save the role and company for reusable Job context." : "Save the candidate for use across recruiter workflows."}</DialogDescription></DialogHeader><div className="dialog-fields"><label>{creationMode === "role" ? "Job title" : "Candidate name"}<Input value={creationPrimary} onChange={(event) => setCreationPrimary(event.target.value)} /></label><label>{creationMode === "role" ? "Client or company" : "Current title"}<Input value={creationSecondary} onChange={(event) => setCreationSecondary(event.target.value)} /></label></div>{actionNeedsAttention ? <p className="dialog-action-error" role="alert">{actionMessage}</p> : null}<DialogFooter><Button variant="outline" onClick={closeCreationDialog}>Cancel</Button><Button onClick={() => void submitCreation()} disabled={!creationPrimary.trim() || (creationMode === "role" && !creationSecondary.trim())}>Add</Button></DialogFooter></DialogContent></Dialog>

      <AlertDialog open={deleteRoleOpen} onOpenChange={(open) => { if (!deleteRoleBusy) setDeleteRoleOpen(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this Job?</AlertDialogTitle>
            <AlertDialogDescription>
              {activeRole ? `${activeRole.title}${activeRole.client ? ` · ${activeRole.client}` : ""}` : "This Job"} and its candidate cases, attached sources, notes, drafts and generated artifacts will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteRoleBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleteRoleBusy} onClick={() => void deleteSelectedRole()}>{deleteRoleBusy ? "Deleting..." : "Delete Job"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={pasteOpen} onOpenChange={(open) => { if (!open) closePasteDialog(); }}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>{pendingJobFile ? "Review Job source" : pendingCandidateFile ? "Review candidate source" : `Paste ${pasteScope === "job" ? "Job source" : "candidate source"}`}</DialogTitle><DialogDescription>{pendingJobFile ? "The original file stays unchanged. Review the detected classification and Job identity." : pendingCandidateFile ? "The original file stays unchanged. Confirm only identity found in the source, or assign non-resume evidence to an existing candidate." : "Paste the complete source. It is classified before anything is created."}</DialogDescription></DialogHeader><Textarea aria-label={pasteScope === "job" ? "Job source text" : "Candidate source text"} value={pastedSource} readOnly={Boolean(pendingJobFile || pendingCandidateFile)} onChange={(event) => {
        const value = event.target.value;
        setPastedSource(value);
        setPastedKindOverride("");
        const proposal = proposePastedSource(value);
        if (pasteScope === "job" && !roleId) {
          setPastedJobTitle(proposal.job?.title ?? "");
          setPastedJobClient(proposal.job?.client ?? "");
        } else if (pasteScope === "candidate" && sourceTarget === "new_candidate") {
          setPastedCandidateName(proposal.candidate?.name ?? "");
          setPastedCandidateTitle(proposal.candidate?.currentTitle ?? "");
        }
      }} placeholder={pendingJobFile || pendingCandidateFile ? "No extractable text was found in this file." : "Paste the source text exactly as received."} className="paste-source-textarea" />
        <section className="paste-detection" aria-live="polite"><div><strong>Detected source</strong><span>{SOURCE_KIND_LABELS[effectivePastedKind]} · {effectivePastedFilename}</span></div>{pasteScope === "job" && !roleId ? <><label className="paste-kind-review">Source type<select value={effectivePastedKind} onChange={(event) => setPastedKindOverride(event.target.value as SourceKind)}><option value="job_description">Job description</option><option value="pasted_text">Instructions</option><option value="call_notes">Client notes</option><option value="other">Other</option></select></label><div className={`paste-confidence ${effectivePastedProposal.job?.confidence ?? "low"}`}>{effectivePastedProposal.job?.autoCreateEligible ? "Complete Job identity detected" : "Review the Job identity before saving"}</div><div className="paste-job-fields"><label>Job title<Input value={pastedJobTitle} onChange={(event) => setPastedJobTitle(event.target.value)} placeholder="Not found in the source" /></label><label>Company or client<Input value={pastedJobClient} onChange={(event) => setPastedJobClient(event.target.value)} placeholder="Not found in the source" /></label></div>{effectivePastedProposal.job?.evidence.length ? <small>Found in source: {effectivePastedProposal.job.evidence.join(" | ")}</small> : <small>No Job identity was inferred. Unknown values stay blank.</small>}</> : pasteScope === "candidate" && (sourceTarget === "new_candidate" || !activeCase) ? <><label className="paste-kind-review">Source type<select aria-label="Candidate source type" value={effectivePastedKind} onChange={(event) => setPastedKindOverride(event.target.value as SourceKind)}>{CANDIDATE_SOURCE_KIND_OPTIONS.map((kind) => <option key={kind} value={kind}>{SOURCE_KIND_LABELS[kind]}</option>)}</select></label>{effectivePastedKind === "resume" ? <><div className={`paste-confidence ${effectivePastedProposal.candidate?.confidence ?? "low"}`}>{pastedCandidateName ? "Candidate identity found — review before saving" : "Candidate identity needs review"}</div><div className="paste-job-fields"><label>Candidate name<Input value={pastedCandidateName} onChange={(event) => setPastedCandidateName(event.target.value)} placeholder="Not found in the source" /></label><label>Current title<Input value={pastedCandidateTitle} onChange={(event) => setPastedCandidateTitle(event.target.value)} placeholder="Not found in the source" /></label></div>{effectivePastedProposal.candidate?.evidence.length ? <small>Found in source: {effectivePastedProposal.candidate.evidence.join(" | ")}</small> : <small>Unknown values stay blank until you review the source.</small>}</> : <label className="paste-kind-review">Assign to candidate<select aria-label="Candidate for source" value={pastedCandidateExistingId} onChange={(event) => setPastedCandidateExistingId(event.target.value)}><option value="">Select a candidate...</option>{roleCandidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}{candidate.currentTitle ? ` · ${candidate.currentTitle}` : ""}</option>)}</select></label>}</> : pasteScope === "job" ? <small>This source will be attached to the selected Job.</small> : <small>This source will be attached to {activeCandidate?.name ?? "the selected candidate"}.</small>}</section>
        {actionNeedsAttention ? <p className="dialog-action-error" role="alert">{actionMessage}</p> : null}
        <DialogFooter><Button variant="outline" onClick={closePasteDialog}>Cancel</Button><Button disabled={!pastedSourceCanSave} onClick={() => void savePastedSource()}>{pastedSaveLabel}</Button></DialogFooter></DialogContent></Dialog>

      <WorkflowBrowser
        open={workflowsOpen}
        onOpenChange={(open) => { setWorkflowsOpen(open); if (!open) { setWorkflowExecutionFeedback(null); clearActionFeedback(); } }}
        activeCaseId={activeCase?.id ?? null}
        activeCaseAvailable={Boolean(activeCase)}
        contextInputValues={{
          candidate_full_name: candidates.find((candidate) => candidate.id === candidateId)?.name ?? "",
          job_title: roles.find((role) => role.id === roleId)?.title ?? "",
          company_name: roles.find((role) => role.id === roleId)?.client ?? "",
        }}
        onExecute={(capabilityId, extraInput) => executeCapability(capabilityId, extraInput, "workflow")}
        onReviewArtifact={reviewCaseArtifact}
        runs={capabilityRuns}
        runsLoading={capabilityRunsLoading}
        runsError={capabilityRunsError}
        artifacts={caseArtifacts}
        artifactsLoading={caseArtifactsLoading}
        artifactsError={caseArtifactsError}
        executionFeedback={workflowExecutionFeedback?.caseId === activeCase?.id ? workflowExecutionFeedback : null}
        onClearExecutionFeedback={() => setWorkflowExecutionFeedback(null)}
      />

    </main>
  );
}

function GeneratedOutputPanel({
  activeCase,
  kind,
  onKindChange,
  editing,
  editBusy,
  draft,
  onEdit,
  onDraftChange,
  onSave,
  onCancel,
  versions,
}: {
  activeCase: CandidateCase;
  kind: OutputKind;
  onKindChange: (kind: OutputKind) => void;
  editing: boolean;
  editBusy: boolean;
  draft: CaseDocument["content"] | null;
  onEdit: () => void;
  onDraftChange: (content: CaseDocument["content"]) => void;
  onSave: () => void;
  onCancel: () => void;
  versions: DocumentVersion[];
}) {
  const document = activeCase.documents[kind];
  const [viewRevision, setViewRevision] = useState(document.revision);
  const effectiveRevision = viewRevision === document.revision || versions.some((version) => version.revision === viewRevision)
    ? viewRevision
    : document.revision;
  const historical = versions.find((version) => version.revision === effectiveRevision);
  const content = historical?.content ?? document.content;
  const submission = contentAsSubmission({ ...document, content });
  const resume = toResumeForm(content);
  const missing = kind === "submission"
    ? Object.entries(submission).filter(([, value]) => !value.trim()).map(([key]) => ({
        compensationTarget: "Compensation target", currentCompensation: "Current compensation", vacation: "Vacation",
        location: "Location", workStatus: "Work status", interviewAvailability: "Interview availability",
        startDateNotice: "Start date / notice", reasonForLeaving: "Reason for leaving", profileSummary: "Profile summary",
        name: "Name", title: "Title",
      }[key] ?? key))
    : [];
  return <div className="generated-output-shell">
    <div className="output-toolbar">
      <div className="output-tabs" role="tablist">
        {(["resume", "submission", "email", "loxo_update"] as OutputKind[]).map((item) => <button key={item} type="button" role="tab" aria-selected={kind === item} disabled={editing || editBusy} onClick={() => onKindChange(item)}>{({ resume: "Resume", submission: "Submission", email: "Email", loxo_update: "Loxo notes" })[item]}</button>)}
      </div>
      <div className="output-context-actions">
        {!editing && effectiveRevision === document.revision ? <Button size="sm" variant="outline" disabled={editBusy} onClick={onEdit}>{editBusy ? <LoaderCircle className="spin" size={15} /> : <Edit3 size={15} />}Edit</Button> : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button size="icon" variant="outline" disabled={editing || editBusy} aria-label="Output history"><MoreHorizontal size={17} /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="output-history-label"><History />History</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => setViewRevision(document.revision)}>Current · v{document.revision}</DropdownMenuItem>
            {versions.filter((version) => version.revision !== document.revision).map((version) => <DropdownMenuItem key={version.revision} onSelect={() => setViewRevision(version.revision)}>v{version.revision} · {version.origin}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
    <AssistantReviewRequiredNotice requirements={activeCase.assistant.reviewRequired} />
    {editing ? <div className="output-editor" aria-label={`Edit current ${kind}`}>
      {kind === "resume" ? <ResumeFormEditor value={toResumeForm(draft)} onChange={onDraftChange} /> : null}
      {kind === "submission" ? <SubmissionForm value={contentAsSubmission({ ...document, content: draft ?? {} })} onChange={onDraftChange} /> : null}
      {kind === "email" || kind === "loxo_update" ? <Textarea value={typeof draft === "string" ? draft : ""} onChange={(event) => onDraftChange(event.target.value)} aria-label={`Edit ${kind}`} /> : null}
      <div className="output-edit-actions"><Button variant="outline" disabled={editBusy} onClick={onCancel}>Cancel</Button><Button disabled={editBusy} onClick={onSave}>{editBusy ? <LoaderCircle className="spin" size={16} /> : null}Save changes</Button></div>
    </div> : <article className="output-preview">
      {kind === "resume" ? <><h2>{resume.name || "Resume draft"}</h2>{resume.headline ? <h3>{resume.headline}</h3> : null}{resume.summary ? <section><h4>Professional Summary</h4><p>{resume.summary}</p></section> : null}{resume.skills ? <section><h4>Core Competencies &amp; Skills</h4><p className="preserve-lines">{resume.skills}</p></section> : null}{resume.jobs.length ? <section><h4>Professional Experience</h4>{resume.jobs.map((job, index) => <div key={index} className="preview-job"><strong>{job.title}</strong><span>{[job.company, job.location, job.dates].filter(Boolean).join(" · ")}</span><p className="preserve-lines">{job.bullets}</p></div>)}</section> : null}</> : null}
      {kind === "submission" ? <><h2>Candidate submission</h2><dl>{Object.entries(submission).filter(([, value]) => value.trim()).map(([key, value]) => <div key={key}><dt>{key.replace(/([A-Z])/g, " $1")}</dt><dd>{value}</dd></div>)}</dl>{missing.length ? <aside className="needs-confirmation"><strong>Needs confirmation</strong><ul>{missing.map((item) => <li key={item}>{item}</li>)}</ul></aside> : null}</> : null}
      {kind === "email" ? <pre>{typeof content === "string" && content.trim() ? content : "No source-backed content yet."}</pre> : null}
      {kind === "loxo_update" ? <><h2>Loxo update bullets</h2><pre>{typeof content === "string" && content.trim() ? content : "No source-backed content yet."}</pre></> : null}
    </article>}
  </div>;
}

function ResumeSourcePreview({ source, sourceUrl, onAdd }: { source: CaseSource | null; sourceUrl: string; onAdd: () => void }) {
  if (!source) return <button type="button" className="document-empty document-drop-target" onClick={onAdd}><UploadCloud size={34} /><h2>Drop the candidate&apos;s resume here</h2><p>It will be parsed automatically and stay visible while you take notes.</p></button>;
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
