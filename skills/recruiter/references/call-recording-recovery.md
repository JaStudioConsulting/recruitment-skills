# Call-recording recovery guidance

Read-only recovery for a required call recording or transcript. It never creates a Loxo activity or changes a record.

1. Search the host-configured downloads location for supported audio and verify the file exists. Use metadata and duration, not download time alone.
2. Search raw per-call transcript JSON, not truncated aggregate JSONL. Match candidate, date, phone, duration, city, employer, or role.
3. A RingCentral-style numeric ID must be confirmed in a real audio filename or download path. Tool-call nonces can resemble IDs and are not evidence.
4. If local evidence is absent, report not recovered. Cloud re-fetch requires an available connector and explicit scope. Never invent a recording or call fact.

Return evidence location, identity/date/duration match, limitations, and the next human-review step. Do not expose private audio or session contents in reusable output.
