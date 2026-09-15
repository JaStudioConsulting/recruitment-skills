import { existsSync, readFileSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(realpathSync(fileURLToPath(import.meta.url))), "../../..");
export const settingsRoot = process.env.JASTUDIO_RECRUITMENT_CONFIG || path.join(os.homedir(), ".config", "jastudio-recruitment");
export const git = (args, cwd = root) => execFileSync("git", args, {cwd, encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"]}).trim();
export function verifyRoot(cwd = root, remote = true) {
  const origin = git(["remote", "get-url", "origin"], cwd);
  if (!/^(?:https:\/\/github\.com\/|git@github\.com:)JaStudioConsulting\/recruitment-skills(?:\.git)?$/.test(origin)) throw new Error("Recruiter origin is not JaStudioConsulting/recruitment-skills");
  if (git(["status", "--porcelain", "--untracked-files=normal"], cwd)) throw new Error("Recruiting authority has unpublished local changes; do not use a mixed version");
  const commit = git(["rev-parse", "HEAD"], cwd);
  if (remote) {
    const published = git(["ls-remote", "origin", "refs/heads/main"], cwd).split(/\s+/)[0];
    if (published !== commit) throw new Error("Installed recruiter differs from published main; run the authorized local sync");
  }
  return commit;
}
export function inspectLinks(repoRoot, receipt) {
  const shared = receipt.shared_skills_root;
  if (!shared || realpathSync(receipt.root) !== realpathSync(repoRoot)) throw new Error("installation receipt points to a different repository");
  for (const name of ["recruiter", "tracker-manager"]) {
    if (realpathSync(path.join(shared, name)) !== realpathSync(path.join(repoRoot, "skills", name))) throw new Error(`${name} is not loaded from the repository`);
  }
  return true;
}
export function inspectInstallation(remote = true) {
  const commit = verifyRoot(root, remote);
  const receipt = JSON.parse(readFileSync(path.join(settingsRoot, "installation.json"), "utf8"));
  inspectLinks(root, receipt);
  if (receipt.commit !== commit) throw new Error("installation receipt does not match the verified commit");
  const trackerConfig = path.join(settingsRoot, "tracker.json"), hostConfig = path.join(settingsRoot, "host.json");
  if (!existsSync(trackerConfig) || !existsSync(hostConfig)) throw new Error("private recruiting configuration is missing");
  return {status: "verified", commit, repository: "JaStudioConsulting/recruitment-skills", root,
    recruiter: path.join(root, "skills/recruiter/SKILL.md"),
    rules: path.join(root, "skills/GLOBAL-RULES.md"), tool_map: path.join(root, "skills/TOOL-CONVENTIONS.md"),
    tracker: path.join(root, "skills/tracker-manager/GUIDE.md"), tracker_config: trackerConfig, host_config: hostConfig};
}
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    if (process.argv[2] === "ensure") {
      const syncPath = path.join(root, "scripts/sync-local.mjs");
      if (existsSync(syncPath)) execFileSync(process.execPath, [syncPath], {stdio: "inherit", timeout: 180000});
      else { console.error("local sync runtime not present; standalone/connector install, skipping"); process.exit(0); }
    }
    console.log(JSON.stringify(inspectInstallation(true), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
