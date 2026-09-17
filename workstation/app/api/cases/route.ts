import { openCaseSchema } from "@/lib/contracts/workstation";
import { apiRoute, readJson } from "@/lib/server/api";
import { openCandidateCase } from "@/lib/server/case-repository";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return apiRoute(async (userId) => {
    const input = await readJson(request, openCaseSchema);
    return Response.json(await openCandidateCase(userId, input), { status: 201 });
  });
}
