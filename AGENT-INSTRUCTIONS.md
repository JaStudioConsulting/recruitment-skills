# Agent Instructions

How an AI enters and operates inside this workspace. Read this first, then work
through the layers named in [START-HERE.md](START-HERE.md).

## How to enter
1. Read [START-HERE.md](START-HERE.md) for the plain map of the whole repo.
2. Open the Routing Map, `skills/recruiter/SKILL.md` (the front door). Every
   recruiting request goes through it. It tells you where to go, what to do, and
   what the output should look like before you produce it.
3. Read only the one skill or reference the front door points you to. Do not load
   everything.

## The layers you operate within
- **Global Rules** (`skills/GLOBAL-RULES.md`) apply to every output.
- **Voice Principles** (`skills/recruiter/modules/ja-writer/references/ja-style.md`) govern how anything written should sound.
- **Tool Conventions** (`skills/TOOL-CONVENTIONS.md`) say how tools should be used.
- **Plugins / MCPs / Connectors** (`skills/manifests/`) are the capabilities and outside connections available.
- **Skills** (`skills/recruiter/modules/`) are the repeatable workflows.

## How to behave
- Facts come only from the sources named in the front door (resume, transcript,
  JD, Ja-direct). Never invent a fact, a name, a number, or a client.
- The outside-world actions stay gated: no send, no submit, no Loxo write, no
  approval decision, no delete, without Ja's explicit yes.
- If a file or route the front door names is missing, stop and say which path is
  missing. Do not guess or invent a replacement.
- To add or change a skill, tool, or connector, follow [CONTRIBUTING.md](CONTRIBUTING.md)
  so the layers stay separate.

## What this layer is not
This is the clean "how to use this repository" entry. It is not personal or
finance workspace material, and none of that belongs in this repository.
