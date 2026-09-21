import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workstationRoot = fileURLToPath(new URL("../", import.meta.url));

describe("legacy execution cleanup", () => {
  it("removes the disconnected feature routes and orphan PDF editor", () => {
    for (const relativePath of [
      "app/api/cases/[caseId]/brand-resume/route.ts",
      "app/api/cases/[caseId]/artifacts/[featureId]/route.ts",
      "components/workstation/manual-pdf-editor.tsx",
    ]) {
      expect(existsSync(`${workstationRoot}${relativePath}`), relativePath).toBe(false);
    }
  });

  it("exposes only canonical run execution through the workstation client", () => {
    const client = readFileSync(`${workstationRoot}lib/api-client.ts`, "utf8");

    expect(client).toContain("prepareCapability");
    expect(client).toContain("executeCapabilityRun");
    expect(client).not.toContain("brandResume:");
    expect(client).not.toContain("buildCapabilityArtifact:");
    expect(client).not.toContain("/brand-resume");
    expect(client).not.toContain("/artifacts/${featureId}");
  });
});
