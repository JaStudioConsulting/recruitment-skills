import { describe, expect, it } from "vitest";

import {
  ALLOWED_PROVIDER_IDS,
  CapabilityUnavailableError,
  ConnectorContractError,
  FORBIDDEN_RECRUITMENT_MCP_PROVIDER_IDS,
  LOGICAL_CAPABILITIES,
  LOGICAL_OPERATIONS,
  StandaloneBroker,
  assertSafeProviderRoute,
  createInjectedCapabilityRegistry,
  createStandaloneCapabilityRegistry,
  definitionForOperation,
  operationsForCapability,
  registryFromBroker,
  userActionForStatus,
} from "../lib/connectors";
import type {
  CapabilityDeclaration,
  HostToolBroker,
  OperationRequest,
} from "../lib/connectors";
import {
  ApprovalContractError,
  IdempotencyContractError,
  OrchestrationContractError,
  assertApprovalExecutable,
  assertIdempotentExecutionAllowed,
  beginIdempotentOperation,
  completeIdempotentOperation,
  consumeApproval,
  createApprovalPreview,
  createIdempotencyKey,
  grantApproval,
  resolveOperationRequest,
  sha256,
  stableStringify,
  timingSafeStringEqual,
} from "../lib/orchestration";
import {
  caseStatusSchema,
  createCandidateSchema,
  createRoleSchema,
  documentKindSchema,
  openCaseSchema,
  reviewSourceSchema,
  saveDocumentSchema,
  sourceKindSchema,
  updateCaseSchema,
} from "../lib/contracts/workstation";
import { mergeCandidateCaseSnapshots } from "../lib/case-merge";
import { completeStoredDocuments } from "../lib/document-model";
import {
  DOCUMENT_KINDS,
  GENERATED_OUTPUT_KINDS,
  STORED_DOCUMENT_KINDS,
  type CandidateCase,
  type StoredDocumentKind,
} from "../lib/workstation-types";

function expectSyncCode(
  action: () => unknown,
  errorType: new (...args: never[]) => Error,
  code: string,
) {
  try {
    action();
    throw new Error(`Expected ${code} to be thrown.`);
  } catch (error) {
    expect(error).toBeInstanceOf(errorType);
    expect(error).toMatchObject({ code });
  }
}

async function expectAsyncCode(
  action: Promise<unknown>,
  errorType: new (...args: never[]) => Error,
  code: string,
) {
  try {
    await action;
    throw new Error(`Expected ${code} to be thrown.`);
  } catch (error) {
    expect(error).toBeInstanceOf(errorType);
    expect(error).toMatchObject({ code });
  }
}

const CREATED_AT = new Date("2026-09-17T12:00:00.000Z");
const EXPIRES_AT = new Date("2026-09-17T12:10:00.000Z");

async function approvalFixture() {
  const payload = {
    candidateId: "candidate-1",
    fields: { notice: "2 weeks", targetSalary: "$105K" },
  };
  const preconditions = {
    recordId: "loxo-123",
    revision: "rev-7",
    current: { notice: null, targetSalary: "$100K" },
  };
  const preview = await createApprovalPreview({
    approvalId: "approval-1",
    operation: "loxo.update_person",
    capability: "loxo.write",
    provider: "host.loxo",
    caseId: "case-1",
    proposedBy: "user-1",
    summary: "Update two confirmed candidate facts.",
    changes: [
      {
        path: "notice",
        label: "Notice",
        before: null,
        after: "2 weeks",
        sourceRefs: ["call-note-1"],
      },
      {
        path: "targetSalary",
        label: "Target salary",
        before: "$100K",
        after: "$105K",
        sourceRefs: ["call-note-1"],
      },
    ],
    payload,
    preconditions,
    createdAt: CREATED_AT,
    expiresAt: EXPIRES_AT,
  });
  const idempotencyKey = await createIdempotencyKey({
    operation: preview.operation,
    provider: preview.provider,
    caseId: preview.caseId,
    approvalHash: preview.approvalHash,
    payloadHash: preview.payloadHash,
  });
  const grant = grantApproval(preview, {
    approvedBy: "user-1",
    idempotencyKey,
    approvedAt: new Date("2026-09-17T12:01:00.000Z"),
  });
  return { payload, preconditions, preview, grant, idempotencyKey };
}

