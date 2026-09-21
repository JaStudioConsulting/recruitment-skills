---
name: web-sourcing
description: >
  Source candidates (or companies/contacts) off the open web using boolean/X-ray search
  across LinkedIn, Indeed, GitHub, and other platforms, then scrape and structure the
  results into a reviewable table and a final CSV. Use this whenever Ja asks to "find
  candidates", "source", "x-ray search", "boolean search", "find me [role] on LinkedIn",
  "search Indeed for", "pull profiles for [role]", or gives sourcing criteria (title,
  location, must-haves) and wants a list of people. Also trigger when she says "scrape
  LinkedIn/Indeed for X" or wants candidates found outside Loxo/Apollo. Picks
  Firecrawl, Playwright (via agent-browser), or Crawlee per site automatically — Ja does
  not need to name a tool. Tactical and token-efficient by design: capped boolean strings,
  capped pages per string, no brute-force crawling.
---

# Web Sourcing

Find real people matching sourcing criteria via boolean/X-ray web search, structure
results into a table, get Ja's approval, then export a CSV. Built for speed: this is a
targeted sweep, not an exhaustive crawl — burning tokens on page 5 of search results
loses more than it finds.

## Why the caps exist

Boolean sourcing has diminishing returns fast: the first couple of well-built strings
surface the best matches, and result quality drops sharply past page 2. Capping strings
and pages isn't a quality compromise — it's the efficient stopping point. If Ja wants
more after seeing the first batch, run another wave; don't front-load it.

## Workflow

### 1. Get criteria
Pull role/title, must-have skills, location, seniority, and any exclusions from the
chat, JD, or intake notes Ja provides. If criteria are too vague to build a boolean
string (e.g. no title and no skill), ask — don't guess and burn a search on a bad string.

### 2. Generate boolean/X-ray strings (max 5)
Build up to 5 strings, not more. Prioritize coverage over volume: vary title synonyms,
platform (`site:linkedin.com/in`, `site:indeed.com/r`, `site:github.com`, etc.), and key
must-have terms across the 5, rather than 5 near-duplicates. See
`references/boolean-patterns.md` for platform-specific templates and operators.

If 2-3 strings already cover the criteria well, stop there — 5 is a ceiling, not a quota.

### 3. Pick the right tool per string (let the site decide, not a fixed pipeline)
All three are available — choose based on what the target site needs, not a fixed order:

- **Firecrawl** (`firecrawl-search` skill / MCP) — default first move. Use for the actual
  boolean search and for scraping public, non-gated result pages. Lowest cost, already
  connected, handles JS-rendered pages fine.
- **Playwright** (`agent-browser` skill) — use only when a page requires login or
  interaction Firecrawl can't do (e.g. LinkedIn search results behind an auth wall,
  a site needing a click-through or infinite scroll to load more results).
- **Crawlee** — use when discovery has produced many individual profile URLs (think
  10-50+) that need systematic, repeatable fetching rather than one-off scrapes. Write a
  small throwaway Crawlee script for that batch; don't reach for it for a handful of URLs.

Tools can combine on one string if needed (e.g. Firecrawl finds result URLs, Playwright
opens the gated ones). Don't force a single tool for the whole run.

### 4. Scrape budget per string: page 1, then page 2 of the best match, then move on
For each boolean string: scrape page 1 of results. If page 1 looks like a strong match
for the criteria, also pull page 2. Then stop and move to the next string — do not paginate
further. "Best match" means the result set is clearly on-target (right titles, right
industry); if page 1 is weak, skip page 2 and move on rather than digging deeper into a
bad string.

### 5. Extract person-level data
For each candidate surfaced, capture only what's actually present on the page:
- Full Name
- Company (current)
- Tenure (time in current role/company, if stated or inferable from dates shown)
- LinkedIn link (or the profile URL from whichever platform)
- Contact info — email/phone, only if visibly published on the page itself
- Eligibility (`Eligible` or `Excluded`)
- Evidence Status (`Verified`, `Unconfirmed`, `Conflicting`, or `Outdated`)

Never invent or guess a value. If contact info isn't on the page, leave that field blank.
Don't run extra lookups (Apollo, ZoomInfo, etc.) to fill gaps here — that's a separate
enrichment step, not part of this skill. `recruitment-sourcing` is not a packaged route in
this repository. Stop and ask Ja before using an external enrichment capability.

### 6. Present the table — then STOP
Render results as a markdown table with exactly these columns, in this order:

| Full Name | Company | Tenure | LinkedIn Link | Contact Info | Eligibility | Evidence Status |

Then stop and wait. Do not generate the CSV yet. Ask Ja to review/edit/approve the list.
She may ask to drop rows, add more via another search wave, or fix a field — handle that
in the table before moving on.

Each row must carry exactly one evidence status: `Verified`, `Unconfirmed`, `Conflicting`,
or `Outdated`, before approval or export.

### 7. On approval, build the CSV
Once Ja explicitly approves (e.g. "looks good", "export it", "go"), run
`scripts/build_csv.py` with the approved rows to write the file. The script takes a JSON
array of row objects and writes a CSV with the same 7 columns to
`/absolute/path/to/output/<role-slug>-sourcing-<date>.csv`. Pass `--role` for the filename slug.

```bash
python3 scripts/build_csv.py --role "machinist-ohio" --data rows.json
```

Confirm the saved path back to Ja. Don't write the CSV before she approves — that's the
whole point of the gate.
