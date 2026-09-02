# @jastudioconsulting/recruitment-skills

Private, versioned recruiting-skills authority for Ja Studio Consulting. `$recruiter` is the sole front door for 23 capabilities. Tracker routes to the complete protected implementation in `skills/tracker-manager/GUIDE.md`. The `$tracker-manager` compatibility entry loads Recruiter first; it does not duplicate the rules.

## Consumer use

Install a pinned private version in a consumer, then use the resolver API. Do not construct a `node_modules` path.

```js
import { getRecruiterAuthority, readSkillText } from "@jastudioconsulting/recruitment-skills";

const authority = await getRecruiterAuthority();
const router = await readSkillText(authority.routerPath);
```

Direct exports are also available for packaged resources, for example `@jastudioconsulting/recruitment-skills/skills/recruiter/SKILL.md` and `@jastudioconsulting/recruitment-skills/manifests/tools.json`. Consumers own runtime tools, credentials, deployment, and integration adapters; this package owns the skills authority and contracts only.

## Boundaries

- Gmail is draft-first; sending is not declared here.
- Loxo is read-only/draft-only unless separately authorized in a consumer.
- Loxo pipeline and Gmail reconciliation workflows prepare exact manifests;
  this package never treats a review result or conversational count as write
  approval.
- No candidate/client/referee records, staff addresses, account IDs, credentials, environment files, deployment code, or live integrations are included.
- Loxo agency/owner values, Gmail recipients, browser adapters, and output locations must come from the consuming host.
- The repository owns Tracker source rules, field formats, reconciliation and QA. Hosts supply private workbook/account configuration and live adapters. All new/changed rows must use the bundled planner; completed events remain unchanged on repeat runs.
- This package is proprietary. See [NOTICE.md](NOTICE.md).

## Validation

```bash
pnpm validate
pnpm test
pnpm check:python
pnpm pack:check
```

The package uses pnpm exclusively. `pack:check` creates and removes a temporary pnpm tarball to prove the published file set. `0.2.0` adds the protected Tracker workflow and verified local installation. No public release is implied.

## Local use

See [the cutover contract](docs/consolidation/CUTOVER.md). Codex, Claude and
Hermes can share symlinks to one clean checkout. `authority:ensure` compares
published main on every recruiting run, validates incoming changes before a
fast-forward, and verifies the installation receipt. It does not overwrite
unpublished local edits. Private profiles, backups and run records stay outside
the repo. This is not an always-running background job.

## Provenance

Extracted selectively from the verified `laughjaja/workbench` `main` source snapshot at commit `81cf42c` during the split-repository migration. The upstream repository is preserved unchanged as rollback evidence; no host was repointed and no deployment occurred.
