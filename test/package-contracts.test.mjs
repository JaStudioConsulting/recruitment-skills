import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skills = path.join(root, "skills");
const fixture = path.join(root, "tests", "fixtures", "synthetic-after-call.json");
const exists = (p) => existsSync(p) && statSync(p).isFile();

function routeTarget(token, source) {
  const clean = token.replace(/[.,;:)]+$/, "").split("#")[0];
  if (clean.startsWith("skills/")) return path.join(root, clean);
  if (clean.startsWith("recruiter/") || clean.startsWith("tracker-manager/")) return path.join(skills, clean);
  if (/^(modules|references|scripts|templates|assets)\//.test(clean)) {
    const sourceRelative = path.relative(skills, source);
    const sourceDir = path.basename(path.dirname(source)) === "references" ? path.dirname(path.dirname(source)) : path.dirname(source);
    const base = clean.startsWith("modules/") ? path.join(skills, "recruiter") : (sourceRelative.startsWith("recruiter/") || sourceRelative.startsWith("tracker-manager/") ? sourceDir : path.join(skills, "recruiter"));
    return path.join(base, clean);
  }
  return null;
}

async function backtickRouteProblems() {
  const problems = [];
  async function walk(dir) {
    for (const name of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, name.name);
      if (name.isDirectory()) await walk(file);
      else if (name.isFile() && name.name.endsWith(".md")) {
        const content = await readFile(file, "utf8");
        for (const match of content.matchAll(/`([^`\n]+)`/g)) {
          const token = match[1].trim();
          if (!token.includes("/") || /[<>]/.test(token) || !/\.(?:md|json|docx|py|mjs|js|yml|yaml|html)(?:#.*)?$/i.test(token)) continue;
          if (/modules\/[^/]+\/SKILL\.md$/i.test(token)) problems.push(`stale root skill route: ${path.relative(root, file)} -> ${token}`);
          const target = routeTarget(token, file);
          if (target && !exists(target)) problems.push(`missing route: ${path.relative(root, file)} -> ${token}`);
        }
        if (path.relative(root, file).startsWith("skills/recruiter/modules/recruiting-hr/") && /^\s*\/[a-z][a-z0-9-]*(?:\s|$)/im.test(content)) problems.push(`standalone slash-command marker: ${path.relative(root, file)}`);
      }
    }
  }
  await walk(skills);
  return problems;
}

const sourcingColumns = ["Full Name", "Title", "Company", "Location", "LinkedIn", "Eligibility", "Evidence Status", "Fit/Priority", "Confidence", "Evidence", "Gaps/Risks", "Notes"];
const allowedStatuses = new Set(["Verified", "Unconfirmed", "Conflicting", "Outdated"]);
const allowedEligibility = new Set(["Eligible", "Excluded"]);
function assertSourcingRows(rows) {
  const seen = new Set();
  for (const row of rows) {
    assert.ok(allowedEligibility.has(row.eligibility), `eligibility must be Eligible or Excluded`);
    assert.ok(allowedStatuses.has(row.evidence_status), `evidence status must be one of ${[...allowedStatuses].join(", ")}`);
    assert.match(row.linkedin || "", /^https:\/\/[a-z0-9.-]+\/.+/i, "direct evidence URL is required");
    const header = [row.full_name, row.title, row.company].map((x) => String(x || "").toLowerCase()).join("|");
    assert.notEqual(header, "full name|title|company", "repeated header row is not data");
    const key = row.linkedin?.trim().toLowerCase() || `${row.full_name}|${row.company}`.toLowerCase();
    assert.ok(!seen.has(key), `duplicate sourcing row: ${key}`);
    seen.add(key);
  }
  assert.deepEqual(sourcingColumns, ["Full Name", "Title", "Company", "Location", "LinkedIn", "Eligibility", "Evidence Status", "Fit/Priority", "Confidence", "Evidence", "Gaps/Risks", "Notes"]);
  return rows.length;
}

function assertFullPackage({ drafts, pdf, attachment }) {
  assert.equal(drafts.length, 1, "exactly one draft is required");
  assert.match(drafts[0].body.trimEnd(), /CV attached\.$/, "draft body must end with CV attached.");
  assert.ok(exists(pdf) && statSync(pdf).size > 0, "finished PDF must exist");
  assert.ok(["verified", "unavailable", "ready_to_attach"].includes(attachment?.state), "attachment state must be verified, unavailable, or ready_to_attach");
  if (attachment.state !== "verified") assert.ok(attachment.reason, "non-verified attachment state needs an explicit reason");
}

test("all 24 manifest routes and internal backtick routes resolve", async () => {
  const manifest = JSON.parse(await readFile(path.join(skills, "capabilities.json"), "utf8"));
  assert.equal(manifest.capabilities.length, 24);
  for (const capability of manifest.capabilities) {
    assert.match(capability.path, /\/GUIDE\.md$/);
    assert.ok(exists(path.join(skills, capability.path)), capability.path);
  }
  assert.deepEqual(await backtickRouteProblems(), []);
});

test("recruiter routes knowledge governance and provenance records", async () => {
  const router = await readFile(path.join(skills, "recruiter/SKILL.md"), "utf8");
  assert.match(router, /docs\/knowledge-architecture\.md/);
  const knowledge = await readFile(path.join(root, "docs/knowledge-architecture.md"), "utf8");
  assert.match(knowledge, /classify it before reuse/i);
  const provenance = await readFile(path.join(root, "docs/consolidation/PROVENANCE.md"), "utf8");
  assert.match(provenance, /2026-09-04 selective legacy consolidation/);
  assert.match(provenance, /recruiter-consolidation-20260904T173500-0400/);
  assert.match(provenance, /direct-send and reject scripts/i);
});

test("capability-guide local Markdown links resolve", async () => {
  const problems = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile() && entry.name.endsWith(".md")) {
        const content = await readFile(file, "utf8");
        for (const match of content.matchAll(/\[[^\]]+\]\(([^)\s]+)(?:\s+[^)]*)?\)/g)) {
          const target = match[1];
          if (/^(?:https?:|mailto:|#)/i.test(target)) continue;
          const resolved = path.resolve(path.dirname(file), target.split("#")[0]);
          if (!exists(resolved)) problems.push(`${path.relative(root, file)} -> ${target}`);
        }
      }
    }
  }
  await walk(path.join(skills, "recruiter"));
  assert.deepEqual(problems, []);
});

test("canonical template contracts exist and preserve the field-boundary rules", async () => {
  const contracts = [
    "docs/templates/README.md",
    "docs/templates/submission-data-contract.md",
    "docs/templates/branded-resume-contract.md",
    "docs/templates/presentation-email-contract.md",
  ];
  for (const relative of contracts) assert.ok(exists(path.join(root, relative)), relative);
  const mapping = await readFile(path.join(root, "docs/templates/submission-data-contract.md"), "utf8");
  assert.match(mapping, /reason_for_exploring/);
  assert.match(mapping, /reason_for_leaving/);
  assert.match(mapping, /work_status/);
  assert.match(mapping, /required external submission field/i);
  assert.match(mapping, /never a substitute/i);
  assert.match(mapping, /never infer/i);
  const email = await readFile(path.join(root, "docs/templates/presentation-email-contract.md"), "utf8");
  assert.match(email, /one unsent draft/i);
  assert.match(email, /CV attached\./);
  assert.match(email, /no em\/en dashes/i);
  assert.match(email, /Reason for Leaving/);
  assert.match(email, /Work Status/);
  assert.match(email, /must never substitute/i);
  assert.match(email, /Clarifier Note/);
  assert.match(email, /never pad/i);
});

test("consolidated non-mutating guidance is routed and guarded", async () => {
  const read = async (relative) => readFile(path.join(root, relative), "utf8");
  const recovery = await read("skills/recruiter/references/call-recording-recovery.md");
  assert.match(recovery, /raw per-call transcript JSON/i);
  assert.match(recovery, /nonces/i);
  const prospect = await read("skills/recruiter/modules/loxo/references/prospect-campaign-learning.md");
  assert.match(prospect, /Sent mail read-only/i);
  assert.match(prospect, /Sent state does not prove/i);
  const reverse = await read("skills/recruiter/modules/candidate-match-engine/references/reverse-match-edge-rules.md");
  assert.match(reverse, /salary floor from target/i);
  assert.match(reverse, /staffing agencies/i);
  const writeUp = await read("skills/recruiter/modules/write-up/GUIDE.md");
  assert.match(writeUp, /MPC filename\/privacy/i);
  assert.match(writeUp, /Work Status:/);
  assert.match(writeUp, /Reason for Leaving:/);
  assert.doesNotMatch(writeUp, /^Reason for Exploring:/m);
  const emailTemplate = await read("skills/recruiter/modules/write-up/assets/submission_email_template.html");
  assert.match(emailTemplate, /<b>Work Status:<\/b>/);
  assert.match(emailTemplate, /<b>Reason for Leaving:<\/b>/);
  assert.doesNotMatch(emailTemplate, /<b>Reason for Exploring:<\/b>/);
  const router = await read("skills/recruiter/SKILL.md");
  assert.match(router, /references\/call-recording-recovery\.md/);
  const rules = await read("skills/_JA-RULES.md");
  assert.match(rules, /external `Reason for Leaving`/);
  assert.match(rules, /Work Status/);
  const style = await read("skills/recruiter/modules/ja-writer/references/ja-style.md");
  assert.match(style, /Reason for Leaving is the LAST label line/);
  assert.match(style, /Reason for Exploring.*internal source capture only/);
});

test("every manifest capability exposes its capability-specific contract", async () => {
  const contracts = {
    "applicant-screening": [/Score each must-have 0[–-]3/i, /Score on job-related criteria only/i],
    brandedresume: [/validate-artifact-qa\.mjs/i, /Title must match/i],
    "candidate-defense": [/Never fabricate titles, scope, comp/i, /Stop after each mode/i],
    "candidate-match-engine": [/Hard Gates.*Run First/is, /Never assign Strong Fit unless every must-have/i],
    "complete-reference-check": [/reference-check-template\.docx/i, /every page.*human\/vision/is],
    "cover-letter": [/Use concrete evidence/i, /why \*this\* company/i],
    "ja-candidate-vetting": [/Use only proven facts/i, /average must be 4\.0 or higher/i],
    "ja-writer": [/Never invent.*salary, availability/is, /do not type a signature/i],
    "job-loxo": [/obtain Ja's explicit approval before the first Loxo write/i, /status.*published.*separately/is],
    legislator: [/explicitly types a manual override/i, /Do not approve partial compliance as complete/i],
    "linkedin-posts": [/Publish-Ready Copy/i, /Short feed posts.*Login-gated/is],
    loxo: [/read-only and draft-only/i, /loxo-candidate-fit-review\.md/i],
    "loxo-automation": [/separate named authorization/i, /WAIT for approval/i],
    "loxo-readonly-candidate-dashboard": [/strictly read-only/i, /candidate\.job\.id/i],
    "offer-letter": [/Required Information/i, /ask before drafting/i],
    "interview-prep-material": [/one exact company and one exact role/i, /approved_for_candidate_use/i, /validate_interview_prep_material\.py/i, /page-by-page visual inspection/i],
    "recruiting-hr": [/\$recruiter/i, /No external send/i],
    sourcing: [/Verified.*Unconfirmed.*Conflicting.*Outdated/is, /Stop before outbound action/i],
    tracker: [/Tracker Manager/i, /Recruiter must not write to the workbook directly/i],
    "tttg-candidate-submission": [/Current delivery rule: one Gmail draft only/i, /Never invent facts/i],
    "tttg-resume-engine-workspace": [/evaluation evidence/i, /not a production builder/i],
    vet: [/Staged workflow.*Stop after each mode/is, /Never invent, assume, or include/i],
    "web-sourcing": [/5 is a ceiling, not a quota/i, /Never invent or guess a value/i],
    "write-up": [/exactly one unsent draft/i, /If anything is missing, STOP and ask Ja/i]
  };
  const manifest = JSON.parse(await readFile(path.join(skills, "capabilities.json"), "utf8"));
  assert.equal(Object.keys(contracts).length, manifest.capabilities.length);
  for (const capability of manifest.capabilities) {
    const guide = await readFile(path.join(skills, capability.path), "utf8");
    for (const contract of contracts[capability.id] || []) assert.match(guide, contract, `${capability.id} contract missing: ${contract}`);
  }
});

function runPython(script, args) {
  return spawnSync("python3", [script, ...args], { encoding: "utf8" });
}

test("sourcing and web-sourcing CLIs export exact synthetic contracts", async () => {
  const dir = await mkdtemp(path.join(root, ".tmp-sourcing-contract-"));
  const rows = [
    { full_name: "Synthetic Candidate A", title: "Welder", company: "Synthetic Co", location: "Toronto", linkedin: "https://linkedin.com/in/synthetic-a", eligibility: "Eligible", evidence_status: "Verified", evidence: "Synthetic public evidence", fit_priority: "High", confidence: "High" },
    { full_name: "Synthetic Candidate B", title: "Millwright", company: "Synthetic Co", location: "Toronto", linkedin: "https://linkedin.com/in/synthetic-b", eligibility: "Eligible", evidence_status: "Unconfirmed", evidence: "Synthetic public evidence", fit_priority: "Review", confidence: "Medium" },
    { full_name: "Full Name", title: "Title", company: "Company", eligibility: "Eligible", evidence_status: "Verified", linkedin: "https://linkedin.com/in/header" },
    { full_name: "Synthetic Candidate A", title: "Welder", company: "Synthetic Co", linkedin: "https://linkedin.com/in/synthetic-a", eligibility: "Eligible", evidence_status: "Verified" },
  ];
  try {
    const input = path.join(dir, "rows.json");
    await writeFile(input, JSON.stringify(rows), "utf8");
    const sourcing = runPython(path.join(skills, "recruiter/modules/sourcing/scripts/sourcing_rows.py"), ["--data", input, "--kind", "candidate", "--format", "generic", "--label", "synthetic", "--outdir", dir]);
    assert.equal(sourcing.status, 0, sourcing.stderr);
    const summary = JSON.parse(sourcing.stdout);
    assert.deepEqual({ input_rows: summary.input_rows, exported_rows: summary.exported_rows, headers_removed: summary.headers_removed, duplicates_removed: summary.duplicates_removed }, { input_rows: 4, exported_rows: 2, headers_removed: 1, duplicates_removed: 1 });
    const csv = await readFile(summary.output, "utf8");
    assert.deepEqual(csv.split(/\r?\n/)[0].replace(/^\uFEFF/, "").split(","), sourcingColumns);
    assert.equal(csv.trimEnd().split(/\r?\n/).length, 3);
    assert.equal(assertSourcingRows(rows.slice(0, 2)), 2);
    assert.throws(() => assertSourcingRows([{ ...rows[0], evidence_status: "Eligible" }]), /evidence status/);
    assert.throws(() => assertSourcingRows([{ ...rows[0], linkedin: "" }]), /evidence URL/);
    assert.throws(() => assertSourcingRows([rows[0], rows[3]]), /duplicate/);
    assert.throws(() => assertSourcingRows([rows[2]]), /header/);
    for (const invalid of [{ ...rows[0], evidence_status: "Eligible" }, { ...rows[0], linkedin: "" }]) {
      const invalidInput = path.join(dir, "invalid.json");
      await writeFile(invalidInput, JSON.stringify([invalid]), "utf8");
      const failed = runPython(path.join(skills, "recruiter/modules/sourcing/scripts/sourcing_rows.py"), ["--data", invalidInput, "--kind", "candidate", "--format", "generic", "--label", "invalid", "--outdir", dir]);
      assert.notEqual(failed.status, 0, "invalid evidence rows must fail the actual sourcing CLI");
    }

    const webInput = path.join(dir, "web-rows.json");
    await writeFile(webInput, JSON.stringify([{ full_name: "Synthetic Prospect", company: "Synthetic Co", tenure: "2 years", linkedin_link: "https://linkedin.com/in/synthetic-prospect", contact_info: "synthetic@example.invalid", eligibility: "Eligible", evidence_status: "Verified" }]), "utf8");
    const web = runPython(path.join(skills, "recruiter/modules/web-sourcing/scripts/build_csv.py"), ["--role", "synthetic-role", "--data", webInput, "--outdir", dir]);
    assert.equal(web.status, 0, web.stderr);
    const webSummary = JSON.parse(web.stdout);
    assert.deepEqual({ input_rows: webSummary.input_rows, exported_rows: webSummary.exported_rows, headers_removed: webSummary.headers_removed, duplicates_removed: webSummary.duplicates_removed }, { input_rows: 1, exported_rows: 1, headers_removed: 0, duplicates_removed: 0 });
    const webOutput = webSummary.output;
    assert.ok(exists(webOutput));
    assert.deepEqual((await readFile(webOutput, "utf8")).split(/\r?\n/)[0].replace(/^\uFEFF/, "").split(","), ["Full Name", "Company", "Tenure", "LinkedIn Link", "Contact Info", "Eligibility", "Evidence Status"]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("sourcing contract rejects invalid evidence rows before export", () => {
  const rows = [
    { full_name: "Synthetic Candidate A", title: "Welder", company: "Synthetic Co", linkedin: "https://linkedin.com/in/synthetic-a", eligibility: "Eligible", evidence_status: "Verified" },
  ];
  assert.equal(assertSourcingRows(rows), 1);
    assert.throws(() => assertSourcingRows([{ ...rows[0], evidence_status: "Eligible" }]), /evidence status/);
    assert.throws(() => assertSourcingRows([{ ...rows[0], linkedin: "" }]), /evidence URL/);
});

test("full-package contract requires one draft, finished PDF, and explicit attachment state", async () => {
  const dir = await mkdtemp(path.join(root, ".tmp-package-contract-"));
  try {
    const pdf = path.join(dir, "Synthetic Candidate.pdf");
    await writeFile(pdf, "%PDF-1.4 synthetic\n", "ascii");
    assertFullPackage({ drafts: [{ body: "Hello team,\nCV attached." }], pdf, attachment: { state: "ready_to_attach", reason: "draft tools cannot carry attachments" } });
    assert.throws(() => assertFullPackage({ drafts: [], pdf, attachment: { state: "verified" } }), /exactly one/);
    assert.throws(() => assertFullPackage({ drafts: [{ body: "Hello team" }], pdf, attachment: { state: "verified" } }), /CV attached/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("synthetic interview prep material builds and passes its automated release validator", async () => {
  const dir = await mkdtemp(path.join(root, ".tmp-interview-prep-material-"));
  try {
    const logo = path.join(skills, "recruiter/modules/brandedresume/assets/tttg_logo.png");
    const dataPath = path.join(dir, "brief-content.json");
    const pdf = path.join(dir, "Synthetic_Interview_Prep_Material.pdf");
    const bounds = path.join(dir, "layout-bounds.json");
    const sources = path.join(dir, "source-ledger.md");
    const assets = path.join(dir, "asset-ledger.md");
    const data = {
      document: {
        company: "Synthetic Manufacturing Ltd.", role: "Machine Reliability Manager", location: "Hamilton, Ontario",
        title: "Synthetic Manufacturing Machine Reliability Manager Interview Prep Material",
        subject: "Company, role, work context and location overview", author: "Top Tier Talent Group", footer: "Top Tier Talent Group"
      },
      source_control: {
        as_of: "2026-09-04", publication_status: "approved_for_candidate_use",
        role_status_evidence: "Synthetic recruiter confirmation dated 2026-09-04",
        authoritative_sources: ["Synthetic current job description", "Synthetic official company profile"]
      },
      privacy: { banned_terms: ["Sample Candidate", "Private Interviewer"] },
      cover: {
        eyebrow: "The company", headline: "Industrial reliability with visible plant impact.",
        deck: "An established manufacturer, a practical leadership mandate, and a role connected directly to safe production.",
        image: logo, image_caption: "Synthetic visual used only for automated package testing.",
        sections: [
          { title: "A focused manufacturing business", body: "Synthetic Manufacturing produces engineered components for regulated industrial customers. The operation combines machining, assembly, maintenance, quality, and supply chain teams at one established Canadian site. Customer requirements make equipment condition, process control, and dependable delivery part of daily plant decisions." },
          { title: "Why reliability matters now", body: "The company is strengthening the system used to plan preventive work, respond to breakdowns, control contractors, and learn from recurring failures. The role connects technical judgment with team leadership so maintenance effort supports safety, product quality, schedule stability, and responsible use of capital." }
        ]
      },
      role: {
        eyebrow: "The role", headline: "Machine Reliability Manager", intro: "Lead the people, systems, and practical decisions that keep critical production equipment ready for work.",
        image: logo, image_caption: "Synthetic concept panel for automated validation only.",
        at_a_glance: [
          { label: "Work setting", value: "Plant-based leadership" },
          { label: "Primary focus", value: "Reliability and maintenance" },
          { label: "Key partners", value: "Operations and Engineering" }
        ],
        cards: [
          { title: "The mandate", body: "Set a clear maintenance rhythm for critical assets, people, contractors, and spare parts. Balance immediate production needs with work that removes repeat failure." },
          { title: "The actual work", body: "Review equipment risk, plan preventive tasks, coach the team through difficult faults, coordinate shutdown activity, and make repair or replacement recommendations." },
          { title: "What success means", body: "Production sees fewer avoidable interruptions, overdue work becomes visible and controlled, and failure learning changes maintenance plans, parts strategy, and operating practice." },
          { title: "How the role works", body: "Partner daily with Operations, Engineering, Quality, and Safety. Give trades and vendors clear priorities, then communicate risk, timing, cost, and follow-up to plant leadership." }
        ],
        note: "The final scope, team size, schedule, compensation, and available capital must come from the current confirmed role source."
      },
      context: {
        eyebrow: "The work", headline: "A system built around the production floor.",
        intro: "The strongest reliability leaders connect planning, technical depth, and disciplined follow-through.",
        image: logo, image_caption: "Synthetic operating-context visual used only for package testing.",
        columns: [
          { title: "From signal to action", body: "Use work-order history, operator observations, inspections, and breakdown evidence to rank asset risk. Turn the ranking into scheduled work with named ownership, parts readiness, safe execution, and a documented return to service." },
          { title: "From repair to learning", body: "A repair closes the immediate issue. Reliability work asks why it happened, whether the same pattern exists elsewhere, and what should change in preventive tasks, condition checks, training, spares, or equipment design." }
        ],
        note_title: "Questions worth exploring", note_body: "A useful first conversation should confirm the equipment mix, maintenance team, shift coverage, planning system, contractor model, major recurring losses, and which decisions this manager can make directly. Those facts determine whether the mandate matches the candidate's strongest experience."
      },
      decision: {
        eyebrow: "The decision", headline: "Assess the work and the practical fit.",
        intro: "Credible interview prep material helps a candidate evaluate both professional scope and everyday realities.",
        images: [
          { path: logo, caption: "Synthetic city-context visual used only for automated testing." },
          { path: logo, caption: "Synthetic regional-context visual used only for automated testing." }
        ],
        sections: [
          { title: "Understand the operating challenge", body: "The role should be judged on the assets, failure patterns, team capability, planning maturity, and leadership support behind the title. A plant visit and direct discussion can show where the manager would spend time and which results matter first." },
          { title: "Make the practical decision", body: "Confirm the work location, expected schedule, travel, compensation, and any relocation support through the recruiter. Compare those facts with the role's authority, learning opportunity, and connection to plant performance before deciding on next steps." }
        ],
        cta_title: "Explore the Machine Reliability Manager opportunity.",
        cta_body: "Speak with Top Tier Talent Group about the role, company, and next conversation."
      }
    };
    await writeFile(dataPath, JSON.stringify(data), "utf8");
    await writeFile(sources, "# Source ledger\n\n- Synthetic current job description, reviewed 2026-09-04.\n- Synthetic official company profile, reviewed 2026-09-04.\n", "utf8");
    await writeFile(assets, "# Asset ledger\n\n- Packaged Top Tier Talent Group synthetic test visual.\n- Used only for deterministic package validation.\n", "utf8");

    const builder = runPython(path.join(skills, "recruiter/modules/interview-prep-material/scripts/build_interview_prep_material.py"), ["--data", dataPath, "--out", pdf, "--bounds", bounds]);
    assert.equal(builder.status, 0, builder.stderr || builder.stdout);
    assert.ok(exists(pdf) && statSync(pdf).size > 0);
    assert.ok(exists(bounds));
    const validator = runPython(path.join(skills, "recruiter/modules/interview-prep-material/scripts/validate_interview_prep_material.py"), ["--pdf", pdf, "--data", dataPath, "--bounds", bounds, "--sources", sources, "--assets", assets]);
    assert.equal(validator.status, 0, validator.stderr || validator.stdout);
    const summary = JSON.parse(validator.stdout);
    assert.equal(summary.pages, 4);
    assert.equal(summary.text_overlaps, 0);
    assert.equal(summary.publication_status, "approved_for_candidate_use");
  } finally {
    if (process.env.KEEP_SYNTHETIC_INTERVIEW_PREP_MATERIAL === "1") console.log(`synthetic interview prep material retained at ${dir}`);
    else await rm(dir, { recursive: true, force: true });
  }
});

test("reference contract documents existing final PDF, intermediate DOCX, builder, and template paths", async () => {
  const guide = await readFile(path.join(skills, "recruiter/modules/complete-reference-check/GUIDE.md"), "utf8");
  const contract = await readFile(path.join(skills, "recruiter/modules/complete-reference-check/references/template-contract.md"), "utf8");
  const paths = [
    path.join(skills, "recruiter/modules/brandedresume/scripts/build_resume.py"),
    path.join(skills, "recruiter/modules/complete-reference-check/scripts/build_reference_check.py"),
    path.join(skills, "recruiter/modules/complete-reference-check/assets/reference-check-template.docx"),
    path.join(skills, "recruiter/modules/write-up/assets/submission_email_template.html"),
  ];
  for (const p of paths) assert.ok(exists(p), p);
  assert.match(guide, /intermediate DOCX/i);
  assert.match(contract, /Template: `assets\/reference-check-template\.docx`/);
  assert.match(contract, /Builder: `scripts\/build_reference_check\.py`/);
});

test("synthetic branded resume artifact QA renders every page and records automation separately", async () => {
  const data = JSON.parse(await readFile(fixture, "utf8"));
  const dir = await mkdtemp(path.join(root, ".tmp-resume-contract-"));
  try {
    const input = path.join(dir, "resume.json");
    const output = path.join(dir, "resume.pdf");
    await writeFile(input, JSON.stringify(data.resume), "utf8");
    const result = spawnSync("python3", [path.join(skills, "recruiter/modules/brandedresume/scripts/build_resume.py"), "--data", input, "--out", output, "--engine", "reportlab"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.ok(exists(output) && statSync(output).size > 0);
    const info = spawnSync("pdfinfo", [output], { encoding: "utf8" }).stdout;
    const pages = Number(info.match(/^Pages:\s+(\d+)/m)?.[1] || 0);
    assert.ok(pages > 0);
    const imagePrefix = path.join(dir, "page");
    const render = spawnSync("pdftoppm", ["-png", "-r", "72", output, imagePrefix], { encoding: "utf8" });
    assert.equal(render.status, 0, render.stderr);
    const renderedPages = (await readdir(dir)).filter((name) => /^page-\d+\.png$/.test(name));
    assert.equal(renderedPages.length, pages);
    for (const name of renderedPages) assert.ok(statSync(path.join(dir, name)).size > 0, name);
    const text = spawnSync("pdftotext", [output, "-"], { encoding: "utf8" }).stdout;
    assert.doesNotMatch(text, /\[[^\]]*(?:confirm|tbd|todo|xxx|placeholder|insert|add)[^\]]*\]/i);
    assert.doesNotMatch(text, /—|–|--/);
    assert.equal((await readFile(output)).includes(Buffer.from("/URI")), false, "PDF must not contain hyperlinks");
    const pageQa = { schema_version: 1, artifact: output, pages, rendered_pages: renderedPages.length, automated_checks: { no_placeholders: true, no_long_dashes: true, no_hyperlinks: true, rendered_images_nonzero: true }, human_visual_inspection: "required", human_visual_inspection_complete: false, verified_by: "synthetic-harness" };
    assert.equal(pageQa.schema_version, 1);
    assert.equal(pageQa.pages, pages);
    assert.equal(typeof pageQa.artifact, "string");
    assert.equal(pageQa.rendered_pages, pages);
    assert.deepEqual(Object.keys(pageQa.automated_checks).sort(), ["no_hyperlinks", "no_long_dashes", "no_placeholders", "rendered_images_nonzero"]);
    assert.equal(pageQa.human_visual_inspection, "required");
    assert.equal(pageQa.human_visual_inspection_complete, false);
    const qaInput = path.join(dir, "automated-only-qa.json");
    await writeFile(qaInput, JSON.stringify({ artifact: output, expected_page_count: pages, reviewer: "synthetic-harness", inspected_at: "2026-09-04T00:00:00Z", human_visual_inspection_complete: false, pages: Array.from({ length: pages }, (_, index) => ({ page: index + 1, ...pageQa.automated_checks })) }), "utf8");
    const qaRejected = spawnSync("node", [path.join(skills, "recruiter/scripts/validate-artifact-qa.mjs"), qaInput], { encoding: "utf8" });
    assert.notEqual(qaRejected.status, 0, "automated-only QA must not satisfy the hard gate");
    // Contract fixture only: these booleans model a separate human inspection and do not claim automation proved visual quality.
    const completedInput = path.join(dir, "completed-human-qa.json");
    const completed = { artifact: output, expected_page_count: pages, reviewer: "Synthetic Human Reviewer", inspected_at: "2026-09-04T00:00:00Z", human_visual_inspection_complete: true, pages: Array.from({ length: pages }, (_, index) => ({ page: index + 1, no_clipping: true, no_overlap: true, no_orphaned_content: true, bullets_intact: true, logo_layout_ok: true, privacy_ok: true, page_breaks_natural: true })) };
    await writeFile(completedInput, JSON.stringify(completed), "utf8");
    const qaAccepted = spawnSync("node", [path.join(skills, "recruiter/scripts/validate-artifact-qa.mjs"), completedInput], { encoding: "utf8" });
    assert.equal(qaAccepted.status, 0, qaAccepted.stderr || qaAccepted.stdout);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
