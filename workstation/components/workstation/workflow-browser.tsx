"use client";

import { AlertTriangle, CheckCircle2, CircleDashed, ExternalLink, FileCheck2, LoaderCircle, Play, Search, ShieldCheck, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ARTIFACT_VISUAL_QA_CHECKS,
  artifactDownloadUrl,
  artifactKindLabel,
  buildArtifactVisualQaReview,
  formatArtifactBytes,
  type ArtifactVisualQaCheck,
  type ArtifactVisualQaPageDraft,
  type ArtifactVisualQaReview,
  type ArtifactVisualQaReviewResult,
  type CaseArtifactSummary,
} from "@/lib/artifact-browser";
import {
  CAPABILITY_REGISTRY,
  WORKFLOW_GROUPS,
  capabilitiesForGroup,
  implementationCounts,
  type CapabilityRegistryItem,
  type ImplementationStatus,
  type WorkflowGroup,
} from "@/lib/capabilities/registry";
import { featureByPrimaryCapability } from "@/lib/capabilities/catalog";
import type { CapabilityRunRecord } from "@/lib/server/capability-run-repository";

const GROUP_LABELS: Record<WorkflowGroup, string> = {
  candidate_work: "Candidate work",
  job_client_work: "Job and client work",
  sourcing: "Sourcing",
  pipeline_tracker: "Pipeline and Tracker",
  writing: "Writing",
  artifacts: "Artifacts and supporting tools",
};

const STATUS_LABELS: Record<ImplementationStatus, string> = {
  working: "Working",
  partial: "Partial",
  interface_only: "Interface only",
  blocked: "Blocked",
  not_applicable: "Not a direct workflow",
};

const APPROVAL_LABELS = {
  none: "No external approval",
  preview: "Review required before use",
  explicit: "Explicit approval required",
} as const;

function operationApprovalSummary(item: CapabilityRegistryItem) {
  return item.operations.map((operation) => `${operation.label}: ${APPROVAL_LABELS[operation.approval]}`).join(" · ");
}

type WorkflowBrowserProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeCaseId: string | null;
  activeCaseAvailable: boolean;
  contextInputValues: Readonly<Record<string, string>>;
  onExecute: (capabilityId: string, extraInput: string) => Promise<void>;
  onReviewArtifact: (
    artifactId: string,
    review: ArtifactVisualQaReview,
  ) => Promise<ArtifactVisualQaReviewResult>;
  runs: readonly CapabilityRunRecord[];
  runsLoading: boolean;
  runsError: string;
  artifacts: readonly CaseArtifactSummary[];
  artifactsLoading: boolean;
  artifactsError: string;
};

export type CapabilityInputField = {
  key: string;
  label: string;
  required: boolean;
  allowedValues: string[];
  multiline: boolean;
};

function humanizeInputKey(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function capabilityInputFields(item: CapabilityRegistryItem): CapabilityInputField[] {
  const executor = featureByPrimaryCapability(item.id);
  return (executor?.requirements ?? []).flatMap((requirement) => {
    if (requirement.kind !== "user_input" && requirement.kind !== "source_or_input") return [];
    const keys = requirement.input_keys?.length ? requirement.input_keys : [requirement.id];
    return keys.map((key) => ({
      key,
      label: keys.length === 1 ? requirement.label : `${requirement.label}: ${humanizeInputKey(key)}`,
      required: requirement.required,
      allowedValues: [...(requirement.allowed_values ?? [])],
      multiline: /(?:achievement|brief|detail|evidence|finding|instruction|ledger|note|research|source)/i.test(key),
    }));
  });
}

export function serializeCapabilityInputs(values: Readonly<Record<string, string>>): string {
  const entries = Object.entries(values)
    .map(([key, value]) => [key, value.trim()] as const)
    .filter(([, value]) => Boolean(value))
    .sort(([left], [right]) => left.localeCompare(right));
  return entries.length ? JSON.stringify(Object.fromEntries(entries)) : "";
}

export function resolveCapabilityInputValues(
  fields: readonly CapabilityInputField[],
  contextValues: Readonly<Record<string, string>>,
  enteredValues: Readonly<Record<string, string>>,
): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [
    field.key,
    Object.prototype.hasOwnProperty.call(enteredValues, field.key)
      ? enteredValues[field.key]
      : contextValues[field.key] ?? "",
  ]));
}

