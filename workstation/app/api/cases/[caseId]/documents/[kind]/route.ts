import {
  documentKindSchema,
  saveDocumentSchema,
} from "@/lib/contracts/workstation";
import { apiRoute, readJson } from "@/lib/server/api";
import { saveCaseDocument } from "@/lib/server/case-repository";
import type { CaseDocument } from "@/lib/workstation-types";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ caseId: string; kind: string }> };

export async function PUT(request: Request, context: Context) {
  return apiRoute(async (userId) => {
    const [params, input] = await Promise.all([
      context.params,
      readJson(request, saveDocumentSchema),
    ]);
    const kind = documentKindSchema.parse(params.kind);
    const document = await saveCaseDocument(
      userId,
      params.caseId,
      kind,
      input.expectedRevision,
      input.content as CaseDocument["content"],
      {
        origin: input.origin,
        sourceRefs: input.sourceRefs,
        capabilityRunId: input.capabilityRunId,
      },
    );
    return Response.json(document);
  });
}
