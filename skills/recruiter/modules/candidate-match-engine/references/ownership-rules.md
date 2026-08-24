# Ownership Rules

---

## Ownership Source Values

| Value | Meaning |
|---|---|
| Ja Sourced / Sent | Ja originated this candidate or sent them to a client |
| Former Recruiter Pool | Came from Lauren, Debie, Debbie, Leslie, Liam, or Terri's prior work |
| Transferred Internal Candidate | Moved from another recruiter's active list to Ja |
| Unknown / Needs Review | Source not confirmed — review before submitting |

---

## Original Owner Values

Ja / Lauren / Debie / Debbie / Leslie / Liam / Terri / Unknown

Note: "Debie" and "Debbie" both exist — preserve the exact spelling from the evidence source.

---

## Ownership Status Values

| Value | Meaning |
|---|---|
| Owned by Ja | Ja has active ownership — proceed normally |
| Former Recruiter - Review | Was owned by a former recruiter — review before acting |
| Released After 6 Months | Formally released after six-month review — confirm before submitting |
| Protected / Active Ownership | Active ownership with special protection flag |
| Unknown / Needs Review | Ownership not confirmed — do not submit until resolved |

---

## Six-Month Rule

The six-month rule is a **review flag only**. It never automatically releases ownership.

When the Ownership Review Date is in the past:

1. Flag it as "Ownership Review Date passed" in the output.
2. Before recommending any action, check:
   - Active conversations in Loxo Activity notes for this candidate
   - Recent entries in the Submissions table for this candidate
   - Do Not Submit table for any conflict or prior claim
3. Only recommend releasing ownership if all three checks are clear AND Ja explicitly approves.
4. Do not auto-release. Do not submit. Do not contact on behalf of a former-recruiter-owned candidate without Ja's explicit yes.

---

## Evidence Storage Rule

Store ownership evidence as a searchable string — not a raw Gmail URL (Gmail URLs expire or change):

```
Email subject | Sender | Date | Attachment file name
```

Example:
```
Candidate ownership evidence | recruiter@example.invalid | 2026-01-02 | synthetic-candidate-resume.pdf
```

The example above is synthetic. Never store a real candidate name, sender, filename, or submission date in this repository.

---

## Conflict Resolution

If two entries claim the same candidate:
1. Show both entries to Ja.
2. Do not choose automatically.
3. Do not submit until Ja resolves the conflict.
