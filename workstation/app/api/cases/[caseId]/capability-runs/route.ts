import { apiRoute } from "@/lib/server/api";
import { listCapabilityRuns } from "@/lib/server/capability-run-repository";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ caseId: string }> };

export async function GET(_request: Request, context: Context) {
  return apiRoute(async (userId) => {
    const { caseId } = await context.params;
    return Response.json(await listCapabilityRuns(userId, caseId));
  });
}
