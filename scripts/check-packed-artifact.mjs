import { mkdtemp, readdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const output = await mkdtemp(path.join(os.tmpdir(), "recruitment-skills-pack-"));

try {
  const result = spawnSync("pnpm", ["pack", "--pack-destination", output], {
    cwd: path.resolve(import.meta.dirname, ".."),
    encoding: "utf8",
    stdio: "inherit"
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
  const archives = (await readdir(output)).filter((name) => name.endsWith(".tgz"));
  if (archives.length !== 1) throw new Error(`expected one packed archive, found ${archives.length}`);
  const listed = spawnSync("tar", ["-tzf", path.join(output, archives[0])], {encoding: "utf8"});
  if (listed.status !== 0) throw new Error("cannot inspect package contents");
  const files = new Set(listed.stdout.trim().split("\n"));
  for (const required of ["skills/recruiter/SKILL.md", "skills/recruiter/scripts/authority.mjs", "skills/tracker-manager/SKILL.md", "skills/tracker-manager/GUIDE.md", "skills/tracker-manager/references/contract.json", "skills/tracker-manager/scripts/tracker.mjs", "scripts/sync-local.mjs", "scripts/install-local.mjs"]) {
    if (!files.has(`package/${required}`)) throw new Error(`missing packed authority resource: ${required}`);
  }
  for (const file of files) if (/(?:^|\/)(?:installation\.json|tracker\.json|host\.json|backups|node_modules|\.env)(?:\/|$)/.test(file)) throw new Error(`private runtime resource leaked into package: ${file}`);
  console.log(`verified packed archive: ${archives[0]}`);
} finally {
  await rm(output, { recursive: true, force: true });
}
