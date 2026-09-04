# ARCHIVAL Loxo Browser Procedures

> NON-RUNNABLE ARCHIVE. This document is historical evidence only. Do not
> execute, copy, or adapt these procedures into a live action. No step here
> authorizes a Loxo mutation, import, submission, message, campaign, or send.

The detailed browser procedures formerly retained inline in `../GUIDE.md` are
preserved here as archival material while the active guide controls current
read-only review and routes any approved mutation through
`../loxo-automation/GUIDE.md`.

Before any current action, reread the active guide, obtain Ja's separate named
authorization for the exact record and action, use a verified allowed browser
adapter, and complete screenshot/post-action verification. Historical UI
selectors, URLs, stage IDs, limits, and click sequences are not assumed current.

The active guide's historical section remains the original source snapshot for
provenance; this archive is the explicit non-runnable reference point for that
material.

## Historical Browser Reference (non-runnable)

The material below is retained for provenance only and is never an execution
path.

Everything below this heading is ARCHIVAL EVIDENCE ONLY. Do not execute,
copy, or follow any click sequence below. It must not be used to execute,
save, send, submit, import, update, delete, create a campaign, or change any
Loxo record. The current capability ends at read-only inspection and manual
draft bullets. A restricted action requires separate named human authorization
and a verified allowed tool, through the restricted automation guide.

### Pick your browser tool based on where you're running

| Tool | Browser MCP to use | Notes |
|---|---|---|
| Codex or any agent with Ego | `ego-browser` | Preferred for Ja. Use one isolated task space, reuse its login state, and combine semantic inspection with screenshots for visual or iframe surfaces. |
| Claude Code (Cowork) | `mcp__Claude_in_Chrome__*` | Preferred when wired; DOM-aware, works in existing tab |
| Claude Code (no Chrome ext) | `mcp__playwright__*` | When `Claude_in_Chrome` is NOT connected to the session, drive a Playwright browser that is logged into Loxo (Ja logs in once; the session persists). Verified working channel. |
| OpenCode | chrome-devtools MCP | Already configured in opencode.json |
| Any (fallback) | computer-use | Only for native OS dialogs, iframe-only reads, or when other tools fail |

> REALITY NOTES (verified 2026-06-20): (1) `Claude_in_Chrome` is often NOT wired into a plain Claude Code session — check first; if absent, use Playwright against a logged-in Loxo browser. (2) People-list row checkboxes and several controls are CSS-only and NOT in the a11y tree — select by hover, not by a checkbox role. (3) Outreach builder, Settings pages, and the "New Meeting" scheduling modal render inside IFRAMES — read them via screenshot, not `browser_snapshot`.

**Always operate inside Ja's existing Loxo tab. Do not open new tabs unless no Loxo tab exists.**

For Ego, "existing Loxo tab" means the tab inside the selected isolated Ego task space. Reuse that task space for the whole Loxo request. Do not take over or compete with Ja's normal browser window. This changes the browser driver only. The confirmation gate matrix below still controls every action.

The Claude in Chrome extension (`mcp__Claude_in_Chrome__*`) is preferred for Cowork — it is DOM-aware, fast, and works without opening new tabs. For OpenCode, use chrome-devtools MCP equivalently. computer-use is a fallback only (e.g. file upload dialogs, native OS prompts) — take a screenshot first to verify state before clicking.

### Pre-flight (always)

1. **Find the existing Loxo tab.** Use your browser tool's tab-finder (e.g. `tabs_context_mcp`, `find`, or chrome-devtools tab list) to locate the open Loxo tab. Switch to it. Only open a new tab if none exists.
2. **Read the page state.** Confirm Ja is logged in and on a sensible page. If logged out, stop and tell Ja — do not enter credentials.
3. **State the plan.** One-line task restatement plus the action sequence using neutral placeholders until live page evidence is read.
4. **Wait for yes on gated actions** (see gate matrix below).

### Navigation anchors

Prefer switching to the existing Loxo tab and using left-nav clicks or these direct URLs:

