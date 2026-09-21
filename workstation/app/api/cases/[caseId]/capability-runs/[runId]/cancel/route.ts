import { apiRoute, ApiError } from "@/lib/server/api";
import {
  getCapabilityRun,
  transitionCapabilityRun,
} from "@/lib/server/capability-run-repository";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ caseId: string; runId: string }> };

export async function POST(_request: Request, context: Context) {
  return apiRoute(async (userId) => {
    const { caseId, runId } = await context.params;
    const run = await getCapabilityRun(userId, caseId, runId);
    if (run.status !== "prepared" && run.status !== "running" && run.status !== "draft_ready") {
      throw new ApiError(409, `Capability run ${run.status} cannot be cancelled.`);
    }
    return Response.json(await transitionCapabilityRun(userId, caseId, runId, {
      status: "cancelled",
    }));
  });
}
