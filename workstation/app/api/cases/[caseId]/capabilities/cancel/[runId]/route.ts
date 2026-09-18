import { env } from "cloudflare:workers";
import { apiRoute } from "@/lib/server/api";
import { assertOwnedCase } from "@/lib/server/case-repository";
import { cancelLocalAi } from "@/lib/server/local-ai";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ caseId: string; runId: string }> };

export async function POST(_request: Request, context: Context) {
  return apiRoute(async (userId) => {
    const { caseId, runId } = await context.params;
    await assertOwnedCase(userId, caseId);
    const cancelled = await cancelLocalAi(runId, { baseUrl: env.LOCAL_AI_URL || process.env.LOCAL_AI_URL });
    return Response.json({ status: cancelled ? "cancelled" : "not_running" });
  });
}