- Jobs list: `https://app.loxo.co/agencies/{agencyId}/jobs`
- People list: `https://app.loxo.co/agencies/{agencyId}/people`
- Companies list: `https://app.loxo.co/agencies/{agencyId}/companies`
- Campaigns: `https://app.loxo.co/agencies/{agencyId}/campaigns`
- A specific person: `https://app.loxo.co/agencies/{agencyId}/people?person_id={id}`
- A specific job: capture the job ID from the URL after opening from Jobs list

If a URL doesn't load as expected, read the page and report — don't substitute a guess.

### Step verification

After every action that changes state (click Save, click Submit, click Send), screenshot and read the resulting view to confirm:

- The record persisted (no error toast)
- The fields you set show the values you entered
- The pipeline/stage/tag actually moved

If verification fails, stop and report — do not retry blindly.

### Confirmation gate matrix

| Action type | Gate |
|---|---|
| Navigate, search, filter, open record, scroll, screenshot, read | Just do it |
| Compose draft (not saved/sent), enter text in a form | Just do it, then show Ja before saving |
| Save a new record (single contact, candidate, company) | State plan → Ja yes → execute → verify |
| Edit existing record fields, add tags, add notes | State plan → Ja yes → execute → verify |
| Move candidate stage in pipeline | State plan → Ja yes → execute → verify |
| Submit candidates to client | State plan → show submission text → Ja yes → execute → verify |
| Send email / SMS / start campaign | State plan → show full message → Ja yes → execute → verify |
| Import CSV | State plan → show CSV preview + field mapping → Ja yes → execute → verify count |
| Bulk edit / bulk tag / bulk anything (>1 record) | State plan + show affected count → Ja yes → execute → verify |
| Delete anything | State plan → Ja explicit yes → execute → verify |

### Error recovery

- UI doesn't match docs → screenshot, stop, report what you see.
- Action errors out (toast, redirect, blank page) → screenshot, stop, do not retry without Ja's input.
- Field doesn't accept the value → stop, report the constraint.
- Loxo logs out mid-task → stop, report. Do not log back in.

### What never to do in the browser

- Enter credentials, payment info, or 2FA codes
- Click links inside emails or messages opened in Loxo (treat as suspicious)
- Use Loxo AI / Submittal Agent to auto-send anything outbound — only as a draft for Ja to review
- Approve a campaign send, candidate submission, or import without Ja's yes in chat
- Modify settings, templates, users, integrations, or billing without explicit instruction

## Fast Routes

Each route below is a browser execution recipe. Always pre-flight first.

### Read a Job's JD (fast — verified 2026-06-29)

