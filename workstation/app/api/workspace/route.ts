import { apiRoute } from "@/lib/server/api";
import { loadWorkspace } from "@/lib/server/case-repository";

export const dynamic = "force-dynamic";

export async function GET() {
  return apiRoute(async (userId) => Response.json(await loadWorkspace(userId)));
}
