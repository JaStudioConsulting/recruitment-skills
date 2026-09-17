import { updateCaseSchema } from "@/lib/contracts/workstation";
import { apiRoute, readJson } from "@/lib/server/api";
import { updateCandidateCase } from "@/lib/server/case-repository";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ caseId: string }> };

export async function PATCH(request: Request, context: Context) {
  return apiRoute(async (userId) => {
    const [{ caseId }, input] = await Promise.all([
      context.params,
      readJson(request, updateCaseSchema),
    ]);
    return Response.json(await updateCandidateCase(userId, caseId, input));
  });
}
