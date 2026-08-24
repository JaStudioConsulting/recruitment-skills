# Boolean / X-ray Patterns by Platform

Reference templates for building the up-to-5 boolean strings. Swap in real title
synonyms, skills, and location from the actual criteria — these are shapes, not literal
strings to copy.

## LinkedIn (via Google X-ray, since LinkedIn blocks direct search scraping)
```
site:linkedin.com/in ("title A" OR "title B") "location" -intitle:jobs
site:linkedin.com/in "title" "must-have skill" -recruiter -staffing
```
Use quotes around exact titles/skills. Use `-recruiter -staffing -"talent acquisition"`
to filter out recruiters who show up in noise when sourcing technical/trade roles.

## Indeed
```
site:indeed.com/r ("title A" OR "title B") "location"
site:indeed.com/cmp resumes "title" "skill"
```
Indeed resume pages are at `/r/` — `/cmp` is company pages, not useful for sourcing.

## GitHub (engineering/technical roles only)
```
site:github.com "title" "location" followers:>5
```
Only relevant when the role is software/technical and a GitHub presence is a realistic
signal (e.g. not for machinists/welders — skip this platform for trades roles).

## General X-ray (no site restriction, casts wider)
```
("title A" OR "title B") "location" ("must-have certification" OR "must-have skill") -jobs -hiring
```
Use when LinkedIn/Indeed-specific strings come back thin, to catch personal sites,
association directories, or niche boards.

## Operators worth knowing
- `site:` restricts to a domain.
- `intitle:` / `-intitle:` filters by page title (good for excluding job postings).
- `-keyword` excludes noisy terms (recruiter, staffing, jobs, hiring).
- Quoted phrases (`"exact phrase"`) for titles/skills that must match exactly.
- `OR` between alternatives, parentheses to group — don't mix without parens.

## Picking which 5 to actually run
Order of priority when criteria support multiple platforms:
1. LinkedIn X-ray with primary title.
2. LinkedIn X-ray with title synonym or secondary must-have.
3. Indeed resume search.
4. Platform-specific (GitHub, association directory, etc.) if relevant to the role.
5. General X-ray with no site restriction, as a catch-all.

Drop any of these that clearly don't apply (e.g. skip GitHub for a forklift operator
search) rather than padding out to 5 for its own sake.
