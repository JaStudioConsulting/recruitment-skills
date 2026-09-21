import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

import {
  findOrCreateRoleWithDependencies,
  sourcePersistenceMetadata,
  type RoleIdentityDependencies,
  type RoleIdentityRow,
} from "../lib/server/case-repository";
import {
  SOURCE_INTAKE_PARSER_VERSION,
  resolveSourceIntakeWithDependencies,
  type PersistedSourceIntake,
  type SourceIntakePersistenceDependencies,
} from "../lib/server/source-store";

const encoder = new TextEncoder();

function buffer(value: string) {
  return encoder.encode(value).buffer as ArrayBuffer;
}

function intakeDependencies() {
  const records = new Map<string, PersistedSourceIntake>();
  const inspect = vi.fn(async () => ({
    kind: "job_description" as const,
    lifecycleStatus: "classified" as const,
    parsedText: "Job Title: Plant Manager\nCompany: Example Manufacturing\nResponsibilities\nQualifications\nRequirements",
    classificationMethod: "content" as const,
  }));
  const key = (userId: string, sha256: string, contentType: string, parserVersion: string) =>
    JSON.stringify([userId, sha256, contentType, parserVersion]);
  const dependencies: SourceIntakePersistenceDependencies = {
    inspect,
    getPersistedIntake: vi.fn(async (userId, fingerprint) =>
      records.get(key(userId, fingerprint.sha256, fingerprint.contentType, fingerprint.parserVersion)) ?? null),
    persistIntake: vi.fn(async (userId, intake) => {
      const recordKey = key(userId, intake.sha256, intake.contentType, intake.parserVersion);
      const existing = records.get(recordKey);
      if (existing) return existing;
      const record: PersistedSourceIntake = {
        id: `intake-${records.size + 1}`,
        ...intake,
        createdAt: "2026-09-21T01:00:00.000Z",
      };
      records.set(recordKey, record);
      return record;
    }),
  };
  return { dependencies, inspect };
}

describe("durable source-intake reuse", () => {
  it("does not persist automatic classification as a human review", () => {
    expect(sourcePersistenceMetadata({
      lifecycleStatus: "classified",
      classificationMethod: "filename",
    })).toEqual({ reviewStatus: "unreviewed", contextStatus: "active" });
    expect(sourcePersistenceMetadata({
      lifecycleStatus: "classified",
      classificationMethod: "content",
    })).toEqual({ reviewStatus: "unreviewed", contextStatus: "active" });
    expect(sourcePersistenceMetadata({
      lifecycleStatus: "reviewed",
      classificationMethod: "manual",
    })).toEqual({ reviewStatus: "reviewed", contextStatus: "active" });
  });

  it("parses unassigned JD bytes once and reuses the persisted result during storage", async () => {
    const fixture = intakeDependencies();
    const bytes = buffer("synthetic PDF bytes");
    const proposed = await resolveSourceIntakeWithDependencies({
      userId: "owner-1",
      bytes,
      contentType: "application/pdf",
      filename: "Uploaded JD.pdf",
    }, fixture.dependencies);
    const stored = await resolveSourceIntakeWithDependencies({
      userId: "owner-1",
      bytes,
      contentType: "application/pdf",
      filename: "Uploaded JD.pdf",
      requestedKind: "job_description",
    }, fixture.dependencies);

    expect(fixture.inspect).toHaveBeenCalledTimes(1);
    expect(stored.intakeRecordId).toBe(proposed.intakeRecordId);
    expect(stored.sha256).toBe(proposed.sha256);
    expect(stored.intake).toMatchObject({
      kind: "job_description",
      lifecycleStatus: "classified",
      classificationMethod: "explicit",
      parsedText: proposed.intake.parsedText,
    });
    expect(stored.parserVersion).toBe(SOURCE_INTAKE_PARSER_VERSION);
  });

  it("does not leak a parsed result across owners and does not retry cached unreadable bytes", async () => {
    const records = new Map<string, PersistedSourceIntake>();
    const inspect = vi.fn(async () => ({
      kind: "job_description" as const,
      lifecycleStatus: "uploaded" as const,
      parsedText: null,
      classificationMethod: "filename" as const,
    }));
    const dependencies: SourceIntakePersistenceDependencies = {
      inspect,
      getPersistedIntake: vi.fn(async (userId, fingerprint) =>
        records.get(`${userId}:${fingerprint.sha256}`) ?? null),
      persistIntake: vi.fn(async (userId, intake) => {
        const record = { id: `${userId}-intake`, ...intake, createdAt: "2026-09-21T01:00:00.000Z" };
        records.set(`${userId}:${intake.sha256}`, record);
        return record;
      }),
    };
    const input = {
      bytes: buffer("unreadable synthetic document"),
      contentType: "application/pdf",
      filename: "Plant Manager JD.pdf",
    };

    await resolveSourceIntakeWithDependencies({ userId: "owner-1", ...input }, dependencies);
    await resolveSourceIntakeWithDependencies({ userId: "owner-1", ...input }, dependencies);
    await resolveSourceIntakeWithDependencies({ userId: "owner-2", ...input }, dependencies);

    expect(inspect).toHaveBeenCalledTimes(2);
  });
});