function caseFixture(revisions: {
  resume: number;
  write_up: number;
  loxo_update?: number;
}): CandidateCase {
  const document = (kind: StoredDocumentKind, revision: number) => ({
    kind,
    revision,
    content: kind === "resume" ? { time: 0, version: "2.31.0", blocks: [] } : "",
    updatedAt: `revision-${revision}`,
  });
  return {
    id: "case-1",
    roleId: "role-1",
    candidateId: "candidate-1",
    status: "active",
    notes: "",
    notesFont: "System",
    notesSize: 20,
    revision: 2,
    facts: [],
    assistant: { missing: [], askNext: [], fitConcern: "", nextAction: "" },
    externalRefs: {},
    documents: {
      resume: document("resume", revisions.resume),
      write_up: document("write_up", revisions.write_up),
      submission: document("submission", 1),
      email: document("email", 1),
      loxo_update: document("loxo_update", revisions.loxo_update ?? 1),
    },
    sources: [],
    updatedAt: "2026-09-17T12:00:00.000Z",
  };
}

describe("overlapping case responses", () => {
  it("never regresses a newer document revision when a slower case save arrives", () => {
    const current = caseFixture({ resume: 2, write_up: 3, loxo_update: 4 });
    const slowerCaseResponse = caseFixture({ resume: 1, write_up: 2, loxo_update: 3 });
    slowerCaseResponse.notes = "newer notes response";

    const merged = mergeCandidateCaseSnapshots(current, slowerCaseResponse);

    expect(merged.notes).toBe("newer notes response");
    expect(merged.documents.resume.revision).toBe(2);
    expect(merged.documents.write_up.revision).toBe(3);
    expect(merged.documents.loxo_update.revision).toBe(4);
  });
});

describe("stored document compatibility", () => {
  it("adds only a revision-zero Loxo placeholder to a legacy case", () => {
    const legacyCase = caseFixture({ resume: 7, write_up: 5 });
    const legacyDocuments = DOCUMENT_KINDS.map(
      (kind) => legacyCase.documents[kind],
    );

    const completed = completeStoredDocuments(legacyDocuments);

    for (const kind of DOCUMENT_KINDS) {
      expect(completed[kind]).toBe(legacyCase.documents[kind]);
    }
    expect(completed.write_up).toMatchObject({ kind: "write_up", revision: 5 });
    expect(completed.loxo_update).toEqual({
      kind: "loxo_update",
      revision: 0,
      content: "",
      updatedAt: "",
    });
  });

  it("preserves an already materialized Loxo update", () => {
    const current = caseFixture({ resume: 2, write_up: 3, loxo_update: 6 });
    current.documents.loxo_update.content = "- Salary expectation: $110,000";

    const completed = completeStoredDocuments(
      STORED_DOCUMENT_KINDS.map((kind) => current.documents[kind]),
    );

    expect(completed.loxo_update).toBe(current.documents.loxo_update);
    expect(completed.loxo_update).toMatchObject({
      revision: 6,
      content: "- Salary expectation: $110,000",
    });
  });
});

