import { env } from "cloudflare:workers";
import { getDocumentProxy } from "unpdf";

import { getSourceBucket } from "@/db";
import {
  artifactVisualQaReviewSchema,
  persistedArtifactPageCount,
  persistedArtifactVisualQaEvidenceSchema,
} from "@/lib/artifact-browser";
import { ApiError } from "@/lib/server/api";
import { parseByteRange } from "@/lib/server/range-request";
import {
  createCaseArtifact,
  finalizeCaseArtifactVisualQa,
  getCapabilityRun,
  getCaseArtifact,
  type CaseArtifactVisualQaFinalizationResult,
  type CaseArtifactRecord,
  type CreateCaseArtifactInput,
} from "@/lib/server/capability-run-repository";
import { DEFAULT_RESUME_BUILDER_URL } from "@/lib/server/resume-builder";
import { isCanonicalArtifactExecutorPair } from "@/lib/server/capability-executors/artifact-contract";

const PDF_CONTENT_TYPE = "application/pdf";
const MAX_ARTIFACT_BYTES = 20 * 1024 * 1024;
const PDF_SIGNATURE = new TextEncoder().encode("%PDF-");

type ArtifactPutOptions = {
  onlyIf: { etagDoesNotMatch: "*" };
  httpMetadata: { contentType: typeof PDF_CONTENT_TYPE };
  customMetadata: { sha256: string };
};

export type ArtifactBucket = {
  put(
    key: string,
    value: ArrayBuffer,
    options: ArtifactPutOptions,
  ): Promise<{ httpEtag?: string } | null>;
  get(
    key: string,
    options?: { range?: { offset: number; length?: number } },
  ): Promise<{ body: BodyInit; httpEtag?: string } | null>;
  delete(key: string): Promise<void>;
};

type ArtifactFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type CaseArtifactStoreDependencies = {
  getBucket: () => ArtifactBucket;
  getCapabilityRun: typeof getCapabilityRun;
  createCaseArtifact: typeof createCaseArtifact;
  getCaseArtifact: typeof getCaseArtifact;
  finalizeCaseArtifactVisualQa: typeof finalizeCaseArtifactVisualQa;
  inspectPdfPageCount: (bytes: ArrayBuffer) => Promise<number>;
  fetchImpl: ArtifactFetch;
  allowedBuilderOrigin: string;
  allowPrivateBuilderOrigin: boolean;
  randomUUID: () => string;
  now: () => string;
};

type BuilderEvidence = unknown;

export type BuilderArtifactSource =
  | {
      downloadUrl: string;
      bytes?: never;
      evidence?: BuilderEvidence;
    }
  | {
      bytes: ArrayBuffer | Uint8Array;
      downloadUrl?: never;
      evidence?: BuilderEvidence;
    };

export type PersistCaseArtifactInput = {
  userId: string;
  caseId: string;
  runId: string;
  filename: string;
  kind: string;
  executorId: string;
  source: BuilderArtifactSource;
};

