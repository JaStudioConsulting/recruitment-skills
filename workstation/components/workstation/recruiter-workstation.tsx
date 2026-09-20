"use client";

import {
  AlertTriangle,
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
import { createAutofilledDraft } from "@/lib/capabilities/deterministic-autofill";
import { featureById } from "@/lib/capabilities/catalog";
import type { CapabilityRunsDocument } from "@/lib/capabilities/types";
import { mergeCandidateCaseSnapshots } from "@/lib/case-merge";
import { toResumeForm } from "@/lib/resume-form";
import {
  EMPTY_RESUME,
  EMPTY_SUBMISSION,
  STORED_DOCUMENT_KINDS,
  type CandidateCase,
  type CandidateRecord,
  type CaseDocument,
  type CaseSource,
  type DocumentVersion,
  type JobSource,
  type RoleRecord,
  type SaveState,
  type SourceKind,
  type StoredDocumentKind,
  type SubmissionDocument,
} from "@/lib/workstation-types";
import { sourceIsUsable } from "@/lib/server/source-intake";

type User = { id: string; displayName: string };
type CreationMode = "role" | "candidate" | null;
type NotesMode = "type" | "draw";

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
type OutputKind = "resume" | "submission" | "email" | "loxo_update";

function sourceReadinessState(sources: CaseSource[], kinds: SourceKind[]): SourceReadinessState {
  const matches = sources.filter((source) => kinds.includes(source.kind));
  if (matches.some(sourceIsUsable)) return "reviewed";
  return matches.length ? "attached" : "missing";
}

function saveLabel(state: SaveState) {
  return { saved: "Saved", saving: "Saving", unsaved: "Unsaved", failed: "Save failed" }[state];
}

function pastedSourceFilename(title: string) {
  const cleanTitle = title.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").slice(0, 100);
  return cleanTitle.toLowerCase().endsWith(".txt") ? cleanTitle : `${cleanTitle}.txt`;
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

function contentAsCapabilityRuns(document: CaseDocument | undefined): CapabilityRunsDocument {
  if (document?.content && typeof document.content === "object" && !Array.isArray(document.content) && !("blocks" in document.content) && !("format" in document.content)) {
    return document.content as CapabilityRunsDocument;
  }
  return {};
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
  const [documentSaveState, setDocumentSaveState] = useState<SaveState>("saved");
  const [actionMessage, setActionMessage] = useState("");
  const [resumeView, setResumeView] = useState<"source" | "form">("source");
  const [resumeSourceId, setResumeSourceId] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteScope, setPasteScope] = useState<"job" | "candidate">("candidate");
  const [pastedSourceTitle, setPastedSourceTitle] = useState("");
  const [pastedSource, setPastedSource] = useState("");
  const [sourceBusy, setSourceBusy] = useState(false);
  const [sourcePanelOpen, setSourcePanelOpen] = useState(true);
  const [dropActive, setDropActive] = useState(false);
  const [jobDropActive, setJobDropActive] = useState(false);
  const [sourceReviewKinds, setSourceReviewKinds] = useState<Record<string, SourceKind>>({});
  const [splitRatio, setSplitRatio] = useState(55);
  const [outputKind, setOutputKind] = useState<OutputKind>("submission");
  const [outputEditing, setOutputEditing] = useState(false);
  const [outputDraft, setOutputDraft] = useState<CaseDocument["content"] | null>(null);
  const [outputVersions, setOutputVersions] = useState<DocumentVersion[]>([]);
  const [packageBusy, setPackageBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const deskGridRef = useRef<HTMLDivElement | null>(null);
  const caseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const documentTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const multiFileInput = useRef<HTMLInputElement | null>(null);
  const jobFileInput = useRef<HTMLInputElement | null>(null);
  const activeCaseRef = useRef<CandidateCase | null>(null);
  const caseDraftRef = useRef({ notes: "", notesDrawingSvg: "", notesFont: "System", notesSize: 20, status: "active" });
  const caseEditVersionRef = useRef(0);
  const caseSavePromiseRef = useRef<Promise<boolean> | null>(null);
  const documentDraftRef = useRef<Record<StoredDocumentKind, CaseDocument["content"]>>({
    resume: EMPTY_RESUME,
    write_up: "",
    submission: { ...EMPTY_SUBMISSION },
    email: "",
    loxo_update: "",
    capability_runs: {},
  });
  const documentVersionRef = useRef<Record<StoredDocumentKind, number>>({ resume: 0, write_up: 0, submission: 0, email: 0, loxo_update: 0, capability_runs: 0 });
  const documentSavedVersionRef = useRef<Record<StoredDocumentKind, number>>({ resume: 0, write_up: 0, submission: 0, email: 0, loxo_update: 0, capability_runs: 0 });
  const documentSavePromisesRef = useRef<Partial<Record<StoredDocumentKind, Promise<boolean>>>>({});

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

  const replaceCase = useCallback((next: CandidateCase) => {
    storeCaseRecord(next);
    setNotes(next.notes);
    setNotesDrawingSvg(next.notesDrawingSvg);
    setNotesMode(next.notesDrawingSvg ? "draw" : next.notes.trim() ? "type" : "draw");
    setNotesFont(next.notesFont);
    setNotesSize(next.notesSize);
    setCaseStatus(next.status);
    setOutputEditing(false);
    setOutputDraft(null);
    setOutputVersions([]);
    const resumeSources = next.sources
      .filter((source) => source.kind === "resume")
      .sort((left, right) => right.captureTime.localeCompare(left.captureTime));
    setResumeSourceId(resumeSources[0]?.id ?? "");
    caseDraftRef.current = { notes: next.notes, notesDrawingSvg: next.notesDrawingSvg, notesFont: next.notesFont, notesSize: next.notesSize, status: next.status };
    caseEditVersionRef.current = 0;
    documentDraftRef.current = {
      resume: toResumeForm(next.documents.resume?.content),
      write_up: contentAsString(next.documents.write_up),
      submission: contentAsSubmission(next.documents.submission),
      email: contentAsString(next.documents.email),
      loxo_update: contentAsString(next.documents.loxo_update),
      capability_runs: contentAsCapabilityRuns(next.documents.capability_runs),
    };
    documentVersionRef.current = { resume: 0, write_up: 0, submission: 0, email: 0, loxo_update: 0, capability_runs: 0 };
    documentSavedVersionRef.current = { resume: 0, write_up: 0, submission: 0, email: 0, loxo_update: 0, capability_runs: 0 };
    setCaseSaveState("saved");
    setDocumentSaveState("saved");
  }, [storeCaseRecord]);

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
    const uploadCaseId = activeCase.id;
    if (caseSaveState !== "saved" && !(await persistCase())) return;
    if (documentSaveState !== "saved" && !(await flushDocuments())) return;
    setSourceBusy(true);
    setActionMessage(`Uploading ${files.length} source${files.length === 1 ? "" : "s"}...`);
    try {
      const next = await workstationApi.uploadSources(uploadCaseId, files, kinds);
      if (activeCaseRef.current?.id === uploadCaseId) replaceCase(next);
      else cacheCaseRecord(next);
      setActionMessage(`${files.length} immutable source${files.length === 1 ? "" : "s"} added. Review the status below.`);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "The source could not be uploaded.");
    } finally {
      setSourceBusy(false);
    }
  };

  const reviewSource = async (sourceId: string, kind?: SourceKind) => {
    if (!activeCase || sourceBusy) return;
    const reviewCaseId = activeCase.id;
    setSourceBusy(true);
    setActionMessage("Saving source review...");
    try {
      if (caseSaveState !== "saved" && !(await persistCase())) return;
      if (documentSaveState !== "saved" && !(await flushDocuments())) return;
      const before = contentAsSubmission(activeCaseRef.current?.documents.submission);
      const next = await workstationApi.reviewSource(reviewCaseId, sourceId, kind);
      const after = contentAsSubmission(next.documents.submission);
      const filled = (Object.keys(PREFILL_FIELD_LABELS) as Array<keyof SubmissionDocument>)
        .filter((field) => !before[field].trim() && after[field].trim())
        .map((field) => PREFILL_FIELD_LABELS[field]);
      if (activeCaseRef.current?.id !== reviewCaseId) {
        cacheCaseRecord(next);
      } else {
        const hasLocalEdits = caseEditVersionRef.current > 0 || STORED_DOCUMENT_KINDS.some(
          (item) => documentVersionRef.current[item] !== documentSavedVersionRef.current[item],
        );
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

  const uploadJobSources = async (files: readonly File[], kinds: readonly SourceKind[] = []) => {
    if (!roleId || files.length === 0 || sourceBusy) return;
    setSourceBusy(true);
    setActionMessage(`Adding ${files.length} source${files.length === 1 ? "" : "s"} to this Job...`);
    try {
      const next = await workstationApi.uploadJobSources(roleId, files, kinds);
      setJobSourcesByRoleId((current) => ({ ...current, [roleId]: next }));
      const uncertain = next.filter((source) => source.lifecycleStatus === "parsed" && source.classificationMethod === "uncertain").length;
      setActionMessage(uncertain
        ? `${files.length} source${files.length === 1 ? "" : "s"} added. ${uncertain} needs one classification.`
        : `${files.length} Job source${files.length === 1 ? "" : "s"} parsed and ready.`);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "The Job source could not be uploaded.");
    } finally {
      setSourceBusy(false);
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
    if (!activeCaseRef.current) return;
    try {
      setOutputVersions(await workstationApi.listDocumentVersions(activeCaseRef.current.id, kind));
    } catch {
      setOutputVersions([]);
    }
  }, []);

  const saveOutputEdit = async () => {
    const current = activeCaseRef.current;
    if (!current || outputDraft === null) return;
    setDocumentSaveState("saving");
    try {
      const document = await workstationApi.saveDocument(current.id, outputKind, {
        expectedRevision: current.documents[outputKind].revision,
        content: outputDraft,
      });
      storeCaseRecord({ ...current, documents: { ...current.documents, [outputKind]: document } });
      setOutputEditing(false);
      setOutputDraft(null);
      setDocumentSaveState("saved");
      await loadVersions(outputKind);
      setActionMessage(`Saved version ${document.revision}.`);
    } catch (error) {
      setDocumentSaveState("failed");
      setActionMessage(error instanceof Error ? error.message : "The output could not be saved.");
    }
  };

  const createAfterCallPackage = async () => {
    const current = activeCaseRef.current;
    if (!current || packageBusy) return;
    const feature = featureById("write-up-candidate");
    if (!feature) return;
    const shared = (jobSourcesByRoleId[current.roleId] ?? []).filter((source) => source.contextStatus === "active");
    const effectiveCase = { ...current, sources: [...current.sources, ...shared] };
    const required = {
      resume: effectiveCase.sources.some((source) => source.kind === "resume" && sourceIsUsable(source)),
      call: effectiveCase.sources.some((source) => (source.kind === "call_notes" || source.kind === "transcript") && sourceIsUsable(source)) || Boolean(current.notes.trim()),
      job: effectiveCase.sources.some((source) => source.kind === "job_description" && sourceIsUsable(source)),
    };
    const missing = [!required.resume && "candidate resume", !required.call && "call notes or transcript", !required.job && "Job description"].filter(Boolean);
    if (missing.length) {
      setActionMessage(`Add ${missing.join(", ")} first. Clear files are parsed automatically.`);
      return;
    }
    setPackageBusy(true);
    setActionMessage("Creating source-grounded package...");
    try {
      const draft = createAutofilledDraft(feature, effectiveCase);
      const nextSubmission = draft.submission ?? contentAsSubmission(current.documents.submission);
      const activeRole = roles.find((role) => role.id === current.roleId);
      const name = nextSubmission.name.trim();
      const roleTitle = activeRole?.title.trim() ?? "";
      const email = [
        name && roleTitle ? `Presenting ${name} for the ${roleTitle} opportunity.` : "",
        nextSubmission.profileSummary.trim(),
        "CV attached.",
      ].filter(Boolean).join("\n\n");
      const loxo = [
        nextSubmission.compensationTarget && `- Salary expectation: ${nextSubmission.compensationTarget}`,
        nextSubmission.location && `- Location: ${nextSubmission.location}`,
        nextSubmission.startDateNotice && `- Start date / notice: ${nextSubmission.startDateNotice}`,
        nextSubmission.interviewAvailability && `- Interview availability: ${nextSubmission.interviewAvailability}`,
      ].filter(Boolean).join("\n");
      const packageValues: Array<[OutputKind, CaseDocument["content"]]> = [
        ["resume", draft.resume ?? current.documents.resume.content],
        ["submission", nextSubmission],
        ["email", email],
        ["loxo_update", loxo],
      ];
      const sourceRefs = effectiveCase.sources.filter(sourceIsUsable).map((source) => `${source.id}:${source.sha256}`);
      let nextCase = activeCaseRef.current!;
      for (const [kind, content] of packageValues) {
        const document = await workstationApi.saveDocument(nextCase.id, kind, {
          expectedRevision: nextCase.documents[kind].revision,
          content,
          origin: "generated",
          sourceRefs,
        });
        nextCase = { ...nextCase, documents: { ...nextCase.documents, [kind]: document } };
        storeCaseRecord(nextCase);
      }
      setOutputKind("submission");
      setResumeView("form");
      setOutputEditing(false);
      await loadVersions("submission");
      const unknowns = Object.entries(nextSubmission).filter(([, value]) => !value.trim()).length;
      setActionMessage(`Package created. ${unknowns} item${unknowns === 1 ? "" : "s"} need confirmation; nothing was invented.`);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "The package could not be created.");
    } finally {
      setPackageBusy(false);
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


  if (loading && !roles.length && !candidates.length) {
    return <main className="center-state"><LoaderCircle className="spin" /> Loading workstation</main>;
  }

  return (
    <main className="workstation-shell">
      <header className="brand-bar">
        <div className="brand-lockup"><span className="brand-wordmark">TOP TIER TALENT GROUP</span><span className="brand-line" /></div>
        <div className="brand-title"><h1>Recruiter Workstation</h1><span>One workspace. From conversation to submission.</span></div>
        <div className="operator"><span className={`save-dot ${caseSaveState}`}><Check size={13} /></span><span>{saveLabel(caseSaveState)}</span><span className="operator-name">{user.displayName}</span></div>
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
        <div className="job-breadcrumb"><FolderOpen size={16} /><span>{roles.find((role) => role.id === roleId)?.title ?? "Choose a Job folder"}</span>{activeCase ? <><span>/</span><strong>{candidates.find((candidate) => candidate.id === candidateId)?.name}</strong></> : null}</div>
      </section>

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
        <Button size="sm" variant="outline" onClick={() => { setPasteScope("job"); setPasteOpen(true); }}><Link2 size={15} />Paste text</Button>
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
                <Button size="sm" variant="outline" disabled={!activeCase || sourceBusy} onClick={() => { setPasteScope("candidate"); setPasteOpen(true); }}><Link2 size={15} aria-hidden="true" />Paste text</Button>
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
                {resumeView === "form" && !outputEditing ? <Button size="sm" variant="outline" onClick={() => { setOutputDraft(activeCase.documents[outputKind].content); setOutputEditing(true); }}><Edit3 size={15} />Edit</Button> : null}
              </div>
            </div>
            {resumeView === "form"
              ? <GeneratedOutputPanel key={`${outputKind}-${activeCase.documents[outputKind].revision}`}
                  activeCase={activeCase}
                  kind={outputKind}
                  onKindChange={(kind) => { setOutputKind(kind); setOutputEditing(false); setOutputDraft(null); void loadVersions(kind); }}
                  editing={outputEditing}
                  draft={outputDraft}
                  onDraftChange={setOutputDraft}
                  onSave={() => void saveOutputEdit()}
                  onCancel={() => { setOutputEditing(false); setOutputDraft(null); }}
                  versions={outputVersions}
                />
              : <ResumeSourcePreview source={selectedResume} sourceUrl={resumeSourceUrl} onAdd={() => multiFileInput.current?.click()} />}
          </> : <div className="document-empty"><FileText size={34} /><h2>Open a candidate</h2><p>Select a Job folder and candidate. The attached resume stays visible while you take notes.</p></div>}
        </section>
      </section>

      <section className="action-bar" aria-label="Candidate case actions">
        <div className="after-call-progress"><span>{afterCallReadyCount === 3 ? "Sources ready" : "Add the remaining source files"}</span><small>Resume · call evidence · Job description</small></div>
        <Button disabled={!activeCase || packageBusy} onClick={() => void createAfterCallPackage()}>{packageBusy ? <LoaderCircle className="spin" size={18} /> : <Play size={18} aria-hidden="true" />}Create after-call package</Button>
        <Button variant="outline" disabled={!activeCase} onClick={() => { setResumeView("form"); void loadVersions(outputKind); }}>Open outputs</Button>
        <output className="action-message" aria-live="polite">{actionMessage}</output>
      </section>

      <Dialog open={Boolean(creationMode)} onOpenChange={(open) => { if (!open) setCreationMode(null); }}><DialogContent><DialogHeader><DialogTitle>{creationMode === "role" ? "New Job folder" : "Add candidate"}</DialogTitle><DialogDescription>This creates an internal workstation record only. It does not create a Loxo or Tracker record.</DialogDescription></DialogHeader><div className="dialog-fields"><label>{creationMode === "role" ? "Job title" : "Candidate name"}<Input value={creationPrimary} onChange={(event) => setCreationPrimary(event.target.value)} /></label><label>{creationMode === "role" ? "Client or company" : "Current title"}<Input value={creationSecondary} onChange={(event) => setCreationSecondary(event.target.value)} /></label></div><DialogFooter><Button variant="outline" onClick={() => setCreationMode(null)}>Cancel</Button><Button onClick={() => void submitCreation()} disabled={!creationPrimary.trim()}>Add</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}><DialogContent><DialogHeader><DialogTitle>Paste {pasteScope === "job" ? "Job knowledge" : "candidate source"}</DialogTitle><DialogDescription>The original text is stored unchanged, then parsed and classified automatically.</DialogDescription></DialogHeader><label className="paste-kind">Title<Input value={pastedSourceTitle} onChange={(event) => setPastedSourceTitle(event.target.value)} placeholder={pasteScope === "job" ? "Example: Maintenance Manager JD" : "Example: September 18 screening call"} /></label><Textarea value={pastedSource} onChange={(event) => setPastedSource(event.target.value)} placeholder="Paste the source text exactly as received." className="paste-source-textarea" /><DialogFooter><Button variant="outline" onClick={() => setPasteOpen(false)}>Cancel</Button><Button disabled={(pasteScope === "job" ? !roleId : !activeCase) || !pastedSourceTitle.trim() || !pastedSource.trim() || sourceBusy} onClick={() => { if (!pastedSourceTitle.trim() || !pastedSource.trim()) return; const file = new File([pastedSource], pastedSourceFilename(pastedSourceTitle), { type: "text/plain" }); setPasteOpen(false); setPastedSourceTitle(""); setPastedSource(""); if (pasteScope === "job") void uploadJobSources([file]); else void uploadSources([file]); }}>Save source</Button></DialogFooter></DialogContent></Dialog>

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
  draft,
  onDraftChange,
  onSave,
  onCancel,
  versions,
}: {
  activeCase: CandidateCase;
  kind: OutputKind;
  onKindChange: (kind: OutputKind) => void;
  editing: boolean;
  draft: CaseDocument["content"] | null;
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
      {(["resume", "submission", "email", "loxo_update"] as OutputKind[]).map((item) => <button key={item} type="button" role="tab" aria-selected={kind === item} onClick={() => onKindChange(item)}>{({ resume: "Branded resume", submission: "Submission", email: "Email", loxo_update: "Loxo notes" })[item]}</button>)}
    </div>
    <div className="output-version-row"><span>Read-only preview</span><label>Version<select value={effectiveRevision} onChange={(event) => setViewRevision(Number(event.target.value))}><option value={document.revision}>Current · v{document.revision}</option>{versions.filter((version) => version.revision !== document.revision).map((version) => <option key={version.revision} value={version.revision}>v{version.revision} · {version.origin}</option>)}</select></label></div>
    {editing ? <div className="output-editor">
      {kind === "resume" ? <ResumeFormEditor value={toResumeForm(draft)} onChange={onDraftChange} /> : null}
      {kind === "submission" ? <SubmissionForm value={contentAsSubmission({ ...document, content: draft ?? {} })} onChange={onDraftChange} /> : null}
      {kind === "email" || kind === "loxo_update" ? <Textarea value={typeof draft === "string" ? draft : ""} onChange={(event) => onDraftChange(event.target.value)} aria-label={`Edit ${kind}`} /> : null}
      <div className="output-edit-actions"><Button variant="outline" onClick={onCancel}>Cancel</Button><Button onClick={onSave}>Save changes</Button></div>
    </div> : <article className="output-preview">
      {kind === "resume" ? <><h2>{resume.name || "Branded resume"}</h2>{resume.headline ? <h3>{resume.headline}</h3> : null}{resume.summary ? <section><h4>Professional Summary</h4><p>{resume.summary}</p></section> : null}{resume.skills ? <section><h4>Core Competencies &amp; Skills</h4><p className="preserve-lines">{resume.skills}</p></section> : null}{resume.jobs.length ? <section><h4>Professional Experience</h4>{resume.jobs.map((job, index) => <div key={index} className="preview-job"><strong>{job.title}</strong><span>{[job.company, job.location, job.dates].filter(Boolean).join(" · ")}</span><p className="preserve-lines">{job.bullets}</p></div>)}</section> : null}</> : null}
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
