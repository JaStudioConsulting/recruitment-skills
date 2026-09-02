import { readFileSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export const contract = JSON.parse(readFileSync(new URL("../references/contract.json", import.meta.url), "utf8"));
const fail = (message) => { throw new Error(message); };
const clean = (value) => {
  if (typeof value !== "string") fail("text values must be strings");
  const result = value.normalize("NFKC").replace(/\s+/gu, " ").trim();
  if (/\[(?:confirm|insert|tbd)[^\]]*\]|\bTODO\b/i.test(result)) fail("unresolved placeholder");
  return result;
};
export const candidateKey = (name) => clean(name).toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/[\s-]+/g, "-");
export function sheetDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail("date must be YYYY-MM-DD");
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(+date) || date.toISOString().slice(0, 10) !== value) fail("invalid calendar date");
  return (+date - Date.UTC(1899, 11, 30)) / 86400000;
}
export function mapHeaders(headers) {
  if (!Array.isArray(headers) || headers.length !== contract.headers.length || new Set(headers).size !== headers.length || contract.headers.some(h => !headers.includes(h))) fail("live headers differ from the 21-field contract; review schema before writes");
  return Object.fromEntries(headers.map((h, i) => [h, i]));
}
const arrayText = (value) => {
  if (!Array.isArray(value) || value.some(v => !clean(v))) fail("expected nonempty text items");
  return [...new Set(value.map(clean))];
};
export function renderField(header, value) {
  if (header === "License & Certifications") return arrayText(value).join(" | ");
  if (header === "Profile Summary") return arrayText(value).map(v => /[.!?]$/.test(v) ? v : `${v}.`).join(" ");
  if (header === "Additional Notes") {
    if (!value || Array.isArray(value) || typeof value !== "object" || Object.keys(value).some(k => !contract.notes_order.includes(k))) fail("notes must use the fixed note categories");
    return contract.notes_order.filter(k => value[k] !== undefined && clean(value[k])).map(k => `${k}: ${clean(value[k])}`).join(" | ");
  }
  if (header === "Target Compensation / Current Rate") {
    if (!value || Array.isArray(value) || typeof value !== "object" || Object.keys(value).some(k => !["target", "current"].includes(k))) fail("compensation requires target/current keys");
    return ["target", "current"].filter(k => value[k] !== undefined && clean(value[k])).map(k => `${k === "target" ? "Target" : "Current"}: ${clean(value[k])}`).join(" | ");
  }
  return clean(value);
}
function validateReview(event) {
  const review = event.review;
  if (!event.message_id || !event.thread_id || !/^https:\/\/mail\.google\.com\//.test(event.link || "")) fail("exact Gmail IDs and original Gmail link required");
  if (event.kind !== "original_submission") fail("only original sent submission events may be ingested");
  if (!review?.body || !review.attachment_inventory_complete || !review.credentials || !Array.isArray(review.attachments)) fail("body, attachment inventory, and credential review required");
  for (const a of review.attachments) if (!a.id || a.reviewed !== true || a.readable !== true) fail("attachment unchecked or unreadable; hold event");
  if (!event.evidence || !Object.values(event.evidence).some(e => e.kind === "email" && e.reviewed === true)) fail("reviewed original email evidence required");
  for (const a of review.attachments) if (event.evidence[a.id]?.reviewed !== true) fail("attachment review missing evidence entry");
}
export function buildRow(event, headers, verifiedOn, vocabulary = {}) {
  mapHeaders(headers);
  validateReview(event);
  const values = {};
  if (!event.fields || Object.keys(event.fields).some(h => !contract.headers.includes(h) || contract.metadata_fields.includes(h))) fail("unexpected or metadata field in source fields");
  for (const h of contract.headers.filter(h => !contract.metadata_fields.includes(h))) {
    const field = event.fields[h];
    if (!field || !["verified", "unavailable"].includes(field.state)) fail(`${h}: unchecked field`);
    if (!Array.isArray(field.sources) || !field.sources.length || field.sources.some(id => event.evidence[id]?.reviewed !== true)) fail(`${h}: reviewed source references required`);
    if (field.state === "unavailable") {
      if (!clean(field.reason || "")) fail(`${h}: unavailable requires a reason`);
      if (field.value !== undefined && field.value !== "") fail(`${h}: unavailable field must be blank`);
      values[h] = "";
    } else {
      values[h] = renderField(h, field.value);
      if (!values[h]) fail(`${h}: verified value must not be empty`);
    }
    if (vocabulary[h] && values[h] && !vocabulary[h].includes(values[h])) fail(`${h}: value outside live approved vocabulary`);
  }
  for (const h of contract.required_fields) if (!values[h]) fail(`${h}: required event identity missing`);
  Object.assign(values, {"Submission Date": sheetDate(event.date), "Submission Link": event.link, "Gmail Message ID": event.message_id, "Gmail Thread ID": event.thread_id, "Candidate Key": candidateKey(values["Candidate Name"]), "Source Verified Date": sheetDate(verifiedOn)});
  return headers.map(h => values[h]);
}
const padRow = (values, width) => {
  if (!Array.isArray(values) || values.length > width) fail("row exceeds header width");
  return Array.from({length: width}, (_, i) => values[i] ?? "");
};
const normal = value => String(value ?? "").trim().toLowerCase();
const stableKey = (row, idx) => [row[idx["Gmail Message ID"]] || row[idx["Submission Link"]] || [row[idx["Submission Date"]], row[idx["Recruiter"]], row[idx["Gmail Thread ID"]]].join("|"), candidateKey(String(row[idx["Candidate Name"]] || "")), row[idx["Role Submitted For"]], row[idx["Client Submitted To"]]].map(normal).join("|");
export function validateSnapshot(snapshot, config) {
  const idx = mapHeaders(snapshot.headers);
  if (!config || snapshot.workbook_id !== config.workbook_id || snapshot.sheet_id !== config.sheet_id || snapshot.title !== config.workbook_title || snapshot.tab !== config.tab || config.tab !== "Submissions") fail("snapshot does not match the configured Submissions ledger");
  if (!Array.isArray(snapshot.rows) || snapshot.identity_index_complete !== true) fail("complete live identity index required");
  const rowNumbers = new Set();
  for (const row of snapshot.rows) {
    if (!Number.isInteger(row.row_number) || row.row_number < 2 || rowNumbers.has(row.row_number)) fail("invalid or duplicated live row number");
    rowNumbers.add(row.row_number); padRow(row.values, snapshot.headers.length);
  }
  return idx;
}
export function plan(input, config) {
  const {snapshot, events, mode, authorization, verified_on: verifiedOn} = input;
  if (!["check", "update", "repair"].includes(mode) || !Array.isArray(events)) fail("plan mode must be check, update, or repair with an events array");
  const idx = validateSnapshot(snapshot, config);
  const writable = mode !== "check" && authorization?.operation === mode && typeof authorization?.request === "string" && !!authorization.request.trim();
  if (mode !== "check" && !writable) fail("exact user request and matching Tracker operation required");
  if (input.mailbox_scope !== "complete_mailbox" || input.excluded_non_events !== true) fail("complete mailbox discovery and non-event exclusion required");
  const vocabulary = {...config.vocabulary, ...snapshot.vocabulary};
  if (snapshot.vocabulary_verified !== true || ["Submission Type", "Activity Status"].some(h => !Array.isArray(vocabulary[h]))) fail("live verified type and status vocabulary required");
  const rows = snapshot.rows.map(r => ({...r, values: padRow(r.values, snapshot.headers.length)}));
  const actions = [], seen = new Set();
  let nextRow = Math.max(1, ...rows.map(r => r.row_number)) + 1;
  for (const event of events) {
    try {
      const desired = buildRow(event, snapshot.headers, verifiedOn, vocabulary);
      const key = stableKey(desired, idx);
      if (seen.has(key)) { actions.push({type: "skip", key, reason: "duplicate source event in this run"}); continue; }
      seen.add(key);
      let matches = rows.filter(r => stableKey(r.values, idx) === key);
      // A single source event with a missing historical role/client can be
      // enriched, but do not guess the target of a multi-event source message.
      if (!matches.length && events.filter(e => e.message_id === event.message_id).length === 1) matches = rows.filter(r =>
        r.values[idx["Gmail Message ID"]] === event.message_id &&
        candidateKey(String(r.values[idx["Candidate Name"]])) === candidateKey(String(desired[idx["Candidate Name"]])) &&
        ["Role Submitted For", "Client Submitted To"].every(h => r.values[idx[h]] === "" || normal(r.values[idx[h]]) === normal(desired[idx[h]])));
      // Legacy rows without source IDs need the full fallback tuple, never name alone.
      if (!matches.length) matches = rows.filter(r => {
        if (r.values[idx["Gmail Message ID"]]) return false;
        const linked = r.values[idx["Submission Link"]] === event.link &&
          candidateKey(String(r.values[idx["Candidate Name"]])) === candidateKey(String(desired[idx["Candidate Name"]])) &&
          ["Role Submitted For", "Client Submitted To"].every(h => !r.values[idx[h]] || normal(r.values[idx[h]]) === normal(desired[idx[h]]));
        const tuple = ["Submission Date", "Recruiter", "Candidate Name", "Role Submitted For", "Client Submitted To", "Gmail Thread ID"].every(h => normal(r.values[idx[h]]) === normal(desired[idx[h]]));
        return linked || tuple;
      });
      if (event.target_row !== undefined) {
        if (mode !== "repair") fail("target_row is restricted to an authorized repair");
        const target = rows.find(r => r.row_number === event.target_row);
        if (!target || target.values[idx["Gmail Message ID"]] !== event.message_id) fail("repair target source identity changed");
        if (matches.some(r => r.row_number !== target.row_number)) fail("repair would collide with another event");
        matches = [target];
      }
      if (matches.length > 1) fail("multiple live rows match this exact event");
      if (!matches.length) {
        if (mode === "repair") fail("repair event has no existing target");
        if (rows.some(r => r.values[idx["Gmail Message ID"]] === event.message_id) && event.distinct_event_confirmed !== true) fail("shared message ID requires explicit distinct-event evidence");
        const action = {type: "new", key, row_number: nextRow++, expected_previous: Array(snapshot.headers.length).fill(""), values: desired};
        actions.push(action); rows.push({row_number: action.row_number, values: desired});
        continue;
      }
      const old = matches[0];
      if (event.review.existing_row !== true) fail("existing full row must be reviewed before reconciliation");
      const corrections = mode === "repair" ? event.corrections || [] : [];
      if (!Array.isArray(corrections) || corrections.some(h => !contract.headers.includes(h) || ["Gmail Message ID", "Gmail Thread ID"].includes(h))) fail("invalid repair correction fields");
      if (corrections.includes("Candidate Name") && !corrections.includes("Candidate Key")) fail("name repair must include Candidate Key");
      const values = [...old.values];
      for (const h of snapshot.headers) {
        if (h === "Source Verified Date") continue;
        const i = idx[h];
        if (corrections.includes(h)) {
          if (!event.expected_previous || event.expected_previous[h] !== old.values[i]) fail(`${h}: repair precondition mismatch`);
          values[i] = desired[i];
        } else if (old.values[i] === "" && desired[i] !== "") values[i] = desired[i];
      }
      if (values.every((v, i) => v === old.values[i])) { actions.push({type: "skip", key, row_number: old.row_number, reason: "existing event unchanged; no rewording or verification-date refresh"}); continue; }
      values[idx["Source Verified Date"]] = desired[idx["Source Verified Date"]];
      const changes = snapshot.headers.flatMap((header, i) => values[i] === old.values[i] ? [] : [{header, column_index: i, value: values[i]}]);
      actions.push({type: "update", key, row_number: old.row_number, expected_previous: old.values, values, changes});
      old.values = values;
    } catch (error) { actions.push({type: "hold", message_id: event.message_id || null, reason: error.message}); }
  }
  return {contract_version: contract.version, writable, mode, value_input_option: "RAW", format: contract.format, target: {workbook_id: config.workbook_id, sheet_id: config.sheet_id, tab: config.tab}, headers: snapshot.headers, snapshot_hash: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"), actions, counts: Object.fromEntries(["new", "update", "skip", "hold"].map(k => [k, actions.filter(a => a.type === k).length]))};
}
export function compareRow(expected, actual) {
  const normalized = padRow(actual, expected.length);
  return {pass: expected.every((v, i) => v === normalized[i]), differences: expected.flatMap((value, i) => value === normalized[i] ? [] : [{column_index: i, expected: value, actual: normalized[i]}])};
}
export function qa(snapshot, config) {
  const idx = validateSnapshot(snapshot, config), failures = [], keys = new Set();
  let prior = Infinity;
  for (const row of [...snapshot.rows].sort((a,b) => a.row_number - b.row_number)) {
    const values = padRow(row.values, snapshot.headers.length);
    if (values.every(v => v === "")) continue;
    const date = values[idx["Submission Date"]], key = stableKey(values, idx);
    if (typeof date !== "number" || !Number.isInteger(date) || date <= 0) failures.push(`row ${row.row_number}: nonnumeric event date`);
    if (date > prior) failures.push(`row ${row.row_number}: date order`);
    prior = date;
    if (keys.has(key)) failures.push(`row ${row.row_number}: duplicate exact event`);
    keys.add(key);
    if (values[idx["Candidate Key"]] !== candidateKey(String(values[idx["Candidate Name"]]))) failures.push(`row ${row.row_number}: candidate key mismatch`);
  }
  const end = Math.max(1, ...snapshot.rows.filter(r => r.values.some(v => v !== "" && v != null)).map(r => r.row_number));
  const f = snapshot.filter;
  if (!f || f.startRowIndex !== 0 || f.startColumnIndex !== 0 || f.endRowIndex !== end || f.endColumnIndex !== snapshot.headers.length) failures.push("filter does not cover the true used range");
  const server_pass = failures.length === 0;
  return {server_pass, final_status: !server_pass ? "fail" : snapshot.visual_qa === "pass" && snapshot.format_qa === "pass" ? "pass" : "partial", failures, expected_filter_end_row: end};
}
export function ownership(earlier, later) {
  // Calendar-month addition clamps to the final day, matching EDATE.
  const start = new Date(`${earlier}T00:00:00Z`); sheetDate(earlier); sheetDate(later);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 7, 0));
  end.setUTCDate(Math.min(start.getUTCDate(), end.getUTCDate()));
  return sheetDate(earlier) <= sheetDate(later) && sheetDate(later) <= sheetDate(end.toISOString().slice(0,10));
}
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const [command, inputPath, configPath] = process.argv.slice(2);
    if (!inputPath) fail("usage: tracker.mjs plan|qa|compare INPUT.json [CONFIG.json]");
    const input = JSON.parse(readFileSync(inputPath, "utf8"));
    const config = configPath ? JSON.parse(readFileSync(configPath, "utf8")) : null;
    const result = command === "plan" ? plan(input, config) : command === "qa" ? qa(input, config) : command === "compare" ? compareRow(input.expected, input.actual) : fail("unknown command");
    console.log(JSON.stringify(result, null, 2));
    if (result.pass === false || result.server_pass === false || result.counts?.hold > 0) process.exitCode = 2;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
