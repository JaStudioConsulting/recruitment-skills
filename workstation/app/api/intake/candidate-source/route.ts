import { candidateSourceIntakeSchema } from "@/lib/contracts/workstation";
import { ApiError, apiRoute } from "@/lib/server/api";
import { intakeNewCandidateResume } from "@/lib/server/source-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return apiRoute(async (userId) => {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new ApiError(400, "Candidate source intake must use multipart form data.");
    }
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "One resume source file is required.");
    const input = candidateSourceIntakeSchema.parse({
      roleId: form.get("roleId"),
      name: form.get("name"),
      currentTitle: form.get("currentTitle") ?? "",
      kind: form.get("kind"),
    });
    const result = await intakeNewCandidateResume({
      userId,
      roleId: input.roleId,
      name: input.name,
      currentTitle: input.currentTitle,
      file,
    });
    return Response.json(result, { status: result.reused ? 200 : 201 });
  });
}
