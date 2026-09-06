# ARCHIVAL: Loxo list-building notes

This file is historical evidence only and is not a runnable procedure. It is
not a current browser, API, Playwright, or provider contract. URLs, selectors,
tool names, endpoint shapes, list IDs, and click sequences may be stale.

The durable decision logic is:

- confirm the exact person identity and current Loxo record before proposing a
  list or job association;
- separate records already in Loxo from records that require a separately
  approved sourcing/import operation;
- treat adding a person to a list, job, campaign, or pipeline as a write; and
- prepare a source-grounded action manifest, obtain Ja's explicit
  authorization, recheck the exact current record and expected state, execute
  serially through the host-declared adapter, and reread the result. Unknown
  outcomes remain unresolved and are never retried automatically.

For a current request, load `../GUIDE.md` and, for any proposed mutation,
`loxo-safe-pipeline-actions.md`. This archival note cannot authorize an action
or establish that a provider-specific browser route is available.
