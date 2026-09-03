---
name: tracker-manager
description: Compatibility entry for Ja's Tracker requests. Routes Submissions updates, Leads previews/imports, audits, repair, search, MPC retrieval, and ownership checks through Recruiter to the repository-owned protected Tracker workflow.
---

# Tracker Manager entry

Load `../recruiter/SKILL.md` first and follow its authority check. Then use
`../recruiter/modules/tracker/GUIDE.md`. The complete protected implementation
is [GUIDE.md](GUIDE.md), with [Leads](leads/GUIDE.md) as its only approved
non-Submissions write route, in this same repository version.

This entry preserves existing `$tracker-manager` invocations. It contains no
independent schema, writing rules, or permissions. Do not load an older vault
copy or reconstruct the workflow from chat history.
