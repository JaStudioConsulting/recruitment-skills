---
title: Global Rules
tags: [governance, ja-rules, writing-style, recruiting, skills]
related: [skills/recruiter/SKILL.md]
---

# JA OPERATING RULES (read first, every agent)

Companion: `TOOL-CONVENTIONS.md` and `recruiter/SKILL.md`.


Single source of truth for how Ja / Top Tier Talent Group wants work done.
Lives in this repository so every approved host follows the same rules. If you touch resumes, submissions, or any writing for Ja, follow this file exactly. It overrides host defaults.

Compiled 2026-07-29 from Ja's corrections across Claude Code and Codex sessions (Jul 22 to 29). These are things Ja had to repeat. Do not make him repeat them again.

---

## 1. WRITING STYLE (all output: resumes, emails, docs)

Tracker is an event ledger. Its protected row contract controls cell structure,
exact headers and source-value preservation. Do not apply submission-email
narrative rules to Tracker rows or rewrite completed events for style alone.

- No em dashes, no en dashes, no double hyphens, no semicolons, no tildes. Anywhere. Reword with commas or "and", or restructure the sentence.
- No spaces around slashes. Write "CNC/manual" and "Production Supervisor/Converting Supervisor", never "CNC / manual".
- Write proper sentences with verbs. Not title-case fragment headers. A resume bullet is a sentence, not a heading.
- Concrete over abstract. Anchor every claim to a number, system, plant type, or named tool. If a sentence could describe any candidate, cut it or make it specific.
- Kill AI filler: thrives, fast-paced, leverage, robust, seamless, dynamic, passionate, proven track record, wealth of experience, poised to, adept, well-versed. Replace with a real fact or delete.
- Regular hyphens are fine in compounds (cost-reduction) and date ranges (Dec-2025 - Present).
- Percentages must be real and candidate-sourced. Keep a percentage when it comes from the candidate's own resume or what they stated, especially for metric-driven roles where numbers are the natural language (continuous improvement, CNC, quality, production, maintenance). Never invent, estimate, round up, or pad a percent claim the source does not support. When there is no real number, use concrete ownership, scope, systems, headcount, dollar figures, or equipment language instead. (Updated Sep 14 2026; supersedes the Aug 10 2026 blanket no-percentage rule.)

## 2. RESUME RULES (TTTG format)

- Title under the name = the candidate's CURRENT role title, exactly. Not a creative rewrite. One single title, bold. Do not invent "Creative Production Operations Supervisor" when the person is a "Production Supervisor".
- Do not make the title oversized. Keep it clean, not "stupidly big".
- Combine multiple roles at the SAME company into one timeline entry. Do not split them.
- Education section: institution name and credential only. No dates.
- No compensation figures in resume bullets.
- Core Skills = even number, two-column grid.
- Experience most recent first. Two header lines per role: Job Title (bold, left) with dates mmm-yyyy (right), then Company (italic, left) with Location (right). Then achievement bullets, action plus number.
- Never invent a fact. Missing employer, date, degree, location, or metric means STOP and ask Ja. Never ship a placeholder or a "[confirm]" marker to a client.

## 3. PROFILE SUMMARY / SUBMISSION NARRATIVE

- The Profile Summary must DEFEND why the candidate is worth interviewing for THIS role. It is a fit thesis, not a resume repeat.
- Do not restate bullets the client can already see on the resume.
- 2 short sentences, 3 only if needed. Plain business terms.
- Lead with the human "wow" from the transcript (for example "visa in hand and on the job seven days later"), not a category label like "hard worker".
- Division of labor: the external `Reason for Leaving` label owns the confirmed departure reason. The narrative owns why they are worth reviewing for this role. `Reason for Exploring` is optional internal call-intake evidence only and never substitutes for the external field. Never put move-motivation in the narrative.

## 4. SUBMISSION EMAIL RULES

- Real current employer name always appears in the email body, even for MPC. Never "Confidential" or a masked industry in the Current Company line.
- Subject (named): New Candidate Submission - [Role] - [Name] - [Client] - [City], ON
- Subject (MPC): MPC - New Candidate Submission - [Title] - [Name] - [City], ON
- Separator is " - " (space hyphen space). No period at the end of the subject.
- Recipient: use the account manager and internal-team mailbox supplied by the consuming host. Never infer or hardcode an address. MPC drafts go only to the configured internal-team mailbox.
- MPC to the internal team attaches the NAMED resume (real employers). Anonymize only when a resume goes OUT to an external client speculatively.
- One Gmail draft only. Never dog-pile duplicates. Always draft, never send. End body at "CV attached." on its own line. Never type a signature (Gmail auto-appends the real one).
- Location line = one concrete city plus note, for example "Kingston, ON | 20 minutes from Belleville." Keep the immigration program (RNIP/RCIP, PR) out. Compensation = real figure only. Do not disclose scheduling as the reason for leaving unless Ja says so.

## 4b. REFINED EMAIL SPEC (Ja, Aug 5 2026)
- Greeting: `Hi team,` then present with a bold inline mention of the configured account manager on the presenting line.
- Labels bold. Use exact `Compensation Target:` and `Start Date / Notice Period:` (not "Compensation:"/"Start Date:").
- `Reason for Leaving` = confirmed source wording, kept concise. Leave it blank or omit it when unknown. Never substitute `Reason for Exploring`.
- Preserve the external submission fields when supported: Name, Title, Compensation Target, Current Compensation, Vacation, Location, Work Status, Interview Availability, Start Date, Reason for Leaving, and Profile Summary.
- Bold `CV attached.` on its own line. No signature (Gmail auto-appends).
- Subject: `New Candidate Submission - [Role] - [Name] - [Client] - [City], ON`.
- When Ja says no-Gmail, deliver as copy-paste chat text with markdown `**bold**` (Gmail renders it). Still apply all bold rules.
- BULLET BOLD RULE: never bold the whole lead sentence like a book chapter title. Bold ONLY the specific proof point inside the bullet (employer name, system, cert, number, skill). Frame sentences stay plain.

## 5. KNOWN ISSUES (do not rediscover these)

- Airtable is obsolete and the Airtable candidate-match-engine is retired. Do not read from or write to Airtable, and do not restore it as a capability. Candidate matching and call-list work route to vet and sourcing. The Submissions record is the Google Sheets Tracker through the tracker route.
- Old multi-machine deployment notes are historical only. Current cutover instructions live in `docs/consolidation/CUTOVER.md` and must be reverified before use.

## 6. MODE NOTES

- caveman mode is Ja's most-used mode. Respond terse when it is on. Off-switch: "stop caveman" or "normal mode". Drop caveman for security warnings and irreversible-action confirmations.
- "brand this" on any candidate material means build the finished branded TTTG PDF straight away. Do not ask which format.

---

## 7. VISUAL PRESENTATION RULES

- When the user asks to "see" a layout, design, mockup, page, or UI asset, always provide a rendered visual version (using the image generation or browser screenshot tools) directly in the conversation. Do not just present raw code blocks, file paths, or text-only descriptions.
