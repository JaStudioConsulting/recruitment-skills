# Export Mode

Export only rows Ja has approved. Research and approval happen before file creation.

## Formats

### Generic

Columns:

`Full Name, Title, Company, Location, LinkedIn, Status, Fit/Priority, Confidence, Evidence, Gaps/Risks, Notes`

### Loxo-ready

Columns:

`First Name, Last Name, Full Name, Title, Company, Location, LinkedIn, Tags, Notes`

Loxo export prepares a file only. Do not import or write to Loxo from this skill.

## Script

Run:

```bash
python3 scripts/sourcing_rows.py \
  --data approved_rows.json \
  --kind candidate \
  --format generic \
  --label "hse-specialist-belleville" \
  --outdir /absolute/path/to/output
```

Change `--kind` to `prospect` and `--format` to `loxo` when needed.

The script:

- removes repeated header rows
- deduplicates by normalized LinkedIn URL, then name plus company
- preserves the first approved row and reports removed duplicates
- produces safe CSV cells
- returns a JSON summary with path and row counts

Before confirming completion, inspect the header, row count, and two sample rows. Report the
absolute output path.
