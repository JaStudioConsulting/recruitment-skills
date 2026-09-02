import { mkdtempSync, readdirSync, readFileSync, rmdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { root, settingsRoot, git, verifyRoot, inspectLinks } from "../skills/recruiter/scripts/authority.mjs";

// Authorized routine update: only this named repository, only clean fast-forwards,
// and only after the incoming version's tests pass in an isolated worktree.
const oldCommit = verifyRoot(root, false);
const receiptPath = path.join(settingsRoot, "installation.json");
const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
inspectLinks(root, receipt);
if (receipt.commit !== oldCommit) throw new Error("unverified local commit; reinstall the verified authority");
const published = git(["ls-remote", "origin", "refs/heads/main"]).split(/\s+/)[0];
if (published !== oldCommit) {
  git(["fetch", "origin", "main"]);
  if (git(["rev-parse", "origin/main"]) !== published) throw new Error("remote changed during sync; retry after rechecking");
  git(["merge-base", "--is-ancestor", oldCommit, published]);
  const temporary = mkdtempSync(path.join(os.tmpdir(), "recruiter-sync-"));
  const candidate = path.join(temporary, "candidate");
  let added = false;
  try {
    git(["worktree", "add", "--detach", candidate, published]); added = true;
    execFileSync(process.execPath, ["scripts/validate-package.mjs"], {cwd: candidate, stdio: "pipe", timeout: 60000});
    const tests = readdirSync(path.join(candidate, "test")).filter(name => name.endsWith(".test.mjs")).map(name => path.join("test", name));
    execFileSync(process.execPath, ["--test", ...tests], {cwd: candidate, stdio: "pipe", timeout: 60000});
    if (verifyRoot(root, false) !== oldCommit) throw new Error("local authority changed during validation");
    if (git(["ls-remote", "origin", "refs/heads/main"]).split(/\s+/)[0] !== published) throw new Error("remote changed during validation; recheck before installing");
    git(["merge", "--ff-only", published]);
    writeFileSync(receiptPath, JSON.stringify({...receipt, commit: published, updated_at: new Date().toISOString()}, null, 2) + "\n", {mode: 0o600});
  } finally {
    if (added) git(["worktree", "remove", candidate]);
    rmdirSync(temporary);
  }
}
console.log(`Recruiting authority current: ${published}`);
