# @jastudioconsulting/recruitment-skills

Private, versioned recruiting-skills authority for Ja Studio Consulting. `$recruiter` is the sole front door. All 23 capabilities are internal modules and must not be registered as competing top-level skills. Tracker uses a thin internal route to the consuming host's protected Tracker Manager authority.

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
- Tracker workbook identifiers, account profiles, source rules, and live mutations remain owned by the consuming host's protected Tracker Manager authority.
- This package is proprietary. See [NOTICE.md](NOTICE.md).

## Validation

```bash
pnpm validate
pnpm test
pnpm check:python
pnpm pack:check
```

The package uses pnpm exclusively. `pack:check` creates and removes a temporary pnpm tarball to prove the published file set. `0.1.0` is an internal migration baseline, not a public release.

## Provenance

Extracted selectively from the verified `laughjaja/workbench` `main` source snapshot at commit `81cf42c` during the split-repository migration. The upstream repository is preserved unchanged as rollback evidence; no host was repointed and no deployment occurred.
