# Loxo Platform Map And Workflow Overview

Use this reference to understand where work belongs in Loxo and to translate Ja's wording into the correct Loxo surface.

This is an orientation map only. It does not authorize a write, stage move, contact fetch, import, submission, campaign activation, message, or send. The approval gates, team ownership rules, duplicate and Activity checks, Do Not Contact rules, and source-integrity rules in `../GUIDE.md` remain controlling.

## Source And Confidence

- Primary source: `Loxo Workflow.mp4`, a first-party Loxo training recording provided by Ja.
- Duration: 7 minutes 52 seconds.
- Video SHA-256: `563a271d3b9dc1ea7130fa7e7f358a09c3d86e56e6f1b2f793ab8d0f10661921`.
- Analyzed: 2026-07-31 from the audio transcript and timestamped screen frames.
- The recording explains Loxo's general workflow. Ja's internal operating rules are stricter and take precedence.
- Treat names, jobs, companies, counts, campaign text, and stage contents shown in the recording as demonstrations, not Top Tier Talent Group records.

If the live interface differs from the recording, inspect the live page with Ego and use the live location of the control. Do not infer that a moved or renamed control changes Ja's approval rules.

## Platform Surface Map

| Ja's request or intent | Correct Loxo surface | What belongs there |
| --- | --- | --- |
| Create, open, or manage a vacancy | `Jobs` | Job record, client, location, JD, intake context, reports, and candidate pipeline |
| Understand what the client wants | Job `Overview`, `Manage`, internal notes, team notes, and attachments | JD, must-haves, level, location, compensation, feedback, and intake context |
| Find candidates for a specific job | Job `Add People` -> `Loxo Source` | Public and internal candidate search tied to the job |
| Find an existing person or check database history | `People` | Candidate or contact record, ownership, tags, lists, status, and recent activity |
| Review one candidate | Person Profile -> `Profile`, `Resume`, and `Activity` | Structured details, actual resume evidence, prior contact, notes, and job history |
| See or manage candidates for one vacancy | Job -> `Candidates` | Pipeline board, stages, cards, stage counts, and candidate actions |
| See candidate movement or current status | Job `Candidates` pipeline | Longlist, Shortlist, Outbound, Screening, Submitted, Interviewing, and later stages |
| Configure stage-linked outreach or contact fetching | Pipeline stage menu -> `Stage automations` | Campaign link, contact data options, sorting, and stage automation settings |
| Build or inspect a sequence independently | `Outreach` | Campaign stages, delays, senders, prospects, metrics, and ON/OFF status |
| Bring an external profile into Loxo | Loxo Chrome Extension | Person preview, Add to Database, candidate type, resume upload, experience, education, skills, and tags |
| Work with a client organization or account | `Companies` or `Sales CRM` | Company record, contacts, account activity, BD stages, and deals |
| Manage recruiter follow-ups | `Tasks` and `Schedule` | Tasks, calls, meetings, and calendar activity |
| Review operational reporting | `Reports` or the job `Reports` tab | Candidate, job, activity, status, and workflow reporting |
| Change agency-level configuration | `Settings` | Templates, email, phone, users, integrations, roles, and other configuration. Explicit authorization is required. |

## Video Workflow Map

### 1. Create The Job, 01:16 to 01:36

The recording starts from `Jobs` and opens the `New job` modal.

Visible fields and controls:

- Role title
- Display name after a title is selected
- Hiring company
- Location mode, demonstrated with `Remote`
- City, state, or country
- `Use an address`
- `Add timezone`
- Visibility, shown as `Default`
- `Continue`

The video enters a title, hiring organization, and location, then continues to Loxo Source. This is the vendor's minimum demonstration, not Ja's full job-intake standard.

### 2. Source Inside The Job, 01:36 to 03:15

The Source page is tied to the job and shows the job title, company, and job number at the top. `Done Sourcing` returns to the job.

The left panel shown in the recording includes:

- Public search mode
- Saved searches
- Search keyword or Boolean
- Natural Language Search
- Title
- Location
- Timezone, marked Beta
- Industry
- Years of Experience
- Skills
- Diversity
- Security Clearance
- Company
- Tenure
- Company Ranking

The video teaches two general search paths:

1. When the true must-haves are known, enter two or three must-have terms joined with `AND`, inspect the first results, then add only essential filters.
2. When the target profile is less certain, start with Natural Language Search, inspect the results, and refine the NLS prompt or add Boolean terms.

The recording warns that filters are exclusionary. Its location rule is to stay as broad as reasonably possible unless location is a real deal-breaker. For Ja's work, use the location, industry, level, and experience criteria confirmed under the stricter sourcing workflow.

The NLS modal states that the description should focus on candidate nice-to-haves. It directs absolute must-haves to filters or Boolean and includes a `Write with AI` control. Treat AI-written search text as a draft to inspect.

### 3. Read Candidate Cards, 02:58 to 03:55

The results list is ranked and each card exposes enough information for initial triage:

- Readiness indicator
- Candidate name and location
- Experience timeline with matching text highlighted
- Current and past titles and employers
- Education and certifications when present
- Skills
- `Show more`
- `Yes`, `Maybe`, and `Hide`
- Selection checkbox
- Overflow menu

The vendor demonstration assigns these meanings:

