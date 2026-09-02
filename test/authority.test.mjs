import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { inspectLinks, root } from "../skills/recruiter/scripts/authority.mjs";
import { getRecruiterAuthority } from "../lib/index.js";

test("the resolver includes the protected Tracker from the same package", async () => {
  const authority = await getRecruiterAuthority();
  assert.equal(authority.trackerFile, path.join(root, "skills/tracker-manager/GUIDE.md"));
});

test("installed paths resolve to the repository and a stale replacement is detected", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "recruiter-links-test-"));
  try {
    for (const name of ["recruiter", "tracker-manager"]) symlinkSync(path.join(root, "skills", name), path.join(temp, name), "dir");
    const receipt = {root, shared_skills_root: temp};
    assert.equal(inspectLinks(root, receipt), true);
    unlinkSync(path.join(temp, "tracker-manager")); mkdirSync(path.join(temp, "tracker-manager"));
    assert.throws(() => inspectLinks(root, receipt), /not loaded from the repository/);
  } finally { rmSync(temp, {recursive: true, force: true}); }
});

test("the actual Tracker CLI runs through an installed symlink", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "tracker-cli-test-"));
  try {
    const link = path.join(temp, "tracker-manager"); symlinkSync(path.join(root, "skills/tracker-manager"), link, "dir");
    const input = path.join(temp, "compare.json");
    writeFileSync(input, JSON.stringify({expected: [1, "Example"], actual: [1, "Example"]}));
    const result = JSON.parse(execFileSync(process.execPath, [path.join(link, "scripts/tracker.mjs"), "compare", input], {encoding: "utf8"}));
    assert.equal(result.pass, true);
  } finally { rmSync(temp, {recursive: true, force: true}); }
});
