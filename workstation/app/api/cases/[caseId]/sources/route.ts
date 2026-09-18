import { sourceKindSchema } from "@/lib/contracts/workstation";
import { ApiError, apiRoute } from "@/lib/server/api";
import { uploadImmutableSources } from "@/lib/server/source-store";

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
    const multiFiles = form.getAll("files").filter((value): value is File => value instanceof File);
    const singleFile = form.get("file");
    const files = multiFiles.length > 0
      ? multiFiles
      : singleFile instanceof File
        ? [singleFile]
        : [];
    if (files.length === 0) throw new ApiError(400, "At least one source file is required.");

    const multiKinds = form.getAll("kinds");
    const singleKind = form.get("kind");
    if (multiKinds.length > 0 && multiKinds.length !== files.length) {
      throw new ApiError(400, "Source kinds must match the uploaded files.");
    }
    const kinds = multiKinds.length > 0
      ? multiKinds.map((kind) => sourceKindSchema.parse(kind))
      : singleKind === null
        ? []
        : [sourceKindSchema.parse(singleKind)];
    const { caseId } = await context.params;
    return Response.json(
      await uploadImmutableSources({
        userId,
        caseId,
        uploads: files.map((file, index) => ({
          file,
          kind: kinds.length === files.length ? kinds[index] : kinds[0],
        })),
      }),
      { status: 201 },
    );
  });
}
