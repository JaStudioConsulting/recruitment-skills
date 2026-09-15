# Install

How to install this recruiting system into each AI. Honest note up front: the
three are not the same. Claude Code has a real one-click install. Codex installs
skills from a repo. The ChatGPT app has no "install a repo" mechanism.

## Claude (Code / Desktop) — one-click

This repo is its own plugin marketplace. Install once and it stays on.

```
/plugin marketplace add JaStudioConsulting/recruitment-skills
/plugin install recruitment-skills@jastudio-recruitment
```

Then the front door and Tracker load as skills (namespaced), and you just ask,
for example "brand this resume" or "write the submission". Update later with
`/plugin marketplace update jastudio-recruitment`. The whole repo installs, so the
front door's sibling files (Global Rules, Tool Conventions, capabilities) come with
it and everything resolves.

To run the branded-resume PDF builder, the machine needs Python and, for best
fidelity, headless Chrome. Claude Code has a shell, so this works locally.

## Codex — skills install (whole repo)

Codex loads skills from `~/.codex/skills/`. Install the recruiting skills from
this repo, then use them.

Clone the repo somewhere and point Codex at it, or copy it into the Codex skills
area:

```
git clone https://github.com/JaStudioConsulting/recruitment-skills.git
```

Then make the recruiter and tracker-manager skills available to Codex (copy or
reference `skills/recruiter` and `skills/tracker-manager` under `~/.codex/skills/`,
keeping the rest of the repo alongside so the front door's sibling files resolve).
Codex's `$skill-installer` can also pull a skill folder from GitHub, but the front
door references files outside its own folder, so install the whole repo, not just
the `recruiter` folder on its own.

Codex has a runtime, so the branded-resume PDF builder (Python plus Chrome) runs.

## ChatGPT (the app) — no repo install

The ChatGPT app cannot install a GitHub skills repo. It has custom GPTs and
connectors, not this skill format, and it cannot run the PDF builder. Two honest
options:
- Use **Codex** (OpenAI's coding agent) for the full flow, which is the OpenAI path
  that actually runs this.
- Or paste a skill's guide text into ChatGPT for the content only. It can produce
  the wording and structured data, but not the finished PDF.

If a hosted, always-on ChatGPT option is wanted later, the route is to expose this
system as an MCP server (Apps SDK), which ChatGPT can connect to. That is a
separate build, not an install of this repo.

## What always applies
- GitHub `main` is the single authority. A local copy is a working copy, never the
  source of truth.
- Outside-world actions stay gated: no send, submit, Loxo write, approval, or
  delete without an explicit yes.
