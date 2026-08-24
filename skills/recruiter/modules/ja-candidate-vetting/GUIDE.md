---
name: ja-candidate-vetting
description: Candidate vetting framework for Ja. Use when screening or vetting candidates for Ja. Defines strict assessment criteria for verifying candidate fit before submission. This is not for blind forwarding - it's for verifying fit, spotting risk, and deciding whether the candidate can be defended honestly.
allowed-tools:
  - Read
  - Bash
  - Grep
  - Glob
  - write
---

# Ja Candidate Vetting Framework

## Purpose

This file defines how to assess candidate fit before submission.

**This is not for blind forwarding.**
This is for verifying fit, spotting risk, and deciding whether the candidate can be defended honestly.

## Inputs

Use only the information that is actually provided, such as:

- resume
- intake notes
- call transcript
- candidate answers
- email thread
- job description
- client notes

## Non-negotiable rules

- Never assume a candidate led, owned, improved, or delivered anything unless it is clearly supported by source material or verbal confirmation.
- Vet technical fit first.
- Prefer same industry first. Adjacent industry is only acceptable when the overlap is strong and defensible.
- Do not inflate title, scope, ownership, team size, seniority, or impact.
- Use only proven facts.
- If the evidence is weak, say so plainly.
- Do not invent facts.
- Do not overpraise weak evidence.
- Do not force a fit.
- If the candidate would require spin to sell, do not recommend submission.

## Vetting sequence

Check in this order:

1. Can the candidate do the actual job?
2. Is the industry fit direct or strongly adjacent?
3. Does the title and scope align with the target role?
4. Is there proof of similar work, tools, systems, pace, or environment?
5. Are there measurable outcomes or concrete examples?
6. Can the candidate explain their work clearly?
7. Are tenure, gaps, and stability acceptable based on facts only?
8. Do compensation and logistics make sense?
9. Can the profile be defended honestly in front of the client?

## Required scoring

Rate the candidate from 1 to 5 on each of these:

- **Industry Fit** - Direct or adjacent industry match
- **Scope** - Title and actual responsibilities alignment
- **Impact Metrics** - Measurable outcomes or concrete examples
- **Communication** - Clear articulation of their work
- **Stability** - Tenure and gaps explained
- **Comp** - Compensation alignment

**Default submission rule: average must be 4.0 or higher for submission**

## What strong fit looks like

A strong candidate usually has:

- direct or highly adjacent industry fit
- scope that matches the role
- evidence of doing similar work
- measurable proof or concrete examples
- clean logistics
- no major unexplained risks
- enough verified material to support a clean submission

## What to flag

Flag these clearly:

- industry mismatch
- inflated title versus actual work
- vague bullets with no proof
- no measurable outcomes
- unstable tenure with no explanation
- compensation mismatch
- commute or relocation weakness
- weak communication
- anything that requires guessing

## Output contract

When asked for a fit check:

- If there is no fit, say: **no**
- If there is a fit, say: **yes** and state the industry
- Keep the answer grounded and direct
- No filler
- No assumptions
- No generic praise

## Submission readiness check

Before saying a candidate is ready, confirm there is enough verified information to support:

- reframed experience
- 3 to 5 real strengths
- logistics
- a clean and honest submission

If that support is missing, do not mark the candidate as ready.

## Default reasoning stance

Always pressure-test the profile with these questions:

- Can they do the work?
- Is the fit real?
- What will the client question?
- Can this be defended honestly?

If the answer breaks under pressure, do not push the candidate.

## Output templates

### Fit check

Use this when Ja wants a direct yes or no answer.

**No**

or

**Yes - [industry]**

### Expanded fit check

Use this when Ja wants a slightly fuller assessment.

```
Decision: [Yes / No]
Industry: [industry or closest relevant industry]

Scores:
- Industry Fit: [1-5]
- Scope: [1-5]
- Impact Metrics: [1-5]
- Communication: [1-5]
- Stability: [1-5]
- Comp: [1-5]

Risks:
- [risk]
- [risk]
- [risk]

Recommendation: [submit / do not submit]
```

## Hard stop conditions

Default to no if any of these are true unless strong evidence clearly offsets them:

- candidate cannot do the actual work
- industry gap is too wide
- scope is inflated or unclear
- evidence is too vague
- logistics fail the role
- recommendation would depend on assumptions

---

## Application to Loxo Candidate Review

When reviewing candidates in Loxo pipeline:

### For each Applied candidate:
1. Click candidate name to open profile
2. Click RESUME to view full work history
3. Apply vetting sequence (check above)
4. Rate on 1-5 scale for each criteria
5. Flag any risks
6. Make recommendation: Submit / Do Not Submit

### Criteria for Facilities Supervisor role (Example Manufacturing Ltd.):
- **Industry Fit**: Automotive manufacturing = STRONG, fast-based = acceptable
- Must have 5+ years facilities/maintenance experience (not just production floor)
- Experience with: chillers, towers, compressors, boilers, HVAC, contractors
- Equipment installation/upgrades, capital projects
- Spare parts/inventory management

**Strong matches:**
- Automotive manufacturing experience = STRONG FLAG - call immediately
- Fast-based industries (aerospace, industrial, manufacturing) = welcome
- Food industry = FLAG - unless dual-ticketed or transferable skills

---

## See Also

- [Loxo operating guide](../loxo/GUIDE.md) - repository-owned Loxo knowledge base
- [Loxo automation guide](../loxo-automation/GUIDE.md) - restricted browser actions and gates
