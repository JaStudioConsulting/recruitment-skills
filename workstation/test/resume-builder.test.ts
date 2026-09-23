import { describe, expect, it } from "vitest";

import {
  DEFAULT_RESUME_BUILDER_URL,
  brandResumeRequestSchema,
  callResumeBuilder,
  parseBuilderPayload,
} from "../lib/server/resume-builder";

// Synthetic candidate only.
const CANDIDATE = {
  name: "Sample Person",
  headline: "CNC Machinist",
  experience: [{ title: "CNC Machinist", company: "Example Fabrication", dates: "Jan-2020 - Present", bullets: ["Cut scrap **22%**."] }],
};
const BUILDER_DIGEST = "d".repeat(64);

function rpc(tool: Record<string, unknown>, asText = false) {
  const attested = tool.ok === true && tool.builder_digest === undefined
    ? { ...tool, builder_digest: BUILDER_DIGEST }
    : tool;
  return asText
    ? { jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: JSON.stringify(attested) }] } }
    : { jsonrpc: "2.0", id: 1, result: { structuredContent: attested } };
}

function fakeFetch(status: number, body: unknown, seen: { url?: string; init?: RequestInit } = {}) {
  return (async (url: string, init?: RequestInit) => {
    seen.url = url;
    seen.init = init;
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

describe("resume builder bridge", () => {
  it("reports a built PDF with its download link", async () => {
    const result = await callResumeBuilder(
      { mode: "named_submission", candidate: CANDIDATE },
      { fetchImpl: fakeFetch(200, rpc({ ok: true, filename: "Sample Person - Top Tier Talent Group.pdf", download_url: "https://builder.example/files/abc.pdf", expires_in_seconds: 3600, contact_removed: ["email"], notes: [] })) },
    );
    expect(result).toEqual({
      status: "built",
      filename: "Sample Person - Top Tier Talent Group.pdf",
      downloadUrl: "https://builder.example/files/abc.pdf",
      expiresInSeconds: 3600,
      contactRemoved: ["email"],
      notes: [],
      builderDigest: BUILDER_DIGEST,
    });
  });

  it("reads the result when the builder returns it as text content", () => {
    const result = parseBuilderPayload(rpc({ ok: true, filename: "x.pdf", download_url: "https://builder.example/files/x.pdf" }, true));
    expect(result.status).toBe("built");
  });

  it("passes the builder's refusal problems through without retrying", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response(JSON.stringify(rpc({ ok: false, error: "input_rejected", problems: ["summary contains contact details (phone)."] })), { status: 200 });
    }) as unknown as typeof fetch;
    const result = await callResumeBuilder({ mode: "internal_mpc", candidate: CANDIDATE }, { fetchImpl });
    expect(result).toEqual({ status: "refused", problems: ["summary contains contact details (phone)."] });
    expect(calls).toBe(1);
  });

  it("turns a builder-level abort into a refusal with the reason", () => {
    const result = parseBuilderPayload(rpc({ ok: false, error: "builder did not produce a PDF", detail: "ABORT: banned long-dash characters found." }));
    expect(result).toEqual({ status: "refused", problems: ["builder did not produce a PDF: ABORT: banned long-dash characters found."] });
  });

  it("sends the access key as a bearer header only when one is configured", async () => {
    const withKey: { init?: RequestInit } = {};
    await callResumeBuilder({ mode: "named_submission", candidate: CANDIDATE }, { token: "synthetic-key", fetchImpl: fakeFetch(200, rpc({ ok: false, problems: ["x"] }), withKey) });
    expect((withKey.init?.headers as Record<string, string>).authorization).toBe("Bearer synthetic-key");

    const withoutKey: { init?: RequestInit } = {};
    await callResumeBuilder({ mode: "named_submission", candidate: CANDIDATE }, { fetchImpl: fakeFetch(200, rpc({ ok: false, problems: ["x"] }), withoutKey) });
    expect((withoutKey.init?.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it("calls build_pdf on the default endpoint with the candidate", async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    await callResumeBuilder({ mode: "named_submission", candidate: CANDIDATE }, { fetchImpl: fakeFetch(200, rpc({ ok: false, problems: ["x"] }), seen) });
    expect(seen.url).toBe(DEFAULT_RESUME_BUILDER_URL);
    const body = JSON.parse(String(seen.init?.body));
    expect(body.method).toBe("tools/call");
    expect(body.params.name).toBe("build_pdf");
    expect(body.params.arguments.candidate).toEqual(CANDIDATE);
  });

  it("reports a wrong or missing access key as unavailable", async () => {
    const result = await callResumeBuilder({ mode: "named_submission", candidate: CANDIDATE }, { fetchImpl: fakeFetch(401, { error: "unauthorized" }) });
    expect(result.status).toBe("unavailable");
    expect(result.status === "unavailable" && result.detail).toMatch(/access key/);
  });

  it("reports an unreachable builder as unavailable, never as built", async () => {
    const fetchImpl = (async () => { throw new TypeError("network down"); }) as unknown as typeof fetch;
    const result = await callResumeBuilder({ mode: "named_submission", candidate: CANDIDATE }, { fetchImpl });
    expect(result).toEqual({ status: "unavailable", detail: "The resume builder could not be reached. Nothing was built." });
  });

  it("does not build an external-client blind MPC and makes no call", async () => {
    let calls = 0;
    const fetchImpl = (async () => { calls += 1; return new Response("{}"); }) as unknown as typeof fetch;
    const result = await callResumeBuilder({ mode: "external_blind_mpc", candidate: CANDIDATE }, { fetchImpl });
    expect(result.status).toBe("unavailable");
    expect(calls).toBe(0);
  });

  it("never claims a PDF without a download link", () => {
    expect(parseBuilderPayload(rpc({ ok: true, filename: "x.pdf" })).status).toBe("unavailable");
    expect(parseBuilderPayload(null).status).toBe("unavailable");
    expect(parseBuilderPayload({ jsonrpc: "2.0", id: 1, error: { message: "boom" } }).status).toBe("unavailable");
  });

  it("refuses an unattested builder result", () => {
    expect(parseBuilderPayload(rpc({ ok: true, filename: "x.pdf", download_url: "https://builder.example/files/x.pdf", builder_digest: "missing" })).status).toBe("unavailable");
  });

  it("validates the request shape", () => {
    expect(brandResumeRequestSchema.safeParse({ mode: "named_submission", candidate: CANDIDATE }).success).toBe(true);
    expect(brandResumeRequestSchema.safeParse({ mode: "brand_it", candidate: CANDIDATE }).success).toBe(false);
    expect(brandResumeRequestSchema.safeParse({ mode: "named_submission" }).success).toBe(false);
  });
});