describe("connector provider contracts", () => {
  it("keeps the provider allowlist explicit and excludes Recruitment MCP service impersonators", () => {
    expect(ALLOWED_PROVIDER_IDS).toEqual([
      "host.gmail",
      "host.calendar",
      "host.drive",
      "host.sheets",
      "host.loxo",
      "recruitment-mcp.pdf",
    ]);
    for (const provider of FORBIDDEN_RECRUITMENT_MCP_PROVIDER_IDS) {
      expect(ALLOWED_PROVIDER_IDS).not.toContain(provider);
    }
  });

  it("accepts only a provider that is allowlisted for the requested capability", () => {
    expect(() => assertSafeProviderRoute("gmail.read", "host.gmail")).not.toThrow();
    expect(() => assertSafeProviderRoute("pdf.generate", "recruitment-mcp.pdf")).not.toThrow();

    expectSyncCode(
      () => assertSafeProviderRoute("gmail.read", "recruitment-mcp.gmail"),
      ConnectorContractError,
      "provider_not_allowed",
    );
    expectSyncCode(
      () => assertSafeProviderRoute("loxo.write", "host.sheets"),
      ConnectorContractError,
      "provider_capability_mismatch",
    );
  });

  it("rejects duplicate injected capability declarations and fills omissions with unavailable truth", () => {
    expectSyncCode(
      () =>
        createInjectedCapabilityRegistry([
          { capability: "gmail.read", provider: "host.gmail", status: "ready" },
          { capability: "gmail.read", provider: "host.gmail", status: "ready" },
        ]),
      ConnectorContractError,
      "duplicate_capability",
    );

    const registry = createInjectedCapabilityRegistry([
      { capability: "gmail.read", provider: "host.gmail", status: "ready" },
    ]);
    expect(registry.require("gmail.read")).toMatchObject({
      status: "ready",
      provider: "host.gmail",
    });
    expect(registry.require("tracker.write")).toMatchObject({
      status: "connector_unavailable",
      provider: null,
    });
  });

  it("reports every standalone capability as unavailable and never invents a fallback", async () => {
    const checkedAt = new Date("2026-09-17T12:00:00.000Z");
    const registry = createStandaloneCapabilityRegistry(checkedAt);
    const states = registry.list();

    expect(states).toHaveLength(LOGICAL_CAPABILITIES.length);
    expect(states.map((state) => state.capability)).toEqual(LOGICAL_CAPABILITIES);
    for (const state of states) {
      expect(state.provider).toBeNull();
      expect(state.checkedAt).toBe(checkedAt.toISOString());
      expect(state.status).toBe(
        state.capability === "pdf.generate"
          ? "pdf_builder_unavailable"
          : "connector_unavailable",
      );
    }

    expectSyncCode(
      () => registry.resolve("tracker.execute_update"),
      CapabilityUnavailableError,
      "capability_unavailable",
    );

    const broker = new StandaloneBroker();
    const request = {
      operationId: "operation-1",
      operation: "gmail.search",
      capability: "gmail.read",
      caseId: "case-1",
      actorId: "user-1",
      mode: "read",
      provider: "host.gmail",
      payload: { query: "subject:test" },
      sourceRefs: [],
    } satisfies OperationRequest<{ query: string }>;
    await expectAsyncCode(
      broker.invoke(request),
      ConnectorContractError,
      "unsupported_operation",
    );
  });

  it("uses standalone truth for a missing broker and validates declarations returned by a broker", async () => {
    const standalone = await registryFromBroker(null, CREATED_AT);
    expect(standalone.require("gmail.read").status).toBe("connector_unavailable");

    const declarations: CapabilityDeclaration[] = [
      { capability: "sheets.read", provider: "host.sheets", status: "ready" },
    ];
    const broker: HostToolBroker = {
      async capabilities() {
        return declarations;
      },
      async invoke() {
        throw new Error("not used");
      },
    };
    const injected = await registryFromBroker(broker, CREATED_AT);
    expect(injected.resolve("sheets.read_range")).toMatchObject({
      capability: "sheets.read",
      provider: "host.sheets",
      status: "ready",
    });
    expect(injected.require("loxo.read").status).toBe("connector_unavailable");
  });

  it("keeps operation definitions complete and truthful", () => {
    expect(Object.keys(LOGICAL_OPERATIONS)).not.toHaveLength(0);
    for (const operation of LOGICAL_OPERATIONS) {
      const definition = definitionForOperation(operation);
      expect(LOGICAL_CAPABILITIES).toContain(definition.capability);
      expect(operationsForCapability(definition.capability)).toContain(operation);
      expect(["read", "draft", "write"]).toContain(definition.mode);
      if (definition.mode === "write" && operation !== "pdf.generate") {
        expect(definition.approvalRequired).toBe(true);
      }
    }
    expect(userActionForStatus("unknown_result")).toMatch(/Reconcile exact external IDs/i);
    expect(userActionForStatus("connector_unavailable")).toMatch(/No fallback was executed/i);
  });
});

