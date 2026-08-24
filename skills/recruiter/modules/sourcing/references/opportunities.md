# Candidate Opportunities Mode

Use when Ja says `map opportunities`, `map jobs for this candidate`, `what roles fit this
person`, `scan our jobs`, or asks for a candidate-to-job market map.

## Scope Selection

- Internal opportunity scan: accessible open roles only.
- Public opportunity scan: current public job postings.
- Combined opportunity scan: combine and deduplicate both sources.
- Natural-language `map jobs for this candidate` defaults to Ja's open roles.
- `market map`, `public opportunities`, or `what else is out there` means public jobs.
- `all opportunities` means both.

If the requested internal source is unavailable, state that clearly. Do not silently replace an
internal-role request with a public-web search.

This mode is read-only. It may inspect accessible Loxo, Airtable, job files, or public postings,
but it does not update records, add candidates, apply to jobs, or send messages.

## Candidate Preference Card

Build this before scanning roles:

- Target and acceptable titles
- Seniority floor and ceiling
- Direct and acceptable adjacent industries
- Preferred location and maximum commute
- Relocation willingness
- Onsite, hybrid, or remote preference
- Compensation minimum and target
- Shift, schedule, travel, and overtime limits
- Work status or sponsorship needs
- Mandatory tools, licenses, certifications, systems, or environment
- Current employer and companies the candidate will not consider
- Motivations and explicit deal-breakers

Use source precedence:

1. Candidate's newest explicit statement or added instruction
2. Call transcript or recruiter call notes
3. Resume
4. Public profile

If sources conflict, use the newest explicit candidate statement and flag the conflict. Never
invent a preference from silence. Missing preference data is `Unconfirmed`.

## Role Scan

1. For public jobs, use `scripts/adzuna_search.py` first when `ADZUNA_APP_ID` and
   `ADZUNA_API_KEY` are configured. Adzuna supplies structured title, company, location,
   salary, date, description snippet, and posting link data.
2. Use Firecrawl/web search to verify top jobs, inspect employer career pages, fill missing
   requirements, and cover postings Adzuna does not return. Do not repeat broad searches when
   Adzuna already produced enough credible jobs.
3. Remove closed, duplicate, expired, or inaccessible postings.
4. Normalize syndicated copies to one underlying role using company, title, location, and job
   URL or requisition ID.
5. Check hard gates before scoring:
   - current-employer or explicit company exclusion
   - work authorization or sponsorship
   - mandatory license/certification
   - location/relocation or work-model deal-breaker
   - compensation below an explicit minimum
   - prohibited shift, schedule, or travel
6. Compare actual responsibilities and environment, not title alone.
7. Deepen research only for the top five or a gap that could change the ranking.

Adzuna returns description snippets, not guaranteed full job descriptions. Treat missing
requirements as `Unconfirmed` and verify decision-changing details from the employer posting.

Default scan budget: review up to 25 credible open roles and return the top 10. If more exist,
state the search boundary rather than dumping low-quality matches.

## Ratings

- `Strong`: Core job requirements and explicit preferences align; no hard gate fails.
- `Possible`: Credible technical fit with one material preference or requirement to confirm.
- `Stretch`: Multiple gaps, adjacent work, or meaningful level mismatch.
- `Reject`: Clear technical or preference mismatch.
- `Excluded`: Current employer, explicit company block, duplicate/closed posting, or another
  hard conflict.

Confidence reflects source quality, not fit strength.

## Output

Use exactly:

| Rank | Opportunity | Company | Location/Work Model | Source | Fit | Preference Alignment | Evidence | Gaps | Action |
|---:|---|---|---|---|---|---|---|---|---|

- Link `Opportunity` directly to the job posting or internal role when possible.
- Rank eligible roles first. Put excluded and rejected roles after them.
- `Action`: Present now, Verify with candidate, Hold, or Exclude.

After the table provide:

**Best opportunities:** top three with one-line reasons.

**Excluded:** role plus the exact hard gate.

**Ask candidate:** only missing preferences or deal-breakers that could change the top roles.

**Search boundary:** internal, public, or both; sources checked; date; and number of credible
roles reviewed.

## Adzuna Helper

Example:

```bash
python3 scripts/adzuna_search.py \
  --country ca \
  --what "senior accountant" \
  --where "Guelph Ontario" \
  --results 20 \
  --max-days-old 30 \
  --output /tmp/adzuna-jobs.json
```

Credentials load from environment variables or an explicitly supplied host-managed secret file. Never put them in the repository, command arguments, output, logs, or citations. See `skills/manifests/plugins.json`.
