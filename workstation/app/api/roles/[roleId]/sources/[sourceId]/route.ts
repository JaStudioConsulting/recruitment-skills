import { reviewSourceSchema } from "@/lib/contracts/workstation";
import { apiRoute, readJson } from "@/lib/server/api";
import { reviewRoleSource } from "@/lib/server/case-repository";
import { downloadImmutableRoleSource } from "@/lib/server/source-store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ roleId: string; sourceId: string }> };

export async function GET(request: Request, context: Context) {
  return apiRoute(async (userId) => {
    const { roleId, sourceId } = await context.params;
    const inline = new URL(request.url).searchParams.get("inline") === "1";
    const rangeHeader = request.headers.get("range");
    return downloadImmutableRoleSource({ userId, roleId, sourceId, inline, rangeHeader });
  });
}

export async function PATCH(request: Request, context: Context) {
  return apiRoute(async (userId) => {
    const [{ roleId, sourceId }, input] = await Promise.all([
      context.params,
      readJson(request, reviewSourceSchema),
    ]);
    return Response.json(await reviewRoleSource(userId, roleId, sourceId, input.kind));
  });
}
