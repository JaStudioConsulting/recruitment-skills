import { apiRoute } from "@/lib/server/api";
import { deleteJobFolder } from "@/lib/server/job-folder-delete";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ roleId: string }> };

export async function DELETE(_request: Request, context: Context) {
  return apiRoute(async (userId) => {
    const { roleId } = await context.params;
    return Response.json(await deleteJobFolder(userId, roleId));
  });
}
