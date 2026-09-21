import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const builder = path.join(root, "skills/recruiter/modules/loxo-readonly-candidate-dashboard/scripts/build_dashboard.py");

function candidate(id, stage, activityType) {
  return {
    id,
    stage,
    applied: false,
    candidate: `Synthetic Candidate ${id}`,
    employment: [],
    employment_summary: "Synthetic fixture only.",
    industry: "Not confirmed",
    tickets: "Not listed",
    activity: activityType === "none" ? "No job-specific outreach found" : "Synthetic outreach evidence",
    activity_type: activityType,
  };
}

test("dashboard preserves arbitrary valid stages and exposes the outreach filter", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "loxo-dashboard-test-"));
  try {
    const input = path.join(temp, "input.json");
    const output = path.join(temp, "dashboard.html");
    await writeFile(input, JSON.stringify({
      job: {
        job_id: "synthetic-job",
        title: "Synthetic Role",
        company: "Synthetic Company",
        stage_order: ["Offer / Accepted", "Reference Check"],
      },
      candidates: [
        candidate(1, "Reference Check", "replied"),
        candidate(2, "Custom Agency Stage", "none"),
        candidate(3, "Offer / Accepted", "attempted"),
      ],
    }));

    const run = spawnSync("python3", [builder, input, output], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    const html = await readFile(output, "utf8");
    assert.match(html, /const stageOrder=\["Offer \/ Accepted", "Reference Check", "Custom Agency Stage"\]/);
    assert.match(html, /<select id=\"outreach\">/);
    assert.match(html, /Outreach: No job-specific outreach/);
    assert.match(html, /r\.activity_type===outreach/);
    assert.match(html, /\['search','stage','applied','outreach'\]/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("dashboard rejects invalid outreach states instead of silently misfiltering", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "loxo-dashboard-invalid-"));
  try {
    const input = path.join(temp, "input.json");
    const output = path.join(temp, "dashboard.html");
    await writeFile(input, JSON.stringify({
      job: { job_id: "synthetic-job", title: "Synthetic Role", company: "Synthetic Company" },
      candidates: [candidate(1, "Any Valid Stage", "invented")],
    }));

    const run = spawnSync("python3", [builder, input, output], { encoding: "utf8" });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /activity_type.*none.*attempted.*reached.*bounced.*replied/is);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
