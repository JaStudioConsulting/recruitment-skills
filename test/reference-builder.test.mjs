import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("reference builder keeps every question with its answer", async (t) => {
  const python = spawnSync("python3", ["--version"], { encoding: "utf8" });
  if (python.status !== 0) return t.skip("python3 is unavailable");

  const temporary = await mkdtemp(path.join(os.tmpdir(), "reference-builder-test-"));
  try {
    const fixture = JSON.parse(await readFile(path.join(root, "tests/fixtures/synthetic-after-call.json"), "utf8"));
    const input = path.join(temporary, "reference.json");
    const output = path.join(temporary, "reference.docx");
    await writeFile(input, JSON.stringify(fixture.reference_check), "utf8");

    const build = spawnSync("python3", [
      path.join(root, "skills/recruiter/modules/complete-reference-check/scripts/build_reference_check.py"),
      "--input", input,
      "--output", output
    ], { encoding: "utf8" });
    assert.equal(build.status, 0, build.stderr || build.stdout);

    const unzip = spawnSync("unzip", ["-p", output, "word/document.xml"], { encoding: "utf8" });
    assert.equal(unzip.status, 0, unzip.stderr);
    const questions = unzip.stdout.match(/<w:p(?:\s[^>]*)?>.*?<\/w:p>/gs)
      ?.filter((paragraph) => /\?<\/w:t>/.test(paragraph)) ?? [];
    assert.ok(questions.length >= 10, `expected question paragraphs, found ${questions.length}`);
    for (const paragraph of questions) assert.match(paragraph, /<w:keepNext\/?/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
