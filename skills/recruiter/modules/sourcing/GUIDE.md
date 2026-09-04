---
name: sourcing
description: >
  Unified candidate, opportunity, and business-development prospect sourcing for Ja. Use whenever Ja asks
  to find, source, X-ray search, verify, audit, rank, shortlist, clean, or export candidate
  or prospect lists, or to map jobs and opportunities for a candidate using their stated
  preferences. Works from LinkedIn, public jobs, internal open roles, a JD, a role brief,
  company criteria, candidate notes, or pasted rows. Handles public-profile research,
  client-company conflicts, duplicate and DNC checks, evidence-based fit or priority ratings,
  preference-aware job matching, and generic or Loxo-ready CSV export. Also
  trigger on requests such as "review these leads", "who should I contact", "find candidates",
  "find hiring managers", "clean this sourcing list", or "export these profiles". Do not use
  for resume rewriting, candidate submissions, outreach copy, message sending, or Loxo writes.
compatibility: Adzuna API and public web tools support job discovery; Firecrawl or browser tools support verification; Python 3 runs bundled helpers.
---

# Sourcing

One entrypoint for finding and auditing candidates or business-development prospects.
Optimize for recruiter decisions, not research volume.

## Modes

| Invocation | Result |
|---|---|
| Candidate discovery | Find new candidates from a JD or role brief |
| Candidate audit | Verify and rank a supplied candidate list |
| Candidate opportunities | Match one candidate to open roles using stated preferences |
| Candidate job map | Alias for candidate opportunities |
| Prospect discovery | Find hiring or business-development contacts |
| Prospect audit | Verify and prioritize a supplied prospect list |
| Full candidate workflow | Find, verify, rank, and shortlist candidates |
| Full prospect workflow | Find, verify, prioritize, and shortlist prospects |
| Export | Export approved rows as generic or Loxo-ready CSV |

The recruiter front door selects the mode when the request is clear. If the intent is broad, return this menu and
ask which mode. Ask one concise question only when a missing choice would materially change
the work.

## Load Only What The Mode Needs

- Candidate work: read `references/candidate.md`.
- Candidate-to-job mapping: read `references/opportunities.md`.
- Prospect work: read `references/prospect.md`.
- CSV or Loxo-ready output: read `references/export.md`.

Do not load all references by default. The router stays small so routine sourcing uses fewer
tokens.

## Shared Workflow

1. **Ground the target.** Extract role or account, industry, location, level, must-haves,
   exclusions, client/target company, and requested count. Treat supplied facts as claims to
   verify, not automatic truth.
2. **Clean first.** Remove repeated headers and exact duplicates. Deduplicate by normalized
   public-profile URL first, then full name plus company. Keep conflicting versions and flag
   them instead of silently choosing one.
3. **Run hard gates.** Apply candidate or prospect conflict rules before scoring. An excluded
   person cannot appear as the top recommendation.
4. **Research in two passes.**
   - Pass 1: verify identity, current employer/title/location, profile link, obvious conflict,
     and obvious level mismatch for every row.
   - Pass 2: deepen only top contenders and material unknowns that could change the decision.
5. **Rank from evidence.** Every evidence-bearing row uses exactly one status: `Verified`,
   `Unconfirmed`, `Conflicting`, or `Outdated`. Missing public evidence is `Unconfirmed`.
   Do not invent, infer a credential, or convert absence into a false fact.
6. **Return one compact table.** Include separate `Eligibility` (`Eligible` or `Excluded`)
   and `Evidence Status` (only the four normalized values) columns. Skip process narration. Follow with exclusions, top three,
   and only decision-changing verification questions; maximum three bullets per section.
7. **Stop before outbound action.** Do not draft outreach, write to Loxo, start campaigns, or
   submit candidates. Route those requests to their dedicated skills.

## Research Budget

- Maximum 25 people per batch. Split larger lists into numbered batches.
- Batch up to four independent web queries in one search call.
- Broad discovery: maximum five distinct Boolean/X-ray strings.
- Search page one for each string. Use page two only when page one is clearly on target.
- For a known person or URL, use at most two targeted searches unless a material conflict
  remains unresolved.
- Prefer: official company source, public LinkedIn/profile page, professional association or
  regulator, then reputable secondary source.
- Use interactive browsing only when search/open tools cannot retrieve necessary public data.
- Stop researching a row when identity, current role/company/location, conflict status, and
  decision-changing evidence are sufficiently established.

## Public Data Rule

Default output contains public profile links, not email or phone enrichment. Never guess an
email pattern. Only include contact data when Ja explicitly changes the scope and the detail is
visibly published by the person or employer.

## Output Discipline

- Lead with the table. Omit a search diary and repeated target summary.
- Cite material current facts with direct links.
- Mark `Eligibility` as `Eligible` or `Excluded`, and independently mark `Evidence Status`
  as `Verified`, `Unconfirmed`, `Conflicting`, or `Outdated`.
- Keep evidence specific: title, employer, industry, scope, certification, location, or signal.
- Do not praise weak evidence or force a fit.
- Do not create CSV until Ja explicitly requests export.

## Boundaries

- Resume/JD submission vetting and submission packages: use `vet`.
- Loxo searches or writes: use `loxo` after this skill prepares criteria or approved rows.
- Candidate or client messaging: no packaged `outreach` route exists in this repository.
  Stop and ask Ja before using an external messaging capability.
- Existing-database role matching: use `candidate-match-engine`.
- Scheduled or bulk Airtable match-engine runs: use `candidate-match-engine`; one-candidate
  opportunity mapping stays in this skill.
- Full company or pre-call intelligence beyond sourcing: no packaged `account-research` or
  `deep-research` route exists in this repository. Stop and ask Ja before using an external
  capability and state that the work is outside this package.
