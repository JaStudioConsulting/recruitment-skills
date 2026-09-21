"use client";

import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  Edit3,
  FileText,
  FolderOpen,
  Link2,
  LoaderCircle,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Plus,
  UploadCloud,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { HandwritingCanvas } from "@/components/workstation/handwriting-canvas";
import { ResumeFormEditor } from "@/components/workstation/resume-form";
import { WorkflowBrowser } from "@/components/workstation/workflow-browser";
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
  type SubmissionDocument,
} from "@/lib/workstation-types";
import { jobIdentitiesMatch, proposePastedSource, sourceIsUsable, type UploadedSourceProposal } from "@/lib/source-intake";

type User = { id: string; displayName: string };
type CreationMode = "role" | "candidate" | null;
type NotesMode = "type" | "draw";
type OutputKind = "resume" | "submission" | "email" | "loxo_update";
type OutputEditSession = {
  caseId: string;
  kind: OutputKind;
  expectedRevision: number;
  sourceRefs: string[];
  capabilityRunId: string | null;
};

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
const SOURCE_ACCEPT = ".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg";
const PREFILL_FIELD_LABELS: Partial<Record<keyof SubmissionDocument, string>> = {
  name: "Name",
  title: "Title",
  location: "Location",
  profileSummary: "Profile Summary",
};
type SourceReadinessState = "missing" | "attached" | "reviewed";