describe("write orchestration gates", () => {
  const registry = createInjectedCapabilityRegistry([
    { capability: "sheets.read", provider: "host.sheets", status: "ready" },
    { capability: "tracker.write", provider: "host.sheets", status: "ready" },
    { capability: "gmail.draft", provider: "host.gmail", status: "ready" },
  ]);

  it("requires approval, idempotency, and current preconditions for external writes", () => {
    const base = {
      operation: "tracker.execute_update" as const,
      caseId: "case-1",
      actorId: "user-1",
      payload: { rows: [{ id: "event-1" }] },
    };

    expectSyncCode(
      () => resolveOperationRequest(registry, base),
      OrchestrationContractError,
      "approval_required",
    );
    expectSyncCode(
      () => resolveOperationRequest(registry, { ...base, approvalId: "approval-1" }),
      OrchestrationContractError,
      "idempotency_required",
    );
    expectSyncCode(
      () =>
        resolveOperationRequest(registry, {
          ...base,
          approvalId: "approval-1",
          idempotencyKey: "idem-1",
        }),
      OrchestrationContractError,
      "precondition_required",
    );

    expect(
      resolveOperationRequest(registry, {
        ...base,
        operationId: "operation-1",
        approvalId: "approval-1",
        idempotencyKey: "idem-1",
        preconditionSnapshot: { revision: "sheet-rev-9" },
        sourceRefs: [{ system: "gmail", externalId: "message-1" }],
      }),
    ).toEqual({
      operationId: "operation-1",
      operation: "tracker.execute_update",
      capability: "tracker.write",
      caseId: "case-1",
      actorId: "user-1",
      mode: "write",
      provider: "host.sheets",
      payload: { rows: [{ id: "event-1" }] },
      sourceRefs: [{ system: "gmail", externalId: "message-1" }],
      preconditionSnapshot: { revision: "sheet-rev-9" },
      approvalId: "approval-1",
      idempotencyKey: "idem-1",
    });
  });

  it("does not invent write gates for read or draft operations", () => {
    const read = resolveOperationRequest(registry, {
      operationId: "read-1",
      operation: "tracker.prepare_update",
      caseId: "case-1",
      actorId: "user-1",
      payload: { candidateId: "candidate-1" },
    });
    const draft = resolveOperationRequest(registry, {
      operationId: "draft-1",
      operation: "gmail.create_draft",
      caseId: "case-1",
      actorId: "user-1",
      payload: { subject: "Draft only" },
    });
    expect(read.mode).toBe("read");
    expect(read.approvalId).toBeUndefined();
    expect(draft.mode).toBe("draft");
    expect(draft.approvalId).toBeUndefined();
  });
});