| Control | Demonstrated result |
| --- | --- |
| `Yes` | Treat as a strong fit, fetch available contact information, and add to Shortlist |
| `Maybe` | Keep for later review in Longlist |
| `Hide` | Remove the person from the current job search view so they are not reviewed again for that search |

These controls change Loxo state. They remain gated actions under Ja's rules. `Hide` is not the same as deleting the person record.

### 4. Refine And Build The Pool, 03:55 to 04:49

The video recommends reviewing candidates methodically, page by page, then adjusting Boolean and filters until a strong concentration of relevant talent appears.

Vendor productivity guidance:

- Work in focused 15 to 30 minute sourcing sprints.
- Build a Longlist of roughly 200 to 300 people when the role and market support it.
- Treat that number as a broad vendor target, not a quota or a reason to include weak candidates.
- Save and reuse strong search logic where appropriate.

Ja's quality, ownership, duplicate, prior-Activity, conflict, and approval gates still apply before a person is added or contacted.

### 5. Expand Outside Loxo, 04:49 to 05:18

The demonstrated source order is:

1. Search internal data and Loxo's public data.
2. Move to external sources such as GitHub, Wellfound, job boards, or specialist directories.
3. Use the Loxo Chrome Extension to bring a relevant external person into the workflow.

The Chrome Extension panel shown in the video contains:

- Workspace or agency selector
- Person preview
- `Add to database` and its dropdown
- `Import as Candidate`
- Resume upload or drag and drop for PDF files
- Experience
- Education
- Skills
- Tags

Adding a person or uploading a resume is a write. Show Ja the target person, type, job or list destination, ownership findings, and any tags before committing.

### 6. Link Outreach To A Stage, 05:18 to 06:10

The video moves from the job pipeline to a stage automation panel.

Visible stage automation controls include:

- Automate cold outreach
- `Draft campaign`
- `Browse templates`
- `Start from scratch`
- Automate contact info fetching
- Personal email toggle
- Work email toggle
- Phone number toggle
- Candidate sort order, shown as manually sorted
- Automate email communication

The AI campaign builder shown in the recording includes:

- Email stages
- Per-stage delay, demonstrated with 15 minutes for Stage 1 and 2 days for Stage 2
- Sender
- Subject
- Body
- Person, Job, and Form merge-tag menus
- A/B variant
- Reply and Signature controls
- Delete stage
- `Draft again`
- `Try again`
- `Save as template`
- `Add to job`

The vendor workflow prepares the campaign before candidates enter the linked stage, then drags selected candidates into that stage. Loxo handles later sequence steps. For Ja, campaign copy, recipients, sender, delays, contact-fetch settings, and activation must be reviewed before any candidate is moved into an automated stage.

The video suggests waiting a day or two, then moving more people from Shortlist into outreach if the response level is insufficient. This is general guidance, not automatic authorization or a mandatory cadence.

### 7. Manage Candidates In The Pipeline, 06:48 to 07:23

The job page shown in the video has `Overview`, `Candidates`, and `Reports` tabs. The Candidates tab displays the pipeline board.

Visible pipeline features:

- Board and list view controls
- Candidate search
- Filter control
- Stage columns including Longlist, Shortlist, Outbound, Screening, Submitted, and Interviewing
- Lightning indicator on stages with automation
- Candidate cards with contact, email, phone, document, and LinkedIn actions where available
- `Fetch contact`
- Add Note
- Card checkbox and overflow menu
- Drag and drop between stages

The recording also shows a Person Profile takeover with:

- `Profile`, `Resume`, and `Activity`
- Right-side `Details`, `Scorecards`, `Intake`, and `Meetings`
- Contact fields
- Compensation section
- Experience
- Person type, global status, owner, source, tags, and other structured fields

The video states that cards can be moved by drag and drop and that progression Activity notes can trigger stage changes. Both are writes. Under Ja's rules, inspect current state, obtain approval for the exact change, execute once, and verify the resulting stage or Activity entry.

## Contact Data Caveat

Loxo states that contact information is assembled from public sources and cannot be complete or current for every person. Treat missing or stale-looking contact data as unknown. Do not invent an email or phone number and do not assume a failed lookup means the person is unsuitable.

## Ego Browser Orientation

Use Ego as the preferred browser driver for this map.

1. Create or reuse one isolated Ego task space for the Loxo task.
2. Reuse a Loxo tab inside that task space, or open the agency Jobs URL if none exists.
3. Confirm the logged-in agency and current surface before navigating.
4. Use semantic inspection for normal controls and structured extraction.
5. Use screenshots and visual actions for pipeline drag and drop, iframe-based outreach, and controls missing from the semantic tree.
6. Never enter credentials or bypass a user-controlled handoff.
7. Apply the gate matrix before any write or outbound action.
8. Verify the resulting page state after every authorized mutation.

Ego's isolated task space is the reason to prefer it. It can reuse login state without taking over Ja's normal browser activity. This tool preference does not relax any Loxo operating rule.

## Translation Rule

When Ja names an action without naming the surface, map the request before acting:

1. Identify the entity: job, person, company, campaign, stage, task, or report.
2. Open the corresponding surface from the map above.
3. Inspect the live record and confirm the exact target.
4. Apply the existing read, write, ownership, and outbound rules.
5. Report the result in Ja's terms, not as a generic Loxo tutorial.
