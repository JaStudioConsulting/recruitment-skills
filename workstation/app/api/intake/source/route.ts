import { ApiError, apiRoute } from "@/lib/server/api";
import { resolveSourceIntake, validateSourceFile } from "@/lib/server/source-store";
import { proposePastedSource, type UploadedSourceProposal } from "@/lib/source-intake";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return apiRoute(async (userId) => {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new ApiError(400, "Source proposal must use multipart form data.");
    }
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "One source file is required.");
    const contentType = validateSourceFile(file);
    const { intake } = await resolveSourceIntake({
      userId,
      bytes: await file.arrayBuffer(),
      contentType,
      filename: file.name,
    });
    const fromText = intake.parsedText ? proposePastedSource(intake.parsedText) : null;
    const response: UploadedSourceProposal = {
      kind: intake.kind === "other" && fromText ? fromText.kind : intake.kind,
      filename: fromText?.filename ?? file.name,
      job: fromText?.job ?? null,
      candidate: fromText?.candidate ?? null,
      originalFilename: file.name,
      parsedText: intake.parsedText,
      lifecycleStatus: intake.lifecycleStatus,
      classificationMethod: intake.classificationMethod,
    };
    return Response.json(response);
  });
}