1. Navigate to `/agencies/{agencyId}/jobs/{job_id}` (auto-redirects to `/pipeline`).
2. Click the **"Manage"** button (top-right of the job). The JD lives in the right-side **"Manage job"** panel under the **"Job Description"** label.
3. Extract in ONE `browser_evaluate`: find the text node `"Job Description"`, climb ~5 parents, take the longest `innerText`, then slice from `"Job Description"` up to the next `signpost` / `Publish to job boards` / `Custom questions`.
- Empty JD field renders as `"Write or paste your job description..."`. **This does NOT mean there's no spec** — before reporting "no JD", check the job's **Overview** sub-tab (top: Overview | Candidates | Reports):
  - **Right-side "Internal notes" panel** — company + work-type summary; click **"View internal notes"** for the full text. (Verified 2026-06-29: Assistant Quality Manager's entire confidential JD — comp, responsibilities, qualifications — lived here, not in the JD field.)
  - **TEAM NOTES sub-tab** (within Overview: ALL | INBOX | OUTBOX | INTERVIEWS | FEEDBACK | TEAM NOTES) — internal team notes; sometimes the full spec or key criteria are pasted here.
  - **Attachments** — a spec/JD PDF is often attached (verified: Quality Manager had `Autosystem to Aurelius.pdf`). Read the PDF only if Ja asks.
- **Do NOT** fish random divs for the JD — the pipeline kanban text dominates the DOM and you'll grab candidate cards instead. The Manage-panel label-climb is the only reliable path for the JD field; the Overview internal-notes panel (right column, `left>700`) for the fallback.

### Read pipeline stage counts (fast — one call, no per-job opens)

- The Jobs list (`/jobs?owned_by_id={user_id}`) already renders every per-stage count as an anchor: `href=".../jobs/{id}/pipeline?candidate_workflow_stage_id={stage_id}"` with the count as the link text. A single `querySelectorAll('a[href*="/jobs/"]')` returns all jobs + all stage counts. No need to open each pipeline.
- **"My jobs"** auto-applies `owned_by_id` once logged in (Ja's user id = `{ownerId}`).
- Stable `stage_id → name` map for Ja's default job workflow:
  - **Applied = {stageId}**, **Longlist = 244487**, **Shortlist = 244488**
  - then: Screening/Submitted/etc. → 244489, 330190, 244490, 245262, 244491, 244492, 305775, 245671, 244493, 244494

### Reading / vetting a candidate (reality check — verified 2026-06-29)

- Candidate cards have **no href** (`<a data-testid="candidateCard_name">` with a JS click). Clicking sets `?person_id={id}` and opens a profile **drawer**.
- Drawer right rail = DETAILS / SCORECARDS / INTAKE / MEETINGS (structured fields + a JOBS list showing every pipeline the person sits in). The **full resume is a PDF attachment** ("CV on File") in a viewer — Loxo does **NOT** expose clean parsed work-history text in the drawer DOM, so div-scraping for "Experience" fails.
- To vet on the actual resume: open candidate → **Resume tab → screenshot → read the screenshot** (~3 calls/candidate). Tell Ja the candidate count BEFORE a bulk vet — 18 people ≈ 50+ browser calls.
- Faster first-pass vet (trades roles): use the structured signals already in the drawer — current title, current employer, location, and the JOBS pipeline list in the right rail. Open the CV only for borderline cases.
- **ALWAYS check the Activity tab before vetting/contacting.** Prior contact ("already talked to") lives there — skip re-vetting people already worked.
- Data layer is **GraphQL at `/graphql`** (opaque). REST guesses like `/api/agencies/{agencyId}/jobs/{id}` return 404 — don't waste calls probing REST.

### Source Candidates (Ja's Prospecting Workflow)

This is Ja's standard sourcing sequence. Always follow this order — do not open Loxo Source before completing Steps 1–2.

**Step 1 — Gather context first**

Open the Job record in Loxo. Read and extract:
- **JD** (job description): title, must-have skills, responsibilities, client, location, compensation range
- **Intake notes** on the job or linked contacts: hiring manager preferences, deal-breaker criteria, ideal candidate profile
- **Internal activity notes** on the job: any prior feedback on submitted candidates, client feedback, stage notes

Screenshot key sections. Do not proceed to sourcing until you can state in one line: *who they want, where, at what level, in what industry.*

**Step 2 — Define search criteria**

From the gathered context, derive:
- **Industry / Vertical**: what sector(s) the ideal candidate comes from (match to Ja's Vertical taxonomy in this reference)
- **Location**: city, region, or commute radius
- **Tenure / experience range**: years of experience that fit — this is the qualification filter. Identify the floor (underqualified) and ceiling (overqualified). State both before searching.
- **Title variations**: list 3–5 alternate titles that represent the same level
- **Exclusions**: titles or backgrounds that signal over or under qualification

Show Ja this criteria summary before opening Loxo Source. Gate — Ja confirms or adjusts.

**Step 3 — Open Loxo Source from the Job**

Navigate to the Job in Loxo → `Add People` → `Loxo Source`. Opening from inside the job means sourced candidates land directly in the pipeline (not just the People page).

**Step 4 — Run the search**

Use NLS + filters in combination:
1. Set **Location** filter with appropriate radius first.
2. Set **Industry** / vertical filter to match the target sector(s).
3. Set **Experience / tenure** filter to the confirmed range.
4. Enter an NLS prompt or Boolean string using the confirmed title variations.
5. Screenshot results. Scan for quality before selecting anyone.

If results show ∞ (infinite matches): tighten criteria — add a filter, narrow location, or refine the NLS prompt.
If results are too thin: widen location radius or add title variations.

**Step 5 — Check internal database status before screening**

Before evaluating fit, check whether each promising candidate already exists in Ja's internal database. In Loxo Source (Public mode), internal profiles appear alongside external Source profiles — they are distinguishable because they show existing data (Record Holder, tags, etc.).

For any candidate worth considering, do the following before adding:

1. **Already in database?**
   - If the profile shows as internal (already in Ja's database): open it.
   - If not visible as internal: do a quick People page search by name to confirm they're not already there under a slightly different spelling.

2. **Check Record Holder (ownership)**
   - Open the profile → Details panel → `Record Holder` field.
   - If it shows `Ja Maralit` — Ja owns this record, proceed.
   - If it shows someone else — flag for Ja before doing anything with this person.
   - If blank — no ownership claimed yet.

3. **Check existing Activity notes**
   - Open the Activity tab.
   - If notes exist: read them. Do they show prior contact, a rejection, a do-not-contact flag, or a previous submission?
   - If a note says `Not interested`, `Do Not Contact`, `Rejected`, or similar — do not add to the campaign or pipeline. Flag for Ja.
   - If notes show prior positive contact — include that context in your summary to Ja.

4. **Check tags**
   - Visible on the profile card and in the Details panel.
   - If tagged `Do Not Contact` — stop, do not add.
   - If tagged with a client name — note the potential conflict before adding to a competing role. Never copy the live client name into package documentation.

Report your findings per candidate: internal or new | owner | notes summary | tags | recommendation.

**Step 6 — Screen for fit (no under, no over)**

For each candidate who passed the Step 5 check:
- **Current title and level**: does it match the target level? Flag if too junior (underqualified) or too senior (overqualified).
- **Industry**: is their background in the right sector?
- **Tenure at current role / career progression**: does the arc match what the client wants?
- **Location**: are they in range or willing to commute/relocate based on prior notes?

Use the `Context` button on a profile card to see why Loxo ranked them — useful for borderline cases.

Do not add anyone who is clearly under or overqualified. If uncertain, flag the profile for Ja to review before adding.

**Step 7 — Add qualified candidates**

Select qualified profiles → `+ Add to...`:
- If sourcing from inside a Job: candidates go into the pipeline at the Progression Trigger stage.
- If sourcing from People page: choose Job, List, or Campaign as appropriate.

Gate — show Ja the count and a brief summary of who you're adding before confirming.

**Step 8 — Done Sourcing**

Click `Done Sourcing` (top right) to return to the Job pipeline. Verify candidates appeared in the correct stage.

---

### Add Company Or Contact

> ARCHIVAL, NON-EXECUTABLE: Do not follow the procedure below. It is retained
> for historical context only; use the restricted automation workflow and
> named human approval for any mutation.

1. Navigate to People (or Companies if starting from the company).
2. Search by company name to check for existing record.
3. If company exists: open it. If not: gate → create company.
4. From the company record, click Add Contact (or equivalent).
5. Fill: First Name, Last Name, Title, Email, Phone, LinkedIn, Location.
6. Set person type: `Contact` for hiring managers / client-side, `Candidate` for placeable people.
7. Add only task-approved tags (for example `Quality Hiring`, `BD`, or `Do Not Contact`).
8. Add a note explaining why this contact exists.
9. Gate → Save → screenshot to verify the record shows in the company.
10. For multiple contacts, switch to CSV import (next route).

### Import CSV

> ARCHIVAL, NON-EXECUTABLE: Do not follow the procedure below. It is retained
> for historical context only; use the restricted automation workflow and
> named human approval for any mutation.

1. Confirm the CSV is built to spec: `.csv`, one tab, headers row 1 only, no images, no empty rows/cols, ≤2,800 chars/cell, ≤10,000 cells, ~500 rows or fewer per batch.
2. Navigate to People page.
3. Click the dropdown next to `Add People`.
4. Click `Import CSV`.
5. Select the file.
6. Preview rows/fields and choose what to import.
7. Map each CSV column to a single Loxo destination field (1:1 only).
8. Choose person type: Candidate or Contact.
9. Optionally: add to Job Pipeline, add to List.
10. **Show Ja the field mapping + person type + row count → Ja yes.**
11. Submit. Wait for the import notification.
12. Verify count and spot-check 2-3 records after import.

For first-time CSVs, gate-test 5-10 rows first before the full import.

### Use Tags And Filters

Common generic tags: `Quality Hiring`, `MPC`, `BD Prospect`, `Do Not Contact`.

To bulk-tag:
1. People page → filter to target set.
2. Verify count matches what Ja expects.
3. Select records → Edit → Tags → Add (not Replace, unless Ja said replace).
4. Gate → execute → verify spot-check.

Boolean tag search pattern from prior notes: `tag_names:(example-client)` and `NOT tag_names:(excluded)`. Verify exact syntax in the live search bar before relying on it.

### Activity Notes

> ARCHIVAL, NON-EXECUTABLE: Do not follow the procedure below. It is retained
> for historical context only; use the restricted automation workflow and
> named human approval for any mutation.

Ja logs everything through the **Activity tab** on a person profile — not the Intake tab.

1. Open the Person Profile.
2. Click the `Activity` tab.
3. Click the note input area (`Add an update...`).
4. Select the note type from the dropdown (e.g. `*Note`, `Candidate Intake - Recruiter Screening/Interview`, or other types).
5. Optionally link to a job via `Search for job...`.
6. Type the note content.
7. Cover what's relevant: comp target, current comp, location/commute/relocation, work status, availability, reason for leaving, motivations, risks/uncertainties, client interest, do-not-contact flags.
8. Gate → Save → verify the note appears in the activity feed below.

The activity feed shows all logged notes, sent emails, and other events in reverse-chronological order. Use the `Search events` field to filter the feed.

### Compensation Fields

> ARCHIVAL, NON-EXECUTABLE: Do not follow the procedure below. It is retained
> for historical context only; use the restricted automation workflow and
> named human approval for any mutation.

Compensation lives in the **Profile tab** under the Compensation section — separate from Activity notes.

Fields: `Salary Target`, `Salary Current`, `Bonus Target`, `Bonus Current`, `Equity Target`, `Equity Current`.

1. Open the Person Profile → Profile tab.
2. Scroll to the Compensation section.
3. Gate → fill Target and/or Current values → save.
4. Screenshot to verify values persisted.

Always fill comp from verified candidate-stated data only — do not infer or estimate.

### Submit Candidate

> ARCHIVAL, NON-EXECUTABLE: Do not follow the procedure below. It is retained
> for historical context only; use the restricted automation workflow and
> named human approval for any mutation.

1. Open the relevant Job pipeline.
2. Select candidate(s).
3. Click `Submit Candidates` above the pipeline.
4. Choose what candidate info to share. Save as default if Ja confirms.
5. Click Next.
6. Draft Submission Summary (use only verified facts from resume, intake, JD; Loxo's Submittal Agent / `Write with AI` is a draft only).
7. **Show Ja the full submission text and the recipient list → Ja yes.**
8. Send/share via the generated link or email.
9. Verify the candidate now shows as Submitted in the pipeline.

### Resume Intake (Forwarding)

> ARCHIVAL, NON-EXECUTABLE: Do not follow the procedure below. It is retained
> for historical context only; use the restricted automation workflow and
> named human approval for any mutation.

For adding resumes via email forwarding (no browser needed for the forward itself, but verify in browser):

1. Resume Forwarding Address is under `Settings > General` (account admin only).
2. Forward resume attachments to that address.
3. Subject-line tags: `#hashtag` for tags, Loxo Job ID to attach to a pipeline, `[SOURCE=other]` for source codes, `[APPLIED]` / `[APPLICATION]` / `[APPLICANT]` (caps + brackets) to mark application events.
4. After forwarding, navigate to the candidate in Loxo and verify parsing landed correctly.

Parsing limits: `.pdf`, `.docx`, `.csv`, `.xlsx`, `.png`, `.jpeg` previewable; ~10-12 attachments per email; ~5,000 resumes/month parsing limit. Prefer simple text-based resumes — no headers/footers, graphics, tables, or multi-column layouts.

### View Resume On Profile

Open candidate profile → resume panel/tab. Take a screenshot if Ja asked to read it; do not download to a path Ja didn't specify.
