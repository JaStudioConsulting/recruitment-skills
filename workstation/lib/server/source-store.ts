import { getSourceBucket } from "@/db";
import { ApiError } from "@/lib/server/api";
import {
  assertOwnedCase,
  getCandidateCase,
  getOwnedSource,
  insertSource,
} from "@/lib/server/case-repository";

const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "text/markdown",
  "text/plain",
]);

function cleanFilename(value: string) {
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 240);
  return cleaned || "source-file";
}

function hex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function uploadImmutableSource(input: {
  userId: string;
  caseId: string;
  kind: string;
  file: File;
}) {
  if (input.file.size <= 0) throw new ApiError(400, "Source file is empty.");
  if (input.file.size > MAX_SOURCE_BYTES) {
    throw new ApiError(413, "Source file exceeds the 20 MB limit.");
  }
  const contentType = input.file.type.toLowerCase();
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new ApiError(415, "Source file type is not supported.");
  }

  await assertOwnedCase(input.userId, input.caseId);
  const bucket = getSourceBucket();
  const id = crypto.randomUUID();
  const storageKey = `cases/${input.caseId}/sources/${id}`;
  const bytes = await input.file.arrayBuffer();
  const sha256 = hex(await crypto.subtle.digest("SHA-256", bytes));
  const filename = cleanFilename(input.file.name);

  await bucket.put(storageKey, bytes, {
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: { contentType },
    customMetadata: { sha256 },
  });
  try {
    await insertSource(input.userId, {
      id,
      caseId: input.caseId,
      kind: input.kind,
      filename,
      contentType,
      sizeBytes: input.file.size,
      sha256,
      storageKey,
    });
  } catch (error) {
    await bucket.delete(storageKey).catch(() => undefined);
    throw error;
  }
  return getCandidateCase(input.userId, input.caseId);
}

export async function downloadImmutableSource(input: {
  userId: string;
  caseId: string;
  sourceId: string;
}) {
  const source = await getOwnedSource(input.userId, input.caseId, input.sourceId);
  const object = await getSourceBucket().get(source.storageKey);
  if (!object) throw new ApiError(404, "Source file was not found in storage.");
  const asciiName = source.filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encodedName = encodeURIComponent(source.filename);
  return new Response(object.body, {
    headers: {
      "cache-control": "private, no-store",
      "content-disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
      "content-length": String(source.sizeBytes),
      "content-type": source.contentType,
      etag: object.httpEtag,
      "x-content-type-options": "nosniff",
    },
  });
}
