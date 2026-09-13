# Consolidated legacy recruiting routes

These former standalone routes are retired. Their generic policy is represented by the routed recruiter modules below; do not invoke the archived directories as entrypoints.

| Former route | Canonical route |
|---|---|
| candidate-target-search | `modules/sourcing`, `modules/web-sourcing`, and `modules/vet` for fit |
| company-target-search | `modules/web-sourcing`, `modules/sourcing` |
| recruiting-vault-ingest; vault-csv-ingress | `modules/tracker` and protected `tracker-manager` |
| tttg-submission-guardrails | `modules/write-up`, `modules/brandedresume`, `scripts/validate-artifact-qa.mjs` |
| recruitment-campaign-builder (both paths) | `modules/loxo/references/prospect-campaign-learning.md`, `modules/loxo-automation`, `modules/ja-writer` |
| prospect | `modules/loxo/references/prospect-campaign-learning.md`, `modules/candidate-defense`, `modules/write-up`, `modules/ja-writer` |
| outreach | `modules/ja-writer`, `modules/loxo` |
| ja-writer | `modules/ja-writer` |
| linkedin-posts | `modules/linkedin-posts` |
| recruiting-ontario-trades | `modules/sourcing`, `modules/web-sourcing` |
| call-recording-recovery | `references/call-recording-recovery.md` and recruiter workflow step 1 |
| productivity/ja-writer | `modules/ja-writer` |
| recruiting-quiz-copy | recruiter source audit, vetting, and write-up routes; no candidate data or eval fixtures imported |
| sourcing-agents | `modules/sourcing`, `modules/web-sourcing`; Loxo scripts/templates excluded |
| subs-tracker-reconciliation | `modules/tracker` and protected `tracker-manager` |

The archived material is retained for recovery and historical comparison. Candidate/client records, credentials, direct-send scripts, and connector implementations are not copied into the canonical package. Any legacy reference names not present in this package are historical labels only.
