---
name: job-loxo
description: Create, audit, validate, publish, and verify Loxo job postings for Ja and Top Tier Talent Group. Use whenever Ja asks about a new Loxo job, duplicate title-and-city checks, adjacent-role overlap, title selection, Adzuna salary research, job-description drafting, Loxo field preparation, publishing, or confirming whether a job is active and live. Trigger even when Ja only asks whether a proposed job title or salary makes sense. Excludes candidate sourcing and all email, reply, notification, and outreach work.
compatibility: Requires connected Loxo read/write tools for live job checks and ADZUNA_APP_ID plus ADZUNA_API_KEY for salary research. Browser access is an optional fallback when the Loxo API omits a visible UI field.
---

# Job Loxo

Build Loxo jobs without duplicates, unsupported salaries, or accidental overlap with existing roles.
Keep the workflow direct. Ground decisions in live Loxo and Adzuna data before drafting or changing records.

## Scope

Use this skill for:

- Understanding an internal request for one or more Loxo job postings.
- Checking whether the same title and city already exist.
- Inspecting adjacent jobs that could create confusing overlap.
- Selecting a public title that remains close to the request.
- Researching salary evidence through Adzuna.
- Drafting a recruiter-ready public job description.
- Creating, activating, publishing, and verifying a Loxo job after approval.

Do not use this skill for:

- Email replies, Gmail drafts, notifications, or messages to coworkers.
- Candidate sourcing, screening, ranking, submissions, or outreach.
- Inventing a requisition, client commitment, shift, benefit, credential, or salary.

Stop after Loxo verification. Route email or candidate work to its dedicated skill.

## Respect The User's Boundary

Classify the request before doing anything:

- **Question or discussion:** answer only. Read-only checks are allowed when needed. Do not create a plan or change Loxo.
- **Draft here:** prepare the title, salary evidence, or JD in chat only.
- **Prepare for creation:** assemble the exact Loxo field packet, but do not save it.
- **Create or publish:** show the final packet and obtain Ja's explicit approval before the first Loxo write.
- **Verify:** read Loxo and report current state without changing it.

If Ja says `do not execute`, `question only`, `do not plan`, or equivalent, treat that as a hard boundary.

## Workflow

### 1. Extract The Actual Request

Separate confirmed instructions from interpretations:

- Requested title or title family.
- City and province.
- Permanent, contract, or temporary status.
- Business purpose: active requisition, sourcing job, pipeline coverage, or future marketing.
- Client or company, if explicitly named.
- Industry, if explicitly named.
- Requirement to avoid active duplicates.
- Any instruction to hide the company or omit a client name publicly.

Preserve the requester's wording as the default. Do not improve the title merely because another title sounds more polished.
Label reasonable context as an inference. For example, an Autosystems-adjacent role implies automotive manufacturing context, but that is not the same as an explicit industry instruction.

### 2. Check Loxo Before Drafting

Use live Loxo job data, not memory.

1. Search the exact proposed title and exact city.
2. Check `status` and `published` separately; `Active` does not always mean publicly live.
3. Search each component of a hybrid title separately.
   - Example: `Press Operator / Mold Maker` requires checks for the exact hybrid, `Press Operator`, and `Mold Maker`.
4. Inspect adjacent active jobs that could attract the same applicants.
5. Record title, city, status, published state, company, salary, owners, and public URL.

Do not treat a partial title match as an exact duplicate. Do not ignore an adjacent role when its duties, seniority, or applicant pool substantially overlap.

### 3. Decide The Title Conservatively

Keep the original title unless one of these is true:

- The exact title and city already have an active job.
- The title combines materially different occupations or pay levels.
- The title implies duties, licensing, seniority, or formal supervision that the request does not support.
- Ja explicitly chooses a different title.

Use title words candidates actually search. Put industry and related keywords in the body when adding them to the title would make it long or duplicative.

Practical distinctions:

- `Press Operator` is an operator job; Tool and Die or Mold Maker duties and pay should not be hidden under it.
- `Lead Mechanical Assembler` is hands-on and may guide workflow or train peers.
- `Production Team Lead` can imply attendance, performance, labour allocation, and formal team accountability.
- `Licensed Millwright` or `Millwright Lead` requires a real 433A requirement and a different pay market.
- A licence may be an asset without becoming part of the title or a mandatory requirement.

### 4. Validate Salary With Adzuna

Use `scripts/adzuna_salary_lookup.py` when shell access is available. Otherwise query Adzuna directly.

Search order:

1. Exact title plus exact city.
2. Exact title within an explicitly stated radius.
3. Component or adjacent titles in the city.
4. Exact or component titles across Ontario.

