import { mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));
export const playwrightRoot = path.join(projectRoot, ".playwright");
export const stateRoot = path.join(playwrightRoot, "state");
export const runtimeRoot = path.join(playwrightRoot, "runtime");

const connectorEnvironmentKeys = [
  "RECRUITMENT_MCP_URL",
  "BROKER_TOKEN",
  "LOCAL_AI_URL",
  "LOCAL_AI_TOKEN",
];

export function isolatedE2eEnvironment() {
  const environment = {
    ...process.env,
    CI: "1",
    WORKSTATION_E2E_STATE_DIR: stateRoot,
    SITES_RUNTIME_ROOT: runtimeRoot,
    WRANGLER_LOG_PATH: path.join(runtimeRoot, "wrangler", "logs"),
    WRANGLER_REGISTRY_PATH: path.join(runtimeRoot, "wrangler", "dev-registry"),
    MINIFLARE_REGISTRY_PATH: path.join(runtimeRoot, "wrangler", "registry"),
    WRANGLER_SEND_METRICS: "false",
    WRANGLER_WRITE_LOGS: "false",
  };
  for (const key of connectorEnvironmentKeys) delete environment[key];
  return environment;
}

export function applyIsolatedE2eEnvironment() {
  const environment = isolatedE2eEnvironment();
  for (const key of Object.keys(process.env)) {
    if (!(key in environment)) delete process.env[key];
  }
  Object.assign(process.env, environment);
}

export function resetE2eDatabase() {
  rmSync(stateRoot, { recursive: true, force: true });
  rmSync(runtimeRoot, { recursive: true, force: true });
  mkdirSync(stateRoot, { recursive: true });
  mkdirSync(runtimeRoot, { recursive: true });

  const wrangler = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
  const config = fileURLToPath(new URL("../wrangler.e2e.jsonc", import.meta.url));
  const result = spawnSync(process.execPath, [
    wrangler,
    "d1",
    "migrations",
    "apply",
    "site-creator-d1",
    "--local",
    "--persist-to",
    stateRoot,
    "--config",
    config,
  ], {
    cwd: projectRoot,
    env: isolatedE2eEnvironment(),
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) resetE2eDatabase();
