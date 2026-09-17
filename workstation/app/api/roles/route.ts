import { createRoleSchema } from "@/lib/contracts/workstation";
import { apiRoute, readJson } from "@/lib/server/api";
import { createRole } from "@/lib/server/case-repository";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return apiRoute(async (userId) => {
    const input = await readJson(request, createRoleSchema);
    return Response.json(await createRole(userId, input), { status: 201 });
  });
}
