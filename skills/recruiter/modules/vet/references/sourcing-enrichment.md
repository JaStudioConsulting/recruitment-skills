# Sourcing & Contact Enrichment (ingested from Deepline GTM)

Distilled from the Deepline `deepline-gtm` skill (code.deepline.com), folded into vet so the
capability lives where Ja works. Use when a candidate's **contact info is missing** (email / phone /
LinkedIn), or when **sourcing** new candidates/companies before qualifying them.

> REQUIRES the Deepline engine to actually run: the `deepline` CLI (or its MCP tools) + provider
> API keys. Without those connected, this is reference/methodology only — set up Deepline first, or
> fall back to Loxo's built-in **Find Contact / Fetch Personal|Work Email** (see loxo skill).

## When to use (in the vet flow)
- Candidate qualifies but you lack a reachable **email/phone** → enrich before outreach/submission.
- Need to **source** candidates at target companies (e.g. "find quality managers at Tier-1 auto plants").
- Bulk: a CSV of names needs emails/phones filled before Loxo import.
Output feeds: **Loxo** (CSV import per loxo map) and **ja-writer** (outreach voice).

## Method (the non-negotiables)
1. **Companies first, then people.** Discover the company set, THEN find people at them. Don't start
   with broad title+industry people-search — noisy, unaffiliated results.
2. **Waterfall, not single-shot.** Chain providers with fallback; stop when found. Coalesce results.
3. **One-row pilot before full run.** `deepline enrich --input <csv> --output <csv> --rows 0:1 ...`
   Inspect coverage/accuracy on row 0, THEN run the full file. Paid actions = approval gate.
4. **Over-pull for falloff.** Want N? Start ~1.4×N. Contact search misses ~15-20% of companies;
   email waterfall misses ~5-10% of contacts. Don't fight the hard rows.
5. **Named output paths, NEVER `/tmp`.** Use a descriptive synthetic slug (e.g. `deepline/data/example-qm-emails`).
6. **Verify emails.** `leadmagic_email_validation` first, then corroborate. `zerobounce` for deliverability.

## Provider cheat-sheet (ROI order — free first)
- **Company search:** `free_simple_company_search` → `dropleads_search_people` → `crustdata_companydb_search`;
  fallback `exa_company_search`, `serper_google_maps_search` (local/SMB), `parallel_extract`.
- **People / LinkedIn:** `contactout`, `crustdata`, `exa_people_search`, `dropleads`.
- **Email find:** `findymail`, `prospeo`, `leadmagic`, `hunter`, `bettercontact`, `fullenrich`.
- **Phone find:** `datagma`, `enformion`, `trestle`, `lusha`.
- **Email verify:** `leadmagic_email_validation`, `zerobounce`.

## Recruiting recipe
1. Identify candidate (name + company + role) from Loxo / resume / list.
2. Email waterfall (findymail → prospeo → leadmagic) → verify.
3. Phone waterfall (datagma → enformion → trestle).
4. Coalesce, keep `_metadata` lineage, write named CSV.
5. Import to **Loxo** (CSV import). 6. Draft outreach via **ja-writer**; submit via **vet** Mode 2.

Provider playbooks are optional external integrations. Do not install, authenticate, or invoke an enrichment provider from this guide. If a provider is not already authorized and available, return the missing-capability blocker.