describe("approval integrity", () => {
  it("creates stable hashes and rejects invalid preview windows or empty changes", async () => {
    const { preview, payload, preconditions } = await approvalFixture();
    expect(preview.payloadHash).toBe(await sha256(payload));
    expect(preview.preconditionHash).toBe(await sha256(preconditions));
    expect(preview.approvalHash).toMatch(/^[a-f0-9]{64}$/);

    await expectAsyncCode(
      createApprovalPreview({
        operation: "loxo.update_person",
        capability: "loxo.write",
        provider: "host.loxo",
        caseId: "case-1",
        proposedBy: "user-1",
        summary: "Bad window",
        changes: [{ path: "notice", label: "Notice", before: null, after: "2 weeks" }],
        payload: {},
        preconditions: {},
        createdAt: CREATED_AT,
        expiresAt: CREATED_AT,
      }),
      ApprovalContractError,
      "invalid_expiration",
    );
    await expectAsyncCode(
      createApprovalPreview({
        operation: "loxo.update_person",
        capability: "loxo.write",
        provider: "host.loxo",
        caseId: "case-1",
        proposedBy: "user-1",
        summary: "No changes",
        changes: [],
        payload: {},
        preconditions: {},
        createdAt: CREATED_AT,
        expiresAt: EXPIRES_AT,
      }),
      ApprovalContractError,
      "empty_preview",
    );
  });

  it("executes only the exact approved payload, preconditions, hash, and idempotency key", async () => {
    const fixture = await approvalFixture();
    await expect(
      assertApprovalExecutable({
        preview: fixture.preview,
        grant: fixture.grant,
        currentPayload: fixture.payload,
        currentPreconditions: fixture.preconditions,
        idempotencyKey: fixture.idempotencyKey,
        now: new Date("2026-09-17T12:02:00.000Z"),
      }),
    ).resolves.toBeUndefined();

    await expectAsyncCode(
      assertApprovalExecutable({
        preview: fixture.preview,
        grant: fixture.grant,
        currentPayload: {
          ...fixture.payload,
          fields: { ...fixture.payload.fields, notice: "4 weeks" },
        },
        currentPreconditions: fixture.preconditions,
        idempotencyKey: fixture.idempotencyKey,
        now: new Date("2026-09-17T12:02:00.000Z"),
      }),
      ApprovalContractError,
      "payload_changed",
    );

    await expectAsyncCode(
      assertApprovalExecutable({
        preview: fixture.preview,
        grant: fixture.grant,
        currentPayload: fixture.payload,
        currentPreconditions: { ...fixture.preconditions, revision: "rev-8" },
        idempotencyKey: fixture.idempotencyKey,
        now: new Date("2026-09-17T12:02:00.000Z"),
      }),
      ApprovalContractError,
      "precondition_changed",
    );

    await expectAsyncCode(
      assertApprovalExecutable({
        preview: fixture.preview,
        grant: fixture.grant,
        currentPayload: fixture.payload,
        currentPreconditions: fixture.preconditions,
        idempotencyKey: "different-key",
        now: new Date("2026-09-17T12:02:00.000Z"),
      }),
      ApprovalContractError,
      "idempotency_mismatch",
    );
  });

  it("rejects preview tampering, grant mismatch, expiry, and consumed approvals", async () => {
    const fixture = await approvalFixture();
    const tamperedPreview = {
      ...fixture.preview,
      summary: "Tampered after approval",
    };
    await expectAsyncCode(
      assertApprovalExecutable({
        preview: tamperedPreview,
        grant: fixture.grant,
        currentPayload: fixture.payload,
        currentPreconditions: fixture.preconditions,
        idempotencyKey: fixture.idempotencyKey,
        now: new Date("2026-09-17T12:02:00.000Z"),
      }),
      ApprovalContractError,
      "preview_changed",
    );

    await expectAsyncCode(
      assertApprovalExecutable({
        preview: fixture.preview,
        grant: { ...fixture.grant, approvalHash: "0".repeat(64) },
        currentPayload: fixture.payload,
        currentPreconditions: fixture.preconditions,
        idempotencyKey: fixture.idempotencyKey,
        now: new Date("2026-09-17T12:02:00.000Z"),
      }),
      ApprovalContractError,
      "approval_mismatch",
    );

    await expectAsyncCode(
      assertApprovalExecutable({
        preview: fixture.preview,
        grant: fixture.grant,
        currentPayload: fixture.payload,
        currentPreconditions: fixture.preconditions,
        idempotencyKey: fixture.idempotencyKey,
        now: new Date("2026-09-17T12:10:00.001Z"),
      }),
      ApprovalContractError,
      "approval_expired",
    );

    const consumed = consumeApproval(
      fixture.grant,
      new Date("2026-09-17T12:03:00.000Z"),
    );
    await expectAsyncCode(
      assertApprovalExecutable({
        preview: fixture.preview,
        grant: consumed,
        currentPayload: fixture.payload,
        currentPreconditions: fixture.preconditions,
        idempotencyKey: fixture.idempotencyKey,
        now: new Date("2026-09-17T12:04:00.000Z"),
      }),
      ApprovalContractError,
      "approval_consumed",
    );
    expectSyncCode(
      () => consumeApproval(consumed),
      ApprovalContractError,
      "approval_consumed",
    );
  });

  it("rejects approval after expiration and requires a non-empty execution key", async () => {
    const { preview } = await approvalFixture();
    expectSyncCode(
      () =>
        grantApproval(preview, {
          approvedBy: "user-1",
          idempotencyKey: "idem-1",
          approvedAt: new Date("2026-09-17T12:10:00.001Z"),
        }),
      ApprovalContractError,
      "approval_expired",
    );
    expectSyncCode(
      () =>
        grantApproval(preview, {
          approvedBy: "user-1",
          idempotencyKey: "   ",
          approvedAt: new Date("2026-09-17T12:01:00.000Z"),
        }),
      ApprovalContractError,
      "missing_idempotency_key",
    );
  });
});

