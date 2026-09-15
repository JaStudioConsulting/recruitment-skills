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
- Match candidates to open roles: the vetting workflow (is this person a fit) plus the sourcing workflow (find and map people). The old Airtable match engine has been retired.
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
- The house writing and formatting rules everything obeys: `skills/GLOBAL-RULES.md`.
- Which outside tools exist and how they behave: `skills/TOOL-CONVENTIONS.md`.

## The layers (Ja's model, exact names)

This repository is organized as the layers below, using Ja's own terminology.
Each layer maps to a real place in the repo.

| Layer | Meaning | Where it lives |
|---|---|---|
| Agent Instructions | How an AI enters and operates inside the workspace | [`AGENT-INSTRUCTIONS.md`](AGENT-INSTRUCTIONS.md) |
| Global Rules | Rules every agent follows | `skills/GLOBAL-RULES.md` |
| Voice Principles | How outputs should sound | `skills/recruiter/modules/ja-writer/references/ja-style.md` |
| Tool Conventions | How tools should be used | `skills/TOOL-CONVENTIONS.md` |
| Plugins / MCPs / Connectors | What capabilities the agent has | `skills/manifests/plugins.json`, `skills/manifests/tools.json`; install as a plug-in via [`INSTALL.md`](INSTALL.md) (`.claude-plugin/` makes this a one-click Claude Code plugin) |
| Skills | Repeatable workflows | `skills/recruiter/modules/` |
| Routing Map | Where relevant context lives | `skills/recruiter/SKILL.md`, the front door |
| Folders / Files | Actual knowledge and project context | this repository |
| Improve Skill | Turns corrections into proposed reusable rules | [`CONTRIBUTING.md`](CONTRIBUTING.md) and the dated-correction rules in `skills/GLOBAL-RULES.md` |

Two notes on this model:
- **Agent Instructions** here is a clean "how to use this repo" layer. It is not
  the personal or finance workspace material, which stays out of this repository.
- **Plugins / MCPs / Connectors**: this installs as a plug-in in Claude Code, Codex,
  and the ChatGPT app (and browser), all from this repo. See [`INSTALL.md`](INSTALL.md)
  for the exact steps per host. Claude uses `.claude-plugin/`; Codex and ChatGPT share
  `.codex-plugin/plugin.json` plus `.agents/plugins/marketplace.json`.

## Who can use this

Any AI assistant can read this repository and work from it. It does not assume
one brand of assistant. Six are set up to use it as equals: Codex, OpenCode,
Hermes, Claude, Gemini, and a generic connector. None of them owns it. They all
read the same front door.

## If something is missing

If the front door points to a workflow and that workflow or a rule file is not
there, stop and say which path is missing. Do not guess and do not invent a
replacement. Missing facts get raised, never filled in.
