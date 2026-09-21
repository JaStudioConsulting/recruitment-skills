import { and, eq, inArray, notExists, sql } from "drizzle-orm";
import { getDb, getSourceBucket } from "@/db";
import {
  candidateCases,
  candidates,
  capabilityRuns,
  caseActivity,
  caseArtifacts,
  caseDocuments,
  caseDocumentVersions,
  caseSources,
  roleSources,
  roles,
} from "@/db/schema";
import { assertOwnedRole } from "@/lib/server/case-repository";

export type DeleteJobFolderResult = {
  roleId: string;
  deletedCases: number;
  deletedCandidates: number;
  deletedSources: number;
  deletedArtifacts: number;
  storageCleanup: "complete" | "partial";
};

export async function deleteJobFolder(
  userId: string,
  roleId: string,
): Promise<DeleteJobFolderResult> {
  await assertOwnedRole(userId, roleId);
  const db = getDb();

  const caseRows = await db
    .select({ id: candidateCases.id, candidateId: candidateCases.candidateId })
    .from(candidateCases)
    .where(and(eq(candidateCases.ownerId, userId), eq(candidateCases.roleId, roleId)));
  const caseIds = caseRows.map((row) => row.id);
  const candidateIds = [...new Set(caseRows.map((row) => row.candidateId))];

  const [jobSourceRows, candidateSourceRows, artifactRows] = await Promise.all([
    db
      .select({ storageKey: roleSources.storageKey, intakeRecordId: roleSources.intakeRecordId })
      .from(roleSources)
      .where(eq(roleSources.roleId, roleId)),
    caseIds.length
      ? db
          .select({ storageKey: caseSources.storageKey, intakeRecordId: caseSources.intakeRecordId })
          .from(caseSources)
          .where(inArray(caseSources.caseId, caseIds))
      : Promise.resolve([]),
    caseIds.length
      ? db
          .select({ storageKey: caseArtifacts.storageKey })
          .from(caseArtifacts)
          .where(inArray(caseArtifacts.caseId, caseIds))
      : Promise.resolve([]),
  ]);

  if (caseIds.length) {
    await db.batch([
      db.delete(caseArtifacts).where(inArray(caseArtifacts.caseId, caseIds)),
      db.delete(caseDocumentVersions).where(inArray(caseDocumentVersions.caseId, caseIds)),
      db.delete(capabilityRuns).where(inArray(capabilityRuns.caseId, caseIds)),
      db.delete(caseActivity).where(inArray(caseActivity.caseId, caseIds)),
      db.delete(caseDocuments).where(inArray(caseDocuments.caseId, caseIds)),
      db.delete(caseSources).where(inArray(caseSources.caseId, caseIds)),
      db.delete(candidateCases).where(and(
        eq(candidateCases.ownerId, userId),
        eq(candidateCases.roleId, roleId),
      )),
      db.delete(roleSources).where(eq(roleSources.roleId, roleId)),
      db.delete(roles).where(and(eq(roles.id, roleId), eq(roles.ownerId, userId))),
      db.delete(candidates).where(and(
        eq(candidates.ownerId, userId),
        inArray(candidates.id, candidateIds),
        notExists(
          db
            .select({ one: sql<number>`1` })
            .from(candidateCases)
            .where(eq(candidateCases.candidateId, candidates.id)),
        ),
      )),
    ]);
  } else {
    await db.batch([
      db.delete(roleSources).where(eq(roleSources.roleId, roleId)),
      db.delete(roles).where(and(eq(roles.id, roleId), eq(roles.ownerId, userId))),
    ]);
  }

  const remainingCandidates = candidateIds.length
    ? await db
        .select({ id: candidates.id })
        .from(candidates)
        .where(and(eq(candidates.ownerId, userId), inArray(candidates.id, candidateIds)))
    : [];

  // Content-addressed intake records and their source objects are reusable.
  // Only context-local uploads and generated artifacts are removed here.
  const storageKeys = [
    ...jobSourceRows.filter((row) => !row.intakeRecordId).map((row) => row.storageKey),
    ...candidateSourceRows.filter((row) => !row.intakeRecordId).map((row) => row.storageKey),
    ...artifactRows.map((row) => row.storageKey),
  ];
  let storageCleanup: DeleteJobFolderResult["storageCleanup"] = "complete";
  if (storageKeys.length) {
    try {
      await getSourceBucket().delete(storageKeys);
    } catch (error) {
      storageCleanup = "partial";
      console.error("job folder storage cleanup failed", { roleId, error });
    }
  }

  return {
    roleId,
    deletedCases: caseIds.length,
    deletedCandidates: candidateIds.length - remainingCandidates.length,
    deletedSources: jobSourceRows.length + candidateSourceRows.length,
    deletedArtifacts: artifactRows.length,
    storageCleanup,
  };
}
