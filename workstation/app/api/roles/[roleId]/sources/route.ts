import { sourceKindSchema } from "@/lib/contracts/workstation";
import { ApiError, apiRoute } from "@/lib/server/api";
import { uploadImmutableRoleSources } from "@/lib/server/source-store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ roleId: string }> };

export async function POST(request: Request, context: Context) {
  return apiRoute(async (userId) => {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new ApiError(400, "Source upload must use multipart form data.");
    }
    const files = form.getAll("files").filter((value): value is File => value instanceof File);
    if (!files.length) throw new ApiError(400, "At least one source file is required.");
    const values = form.getAll("kinds");
    if (values.length && values.length !== files.length) {
      throw new ApiError(400, "Source kinds must match the uploaded files.");
    }
    const kinds = values.map((value) => sourceKindSchema.parse(value));
    const { roleId } = await context.params;
    return Response.json(await uploadImmutableRoleSources({
      userId,
      roleId,
      uploads: files.map((file, index) => ({ file, kind: kinds[index] })),
    }), { status: 201 });
  });
}
