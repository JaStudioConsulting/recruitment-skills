import { problemsFromBuilderDetail, validateManualArtifactPayload } from "../capabilities/manual-artifacts";
import type { ManualArtifactBuildResponse } from "../capabilities/types";
import { callArtifactBuilder } from "./artifact-builder";

type Config = { endpoint?: string; token?: string; fetchImpl?: typeof fetch };

export async function buildManualArtifact(featureId: string, tool: string, payload: Record<string, unknown>, config: Config): Promise<ManualArtifactBuildResponse> {
  const problems = validateManualArtifactPayload(featureId, payload);
  if (problems.length) return { status: "refused", detail: "Fix the named fields before building the PDF.", problems };
  const built = await callArtifactBuilder(tool, payload, config);
  if (built.status !== "built") return { ...built, problems: problemsFromBuilderDetail(built.detail) };
  return built;
}