function sourceReadinessState(sources: CaseSource[], kinds: SourceKind[]): SourceReadinessState {
  const matches = sources.filter((source) => kinds.includes(source.kind));
  if (matches.some(sourceIsUsable)) return "reviewed";
  return matches.length ? "attached" : "missing";
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
  const [notes, setNotes] = useState("");
  const [notesDrawingSvg, setNotesDrawingSvg] = useState("");
  const [notesMode, setNotesMode] = useState<NotesMode>("draw");
  const [notesFocused, setNotesFocused] = useState(false);
  const [notesFont, setNotesFont] = useState("System");
  const [notesSize, setNotesSize] = useState(20);
  const [caseStatus, setCaseStatus] = useState("active");
  const [caseSaveState, setCaseSaveState] = useState<SaveState>("saved");
  const [actionMessage, setActionMessage] = useState("");
  const [resumeView, setResumeView] = useState<"source" | "form">("source");
  const [resumeSourceId, setResumeSourceId] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteScope, setPasteScope] = useState<"job" | "candidate">("candidate");
  const [pastedSource, setPastedSource] = useState("");
  const [pastedJobTitle, setPastedJobTitle] = useState("");
  const [pastedJobClient, setPastedJobClient] = useState("");
  const [pastedKindOverride, setPastedKindOverride] = useState<SourceKind | "">("");
  const [pendingJobFile, setPendingJobFile] = useState<{ file: File; proposal: UploadedSourceProposal } | null>(null);
  const [intakeBusy, setIntakeBusy] = useState(false);
  const [sourceBusy, setSourceBusy] = useState(false);
  const [sourcePanelOpen, setSourcePanelOpen] = useState(true);
  const [dropActive, setDropActive] = useState(false);
  const [jobDropActive, setJobDropActive] = useState(false);
  const [sourceReviewKinds, setSourceReviewKinds] = useState<Record<string, SourceKind>>({});
  const [splitRatio, setSplitRatio] = useState(55);
  const [outputKind, setOutputKind] = useState<OutputKind>("submission");
  const [outputDraft, setOutputDraft] = useState<CaseDocument["content"] | null>(null);
  const [outputEditSession, setOutputEditSession] = useState<OutputEditSession | null>(null);
  const [outputEditBusy, setOutputEditBusy] = useState(false);
  const [outputVersions, setOutputVersions] = useState<DocumentVersion[]>([]);
  const [packageBusy, setPackageBusy] = useState(false);
  const [workflowsOpen, setWorkflowsOpen] = useState(false);
  const [capabilityRuns, setCapabilityRuns] = useState<CapabilityRunRecord[]>([]);
  const [capabilityRunsLoading, setCapabilityRunsLoading] = useState(false);
  const [capabilityRunsError, setCapabilityRunsError] = useState("");
  const [caseArtifacts, setCaseArtifacts] = useState<CaseArtifactSummary[]>([]);
  const [caseArtifactsLoading, setCaseArtifactsLoading] = useState(false);
  const [caseArtifactsError, setCaseArtifactsError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const pastedProposal = useMemo(() => proposePastedSource(pastedSource), [pastedSource]);
  const effectivePastedProposal = pendingJobFile?.proposal ?? pastedProposal;
  const effectivePastedKind = pastedKindOverride || effectivePastedProposal.kind;
  const deskGridRef = useRef<HTMLDivElement | null>(null);
  const caseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const multiFileInput = useRef<HTMLInputElement | null>(null);
  const jobFileInput = useRef<HTMLInputElement | null>(null);
  const intakeJobFileInput = useRef<HTMLInputElement | null>(null);
  const activeCaseRef = useRef<CandidateCase | null>(null);
  const caseDraftRef = useRef({ notes: "", notesDrawingSvg: "", notesFont: "System", notesSize: 20, status: "active" });
  const caseEditVersionRef = useRef(0);
  const caseSavePromiseRef = useRef<Promise<boolean> | null>(null);

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
    setCapabilityRunsLoading(true);
    setCapabilityRunsError("");
    try {
      const runs = await loadCapabilityRunsForCase(workstationApi.listCapabilityRuns, caseId);
      if (activeCaseRef.current?.id === caseId) setCapabilityRuns(runs);
      return runs;
    } catch (error) {
      if (activeCaseRef.current?.id === caseId) {
        setCapabilityRunsError(error instanceof Error ? error.message : "Run history could not be loaded.");
      }
      return [];
    } finally {
      if (activeCaseRef.current?.id === caseId) setCapabilityRunsLoading(false);
    }
  }, []);

  const loadCaseArtifacts = useCallback(async (caseId: string) => {
    setCaseArtifactsLoading(true);
    setCaseArtifactsError("");
    try {
      const artifacts = await loadCaseArtifactsForCase(workstationApi.listCaseArtifacts, caseId);
      if (activeCaseRef.current?.id === caseId) setCaseArtifacts(artifacts);
      return artifacts;
    } catch (error) {
      if (activeCaseRef.current?.id === caseId) {
        setCaseArtifactsError(error instanceof Error ? error.message : "Persisted PDFs could not be loaded.");
      }
      return [];
    } finally {
      if (activeCaseRef.current?.id === caseId) setCaseArtifactsLoading(false);
    }
  }, []);

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
    setOutputVersions([]);
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
  }, [activeCase, notes, notesDrawingSvg, notesFont, notesSize, caseStatus, persistCase]);

  const openSelectedCase = useCallback(async (nextRoleId: string, nextCandidateId: string) => {
    if (outputEditSession || outputEditBusy) {
      setActionMessage("Save or cancel the current output edit before changing candidate cases.");
      return;
    }
    if (caseSaveState !== "saved") {
      const saved = await persistCase();
      if (!saved) return;
    }
    if (!nextRoleId || !nextCandidateId) {
      setRoleId(nextRoleId);
      setCandidateId(nextCandidateId);
      activeCaseRef.current = null;
      setActiveCase(null);
      setCapabilityRuns([]);
      setCapabilityRunsError("");
      setCapabilityRunsLoading(false);
      setCaseArtifacts([]);
      setCaseArtifactsError("");
      setCaseArtifactsLoading(false);
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
  }, [caseSaveState, cases, outputEditBusy, outputEditSession, persistCase, replaceCase]);

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
    if (outputEditSession || outputEditBusy) {
      setActionMessage("Save or cancel the current output edit before changing candidate sources.");
      return false;
    }
    if (!activeCase || files.length === 0 || sourceBusy) return false;
    const uploadCaseId = activeCase.id;
    if (caseSaveState !== "saved" && !(await persistCase())) return false;
    setSourceBusy(true);
    setActionMessage(`Uploading ${files.length} source${files.length === 1 ? "" : "s"}...`);
    try {
      const next = await workstationApi.uploadSources(uploadCaseId, files, kinds);
      if (activeCaseRef.current?.id === uploadCaseId) replaceCase(next);
      else cacheCaseRecord(next);
      setActionMessage(`${files.length} immutable source${files.length === 1 ? "" : "s"} added. Review the status below.`);
      return true;
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "The source could not be uploaded.");
      return false;
    } finally {
      setSourceBusy(false);
    }
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
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "The source review could not be saved.");
    } finally {
      setSourceBusy(false);
    }
  };

  const uploadJobSources = async (files: readonly File[], kinds: readonly SourceKind[] = [], targetRoleId = roleId) => {
    if (!targetRoleId || files.length === 0 || sourceBusy) return false;
    setSourceBusy(true);
    setActionMessage(`Adding ${files.length} source${files.length === 1 ? "" : "s"} to this Job...`);
    try {
      const next = await workstationApi.uploadJobSources(targetRoleId, files, kinds);
      setJobSourcesByRoleId((current) => ({ ...current, [targetRoleId]: next }));
      const uncertain = next.filter((source) => source.lifecycleStatus === "parsed" && source.classificationMethod === "uncertain").length;
      setActionMessage(uncertain
        ? `${files.length} source${files.length === 1 ? "" : "s"} added. ${uncertain} needs one classification.`
        : `${files.length} Job source${files.length === 1 ? "" : "s"} parsed and ready.`);
      return true;
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "The Job source could not be uploaded.");
      return false;
    } finally {
      setSourceBusy(false);
    }
  };

  const resolveJobFolder = async (title: string, client: string) => {
    const existing = roles.find((role) => jobIdentitiesMatch(role, { title, client }));
    if (existing) {
      setRoleId(existing.id);
      return existing.id;
    }
    try {
      const created = await workstationApi.createRole({ title, client });
      setRoles((current) => [created, ...current]);
      setRoleId(created.id);
      return created.id;
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "The detected Job could not be created.");
      return null;
    }
  };

  const openPasteDialog = (scope: "job" | "candidate") => {
    setPasteScope(scope);
    setPastedSource("");
    setPastedJobTitle("");
    setPastedJobClient("");
    setPastedKindOverride("");
    setPendingJobFile(null);
    setPasteOpen(true);
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
      setActionMessage(error instanceof Error ? error.message : "The Job source could not be inspected.");
    } finally {
      setIntakeBusy(false);
    }
  };

  const savePastedSource = async () => {
    const text = pastedSource.trim();
    if ((!pendingJobFile && !text) || sourceBusy) return;
    const file = pendingJobFile?.file ?? new File([text], effectivePastedProposal.filename, { type: "text/plain" });

    if (pasteScope === "candidate") {
      if (!activeCase) return;
      const saved = await uploadSources([file], [effectivePastedKind]);
      if (saved) {
        setPasteOpen(false);
        setPastedSource("");
      }
      return;
    }

    let targetRoleId = roleId;
    if (!targetRoleId) {
      const title = pastedJobTitle.trim();
      const client = pastedJobClient.trim();
      if (effectivePastedKind !== "job_description" || !title) {
        setActionMessage("A complete Job description or a reviewed Job title is required before creating a Job folder.");
        return;
      }
      const resolvedRoleId = await resolveJobFolder(title, client);
      if (!resolvedRoleId) return;
      targetRoleId = resolvedRoleId;
    }

    const saved = await uploadJobSources([file], [effectivePastedKind], targetRoleId);
    if (!saved) return;
    setPasteOpen(false);
    setPastedSource("");
    setPendingJobFile(null);
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
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "The Job source could not be classified.");
    } finally {
      setSourceBusy(false);
    }
  };

  const loadVersions = useCallback(async (kind: OutputKind) => {
    if (!activeCaseRef.current) return [];
    try {
      const versions = await workstationApi.listDocumentVersions(activeCaseRef.current.id, kind);
      setOutputVersions(versions);
      return versions;
    } catch {
      setOutputVersions([]);
      return [];
    }
  }, []);

  const beginOutputEdit = async () => {
    const current = activeCaseRef.current;
    if (!current || outputEditBusy) return;
    setOutputEditBusy(true);
    try {
      let versions = outputVersions;
      let session = editSessionForCurrentDocument(current, outputKind, versions);
      if (!session) {
        versions = await loadVersions(outputKind);
        session = editSessionForCurrentDocument(current, outputKind, versions);
      }
      if (!session) {
        setActionMessage("Edit mode was not opened because the current output provenance could not be loaded.");
        return;
      }
      setOutputDraft(current.documents[outputKind].content);
      setOutputEditSession(session);
    } finally {
      setOutputEditBusy(false);
    }
  };

  const cancelOutputEdit = () => {
    setOutputDraft(null);
    setOutputEditSession(null);
    setActionMessage("Output edit cancelled. The saved document was not changed.");
  };

  const saveOutputEdit = async () => {
    const session = outputEditSession;
    const draft = outputDraft;
    if (!session || draft === null || outputEditBusy) return;
    if (activeCaseRef.current?.id !== session.caseId) {
      setActionMessage("The active candidate case changed. This edit was not saved.");
      return;
    }
    setOutputEditBusy(true);
    try {
      const document = await saveEditedOutput(workstationApi.saveDocument, session, draft);
      if (activeCaseRef.current?.id === session.caseId) {
        storeCaseRecord(mergePersistedDocuments(activeCaseRef.current, [document]));
      }
      setOutputDraft(null);
      setOutputEditSession(null);
      await loadVersions(session.kind);
      setActionMessage(`Saved edited ${session.kind} revision ${document.revision} with its source and capability-run lineage preserved.`);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "The edited output could not be saved.");
    } finally {
      setOutputEditBusy(false);
    }
  };

  const executeCapability = async (capabilityId: string, extraInput = "") => {
    const current = activeCaseRef.current;
    if (!current) {
      setActionMessage("Select a Job folder and candidate before running a workflow.");
      return;
    }
    if (outputEditSession || outputEditBusy) {
      setActionMessage("Save or cancel the current output edit before running another workflow.");
      return;
    }
    if (packageBusy) return;
    setPackageBusy(true);
    setActionMessage(`Preparing the canonical ${capabilityId} workflow...`);
    try {
      if (caseSaveState !== "saved" && !(await persistCase())) return;
      const executionCase = activeCaseRef.current;
      if (!executionCase || executionCase.id !== current.id) {
        setActionMessage("The active candidate case changed before the workflow could run.");
        return;
      }

      const prepared = await workstationApi.prepareCapability(executionCase.id, capabilityId, {
        extraInput,
        provider: "workstation",
        model: "canonical-registry",
      });
      if (!prepared.run) {
        setActionMessage(`Workflow not run: ${prepared.preparation.blocker || "This capability has no mounted canonical executor."}`);
        return;
      }

      setActionMessage(`Running the canonical ${capabilityId} executor...`);
      const executed = await workstationApi.executeCapabilityRun(executionCase.id, prepared.run.id);
      if (activeCaseRef.current?.id === executionCase.id && executed.documents.length) {
        storeCaseRecord(mergePersistedDocuments(activeCaseRef.current, executed.documents));
      }

      const nextOutputKind = executed.documents.some((document) => document.kind === "submission")
        ? "submission"
        : executed.documents.find((document) => ["resume", "email", "loxo_update"].includes(document.kind))?.kind as OutputKind | undefined;
      if (nextOutputKind) {
        setOutputKind(nextOutputKind);
        setResumeView("form");
        await loadVersions(nextOutputKind);
      }
      setActionMessage(capabilityExecutionMessage(
        executed,
        prepared.preparation.canonicalIncomplete,
      ));
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "The canonical workflow could not run.");
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
      setActionMessage(error instanceof Error ? error.message : "Visual QA could not be saved.");
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
  const afterCallReadiness = useMemo(() => {
    const sources = [
      ...(activeCase?.sources ?? []),
      ...(activeCase ? jobSourcesByRoleId[activeCase.roleId] ?? [] : []),
    ];
    return [
      { id: "resume", label: "Resume", state: sourceReadinessState(sources, ["resume"]) },
      { id: "call", label: "Call notes / transcript", state: sourceReadinessState(sources, ["call_notes", "transcript"]) },
      { id: "job", label: "Job description", state: sourceReadinessState(sources, ["job_description"]) },
    ] as const;
  }, [activeCase, jobSourcesByRoleId]);
  const afterCallReadyCount = afterCallReadiness.filter((step) => step.state === "reviewed").length;
  const pastedSourceCanSave = Boolean(pendingJobFile || pastedSource.trim()) && !sourceBusy && !intakeBusy && (
    pasteScope === "candidate"
      ? Boolean(activeCase)
      : Boolean(roleId) || (effectivePastedKind === "job_description" && Boolean(pastedJobTitle.trim()))
  );
  const pastedSaveLabel = pasteScope === "candidate"
    ? "Save candidate source"
    : roleId
      ? "Save to this Job"
      : "Create Job and save source";
  const effectivePastedFilename = pendingJobFile?.file.name ?? effectivePastedProposal.filename;


  if (loading && !roles.length && !candidates.length) {
    return <main className="center-state"><LoaderCircle className="spin" /> Loading workstation</main>;
  }

  return (
    <main className="workstation-shell">
      <header className="brand-bar">
        <div className="brand-lockup"><span className="brand-wordmark">TOP TIER TALENT GROUP</span><span className="brand-line" /></div>
        <div className="brand-title"><h1>Recruiter Workstation</h1><span>One workspace. From conversation to submission.</span></div>
        <div className="brand-actions"><Button variant="outline" onClick={() => { setWorkflowsOpen(true); if (activeCaseRef.current) void Promise.all([loadCapabilityRuns(activeCaseRef.current.id), loadCaseArtifacts(activeCaseRef.current.id)]); }}><BookOpen size={16} />Workflows <span className="workflow-count">24</span></Button><div className="operator"><span className={`save-dot ${caseSaveState}`}><Check size={13} /></span><span>{saveLabel(caseSaveState)}</span><span className="operator-name">{user.displayName}</span></div></div>
      </header>

      <section className="context-bar job-context-bar" aria-label="Current Job folder and candidate">
        <ContextSelect label="Job folder" value={roleId} onChange={(value) => void openSelectedCase(value, candidateId)} onAdd={() => setCreationMode("role")} disabled={caseSaveState === "saving"}>
          <option value="">Select a Job...</option>
          {roles.map((item) => <option key={item.id} value={item.id}>{item.title}{item.client ? ` · ${item.client}` : ""}</option>)}
        </ContextSelect>
        <ContextSelect label="Candidate" value={candidateId} onChange={(value) => void openSelectedCase(roleId, value)} onAdd={() => setCreationMode("candidate")} disabled={caseSaveState === "saving"}>
          <option value="">Select a candidate...</option>
          {candidates.map((item) => <option key={item.id} value={item.id}>{item.name}{item.currentTitle ? ` · ${item.currentTitle}` : ""}</option>)}
        </ContextSelect>
        <div className="job-breadcrumb"><FolderOpen size={16} /><span>{roles.find((role) => role.id === roleId)?.title ?? "Choose a Job folder"}</span>{activeCase ? <><span>/</span><strong>{candidates.find((candidate) => candidate.id === candidateId)?.name}</strong></> : null}<Button size="sm" variant="outline" onClick={() => openPasteDialog("job")}><Link2 size={15} />Paste JD</Button></div>
      </section>

      {!roleId ? <section className="source-first-job-intake" aria-label="Create a Job from its source">
        <input ref={intakeJobFileInput} type="file" accept=".pdf,.doc,.docx,.txt,.md" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void intakeUnassignedJobFile(file); event.currentTarget.value = ""; }} />
        <button type="button" className={`source-first-job-drop${jobDropActive ? " is-dragging" : ""}`} disabled={intakeBusy || sourceBusy} onClick={() => intakeJobFileInput.current?.click()} onDragEnter={(event) => { event.preventDefault(); setJobDropActive(true); }} onDragOver={(event) => { event.preventDefault(); setJobDropActive(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setJobDropActive(false); }} onDrop={(event) => { event.preventDefault(); setJobDropActive(false); const file = event.dataTransfer.files[0]; if (file) void intakeUnassignedJobFile(file); }}>
          {intakeBusy ? <LoaderCircle className="spin" size={20} /> : <UploadCloud size={20} />}<span><strong>Drop a Job description</strong><small>The company and role are extracted from the source. A confident match creates or selects its Job folder.</small></span>
        </button>
        <Button size="sm" variant="outline" onClick={() => openPasteDialog("job")}><Link2 size={15} />Paste the whole JD</Button>
      </section> : null}

      {roleId ? <section className="job-source-strip" aria-label="Shared Job sources">
        <input ref={jobFileInput} type="file" accept={SOURCE_ACCEPT} multiple hidden onChange={(event) => { const files = Array.from(event.target.files || []); void uploadJobSources(files); event.currentTarget.value = ""; }} />
        <button
          type="button"
          className={`job-source-drop${jobDropActive ? " is-dragging" : ""}`}
          disabled={sourceBusy}
          onClick={() => jobFileInput.current?.click()}
          onDragEnter={(event) => { event.preventDefault(); setJobDropActive(true); }}
          onDragOver={(event) => { event.preventDefault(); setJobDropActive(true); }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setJobDropActive(false); }}
          onDrop={(event) => { event.preventDefault(); setJobDropActive(false); void uploadJobSources(Array.from(event.dataTransfer.files)); }}
        >
          <UploadCloud size={18} />
          <span><strong>Job knowledge</strong><small>Drop the JD, client notes, or instructions once. Every candidate in this Job uses them.</small></span>
        </button>
        <div className="job-source-list">{(jobSourcesByRoleId[roleId] ?? []).map((source) => {
          const uncertain = source.lifecycleStatus === "parsed" && source.classificationMethod === "uncertain";
          const unreadable = source.lifecycleStatus === "uploaded" && !source.parsedText;
          const reviewKind = sourceReviewKinds[source.id] || "job_description";
          return <div className="job-source-chip" key={source.id}>
            <FileText size={14} /><span title={source.filename}>{source.filename}</span>
            <small>{unreadable ? "Could not read automatically" : uncertain ? "What is this?" : JOB_SOURCE_KIND_LABELS[source.kind]}</small>
            {uncertain ? <><select aria-label={`Classify ${source.filename}`} value={reviewKind} onChange={(event) => setSourceReviewKinds((current) => ({ ...current, [source.id]: event.target.value as SourceKind }))}><option value="job_description">Job description</option><option value="call_notes">Client notes</option><option value="pasted_text">Instructions</option></select><Button size="sm" variant="outline" onClick={() => void reviewJobSource(source.id, reviewKind)}>Use</Button></> : null}
          </div>;
        })}</div>
        <Button size="sm" variant="outline" onClick={() => openPasteDialog("job")}><Link2 size={15} />Paste text</Button>
      </section> : null}

      {pageError ? <div className="error-banner"><AlertTriangle size={17} />{pageError}<Button size="sm" variant="outline" onClick={() => { setLoading(true); setPageError(""); void loadWorkspace(); }}>Retry</Button></div> : null}

      <section
        ref={deskGridRef}
        className={`desk-grid${notesFocused ? " notes-focus" : ""}${isDragging ? " is-resizing" : ""}`}
        style={notesFocused ? undefined : { gridTemplateColumns: `minmax(280px, ${splitRatio}%) 8px minmax(280px, calc(${100 - splitRatio}% - 8px))` }}
      >
        <section className="notes-pane" aria-label="Apple Pencil and typed notes">
          <div className="pane-toolbar notes-toolbar">
            <div><h2>Notes</h2><span className={`save-state ${caseSaveState}`}>{saveLabel(caseSaveState)}</span></div>
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
          <div className="source-area">
            <button type="button" className="source-toggle" aria-expanded={sourcePanelOpen} onClick={() => setSourcePanelOpen((open) => !open)}>
              <span>Candidate sources</span>
              <small>{sourcePanelOpen ? "Collapse" : "Add or review"}</small>
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
                <span><strong>Drop the resume, transcript, or call notes</strong><small>Files are parsed and classified automatically</small></span>
              </button>
              <div className="source-controls">
                <Button size="sm" variant="outline" disabled={!activeCase || sourceBusy} onClick={() => openPasteDialog("candidate")}><Link2 size={15} aria-hidden="true" />Paste text</Button>
              </div>
              <div className="source-summary" aria-label="Attached source status">{activeCase?.sources.length ? activeCase.sources.map((source) => {
              const needsClassification = source.lifecycleStatus === "parsed" && source.classificationMethod === "uncertain";
              const reviewKind = sourceReviewKinds[source.id] || (source.kind === "other" ? "call_notes" : source.kind);
              return <div className="source-row" key={source.id}>
                <div className="source-row-copy"><strong title={source.filename}>{source.filename}</strong><span>{SOURCE_KIND_LABELS[source.kind]}</span></div>
                <span className={`source-status ${source.lifecycleStatus}`}>{source.lifecycleStatus}</span>
                {needsClassification ? <select aria-label={`Classify ${source.filename}`} value={reviewKind} onChange={(event) => setSourceReviewKinds((current) => ({ ...current, [source.id]: event.target.value as SourceKind }))}>{(["resume", "transcript", "job_description", "call_notes"] as SourceKind[]).map((kind) => <option key={kind} value={kind}>{SOURCE_KIND_LABELS[kind]}</option>)}</select> : null}
                {needsClassification ? <Button size="sm" variant="outline" disabled={sourceBusy} onClick={() => void reviewSource(source.id, reviewKind)}>Use</Button> : null}
                {source.lifecycleStatus === "uploaded" ? <small>Could not read automatically</small> : null}
              </div>;
              }) : <span>No sources attached.</span>}</div>
            </div> : null}
          </div>
        </section>

        {!notesFocused ? <div className="pane-resizer" role="separator" aria-orientation="vertical" aria-label="Resize Notes and Resume panes" aria-valuenow={Math.round(splitRatio)} aria-valuemin={25} aria-valuemax={75} tabIndex={0} onPointerDown={startResize} onKeyDown={(event) => { if (event.key === "ArrowLeft") setSplitRatio((ratio) => Math.max(25, ratio - 3)); if (event.key === "ArrowRight") setSplitRatio((ratio) => Math.min(75, ratio + 3)); }}><div className="resizer-handle" /></div> : null}

        <section className="document-pane" aria-label="Candidate resume reference" aria-hidden={notesFocused}>
          {activeCase ? <>
            <div className="pane-toolbar resume-toolbar">
              <div><h2>{resumeView === "source" ? "Source" : "After-call package"}</h2>{selectedResume && resumeView === "source" ? <span className={`source-status ${selectedResume.lifecycleStatus}`}>{sourceIsUsable(selectedResume) ? "ready" : selectedResume.lifecycleStatus}</span> : null}</div>
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
              ? <GeneratedOutputPanel key={`${outputKind}-${activeCase.documents[outputKind].revision}`}
                  activeCase={activeCase}
                  kind={outputKind}
                  onKindChange={(kind) => { if (outputEditSession || outputEditBusy) return; setOutputKind(kind); void loadVersions(kind); }}
                  editing={Boolean(outputEditSession)}
                  editBusy={outputEditBusy}
                  draft={outputDraft}
                  onEdit={() => void beginOutputEdit()}
                  onDraftChange={setOutputDraft}
                  onSave={() => void saveOutputEdit()}
                  onCancel={cancelOutputEdit}
                  versions={outputVersions}
                />
              : <ResumeSourcePreview source={selectedResume} sourceUrl={resumeSourceUrl} onAdd={() => multiFileInput.current?.click()} />}
          </> : <div className="document-empty"><FileText size={34} /><h2>Open a candidate</h2><p>Select a Job folder and candidate. The attached resume stays visible while you take notes.</p></div>}
        </section>
      </section>

      <section className="action-bar" aria-label="Candidate case actions">
        <div className="after-call-progress"><span>{afterCallReadyCount === 3 ? "Sources ready" : "Add the remaining source files"}</span><small>Resume · call evidence · Job description</small></div>
        <Button disabled={!activeCase || packageBusy || Boolean(outputEditSession) || outputEditBusy} onClick={() => void executeCapability("write-up")}>{packageBusy ? <LoaderCircle className="spin" size={18} /> : <Play size={18} aria-hidden="true" />}Create after-call package</Button>
        <Button variant="outline" disabled={!activeCase} onClick={() => { setResumeView("form"); void loadVersions(outputKind); }}>Open outputs</Button>
        <output className="action-message" aria-live="polite">{actionMessage}</output>
      </section>

      <Dialog open={Boolean(creationMode)} onOpenChange={(open) => { if (!open) setCreationMode(null); }}><DialogContent><DialogHeader><DialogTitle>{creationMode === "role" ? "New Job folder" : "Add candidate"}</DialogTitle><DialogDescription>{creationMode === "role" ? "Save the role and company for reusable Job context." : "Save the candidate for use across recruiter workflows."}</DialogDescription></DialogHeader><div className="dialog-fields"><label>{creationMode === "role" ? "Job title" : "Candidate name"}<Input value={creationPrimary} onChange={(event) => setCreationPrimary(event.target.value)} /></label><label>{creationMode === "role" ? "Client or company" : "Current title"}<Input value={creationSecondary} onChange={(event) => setCreationSecondary(event.target.value)} /></label></div><DialogFooter><Button variant="outline" onClick={() => setCreationMode(null)}>Cancel</Button><Button onClick={() => void submitCreation()} disabled={!creationPrimary.trim()}>Add</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}><DialogContent><DialogHeader><DialogTitle>{pendingJobFile ? "Review Job source" : `Paste ${pasteScope === "job" ? "Job source" : "candidate source"}`}</DialogTitle><DialogDescription>{pendingJobFile ? "The original file stays unchanged. Review only the detected classification and Job identity." : "Paste the whole source. The workstation classifies it, names it, and extracts Job identity when the text supports it."}</DialogDescription></DialogHeader><Textarea value={pastedSource} readOnly={Boolean(pendingJobFile)} onChange={(event) => {
        const value = event.target.value;
        setPastedSource(value);
        setPastedKindOverride("");
        if (pasteScope === "job" && !roleId) {
          const proposal = proposePastedSource(value);
          setPastedJobTitle(proposal.job?.title ?? "");
          setPastedJobClient(proposal.job?.client ?? "");
        }
      }} placeholder={pendingJobFile ? "No extractable text was found in this file." : "Paste the source text exactly as received."} className="paste-source-textarea" />
        <section className="paste-detection" aria-live="polite"><div><strong>Detected source</strong><span>{SOURCE_KIND_LABELS[effectivePastedKind]} · {effectivePastedFilename}</span></div>{pasteScope === "job" && !roleId ? <><label className="paste-kind-review">Source type<select value={effectivePastedKind} onChange={(event) => setPastedKindOverride(event.target.value as SourceKind)}><option value="job_description">Job description</option><option value="pasted_text">Instructions</option><option value="call_notes">Client notes</option><option value="other">Other</option></select></label><div className={`paste-confidence ${effectivePastedProposal.job?.confidence ?? "low"}`}>{effectivePastedProposal.job?.autoCreateEligible ? "Complete Job identity detected" : "Review the Job identity before saving"}</div><div className="paste-job-fields"><label>Job title<Input value={pastedJobTitle} onChange={(event) => setPastedJobTitle(event.target.value)} placeholder="Not found in the source" /></label><label>Company or client<Input value={pastedJobClient} onChange={(event) => setPastedJobClient(event.target.value)} placeholder="Not found in the source" /></label></div>{effectivePastedProposal.job?.evidence.length ? <small>Found in source: {effectivePastedProposal.job.evidence.join(" | ")}</small> : <small>No Job identity was inferred. Unknown values stay blank.</small>}</> : pasteScope === "job" ? <small>This source will be attached to the selected Job folder.</small> : <small>This source will be attached to the selected candidate case.</small>}</section>
        <DialogFooter><Button variant="outline" onClick={() => setPasteOpen(false)}>Cancel</Button><Button disabled={!pastedSourceCanSave} onClick={() => void savePastedSource()}>{pastedSaveLabel}</Button></DialogFooter></DialogContent></Dialog>

      <WorkflowBrowser
        open={workflowsOpen}
        onOpenChange={setWorkflowsOpen}
        activeCaseId={activeCase?.id ?? null}
        activeCaseAvailable={Boolean(activeCase)}
        contextInputValues={{
          candidate_full_name: candidates.find((candidate) => candidate.id === candidateId)?.name ?? "",
          job_title: roles.find((role) => role.id === roleId)?.title ?? "",
          company_name: roles.find((role) => role.id === roleId)?.client ?? "",
        }}
        onExecute={executeCapability}
        onReviewArtifact={reviewCaseArtifact}
        runs={capabilityRuns}
        runsLoading={capabilityRunsLoading}
        runsError={capabilityRunsError}
        artifacts={caseArtifacts}
        artifactsLoading={caseArtifactsLoading}
        artifactsError={caseArtifactsError}
      />

    </main>
  );
}