State each expansion. Never describe Ontario or 100-kilometre results as Belleville results.

Adzuna safeguards:

- Adzuna contains job postings, not candidate inventory. Job counts do not prove candidate supply.
- Inspect actual returned titles and locations before citing a count; broad search results can include unrelated jobs.
- Deduplicate repeated posting IDs.
- Prefer exact-title salary records over Adzuna's overall mean when results are mixed.
- Convert annual salary to hourly using 2,080 hours only when an hourly comparison is useful.
- If the exact title has no salary records, say so and identify the proxies used.
- Do not invent a range to fill a Loxo field.

Return salary evidence in this shape:

```text
Exact title/city: [count and range, or no data]
Closest local comparator: [title and range]
Ontario comparator: [title and range]
Recommended range: [range]
Confidence: High / Moderate / Low — [reason]
```

### 5. Test For Overlap

Compare the proposed job with adjacent active Loxo roles across:

- Public title.
- Hands-on work versus formal supervision.
- Core equipment and processes.
- Required credential or ticket.
- Compensation.
- Candidate population.

Differentiate through real scope, not cosmetic wording. Two roles can share some salary range without being duplicates.

For a lead-hand role that must remain below a Production Team Lead:

- Keep the person actively performing assembly or production work.
- Allow training, work coordination, quality checks, and basic troubleshooting.
- Avoid discipline, attendance ownership, performance reviews, headcount management, or full-shift accountability unless verified.

### 6. Draft The JD

Use this order:

```markdown
# [Public Job Title]

Location: [City, Province]
Employment: [Full-time/Part-time, Permanent/Contract]
Compensation: [Verified range]
Industry: [Confirmed industry, or omit]

[One short positioning paragraph]

## What You'll Do
- [Concrete responsibility]

## What You Bring
- [Verified requirement]

## How to Apply
[Application instruction]

## Equal Opportunity Statement
[Exact approved text]

## Use of Artificial Intelligence in Recruitment
[Exact approved text]
```

Read `references/compliance-footer.md` and reproduce the approved statements unchanged.

Drafting rules:

- Do not put `Automotive Manufacturing` in the title unless Ja requests it.
- Do not use `confidential` publicly unless Ja requests it. This is separate from Loxo's `company_hidden` setting.
- Do not claim multiple openings, benefits, premiums, shifts, team size, permanent status, or certification requirements unless confirmed.
- Keep the positioning paragraph general enough to attract adjacent high-volume manufacturing candidates when that is the sourcing goal.
- Treat automotive or Tier 1/Tier 2 experience as an asset unless it is a confirmed requirement.
- Use Ontario trade names accurately. A 433A Millwright ticket is not interchangeable with a Tool and Die or electrical licence.

### 7. Prepare The Loxo Job Packet

Before any write, resolve every required identifier through Loxo lookup tools. Do not guess IDs.

Minimum create fields:

- `title`
- `raw_company_name`
- `job_type_id`

Normal publishing packet:

- Title and published name.
- Existing company record or approved raw company name.
- City, state, country, and postal code if known.
- Full job description.
- Job type and status.
- Salary string and cadence.
- Category IDs.
- Owner emails.
- `active` state.
- `published` state and dates.
- `company_hidden` choice.

Show the complete packet to Ja before saving. Call out every missing field and every inference.

### 8. Gate Every Loxo Write

Creating, editing, activating, or publishing a job changes external state.

Before the first write, show:

```text
Title:
Company:
Location:
Employment:
Compensation:
Category:
Owners:
Company hidden:
Active:
Published:
Description status:
```

Wait for Ja's explicit `yes`, `create it`, `publish it`, or equivalent approval of that packet.
An earlier discussion about capability is not approval to create the record.

### 9. Verify After Creation

After each write, retrieve the job again and confirm:

- Correct title and city.
- Correct company and `company_hidden` state.
- Correct salary, type, category, owners, and description.
- Status is `Active` when requested.
- `published` is `true` when requested.
- A public URL exists.
- Exact title-and-city search returns the expected record count.

If possible, open the public URL read-only and confirm the page resolves and does not expose a hidden company.
Report the internal job ID and public URL.

Stop there. Do not draft or send email notifications from this skill.

## Output Discipline

- Lead with the answer or verified state, not process narration.
- Use `Confirmed live`, `Not live`, `Assumptions`, and `Not confirmed` only when those distinctions matter.
- For question-only requests, answer in a few lines.
- For draft requests, provide the draft directly without a plan.
- For create requests, show one compact approval packet.
- For verification, report `Active`, `Published`, and public URL separately.
