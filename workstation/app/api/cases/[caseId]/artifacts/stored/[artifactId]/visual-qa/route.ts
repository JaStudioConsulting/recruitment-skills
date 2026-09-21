import { toCaseArtifactSummary } from "@/lib/artifact-browser";
import { apiRoute, readJson } from "@/lib/server/api";
import {
  reviewCaseArtifactVisualQaRequest,
  visualQaReviewSchema,
} from "@/lib/server/case-artifact-store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ caseId: string; artifactId: string }> };

export async function PATCH(request: Request, context: Context) {
  return apiRoute(async (userId) => {
    const [{ caseId, artifactId }, review] = await Promise.all([
      context.params,
      readJson(request, visualQaReviewSchema),
    ]);
    const result = await reviewCaseArtifactVisualQaRequest({
      userId,
      caseId,
      artifactId,
      review,
    });
    return Response.json({
      artifact: toCaseArtifactSummary(result.artifact),
      run: result.run,
    });
  });
}
