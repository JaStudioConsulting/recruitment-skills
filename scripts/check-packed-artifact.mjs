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
  console.log(`verified packed archive: ${archives[0]}`);
} finally {
  await rm(output, { recursive: true, force: true });
}
