import { sourceKindSchema } from "@/lib/contracts/workstation";
import { ApiError, apiRoute } from "@/lib/server/api";
import { uploadImmutableSource } from "@/lib/server/source-store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ caseId: string }> };

export async function POST(request: Request, context: Context) {
  return apiRoute(async (userId) => {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new ApiError(400, "Source upload must use multipart form data.");
    }
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "A source file is required.");
    const kind = sourceKindSchema.parse(form.get("kind"));
    const { caseId } = await context.params;
    return Response.json(
      await uploadImmutableSource({ userId, caseId, kind, file }),
      { status: 201 },
    );
  });
}