export function mountedExecutorFor(item: CapabilityRegistryItem) {
  if (["interface_only", "blocked", "not_applicable"].includes(item.implementation.status)) return undefined;
  return item.executorFeatures.find((feature) => feature.mounted);
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function summarizeRunEvidence(run: CapabilityRunRecord) {
  const evidence = recordValue(run.evidence);
  const documentRevisions = recordValue(evidence?.documentRevisions);
  const sourceLabel = `${run.sourceRefs.length} source reference${run.sourceRefs.length === 1 ? "" : "s"}`;
  const documentCount = documentRevisions ? Object.keys(documentRevisions).length : 0;
  const documentLabel = `${documentCount} persisted output${documentCount === 1 ? "" : "s"}`;
  const errorRecorded = run.error !== null && run.error !== undefined;
  const evidenceLabel = errorRecorded
    ? "failure evidence recorded"
    : evidence && Object.keys(evidence).length
      ? "execution evidence recorded"
      : "no execution evidence recorded";
  return `${sourceLabel} · ${documentLabel} · ${evidenceLabel}`;
}

export function artifactsForRun(
  artifacts: readonly CaseArtifactSummary[],
  runId: string,
) {
  return artifacts.filter((artifact) => artifact.runId === runId);
}

function displayRunTime(value: string) {
  return value.replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

export function WorkflowBrowser({
  open,
  onOpenChange,
  activeCaseId,
  activeCaseAvailable,
  contextInputValues,
  onExecute,
  onReviewArtifact,
  runs,
  runsLoading,
  runsError,
  artifacts,
  artifactsLoading,
  artifactsError,
}: WorkflowBrowserProps) {
  const [selectedId, setSelectedId] = useState("write-up");
  const [query, setQuery] = useState("");
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [capabilityInputs, setCapabilityInputs] = useState<Record<string, Record<string, string>>>({});
  const selected = CAPABILITY_REGISTRY.find((item) => item.id === selectedId) ?? CAPABILITY_REGISTRY[0];
  const selectedInputValues = resolveCapabilityInputValues(
    capabilityInputFields(selected),
    contextInputValues,
    capabilityInputs[selected.id] ?? {},
  );
  const counts = implementationCounts();
  const normalizedQuery = query.trim().toLowerCase();
  const visibleIds = useMemo(() => new Set(CAPABILITY_REGISTRY.filter((item) => {
    if (!normalizedQuery) return true;
    return [item.id, item.label, item.summary, item.output].some((value) => value.toLowerCase().includes(normalizedQuery));
  }).map((item) => item.id)), [normalizedQuery]);

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="workflow-dialog">
      <DialogHeader>
        <DialogTitle>Recruiting workflows</DialogTitle>
        <DialogDescription>All 24 canonical repository capabilities. Status describes proven implementation, not whether a guide exists.</DialogDescription>
      </DialogHeader>
      <div className="workflow-summary" aria-label="Capability implementation summary">
        <SummaryCount label="Working" count={counts.working} status="working" />
        <SummaryCount label="Partial" count={counts.partial} status="partial" />
        <SummaryCount label="Interface only" count={counts.interface_only} status="interface_only" />
        <SummaryCount label="Blocked" count={counts.blocked} status="blocked" />
      </div>
      <div className="workflow-browser-layout">
        <nav className="workflow-browser-nav" aria-label="Repository workflows">
          <label className="workflow-search"><Search size={15} /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a workflow" aria-label="Find a workflow" /></label>
          {WORKFLOW_GROUPS.map((group) => {
            const items = capabilitiesForGroup(group).filter((item) => visibleIds.has(item.id));
            if (!items.length) return null;
            return <section key={group}><h3>{GROUP_LABELS[group]}</h3>{items.map((item) => <button type="button" key={item.id} aria-current={item.id === selected.id ? "page" : undefined} onClick={() => setSelectedId(item.id)}><span>{item.label}</span><StatusBadge status={item.implementation.status} /></button>)}</section>;
          })}
          {visibleIds.size === 0 ? <p className="workflow-search-empty">No repository workflow matches that search.</p> : null}
        </nav>
        <CapabilityDetail
          item={selected}
          activeCaseAvailable={activeCaseAvailable}
          runs={runs.filter((run) => run.capabilityId === selected.id)}
          runsLoading={runsLoading}
          runsError={runsError}
          artifacts={artifacts}
          artifactsLoading={artifactsLoading}
          artifactsError={artifactsError}
          activeCaseId={activeCaseId}
          onReviewArtifact={onReviewArtifact}
          executing={executingId === selected.id}
          inputValues={selectedInputValues}
          onInputChange={(key, value) => setCapabilityInputs((current) => ({
            ...current,
            [selected.id]: { ...(current[selected.id] ?? {}), [key]: value },
          }))}
          onExecute={async () => {
            setExecutingId(selected.id);
            try {
              await onExecute(
                selected.id,
                serializeCapabilityInputs(selectedInputValues),
              );
            } finally {
              setExecutingId(null);
            }
          }}
        />
      </div>
    </DialogContent>
  </Dialog>;
}

function SummaryCount({ label, count, status }: { label: string; count: number; status: ImplementationStatus }) {
  return <div className={`workflow-summary-count ${status}`}><strong>{count}</strong><span>{label}</span></div>;
}

function StatusBadge({ status }: { status: ImplementationStatus }) {
  const Icon = status === "working" ? CheckCircle2 : status === "blocked" ? AlertTriangle : status === "not_applicable" ? ShieldCheck : CircleDashed;
  return <small className={`implementation-status ${status}`}><Icon size={12} />{STATUS_LABELS[status]}</small>;
}

function CapabilityDetail({
  item,
  activeCaseAvailable,
  runs,
  runsLoading,
  runsError,
  artifacts,
  artifactsLoading,
  artifactsError,
  activeCaseId,
  onReviewArtifact,
  executing,
  inputValues,
  onInputChange,
  onExecute,
}: {
  item: CapabilityRegistryItem;
  activeCaseAvailable: boolean;
  runs: readonly CapabilityRunRecord[];
  runsLoading: boolean;
  runsError: string;
  artifacts: readonly CaseArtifactSummary[];
  artifactsLoading: boolean;
  artifactsError: string;
  activeCaseId: string | null;
  onReviewArtifact: (
    artifactId: string,
    review: ArtifactVisualQaReview,
  ) => Promise<ArtifactVisualQaReviewResult>;
  executing: boolean;
  inputValues: Readonly<Record<string, string>>;
  onInputChange: (key: string, value: string) => void;
  onExecute: () => Promise<void>;
}) {
  const mountedExecutor = mountedExecutorFor(item);
  const mountedOperation = item.operations.find((operation) => operation.id === mountedExecutor?.operationId);
  const executionLabel = mountedOperation?.label ?? mountedExecutor?.label ?? "Run workflow";
  const inputFields = capabilityInputFields(item);
  return <article className="workflow-detail">
    <header><div><p className="workflow-id">{item.id}</p><h2>{item.label}</h2></div><StatusBadge status={item.implementation.status} /></header>
    <p className="workflow-summary-copy">{item.summary}</p>
    <div className="workflow-facts"><span>Repository status: <strong>{item.repositoryStatus}</strong></span><span>Operation gates: <strong>{operationApprovalSummary(item)}</strong></span></div>
    {item.implementation.blocker ? <section className="workflow-blocker"><strong>{item.implementation.status === "blocked" ? "Blocked by" : "What is incomplete"}</strong><p>{item.implementation.blocker}</p></section> : null}
    <div className="workflow-detail-grid">
      <DetailList title="Required inputs" values={item.inputs} />
      <DetailList title="Reusable context" values={item.context} />
    </div>
    <DetailText title="Produces" value={item.output} />
    <DetailText title="Runtime" value={item.runtime} />
    {inputFields.length ? <section className="workflow-inputs" aria-label={`${item.label} structured inputs`}>
      <header><h3>Workflow inputs</h3><span>Repository-defined fields; unknown facts stay blank.</span></header>
      <div>{inputFields.map((field) => <label key={field.key}>
        <span>{field.label}{field.required ? " *" : ""}</span>
        {field.allowedValues.length ? <select
          value={inputValues[field.key] ?? ""}
          onChange={(event) => onInputChange(field.key, event.target.value)}
        ><option value="">Not provided</option>{field.allowedValues.map((value) => <option key={value} value={value}>{humanizeInputKey(value)}</option>)}</select> : field.multiline ? <Textarea
          value={inputValues[field.key] ?? ""}
          onChange={(event) => onInputChange(field.key, event.target.value)}
          placeholder="Leave blank when the source does not establish this."
        /> : <Input
          value={inputValues[field.key] ?? ""}
          onChange={(event) => onInputChange(field.key, event.target.value)}
          placeholder="Unknown"
        />}
      </label>)}</div>
      {!mountedExecutor ? <p>This input schema is ready, but the repository implementation is not mounted; nothing will run or be saved from these fields yet.</p> : null}
    </section> : null}
    <DetailList title="Verification evidence" values={item.implementation.evidence} code />
    <details className="workflow-authority"><summary>Repository authority</summary><code>{item.authorityPath}</code>{item.relatedPaths.length ? <ul>{item.relatedPaths.map((relatedPath) => <li key={relatedPath}><code>{relatedPath}</code></li>)}</ul> : <p>No linked supporting files.</p>}</details>
    <section className="workflow-runs" aria-label="Saved capability runs">
      <header><h3>Saved runs</h3><span>Persisted for this candidate case</span></header>
      {!activeCaseAvailable ? <p>Select a Job folder and candidate to view saved runs.</p> : runsLoading ? <p>Loading saved runs...</p> : runsError ? <p role="alert">{runsError}</p> : runs.length ? <ul>{runs.map((run) => <li key={run.id}>
        <div><code>{run.id}</code><strong className={`run-status ${run.status}`}>{run.status.replaceAll("_", " ")}</strong></div>
        <span>{run.capabilityId} · <time dateTime={run.updatedAt}>{displayRunTime(run.updatedAt)}</time></span>
        <small>{summarizeRunEvidence(run)}</small>
        {artifactsForRun(artifacts, run.id).map((artifact) => <ArtifactReviewCard
          key={artifact.id}
          artifact={artifact}
          activeCaseId={activeCaseId}
          onReviewArtifact={onReviewArtifact}
        />)}
      </li>)}</ul> : <p>No saved runs for this workflow yet.</p>}
      {activeCaseAvailable && artifactsLoading ? <p>Loading persisted PDFs...</p> : null}
      {activeCaseAvailable && artifactsError ? <p role="alert">{artifactsError}</p> : null}
    </section>
    {mountedExecutor ? <section className="workflow-execution" aria-label="Workflow execution">
      <div><strong>{mountedExecutor.label}</strong><span>{activeCaseAvailable ? "Runs against the active candidate case." : "Select a Job folder and candidate before running this workflow."}</span></div>
      <Button type="button" disabled={!activeCaseAvailable || executing} onClick={() => void onExecute()}>
        {executing ? <LoaderCircle className="spin" size={16} /> : <Play size={16} aria-hidden="true" />}
        {executing ? "Preparing draft..." : executionLabel}
      </Button>
    </section> : null}
  </article>;
}

const ARTIFACT_VISUAL_QA_LABELS: Record<ArtifactVisualQaCheck, string> = {
  no_clipping: "No clipping",
  no_overlap: "No overlap",
  no_orphaned_content: "No orphaned content",
  bullets_intact: "Bullets intact",
  logo_layout_ok: "Logo layout OK",
  privacy_ok: "Privacy OK",
  page_breaks_natural: "Page breaks natural",
};

function emptyArtifactPageReviews(pageCount: number | null): ArtifactVisualQaPageDraft[] {
  if (!Number.isInteger(pageCount) || (pageCount ?? 0) < 1) return [];
  return Array.from({ length: pageCount as number }, (_, index) => ({
    page: index + 1,
    no_clipping: null,
    no_overlap: null,
    no_orphaned_content: null,
    bullets_intact: null,
    logo_layout_ok: null,
    privacy_ok: null,
    page_breaks_natural: null,
  }));
}

export function ArtifactReviewCard({
  artifact,
  activeCaseId,
  onReviewArtifact,
}: {
  artifact: CaseArtifactSummary;
  activeCaseId: string | null;
  onReviewArtifact: (
    artifactId: string,
    review: ArtifactVisualQaReview,
  ) => Promise<ArtifactVisualQaReviewResult>;
}) {
  const [openedArtifact, setOpenedArtifact] = useState<{
    id: string;
    sha256: string;
  } | null>(null);
  const [pageReviews, setPageReviews] = useState<ArtifactVisualQaPageDraft[]>(
    () => emptyArtifactPageReviews(artifact.pageCount),
  );
  const [notes, setNotes] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const exactArtifactOpened = openedArtifact?.id === artifact.id &&
    openedArtifact.sha256 === artifact.sha256;
  const pending = artifact.visualQaStatus === "pending";
  const inspectionComplete = artifact.pageCount !== null &&
    pageReviews.length === artifact.pageCount &&
    pageReviews.every((page) => ARTIFACT_VISUAL_QA_CHECKS.every(
      (check) => typeof page[check] === "boolean",
    ));
  const allChecksPass = inspectionComplete && pageReviews.every((page) =>
    ARTIFACT_VISUAL_QA_CHECKS.every((check) => page[check] === true)
  );
  const hasFailedCheck = inspectionComplete && pageReviews.some((page) =>
    ARTIFACT_VISUAL_QA_CHECKS.some((check) => page[check] === false)
  );
  const canPass = pending && exactArtifactOpened && allChecksPass &&
    Boolean(notes.trim()) && !reviewing;
  const canFail = pending && exactArtifactOpened && hasFailedCheck &&
    Boolean(notes.trim()) && !reviewing;
  const downloadUrl = activeCaseId === artifact.caseId
    ? artifactDownloadUrl(activeCaseId, artifact.id)
    : null;
  const kindLabel = artifactKindLabel(artifact);

  const submitReview = async (status: "passed" | "failed") => {
    setReviewError("");
    try {
      const review = buildArtifactVisualQaReview(artifact, status, {
        openedArtifactId: openedArtifact?.id ?? null,
        openedArtifactSha256: openedArtifact?.sha256 ?? null,
        pages: pageReviews,
        notes,
      });
      setReviewing(true);
      await onReviewArtifact(artifact.id, review);
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "Visual QA could not be saved.");
    } finally {
      setReviewing(false);
    }
  };

  return <article className="artifact-review-card" aria-label={`${kindLabel} ${artifact.filename}`}>
    <header>
      <div><FileCheck2 size={16} aria-hidden="true" /><span><strong>{kindLabel}</strong><b>{artifact.filename}</b></span></div>
      <span className={`artifact-qa-status ${artifact.visualQaStatus}`}>{artifact.visualQaStatus}</span>
    </header>
    <dl>
      <div><dt>Artifact ID</dt><dd><code>{artifact.id}</code></dd></div>
      <div><dt>Immutable SHA-256</dt><dd><code>{artifact.sha256}</code></dd></div>
      <div><dt>Size</dt><dd>{formatArtifactBytes(artifact.sizeBytes)}</dd></div>
      <div><dt>Pages</dt><dd>{artifact.pageCount === null ? "Unavailable" : `${artifact.pageCount} page${artifact.pageCount === 1 ? "" : "s"}`}</dd></div>
      <div><dt>Revision</dt><dd>{artifact.revision}</dd></div>
    </dl>
    {downloadUrl ? <Button asChild size="sm" variant="outline"><a
      href={downloadUrl}
      target="_blank"
      rel="noreferrer"
      onClick={() => {
        setOpenedArtifact({ id: artifact.id, sha256: artifact.sha256 });
        setPageReviews(emptyArtifactPageReviews(artifact.pageCount));
        setReviewError("");
      }}
    >Open PDF <ExternalLink size={14} aria-hidden="true" /></a></Button> : <p role="alert">This PDF does not belong to the active candidate case.</p>}
    {pending ? <section className="artifact-review-controls" aria-label={`Human visual QA for ${artifact.filename}`}>
      <p>Open this exact immutable PDF, then explicitly mark all seven checks on every page. Pass requires every check to pass. Fail requires at least one failed check.</p>
      {artifact.pageCount === null ? <p role="alert">This persisted PDF has no verified page count and cannot be reviewed.</p> : <div className="artifact-page-reviews">
        {pageReviews.map((page, pageIndex) => <fieldset key={page.page} disabled={!exactArtifactOpened || reviewing}>
          <legend>Page {page.page}</legend>
          {ARTIFACT_VISUAL_QA_CHECKS.map((check) => <label key={check}>
            <span>{ARTIFACT_VISUAL_QA_LABELS[check]}</span>
            <select
              aria-label={`${ARTIFACT_VISUAL_QA_LABELS[check]} on page ${page.page}`}
              value={page[check] === null ? "" : page[check] ? "pass" : "fail"}
              onChange={(event) => {
                const value = event.target.value === "" ? null : event.target.value === "pass";
                setPageReviews((current) => current.map((currentPage, currentIndex) =>
                  currentIndex === pageIndex ? { ...currentPage, [check]: value } : currentPage
                ));
              }}
            >
              <option value="">Not inspected</option>
              <option value="pass">Pass</option>
              <option value="fail">Fail</option>
            </select>
          </label>)}
        </fieldset>)}
      </div>}
      <label>Visual-QA evidence<Textarea
        value={notes}
        disabled={reviewing}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Record identity, layout, clipping, page breaks, and any defect."
      /></label>
      {reviewError ? <p role="alert">{reviewError}</p> : null}
      <div className="artifact-review-actions">
        <Button type="button" size="sm" disabled={!canPass} onClick={() => void submitReview("passed")}><CheckCircle2 size={14} aria-hidden="true" />Pass visual QA</Button>
        <Button type="button" size="sm" variant="destructive" disabled={!canFail} onClick={() => void submitReview("failed")}><XCircle size={14} aria-hidden="true" />Fail visual QA</Button>
      </div>
    </section> : <p className={`artifact-review-final ${artifact.visualQaStatus}`}>Human visual QA {artifact.visualQaStatus}{artifact.reviewedAt ? ` on ${displayRunTime(artifact.reviewedAt)}` : ""}.</p>}
  </article>;
}

function DetailList({ title, values, code = false }: { title: string; values: string[]; code?: boolean }) {
  return <section className="workflow-detail-section"><h3>{title}</h3><ul>{values.map((value) => <li key={value}>{code ? <code>{value}</code> : value}</li>)}</ul></section>;
}

function DetailText({ title, value }: { title: string; value: string }) {
  return <section className="workflow-detail-section"><h3>{title}</h3><p>{value}</p></section>;
}
