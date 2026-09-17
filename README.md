# @jastudioconsulting/recruitment-skills

**New here, or an AI assistant reading this cold? Read [START-HERE.md](START-HERE.md) first** for a plain-language map of what this is, how the front door works, and what each route does. Agents begin at `skills/recruiter/SKILL.md`. To add a skill, tool, or connector, follow [CONTRIBUTING.md](CONTRIBUTING.md) so the skills-vs-tools split stays intact.

Private, versioned recruiting-skills authority for Ja Studio Consulting. GitHub `main` is the only source of recruiting rules. Package version `0.3.1` is the current authority. `$recruiter` is the sole front door for the internal capabilities. Tracker routes to the complete protected implementation in `skills/tracker-manager/GUIDE.md`, including its explicit, approval-gated Leads import contract. The `$tracker-manager` compatibility entry loads Recruiter first; it does not duplicate the rules.

## Consumer use

Install a pinned private version in a consumer, then use the resolver API. Do not construct a `node_modules` path.

```js
import { getRecruiterAuthority, readSkillText } from "@jastudioconsulting/recruitment-skills";

const authority = await getRecruiterAuthority();
const router = await readSkillText(authority.routerPath);
```

Direct exports are also available for packaged resources, for example `@jastudioconsulting/recruitment-skills/skills/recruiter/SKILL.md` and `@jastudioconsulting/recruitment-skills/manifests/tools.json`. Consumers own runtime tools, credentials, deployment, and integration adapters; this package owns the skills authority and contracts only.

## Recruiter Workstation

`workstation/` is the full-page Recruiter Workstation for ChatGPT Sites. It keeps each role-and-candidate case together: Apple Pencil/typed notes, immutable source attachments, a structured resume editor, write-up, submission, email draft, and compact assistant guidance.

The workstation owns its private case state in Sites D1/R2. Gmail, Calendar, Drive, Tracker, Loxo, and the specialized PDF builder remain host capabilities behind `workstation/lib/connectors/`; the browser does not duplicate their authentication or claim an unavailable connector worked. Consequential external updates require an exact preview and approval before execution.

This differs from `ui/candidate-dashboard.html`, which is the smaller MCP in-chat result surface. See `workstation/README.md` for local preview, persistence, and deployment instructions.

## Boundaries

- Gmail is draft-first; sending is not declared here.
- Loxo is read-only/draft-only unless separately authorized in a consumer.
- Loxo pipeline and Gmail reconciliation workflows prepare exact manifests;
  this package never treats a review result or conversational count as write
  approval.
- No candidate/client/referee records, staff addresses, account IDs, credentials, environment files, deployment code, or live integrations are included.
- Loxo agency/owner values, Gmail recipients, browser adapters, and output locations must come from the consuming host.
- The repository owns Tracker source rules, field formats, reconciliation and QA. Hosts supply private workbook/account configuration and live adapters. All new/changed Submissions and Leads rows must use the bundled planner; completed events remain unchanged on repeat runs.
- This package is proprietary. See [NOTICE.md](NOTICE.md).

## Validation

```bash
pnpm validate
pnpm test
pnpm check:python
pnpm pack:check
```

The package uses pnpm exclusively. `pack:check` creates and removes a temporary pnpm tarball to prove the published file set. The protected Tracker workflow and verified local installation are part of package `0.3.1`. No public release is implied.

## Local use

See [the cutover contract](docs/consolidation/CUTOVER.md). Codex, Claude,
Hermes, and Gemini can each expose one symlink to one clean checkout. A local
copy is a disposable runtime materialization, never an authority. Run
`pnpm authority:check` or the approved `authority:ensure` installer from the
canonical checkout to verify repository, published-main, symlink, and receipt
state before use. It fast-forwards only after validation and never overwrites
unpublished local edits. Private profiles, backups and run records stay outside
the repo; local cleanup must be recoverable and must not delete user data.

## Provenance

Extracted selectively from the verified `laughjaja/workbench` `main` source snapshot at commit `81cf42c` during the split-repository migration. The upstream repository is preserved unchanged as rollback evidence; no host was repointed and no deployment occurred.
