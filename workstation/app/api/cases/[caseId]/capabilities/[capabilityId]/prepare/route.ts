import { z } from "zod";
import { apiRoute, readJson } from "@/lib/server/api";
import { prepareCapability } from "@/lib/server/capability-service";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  extraInput: z.string().max(500_000).default(""),
  provider: z.string().trim().min(1).max(50).default("manual"),
  model: z.string().trim().min(1).max(100).default("none"),
});

type Context = { params: Promise<{ caseId: string; capabilityId: string }> };

export async function POST(request: Request, context: Context) {
  return apiRoute(async (userId) => {
    const [{ caseId, capabilityId }, input] = await Promise.all([
      context.params,
      readJson(request, requestSchema),
    ]);
    return Response.json(await prepareCapability(userId, caseId, capabilityId, {
      extraInput: input.extraInput ?? "",
      provider: input.provider ?? "manual",
      model: input.model ?? "none",
    }));
  });
}