function roleDependencies(): RoleIdentityDependencies & { rows: RoleIdentityRow[]; inserts: ReturnType<typeof vi.fn> } {
  const rows: RoleIdentityRow[] = [];
  const inserts = vi.fn(async (row: RoleIdentityRow) => {
    if (rows.some((item) => item.ownerId === row.ownerId && item.identityKey === row.identityKey)) return null;
    rows.push(row);
    return row;
  });
  return {
    rows,
    inserts,
    findByIdentityKey: vi.fn(async (ownerId, identityKey) =>
      rows.find((row) => row.ownerId === ownerId && row.identityKey === identityKey) ?? null),
    listOwnedRoles: vi.fn(async (ownerId) => rows.filter((row) => row.ownerId === ownerId)),
    claimLegacyRole: vi.fn(async (ownerId, roleId, identityKey) => {
      const claimed = rows.find((row) => row.ownerId === ownerId && row.id === roleId);
      if (!claimed) return null;
      const conflict = rows.find((row) => row.ownerId === ownerId && row.identityKey === identityKey && row.id !== roleId);
      if (conflict) return null;
      claimed.identityKey = identityKey;
      return claimed;
    }),
    insertRole: inserts,
    randomUUID: vi.fn()
      .mockReturnValueOnce("role-1")
      .mockReturnValueOnce("role-2")
      .mockReturnValue("role-3"),
    now: () => "2026-09-21T01:00:00.000Z",
  };
}

