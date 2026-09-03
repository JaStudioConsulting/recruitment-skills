# Leads Tracker Data Entry & Formatting Guide

This document defines the schema, hierarchical structure, and formatting standards for the **Leads** tracker sheet. Any automated agent or human operator adding or updating records must adhere strictly to these rules to maintain structural and visual integrity.

-----

## 1. Structural Overview & Hierarchy

The sheet uses a **two-tiered parent-child hierarchy** rather than a flat table:

```
[Parent Row]  Company Name | Status (Active/N/A) | Location | Primary Contact | Checked Date ...

   └── [Child Row 1] (Blank Company) | Job Title 1 | Location | Compensation | Source | Job URL ...
   └── [Child Row 2] (Blank Company) | Job Title 2 | Location | Compensation | Source | Job URL ...
```

There are three distinct row archetypes:

1. **Active Company (Parent Row):** High-level summary of a verified company with open roles. Styled with a soft green background fill and row-grouped with its child roles.
2. **Job Opening (Child Row):** A specific open position belonging to the parent company immediately preceding it. **Column A (Company) MUST remain blank.**
3. **Unverified / Inactive Company (Single Row):** A company investigated where no active job listing could be found (`Status = N/A`). Has no child rows.

-----

## 2. Column-by-Column Data Dictionary

| Col | Header | Parent Row (Company Summary) | Child Row (Specific Job Opening) | Inactive Row (`N/A`) | Example Values |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **A** | **Company** | Full legal / operating name. | **MUST BE BLANK** (inherits parent above). | Full company name. | `Weldflow Metal Products`, *(Blank)* |
| **B** | **Status / Job** | `Active` | Exact Job Title from posting. | `N/A` | `Active`, `CNC Laser Operator`, `N/A` |
| **C** | **Location** | Head office or primary facility: `City, Prov`. | Specific job location: `City, Prov` (or blank if remote/unspecified). | `[Blank]` | `Mississauga, ON`, `Burlington, ON` |
| **D** | **Primary Contact** | Key executive/hiring contact: `Name — Title`. | `[Blank]` (inherited from parent). | `[Blank]` | `Sameer Malik — Operations Manager` |
| **E** | **Posted** | Audit status: `Checked YYYY-MM-DD` | Posting status: `Current listing` | `[Blank]` | `Checked 2026-08-18`, `Current listing` |
| **F** | **Compensation** | `[Blank]` | Pay rate / salary (or `Not listed`). | `[Blank]` | `$28–$30/hour`, `$56,389/year`, `Not listed` |
| **G** | **Employment Type** | `[Blank]` | Work schedule / contract status. | `[Blank]` | `Full-time`, `Permanent, Full-time` |
| **H** | **Date Added** | `[Blank]` (reserved for initial ingestion). | `[Blank]` | `[Blank]` | *(Leave empty unless date timestamped)* |
| **I** | **Source** | `Company summary` | Originating job board / platform. | `Company careers + job-board search` | `Indeed`, `LinkedIn`, `Company careers page` |
| **J** | **Verification / Notes** | Summary text (e.g., `X confirmed jobs stored directly underneath.`). | Direct Job URL or listing notes / closing dates. | Standard audit note (see Section 3). | `https://ca.indeed.com/viewjob?jk=...` |
| **K** | **Checked** | Verification date in `YYYY-MM-DD`. | Verification date in `YYYY-MM-DD`. | Verification date in `YYYY-MM-DD`. | `2026-08-21` |

-----

## 3. Standard Text Patterns & Nomenclature

To maintain semantic consistency across automated runs, use the following standardized phrases:

* **Parent Verification Note (`Column J`):**
  * Single job: `The confirmed job is stored in the collapsed row directly underneath.` or `1 confirmed job stored directly underneath.`
  * Multiple jobs: `X confirmed jobs stored directly underneath.` (e.g., `2 confirmed jobs stored directly underneath.`).
  * Additional contacts: If secondary contacts exist, append them here: `Additional contact: Jane Doe — HR Director.`
