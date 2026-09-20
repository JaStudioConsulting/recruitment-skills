import { documentKindSchema } from "@/lib/contracts/workstation";
import { apiRoute } from "@/lib/server/api";
import { listDocumentVersions } from "@/lib/server/case-repository";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ caseId: string; kind: string }> };

export async function GET(_request: Request, context: Context) {
  return apiRoute(async (userId) => {
    const { caseId, kind: rawKind } = await context.params;
    const kind = documentKindSchema.parse(rawKind);
    return Response.json(await listDocumentVersions(userId, caseId, kind));
  });
}