describe("idempotency contracts", () => {
  it("derives deterministic scoped keys and rejects empty records", async () => {
    const input = {
      operation: "tracker.execute_update" as const,
      provider: "host.sheets" as const,
      caseId: "case-1",
      approvalHash: "approval-hash",
      payloadHash: "payload-hash",
    };
    const first = await createIdempotencyKey(input);
    const reordered = await createIdempotencyKey({
      payloadHash: input.payloadHash,
      caseId: input.caseId,
      provider: input.provider,
      operation: input.operation,
      approvalHash: input.approvalHash,
    });
    expect(first).toBe(reordered);
    expect(await createIdempotencyKey({ ...input, caseId: "case-2" })).not.toBe(first);

    expectSyncCode(
      () =>
        beginIdempotentOperation({
          ...input,
          key: " ",
        }),
      IdempotencyContractError,
      "missing_idempotency_key",
    );
  });

  it("allows only an explicit retryable failure to reuse a key", () => {
    const started = beginIdempotentOperation({
      key: "idem-1",
      operation: "tracker.execute_update",
      provider: "host.sheets",
      caseId: "case-1",
      approvalHash: "approval-hash",
      payloadHash: "payload-hash",
      startedAt: CREATED_AT,
    });
    expectSyncCode(
      () => assertIdempotentExecutionAllowed(started),
      IdempotencyContractError,
      "duplicate_execution",
    );

    const retryable = completeIdempotentOperation(started, {
      status: "failed",
      retryable: true,
      completedAt: new Date("2026-09-17T12:01:00.000Z"),
    });
    expect(() => assertIdempotentExecutionAllowed(retryable)).not.toThrow();

    const notRetryable = { ...retryable, retryable: false };
    expectSyncCode(
      () => assertIdempotentExecutionAllowed(notRetryable),
      IdempotencyContractError,
      "duplicate_execution",
    );

    const unknown = completeIdempotentOperation(started, {
      status: "unknown_result",
      resultRef: "provider-request-1",
      completedAt: new Date("2026-09-17T12:01:00.000Z"),
    });
    expectSyncCode(
      () => assertIdempotentExecutionAllowed(unknown),
      IdempotencyContractError,
      "duplicate_execution",
    );
    expect(() => completeIdempotentOperation(unknown, { status: "failed", retryable: true })).toThrow(
      IdempotencyContractError,
    );
  });
});

describe("stable hashing", () => {
  it("is property-order stable and rejects unsupported or non-finite values", async () => {
    expect(stableStringify({ b: 2, a: 1 })).toBe(stableStringify({ a: 1, b: 2 }));
    expect(await sha256({ b: 2, a: 1 })).toBe(await sha256({ a: 1, b: 2 }));
    expect(timingSafeStringEqual("abc", "abc")).toBe(true);
    expect(timingSafeStringEqual("abc", "abd")).toBe(false);
    expect(timingSafeStringEqual("abc", "ab")).toBe(false);
    expect(() => stableStringify({ amount: Number.NaN })).toThrow(/Non-finite number/);
    expect(() => stableStringify({ value: undefined })).toThrow(/Unsupported hash value/);
  });
});

