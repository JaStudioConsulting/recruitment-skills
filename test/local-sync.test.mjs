import assert from "node:assert/strict";
import test from "node:test";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { root } from "../skills/recruiter/scripts/authority.mjs";

test("local sync fast-forwards validated releases and retains the installed version on failure", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "recruiter-sync-test-"));
  const realGit = execFileSync("which", ["git"], {encoding: "utf8"}).trim();
  const runGit = (args, cwd) => execFileSync(realGit, args, {cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]}).trim();
  try {
    const seed = path.join(temp, "seed"), remote = path.join(temp, "remote.git"), installed = path.join(temp, "installed"), shared = path.join(temp, "shared"), settings = path.join(temp, "settings"), bin = path.join(temp, "bin");
    for (const p of [seed, shared, settings, bin]) mkdirSync(p);
    runGit(["init", "--bare", "--initial-branch=main", remote], temp);
    runGit(["init", "--initial-branch=main"], seed);
    runGit(["config", "user.name", "Synthetic Tester"], seed); runGit(["config", "user.email", "tester@example.invalid"], seed);
    for (const p of ["scripts", "skills/recruiter/scripts", "skills/tracker-manager", "test"]) mkdirSync(path.join(seed,p), {recursive: true});
    cpSync(path.join(root, "scripts/sync-local.mjs"), path.join(seed, "scripts/sync-local.mjs"));
    cpSync(path.join(root, "skills/recruiter/scripts/authority.mjs"), path.join(seed, "skills/recruiter/scripts/authority.mjs"));
    writeFileSync(path.join(seed, "skills/tracker-manager/GUIDE.md"), "Synthetic fixture\n");
    writeFileSync(path.join(seed, "scripts/validate-package.mjs"), 'import {readFileSync} from "node:fs"; if (readFileSync("release.txt", "utf8").includes("invalid")) throw new Error("bad release");\n');
    writeFileSync(path.join(seed, "test/smoke.test.mjs"), 'import test from "node:test"; import assert from "node:assert/strict"; test("fixture", () => assert.equal(1+1,2));\n');
    writeFileSync(path.join(seed, "release.txt"), "one\n");
    runGit(["add", "."], seed); runGit(["commit", "-m", "synthetic initial"], seed);
    runGit(["remote", "add", "origin", remote], seed); runGit(["push", "origin", "main"], seed);
    runGit(["clone", remote, installed], temp);
    const first = runGit(["rev-parse", "HEAD"], installed);
    for (const name of ["recruiter", "tracker-manager"]) symlinkSync(path.join(installed,"skills",name), path.join(shared,name), "dir");
    const receipt = path.join(settings, "installation.json");
    writeFileSync(receipt, JSON.stringify({root: installed, commit: first, shared_skills_root: shared}));
    // Stub only GitHub's origin display. Actual fetches, worktrees and merges
    // run against the isolated bare repository, with no network or host config.
    writeFileSync(path.join(bin, "git"), `#!/usr/bin/env node\nconst {spawnSync} = require("node:child_process"); const args = process.argv.slice(2); if(args.join(" ") === "remote get-url origin") { console.log("https://github.com/JaStudioConsulting/recruitment-skills.git"); } else { const r=spawnSync(${JSON.stringify(realGit)},args,{stdio:"inherit"}); process.exit(r.status ?? 1); }\n`, {mode: 0o700});
    const env = {...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, JASTUDIO_RECRUITMENT_CONFIG: settings};
    const sync = () => execFileSync(process.execPath, [path.join(installed, "scripts/sync-local.mjs")], {env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]});
    assert.match(sync(), /current/);
    writeFileSync(path.join(seed, "release.txt"), "two\n"); runGit(["commit", "-am", "synthetic valid update"], seed); runGit(["push", "origin", "main"], seed);
    const second = runGit(["rev-parse", "HEAD"], seed);
    sync(); assert.equal(runGit(["rev-parse", "HEAD"], installed), second); assert.equal(JSON.parse(readFileSync(receipt)).commit, second);
    writeFileSync(path.join(seed, "release.txt"), "invalid\n"); runGit(["commit", "-am", "synthetic invalid update"], seed); runGit(["push", "origin", "main"], seed);
    assert.throws(sync); assert.equal(runGit(["rev-parse", "HEAD"], installed), second); assert.equal(JSON.parse(readFileSync(receipt)).commit, second);
    writeFileSync(path.join(installed, "user-work.txt"), "preserve this\n");
    assert.throws(sync); assert.equal(readFileSync(path.join(installed,"user-work.txt"), "utf8"), "preserve this\n");
  } finally { rmSync(temp, {recursive: true, force: true}); }
});
