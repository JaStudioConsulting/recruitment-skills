import type { CapabilityDraft, CapabilityRunResponse } from "@/lib/capabilities/types";

export type LocalAiConfig = { baseUrl?: string; fetchImpl?: typeof fetch };

type RawCompleted = {
  status: "completed";
  result_kind: CapabilityDraft["resultKind"];
  provider: string;
  model: string;
  result: Record<string, unknown>;
};

export async function callLocalAi(
  input: { featureId: string; provider: string; model: string; runId: string; context: Record<string, unknown> },
  config: LocalAiConfig,
): Promise<CapabilityRunResponse> {
  const baseUrl = config.baseUrl?.trim().replace(/\/$/, "");
  if (!baseUrl) return { status: "local_only", detail: "Run this feature from the local Mac Workbench." };
  let response: Response;
  try {
    response = await (config.fetchImpl ?? fetch)(`${baseUrl}/local-ai/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        feature_id: input.featureId,
        provider: input.provider,
        model: input.model,
        run_id: input.runId,
        context: input.context,
      }),
      signal: AbortSignal.timeout(125_000),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return { status: "unavailable", detail: timedOut ? "The AI run exceeded two minutes." : "The local AI service could not be reached." };
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !isRecord(payload)) {
    return { status: "unavailable", detail: "The local AI service returned an unreadable response." };
  }
  if (payload.status !== "completed") {
    const status = payload.status === "local_only" || payload.status === "refused" ? payload.status : "unavailable";
    return { status, detail: typeof payload.detail === "string" ? payload.detail : "The AI did not produce a usable draft." };
  }
  return parseCompleted(input.featureId, payload as RawCompleted);
}

export async function cancelLocalAi(runId: string, config: LocalAiConfig): Promise<boolean> {
  const baseUrl = config.baseUrl?.trim().replace(/\/$/, "");
  if (!baseUrl) return false;
  try {
    const response = await (config.fetchImpl ?? fetch)(`${baseUrl}/local-ai/cancel/${encodeURIComponent(runId)}`, { method: "POST" });
    const payload: unknown = await response.json().catch(() => null);
    return response.ok && isRecord(payload) && payload.status === "cancelled";
  } catch {
    return false;
  }
}

function parseCompleted(featureId: string, payload: RawCompleted): CapabilityRunResponse {
  const result = payload.result;
  const title = typeof result.title === "string" ? result.title : "";
  const unknowns = stringList(result.unknowns);
  if (!title) return { status: "refused", detail: "The AI result is missing a title." };
  const draft: CapabilityDraft = {
    featureId,
    title,
    resultKind: payload.result_kind,
    status: "draft",
    provider: payload.provider,
    model: payload.model,
    updatedAt: new Date().toISOString(),
    unknowns,
  };
  if (payload.result_kind === "document" || payload.result_kind === "pdf") {
    if (typeof result.document !== "string") return { status: "refused", detail: "The AI result is missing its editable document." };
    draft.document = result.document;
  }
  if (payload.result_kind === "form") {
    if (!Array.isArray(result.fields)) return { status: "refused", detail: "The AI result is missing its editable fields." };
    draft.fields = result.fields.filter(isRecord).map((field) => ({ label: String(field.label ?? ""), value: String(field.value ?? "") }));
  }
  if (payload.result_kind === "table") {
    const columns = stringList(result.columns);
    const rows = Array.isArray(result.rows) ? result.rows.map(stringList) : [];
    if (rows.some((row) => row.length !== columns.length)) return { status: "refused", detail: "The AI result contains a broken table." };
    draft.table = { columns, rows };
  }
  if (payload.result_kind === "resume") {
    if (!isRecord(result.resume) || result.resume.format !== "tttg-resume-form-v1") return { status: "refused", detail: "The AI result contains an invalid resume form." };
    draft.resume = result.resume as CapabilityDraft["resume"];
  }
  if (payload.result_kind === "submission") {
    if (!isRecord(result.submission)) return { status: "refused", detail: "The AI result contains an invalid candidate write-up." };
    draft.submission = result.submission as CapabilityDraft["submission"];
    draft.emailDraft = typeof result.emailDraft === "string" ? result.emailDraft : "";
    draft.loxoUpdate = typeof result.loxoUpdate === "string" ? result.loxoUpdate : "";
  }
  return { status: "completed", draft };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
