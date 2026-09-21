import { apiRoute } from "@/lib/server/api";
import { getCapabilityRun } from "@/lib/server/capability-run-repository";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ caseId: string; runId: string }> };

export async function GET(_request: Request, context: Context) {
  return apiRoute(async (userId) => {
    const { caseId, runId } = await context.params;
    return Response.json(await getCapabilityRun(userId, caseId, runId));
  });
}
