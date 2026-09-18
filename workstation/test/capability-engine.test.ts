import { describe, expect, it, vi } from "vitest";

import { FEATURES, FEATURE_GROUPS, missingRequired, requirementStates } from "../lib/capabilities/catalog";
import { callLocalAi, cancelLocalAi } from "../lib/server/local-ai";
import { callArtifactBuilder } from "../lib/server/artifact-builder";
import type { CandidateCase } from "../lib/workstation-types";

const candidateCase = {
  sources: [
    { kind: "resume", lifecycleStatus: "reviewed" },
    { kind: "job_description", lifecycleStatus: "reviewed" },
  ],
} as CandidateCase;

describe("feature declarations", () => {
  it("exposes the fifteen recruiter-facing capabilities in the four required groups", () => {
    expect(FEATURES).toHaveLength(15);
    expect(FEATURE_GROUPS).toEqual(["candidate", "role", "pipeline", "writing"]);
    expect(FEATURES.map((feature) => feature.label)).toEqual([
      "Brand resume", "Write up candidate", "Vet/screen candidate", "Defend a borderline candidate",
      "Interview prep PDF", "Reference check PDF", "Offer letter", "Cover letter", "Source candidates",
      "Screen applicants for this role", "Draft job posting", "Loxo pipeline review", "Tracker",
      "LinkedIn post", "Email in my voice",
    ]);
  });

  it("keeps repository modules as authority paths instead of exposing them as feature buttons", () => {
    expect(FEATURES.some((feature) => feature.label === "Legislator")).toBe(false);
    expect(FEATURES.find((feature) => feature.id === "brand-resume")?.capability_ids).toContain("legislator");
    expect(FEATURES.every((feature) => feature.guide_paths.every((path) => path.endsWith("GUIDE.md")))).toBe(true);
  });

  it("computes unmet requirements from reviewed sources, role, input, and adapters", () => {
    const feature = FEATURES.find((item) => item.id === "write-up-candidate")!;
    const states = requirementStates({ feature, activeCase: candidateCase, roleSelected: true, extraInput: "", connectors: [] });
    expect(missingRequired(states).map((item) => item.id)).toEqual(["call-evidence"]);
  });
});

describe("local AI broker", () => {
  it("returns Local only when the service is not configured", async () => {
    await expect(callLocalAi({ featureId: "vet-candidate", provider: "claude", model: "sonnet", runId: crypto.randomUUID(), context: {} }, {}))
      .resolves.toEqual({ status: "local_only", detail: "Run this feature from the local Mac Workbench." });
  });

  it("accepts a validated editable draft", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      status: "completed", result_kind: "document", provider: "claude", model: "sonnet",
      result: { title: "Synthetic draft", unknowns: ["Current salary"], document: "Draft body" },
    }), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    const result = await callLocalAi({ featureId: "vet-candidate", provider: "claude", model: "sonnet", runId: crypto.randomUUID(), context: {} }, { baseUrl: "http://127.0.0.1:8000/", token: "synthetic-token", fetchImpl });
    expect(result).toMatchObject({ status: "completed", draft: { title: "Synthetic draft", status: "draft", document: "Draft body" } });
    expect(fetchImpl).toHaveBeenCalledWith("http://127.0.0.1:8000/local-ai/run", expect.objectContaining({
      headers: expect.objectContaining({ "content-type": "application/json", "x-local-ai-token": "synthetic-token" }),
    }));
  });

  it("retains an executable PDF payload until the server builder runs", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      status: "completed", result_kind: "pdf", provider: "gemini", model: "auto",
      result: { title: "Synthetic PDF", unknowns: [], document: "Draft summary", artifact: { candidate: { full_name: "Alex Example" } } },
    }), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    const result = await callLocalAi({ featureId: "reference-check-pdf", provider: "gemini", model: "auto", runId: crypto.randomUUID(), context: {} }, { baseUrl: "http://127.0.0.1:8000", fetchImpl });
    expect(result).toMatchObject({ status: "completed", draft: { resultKind: "pdf", artifactPayload: { candidate: { full_name: "Alex Example" } } } });
  });

  it("parses a PDF built through the MCP broker", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ result: { structuredContent: { ok: true, filename: "Synthetic.pdf", download_url: "/files/token.pdf" } } }), { status: 200 })) as unknown as typeof fetch;
    await expect(callArtifactBuilder("build_reference_check_pdf", { candidate: {} }, { endpoint: "http://127.0.0.1:8000/mcp", fetchImpl }))
      .resolves.toEqual({ status: "built", filename: "Synthetic.pdf", downloadUrl: "/files/token.pdf" });
  });

  it("cancels through the local service", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ status: "cancelled" }), { status: 200 })) as unknown as typeof fetch;
    await expect(cancelLocalAi("run-3", { baseUrl: "http://127.0.0.1:8000", token: "synthetic-token", fetchImpl })).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith("http://127.0.0.1:8000/local-ai/cancel/run-3", expect.objectContaining({
      headers: expect.objectContaining({ "content-type": "application/json", "x-local-ai-token": "synthetic-token" }),
    }));
  });
});
