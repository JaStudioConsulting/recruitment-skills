import { getSourceBucket } from "@/db";
import { ApiError } from "@/lib/server/api";
import {
  assertOwnedCase,
  assertOwnedRole,
  getCandidateCase,
  getOwnedSource,
  getOwnedRoleSource,
  getPersistedSourceIntake,
  getRoleSources,
  insertSource,
  insertRoleSource,
  persistSourceIntake,
  type PersistedSourceIntakeRecord,
  type SourceIntakeFingerprint,
} from "@/lib/server/case-repository";
import {
  classifyParsedSourceContent,
  inspectUploadedSourceContent,
  type SourceIntakeResult,
} from "@/lib/server/source-intake";
import type { SourceKind } from "@/lib/workstation-types";

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

export const SOURCE_INTAKE_PARSER_VERSION = "2026-09-21.1";
export type PersistedSourceIntake = PersistedSourceIntakeRecord;

export type SourceIntakePersistenceDependencies = {
  inspect: typeof inspectUploadedSourceContent;
  getPersistedIntake: (
    userId: string,
    fingerprint: SourceIntakeFingerprint,
  ) => Promise<PersistedSourceIntake | null>;
  persistIntake: (
    userId: string,
    intake: SourceIntakeFingerprint & {
      sizeBytes: number;
      parsedText: string | null;
    },
  ) => Promise<PersistedSourceIntake>;
};

export type ResolvedSourceIntake = {
  intakeRecordId: string;
  sha256: string;
  parserVersion: string;
  intake: SourceIntakeResult;
};

const sourceIntakePersistenceDependencies: SourceIntakePersistenceDependencies = {
  inspect: inspectUploadedSourceContent,
  getPersistedIntake: getPersistedSourceIntake,
  persistIntake: persistSourceIntake,
};

export async function resolveSourceIntakeWithDependencies(
  input: {
    userId: string;
    bytes: ArrayBuffer;
    contentType: string;
    filename: string;
    requestedKind?: SourceKind;
  },
  dependencies: SourceIntakePersistenceDependencies,
): Promise<ResolvedSourceIntake> {
  const sha256 = hex(await crypto.subtle.digest("SHA-256", input.bytes));
  const fingerprint: SourceIntakeFingerprint = {
    sha256,
    contentType: input.contentType,
    parserVersion: SOURCE_INTAKE_PARSER_VERSION,
  };
  let persisted = await dependencies.getPersistedIntake(input.userId, fingerprint);
  if (!persisted) {
    const inspected = await dependencies.inspect({
      bytes: input.bytes,
      contentType: input.contentType,
      filename: input.filename,
    });
    persisted = await dependencies.persistIntake(input.userId, {
      ...fingerprint,
      sizeBytes: input.bytes.byteLength,
      parsedText: inspected.parsedText,
    });
  }
  return {
    intakeRecordId: persisted.id,
    sha256,
    parserVersion: persisted.parserVersion,
    intake: classifyParsedSourceContent({
      parsedText: persisted.parsedText,
      filename: input.filename,
      requestedKind: input.requestedKind,
    }),
  };
}

export function resolveSourceIntake(input: {
  userId: string;
  bytes: ArrayBuffer;
  contentType: string;
  filename: string;
  requestedKind?: SourceKind;
}) {
  return resolveSourceIntakeWithDependencies(input, sourceIntakePersistenceDependencies);
}

export function contentTypeFor(file: File) {
  const declared = file.type.toLowerCase();
  if (ALLOWED_CONTENT_TYPES.has(declared)) return declared;
  const extension = file.name.toLowerCase().split(".").pop();
  const inferred: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    md: "text/markdown",
    txt: "text/plain",
  };
  return extension ? inferred[extension] ?? declared : declared;
}

export function validateSourceFile(file: File) {
  if (file.size <= 0) throw new ApiError(400, "Source file is empty.");
  if (file.size > MAX_SOURCE_BYTES) {
    throw new ApiError(413, "Source file exceeds the 20 MB limit.");
  }
  const contentType = contentTypeFor(file);
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new ApiError(415, "Source file type is not supported.");
  }
  return contentType;
}

type SourceUpload = { file: File; kind?: SourceKind };

async function storeSource(input: {
  userId: string;
  caseId: string;
  upload: SourceUpload;
  contentType: string;
}) {
  const { file } = input.upload;
  const bucket = getSourceBucket();
  const id = crypto.randomUUID();
  const storageKey = `cases/${input.caseId}/sources/${id}`;
  const bytes = await file.arrayBuffer();
  const filename = cleanFilename(file.name);
  const resolved = await resolveSourceIntake({
    userId: input.userId,
    bytes,
    contentType: input.contentType,
    filename,
    requestedKind: input.upload.kind,
  });
  const { intake, sha256 } = resolved;

  await bucket.put(storageKey, bytes, {
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: input.contentType },
    customMetadata: { sha256 },
  });
  try {
    await insertSource(input.userId, {
      id,
      caseId: input.caseId,
      kind: intake.kind,
      filename,
      contentType: input.contentType,
      sizeBytes: file.size,
      sha256,
      storageKey,
      lifecycleStatus: intake.lifecycleStatus,
      parsedText: intake.parsedText,
      classificationMethod: intake.classificationMethod,
      intakeRecordId: resolved.intakeRecordId,
    });
  } catch (error) {
    await bucket.delete(storageKey).catch(() => undefined);
    throw error;
  }
}

