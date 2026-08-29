# Loxo And LinkedIn Candidate Vetting

Use this route before ranking, pitching, or shortlisting a candidate when the
Loxo person profile visibly contains a LinkedIn social-profile link. This is a
read-only verification workflow. It does not authorize a Loxo write, LinkedIn
interaction, submission, pitch, message, download, or send.

Do not place live candidate names, person or job IDs, email addresses, employers,
clients, compensation values, contact data, or copied LinkedIn URLs in this
reusable reference.

## Identity boundary

The exact LinkedIn link visible on the open Loxo candidate profile is the only
permitted identity bridge.

- If the LinkedIn icon or social-profile link is present, open that exact link.
- If it is absent, broken, redirected to a different person, or identity remains
  uncertain, stop LinkedIn verification and mark `NEEDS VERIFICATION`.
- Never search LinkedIn or the web by name, title, company, location, or another
  guessed combination to find a substitute profile.
- Never treat a similar name, photo, employer, or career path as an identity
  match.

## Step 1: Establish the recruiting context

Choose the correct context before evaluating the candidate:

- For a job-linked review or submission, open the current target job and read
  the JD, intake evidence, and relevant internal notes. Confirm the candidate is
  associated with that exact job.
- For proactive MPC/Pitch, use the approved client, deal, role, or
  candidate-marketing brief. A job association is not required. If no useful
  brief exists, rank only general placeability and state that role-specific fit
  is unscored.

State the must-haves, useful preferences, location or onsite expectation, and
any verified acceptance terms that apply to the chosen context.

Then open the Loxo candidate profile and check, in this order:

1. exact target-job association when the route is job-linked
2. current pipeline stage
3. recent Activity, including prior contact or submission evidence
4. Do Not Contact status or equivalent restriction
5. record ownership and any conflict requiring Ja's review

Stop or flag the candidate when a required job association is missing, the
chosen context is ambiguous, a restriction applies, ownership is unresolved, or
the Activity history makes the proposed use inappropriate. Do not use LinkedIn
browsing to bypass these controls.

## Step 2: Read the linked public profile

Only after Step 1 passes, use the exact visible LinkedIn link from Loxo. Read
publicly visible facts only:

- current title
- current company
- employment dates or tenure indicators
- location
- responsibilities relevant to the JD
- education

Record whether each item was visible, absent, or ambiguous. Treat every public
LinkedIn claim as a preliminary screening signal until candidate-confirmed. Do
not infer hidden details, contact data, compensation, availability, work
authorization, credentials, interest, or willingness to commute.

## Step 3: Reconcile sources without changing Loxo

Compare the LinkedIn facts with the current Loxo profile and the task's stronger
candidate evidence. Label every conflict with its source and apparent freshness,
for example `Loxo - older activity date` and `LinkedIn - current public profile`.

- Never overwrite, edit, or silently correct Loxo.
- Treat public LinkedIn as a preliminary signal about current public status and
  as a source of follow-up questions, not as an authoritative candidate fact or
  permission to rewrite the candidate record.
- For candidate packaging, the resume and explicit candidate call evidence remain
  higher-authority evidence than public LinkedIn.
- If LinkedIn appears newer, flag the stale Loxo field and ask the candidate to
  confirm the change before using it as a private recruiting fact.
- If LinkedIn appears older or incomplete, keep the stronger resume or call fact
  and flag the public profile as stale or incomplete.
- When freshness or identity cannot be resolved, preserve both versions and use
  `NEEDS VERIFICATION`.

## Step 4: Score fit and acceptance separately

Do not let a strong title match hide practical acceptance risk.

### Technical fit

Assess only source-supported evidence against the JD:

- required experience and responsibilities
- industry or operating environment
- seniority and scope
- required education or credentials
- material gaps or conflicting dates

### Acceptance risk

Assess separately and preserve unknowns:

- title or level alignment
- compensation alignment
- commute, location, and onsite expectations
- availability or notice period

LinkedIn may support title, current company, dates, and public location. It does
not prove compensation, commute willingness, onsite acceptance, availability,
or interest. Those remain questions unless verified by a resume, call, Activity,
or other approved direct evidence.

## Step 5: Rank and recommend

Return a ranked shortlist using exactly these verdicts:

- `GO` - identity bridge is exact, controls pass, must-haves are evidenced, and
  no unresolved issue blocks the intended next step.
- `NEEDS VERIFICATION` - potentially viable, but identity, source conflict,
  technical evidence, or acceptance risk still needs confirmation.
- `NO-GO` - a verified must-have fails, a restriction applies, the person is
  clearly outside scope, or the intended use is prohibited.

For each candidate include:

```text
Rank | Verdict | Technical fit | Acceptance risk | Source evidence | Stale-data flags | Follow-up questions
```

Keep evidence source-labeled and concise. State unknowns directly. Do not expose
the LinkedIn URL or unnecessary personal data in the shortlist.

## Step 6: Choose the protected next route

The intended use determines the Loxo surface; this workflow does not execute it.

- Use `MPC` or `Pitch` only for proactive candidate marketing where there is no
  specific open job submission.
- Use `Submit Candidates` only for a candidate tied to one specific job, after
  the required job, evidence, candidate-approval, duplicate-submission,
  client-permission, recipient, content, and final human-approval gates pass.
- If client terms or permission to share are unresolved, prepare only a protected
  anonymous teaser. Do not expose the candidate's name, resume, LinkedIn profile,
  exact employer, email, phone number, or other contact data.
- Do not write to Loxo or send, submit, pitch, share, or message from this route.
  Route any separately authorized future action through the applicable protected
  workflow and its current-state verification gates.

## Result for Ja

Return:

1. the ranked shortlist
2. source-by-source conflicts and stale-data flags
3. unanswered technical-fit questions
4. unanswered acceptance-risk questions
5. the protected next route: `MPC/Pitch`, `Submit Candidates`, `anonymous teaser`,
   or `no action`

Do not include candidate-specific examples in this repository reference.
