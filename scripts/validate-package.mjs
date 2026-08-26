import { lstat, readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillsRoot = path.join(root, "skills");
const textExtensions = new Set([".md", ".txt", ".json", ".html", ".js", ".mjs", ".py", ".yml", ".yaml"]);
const secretPatterns = [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /AKIA[0-9A-Z]{16}/, /AIza[0-9A-Za-z_-]{35}/, /github_pat_[0-9A-Za-z_]{20,}/, /gh[pousr]_[0-9A-Za-z]{20,}/, /xox[baprs]-[0-9A-Za-z-]{20,}/, /(?:api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*["'][A-Za-z0-9_./+=-]{16,}["']/i];
const privateMarkers = ["## Real Candidate Examples from This Session", "Worked example (real", "Known Candidates", "Email source:", "completed real reference check"];
const operationalPatterns = [
  { pattern: /\/Users\/[A-Za-z0-9._-]+\//, label: "machine-specific user path" },
  { pattern: /app\.loxo\.co\/agencies\/\d+/i, label: "live Loxo agency id" },
  { pattern: /\b(?:ja|sarahfell|manufacturing)@toptiertalentgroup\.com\b/i, label: "live staff or team email" },
  { pattern: /\b(?:MYTOX|Magna Cosma|Magna Exteriors)\b/i, label: "known client-specific example" },
  { pattern: /\b(?:100\.121\.104\.40|ja-1|ja-2)\b/, label: "machine-specific host" }
];
const prohibitedExtensions = new Set([".bak", ".zip", ".pdf", ".doc", ".csv", ".log", ".env", ".pem", ".key", ".p12", ".pfx", ".pyc"]);

const contained = (base, target) => { const relative = path.relative(base, target); return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); };
async function exists(file) { try { return (await lstat(file)).isFile(); } catch { return false; } }
async function walk(dir, files = [], problems = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) problems.push(`symlink is not allowed: ${path.relative(root, target)}`);
    else if (entry.isDirectory()) await walk(target, files, problems);
    else if (entry.isFile()) files.push(target);
  }
  return { files, problems };
}
function markdownTargets(content) { return [...content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1].trim().replace(/^<|>$/g, "").split(/\s+["']/)[0]).filter((target) => target && !target.startsWith("#") && !/^(https?:|mailto:|tel:|data:)/i.test(target) && !target.includes("{{")); }
function ids(items, name, problems) { const found = new Set(); for (const item of items || []) { if (!item?.id || found.has(item.id)) problems.push(`missing or duplicate ${name} id: ${item?.id || "<empty>"}`); else found.add(item.id); } return found; }
function inspectSanitizedDocx(file) {
  for (const member of ["word/document.xml", "docProps/core.xml"]) {
    const result = spawnSync("unzip", ["-p", file, member], { encoding: "utf8" });
    if (result.status !== 0) { problems.push(`cannot inspect approved DOCX member ${member}`); continue; }
    if (member === "word/document.xml") for (const placeholder of ["{{candidate_name}}", "{{reference_name}}", "{{reference_company}}", "{{reference_title}}"])
      if (!result.stdout.includes(placeholder)) problems.push(`sanitized reference template is missing ${placeholder}`);
    if (member === "docProps/core.xml" && (!result.stdout.includes("Sanitized Blank Professional Reference Check") || !result.stdout.includes("Top Tier Talent Group"))) problems.push("sanitized reference template has unexpected core properties");
    if (secretPatterns.some((pattern) => pattern.test(result.stdout))) problems.push(`secret-like value in approved DOCX ${member}`);
  }
}

const problems = [];
const readJson = async (relative) => { try { return JSON.parse(await readFile(path.join(skillsRoot, relative), "utf8")); } catch (error) { problems.push(`invalid ${relative}: ${error.message}`); return null; } };
const [capabilities, tools, plugins, hosts, workflows] = await Promise.all(["capabilities.json", "manifests/tools.json", "manifests/plugins.json", "manifests/hosts.json", "manifests/workflows.json"].map(readJson));
if ([capabilities, tools, plugins, hosts, workflows].every(Boolean)) {
  if (capabilities.schema_version !== 2 || capabilities.front_door?.id !== "recruiter" || capabilities.front_door?.path !== "recruiter/SKILL.md") problems.push("recruiter must remain the sole front door");
  const capabilityIds = ids(capabilities.capabilities, "capability", problems);
  if (capabilityIds.size !== 23) problems.push(`expected 23 internal capabilities, found ${capabilityIds.size}`);
  for (const item of capabilities.capabilities || []) {
    if (!item.path?.endsWith("/GUIDE.md")) problems.push(`capability ${item.id} must use GUIDE.md`);
    const target = path.resolve(skillsRoot, item.path || "");
    if (!contained(skillsRoot, target) || !await exists(target)) problems.push(`missing capability guide: ${item.path || "<empty>"}`);
    for (const asset of item.required_assets || []) { const assetPath = path.resolve(skillsRoot, asset); if (!contained(skillsRoot, assetPath) || !await exists(assetPath)) problems.push(`missing required asset for ${item.id}: ${asset}`); }
  }
  for (const policy of capabilities.policies || []) if (!await exists(path.resolve(skillsRoot, policy))) problems.push(`missing policy: ${policy}`);
  if (tools.router !== "recruiter" || !tools.forbidden_mcp_actions?.includes("gmail_send") || !tools.forbidden_mcp_actions?.includes("loxo_write") || !tools.forbidden_mcp_actions?.includes("approval_decide")) problems.push("tool manifest does not preserve required recruiter safety boundaries");
  ids(tools.tools, "tool", problems); ids(plugins.integrations, "integration", problems);
  const hostIds = ids(hosts.hosts, "host", problems); for (const id of ["codex", "opencode", "hermes", "claude", "gemini", "generic-mcp"]) if (!hostIds.has(id)) problems.push(`missing host declaration: ${id}`);
  if (hosts.hosts?.some((host) => host.active_repoint_allowed !== false)) problems.push("host repoint must remain disabled");
  if (!await exists(path.resolve(root, hosts.instructions || ""))) problems.push(`missing host instructions: ${hosts.instructions}`);
  ids(workflows.workflows, "workflow", problems); for (const workflow of workflows.workflows || []) { if (workflow.router !== "recruiter") problems.push(`workflow bypasses recruiter: ${workflow.id}`); for (const id of [workflow.capability, ...(workflow.capabilities || [])].filter(Boolean)) if (!capabilityIds.has(id)) problems.push(`unknown workflow capability: ${id}`); for (const file of [workflow.fixture, workflow.template, workflow.reference].filter(Boolean)) { const base = file.startsWith("recruiter/") ? skillsRoot : root; const target = path.resolve(base, file); if (!contained(base, target) || !await exists(target)) problems.push(`missing workflow file: ${file}`); } }
}
const { files, problems: walkProblems } = await walk(skillsRoot); problems.push(...walkProblems);
const skillFiles = files.filter((file) => path.basename(file) === "SKILL.md"); if (skillFiles.length !== 1 || path.relative(root, skillFiles[0]) !== "skills/recruiter/SKILL.md") problems.push("expected exactly one recruiter SKILL.md");
for (const file of files) {
  const relative = path.relative(root, file); const extension = path.extname(file).toLowerCase();
  if (extension === ".docx") { if (relative !== "skills/recruiter/modules/complete-reference-check/assets/reference-check-template.docx") problems.push(`unapproved DOCX asset: ${relative}`); else inspectSanitizedDocx(file); continue; }
  if (prohibitedExtensions.has(extension)) problems.push(`blocked private or generated file: ${relative}`);
  if (!textExtensions.has(extension)) continue;
  const content = await readFile(file, "utf8");
  if (privateMarkers.some((marker) => content.toLowerCase().includes(marker.toLowerCase()))) problems.push(`private worked-example marker in ${relative}`);
  if (secretPatterns.some((pattern) => pattern.test(content))) problems.push(`secret-like value in ${relative}`);
  for (const { pattern, label } of operationalPatterns) if (pattern.test(content)) problems.push(`${label} in ${relative}`);
  for (const match of content.matchAll(/\b[A-Z0-9._%+-]+@(?:[A-Z0-9.-]+\.)+[A-Z]{2,}\b/gi)) if (!match[0].toLowerCase().endsWith(".invalid")) problems.push(`non-synthetic email address in ${relative}`);
  for (const target of markdownTargets(content)) { const resolved = path.resolve(path.dirname(file), target.split("#")[0]); if (!contained(root, resolved) || !await exists(resolved)) problems.push(`broken local Markdown link in ${relative}: ${target}`); }
}
if (problems.length) { console.error([...new Set(problems)].sort().join("\n")); process.exitCode = 1; } else console.log(`validated standalone recruiter package: 23 capabilities, ${tools.tools.length} declared MCP contract tools, ${hosts.hosts.length} hosts, ${files.length} skills files`);
