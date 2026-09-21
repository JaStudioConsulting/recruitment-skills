import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const STATUS_LABELS = {
  working: "Working",
  partial: "Partial",
  interface_only: "Interface only",
  blocked: "Blocked",
  not_applicable: "Not applicable",
};

function cell(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ")
    .trim() || "—";
}

function codeList(values) {
  return values?.length ? values.map((value) => `\`${String(value).replace(/`/g, "\\`")}\``).join("<br>") : "—";
}

function operationApprovals(operations) {
  return operations.map((operation) => `${operation.label} [${operation.stage}]: ${operation.approval}`).join("<br>");
}

export function capabilityTableText(root) {
  const registryPath = path.join(root, "workstation/generated/capability-registry.json");
  const registry = JSON.parse(readFileSync(registryPath, "utf8"));
  const counts = Object.fromEntries(Object.keys(STATUS_LABELS).map((status) => [
    status,
    registry.capabilities.filter((item) => item.implementation.status === status).length,
  ]));
  const rows = registry.capabilities.map((item) => {
    const mounted = item.executorFeatures.filter((feature) => feature.mounted);
    const mountedExecutors = mounted.length
      ? mounted.map((feature) => `${feature.label} (${feature.runtime})`).join("; ")
      : "";
    return `| ${cell(item.id)} | ${codeList([item.authorityPath])} | ${cell(item.workflowGroup)} | ${cell(STATUS_LABELS[item.implementation.status])} | ${cell(item.runtime)} | ${cell(mountedExecutors)} | ${cell(item.output)} | ${cell(operationApprovals(item.operations))} | ${cell(item.implementation.blocker)} | ${codeList(item.implementation.evidence)} |`;
  });

  return `# Recruiter Workstation capability verification\n\n` +
    `Generated from the canonical Workstation registry. A status is an implementation claim, not proof that a guide exists. Planned runtime describes the intended architecture; verified mounted executor is populated only for a current server dispatcher. Working claims require an observed persisted output or verified external readback.\n\n` +
    `Summary: ${counts.working} working, ${counts.partial} partial, ${counts.interface_only} interface only, ${counts.blocked} blocked, ${counts.not_applicable} not applicable.\n\n` +
    `| Capability | Governing authority | Workflow group | Status | Planned runtime | Verified mounted executor | Output or outcome | Operation approvals | What is not working | Verification evidence |\n` +
    `|---|---|---|---|---|---|---|---|---|---|\n` +
    `${rows.join("\n")}\n`;
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const output = path.join(root, "docs/capability-verification.md");
  const expected = capabilityTableText(root);
  if (process.argv.includes("--check")) {
    if (!existsSync(output) || readFileSync(output, "utf8") !== expected) {
      console.error("The checked-in capability verification table is stale. Run npm run workstation:capability-table.");
      process.exitCode = 1;
    }
    return;
  }
  writeFileSync(output, expected);
  console.log(`Wrote ${path.relative(root, output)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
