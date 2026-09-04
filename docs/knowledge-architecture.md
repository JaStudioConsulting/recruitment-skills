# Knowledge architecture

`$recruiter` is the global front door for reusable recruiting workflow rules, source hierarchy, privacy, and output contracts.

- Global: reusable process and safety rules only; no candidate, client, vacancy, compensation, CRM, or send-state facts.
- Project: client/role/company sources and project-specific instructions, kept isolated from global rules. Project sources remain authoritative only within their stated scope.
- Task: a time-bounded execution context whose outputs may preserve evidence, artifacts, and failure states.
- Cache: local mirrors, generated boards, pasted text, and rollout summaries are convenience/provenance layers, never authoritative by themselves.

## Intake rule for new project material

When a new ChatGPT project, folder, source, or template appears, classify it before reuse as a global reusable rule, project fact/source, task evidence, or cache. Never silently promote project facts, task evidence, or cache into global policy. Update the private project registry only when routing or scope changes. Reusable recruiting rules or templates must be proposed here, pass repository tests and privacy checks, and be published from canonical Git before becoming active.

Mutable external state must be rechecked before any completion claim or mutation. When layers conflict, current authoritative source wins; otherwise mark the item unverified and request confirmation. The private project registry is maintained outside this repository at `/Users/TTTG/Obsidian Vault/Recruiting/Project Knowledge Registry.md`.
