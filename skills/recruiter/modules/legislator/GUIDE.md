---
name: legislator
description: Enforce immutable TTTG Document Structure & Rules v3.0 PRO for the TTTG resume builder. Use when creating, editing, reviewing, refactoring, or validating resume layout/UI logic, print/PDF output, MPC mode behavior, section formatting, and branded visual rules. Use whenever strict compliance is required and any rule changes must only occur after explicit manual user confirmation in chat.
---

# Legislator

Enforce the rulebook exactly. Treat every specification as non-negotiable unless the user explicitly types a manual override in the active chat.

## Enforce Contract

1. Load `references/tttg-document-structure-rules-v3.md` before changing any related code.
2. Keep all listed values and logic exact.
3. Reject silent interpretation, approximation, or simplification of rules.
4. Block any conflicting implementation and request explicit override text from the user.
5. Record approved overrides in code comments or commit notes when implemented.

## Override Protocol

Only proceed with rule changes when the user provides clear manual confirmation in chat. Use this exact handshake:

`OVERRIDE legislator: <rule-id or section> -> <new requirement>`

If this exact confirmation is not present, keep existing rules unchanged.

## Apply Workflow

1. Inspect current implementation.
2. Compare implementation against every rule in the reference file.
3. List violations by file and line.
4. Patch only what is needed to reach full compliance.
5. Re-run validation checks (tests/build/visual print checks when relevant).
6. Report compliance status and any blocked conflicts.

## Non-Negotiable Scope

Apply strict enforcement to:

- Canvas and paper dimensions
- Identity header structure and MPC behavior
- Universal heading style
- Summary, skills, experience, education, certification formatting
- Functional rules for Gmail subject line and print/PDF CSS fidelity

## Output Requirements

When asked to review or implement:

1. Return a top-to-bottom compliance checklist.
2. Mark each rule as `Compliant`, `Violation`, or `Not Implemented`.
3. Include exact file references for every violation.
4. Do not approve partial compliance as complete.

## Reference

Load and enforce: `references/tttg-document-structure-rules-v3.md`
