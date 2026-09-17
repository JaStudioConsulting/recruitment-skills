import { apiRoute } from "@/lib/server/api";
import { downloadImmutableSource } from "@/lib/server/source-store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ caseId: string; sourceId: string }> };

export async function GET(_request: Request, context: Context) {
  return apiRoute(async (userId) => {
    const { caseId, sourceId } = await context.params;
    return downloadImmutableSource({ userId, caseId, sourceId });
  });
}
