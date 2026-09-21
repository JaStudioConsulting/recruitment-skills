import { apiRoute } from "@/lib/server/api";
import { executePreparedCapability } from "@/lib/server/capability-execution-service";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ caseId: string; runId: string }> };

export async function POST(_request: Request, context: Context) {
  return apiRoute(async (userId) => {
    const { caseId, runId } = await context.params;
    return Response.json(await executePreparedCapability(userId, caseId, runId));
  });
}
