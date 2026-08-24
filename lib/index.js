import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillsRoot = path.join(packageRoot, "skills");

function safeRelativePath(relativePath) {
  if (typeof relativePath !== "string" || !relativePath) throw new TypeError("relativePath must be a non-empty string");
  const resolved = path.resolve(skillsRoot, relativePath);
  const relative = path.relative(skillsRoot, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new RangeError("path must stay inside the packaged skills directory");
  return resolved;
}

export function getPackageRoot() { return packageRoot; }
export function getSkillsRoot() { return skillsRoot; }
export function resolveSkillPath(relativePath) { return safeRelativePath(relativePath); }
export async function readSkillText(relativePath) { return readFile(safeRelativePath(relativePath), "utf8"); }
export async function assertSkillFile(relativePath) {
  const target = safeRelativePath(relativePath);
  await access(target);
  return target;
}
export async function getRecruiterAuthority() {
  const capabilities = JSON.parse(await readSkillText("capabilities.json"));
  const routerPath = capabilities.front_door?.path;
  if (capabilities.front_door?.id !== "recruiter" || !routerPath) throw new Error("invalid recruiter front-door manifest");
  return Object.freeze({
    id: "recruiter",
    routerPath,
    routerFile: await assertSkillFile(routerPath),
    capabilitiesPath: resolveSkillPath("capabilities.json"),
    policies: Object.freeze([...capabilities.policies]),
    capabilities: Object.freeze(capabilities.capabilities.map(({ id, path: guidePath, status, group }) => ({ id, path: guidePath, status, group })))
  });
}
