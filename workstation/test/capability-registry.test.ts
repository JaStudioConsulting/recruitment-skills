import { describe, expect, it } from "vitest";
import {
  CAPABILITY_REGISTRY,
  WORKFLOW_GROUPS,
  capabilitiesForGroup,
  capabilityById,
  implementationCounts,
} from "../lib/capabilities/registry";

describe("canonical workstation capability registry", () => {
  it("loads every canonical capability exactly once", () => {
    expect(CAPABILITY_REGISTRY).toHaveLength(24);
    expect(new Set(CAPABILITY_REGISTRY.map((item) => item.id)).size).toBe(24);
    expect(capabilityById("write-up")?.authorityPath).toBe("skills/recruiter/modules/write-up/GUIDE.md");
    expect(capabilityById("write-up")?.authorityDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(capabilityById("write-up")?.executorFeatures.map((item) => item.id)).toEqual(["write-up-candidate"]);
    expect(capabilityById("tracker")?.repositoryStatus).toBe("restricted");
    expect(capabilityById("tttg-candidate-submission")?.executorFeatures).toEqual([]);
  });

  it("groups every capability without inventing IDs", () => {
    const grouped = WORKFLOW_GROUPS.flatMap((group) => capabilitiesForGroup(group));
    expect(grouped).toHaveLength(CAPABILITY_REGISTRY.length);
    expect(new Set(grouped.map((item) => item.id)).size).toBe(CAPABILITY_REGISTRY.length);
  });

  it("reports truthful implementation totals", () => {
    expect(implementationCounts()).toEqual({
      working: 0,
      partial: 9,
      interface_only: 11,
      blocked: 2,
      not_applicable: 2,
    });
  });

  it("preserves the audited blockers for incomplete capability implementations", () => {
    const audited = [
      ["brandedresume", "partial", [/canonical A layout/, /sole active branded resume design/, /human-reviewed saved resume form/, /supports named_submission or internal_mpc/, /hosted ReportLab runtime/, /canonical repository builder and deployment digest/, /External-client blind MPC remains unavailable/, /authority preflight/]],
      ["loxo-pipeline", "partial", [/explicit validated config/, /declared transport/, /rejected_at readback/, /No verified live Loxo/]],
      ["loxo-readonly-candidate-dashboard", "partial", [/arbitrary input stages/, /outreach filter/, /No live Loxo read adapter/]],
      ["sourcing", "partial", [/schemas/, /name-plus-company fallback dedupe/, /explicit-URL conflict preservation/, /No mounted public-research executor/, /live research outcome/]],
      ["web-sourcing", "partial", [/seven-column guide/, /profile_url/, /LinkedIn, Indeed, GitHub/, /No mounted restricted public-search executor/, /live sourcing outcome/]],
      ["recruiting-hr", "interface_only", [/no mounted executor/, /HRIS, ATS, compensation, knowledge-base, project-tracker, and chat adapters/, /skills\/manifests\/plugins\.json/, /rather than live adapter outcomes/]],
    ] as const;

    for (const [id, status, blockerDetails] of audited) {
      const item = capabilityById(id);
      expect(item, id).toBeDefined();
      expect(item?.implementation.status, id).toBe(status);
      for (const detail of blockerDetails) expect(item?.implementation.blocker, id).toMatch(detail);
    }
  });
});
