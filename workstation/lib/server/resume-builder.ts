import { z } from "zod";

/**
 * Bridge from the Workbench to the hosted TTTG resume builder (the
 * recruitment-mcp server's `build_pdf` tool). The builder checks every resume
 * at its own door (shape fixes, contact removal, refusal instead of silent
 * drops), so this bridge only transports the request and reports the answer
 * truthfully. It never retries a refusal and never claims a PDF it did not get.
 */

export const DEFAULT_RESUME_BUILDER_URL = "https://recruitment-mcp-oofn.onrender.com/mcp";

export const RESUME_MODES = ["named_submission", "internal_mpc", "external_blind_mpc"] as const;
export type ResumeMode = (typeof RESUME_MODES)[number];

export const brandResumeRequestSchema = z.object({
  mode: z.enum(RESUME_MODES),
  // candidate.json as defined by skills/recruiter/modules/brandedresume. The
  // hosted builder validates the shape itself and names any problem.
  candidate: z.record(z.string(), z.unknown()),
  filename: z.string().trim().min(1).max(200).optional(),
});
export type BrandResumeRequest = z.infer<typeof brandResumeRequestSchema>;

export type BrandResumeResult =
  | {
      status: "built";
      filename: string;
      downloadUrl: string;
      expiresInSeconds: number | null;
      contactRemoved: string[];
      notes: string[];
    }
  | { status: "refused"; problems: string[] }
  | { status: "unavailable"; detail: string };

export type ResumeBuilderConfig = {
  endpoint?: string;
  token?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const BLIND_MPC_DETAIL =
  "External-client blind MPC is not available here yet. It needs the candidate name removed and every employer replaced by its industry, which is the recruiter AI step, and the builder cannot verify that was done. Use Named submission or Internal-team MPC.";

export async function callResumeBuilder(
  request: BrandResumeRequest,
  config: ResumeBuilderConfig = {},
): Promise<BrandResumeResult> {
  if (request.mode === "external_blind_mpc") {
    return { status: "unavailable", detail: BLIND_MPC_DETAIL };
  }

  const endpoint = config.endpoint?.trim() || DEFAULT_RESUME_BUILDER_URL;
  const fetchImpl = config.fetchImpl ?? fetch;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (config.token) headers.authorization = `Bearer ${config.token}`;

  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "build_pdf",
      arguments: {
        candidate: request.candidate,
        ...(request.filename ? { filename: request.filename } : {}),
      },
    },
  });

  let response: Response;
  try {
    // The free host sleeps when idle and can take about a minute to wake.
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(config.timeoutMs ?? 120_000),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return {
      status: "unavailable",
      detail: timedOut
        ? "The resume builder did not answer in time. It may be waking up. Try again in a minute."
        : "The resume builder could not be reached. Nothing was built.",
    };
  }

  if (response.status === 401) {
    return {
      status: "unavailable",
      detail: "The resume builder rejected this Workbench's access key. Set BROKER_TOKEN in the Workbench secrets to the same value as the builder.",
    };
  }
  if (!response.ok) {
    return { status: "unavailable", detail: `The resume builder answered with HTTP ${response.status}. Nothing was built.` };
  }

  const payload = await response.json().catch(() => null);
  return parseBuilderPayload(payload);
}

export function parseBuilderPayload(payload: unknown): BrandResumeResult {
  const unavailable = (detail: string): BrandResumeResult => ({ status: "unavailable", detail });
  if (!isRecord(payload)) return unavailable("The resume builder sent an unreadable answer. Nothing was built.");
  if (isRecord(payload.error)) {
    const message = typeof payload.error.message === "string" ? payload.error.message : "unknown error";
    return unavailable(`The resume builder reported an error: ${message}`);
  }

  const result = isRecord(payload.result) ? payload.result : null;
  if (!result) return unavailable("The resume builder sent no result. Nothing was built.");

  let tool: unknown = result.structuredContent;
  if (!isRecord(tool) && Array.isArray(result.content)) {
    const first = result.content[0];
    if (isRecord(first) && typeof first.text === "string") {
      try {
        tool = JSON.parse(first.text);
      } catch {
        tool = null;
      }
    }
  }
  if (!isRecord(tool)) return unavailable("The resume builder answer had no build result. Nothing was built.");

  if (tool.ok === true && typeof tool.download_url === "string" && typeof tool.filename === "string") {
    return {
      status: "built",
      filename: tool.filename,
      downloadUrl: tool.download_url,
      expiresInSeconds: typeof tool.expires_in_seconds === "number" ? tool.expires_in_seconds : null,
      contactRemoved: stringList(tool.contact_removed),
      notes: stringList(tool.notes),
    };
  }

  const problems = stringList(tool.problems);
  if (problems.length) return { status: "refused", problems };

  // Builder-level refusals (for example a banned dash) arrive as error + detail.
  const detail = [tool.error, tool.detail].filter((part): part is string => typeof part === "string" && part.trim() !== "");
  if (detail.length) return { status: "refused", problems: [detail.join(": ").trim()] };

  return unavailable("The resume builder did not build a PDF and gave no reason.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
