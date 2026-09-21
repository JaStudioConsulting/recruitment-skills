import { apiRoute } from "@/lib/server/api";
import { downloadPersistedCaseArtifact } from "@/lib/server/case-artifact-store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ caseId: string; artifactId: string }> };

export async function GET(request: Request, context: Context) {
  return apiRoute(async (userId) => {
    const { caseId, artifactId } = await context.params;
    const inline = new URL(request.url).searchParams.get("inline") === "1";
    return downloadPersistedCaseArtifact({ userId, caseId, artifactId, inline });
  });
}
