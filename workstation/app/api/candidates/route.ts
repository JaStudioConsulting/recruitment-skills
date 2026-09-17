import { createCandidateSchema } from "@/lib/contracts/workstation";
import { apiRoute, readJson } from "@/lib/server/api";
import { createCandidate } from "@/lib/server/case-repository";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return apiRoute(async (userId) => {
    const input = await readJson(request, createCandidateSchema);
    return Response.json(await createCandidate(userId, input), { status: 201 });
  });
}
