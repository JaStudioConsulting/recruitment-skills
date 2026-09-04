import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundledSoffice = path.join(os.homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/soffice");
const sofficeCommand = process.env.SOFFICE || (spawnSync(bundledSoffice, ["--version"], { encoding: "utf8" }).status === 0 ? bundledSoffice : "soffice");

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

    const soffice = spawnSync(sofficeCommand, ["--version"], { encoding: "utf8" });
    if (soffice.status !== 0) return t.skip("soffice is unavailable for DOCX to PDF conversion");
    const converted = spawnSync(sofficeCommand, ["--headless", "--convert-to", "pdf", "--outdir", temporary, output], { encoding: "utf8" });
    assert.equal(converted.status, 0, converted.stderr || converted.stdout);
    const pdf = path.join(temporary, "reference.pdf");
    assert.ok((await stat(pdf)).size > 0);
    const info = spawnSync("pdfinfo", [pdf], { encoding: "utf8" }).stdout;
    const pages = Number(info.match(/^Pages:\s+(\d+)/m)?.[1] || 0);
    assert.ok(pages > 0);
    const prefix = path.join(temporary, "reference-page");
    const rendered = spawnSync("pdftoppm", ["-png", "-r", "72", pdf, prefix], { encoding: "utf8" });
    assert.equal(rendered.status, 0, rendered.stderr);
    const images = (await readdir(temporary)).filter((name) => /^reference-page-\d+\.png$/.test(name));
    assert.equal(images.length, pages);
    for (const image of images) assert.ok((await stat(path.join(temporary, image))).size > 0, image);
    const text = spawnSync("pdftotext", [pdf, "-"], { encoding: "utf8" }).stdout;
    assert.doesNotMatch(text, /\{\{[^}]+\}\}|—|–|--/);
    assert.equal((await readFile(pdf)).includes(Buffer.from("/URI")), false, "reference PDF must not contain hyperlinks");
    const guide = await readFile(path.join(root, "skills/recruiter/modules/complete-reference-check/GUIDE.md"), "utf8");
    assert.match(guide, /Inspect every page|every page.*(?:visually|vision)/is);
    const qaRecord = {
      schema_version: 1,
      artifact: pdf,
      pages,
      rendered_pages: images.length,
      automated_checks: { docx_built: true, pdf_exists: true, pages_positive: true, rendered_images_nonzero: true, no_placeholders: true, no_long_dashes: true, no_hyperlinks: true },
      human_visual_inspection: "required",
      human_visual_inspection_complete: false,
    };
    assert.equal(qaRecord.human_visual_inspection, "required");
    assert.equal(qaRecord.human_visual_inspection_complete, false);
    assert.equal(qaRecord.rendered_pages, qaRecord.pages);
    const validator = path.join(root, "skills/recruiter/scripts/validate-artifact-qa.mjs");
    const pageChecks = { no_clipping: true, no_overlap: true, no_orphaned_content: true, bullets_intact: true, logo_layout_ok: true, privacy_ok: true, page_breaks_natural: true };
    const automatedOnly = { artifact: pdf, expected_page_count: pages, reviewer: "automated-harness", inspected_at: "2026-09-04T00:00:00Z", human_visual_inspection_complete: false, pages: Array.from({ length: pages }, (_, index) => ({ page: index + 1, ...pageChecks })) };
    const automatedInput = path.join(temporary, "automated-only-qa.json");
    await writeFile(automatedInput, JSON.stringify(automatedOnly), "utf8");
    const rejected = spawnSync("node", [validator, automatedInput], { encoding: "utf8" });
    assert.notEqual(rejected.status, 0, "automated-only reference QA must be rejected");
    // This is a contract fixture for the separately completed human inspection, not an automated visual claim.
    const completedInput = path.join(temporary, "completed-human-qa.json");
    await writeFile(completedInput, JSON.stringify({ ...automatedOnly, reviewer: "Synthetic Human Reviewer", human_visual_inspection_complete: true }), "utf8");
    const accepted = spawnSync("node", [validator, completedInput], { encoding: "utf8" });
    assert.equal(accepted.status, 0, accepted.stderr || accepted.stdout);
  } finally {
    if (process.env.RETAIN_REFERENCE_QA !== "1") await rm(temporary, { recursive: true, force: true });
    else console.error(`RETAIN_REFERENCE_QA=${temporary}`);
  }
});
