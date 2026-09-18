import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// The hosted builder's input boundary is Python. Run its unit tests so
// `npm test` fails when normalization, refusal, or contact stripping regress.
test("hosted builder input boundary (server/candidate_input.py)", () => {
  const result = spawnSync("python3", [path.join(root, "server", "test_candidate_input.py")], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
