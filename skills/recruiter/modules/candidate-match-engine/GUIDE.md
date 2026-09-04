---
name: candidate-match-engine
description: Use for Ja's Airtable Candidate Match Engine. Processes Quick Intake rows, imports Gmail submissions, generates candidate-to-role matches with hard qualification gates, and produces the daily call list. Triggers on: "check matches", "process intake", "import submissions", "call list", "who should I call", "match candidates", "check Airtable", "morning run".
---

# Candidate Match Engine

Reverse-market matching also follows `references/reverse-match-edge-rules.md`.

Operating skill for Ja's six-table Airtable recruiting database. Turns internal candidates, open roles, Gmail submission evidence, and ownership rules into a daily call list.

**Before touching any Airtable table, read `references/schema.md`.** It has every field name, allowed value, and table relationship. Never invent field names.

## Connected Sources

| Source | Role |
|---|---|---|
| Airtable | Main working board — Candidates, Roles, Matches, Submissions, Do Not Submit, Quick Intake |
| Gmail | Submission evidence, CV attachments, candidate preference clues |
| Google Drive | CV file storage — Airtable stores links and file names only, never raw files |
| Notion | Verification source only — do not rebuild workflow there |

**⚠ Airtable connector limitation (current):** The Airtable MCP connector in this session only exposes automation-configuration tools, not record read/write tools (search_bases, list_records_for_table, create/update record). If the session cannot read/write Airtable records directly, fall back to browser automation via agent-browser or firecrawl-interact, or export/import via CSV.

**⚠ Airtable connector limitation (current):** The Airtable MCP connector in this session only exposes automation-configuration tools, not record read/write tools (search_bases, list_records_for_table, create/update record). If the session cannot read/write Airtable records directly, fall back to browser automation via agent-browser or firecrawl-interact, or export/import via CSV.

**Airtable CV Index:** An optional external Google Sheets integration. Its URL, availability, and access are runtime configuration, never this guide's authority. If it is not connected, stop at a read-only blocker rather than using a copied index.

**Drive CV naming:** `Candidate Name - Role Type - Location - YYYY-MM-DD.pdf`

**Drive folder target:**
```
Candidate Match Engine/
  CV Bank/
    CNC/ Millwright/ Electrician/ Quality/ Manufacturing Engineering/ Production Supervisor/ Operations/ Maintenance/
```

---

## Hard Gates — Run First on Every Match

If ANY gate fails → the match is No Fit or Needs Verification. Do not mark Qualified.

| Gate | Rule |
|---|---|
| Location preference conflict | Candidate evidence says "Toronto/GTA only" → block Hickson / Woodstock / Hamilton roles |
| Missing mandatory cert/license | Role requires 310T, 442A, 5-axis, etc. and candidate has no evidence of it → Needs Verification |
| Already submitted — same client/role | Check Submissions table. If exists → Next Step = "Check Duplicate Submission" |
| Do Not Submit conflict | Check Do Not Submit table every time. If candidate + client match → blocked entirely |
| Must-have not confirmed | Must-have skill (FANUC, Mastercam, H13, etc.) not in candidate evidence → Needs Verification, not Qualified |
| Candidate target role mismatch | Candidate stated they want a different role type → flag |

See `references/match-rules.md` for per-role must-have lists (D&D, Ricci, Exco, Darling).

---

## Workflows

### 1. Process Quick Intake

**Invoke:** "process intake" / "check new intake" / scheduled intake task

1. Read Quick Intake table — filter Intake Status = "New" or "Ready to Add".
2. For each row:
   - Classify: Candidate / Job-Role / Candidate+Role / Needs Sorting
   - Dedupe: search Candidates by name, Roles by title+client
   - If no duplicate: prepare new Candidate or Role record
   - If duplicate: update existing record if new info adds value; flag intake as Duplicate / Ignore
   - Check Do Not Submit for the candidate
   - If sufficient data exists: prepare match recommendation
3. **Gate — show Ja:** rows found, what will be created/updated, any flags. Wait for yes.
4. Write to Airtable. Update Intake Status on each row: "Added to Airtable" / "Needs Review" / "Duplicate / Ignore".
5. Send notification:
   ```bash
   osascript -e 'display notification "[N rows processed. N created. N flagged.]" with title "Match Engine" subtitle "Quick Intake" sound name "Glass"'
   ```

---

### 2. Import Gmail Submissions

**Invoke:** "import submissions" / "check Gmail for submissions" / scheduled 8:30 AM task

