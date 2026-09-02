import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { root, settingsRoot, verifyRoot, inspectInstallation } from "../skills/recruiter/scripts/authority.mjs";

const shared = process.argv[2];
if (!shared || !path.isAbsolute(shared) || !existsSync(shared)) throw new Error("provide the existing absolute shared skills directory");
const commit = verifyRoot();
for (const file of ["tracker.json", "host.json"]) if (!existsSync(path.join(settingsRoot, file))) throw new Error(`missing private ${file}`);
const sharedRoot = realpathSync(shared);
const backupRoot = path.join(settingsRoot, "backups", new Date().toISOString().replace(/[:.]/g, "-"));
mkdirSync(backupRoot, {recursive: true, mode: 0o700});
const changes = [];
const receiptPath = path.join(settingsRoot, "installation.json");
const previousReceipt = existsSync(receiptPath) ? readFileSync(receiptPath) : null;
try {
  for (const name of ["recruiter", "tracker-manager"]) {
    const target = path.join(sharedRoot, name), source = path.join(root, "skills", name), backup = path.join(backupRoot, name);
    if (existsSync(target) && realpathSync(target) === realpathSync(source)) continue;
    let present = false;
    try { lstatSync(target); present = true; } catch (e) { if (e.code !== "ENOENT") throw e; }
    if (present) renameSync(target, backup);
    changes.push({target, backup: present ? backup : null});
    symlinkSync(source, target, "dir");
  }
  if (previousReceipt) writeFileSync(path.join(backupRoot, "installation.json"), previousReceipt, {mode: 0o600});
  writeFileSync(receiptPath, JSON.stringify({repository: "JaStudioConsulting/recruitment-skills", root, commit, shared_skills_root: sharedRoot, backup_root: backupRoot, installed_at: new Date().toISOString()}, null, 2) + "\n", {mode: 0o600});
  console.log(JSON.stringify({...inspectInstallation(), backup_root: backupRoot}, null, 2));
} catch (error) {
  for (const {target, backup} of changes.reverse()) {
    try { if (lstatSync(target).isSymbolicLink()) unlinkSync(target); } catch (e) { if (e.code !== "ENOENT") throw e; }
    if (backup) renameSync(backup, target);
  }
  if (previousReceipt) writeFileSync(receiptPath, previousReceipt, {mode: 0o600});
  else if (existsSync(receiptPath)) unlinkSync(receiptPath);
  throw error;
}
