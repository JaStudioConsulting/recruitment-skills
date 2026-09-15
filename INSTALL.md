# Install

How to install this recruiting system into each AI. All three can install it from
this GitHub repo. Claude uses one plug-in format; Codex and the ChatGPT app share
another. Every install pulls the whole repo, because the front door references its
sibling files (Global Rules, Tool Conventions, capabilities), so they must travel
together.

## Claude (Code / Desktop)

This repo is its own plug-in marketplace. Install once and it stays on.

```
/plugin marketplace add JaStudioConsulting/recruitment-skills
/plugin install recruitment-skills@jastudio-recruitment
```

Then the front door and Tracker load as skills, and you just ask, for example
"brand this resume" or "write the submission". Update later with
`/plugin marketplace update jastudio-recruitment`.

## Codex (CLI)

```
codex plugin marketplace add JaStudioConsulting/recruitment-skills --ref main
codex plugin add recruitment-skills@jastudio-recruitment
```

Do not pass a narrow `--sparse` path. The plug-in is the whole repo, so a narrow
sparse checkout would drop the skills. Verify with `codex plugin list` (it shows
`recruitment-skills@jastudio-recruitment  installed, enabled`).

## ChatGPT (app and browser)

In ChatGPT, open **Plugins**, then **Add plugin marketplace**, and fill in:
- **Source:** `JaStudioConsulting/recruitment-skills`
- **Git ref:** `main`
- **Sparse paths:** leave empty (the plug-in is the whole repo; a narrow sparse
  path would drop the skills).

Add the marketplace, then install **TTTG Recruiting** (`recruitment-skills`) from it.

## Running the branded-resume PDF builder

Only the branded-resume PDF needs a runtime with Python and, for best fidelity,
headless Chrome. Claude Code and Codex have a shell, so it runs there. The ChatGPT
app has the skills and can produce the content and structured data, but cannot run
the builder itself, so the finished PDF comes from Claude Code or Codex.

## What always applies
- GitHub `main` is the single authority. A local copy is a working copy, never the
  source of truth.
- Outside-world actions stay gated: no send, submit, Loxo write, approval, or
  delete without an explicit yes.