export async function uploadImmutableSource(input: {
  userId: string;
  caseId: string;
  kind?: SourceKind;
  file: File;
}) {
  return uploadImmutableSources({
    userId: input.userId,
    caseId: input.caseId,
    uploads: [{ file: input.file, kind: input.kind }],
  });
}

export async function uploadImmutableSources(input: {
  userId: string;
  caseId: string;
  uploads: SourceUpload[];
}) {
  if (input.uploads.length === 0) throw new ApiError(400, "At least one source file is required.");
  if (input.uploads.length > 20) throw new ApiError(413, "A maximum of 20 source files can be uploaded at once.");
  const contentTypes = input.uploads.map(({ file }) => validateSourceFile(file));
  await assertOwnedCase(input.userId, input.caseId);
  for (let index = 0; index < input.uploads.length; index += 1) {
    await storeSource({
      userId: input.userId,
      caseId: input.caseId,
      upload: input.uploads[index],
      contentType: contentTypes[index],
    });
  }
  return getCandidateCase(input.userId, input.caseId);
}

export async function downloadImmutableSource(input: {
  userId: string;
  caseId: string;
  sourceId: string;
  inline?: boolean;
}) {
  const source = await getOwnedSource(input.userId, input.caseId, input.sourceId);
  const object = await getSourceBucket().get(source.storageKey);
  if (!object) throw new ApiError(404, "Source file was not found in storage.");
  const asciiName = source.filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encodedName = encodeURIComponent(source.filename);
  const disposition = input.inline && (
    source.contentType === "application/pdf" ||
    source.contentType.startsWith("image/") ||
    source.contentType.startsWith("text/")
  ) ? "inline" : "attachment";
  return new Response(object.body, {
    headers: {
      "cache-control": "private, no-store",
      "content-disposition": `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
      "content-length": String(source.sizeBytes),
      "content-type": source.contentType,
      etag: object.httpEtag,
      "x-content-type-options": "nosniff",
    },
  });
}

async function storeRoleSource(input: {
  userId: string;
  roleId: string;
  upload: SourceUpload;
  contentType: string;
}) {
  const { file } = input.upload;
  const bucket = getSourceBucket();
  const id = crypto.randomUUID();
  const storageKey = `roles/${input.roleId}/sources/${id}`;
  const bytes = await file.arrayBuffer();
  const filename = cleanFilename(file.name);
  const resolved = await resolveSourceIntake({
    userId: input.userId,
    bytes,
    contentType: input.contentType,
    filename,
    requestedKind: input.upload.kind,
  });
  const { intake, sha256 } = resolved;
  await bucket.put(storageKey, bytes, {
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: input.contentType },
    customMetadata: { sha256 },
  });
  try {
    await insertRoleSource(input.userId, {
      id,
      roleId: input.roleId,
      kind: intake.kind,
      filename,
      contentType: input.contentType,
      sizeBytes: file.size,
      sha256,
      storageKey,
      lifecycleStatus: intake.lifecycleStatus,
      parsedText: intake.parsedText,
      classificationMethod: intake.classificationMethod,
      intakeRecordId: resolved.intakeRecordId,
    });
  } catch (error) {
    await bucket.delete(storageKey).catch(() => undefined);
    throw error;
  }
}

export async function uploadImmutableRoleSources(input: {
  userId: string;
  roleId: string;
  uploads: SourceUpload[];
}) {
  if (input.uploads.length === 0) throw new ApiError(400, "At least one source file is required.");
  if (input.uploads.length > 20) throw new ApiError(413, "A maximum of 20 source files can be uploaded at once.");
  const contentTypes = input.uploads.map(({ file }) => validateSourceFile(file));
  await assertOwnedRole(input.userId, input.roleId);
  for (let index = 0; index < input.uploads.length; index += 1) {
    await storeRoleSource({
      userId: input.userId,
      roleId: input.roleId,
      upload: input.uploads[index],
      contentType: contentTypes[index],
    });
  }
  return getRoleSources(input.userId, input.roleId);
}

export async function downloadImmutableRoleSource(input: {
  userId: string;
  roleId: string;
  sourceId: string;
  inline?: boolean;
}) {
  const source = await getOwnedRoleSource(input.userId, input.roleId, input.sourceId);
  const object = await getSourceBucket().get(source.storageKey);
  if (!object) throw new ApiError(404, "Job source file was not found in storage.");
  const asciiName = source.filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encodedName = encodeURIComponent(source.filename);
  const disposition = input.inline && (
    source.contentType === "application/pdf" ||
    source.contentType.startsWith("image/") ||
    source.contentType.startsWith("text/")
  ) ? "inline" : "attachment";
  return new Response(object.body, {
    headers: {
      "cache-control": "private, no-store",
      "content-disposition": `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
      "content-length": String(source.sizeBytes),
      "content-type": source.contentType,
      etag: object.httpEtag,
      "x-content-type-options": "nosniff",
    },
  });
}
