import { toCaseArtifactSummary } from "@/lib/artifact-browser";
import { apiRoute } from "@/lib/server/api";
import { listCaseArtifacts } from "@/lib/server/capability-run-repository";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ caseId: string }> };

export async function GET(_request: Request, context: Context) {
  return apiRoute(async (userId) => {
    const { caseId } = await context.params;
    const artifacts = await listCaseArtifacts(userId, caseId);
    return Response.json(artifacts.map(toCaseArtifactSummary));
  });
}
