import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const contractPath = new URL("../references/leads-contract.json", import.meta.url);
export const contract = JSON.parse(readFileSync(contractPath, "utf8"));

const fail = message => { throw new Error(message); };
const nonempty = value => typeof value === "string" && value.trim().length > 0;
const normalized = value => String(value || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

export function sheetDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) fail("date must be YYYY-MM-DD");
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) fail("date is invalid");
  return value;
}

export function canonicalUrl(value) {
  if (!nonempty(value)) return "";
  try {
    const url = new URL(value);
    url.hash = "";
    for (const parameter of [...url.searchParams.keys()]) if (/^(utm_|source$|ref$|trk$)/i.test(parameter)) url.searchParams.delete(parameter);
    return url.toString().replace(/\/$/, "");
  } catch { fail("invalid URL"); }
}

function host(value) {
  if (!nonempty(value)) return "";
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

export function companyKey(lead) {
  const domain = host(lead.company_url);
  return domain ? `domain:${domain}` : `name:${normalized(lead.company_name)}`;
}

export function jobKey(lead, job) {
  const url = canonicalUrl(job.job_url || job.source_url || "");
  return url ? `${companyKey(lead)}|url:${url}` : `${companyKey(lead)}|job:${normalized(job.job_title)}|location:${normalized(job.job_location || lead.company_location)}`;
}

function ensureHeaders(headers) {
  if (!Array.isArray(headers) || headers.length !== contract.headers.length || contract.headers.some(header => !headers.includes(header))) fail("Leads headers do not match the approved contract");
}

function ensureConfig(snapshot, config) {
  if (!config?.leads || config.leads.tab !== contract.tab) fail("private Leads configuration is missing or invalid");
  if (snapshot.workbook_id !== config.workbook_id || snapshot.title !== config.workbook_title || snapshot.sheet_id !== config.leads.sheet_id || snapshot.tab !== config.leads.tab) fail("live Leads target does not match private configuration");
}

function valueObject(row, headers) {
  if (!Array.isArray(row.values) || row.values.length !== headers.length) fail(`row ${row.row_number || "?"} does not match live headers`);
  return Object.fromEntries(headers.map((header, index) => [header, row.values[index] ?? ""]));
}

function indexExisting(rows, headers) {
  const companies = new Map();
  let currentCompany;
  for (const row of rows || []) {
    const values = valueObject(row, headers);
    if (nonempty(values.Company)) {
      currentCompany = {row_number: row.row_number, values, links: row.links || {}, jobs: []};
      const key = companyKey({company_name: values.Company, company_url: currentCompany.links.Company || ""});
      const entries = companies.get(key) || [];
      entries.push(currentCompany);
      companies.set(key, entries);
    } else if (currentCompany && nonempty(values["Status / Job"]) && values.Posted === contract.job_row.posted) {
      currentCompany.jobs.push({row_number: row.row_number, values, links: row.links || {}});
    }
  }
  return companies;
}

function rowValues(values) { return contract.headers.map(header => values[header] ?? ""); }

function required(condition, message) { if (!condition) fail(message); }

function validateLead(lead, checkedOn, dateAdded) {
  required(lead && typeof lead === "object", "lead must be an object");
  required(nonempty(lead.company_name), "company_name is required");
  if (nonempty(lead.company_url)) canonicalUrl(lead.company_url);
  required(contract.verification_results.includes(lead.verification_result), "verification_result is invalid");
  required(lead.company_source && nonempty(lead.company_source.source_name) && nonempty(lead.company_source.source_url), "company_source name and URL are required");
  canonicalUrl(lead.company_source.source_url);
  sheetDate(checkedOn); sheetDate(dateAdded);
  const jobs = lead.jobs || [];
  required(Array.isArray(jobs), "jobs must be an array");
  if (lead.verification_result === "current_job_confirmed") required(jobs.length > 0, "current_job_confirmed requires at least one job");
  if (lead.verification_result === "no_current_job_found") required(jobs.length === 0, "no_current_job_found cannot include jobs");
  for (const job of jobs) {
    required(nonempty(job.job_title), "job_title is required");
    required(nonempty(job.source_name) && nonempty(job.source_url), "job source name and URL are required");
    canonicalUrl(job.source_url);
    if (nonempty(job.job_url)) canonicalUrl(job.job_url);
    required(contract.employment_types.includes(job.employment_type || "Unknown"), "employment_type is invalid");
  }
}

function companyRow(lead, status, checkedOn, dateAdded) {
  const contact = lead.primary_contact || {};
  const contactText = nonempty(contact.name) ? [contact.name, contact.title].filter(nonempty).join(" — ") : "";
  return {
    values: rowValues({
      Company: lead.company_name,
      "Status / Job": status,
      Location: lead.company_location || "",
      "Primary Contact": contactText,
      Posted: `${contract.company_row.posted_prefix}${checkedOn}`,
      "Date Added": dateAdded,
      Source: contract.company_row.source,
      "Verification / Notes": lead.company_note || "",
      Checked: checkedOn
    }),
    links: Object.fromEntries(Object.entries({Company: lead.company_url, "Primary Contact": contact.profile_url}).filter(([, value]) => nonempty(value)))
  };
}

function jobRow(lead, job, checkedOn, dateAdded) {
  return {
    values: rowValues({
      "Status / Job": job.job_title,
      Location: job.job_location || lead.company_location || "",
      Posted: contract.job_row.posted,
      Compensation: job.compensation_exact || "Not listed",
      "Employment Type": job.employment_type || "Unknown",
      "Date Added": dateAdded,
      Source: job.source_name,
      "Verification / Notes": job.evidence_note || job.source_url,
      Checked: checkedOn
    }),
    links: nonempty(job.job_url) ? {"Status / Job": job.job_url} : {}
  };
}

function currentJobs(existing, lead) {
  const found = new Map();
  for (const job of existing.jobs) {
    const pseudo = {job_title: job.values["Status / Job"], job_location: job.values.Location, job_url: job.links["Status / Job"] || ""};
    found.set(jobKey(lead, pseudo), job);
  }
  return found;
}

function companyChanges(existing, desired) {
  const changes = [];
  for (const header of ["Status / Job", "Location", "Posted", "Source", "Checked"]) {
    if (existing.values[header] !== desired.values[contract.headers.indexOf(header)]) changes.push({header, value: desired.values[contract.headers.indexOf(header)]});
  }
  return changes;
}

export function plan(input, config) {
  if (!input || !["preview", "import"].includes(input.mode)) fail("mode must be preview or import");
  if (input.mode === "import" && input.authorization?.operation !== "import_leads") fail("explicit Leads import authorization is required");
  const snapshot = input.snapshot || {};
  ensureConfig(snapshot, config); ensureHeaders(snapshot.headers);
  const checkedOn = sheetDate(input.checked_on);
  const dateAdded = sheetDate(input.date_added || checkedOn);
  const leads = input.leads || [];
  required(Array.isArray(leads) && leads.length > 0, "at least one lead is required");
  const existing = indexExisting(snapshot.rows || [], snapshot.headers);
  const seenCompanies = new Set();
  const actions = [];
  for (const lead of leads) {
    try {
      validateLead(lead, checkedOn, dateAdded);
      const key = companyKey(lead);
      if (seenCompanies.has(key)) fail("duplicate company in intake");
      seenCompanies.add(key);
      if (lead.verification_result === "needs_review") fail("lead needs review before import");
      const matches = existing.get(key) || [];
      if (matches.length > 1) fail("multiple matching company rows require manual reconciliation");
      const matched = matches[0];
      const status = lead.verification_result === "current_job_confirmed" ? "Active" : matched?.values["Status / Job"] === "Active" ? "Needs Recheck" : "N/A";
      const parent = companyRow(lead, status, checkedOn, dateAdded);
      const rows = [];
      if (!matched) rows.push({kind: "company", ...parent});
      else {
        const changes = companyChanges(matched, parent);
        if (changes.length) rows.push({kind: "company_update", row_number: matched.row_number, changes});
      }
      const current = matched ? currentJobs(matched, lead) : new Map();
      for (const job of lead.jobs || []) {
        if (!current.has(jobKey(lead, job))) rows.push({kind: "job", ...jobRow(lead, job, checkedOn, dateAdded)});
      }
      actions.push({status: rows.length ? (matched ? "update" : "new") : "skip", company_key: key, company_name: lead.company_name, rows});
    } catch (error) {
      actions.push({status: "hold", company_name: lead?.company_name || "", reason: error.message, rows: []});
    }
  }
  const counts = {new: 0, update: 0, skip: 0, hold: 0};
  for (const action of actions) counts[action.status]++;
  return {mode: input.mode, writable: input.mode === "import", checked_on: checkedOn, date_added: dateAdded, counts, actions};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [inputPath, configPath] = process.argv.slice(2);
  if (!inputPath || !configPath) fail("usage: leads.mjs plan INPUT.json CONFIG.json");
  const input = JSON.parse(readFileSync(inputPath, "utf8"));
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  console.log(JSON.stringify(plan(input, config), null, 2));
}
