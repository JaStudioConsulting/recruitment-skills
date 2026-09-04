#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";

function fail(message) {
  console.error(`artifact QA rejected: ${message}`);
  process.exitCode = 1;
}

const input = process.argv[2];
if (!input) {
  fail("usage: validate-artifact-qa.mjs <qa-record.json>");
} else {
  try {
    const qa = JSON.parse(await readFile(input, "utf8"));
    const requiredChecks = ["no_clipping", "no_overlap", "no_orphaned_content", "bullets_intact", "logo_layout_ok", "privacy_ok", "page_breaks_natural"];
    if (!pathIsAbsolute(qa.artifact)) throw new Error("artifact must be an absolute PDF path");
    if (!qa.artifact.toLowerCase().endsWith(".pdf") || !existsSync(qa.artifact) || statSync(qa.artifact).size === 0) throw new Error("artifact PDF must exist and be non-empty");
    if (!Number.isInteger(qa.expected_page_count) || qa.expected_page_count < 1) throw new Error("expected_page_count must be a positive integer");
    if (typeof qa.reviewer !== "string" || !qa.reviewer.trim()) throw new Error("reviewer is required");
    if (typeof qa.inspected_at !== "string" || !qa.inspected_at.trim()) throw new Error("inspected_at is required");
    if (qa.human_visual_inspection_complete !== true) throw new Error("human_visual_inspection_complete must be true");
    if (!Array.isArray(qa.pages) || qa.pages.length !== qa.expected_page_count) throw new Error("pages must contain exactly one record per expected page");
    const info = spawnSync("pdfinfo", [qa.artifact], { encoding: "utf8" });
    if (info.status !== 0) throw new Error(`pdfinfo failed: ${info.stderr.trim()}`);
    const actual = Number(info.stdout.match(/^Pages:\s+(\d+)/m)?.[1] || 0);
    if (actual !== qa.expected_page_count) throw new Error(`expected ${qa.expected_page_count} pages but PDF has ${actual}`);
    const numbers = qa.pages.map((page) => page?.page);
    if (new Set(numbers).size !== qa.expected_page_count || numbers.some((page) => !Number.isInteger(page) || page < 1 || page > qa.expected_page_count)) throw new Error("page records must cover each page 1..N exactly once");
    for (const page of qa.pages) for (const check of requiredChecks) if (page?.[check] !== true) throw new Error(`page ${page?.page || "?"} failed or omitted ${check}`);
    console.log(`validated artifact QA: ${qa.artifact} (${actual} pages) reviewed by ${qa.reviewer}`);
  } catch (error) {
    fail(error.message);
  }
}

function pathIsAbsolute(value) {
  return typeof value === "string" && (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value));
}
