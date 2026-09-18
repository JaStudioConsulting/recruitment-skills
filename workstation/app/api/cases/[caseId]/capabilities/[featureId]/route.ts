import { env } from "cloudflare:workers";
import { z } from "zod";
import { featureById } from "@/lib/capabilities/catalog";
import { apiRoute, ApiError, readJson } from "@/lib/server/api";
import { getCapabilityCaseContext } from "@/lib/server/case-repository";
import { callLocalAi } from "@/lib/server/local-ai";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  provider: z.string().trim().min(1).max(50),
  model: z.string().trim().min(1).max(100),
  runId: z.string().uuid(),
  extraInput: z.string().max(500_000).default(""),
});

type Context = { params: Promise<{ caseId: string; featureId: string }> };

export async function POST(request: Request, context: Context) {
  return apiRoute(async (userId) => {
    const [{ caseId, featureId }, input] = await Promise.all([context.params, readJson(request, requestSchema)]);
    const feature = featureById(featureId);
    if (!feature) throw new ApiError(404, "That feature was not found.");
    if (feature.runtime === "server_pending") throw new ApiError(409, "Not available yet: server update pending.");
    if (feature.runtime === "loxo_read_adapter") throw new ApiError(409, "Not available yet: the read-only Loxo adapter is not connected.");
    if (feature.runtime === "tracker_read_adapter") throw new ApiError(409, "Not available yet: the read-only Tracker adapter is not connected.");

    const extraInput = input.extraInput ?? "";
    const { candidateCase, role, candidate } = await getCapabilityCaseContext(userId, caseId);
    const reviewedSources = candidateCase.sources.filter((source) => source.lifecycleStatus === "reviewed" && source.parsedText?.trim());
    const missing = feature.requirements.filter((requirement) => {
      if (!requirement.required) return false;
      if (requirement.kind === "role") return !role.id;
      if (requirement.kind === "user_input") return !extraInput.trim();
      if (requirement.kind === "source" || requirement.kind === "source_or_input") {
        const hasSource = reviewedSources.some((source) => requirement.source_kinds?.includes(source.kind));
        return !hasSource && !(requirement.kind === "source_or_input" && extraInput.trim());
      }
      return requirement.kind === "adapter";
    }).map((requirement) => requirement.label);
    if (missing.length) {
      return Response.json({ status: "refused", detail: `Needs something: ${missing.join(", ")}.`, missing });
    }

    const response = await callLocalAi({
      featureId,
      provider: input.provider,
      model: input.model,
      runId: input.runId,
      context: {
        candidate: { name: candidate.name, currentTitle: candidate.currentTitle ?? "" },
        role: { title: role.title, client: role.client ?? "" },
        recruiterNotes: candidateCase.notes,
        sources: reviewedSources.map((source) => ({ kind: source.kind, title: source.filename, text: source.parsedText })),
        extraInput,
      },
    }, {
      baseUrl: env.LOCAL_AI_URL || process.env.LOCAL_AI_URL,
      token: env.LOCAL_AI_TOKEN || process.env.LOCAL_AI_TOKEN,
    });
    return Response.json(response);
  });
}
