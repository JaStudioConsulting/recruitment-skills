export type ArtifactBuildResult =
  | { status: "built"; filename: string; downloadUrl: string }
  | { status: "refused" | "unavailable"; detail: string };

type Config = { endpoint?: string; token?: string; fetchImpl?: typeof fetch };

export async function callArtifactBuilder(tool: string, payload: Record<string, unknown>, config: Config): Promise<ArtifactBuildResult> {
  const endpoint = config.endpoint?.trim();
  if (!endpoint) return { status: "unavailable", detail: "The PDF builder is not configured." };
  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream" };
  if (config.token) headers.authorization = `Bearer ${config.token}`;
  let response: Response;
  try {
    response = await (config.fetchImpl ?? fetch)(endpoint, {
      method: "POST", headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: { payload } } }),
      signal: AbortSignal.timeout(185_000),
    });
  } catch {
    return { status: "unavailable", detail: "The PDF builder could not be reached. Nothing was built." };
  }
  if (!response.ok) return { status: "unavailable", detail: `The PDF builder answered with HTTP ${response.status}. Nothing was built.` };
  const body: unknown = await response.json().catch(() => null);
  if (!isRecord(body) || !isRecord(body.result)) return { status: "unavailable", detail: "The PDF builder returned an unreadable answer." };
  let toolResult: unknown = body.result.structuredContent;
  if (!isRecord(toolResult) && Array.isArray(body.result.content)) {
    const first = body.result.content[0];
    if (isRecord(first) && typeof first.text === "string") try { toolResult = JSON.parse(first.text); } catch { toolResult = null; }
  }
  if (!isRecord(toolResult)) return { status: "unavailable", detail: "The PDF builder returned no build result." };
  if (toolResult.ok === true && typeof toolResult.filename === "string" && typeof toolResult.download_url === "string") {
    return { status: "built", filename: toolResult.filename, downloadUrl: toolResult.download_url };
  }
  return { status: "refused", detail: typeof toolResult.detail === "string" ? toolResult.detail : "The PDF builder refused the payload." };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
