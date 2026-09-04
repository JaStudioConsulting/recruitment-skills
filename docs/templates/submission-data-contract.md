# Normalized submission-data contract

This is the mapping between source capture and outputs. Blank means unknown; unknown is omitted from client-facing output. Never infer a value to satisfy a field.

| Normalized field | Call intake / source capture | Manager snapshot and Gmail | Loxo / Tracker |
|---|---|---|---|
| `candidate_name` | Name; resume; transcript | Name line and subject when named; omit for external blind MPC | Match exact person before any read/write manifest |
| `target_role` | Role / Title | Subject, Title, opening line | Exact job association only |
| `current_company` | Current Company, confirmed employer | Include when known; never mask for named or internal MPC | Candidate/job evidence only |
| `location` | Concrete city and confirmed commute/relocation note | Location line; omit immigration/PR rationale | Host record only; no inference |
| `work_status` | Confirmed work authorization/status only | Work Status line when confirmed; never infer from location or resume silence | Host-supplied record only; no automatic write |
| `compensation_target` / `current_compensation` | Real figures only | Compensation lines when confirmed | Loxo salary expectation only when explicitly authorized; never Tracker inference |
| `vacation` | Only if confirmed | Vacation line or omit | No default |
| `interview_availability` / `start_date_notice` / `shift` | Separate confirmed fields | Availability, Start Date / Notice Period, optional Shift | Loxo brief notes only when source-backed |
| `reason_for_exploring` | Optional internal source capture of current motivation | Never a substitute for the external field and normally omit from client output | Internal note only when useful and authorized |
| `reason_for_leaving` | Historical departure reason, only when explicitly sourced | Required external submission field; include confirmed wording or leave blank, never substitute current motivation | Never invent or normalize across jobs |
| `contact` | Host-supplied and opt-in | Email only when contact toggle is on; resume never contains it | Host configuration, not template data |
| `profile_summary` / `key_strengths` | Fit notes, wow, bullet ammo, resume/JD | 2 to 3 sentences and 3 to 4 high-signal bullets; no label repetition | No direct write |

## Output sequence

1. Audit resume, transcript/notes, JD, and approved host data; record conflicts.
2. Populate normalized fields without adding values.
3. Render the external submission using the required fields: Name, Title, Compensation Target, Current Compensation, Vacation, Location, Work Status, Interview Availability, Start Date, Reason for Leaving, and Profile Summary. Render Gmail HTML from the same normalized fields.
4. Build the named or appropriately blinded PDF; verify privacy, attachment filename, and every page visually.
5. Create exactly one unsent Gmail draft when available, ending `CV attached.` with no signature.
6. Produce Loxo/Tracker findings or an exact approval-gated manifest only through their owning guides. A package does not authorize a write.