describe("workstation request schemas", () => {
  it("keeps four canonical generated outputs while retaining legacy write_up storage", () => {
    expect(GENERATED_OUTPUT_KINDS).toEqual([
      "resume",
      "submission",
      "email",
      "loxo_update",
    ]);
    expect(STORED_DOCUMENT_KINDS).toEqual([
      "resume",
      "write_up",
      "submission",
      "email",
      "loxo_update",
    ]);
    expect(DOCUMENT_KINDS).toEqual(["resume", "write_up", "submission", "email"]);
  });

  it("accepts only declared case and document enums", () => {
    for (const status of ["active", "screening", "submission_ready", "on_hold", "closed"]) {
      expect(caseStatusSchema.parse(status)).toBe(status);
    }
    expect(caseStatusSchema.safeParse("submitted_without_approval").success).toBe(false);

    for (const kind of ["resume", "write_up", "submission", "email", "loxo_update"]) {
      expect(documentKindSchema.parse(kind)).toBe(kind);
    }
    expect(documentKindSchema.safeParse("tracker_update").success).toBe(false);
  });

  it("validates role, candidate, and exact UUID case identity", () => {
    expect(createRoleSchema.parse({ title: "Maintenance Manager" })).toEqual({
      title: "Maintenance Manager",
      client: "",
    });
    expect(createRoleSchema.safeParse({ title: "   " }).success).toBe(false);
    expect(createCandidateSchema.parse({ name: "Candidate A" })).toEqual({
      name: "Candidate A",
      currentTitle: "",
    });
    expect(createCandidateSchema.safeParse({ name: "" }).success).toBe(false);
    expect(
      openCaseSchema.safeParse({
        roleId: "11111111-1111-4111-8111-111111111111",
        candidateId: "22222222-2222-4222-8222-222222222222",
      }).success,
    ).toBe(true);
    expect(openCaseSchema.safeParse({ roleId: "role-1", candidateId: "candidate-1" }).success).toBe(false);
  });

  it("requires optimistic revisions and at least one bounded case change", () => {
    expect(updateCaseSchema.safeParse({ expectedRevision: 1, notes: "Call notes" }).success).toBe(true);
    expect(updateCaseSchema.safeParse({ expectedRevision: 1 }).success).toBe(false);
    expect(updateCaseSchema.safeParse({ expectedRevision: 0, notes: "Call notes" }).success).toBe(false);
    expect(updateCaseSchema.safeParse({ expectedRevision: 1, notesSize: 11 }).success).toBe(false);
    expect(updateCaseSchema.safeParse({ expectedRevision: 1, notesSize: 73 }).success).toBe(false);
    expect(updateCaseSchema.safeParse({ expectedRevision: 1, notesFont: "" }).success).toBe(false);
  });

  it("allows revision 0 only for repository-controlled first materialization and validates safe source kinds", () => {
    expect(
      saveDocumentSchema.safeParse({
        expectedRevision: 2,
        content: { time: 1, blocks: [{ type: "paragraph", data: { text: "Saved text" } }] },
      }).success,
    ).toBe(true);
    expect(saveDocumentSchema.safeParse({ expectedRevision: 0, content: "Loxo update bullets" }).success).toBe(true);
    expect(saveDocumentSchema.safeParse({ expectedRevision: -1, content: {} }).success).toBe(false);
    for (const kind of ["job_description", "resume", "transcript", "call_notes", "pasted_text", "other"]) {
      expect(sourceKindSchema.parse(kind)).toBe(kind);
    }
    expect(sourceKindSchema.safeParse("resume_pdf").success).toBe(false);
    expect(sourceKindSchema.safeParse("resume/pdf").success).toBe(false);
    expect(sourceKindSchema.safeParse("<script>").success).toBe(false);
    expect(reviewSourceSchema.parse({
      lifecycleStatus: "reviewed",
      kind: "call_notes",
    })).toEqual({ lifecycleStatus: "reviewed", kind: "call_notes" });
    expect(reviewSourceSchema.safeParse({ lifecycleStatus: "classified" }).success).toBe(false);
  });
});
