import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
async function pythonFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await pythonFiles(target));
    else if (entry.isFile() && target.endsWith(".py")) files.push(target);
  }
  return files;
}
const files = await pythonFiles(path.join(root, "skills"));
const { spawnSync } = await import("node:child_process");
for (const file of files) {
  const result = spawnSync("python3", ["-B", "-c", "import ast, pathlib, sys; ast.parse(pathlib.Path(sys.argv[1]).read_text(), filename=sys.argv[1])", file], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `Python syntax check failed: ${file}`);
}
console.log(`parsed ${files.length} Python builders without writing bytecode`);
