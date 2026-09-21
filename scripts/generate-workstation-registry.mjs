import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const IMPLEMENTATION_STATES = new Set(["working", "partial", "interface_only", "blocked", "not_applicable"]);
const APPROVAL_STATES = new Set(["none", "preview", "explicit"]);
const OPERATION_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function displayMetadata(markdown, fallback) {
  const frontmatter = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  const name = frontmatter?.[1].match(/^name:\s*["']?([^\n"']+)["']?\s*$/m)?.[1]?.trim();
  const descriptionBlock = frontmatter?.[1].match(/^description:\s*(?:[>|][+-]?)?\s*\n((?:^[ \t]+.*\n?)*)/m)?.[1];
  const descriptionLine = frontmatter?.[1].match(/^description:\s*["']?([^\n"']+)["']?\s*$/m)?.[1];
  const description = (descriptionBlock
    ? descriptionBlock.split("\n").map((line) => line.trim()).filter(Boolean).join(" ")
    : descriptionLine)?.trim();
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const firstParagraph = markdown
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .split(/\n\s*\n/)
    .map((part) => part.replace(/^#+\s+.*$/gm, "").trim())
    .find((part) => part && !part.startsWith("[") && !part.startsWith("```"));
  return {
    label: name || heading || fallback,
    summary: description || firstParagraph || `Repository capability ${fallback}.`,
  };
}

const TEXT_AUTHORITY_EXTENSIONS = new Set([
  ".css", ".html", ".js", ".json", ".md", ".mjs", ".py", ".sql", ".ts", ".tsx", ".txt", ".yaml", ".yml",
]);
const ROOT_RELATIVE_PREFIXES = ["docs/", "server/", "skills/", "test/", "workstation/"];
const PATH_TOKEN = /(?:\.\.\/|\.\/|[A-Za-z0-9_.-]+\/)+(?:[A-Za-z0-9_.-]+\.(?:css|docx|html|jpe?g|js|json|md|mjs|pdf|png|py|sql|svg|ts|tsx|txt|ya?ml))/g;

function relativePath(root, absolute) {
  const relative = path.relative(root, absolute).split(path.sep).join("/");
  if (!relative || relative === ".." || relative.startsWith("../")) return null;
  return relative;
}

function resolveAuthorityReference(root, file, raw) {
  const reference = raw.trim().replace(/^<|>$/g, "").split("#")[0];
  if (!reference || /^(?:https?:|mailto:|data:)/i.test(reference) || path.isAbsolute(reference)) return null;
  const candidates = [];
  if (ROOT_RELATIVE_PREFIXES.some((prefix) => reference.startsWith(prefix))) {
    candidates.push(path.resolve(root, reference));
  } else if (reference.startsWith("modules/")) {
    candidates.push(path.resolve(root, "skills/recruiter", reference));
  } else {
    candidates.push(path.resolve(path.dirname(file), reference));
    const relativeFile = relativePath(root, file);
    const moduleMatch = relativeFile?.match(/^skills\/recruiter\/modules\/[^/]+/);
    if (moduleMatch) candidates.push(path.resolve(root, moduleMatch[0], reference));
    candidates.push(path.resolve(root, "skills", reference));
  }
  for (const absolute of candidates) {
    const relative = relativePath(root, absolute);
    if (relative && existsSync(absolute) && statSync(absolute).isFile()) return relative;
  }
  return null;
}

function authorityReferences(content, file, root) {
  const found = new Set();
  const pattern = /\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of content.matchAll(pattern)) {
    const resolved = resolveAuthorityReference(root, file, match[1]);
    if (resolved) found.add(resolved);
  }
  for (const match of content.matchAll(PATH_TOKEN)) {
    const resolved = resolveAuthorityReference(root, file, match[0]);
    if (resolved) found.add(resolved);
  }
  return [...found];
}

function nestedGuides(root, authorityPath) {
  const directory = path.dirname(path.join(root, authorityPath));
  const found = [];
  function visit(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && entry.name === "GUIDE.md" && absolute !== path.join(root, authorityPath)) {
        const relative = relativePath(root, absolute);
        if (relative) found.push(relative);
      }
    }
  }
  visit(directory);
  return found.sort();
}

function topLevelSkillPaths(root) {
  const skillsRoot = path.join(root, "skills");
  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(skillsRoot, entry.name, "SKILL.md"))
    .filter((absolute) => existsSync(absolute) && statSync(absolute).isFile())
    .map((absolute) => relativePath(root, absolute))
    .filter(Boolean)
    .sort();
}

