# Repository authority and local cutover

Ja authorized the repository-owned Tracker implementation and shared local
installation on 2026-09-02. Authority is GitHub `JaStudioConsulting/recruitment-skills`
main. A clean checkout supplies runtime files; the installation receipt records
the exact verified commit. The repo does not contain private workbook IDs,
recipient addresses, credentials, candidate records or run manifests.

## Install

Keep the checkout outside the shared notes/skills vault. Create private
`tracker.json` and `host.json` in the operator's `.config/jastudio-recruitment`
directory, or the directory named by `JASTUDIO_RECRUITMENT_CONFIG`.

- Tracker config: workbook_id, workbook_title, sheet_id, tab (Submissions),
  owner_names, optional approved vocabulary, plus an optional `leads` object
  containing `sheet_id` and `tab: "Leads"`. Verify these against the live
  connection at operation start; the config is never a substitute for reads.
- Host config: actor name, internal-team recipient, output directory and
  private run directory. Credentials stay in existing connector stores.

After validation, tests, publication and remote commit verification, run:

```
pnpm install:local <absolute-existing-shared-skills-directory>
pnpm authority:check
```

The installer replaces only `recruiter` and `tracker-manager` with symlinks to
this checkout. Previous entries and any receipt are retained in a private
timestamped backup directory. All hosts already pointing at the shared skills
directory resolve the same bytes. Unrelated skills and global policy files are
left intact; the router uses canonical repository policy paths explicitly.

## Every use and future changes

The router requires `authority.mjs ensure` before recruiting actions. It verifies
the exact GitHub origin, clean checkout, receipt and installed real paths. If
main advanced, it validates and tests that commit in a temporary worktree before
fast-forwarding the shared checkout and updating the receipt. Dirty/diverged
trees and failed validation stop the sync without replacing the active version.
No background scheduler is installed. Newly loaded local skills use the shared
version; an already-running task must reread the router after the check.

Codex, OpenCode, Claude, Hermes, and Gemini local shared-path installation may
expose a symlink to this one checkout. Register `recruiter` once per host. For
OpenCode, the canonical auto-loaded resolver root is `~/.agents/skills`; do not
register the same skills through `~/.config/opencode/skills`, because duplicate
sources create competing resolution paths. Verify with:

```bash
opencode debug skill
```

Acceptance requires one recruiter source and one tracker-manager compatibility
source from the canonical shared repository, with the final resolved commit
matching the verified installation receipt. For Gemini,
the canonical resolver root is `~/.agents/skills`; do not expose the same skill
through both `.agents/skills` and `.gemini/skills`, because Gemini loads both
and the `.agents` registration overrides the duplicate. Verify the Gemini
installation with `gemini skills list`; acceptance requires exactly one
`recruiter` entry, resolved through `.agents`, matching the verified receipt.
Other machines, cloud chats and MCP consumers require their own verified adapter
or package installation; this document does not claim they were repointed.

## Rollback

Stop active recruiting work first. Read the private installation receipt and
verify its exact symlinks and backup paths. Unlink only those two installed
symlinks and move their named backup entries back. Restore the backed-up receipt
when one exists; otherwise archive the new receipt. Never recursively remove
the shared skills directory or discard the old skill packages.

## Verification boundary

Tests exercise synthetic row generation, holds, repairs, identity handling,
repeat-run stability, dates, QA and installation-path checks. Local installation
is proven by realpath and commit verification. Live Gmail/Sheets credentials
and actual writes must still be verified for each authorized Tracker operation.
