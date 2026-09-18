import { env } from "cloudflare:workers";
import { apiRoute, readJson } from "@/lib/server/api";
import { assertOwnedCase } from "@/lib/server/case-repository";
import { brandResumeRequestSchema, callResumeBuilder } from "@/lib/server/resume-builder";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ caseId: string }> };

// Build the branded TTTG resume PDF for a case the signed-in user owns.
// The access key stays server-side: it is read from the Site's secrets and is
// never sent to the browser.
export async function POST(request: Request, context: Context) {
  return apiRoute(async (userId) => {
    const [{ caseId }, input] = await Promise.all([
      context.params,
      readJson(request, brandResumeRequestSchema),
    ]);
    await assertOwnedCase(userId, caseId);
    const result = await callResumeBuilder(input, {
      endpoint: env.RECRUITMENT_MCP_URL,
      token: env.BROKER_TOKEN,
    });
    return Response.json(result);
  });
}
