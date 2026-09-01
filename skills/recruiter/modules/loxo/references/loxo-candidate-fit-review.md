# Loxo Job-Linked Candidate Fit Review

Use this workflow when Ja asks whether one candidate in a specific Loxo job
pipeline fits that role. It captures the demonstrated review sequence while
keeping qualification evidence, contact history, and optional LinkedIn
corroboration separate.

This workflow is read-only. It does not authorize a stage change, status change,
note, activity, ownership update, profile edit, outreach, submission, rejection,
download, send, or LinkedIn interaction.

Never store live candidate names, person or job IDs, email addresses, phone
numbers, clients, employers, compensation values, private notes, or copied
LinkedIn URLs in this reusable reference.

## Required context

- the exact current Loxo job or an unmistakable job title;
- the exact candidate attached to that job pipeline; and
- the current JD, approved intake evidence, or permission to read the job record.

If the job or candidate is ambiguous, stop. Do not review a person from a name
alone or reuse requirements from another role.

## Review sequence

### 1. Establish the role before judging the candidate

Open the exact job pipeline and verify the visible job title. Read the current
JD and approved intake evidence first. Separate:

- true must-haves from preferences;
- target role, level, and demonstrated scope;
- industry, plant, product, equipment, systems, and technical requirements;
- mandatory education, licences, certifications, or work status; and
- location, onsite, shift, travel, and other explicit constraints.

Do not turn remembered client preferences or another candidate's screening
questions into requirements.

### 2. Confirm the candidate and job association

Select the exact candidate from the pipeline. If Loxo opens the candidate in a
new tab, window, or side panel, verify the candidate identity and the attachment
to the same target job before continuing. A highlighted pipeline row alone is
not enough.

### 3. Read Profile for context

Use **Profile** for the current Loxo snapshot:

- current title, employer, and location;
- Loxo industry, specialty, niche, and other visible categories;
- the target-job attachment and current stage; and
- visible experience, education, compensation, or logistics fields.

Treat summaries, tags, categories, and incomplete profile fields as leads, not
proof that a requirement is met. Label any fact used from this surface as
`Loxo Profile`.

### 4. Read Resume for qualification evidence

Use **Resume** as the primary Loxo qualification source for titles, employers,
dates, duties, education, certifications, tools, equipment, and demonstrated
scope. Compare direct evidence against each must-have.

If the resume is missing, unavailable, unreadable, or too thin, use
`NEEDS VERIFICATION` unless another verified source proves a hard-gate failure.
Do not fill missing evidence from a title, employer reputation, profile tag, or
assumption.

### 5. Read job-specific Activity only when relevant

Use **Activity** to establish factual contact and pipeline history, not technical
qualification. Filter to or visibly confirm the same target job before using:

- dated recruiter notes;
- calls, texts, or emails;
- prior submissions or pipeline movements; and
- candidate-confirmed logistics or acceptance details.

Activity from another job does not belong in this review. A resume does not
prove contact history, and Activity does not prove qualification.

### 6. Use LinkedIn only as optional corroboration

If the Loxo profile visibly contains a LinkedIn social-profile link and a public
cross-check is useful, follow `loxo-linkedin-candidate-vetting.md`. Open only the
exact link attached to the Loxo profile. Do not search for a substitute identity.

LinkedIn may corroborate current title, employer, location, dates, or chronology.
It does not prove compensation, availability, work status, credentials,
interest, commute willingness, or unlisted responsibilities. If sources
conflict, preserve both versions, label each source, and use `NEEDS VERIFICATION`
when freshness or identity cannot be resolved. A missing LinkedIn link is not a
qualification gap.

### 7. Decide conservatively

Use the recruiter `decision-framework.md` and `vetting-framework.md` and return
one repository-standard verdict:

- `GO` - the candidate's direct evidence supports the must-haves and no verified
  hard gate fails;
- `NEEDS VERIFICATION` - the candidate may fit, but missing evidence, a source
  conflict, or an unanswered hard gate can change the decision; or
- `NO-GO` - a verified must-have fails or the demonstrated experience is clearly
  outside the role's core scope.

Unknown never means positive. Use `NO-GO` only for a clear evidence-backed
conflict, not merely because a field or resume is missing.

### 8. Return without changing Loxo

Return to the same job pipeline after the review. Do not change the candidate's
stage, status, ownership, notes, Activity, outreach, job association, or profile.
If Ja later authorizes an exact action, route it separately through the protected
Loxo workflow and recheck the live job, person, stage, and proposed payload.

## Result for Ja

Return:

```text
Decision: GO | NEEDS VERIFICATION | NO-GO
Confidence: High | Medium | Low
Strongest role evidence:
- [source-labelled fact tied to a must-have]
Material gaps or conflicts:
- [missing, unclear, or contradictory requirement]
Job activity:
- [dated same-job fact, only when relevant]
Next human step:
- [call, verify, hold, or no action; do not execute it]
```

Keep the answer concise and source-grounded. Review one candidate against one
job at a time unless Ja explicitly asks for a batch ranking.
