# Split-migration provenance

This private package was selectively extracted from the verified `laughjaja/workbench` source snapshot at commit `81cf42c`.

Included: the recruiter router, its 24 internal modules, policies, capability and host/tool/plugin/workflow manifests, deterministic sanitized builders and assets, synthetic fixtures, host compatibility documentation, and ADR 0004 as the governing historical decision record.

Excluded: gateway and UI/deployment code, external runtime integrations, credentials and environment files, candidate/client/referee records, staff email identities, Loxo account IDs and live account snapshots, machine-specific deployment notes, generated outputs, caches, backups, logs, symlinks, unrelated ADRs, and the historical resume-engine evaluation-run archive. Client-specific vetting examples were replaced with source-driven generic rules. The source repository remains unchanged as rollback evidence. This migration does not repoint hosts, publish the package, deploy an application, or authorize an external action.

## 2026-09-04 selective legacy consolidation

Standalone recruiting front doors were selectively routed into existing recruiter modules and moved to the recoverable external archive `recruiter-consolidation-20260904T173500-0400`. Complete mappings and original paths are recorded in that archive's `MANIFEST.md`. Direct-send and reject scripts, transcripts, private/runtime data, and vault-ingest logic were explicitly excluded from the canonical package. Generic connector/tool dependencies were retained outside the recruiter front door. The archive is rollback evidence, not active policy.

## 2026-08-28 through 2026-09-04 correction audit

The current correction review used the Toronto half-open window `2026-08-28T00:00:00-04:00` through `2026-09-05T00:00:00-04:00`. The evaluated repository sequence runs from `dc1e3d1` on 2026-09-01 through `bbf1bbf` on 2026-09-04. Within the same scope, the newest explicit Ja correction and its published repository implementation supersede older guidance. Material predating the window remains provenance only unless an in-window instruction or current safety rule reaffirmed it.

The candidate-facing PDF capability demonstrates this rule: `a507d52` introduced it at 2026-09-04 20:06 EDT, and the later `bbf1bbf` correction at 21:48 EDT established `interview-prep-material` as the active name and route. The earlier `candidate-opportunity-brief` name is historical and must not be registered or invoked as a second capability.