* **Inactive Audit Note (`Column J`):**
  * `Searched the exact company across current company-career and major job-board sources; no active listing could be confirmed.`
* **Contact Formatting (`Column D`):**
  * Format with an em dash: `FirstName LastName — Title` (e.g., `Raam Tharu — Founder`).

-----

## 4. Operational Playbook for Agents

### Scenario A: Adding a New Active Company with 1+ Openings

1. **Insert Parent Row:**
   * Set `A` = Company Name.
   * Set `B` = `Active`.
   * Set `C` = Company Location (`City, ON`).
   * Set `D` = Contact if discovered (`Name — Title`).
   * Set `E` = `Checked YYYY-MM-DD`.
   * Set `I` = `Company summary`.
   * Set `J` = `X confirmed job(s) stored directly underneath.`
   * Set `K` = Current Date (`YYYY-MM-DD`).
   * **Formatting:** Apply the soft green fill (`#E2EFE0` or `#D9EAD3`) across `A:K`.
2. **Insert Child Row(s) Directly Below:**
   * Leave `A` completely **empty**.
   * Set `B` = Job Title.
   * Set `C` = Facility Location.
   * Set `E` = `Current listing`.
   * Set `F` = Compensation (e.g., `$30.00/hr` or `Not listed`).
   * Set `G` = Employment Type (`Full-time`, `Contract`).
   * Set `I` = Source platform (`Indeed`, `LinkedIn`, etc.).
   * Set `J` = Full application URL or specific posting notes.
   * Set `K` = Date verified (`YYYY-MM-DD`).
   * **Formatting:** Default white background, no bold text.
3. **Row Grouping:**
   * Group the child row(s) under the parent row using Google Sheets row grouping (`Data` > `Group rows`) so that they can be collapsed.

### Scenario B: Adding a Secondary Opening to an Existing Lead

1. Locate the existing parent company.
2. Insert a new row immediately below the last existing child row for that company.
3. Populate columns `B:K` following the Child Row rules. Leave Column `A` blank.
4. Update the parent row's `Column J` count (e.g., change `1 confirmed job...` to `2 confirmed jobs...`).
5. Update the parent row's `Column E` and `Column K` to the latest verification date.

### Scenario C: Logging an Inactive Lead (`N/A`)

1. Insert single row:
   * `A` = Company Name.
   * `B` = `N/A`.
   * `I` = `Company careers + job-board search`.
   * `J` = `Searched the exact company across current company-career and major job-board sources; no active listing could be confirmed.`
   * `K` = Current Date (`YYYY-MM-DD`).
   * Leave columns `C, D, E, F, G, H` blank.
2. Background fill remains plain white / transparent.

-----

## 5. Critical Quality Assurance Rules (Anti-Drift)

* **Prevent Column Shifting:** In some historical rows, URLs or notes were mistakenly placed in Column `K`, shifting dates out to Column `L` or `S`. **Never place data beyond Column K.**
  * `Col I` is **always** Source.
  * `Col J` is **always** Notes / Direct URLs.
  * `Col K` is **always** Checked Date (`YYYY-MM-DD`).
* **Strict Date Standard:** Dates must consistently follow `YYYY-MM-DD` (ISO-8601). Never use `MM/DD/YYYY` or natural strings like `Checked August 18`.
* **No Orphaned Jobs:** A child row must never appear without a corresponding parent row directly above it.
* **No Stray Cells:** Do not leave unformatted scratchpad notes or names outside the main data table boundaries (e.g., below row 112).

-----

## 6. Required Corrections

* **Date Added (`Column H`):** Populate `Date Added` with the current date in `YYYY-MM-DD` format whenever a new parent, child, or inactive row is first inserted. Preserve the original value during every later verification or update; never overwrite or clear it.
* **Expandable Table Boundary:** Do not use row 112 as a permanent boundary. Add records to the next valid row within the expanding Leads table, preserve the existing formatting and hierarchy, and never place scratchpad data outside the active table.
