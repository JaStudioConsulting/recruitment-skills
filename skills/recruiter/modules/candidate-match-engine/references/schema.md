# Candidate Match Engine — Airtable Schema

All six tables. Use these exact field names when reading or writing Airtable.

---

## 1. Quick Intake

Entry point for new candidates, roles, or raw notes.

| Field | Type | Notes |
|---|---|---|
| Intake Name | Text | Auto or manual label |
| Entry Type | Select | Candidate / Job-Role / Candidate+Role / Needs Sorting |
| Intake Status | Select | New / Needs Review / Ready to Add / Added to Airtable / Duplicate / Ignore |
| Candidate Name | Text | |
| Current Title | Text | |
| Role Title | Text | |
| Client | Text | |
| Role Type | Text | e.g. CNC Machinist, Millwright, Electrician |
| Location | Text | |
| Pay / Target | Text | |
| Shift | Text | |
| Skills / Must-Haves | Text | |
| CV Link | URL | Drive link only |
| CV Attachment File Name | Text | e.g. `John Smith - CNC - Hamilton - 2026-05-05.pdf` |
| Source / Evidence | Text | `Email subject | Sender | Date | Attachment file name` |
| Notes | Long text | |

---

## 2. Candidates

Internal candidate bank.

| Field | Type | Notes |
|---|---|---|
| Candidate Name | Text | Primary key |
| Current Title | Text | |
| Role Type | Text | |
| Location | Text | |
| Pay Target | Text | |
| Shift Preference | Text | |
| Industry | Text | |
| Skills / Tags | Text | |
| Last Contacted | Date | |
| Submitted Role | Text | Role most recently submitted for |
| Submitted To | Text | Client most recently submitted to |
| Candidate Status | Select | Active / Submitted / Placed / Inactive / Do Not Contact |
| CV Link | URL | Drive link |
| CV Attachment File Name | Text | |
| Gmail Search Key | Text | Searchable evidence string |
| Ownership Source | Select | Ja Sourced / Sent / Former Recruiter Pool / Transferred Internal Candidate / Unknown / Needs Review |
| Original Owner | Select | Ja / Lauren / Debie / Debbie / Leslie / Liam / Terri / Unknown |
| Ownership Status | Select | Owned by Ja / Former Recruiter - Review / Released After 6 Months / Protected / Active Ownership / Unknown / Needs Review |
| Ownership Start Date | Date | |
| Ownership Review Date | Date | Six-month flag date |
| Ownership Evidence | Text | Evidence string from Gmail |
| Candidate Contact | Text | Email / phone |
| Notes | Long text | |
| Matches | Link | → Matches table |
| Current Location | Text | |
| Preferred Locations | Text | |
| Open to Relocation | Checkbox | |
| Commute Limit | Text | |
| Target Roles | Text | |
| Target Industries | Text | |
| Not Interested In | Text | |
| Pay Minimum | Text | |
| Shift Restrictions | Text | |

---

## 3. Roles

Open and current job orders.

| Field | Type | Notes |
|---|---|---|
| Role Title | Text | |
| Client | Text | |
| Role Type | Text | |
| Location | Text | |
| Pay Range | Text | |
| Shift | Text | |
| Industry | Text | |
| Must-Haves | Long text | Required skills / certs |
| Nice-to-Haves | Long text | |
| Status | Select | Open / Filled / On Hold / Cancelled |
| Date Added | Date | |
| Job Owner | Text | host-configured owner |
| Source | Text | Where the role came from |
| Source Evidence | Text | Email subject / date / sender |
| Matches | Link | → Matches table |

---

## 4. Matches

Recruiter-facing output board. One record per candidate-role pair.

| Field | Type | Notes |
|---|---|---|
| Match Name | Text | Auto: `Candidate → Role` |
| Match Level | Select | Strong Fit / Possible Fit / Weak Fit / No Fit |
| Match Score | Number | Optional numeric score |
| Role Title | Text | |
| Candidate Name | Text | |
| Match Reason | Long text | Why this is a match |
| Concern | Long text | What blocks or needs verification |
| Next Step | Select | Contact Candidate / Review CV / Check Duplicate Submission / Hold / Reject |
| Outreach Status | Select | Not Started / Contacted / No Response / Responded / In Progress / Closed |
| CV Link | URL | |
| Date Matched | Date | |
| Qualification Status | Select | Qualified - Contact / Qualified - Multiple Options / Needs Verification / Do Not Contact Yet / Disqualified |
| Must-Have Check | Long text | Per-requirement pass/fail |
| Qualification Gaps | Long text | What is missing |
| Logistics Flag | Select | Location / Commute / Pay Target / Shift / Availability / Ownership / Duplicate Submission / Work Status / None Known |
| Ask Candidate | Long text | Questions to verify gaps |
| Multiple Opportunity Group | Text | Group name if candidate has multiple roles |
| Candidate Record | Link | → Candidates table |
| Role Record | Link | → Roles table |

---

## 5. Submissions

Normalized history of every submission event.

| Field | Type | Notes |
|---|---|---|
| Submission Name | Text | Auto: `Candidate → Client — Date` |
| Candidate Name | Text | |
| Client | Text | |
| Role | Text | |
| Date Submitted | Date | |
| Submitted By | Text | Recruiter name |
| Outcome | Select | Pending / Interview / Rejected / Placed / No Response |
| Notes | Long text | |

---

## 6. Do Not Submit

Safety and conflict table. Check before every contact or submission recommendation.

| Field | Type | Notes |
|---|---|---|
| Conflict Name | Text | |
| Candidate Name | Text | |
| Client | Text | The client to avoid |
| Reason | Long text | Why — duplicate submission, ownership conflict, prior rejection, etc. |
| Date Added | Date | |
| Notes | Long text | |
