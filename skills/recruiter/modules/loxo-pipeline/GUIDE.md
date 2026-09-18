---
name: loxo-pipeline
description: >-
  Pull, review, and (optionally) clean up a Loxo ATS job pipeline end to end
  without manual copy-paste. Use when someone wants to pull all candidates on a
  Loxo job, export their profiles / contacts / resumes, see who has been
  contacted or who actually applied vs was sourced, build a candidate-review
  page, or bulk-reject/clean a pipeline. Triggers: "pull the pipeline for
  <job>", "who's on this Loxo job", "export candidates + resumes", "who applied
  vs sourced", "clean up / reject the pipeline", "build me a review of these
  candidates". Works with any AI agent that has a browser-automation or HTTP
  tool able to reuse the user's logged-in Loxo session, or the Loxo API.
---

# Loxo Pipeline (agent-agnostic)

A repeatable workflow for getting everything useful out of a **Loxo** ATS job
pipeline — candidate profiles, contact details, resume text, recruiter activity,
and applied-vs-sourced status — landing it as files, turning it into a plain
interactive review page, and (only when explicitly asked) cleaning the pipeline
up by rejecting candidates in bulk.

This document is written for **any AI agent**, not one vendor. Wherever it says
"the agent," it means whatever assistant is running this (Claude, Cursor, Codex,
a custom agent, etc.). The only hard requirement is a way to talk to Loxo — see
**Transport** below.

## Golden rules

1. **Never make the user copy-paste a JSON blob.** The whole point is automated
   transfer. If you cannot reach Loxo automatically, say so and stop — do not
   fall back to "paste this into a text file" unless the user explicitly asks.
2. **Reads are free; writes are gated.** Pulling data is safe. Anything that
   changes Loxo (rejecting, moving stages, editing) requires an explicit
   go-ahead from the user on the exact list, and a test-of-one first.
3. **Keep bulk data out of your context.** Loxo list calls are large. Land them
   on disk and process with `jq`/python; never paste a 300-candidate blob into
   the conversation.
4. **Report faithfully.** Counts must reconcile against Loxo's own stage counts.
   If something doesn't add up, surface it.

## Transport — how to reach Loxo

Pick whichever the running environment supports; both hit the same Loxo data:

- **Browser-session transport (preferred, most portable).** Use a
  browser-automation tool that reuses the user's *already logged-in* Loxo tab
  (this repo's reference scripts use `ego-browser`, but Playwright/Puppeteer/
  Chrome-extension drivers work too). From inside the page context, `fetch()`
  Loxo's JSON endpoints — the session cookies ride along, so no credentials are
  handled by the agent. This sidesteps login walls and connector toggles.
- **Loxo API transport.** If a Loxo API key / MCP connector is available, call
  the REST endpoints directly. Faster, but availability varies.

If the only reachable browser is a fresh sandbox that is **not** logged into
Loxo, you will hit a login wall. Do not enter credentials. Ask the user to log
in in that browser, or use the transport that reuses their real session.

See `references/loxo-endpoints.md` for every endpoint, the workflow-stage IDs,
and the activity-type IDs this workflow relies on.

## The workflow

### 1. Identify the job
Resolve the job from a URL or ID. A Loxo job URL looks like
`https://<agency>.app.loxo.co/agencies/<AGENCY_ID>/jobs/<JOB_ID>/pipeline`.
Fetch the job header to get the title, company, and **per-stage counts** — you
will reconcile against these later.

### 2. Decide which stages to include
Ask (or take from the request) which stages to keep. A common pattern is
"active pipeline only": include Applied, Longlist, Shortlist, Outbound, Follow
Up, Screening, Offer, Hired; exclude Rejected, Internal Submission, Submitted,
Interview #1, Interview #2. Stage → ID map is in the reference file.

### 3. Pull the candidate list
Pull all candidates for the job (profiles include name, title, company,
location, emails, phones, LinkedIn, and `workflow_stage_id`). Big responses
must be written to disk and filtered with `jq`/python, not read inline. Keep
only the included stages.

### 4. Enrich each candidate (per person)
For each person_id:
- **Resume text** — pull from the *resume tab* endpoint, not the profile fields.
  The profile tab is thin (current title/company + a one-line blurb); the resume
  endpoint returns the parsed text of the actual uploaded document. Record
  whether a resume exists at all.
- **Recruiter activity** — pull the person's event history; keep human
  (non-bot) contact events (calls, emails, SMS, meetings, screens) with who /
  what / when. This reveals who is already being worked.
- **Applied vs sourced** — in that same history, an **"Applied"** event on this
  job means they came through the posting; "Moved to Longlist" / AI-sourced
  means the team sourced them. Note that applicants who were advanced show
  "0 Applied" on the board but still carry the original Applied event.

### 5. Assemble
Write one JSON + one CSV per job: profile + contacts + resume snippet +
has_resume + stage + applied/sourced + contacted (+ any role-specific flag you
were asked for, e.g. a licence like "433A", or an environment tier like "heavy
equipment"). Save to the user's Downloads (or a stated path).

### 6. Present — the review page
Run `scripts/build_review.py` to generate a **plain, interactive** HTML review:
search box, filter chips, and tap-to-expand cards showing the resume snippet,
recruiter activity, and contact details. Keep it utilitarian — this is a working
tool, not a showpiece. Publish it as an artifact / open it locally / hand over
the file, per the environment.

### 7. (Optional, gated) Clean up the pipeline
Only when the user explicitly asks to reject / clean up:
1. Build the exact target list (e.g. everything in Longlist/Shortlist that was
   AI-sourced and has no human engagement, minus a protected keep-list, minus
   Applied).
2. **Show the user the list and count. Ask what rejection reason/note to log,
   if any. Wait for an explicit go.**
3. **Test on one** candidate; verify it landed (stage moved to Rejected) and is
   reversible.
4. Then process the rest in batches. Reconcile the final Rejected count against
   Loxo.
Rejecting = creating a "Rejected" activity event on the job (it moves the
candidate to the Rejected stage; it is reversible, not a delete). See the
reference file for the exact call.

## Scripts
- `scripts/pull_pipeline.mjs` — reference pull (profiles + resumes + activity +
  applied flag) via a logged-in browser session; writes JSON + CSV.
- `scripts/build_review.py` — turn that JSON into the interactive review page.
- `scripts/reject.mjs` — gated bulk-reject (test-of-one, batches, reason note).

The scripts are a **reference implementation**. Any agent can reproduce the same
result with its own transport by following `references/loxo-endpoints.md`.

## Guardrails recap
- No credential entry, ever. No CAPTCHA solving. No login-wall bypass.
- Writes need explicit per-run confirmation on the concrete list.
- Duplicate person records exist in Loxo — never auto-reject a record whose name
  matches a keeper; hold suspected duplicates for the user to merge.