function linkedPaths(root, seedPaths, leafPaths = []) {
  const queue = [...seedPaths];
  const visited = new Set();
  const related = new Set(seedPaths);
  const leaves = new Set(leafPaths);
  while (queue.length) {
    const relative = queue.shift();
    if (!relative || visited.has(relative)) continue;
    visited.add(relative);
    const absolute = path.join(root, relative);
    if (leaves.has(relative)) continue;
    if (!existsSync(absolute) || !statSync(absolute).isFile() || !TEXT_AUTHORITY_EXTENSIONS.has(path.extname(absolute).toLowerCase())) continue;
    for (const linked of authorityReferences(readFileSync(absolute, "utf8"), absolute, root)) {
      related.add(linked);
      if (!visited.has(linked)) queue.push(linked);
    }
  }
  return [...related].sort();
}

function authorityDigest(root, paths) {
  const hash = createHash("sha256");
  for (const relative of [...paths].sort()) {
    hash.update(relative);
    hash.update("\0");
    hash.update(readFileSync(path.join(root, relative)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function validateOverlay(manifest, overlay) {
  const canonical = new Set(manifest.capabilities.map((item) => item.id));
  const configured = Object.keys(overlay.capabilities);
  const unknown = configured.filter((id) => !canonical.has(id));
  const missing = [...canonical].filter((id) => !configured.includes(id));
  if (unknown.length || missing.length) {
    throw new Error(`Capability overlay mismatch. Unknown: ${unknown.join(", ") || "none"}. Missing: ${missing.join(", ") || "none"}.`);
  }
}

function declaredSkillPath(root, raw, label) {
  const absolute = path.resolve(root, "skills", raw);
  const relative = relativePath(root, absolute);
  if (!relative || !existsSync(absolute) || !statSync(absolute).isFile()) {
    throw new Error(`Missing ${label}: ${raw}`);
  }
  return relative;
}

function featureAuthorityPath(root, raw, featureId) {
  return declaredSkillPath(root, raw, `authority path for workstation executor ${featureId}`);
}

function validateEvidencePaths(root, capabilityId, evidence) {
  for (const evidencePath of evidence) {
    if (typeof evidencePath !== "string" || !evidencePath.trim() || path.isAbsolute(evidencePath)) {
      throw new Error(`Invalid verification evidence path for ${capabilityId}: ${String(evidencePath)}`);
    }
    const absolute = path.resolve(root, evidencePath);
    const relative = relativePath(root, absolute);
    if (!relative || relative !== evidencePath.split(path.sep).join("/") || !existsSync(absolute) || !statSync(absolute).isFile()) {
      throw new Error(`Missing verification evidence for ${capabilityId}: ${evidencePath}`);
    }
  }
}

function implementationOperations(capabilityId, implementation) {
  const operations = implementation.operations;
  if (!Array.isArray(operations) || operations.length === 0) {
    throw new Error(`Capability ${capabilityId} must declare at least one operation.`);
  }
  const ids = new Set();
  for (const operation of operations) {
    if (!OPERATION_ID.test(operation.id ?? "")) {
      throw new Error(`Invalid operation id for ${capabilityId}: ${String(operation.id)}`);
    }
    if (ids.has(operation.id)) throw new Error(`Duplicate operation for ${capabilityId}: ${operation.id}`);
    ids.add(operation.id);
    if (typeof operation.label !== "string" || !operation.label.trim()) {
      throw new Error(`Missing operation label for ${capabilityId}:${operation.id}`);
    }
    if (typeof operation.stage !== "string" || !operation.stage.trim()) {
      throw new Error(`Missing operation stage for ${capabilityId}:${operation.id}`);
    }
    if (!APPROVAL_STATES.has(operation.approval)) {
      throw new Error(`Invalid approval state for ${capabilityId} operation ${operation.id}`);
    }
    if (typeof operation.output !== "string" || !operation.output.trim()) {
      throw new Error(`Missing operation output for ${capabilityId}:${operation.id}`);
    }
  }
  return operations;
}

function validateFeatureRequirements(feature) {
  const ids = new Set();
  for (const requirement of feature.requirements ?? []) {
    if (ids.has(requirement.id)) throw new Error(`Duplicate requirement for workstation executor ${feature.id}: ${requirement.id}`);
    ids.add(requirement.id);
    if (requirement.input_keys !== undefined) {
      if (requirement.kind !== "user_input" || !Array.isArray(requirement.input_keys) || requirement.input_keys.length === 0) {
        throw new Error(`Structured input keys require a user_input requirement for ${feature.id}:${requirement.id}`);
      }
      if (requirement.input_keys.some((key) => typeof key !== "string" || !key.trim())) {
        throw new Error(`Invalid structured input key for ${feature.id}:${requirement.id}`);
      }
    }
    if (requirement.allowed_values !== undefined &&
      (!Array.isArray(requirement.allowed_values) || requirement.allowed_values.length === 0 || requirement.input_keys?.length !== 1)) {
      throw new Error(`Allowed values require exactly one structured input key for ${feature.id}:${requirement.id}`);
    }
  }
}

export function compileWorkstationRegistry(root) {
  const manifest = readJson(path.join(root, "skills/capabilities.json"));
  const overlay = readJson(path.join(root, "workstation/capability-implementation.json"));
  const featureCatalog = readJson(path.join(root, "workstation/capability-features.json"));
  validateOverlay(manifest, overlay);
  const canonicalById = new Map(manifest.capabilities.map((item) => [item.id, item]));
  const canonicalIds = new Set(manifest.capabilities.map((item) => item.id));
  const operationsByCapabilityId = new Map(manifest.capabilities.map((item) => [
    item.id,
    implementationOperations(item.id, overlay.capabilities[item.id]),
  ]));
  const featureIds = new Set();
  for (const feature of featureCatalog.features) {
    if (featureIds.has(feature.id)) throw new Error(`Duplicate workstation executor ${feature.id}.`);
    featureIds.add(feature.id);
    if (!feature.primary_capability_id || !feature.capability_ids.includes(feature.primary_capability_id)) {
      throw new Error(`Workstation executor ${feature.id} must name one declared primary capability.`);
    }
    for (const capabilityId of feature.capability_ids) {
      if (!canonicalIds.has(capabilityId)) {
        throw new Error(`Workstation feature ${feature.id} references unknown capability ${capabilityId}.`);
      }
    }
    const primaryOperations = operationsByCapabilityId.get(feature.primary_capability_id);
    const operationId = feature.operation_id ?? primaryOperations[0].id;
    if (!primaryOperations.some((operation) => operation.id === operationId)) {
      throw new Error(`Workstation executor ${feature.id} references unknown primary operation ${feature.primary_capability_id}:${operationId}.`);
    }
    validateFeatureRequirements(feature);
  }
  const executors = featureCatalog.features.map((feature) => ({
    ...feature,
    operation_id: feature.operation_id ?? operationsByCapabilityId.get(feature.primary_capability_id)[0].id,
    mounted: feature.mounted === true,
    supporting_capability_ids: feature.capability_ids.filter((id) => id !== feature.primary_capability_id),
  }));
  const frontDoor = declaredSkillPath(root, manifest.front_door.path, "recruiter front door");
  const policies = manifest.policies.map((item) => declaredSkillPath(root, item, "recruiter policy"));
  const topLevelSkills = topLevelSkillPaths(root);
  if (!topLevelSkills.includes(frontDoor)) {
    throw new Error(`The canonical front door is not a top-level SKILL.md: ${frontDoor}`);
  }
  const frontDoorDirectGovernance = authorityReferences(
    readFileSync(path.join(root, frontDoor), "utf8"),
    path.join(root, frontDoor),
    root,
  ).filter((authorityPath) => !authorityPath.startsWith("skills/recruiter/modules/"));
  const commonAuthorityPaths = [...new Set([
    ...policies,
    frontDoor,
    "skills/capabilities.json",
    ...frontDoorDirectGovernance,
  ])].sort();
  const repositoryAuthorityPaths = linkedPaths(root, [
    ...topLevelSkills,
    ...policies,
    "skills/capabilities.json",
  ]);
  const compatibilityEntries = topLevelSkills
    .filter((skillPath) => skillPath !== frontDoor)
    .map((skillPath) => ({
      skillPath,
      authorityPaths: linkedPaths(root, [skillPath], [frontDoor]),
    }));

  function capabilitySeedPaths(capabilityId, trail = []) {
    if (trail.includes(capabilityId)) {
      throw new Error(`Circular supporting authority: ${[...trail, capabilityId].join(" -> ")}`);
    }
    const canonical = canonicalById.get(capabilityId);
    if (!canonical) throw new Error(`Unknown supporting authority: ${capabilityId}`);
    const authorityPath = declaredSkillPath(root, canonical.path, `capability authority for ${capabilityId}`);
    const seeds = new Set([
      authorityPath,
      ...nestedGuides(root, authorityPath),
      ...(canonical.required_assets ?? []).map((item) => declaredSkillPath(root, item, `required asset for ${capabilityId}`)),
    ]);
    for (const entry of compatibilityEntries) {
      if (!entry.authorityPaths.includes(authorityPath)) continue;
      for (const entryAuthority of entry.authorityPaths) seeds.add(entryAuthority);
    }
    for (const executor of executors.filter((item) => item.primary_capability_id === capabilityId)) {
      for (const declared of [...(executor.guide_paths ?? []), ...(executor.contract_paths ?? [])]) {
        seeds.add(featureAuthorityPath(root, declared, executor.id));
      }
      for (const supportingId of executor.supporting_capability_ids) {
        for (const supportingPath of capabilitySeedPaths(supportingId, [...trail, capabilityId])) seeds.add(supportingPath);
      }
    }
    return [...seeds];
  }

  const authorityPathsById = new Map(manifest.capabilities.map((canonical) => {
    const capabilityPaths = linkedPaths(root, capabilitySeedPaths(canonical.id), commonAuthorityPaths);
    return [canonical.id, [...new Set([...commonAuthorityPaths, ...capabilityPaths])].sort()];
  }));
  for (const entry of compatibilityEntries) {
    if (!manifest.capabilities.some((capability) => authorityPathsById.get(capability.id).includes(entry.skillPath))) {
      throw new Error(`Top-level skill is not mapped to any canonical capability: ${entry.skillPath}`);
    }
  }
  const authorityDigestsById = new Map(manifest.capabilities.map((canonical) => [
    canonical.id,
    authorityDigest(root, authorityPathsById.get(canonical.id)),
  ]));

  const capabilities = manifest.capabilities.map((canonical) => {
    const authorityPath = `skills/${canonical.path}`;
    const absoluteAuthority = path.join(root, authorityPath);
    if (!existsSync(absoluteAuthority)) throw new Error(`Missing capability authority: ${authorityPath}`);
    const implementation = overlay.capabilities[canonical.id];
    if (!IMPLEMENTATION_STATES.has(implementation.status)) throw new Error(`Invalid implementation state for ${canonical.id}`);
    validateEvidencePaths(root, canonical.id, implementation.evidence);
    const metadata = displayMetadata(readFileSync(absoluteAuthority, "utf8"), canonical.id);
    const authorityPaths = authorityPathsById.get(canonical.id);
    const relatedPaths = authorityPaths.filter((item) => item !== authorityPath);
    const primaryExecutors = executors.filter((feature) => feature.primary_capability_id === canonical.id);
    if (primaryExecutors.some((feature) => feature.mounted) && ["blocked", "interface_only", "not_applicable"].includes(implementation.status)) {
      throw new Error(`Mounted workstation executor cannot claim ${implementation.status} capability ${canonical.id}.`);
    }
    return {
      id: canonical.id,
      label: metadata.label,
      summary: metadata.summary,
      authorityPath,
      relatedPaths,
      authorityDigest: authorityDigestsById.get(canonical.id),
      repositoryGroup: canonical.group,
      repositoryStatus: canonical.status,
      workflowGroup: implementation.workflow_group,
      inputs: implementation.inputs,
      context: implementation.context,
      output: implementation.output,
      runtime: implementation.runtime,
      operations: operationsByCapabilityId.get(canonical.id),
      executorFeatures: primaryExecutors
        .map((feature) => ({
          id: feature.id,
          label: feature.label,
          runtime: feature.runtime,
          mounted: feature.mounted,
          resultKind: feature.result_kind,
          operationId: feature.operation_id,
          supportingCapabilityIds: feature.supporting_capability_ids,
          supportingAuthorities: feature.supporting_capability_ids.map((id) => ({
            id,
            authorityDigest: authorityDigestsById.get(id),
          })),
        })),
      implementation: {
        status: implementation.status,
        blocker: implementation.blocker,
        evidence: implementation.evidence,
      },
    };
  });
  return {
    schemaVersion: 3,
    frontDoor,
    topLevelSkills,
    repositoryAuthorityPaths,
    repositoryAuthorityDigest: authorityDigest(root, repositoryAuthorityPaths),
    policies,
    generatedFrom: ["skills/capabilities.json", "workstation/capability-implementation.json", "workstation/capability-features.json"],
    capabilities,
    executors: executors.map((executor) => ({
      ...executor,
      supporting_authorities: executor.supporting_capability_ids.map((id) => ({
        id,
        authority_digest: authorityDigestsById.get(id),
      })),
    })),
  };
}

export function registryOutputPath(root) {
  return path.join(root, "workstation/generated/capability-registry.json");
}

export function registryText(root) {
  return `${JSON.stringify(compileWorkstationRegistry(root), null, 2)}\n`;
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const output = registryOutputPath(root);
  const expected = registryText(root);
  if (process.argv.includes("--check")) {
    if (!existsSync(output) || readFileSync(output, "utf8") !== expected) {
      console.error("The checked-in workstation capability registry is stale. Run npm run workstation:registry.");
      process.exitCode = 1;
    }
    return;
  }
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, expected);
  console.log(`Wrote ${path.relative(root, output)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
