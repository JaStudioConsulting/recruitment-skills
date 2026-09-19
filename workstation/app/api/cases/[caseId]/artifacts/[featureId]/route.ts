import { env } from "cloudflare:workers";
import { z } from "zod";
import { featureById } from "@/lib/capabilities/catalog";
import { apiRoute, ApiError, readJson } from "@/lib/server/api";
import { assertOwnedCase } from "@/lib/server/case-repository";
import { buildManualArtifact } from "@/lib/server/manual-artifact";

export const dynamic = "force-dynamic";

const requestSchema = z.object({ payload: z.record(z.unknown()) });
type Context = { params: Promise<{ caseId: string; featureId: string }> };

export async function POST(request: Request, context: Context) {
  return apiRoute(async (userId) => {
    const [{ caseId, featureId }, input] = await Promise.all([context.params, readJson(request, requestSchema)]);
    await assertOwnedCase(userId, caseId);
    const feature = featureById(featureId);
    if (!feature || feature.result_kind !== "pdf" || !feature.server_tool) {
      throw new ApiError(404, "That PDF feature was not found.");
    }
    const built = await buildManualArtifact(featureId, feature.server_tool, input.payload, {
      endpoint: env.RECRUITMENT_MCP_URL || process.env.RECRUITMENT_MCP_URL,
      token: env.BROKER_TOKEN || process.env.BROKER_TOKEN,
    });
    return Response.json(built);
  });
}
