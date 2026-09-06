# Final Candidate Row Format

| Stage | 🟣 Applied | Candidate | Recent Employment Snapshot | Industry | Tickets / Licences | Activity / Outreach | Decision | Notes |
|---|---|---|---|---|---|---|---|---|

Decision values are `Unreviewed`, `Priority`, `Screen`, `Hold`, `Pass`,
`Contacted`, or `Submit`. Decision and Notes are local browser fields only.

## Employment rules

- Include month and year when available.
- Keep company, title, and dates together.
- Prefer recent and relevant history covering up to 10 years.
- Include older history only when it materially identifies the candidate's background.
- Summarize tenure over 10 years.
- Show progression, stability, seniority, job-hopping, and screening value.
- Never invent dates, titles, industries, or licences.

## Applied rule

The purple Applied field is independent from Kanban stage.

## Activity rule

Use only confirmed Loxo activity. Job-specific outreach takes priority over general history.

## Row schema

Each row requires `id`, exact `stage`, boolean `applied`, `candidate`,
`employment` (array), `employment_summary`, `industry`, `tickets`, `activity`,
and an `activity_type` of `none`, `attempted`, `reached`, `bounced`, or
`replied`. The builder input is an object with `job` and `candidates` keys.
Synthetic builder coverage is test-only under `tests/fixtures`, never in
production records.

From the repository root, the documented smoke test is:

```bash
python3 skills/recruiter/modules/loxo-readonly-candidate-dashboard/scripts/build_dashboard.py \
  tests/fixtures/synthetic-candidate-dashboard.json /tmp/synthetic-candidate-dashboard.html
```
