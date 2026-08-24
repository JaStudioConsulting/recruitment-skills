# Loxo Read-Only Candidate Dashboard Skill

This skill standardizes the workflow used to review one Loxo job at a time and create a standalone local HTML candidate dashboard.

## Main file

- `GUIDE.md` — internal instructions routed by `$recruiter`

## Supporting files

- `references/row-format.md` — final table and field rules
- `examples/sample_candidates.json` — normalized sample input
- `scripts/build_dashboard.py` — reusable HTML dashboard generator

## Build the sample dashboard

```bash
python3 scripts/build_dashboard.py examples/sample_candidates.json sample-dashboard.html
```

The generated HTML stores Decision and Notes in the local browser only. It does not connect to or write back to Loxo.
