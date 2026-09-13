# Start Here

Plain-language guide to this repository. No coding knowledge needed. If you are
an AI assistant reading this cold, or a person opening this for the first time,
read this page first.

## What this is

This is the recruiting brain for Top Tier Talent Group. It holds the workflows,
the writing rules, and the output formats for recruiting work: branding a
resume, vetting a candidate, writing a submission, sourcing, and Loxo work.

It does not hold any real candidate or client information. All examples inside
are made up on purpose. Nothing here can leak a real person.

## The one rule: everyone comes through the front door

There is a single entry point called **the recruiter front door**. It lives at
`skills/recruiter/SKILL.md`.

Whatever the recruiting request is, you open the front door first. The front
door does three things for you, every time, before any real work happens:

1. **Where to go.** It reads the request and points to the one workflow that
   handles it.
2. **What to do.** That workflow has the steps.
3. **What the output should look like.** It shows you the shape of the finished
   result before you build it, so the result matches the house format instead of
   being guessed.

You do not need to read everything in this repository. Open the front door,
follow it to the one workflow you need, and stop there. That is the whole
design, and it is what keeps an assistant from drowning in files.

## What lives in each route (plain words)

All of these live under `skills/recruiter/`. The front door sends you to the
right one.

**Resumes and submissions**
- Brand a resume into the finished Top Tier PDF: the branding workflow.
- Write the full submission (email draft plus the branded PDF): the write-up workflow.
- Decide if a candidate is worth pursuing (a yes, no, or needs-checking verdict): the vetting workflows.
- Build the case for a borderline candidate: the candidate-defense workflow.
- The historical "candidate submission" name points back to the two workflows above.

**Writing**
- Write anything in Ja's voice (emails, outreach, follow-ups): the ja-writer workflow.
- LinkedIn posts and company-page copy: the linkedin-posts workflow.
- Cover letters and offer letters: their own workflows.

**Finding people**
- Search the web for candidates: the sourcing and web-sourcing workflows.
- Match candidates to open roles: the match-engine workflow.
- Screen and rank a list of applicants: the applicant-screening workflow.

**Loxo (the recruiting database)**
- Look things up, prepare draft notes, or list the exact changes for approval: the Loxo workflows. Nothing is changed in Loxo without a separate yes.
- Read-only candidate dashboards, job postings, and approved browser actions each have their own workflow.

**Interviews and references**
- Candidate-facing interview prep material for a company and role: the interview-prep-material workflow.
- Reference-check documents: the complete-reference-check workflow.
- Interviewer plans, questions, and scorecards: the recruiting-HR workflows.

**Records and rules**
- Update the Tracker (the submissions and leads record): the tracker route, which hands off to the protected Tracker keeper.
- Resume layout and print rules: the legislator and resume-engine workflows.
- The house writing and formatting rules everything obeys: `skills/_JA-RULES.md`.
- Which outside tools exist and how they behave: `skills/_TOOL-MAP.md`.

## Where this sits in the bigger system

Ja's full assistant setup is a larger stack. This repository is the recruiting
slice of it, kept on its own so it stays clean and portable. Here is the map,
and what is here versus deliberately left out.

| Layer in the full system | In this repo? | Where / note |
|---|---|---|
| Assistant instructions (the outer shell) | No, on purpose | lives at the workspace level, not here |
| House rules everyone follows | Yes, recruiting only | `skills/_JA-RULES.md` |
| Voice principles (how writing should sound) | Yes | `modules/ja-writer/references/ja-style.md` |
| Tool conventions (how tools behave) | Yes | `skills/_TOOL-MAP.md`, `skills/capabilities.json` |
| Capabilities (what tools connect) | Yes | `skills/capabilities.json`, `skills/manifests/` |
| Skills (repeatable workflows) | Yes | `skills/recruiter/modules/` |
| Routing map (where context lives) | Yes | `skills/recruiter/SKILL.md`, the front door |
| Actual knowledge and project files | Yes | this repository |
| Improve-skill (turn corrections into rules) | Partly | dated-correction rules inside the guides |

The outer layers (the workspace shell, the personal and finance areas) are on
purpose not in here. This repository is built to plug under that larger system
later without dragging any of it in now.

## Who can use this

Any AI assistant can read this repository and work from it. It does not assume
one brand of assistant. Six are set up to use it as equals: Codex, OpenCode,
Hermes, Claude, Gemini, and a generic connector. None of them owns it. They all
read the same front door.

## If something is missing

If the front door points to a workflow and that workflow or a rule file is not
there, stop and say which path is missing. Do not guess and do not invent a
replacement. Missing facts get raised, never filled in.
