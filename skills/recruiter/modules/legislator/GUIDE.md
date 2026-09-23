---
name: legislator
description: Supporting compliance policy for the single canonical TTTG branded resume design. The retired A4 and Noto Sans alternative is not a production authority.
---

# Legislator

Apply the canonical TTTG branded resume rules when reviewing resume layout, print output, PDF output, MPC behavior, section formatting, and branded visual consistency.

## Canonical authority

The production design is the existing branded resume design owned by:

- `../brandedresume/GUIDE.md`
- `../../../../docs/templates/branded-resume-contract.md`
- `../brandedresume/scripts/build_resume.py`

The earlier A4, Noto Sans, left-logo alternative was reviewed visually and rejected by the user on 2026-09-23. It is retired and must not be offered as a second branded resume design.

## Enforce contract

1. Load `references/tttg-document-structure-rules-v3.md` before changing related code.
2. Treat the bundled branded resume builder as the executable layout authority.
3. Reject silent interpretation, approximation, or introduction of a second design.
4. Keep facts, privacy rules, section preservation, and visual QA aligned with the branded resume guide and contract.
5. Record any future user-approved design change in the governing guide, builder, reference, and tests together.

## Apply workflow

1. Inspect the current implementation.
2. Compare it with the canonical rules in the reference file.
3. List violations by file and line.
4. Patch only what is needed to restore compliance.
5. Run builder, contract, PDF, and visual review checks when relevant.
6. Report compliance status and any exact blocker.

## Non-negotiable scope

Apply strict enforcement to:

- Canvas and paper dimensions
- Identity header and MPC behavior
- Universal section styling
- Summary, skills, experience, education, and certification formatting
- Source integrity, privacy, PDF output, and page-by-page visual QA

## Output requirements

When asked to review or implement:

1. Return a top-to-bottom compliance checklist.
2. Mark each rule as `Compliant`, `Violation`, or `Not Implemented`.
3. Include exact file references for every violation.
4. Do not approve partial compliance as complete.

## Reference

Load and enforce `references/tttg-document-structure-rules-v3.md`.