function ContextSelect({ label, value, onChange, onAdd, disabled, children }: { label: string; value: string; onChange: (value: string) => void; onAdd: () => void; disabled: boolean; children: React.ReactNode }) {
  return <div className="context-control"><span>{label}</span><div className="context-select-row"><div className="select-wrap"><select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>{children}</select><ChevronDown size={16} /></div><Button size="icon" variant="outline" onClick={onAdd} aria-label={`Add ${label.toLowerCase()}`}><Plus size={18} /></Button></div></div>;
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
    <div className="output-tabs" role="tablist">
      {(["resume", "submission", "email", "loxo_update"] as OutputKind[]).map((item) => <button key={item} type="button" role="tab" aria-selected={kind === item} disabled={editing || editBusy} onClick={() => onKindChange(item)}>{({ resume: "Resume draft", submission: "Submission", email: "Email", loxo_update: "Loxo notes" })[item]}</button>)}
    </div>
    <div className="output-version-row"><span>{editing ? "Editing current version" : "Read-only preview"}</span><div className="output-version-actions"><label>Version<select disabled={editing || editBusy} value={effectiveRevision} onChange={(event) => setViewRevision(Number(event.target.value))}><option value={document.revision}>Current · v{document.revision}</option>{versions.filter((version) => version.revision !== document.revision).map((version) => <option key={version.revision} value={version.revision}>v{version.revision} · {version.origin}</option>)}</select></label>{!editing && effectiveRevision === document.revision ? <Button size="sm" variant="outline" disabled={editBusy} onClick={onEdit}>{editBusy ? <LoaderCircle className="spin" size={15} /> : <Edit3 size={15} />}Edit</Button> : null}</div></div>
    {editing ? <div className="output-editor" aria-label={`Edit current ${kind}`}>
      {kind === "resume" ? <ResumeFormEditor value={toResumeForm(draft)} onChange={onDraftChange} /> : null}
      {kind === "submission" ? <SubmissionForm value={contentAsSubmission({ ...document, content: draft ?? {} })} onChange={onDraftChange} /> : null}
      {kind === "email" || kind === "loxo_update" ? <Textarea value={typeof draft === "string" ? draft : ""} onChange={(event) => onDraftChange(event.target.value)} aria-label={`Edit ${kind}`} /> : null}
      <div className="output-edit-actions"><Button variant="outline" disabled={editBusy} onClick={onCancel}>Cancel</Button><Button disabled={editBusy} onClick={onSave}>{editBusy ? <LoaderCircle className="spin" size={16} /> : null}Save changes</Button></div>
    </div> : <article className="output-preview">
      {kind === "resume" ? <><h2>{resume.name || "Resume draft"}</h2>{resume.headline ? <h3>{resume.headline}</h3> : null}{resume.summary ? <section><h4>Professional Summary</h4><p>{resume.summary}</p></section> : null}{resume.skills ? <section><h4>Core Competencies &amp; Skills</h4><p className="preserve-lines">{resume.skills}</p></section> : null}{resume.jobs.length ? <section><h4>Professional Experience</h4>{resume.jobs.map((job, index) => <div key={index} className="preview-job"><strong>{job.title}</strong><span>{[job.company, job.location, job.dates].filter(Boolean).join(" · ")}</span><p className="preserve-lines">{job.bullets}</p></div>)}</section> : null}</> : null}
      {kind === "submission" ? <><h2>Candidate submission</h2><dl>{Object.entries(submission).filter(([, value]) => value.trim()).map(([key, value]) => <div key={key}><dt>{key.replace(/([A-Z])/g, " $1")}</dt><dd>{value}</dd></div>)}</dl>{missing.length ? <aside className="needs-confirmation"><strong>Needs confirmation</strong><ul>{missing.map((item) => <li key={item}>{item}</li>)}</ul></aside> : null}</> : null}
      {kind === "email" || kind === "loxo_update" ? <><h2>{kind === "email" ? "Presentation email" : "Loxo update bullets"}</h2><pre>{typeof content === "string" && content.trim() ? content : "No source-backed content yet."}</pre></> : null}
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
