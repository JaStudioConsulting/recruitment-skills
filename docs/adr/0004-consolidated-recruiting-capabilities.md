# ADR 0004: Consolidated Recruiting Capabilities

## Status

Accepted upstream on 2026-08-22. This package-specific extract was created during the split-repository migration from verified upstream commit `81cf42c`. Publishing, consumer installation, host repointing, deployment, and live smoke testing remain pending.

## Context

Recruiting instructions, builders, and integration declarations had diverged across old local sources. The split keeps the reusable recruiting authority independently versioned, while a Workbench consumer owns gateway implementation, UI, credentials, and deployment.

## Decisions

1. `skills/recruiter/SKILL.md` is the sole recruiting front door. Its 22 capabilities are internal `GUIDE.md` modules and are never registered as standalone skills.
2. This private package owns the router, policies, manifests, sanitized deterministic builders/assets, and synthetic fixtures. Consumers provide runtime adapters and do not copy or fork this authority.
3. Manifests remain router-first and declare the integration contract only. Gmail is draft-first; Loxo is read-only/draft-only unless separately authorized in a consumer. No send, candidate submission, Loxo write, approval decision, or external deletion is declared.
4. The package contains no real candidate/client/referee records, staff email identities, account IDs, credentials, environment values, generated outputs, deployment code, or external symlinks. Runtime addresses, account identifiers, browser adapters, and output paths are host-supplied.
5. The resolver API and explicit package exports are the only supported way for consumers to locate packaged resources. Consumers must not hard-code a `node_modules` path.
6. No cutover is implied. The source repository remains unchanged as rollback evidence until a separately approved reversible release.

## Consequences

- Skills can be reviewed, tested, and versioned independently of the Workbench.
- Consumers pin an exact private package version and use `getRecruiterAuthority()` or `resolveSkillPath()` to locate the router, manifests, and internal resources.
- The package validator enforces one `SKILL.md`, 22 modules, manifest consistency, safe paths, sanitized DOCX placeholders, no symlinks, and basic secret/privacy checks.

## Verification

Run from this package root:

```bash
pnpm validate
pnpm test
pnpm check:python
pnpm pack:check
git diff --check
```

These checks validate the package only. They do not authorize publishing, deployment, host repointing, Gmail sending, Loxo writing, candidate submission, or any live integration action.