describe("server-side Job identity", () => {
  it("rejects creation until both reviewed title and client are present", async () => {
    const dependencies = roleDependencies();

    await expect(findOrCreateRoleWithDependencies("owner-1", {
      title: "Maintenance Manager",
      client: "",
    }, dependencies)).rejects.toThrow("client");
    await expect(findOrCreateRoleWithDependencies("owner-1", {
      title: "",
      client: "Example Manufacturing",
    }, dependencies)).rejects.toThrow("title");
    expect(dependencies.inserts).not.toHaveBeenCalled();
  });

  it("returns one Job for repeated normalized title/client variants", async () => {
    const dependencies = roleDependencies();
    const first = await findOrCreateRoleWithDependencies("owner-1", {
      title: " Maintenance Manager ",
      client: "Example Manufacturing, Inc.",
    }, dependencies);
    const repeated = await findOrCreateRoleWithDependencies("owner-1", {
      title: "maintenance-manager",
      client: "EXAMPLE MANUFACTURING INC",
    }, dependencies);

    expect(repeated.id).toBe(first.id);
    expect(dependencies.rows).toHaveLength(1);
    expect(dependencies.inserts).toHaveBeenCalledTimes(1);
  });

  it("reuses a Job across terminal legal suffix aliases only", async () => {
    const dependencies = roleDependencies();
    const first = await findOrCreateRoleWithDependencies("owner-1", {
      title: "Maintenance Manager",
      client: "Atlantic Packaging",
    }, dependencies);
    const legalSuffixAlias = await findOrCreateRoleWithDependencies("owner-1", {
      title: "Maintenance Manager",
      client: "Atlantic Packaging Inc.",
    }, dependencies);
    const broadDescriptor = await findOrCreateRoleWithDependencies("owner-1", {
      title: "Maintenance Manager",
      client: "Atlantic Packaging Group",
    }, dependencies);

    expect(legalSuffixAlias.id).toBe(first.id);
    expect(broadDescriptor.id).not.toBe(first.id);
    expect(dependencies.rows).toHaveLength(2);
  });

  it("reuses a legal-suffix alias stored with the pre-change identity key", async () => {
    const dependencies = roleDependencies();
    dependencies.rows.push({
      id: "pre-change-role",
      ownerId: "owner-1",
      title: "Maintenance Manager",
      client: "Atlantic Packaging Inc.",
      identityKey: JSON.stringify(["maintenance manager", "atlantic packaging inc"]),
      status: "active",
      createdAt: "2026-09-20T01:00:00.000Z",
      updatedAt: "2026-09-20T01:00:00.000Z",
    });

    const role = await findOrCreateRoleWithDependencies("owner-1", {
      title: "Maintenance Manager",
      client: "Atlantic Packaging",
    }, dependencies);

    expect(role.id).toBe("pre-change-role");
    expect(dependencies.inserts).not.toHaveBeenCalled();
  });

  it("converges concurrent find-or-create calls on the unique owner/identity key", async () => {
    const dependencies = roleDependencies();
    const [first, second] = await Promise.all([
      findOrCreateRoleWithDependencies("owner-1", {
        title: "Plant Manager",
        client: "Example Manufacturing",
      }, dependencies),
      findOrCreateRoleWithDependencies("owner-1", {
        title: "plant manager",
        client: "example manufacturing",
      }, dependencies),
    ]);

    expect(first.id).toBe(second.id);
    expect(dependencies.rows).toHaveLength(1);
    expect(dependencies.inserts).toHaveBeenCalledTimes(2);
  });

  it("claims and reuses a matching legacy Job without creating another row", async () => {
    const dependencies = roleDependencies();
    dependencies.rows.push({
      id: "legacy-role",
      ownerId: "owner-1",
      title: "Plant Manager",
      client: "Example Manufacturing",
      identityKey: null,
      status: "active",
      createdAt: "2026-09-20T01:00:00.000Z",
      updatedAt: "2026-09-20T01:00:00.000Z",
    });

    const role = await findOrCreateRoleWithDependencies("owner-1", {
      title: "plant-manager",
      client: "EXAMPLE MANUFACTURING",
    }, dependencies);

    expect(role.id).toBe("legacy-role");
    expect(dependencies.rows[0].identityKey).not.toBeNull();
    expect(dependencies.inserts).not.toHaveBeenCalled();
  });
});

describe("source-intake durability migration", () => {
  it("persists one owner-scoped parse and links stored sources to it", () => {
    const migration = readFileSync(
      new URL("../drizzle/0005_young_landau.sql", import.meta.url),
      "utf8",
    );

    expect(migration).toContain("CREATE TABLE `source_intakes`");
    expect(migration).toContain("CREATE UNIQUE INDEX `source_intakes_owner_content_uidx`");
    expect(migration).toContain("ALTER TABLE `case_sources` ADD `intake_record_id`");
    expect(migration).toContain("ALTER TABLE `role_sources` ADD `intake_record_id`");
    expect(migration).toContain("CREATE UNIQUE INDEX `roles_owner_identity_uidx`");
  });
});
