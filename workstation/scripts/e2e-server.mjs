import { fileURLToPath } from "node:url";
import { applyIsolatedE2eEnvironment, resetE2eDatabase } from "./e2e-setup.mjs";

resetE2eDatabase();
applyIsolatedE2eEnvironment();

const port = process.env.WORKSTATION_E2E_PORT ?? "4317";
const cli = new URL("../node_modules/vite/bin/vite.js", import.meta.url);
process.argv = [
  process.execPath,
  fileURLToPath(cli),
  "dev",
  "--host",
  "127.0.0.1",
  "--port",
  port,
  "--strictPort",
];
await import(cli.href);
