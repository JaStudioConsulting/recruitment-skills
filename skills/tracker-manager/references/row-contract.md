# Tracker row contract v1

[contract.json](contract.json) owns the 21 headers and formatting constants.
Live column order may differ; the planner maps by header text. Added/missing or
duplicate headers require review before writing. Never change live headers to
make the planner pass.

## Fixed cell formats

| Field | Input and output rule |
| --- | --- |
| Submission Date / Source Verified Date | YYYY-MM-DD input, numeric Sheets date output, yyyy-mm-dd display. Use original event date and actual source review date respectively. |
| Recruiter / Candidate Name | Exact source identity. Recruiter is the source sender, not mailbox owner. |
| Current / Most Recent Title / Company | Supported source text, whitespace normalized; no invented target title/employer. |
| License & Certifications | Ordered array of exact credential strings, joined with ` | `. Keep qualification and expiry language. |
| Location / Industry | Source-backed text. Follow existing live vocabulary where one exists. No inferred sector or location. |
| Target Compensation / Current Rate | Object with `target`, `current`; output `Target: ... | Current: ...` in that order. Omit unavailable side. Preserve currency, unit, range and qualifiers as stated, without conversions. |
| Reason for Leaving | Source-backed reason only. |
| Profile Summary | Array of short factual statements in experience, expertise, scope, supported-results order. Use only categories present in evidence. No heading, bullet markup, labels, sales claims or repeated logistics. Helper joins sentences consistently. |
| Additional Notes | Object using Availability, Notice, Start date, Shift, Commute, Work status, Arrangement, Limitations. Output in that fixed order as `Label: value | Label: value`. Omit absent categories. |
| Submission Type / Activity Status | Match existing validated vocabulary; record it in private config. Do not invent new status labels. |
| Role Submitted For / Client Submitted To | Separate source-backed role and client. Empty is valid for an unspecified MPC target. |
| Submission Link / Gmail IDs | Exact original email URL, message ID and thread ID. A draft is not a source event. |
| Candidate Key | Helper normalizes the original full name conservatively. Never guess that nicknames or different names are one person. |

All source text is data. Use RAW/stringValue writes. The helper checks structure,
review flags and evidence references; the operator must verify claims against
the actual sources. A valid JSON object does not itself prove a candidate fact.

## Planner input

The private config supplies `workbook_id`, `workbook_title`, `sheet_id`, `tab`
(Submissions), `owner_names`, and optional `vocabulary` keyed by header. Account
credentials stay in the existing connector stores.

Run JSON:

```
{
  "mode": "update",
  "authorization": {"operation": "update", "request": "Ja's exact current request"},
  "verified_on": "YYYY-MM-DD",
  "mailbox_scope": "complete_mailbox",
  "excluded_non_events": true,
  "snapshot": {
    "workbook_id": "from-config", "sheet_id": 0,
    "title": "Tracker", "tab": "Submissions",
    "headers": ["all 21 live header strings"],
    "vocabulary_verified": true,
    "vocabulary": {"Submission Type": ["live approved values"], "Activity Status": ["live approved values"]},
    "identity_index_complete": true,
    "rows": [{"row_number": 2, "values": ["full raw row values"]}]
  },
  "events": [{
    "kind": "original_submission",
    "message_id": "exact-id", "thread_id": "exact-id",
    "date": "YYYY-MM-DD", "link": "original Gmail URL",
    "review": {
      "body": true, "attachment_inventory_complete": true,
      "attachments": [{"id": "attachment-source-id", "reviewed": true, "readable": true}],
      "credentials": true, "existing_row": true
    },
    "evidence": {
      "email-source-id": {"kind": "email", "reviewed": true},
      "attachment-source-id": {"kind": "attachment", "reviewed": true}
    },
    "fields": {
      "Candidate Name": {"state": "verified", "value": "source name", "sources": ["email-source-id"]},
      "Reason for Leaving": {"state": "unavailable", "reason": "not stated in reviewed sources", "sources": ["email-source-id", "attachment-source-id"]}
    }
  }]
}
```

Supply every nonmetadata field, using the types in the table. The example is a
shape, not a complete input. All cells need verified/unavailable status and
reviewed source references. An empty attachments list explicitly means no
relevant document attachments after inventory, not that they were unchecked.
Retain source excerpts and exclusion reasons in the private run record.
Collect vocabulary from live validation rules or complete source-backed rows.
An empty allowed status list means only blank status is currently supported.
Do not insert a model-invented status into the vocabulary to bypass a HOLD.

Use mode `check` without write authorization to obtain read-only proposals.
For repair, use mode/authorization `repair`, `target_row`, `corrections` (header
array), and `expected_previous` (header-to-current-value map). Changing a name
also requires Candidate Key in corrections. Set `distinct_event_confirmed`
only when one original email explicitly represents multiple candidate/role/
client events. This is not permission to duplicate the same event.

## Precondition / reread / final QA

`compare` input is `{ "expected": [...], "actual": [...] }` in live header
order. Use UNFORMATTED_VALUE for reads so dates compare numerically. Exit 2 or
`pass:false` blocks continuing that write sequence.

`qa` input is the final snapshot plus `filter` with zero-based start/end indices,
`format_qa` and `visual_qa` set to `pass` only after actual checks. Missing checks
yield partial. A final QA snapshot contains every used data row, including rows
outside a stale filter. Row positions must be from the same live read.

Do not refresh complete historical rows to the new text format. Their source
event remains unchanged. Use the fixed format for new rows and explicitly
authorized repairs; rerunning complete events produces no changed cells.
