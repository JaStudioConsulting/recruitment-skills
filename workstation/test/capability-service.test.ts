import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

import {
  prepareCapabilityWithDependencies,
  type CapabilityServiceDependencies,
} from "../lib/server/capability-service";
import type { CapabilityRunRecord } from "../lib/server/capability-run-repository";
import type {
  CandidateCase,
  CandidateRecord,
  CaseSource,
  RoleRecord,
  SourceKind,
} from "../lib/workstation-types";

function source(id: string, kind: SourceKind): CaseSource {
  return {
    id,
    kind,
    filename: `${id}.txt`,
    contentType: "text/plain",
    sizeBytes: 10,
    sha256: `sha-${id}`,
    captureTime: "2026-09-20T00:00:00.000Z",
    lifecycleStatus: "reviewed",
    reviewStatus: "reviewed",
    parsedText: `${kind} synthetic evidence`,
    classificationMethod: "manual",
  };
}

function caseContext() {
  const candidateCase = {
    id: "case-1",
    roleId: "role-1",
    candidateId: "candidate-1",
    status: "active",
    notes: "",
    notesDrawingSvg: "",
    notesFont: "System",
    notesSize: 20,
    revision: 3,
    facts: [],
    assistant: { missing: [], askNext: [], fitConcern: "", nextAction: "" },
    externalRefs: {},
    documents: {} as CandidateCase["documents"],
    sources: [
      source("resume", "resume"),
      source("call", "transcript"),
      source("jd", "job_description"),
    ],
    updatedAt: "2026-09-20T00:00:00.000Z",
  } satisfies CandidateCase;
  const role = {
    id: "role-1",
    title: "Maintenance Manager",
    client: "Synthetic Manufacturing",
    status: "active",
  } satisfies RoleRecord;
  const candidate = {
    id: "candidate-1",
    name: "Synthetic Candidate",
    currentTitle: "Maintenance Supervisor",
  } satisfies CandidateRecord;
  return { candidateCase, role, candidate };
}

describe("capability preparation service", () => {
  it("persists a server-owned prepared run with normalized deterministic execution identity", async () => {
    const created = { id: "run-1", status: "prepared" } as CapabilityRunRecord;
    const createCapabilityRun = vi.fn<CapabilityServiceDependencies["createCapabilityRun"]>(
      async () => created,
    );
    const dependencies: CapabilityServiceDependencies = {
      getCapabilityCaseContext: vi.fn(async () => caseContext()),
      createCapabilityRun,
    };

    const response = await prepareCapabilityWithDependencies(
      "user-1",
      "case-1",
      "write-up",
      {
        extraInput: "Confirmed destination",
        provider: "client-controlled-value",
        model: "client-controlled-value",
        now: "2026-09-20T01:00:00.000Z",
      },
      dependencies,
    );

    expect(response.preparation).toMatchObject({
      capabilityId: "write-up",
      executorId: "write-up-candidate",
      canExecute: true,
    });
    expect(response.run).toBe(created);
    expect(createCapabilityRun).toHaveBeenCalledOnce();
    expect(createCapabilityRun.mock.calls[0][1]).toMatchObject({
      caseId: "case-1",
      input: {
        extraInput: "Confirmed destination",
        provider: "workstation",
        model: "write-up-candidate-v1",
      },
      prepared: {
        capabilityId: "write-up",
        executorId: "write-up-candidate",
        canExecute: true,
      },
    });
  });

  it("refuses to prepare branded-resume while its active authorities conflict", async () => {
    const created = { id: "run-pdf-1", status: "prepared" } as CapabilityRunRecord;
    const createCapabilityRun = vi.fn<CapabilityServiceDependencies["createCapabilityRun"]>(
      async () => created,
    );
    const response = await prepareCapabilityWithDependencies(
      "user-1",
      "case-1",
      "brandedresume",
      { extraInput: "", provider: "manual", model: "none" },
      {
        getCapabilityCaseContext: vi.fn(async () => caseContext()),
        createCapabilityRun,
      },
    );

    expect(response.run).toBeNull();
    expect(response.preparation).toMatchObject({
      capabilityId: "brandedresume",
      executorId: "brand-resume",
      outputKind: "pdf",
      canExecute: false,
    });
    expect(response.preparation.blocker).toMatch(/active authorities conflict/);
    expect(response.preparation.blocker).toMatch(/legislator override/);
    expect(createCapabilityRun).not.toHaveBeenCalled();
  });
});
