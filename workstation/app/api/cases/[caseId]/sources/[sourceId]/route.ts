import { reviewSourceSchema } from "@/lib/contracts/workstation";
import { apiRoute, readJson } from "@/lib/server/api";
import { reviewSource } from "@/lib/server/case-repository";
import { downloadImmutableSource } from "@/lib/server/source-store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ caseId: string; sourceId: string }> };

export async function GET(request: Request, context: Context) {
  return apiRoute(async (userId) => {
    const { caseId, sourceId } = await context.params;
    const inline = new URL(request.url).searchParams.get("inline") === "1";
    return downloadImmutableSource({ userId, caseId, sourceId, inline });
  });
}

export async function PATCH(request: Request, context: Context) {
  return apiRoute(async (userId) => {
    const [{ caseId, sourceId }, input] = await Promise.all([
      context.params,
      readJson(request, reviewSourceSchema),
    ]);
    return Response.json(await reviewSource(userId, caseId, sourceId, input.kind));
  });
}
