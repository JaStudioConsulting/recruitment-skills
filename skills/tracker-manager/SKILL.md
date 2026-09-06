---
name: tracker-manager
description: Compatibility entry for Ja's Tracker requests. Routes Submissions updates, Leads previews/imports, audits, repair, search, MPC retrieval, and ownership checks through Recruiter to the repository-owned protected Tracker workflow.
---

# Tracker Manager entry

Load `../recruiter/SKILL.md` first and follow its authority check. Then use
`../recruiter/modules/tracker/GUIDE.md`. The complete protected implementation
is [GUIDE.md](GUIDE.md), with [Leads](leads/GUIDE.md) as its only approved
non-Submissions write route, in this same repository version.

For every Leads request, read [leads/GUIDE.md](leads/GUIDE.md) and
[the Leads layout reference](leads/references/layout.md) before planning or
acting. The JSON contract and protected planner remain authoritative for
schema and writes.

For `SF Jobs` lookup or Workbench Jobs read-through, load
[the SF Jobs contract](references/sf-jobs-contract.md). It is read-only here;
any write remains a separately authorized Tracker Manager operation.

This entry preserves existing `$tracker-manager` invocations. It contains no
independent schema, writing rules, or permissions. Do not load an older vault
copy or reconstruct the workflow from chat history.
