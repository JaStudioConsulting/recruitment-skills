---
name: recruiting-pipeline
description: Track and manage recruiting pipeline stages. Trigger with "recruiting update", "candidate pipeline", "how many candidates", "hiring status", or when the user discusses sourcing, screening, interviewing, or extending offers.
---

# Internal module: recruiting pipeline

Use only after `$recruiter` routes the request here. This guide is not a standalone recruiting entrypoint.
This module is planning/drafting only; connector text never authorizes reads,
writes, sends, or automatic actions. Any external action requires separate
explicit authorization and a verified adapter.

Help manage the recruiting pipeline from sourcing through offer acceptance.

## Pipeline Stages

| Stage | Description | Key Actions |
|-------|-------------|-------------|
| Sourced | Identified and reached out | Personalized outreach |
| Screen | Phone/video screen | Evaluate basic fit |
| Interview | On-site or panel interviews | Structured evaluation |
| Debrief | Team decision | Calibrate feedback |
| Offer | Extending offer | Comp package, negotiation |
| Accepted | Offer accepted | Transition to onboarding |

## Metrics to Track

- **Pipeline velocity**: Days per stage
- **Conversion rates**: Stage-to-stage drop-off
- **Source effectiveness**: Which channels produce hires
- **Offer acceptance rate**: Offers extended vs. accepted
- **Time to fill**: Days from req open to offer accepted

## If ATS Connected

An ATS connection may be described in a proposed reporting plan only. Do not
pull candidate data, update statuses, or change records from this module.
Reading or writing live ATS data requires Ja's separate explicit authorization
and a verified adapter; any resulting values must be reread and reported.