1. Search Gmail for submission activity since last workday:
   - Patterns: "Candidate Submission", "Resume Submission", forwarded resumes, candidate package emails
   - Extract per email: candidate name, title, submitted-to client, role, date submitted, submitted by, attachment file name
   - Store evidence as: `Email subject | Sender | Date | Attachment file name` — NOT raw Gmail URLs
2. For each candidate found:
   - Check Candidates table by name
   - Exists → update: Last Contacted, Submitted Role, Submitted To, Candidate Status, Gmail Search Key, Ownership Evidence
   - Doesn't exist → prepare new Candidate record with Ownership Source and Original Owner inferred from sender
3. For each submission:
   - Check Submissions table — does this candidate + client + role + date already exist?
   - Exists → skip (no duplicate)
   - Doesn't exist → prepare new Submission record
4. Do not re-scrape old former-recruiter pools unless those names appear in a new email.
5. Flag any six-month ownership reviews — do not auto-release anyone.
6. **Gate — show Ja:** new Candidates to create, Submissions to create, updates, ownership flags. Wait for yes.
7. Write to Airtable.
8. Send notification:
   ```bash
   osascript -e 'display notification "[N submissions imported. N new candidates. N ownership flags.]" with title "Match Engine" subtitle "Gmail Import" sound name "Glass"'
   ```

---

### 3. Generate Matches

**Invoke:** "generate matches" / "match candidates" / scheduled 9:00 AM task

1. Read all open Roles (Status = "Open").
2. Read all active Candidates (Candidate Status not Inactive or Placed).
3. For each Role × Candidate pair:
   - Run all hard gates first — any failure → No Fit or flag, do not score
   - Evaluate must-haves from `references/match-rules.md`
   - Evaluate logistics: location preference, pay range, shift, work status
   - Assign Match Level: Strong Fit / Possible Fit / Weak Fit / No Fit
   - Set Qualification Status, Logistics Flag, Next Step
   - Group multiple opportunities per candidate in Multiple Opportunity Group field
4. Check for existing Match records — update rather than duplicate.
5. Only surface Strong Fit and Possible Fit in the call list output.
6. Never assign Strong Fit unless every must-have is confirmed in evidence.
7. **Gate — show Ja proposed matches before writing.** Summary table: Candidate → Role → Level → Key reason. Wait for yes.
8. Write Match records to Airtable.
9. Send notification:
   ```bash
   osascript -e 'display notification "[N strong fits. N possible fits. N flagged.]" with title "Match Engine" subtitle "Match Run" sound name "Glass"'
   ```

---

### 4. Daily Call List

**Invoke:** "call list" / "who should I call today" / final step after match generation

Pull Matches where Qualification Status = "Qualified - Contact" or "Qualified - Multiple Options".

Output format per candidate:

```
Candidate: [Name]
Best Role to Lead With: [Role Title @ Client]
Other Possible Roles: [Role 2, Role 3]
Confirmed Fit: [what is verified from evidence]
Missing Verification: [unconfirmed must-haves]
Logistics Flags: [location / pay / shift issues if any]
Ask Candidate: [specific questions to close the gaps]
Next Step: Contact Candidate / Check Duplicate Submission / Hold
```

List candidates in priority order: Qualified - Multiple Options first, then Qualified - Contact.
Flag clearly any where Next Step = Hold or Check Duplicate Submission — do not bury them.

Send notification:
```bash
osascript -e 'display notification "[N candidates to call. N to verify. N on hold.]" with title "Match Engine" subtitle "Call List" sound name "Glass"'
```

---

## Ownership Rules

See `references/ownership-rules.md` for full rules.

**Core principle:** The six-month rule is a **review flag only**. Never auto-release ownership. Before flagging for release, check:
- Active conversations in Loxo Activity notes
- Recent submission history in Submissions table
- Do Not Submit or conflict notes

---

## Match Logic — Key Principle

One candidate can match multiple roles. Each role needs its own separate pass/fail check.

**Separate these two things:**
1. Technical qualification (certs, skills, experience)
2. Logistics fit (location, pay, shift, availability, ownership)

A candidate can be technically qualified and still blocked by logistics. Both must pass before marking Qualified.

---

## Output Shape

Every task:

- **Task** — one-line restatement
- **Plan** — steps about to execute
- **Gate** — what needs Ja's yes before writing to Airtable (or "no gate, read-only")
- **Result** — what was created / updated / flagged
- **Call List** — if applicable
- **Notification** — confirm osascript ran with the actual message sent