function hasEvidence(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

export const visualQaReviewSchema = artifactVisualQaReviewSchema;

function defaultBucket(): ArtifactBucket {
  const bucket = getSourceBucket();
  return {
    put: (key, value, options) => bucket.put(key, value, options),
    get: async (key, options) => {
      const object = await bucket.get(key, options);
      return object ? { body: object.body, httpEtag: object.httpEtag } : null;
    },
    delete: (key) => bucket.delete(key),
  };
}

function configuredBuilderEndpoint(): string {
  return env.RECRUITMENT_MCP_URL?.trim() ||
    process.env.RECRUITMENT_MCP_URL?.trim() ||
    DEFAULT_RESUME_BUILDER_URL;
}

export async function inspectPdfPageCount(bytes: ArrayBuffer): Promise<number> {
  const pdf = await getDocumentProxy(Uint8Array.from(new Uint8Array(bytes)));
  try {
    return pdf.numPages;
  } finally {
    await pdf.loadingTask.destroy();
  }
}

const defaultDependencies: CaseArtifactStoreDependencies = {
  getBucket: defaultBucket,
  getCapabilityRun,
  createCaseArtifact,
  getCaseArtifact,
  finalizeCaseArtifactVisualQa,
  inspectPdfPageCount,
  fetchImpl: fetch,
  allowedBuilderOrigin: configuredBuilderEndpoint(),
  allowPrivateBuilderOrigin: process.env.NODE_ENV !== "production",
  randomUUID: () => crypto.randomUUID(),
  now: () => new Date().toISOString(),
};

function cleanPdfFilename(value: string): string {
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]/g, "_")
    .trim()
    .slice(0, 240);
  const filename = cleaned || "artifact.pdf";
  return filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`;
}

function ownedArrayBuffer(value: ArrayBuffer | Uint8Array): ArrayBuffer {
  const source = value instanceof Uint8Array ? value : new Uint8Array(value);
  return Uint8Array.from(source).buffer;
}

function validatesAsPdf(bytes: Uint8Array): boolean {
  return PDF_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

function validatePdfBytes(bytes: ArrayBuffer): void {
  if (bytes.byteLength === 0) {
    throw new ApiError(422, "The builder returned an empty PDF. No artifact was persisted.");
  }
  if (bytes.byteLength > MAX_ARTIFACT_BYTES) {
    throw new ApiError(413, "The builder PDF exceeds the 20 MB artifact limit.");
  }
  if (!validatesAsPdf(new Uint8Array(bytes))) {
    throw new ApiError(422, "The builder result is not a valid PDF. No artifact was persisted.");
  }
}

function isPrivateIpv4(octets: number[]): boolean {
  if (octets.length !== 4 || octets.some((octet) => octet > 255)) return true;
  return octets[0] === 0 || octets[0] === 10 || octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168);
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "");
  if (normalized === "localhost" || normalized.endsWith(".localhost")) return true;
  if (normalized === "::" || normalized === "::1" || normalized.startsWith("fc") ||
      normalized.startsWith("fd") || normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") || normalized.startsWith("fea") ||
      normalized.startsWith("feb")) return true;
  const mappedIpv4 = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedIpv4) {
    const high = Number.parseInt(mappedIpv4[1], 16);
    const low = Number.parseInt(mappedIpv4[2], 16);
    return isPrivateIpv4([high >> 8, high & 0xff, low >> 8, low & 0xff]);
  }
  const match = normalized.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  return isPrivateIpv4(match.slice(1).map(Number));
}

function validateDownloadUrl(
  value: string,
  allowedBuilderOrigin: string,
  allowPrivateBuilderOrigin: boolean,
): URL {
  let url: URL;
  let allowed: URL;
  try {
    url = new URL(value);
    allowed = new URL(allowedBuilderOrigin);
  } catch {
    throw new ApiError(400, "The builder artifact URL or configured builder origin is invalid.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ApiError(400, "The builder artifact URL must use HTTP or HTTPS.");
  }
  if (allowed.protocol !== "https:" && allowed.protocol !== "http:") {
    throw new ApiError(503, "The configured PDF builder origin must use HTTP or HTTPS.");
  }
  if (url.username || url.password) {
    throw new ApiError(403, "Builder artifact URLs cannot contain credentials.");
  }
  if (url.origin !== allowed.origin) {
    throw new ApiError(403, "The builder artifact URL is outside the configured builder origin.");
  }
  if (!allowPrivateBuilderOrigin && isPrivateHostname(url.hostname)) {
    throw new ApiError(403, "Private or local builder artifact origins are not allowed in production.");
  }
  return url;
}

function evidenceUrl(url: URL): string {
  return `${url.origin}${url.pathname}`;
}

function hex(buffer: ArrayBuffer): string {
  return Array.from(
    new Uint8Array(buffer),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function acquireBuilderPdf(
  source: BuilderArtifactSource,
  dependencies: Pick<
    CaseArtifactStoreDependencies,
    "fetchImpl" | "allowedBuilderOrigin" | "allowPrivateBuilderOrigin"
  >,
): Promise<{
  bytes: ArrayBuffer;
  evidence: Record<string, unknown>;
}> {
  if (source.bytes !== undefined) {
    const bytes = ownedArrayBuffer(source.bytes);
    validatePdfBytes(bytes);
    return {
      bytes,
      evidence: {
        source: "bytes",
        result: source.evidence ?? {},
      },
    };
  }

  const initialUrl = validateDownloadUrl(
    source.downloadUrl,
    dependencies.allowedBuilderOrigin,
    dependencies.allowPrivateBuilderOrigin,
  );
  let url = initialUrl;
  let response: Response | null = null;
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    try {
      response = await dependencies.fetchImpl(url, {
        headers: { accept: PDF_CONTENT_TYPE },
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new ApiError(502, "The builder PDF could not be fetched. No artifact was persisted.");
    }
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    if (!location) {
      throw new ApiError(502, "The builder PDF redirect had no destination.");
    }
    url = validateDownloadUrl(
      new URL(location, url).toString(),
      dependencies.allowedBuilderOrigin,
      dependencies.allowPrivateBuilderOrigin,
    );
    response = null;
  }
  if (!response) throw new ApiError(502, "The builder PDF returned too many redirects.");
  if (response.redirected && response.url) {
    validateDownloadUrl(
      response.url,
      dependencies.allowedBuilderOrigin,
      dependencies.allowPrivateBuilderOrigin,
    );
  }
  if (!response.ok) {
    throw new ApiError(
      502,
      `The builder PDF fetch returned HTTP ${response.status}. No artifact was persisted.`,
    );
  }

  const declaredLength = response.headers.get("content-length");
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > MAX_ARTIFACT_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw new ApiError(413, "The builder PDF exceeds the 20 MB artifact limit.");
  }

  let bytes: ArrayBuffer;
  try {
    const reader = response.body?.getReader();
    if (!reader) {
      bytes = new ArrayBuffer(0);
    } else {
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_ARTIFACT_BYTES) {
          await reader.cancel().catch(() => undefined);
          throw new ApiError(413, "The builder PDF exceeds the 20 MB artifact limit.");
        }
        chunks.push(value);
      }
      const combined = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.byteLength;
      }
      bytes = combined.buffer;
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, "The builder PDF could not be read. No artifact was persisted.");
  }
  validatePdfBytes(bytes);
  return {
    bytes,
    evidence: {
      source: "download_url",
      downloadUrl: evidenceUrl(initialUrl),
      fetchedUrl: evidenceUrl(url),
      declaredContentType: response.headers.get("content-type") ?? "",
      result: source.evidence ?? {},
    },
  };
}

export async function persistCaseArtifactWithDependencies(
  input: PersistCaseArtifactInput,
  dependencies: CaseArtifactStoreDependencies,
): Promise<CaseArtifactRecord> {
  const run = await dependencies.getCapabilityRun(input.userId, input.caseId, input.runId);
  if (run.status !== "running") {
    throw new ApiError(409, `PDF artifacts can only be persisted for a running capability run, not ${run.status}.`);
  }
  if (run.outputKind !== "pdf") {
    throw new ApiError(409, "PDF artifacts require a capability run whose output kind is pdf.");
  }
  if (!run.executorId || run.executorId !== input.executorId) {
    throw new ApiError(409, "The PDF artifact executor does not match the prepared capability run.");
  }
  if (input.kind !== run.capabilityId) {
    throw new ApiError(409, "The PDF artifact capability does not match the prepared capability run.");
  }
  if (!isCanonicalArtifactExecutorPair(run.capabilityId, run.executorId)) {
    throw new ApiError(409, "The prepared run is not a canonical PDF artifact capability/executor pair.");
  }
  const acquired = await acquireBuilderPdf(input.source, dependencies);
  let pageCount: number;
  try {
    pageCount = await dependencies.inspectPdfPageCount(acquired.bytes.slice(0));
  } catch {
    throw new ApiError(
      422,
      "The builder PDF did not expose a readable positive page count. No artifact was persisted.",
    );
  }
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new ApiError(
      422,
      "The builder PDF did not expose a readable positive page count. No artifact was persisted.",
    );
  }
  const currentRun = await dependencies.getCapabilityRun(
    input.userId,
    input.caseId,
    input.runId,
  );
  if (currentRun.status !== "running") {
    throw new ApiError(
      409,
      `The capability run changed while the PDF was being acquired and is now ${currentRun.status}. No artifact was persisted.`,
    );
  }
  const id = dependencies.randomUUID();
  const filename = cleanPdfFilename(input.filename);
  const storageKey = `cases/${input.caseId}/artifacts/${id}/${filename}`;
  const sha256 = hex(await crypto.subtle.digest("SHA-256", acquired.bytes));
  const bucket = dependencies.getBucket();
  const stored = await bucket.put(storageKey, acquired.bytes, {
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: PDF_CONTENT_TYPE },
    customMetadata: { sha256 },
  });
  if (!stored) {
    throw new ApiError(409, "The immutable artifact storage key already exists.");
  }

  const record: CreateCaseArtifactInput = {
    id,
    caseId: input.caseId,
    runId: input.runId,
    kind: run.capabilityId,
    filename,
    contentType: PDF_CONTENT_TYPE,
    storageKey,
    sha256,
    sizeBytes: acquired.bytes.byteLength,
    evidence: {
      builder: acquired.evidence,
      persistence: {
        capturedAt: dependencies.now(),
        pageCount,
        storage: "workstation_r2",
      },
    },
  };

  try {
    return await dependencies.createCaseArtifact(input.userId, record);
  } catch (error) {
    await bucket.delete(storageKey).catch(() => undefined);
    throw error;
  }
}

export function persistCaseArtifact(
  input: PersistCaseArtifactInput,
): Promise<CaseArtifactRecord> {
  return persistCaseArtifactWithDependencies(input, defaultDependencies);
}

export async function downloadPersistedCaseArtifactWithDependencies(
  input: {
    userId: string;
    caseId: string;
    artifactId: string;
    inline?: boolean;
    rangeHeader?: string | null;
  },
  dependencies: CaseArtifactStoreDependencies,
): Promise<Response> {
  const artifact = await dependencies.getCaseArtifact(
    input.userId,
    input.caseId,
    input.artifactId,
  );
  const parsedRange = parseByteRange(input.rangeHeader, artifact.sizeBytes);

  if (parsedRange.type === "unsatisfiable") {
    return new Response(null, {
      status: 416,
      headers: {
        "accept-ranges": "bytes",
        "content-range": `bytes */${artifact.sizeBytes}`,
      },
    });
  }

  const rangeOption = parsedRange.type === "range"
    ? { range: { offset: parsedRange.range.offset, length: parsedRange.range.length } }
    : undefined;

  const object = await dependencies.getBucket().get(artifact.storageKey, rangeOption);
  if (!object) throw new ApiError(404, "Case artifact bytes were not found in storage.");

  const asciiName = artifact.filename
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_");
  const headers = new Headers({
    "accept-ranges": "bytes",
    "cache-control": "private, no-store",
    "content-disposition": `${input.inline ? "inline" : "attachment"}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(artifact.filename)}`,
    "content-type": artifact.contentType,
    "x-content-type-options": "nosniff",
  });
  if (object.httpEtag) headers.set("etag", object.httpEtag);

  if (parsedRange.type === "range") {
    headers.set("content-range", `bytes ${parsedRange.range.start}-${parsedRange.range.end}/${artifact.sizeBytes}`);
    headers.set("content-length", String(parsedRange.range.length));
    return new Response(object.body, { status: 206, headers });
  }

  headers.set("content-length", String(artifact.sizeBytes));
  return new Response(object.body, { status: 200, headers });
}

export function downloadPersistedCaseArtifact(input: {
  userId: string;
  caseId: string;
  artifactId: string;
  inline?: boolean;
  rangeHeader?: string | null;
}): Promise<Response> {
  return downloadPersistedCaseArtifactWithDependencies(input, defaultDependencies);
}

export type CaseArtifactVisualQaReviewResult = CaseArtifactVisualQaFinalizationResult;

export async function reviewCaseArtifactVisualQaWithDependencies(
  input: {
    userId: string;
    caseId: string;
    artifactId: string;
    review: unknown;
  },
  dependencies: CaseArtifactStoreDependencies,
): Promise<CaseArtifactVisualQaReviewResult> {
  const review = visualQaReviewSchema.parse(input.review);
  const currentArtifact = await dependencies.getCaseArtifact(
    input.userId,
    input.caseId,
    input.artifactId,
  );
  if (
    review.evidence.artifactId !== currentArtifact.id ||
    review.evidence.artifactSha256 !== currentArtifact.sha256
  ) {
    throw new ApiError(409, "The visual-QA evidence does not match the stored PDF.");
  }
  const pageCount = persistedArtifactPageCount(currentArtifact);
  if (pageCount === null) {
    throw new ApiError(409, "The stored PDF has no verified page count and cannot be reviewed.");
  }
  if (review.evidence.expected_page_count !== pageCount) {
    throw new ApiError(409, "The visual-QA page count does not match the stored PDF.");
  }
  if (currentArtifact.visualQaStatus !== "pending") {
    throw new ApiError(
      409,
      `Visual QA cannot transition from ${currentArtifact.visualQaStatus} to ${review.status}.`,
    );
  }
  const currentRun = await dependencies.getCapabilityRun(
    input.userId,
    input.caseId,
    currentArtifact.runId,
  );
  if (currentRun.status !== "awaiting_visual_qa") {
    throw new ApiError(409, `Capability run ${currentRun.status} is not awaiting visual QA.`);
  }
  if (review.status === "passed" && !hasEvidence(currentRun.result)) {
    throw new ApiError(409, "A PDF capability run requires a persisted result before visual QA can pass.");
  }

  const storedEvidence = persistedArtifactVisualQaEvidenceSchema.parse({
    ...review.evidence,
    reviewer: input.userId,
    inspected_at: dependencies.now(),
  });
  return dependencies.finalizeCaseArtifactVisualQa(
    input.userId,
    input.caseId,
    input.artifactId,
    review.status,
    storedEvidence,
  );
}

export function reviewCaseArtifactVisualQaRequest(input: {
  userId: string;
  caseId: string;
  artifactId: string;
  review: unknown;
}): Promise<CaseArtifactVisualQaReviewResult> {
  return reviewCaseArtifactVisualQaWithDependencies(input, defaultDependencies);
}
