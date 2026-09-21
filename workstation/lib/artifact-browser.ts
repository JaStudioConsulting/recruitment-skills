import { z } from "zod";

import type {
  CapabilityRunRecord,
  CaseArtifactRecord,
  VisualQaStatus,
} from "./server/capability-run-repository";

export type CaseArtifactSummary = Pick<
  CaseArtifactRecord,
  | "id"
  | "caseId"
  | "runId"
  | "kind"
  | "filename"
  | "contentType"
  | "sha256"
  | "sizeBytes"
  | "revision"
  | "visualQaStatus"
  | "reviewedAt"
  | "createdAt"
> & {
  pageCount: number | null;
};

export const ARTIFACT_VISUAL_QA_CHECKS = [
  "no_clipping",
  "no_overlap",
  "no_orphaned_content",
  "bullets_intact",
  "logo_layout_ok",
  "privacy_ok",
  "page_breaks_natural",
] as const;

export type ArtifactVisualQaCheck = (typeof ARTIFACT_VISUAL_QA_CHECKS)[number];
export type ArtifactVisualQaPageDraft = {
  page: number;
} & Record<ArtifactVisualQaCheck, boolean | null>;

export type ArtifactReviewDraft = {
  openedArtifactId: string | null;
  openedArtifactSha256: string | null;
  pages: readonly ArtifactVisualQaPageDraft[];
  notes: string;
};

const artifactVisualQaPageSchema = z.object({
  page: z.number().int().positive(),
  no_clipping: z.boolean(),
  no_overlap: z.boolean(),
  no_orphaned_content: z.boolean(),
  bullets_intact: z.boolean(),
  logo_layout_ok: z.boolean(),
  privacy_ok: z.boolean(),
  page_breaks_natural: z.boolean(),
}).strict();

const artifactVisualQaEvidenceShape = {
  artifactId: z.string().min(1),
  artifactSha256: z.string().regex(/^[a-f0-9]{64}$/i),
  expected_page_count: z.number().int().positive(),
  human_visual_inspection_complete: z.literal(true),
  pages: z.array(artifactVisualQaPageSchema).min(1),
  notes: z.string().trim().min(1),
};

function validatePageCoverage(
  evidence: z.infer<z.ZodObject<typeof artifactVisualQaEvidenceShape>>,
  context: z.RefinementCtx,
) {
  if (evidence.pages.length !== evidence.expected_page_count) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["pages"],
      message: "Visual QA requires exactly one page record per expected PDF page.",
    });
    return;
  }
  const pageNumbers = evidence.pages.map((page) => page.page);
  const expectedNumbers = Array.from(
    { length: evidence.expected_page_count },
    (_, index) => index + 1,
  );
  if (
    new Set(pageNumbers).size !== evidence.expected_page_count ||
    pageNumbers.some((page) => !expectedNumbers.includes(page))
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["pages"],
      message: "Visual-QA page records must cover every page 1..N exactly once.",
    });
  }
}

export const artifactVisualQaEvidenceSchema = z
  .object(artifactVisualQaEvidenceShape)
  .strict()
  .superRefine(validatePageCoverage);

export const persistedArtifactVisualQaEvidenceSchema = z.object({
  ...artifactVisualQaEvidenceShape,
  reviewer: z.string().trim().min(1),
  inspected_at: z.string().trim().min(1),
}).strict().superRefine(validatePageCoverage);

export const artifactVisualQaReviewSchema = z.object({
  status: z.enum(["passed", "failed"]),
  evidence: artifactVisualQaEvidenceSchema,
}).strict().superRefine((review, context) => {
  const results = review.evidence.pages.flatMap((page) =>
    ARTIFACT_VISUAL_QA_CHECKS.map((check) => page[check])
  );
  if (review.status === "passed" && results.some((result) => result !== true)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["evidence", "pages"],
      message: "Passed visual QA requires every check to pass.",
    });
  }
  if (review.status === "failed" && !results.some((result) => result === false)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["evidence", "pages"],
      message: "Failed visual QA requires at least one failed check.",
    });
  }
});

export type ArtifactVisualQaReview = z.infer<typeof artifactVisualQaReviewSchema>;

export type ArtifactVisualQaReviewResult = {
  artifact: CaseArtifactSummary;
  run: CapabilityRunRecord;
};

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function persistedArtifactPageCount(
  artifact: Pick<CaseArtifactRecord, "evidence">,
): number | null {
  const evidence = recordValue(artifact.evidence);
  const persistence = recordValue(evidence?.persistence);
  const pageCount = persistence?.pageCount;
  return Number.isInteger(pageCount) && (pageCount as number) > 0
    ? pageCount as number
    : null;
}

export function toCaseArtifactSummary(
  artifact: CaseArtifactRecord,
): CaseArtifactSummary {
  return {
    id: artifact.id,
    caseId: artifact.caseId,
    runId: artifact.runId,
    kind: artifact.kind,
    filename: artifact.filename,
    contentType: artifact.contentType,
    sha256: artifact.sha256,
    sizeBytes: artifact.sizeBytes,
    revision: artifact.revision,
    pageCount: persistedArtifactPageCount(artifact),
    visualQaStatus: artifact.visualQaStatus,
    reviewedAt: artifact.reviewedAt,
    createdAt: artifact.createdAt,
  };
}

export function artifactDownloadUrl(caseId: string, artifactId: string): string {
  return `/api/cases/${encodeURIComponent(caseId)}/artifacts/stored/${encodeURIComponent(artifactId)}/download?inline=1`;
}

export function formatArtifactBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function artifactKindLabel(artifact: Pick<CaseArtifactSummary, "kind">): string {
  if (artifact.kind === "brandedresume") return "Branded PDF";
  if (artifact.kind === "interview-prep-material") return "Interview prep PDF";
  if (artifact.kind === "complete-reference-check") return "Reference check PDF";
  return "Persisted PDF";
}

export function buildArtifactVisualQaReview(
  artifact: CaseArtifactSummary,
  status: Exclude<VisualQaStatus, "pending">,
  draft: ArtifactReviewDraft,
): ArtifactVisualQaReview {
  if (
    draft.openedArtifactId !== artifact.id ||
    draft.openedArtifactSha256 !== artifact.sha256
  ) {
    throw new Error("Open this exact PDF before recording visual QA.");
  }
  if (!Number.isInteger(artifact.pageCount) || (artifact.pageCount ?? 0) < 1) {
    throw new Error("This stored PDF has no verified page count and cannot be reviewed.");
  }
  if (draft.pages.length !== artifact.pageCount) {
    throw new Error("Complete exactly one visual-QA record per PDF page.");
  }
  const expectedPages = new Set(
    Array.from({ length: artifact.pageCount }, (_, index) => index + 1),
  );
  if (
    new Set(draft.pages.map((page) => page.page)).size !== artifact.pageCount ||
    draft.pages.some((page) => !expectedPages.has(page.page))
  ) {
    throw new Error("Visual-QA page records must cover every page 1..N exactly once.");
  }
  if (draft.pages.some((page) =>
    ARTIFACT_VISUAL_QA_CHECKS.some((check) => typeof page[check] !== "boolean")
  )) {
    throw new Error("Complete all seven visual checks for every PDF page.");
  }
  if (!draft.notes.trim()) {
    throw new Error("Enter written visual-QA evidence before recording a decision.");
  }
  return artifactVisualQaReviewSchema.parse({
    status,
    evidence: {
      artifactId: artifact.id,
      artifactSha256: artifact.sha256,
      expected_page_count: artifact.pageCount,
      human_visual_inspection_complete: true,
      pages: draft.pages,
      notes: draft.notes,
    },
  });
}
