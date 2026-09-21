# Full Recruiter Workstation

Status: implemented; release is accepted only after every quality gate below passes

## Product outcome

The existing Recruiter Workstation becomes the web interface and execution layer for the complete repository authority. After-call packaging remains one workflow inside the larger system.

The app must never imply that a workflow works because a button exists. Every exposed capability must resolve to repository authority and must show one of five implementation states with evidence.

## Authority and scope

The source of truth is, in precedence order:

1. `skills/GLOBAL-RULES.md`
2. `skills/TOOL-CONVENTIONS.md`
3. `skills/recruiter/SKILL.md`
4. `skills/capabilities.json`
5. The routed module, its contracts, references, scripts, and assets
6. `skills/tracker-manager/GUIDE.md` and its protected contracts for Tracker work

The workstation consumes this authority. It does not fork or redefine it.

## Users and primary jobs

Ja is the primary user. The app must support these repository-grounded jobs:

- Maintain reusable Job and candidate context.
- Add a file or pasted text once, parse and classify it, and reuse it where valid.
- Select a real recruiter workflow and see exactly what it needs.
- Produce a source-grounded draft, document, PDF, review table, or proposed external action.
- Edit generated content only after choosing Edit.
- Preserve sources, provenance, versions, approval state, execution evidence, and blockers.
- Preview every external mutation before explicit approval.
- Verify an approved external mutation by readback before reporting success.

## Non-goals

- Replacing the existing workstation with another app.
- Creating another Site or deployment target.
- Treating prose guidance as an executable implementation.
- Recreating the repository authority manually in UI code.
- Sending email or changing Loxo, Tracker, or another external system during automated tests.

## Capability registry

The build must generate a deployment-safe workstation registry from canonical repository files. The generated artifact is checked in so the Site archive can use it without reaching outside `workstation/` at runtime. A validation command must fail when the generated artifact drifts from repository authority.

Each registry item must contain:

- Canonical capability ID and label.
- Authority path, related contracts, references, scripts, and required assets.
- Repository group and one user-facing workflow group.
- Summary and output contract.
- Required source kinds and direct user inputs.
- Reusable Job and candidate context.
- Runtime and adapter requirements.
- Operation-specific approval requirements.
- Implementation state.
- Exact blocker when not working.
- Automated verification evidence.

Allowed implementation states:

- `working`: the real implementation executed and the persisted output or verified outcome was observed.
- `partial`: a real implementation executed, but part of the repository contract remains unavailable.
- `interface_only`: authority and inputs are represented, but no underlying implementation can execute.
- `blocked`: an implementation exists but cannot run because a named runtime, credential, adapter, asset, or deployment dependency is unavailable.
- `not_applicable`: compatibility or internal material that must remain visible in audit evidence but is not a user workflow.

Repository status such as `active`, `restricted`, or `read_only` is not implementation evidence and must be stored separately.

## Architecture

### Authority compiler

`scripts/generate-workstation-registry.mjs` reads canonical manifests and module metadata, combines them with a small reviewed execution overlay, and writes `workstation/generated/capability-registry.json`.

The overlay may describe implementation wiring and evidence only. It must not rename or invent canonical capabilities. Every overlay key must resolve to `skills/capabilities.json`.

### Source intake

One intake service accepts files and pasted text, stores the immutable original, extracts text, classifies it, and records confidence plus provenance. Supported source kinds remain resume, Job description, transcript, call notes, pasted text, and other.

When pasted text contains a complete Job description with a confident company and role, the service proposes or creates the Job context. Low-confidence identity remains an explicit review step. A source is parsed once and linked to the relevant Job or candidate case.

### Context resolution

Job context owns client, role, Job description, client notes, and reusable role artifacts. Candidate context owns resume, transcript, call notes, candidate facts, and candidate artifacts. A candidate case joins one candidate to one Job without duplicating either source set.

Context resolution returns source text plus provenance for the selected capability. It never converts an unknown value into a fact.

### Capability execution

All runs use one service boundary:

```text
prepare(capabilityId, context) -> requirements, blockers, preview
execute(preparedRun, approval?) -> persisted result or verified outcome
```

Executors fall into four classes:

1. Deterministic repository scripts and builders.
2. Grounded AI drafting with a restricted provider boundary.
3. Read-only external adapters.
4. Preview, approve, mutate, and readback adapters.

Guidance-only modules can use grounded drafting when their contract is represented and their result persists. Otherwise they remain `interface_only` with the exact missing executor.

### Output persistence

Every run has a stable ID, capability ID, authority version, context IDs, source IDs, input snapshot hash, output kind, implementation state, timestamps, and evidence. Drafts and artifacts have version history. User editing is off by default and begins only through Edit.

### External adapters

External actions use the sequence below:

```text
prepare -> preview -> explicit approval -> idempotency check -> mutate -> readback -> evidence
```

Gmail send, candidate submit, Loxo write, approval decision, and external delete remain forbidden. Gmail draft creation, allowed Loxo actions, and Tracker writes must obey the repository-specific gate and must never be exercised against live data in automated tests.

The current approval and idempotency helpers are contract scaffolding, not a
durable authorization store. Because no external mutation executor or API route
is mounted, absence of a route is the current hard gate. Mounting the first write
adapter additionally requires owner-scoped persisted previews, grants,
single-use consumption, unique idempotency records, unknown-result
reconciliation, and post-write readback evidence. A helper object in memory is
never sufficient approval.

## User experience

The existing workstation remains the primary shell. Add a workflow browser that is driven entirely by the generated registry and grouped by repository-grounded work:

- Candidate work
- Job and client work
- Sourcing
- Pipeline and Tracker
- Writing
- Artifacts and supporting tools

Selecting a workflow shows its authority, requirements, available context, real status, blocker, and last verification. The action label must match the real operation, such as Draft, Build PDF, Read, Preview changes, or Open guidance. A blocked item remains inspectable but cannot pretend to run.

The main source intake accepts files or whole pasted text without forcing users to fill fields that can be extracted. The extracted Job, company, candidate, and source classification are shown as a reviewable proposal. Generated outputs are read-only until Edit is selected.

## Quality gates

- Registry generation is deterministic and drift-tested.
- Every canonical capability appears exactly once in the audit registry.
- Every visible workflow maps to one or more canonical capability IDs.
- No unknown fact is silently filled.
- Source provenance survives persistence and reload.
- Output versions survive persistence and reload.
- Approval gates reject missing, stale, duplicated, or replayed approvals.
- Synthetic tests cover each executor class and every capability status.
- Typecheck, lint, repository validation, Python checks, package checks, unit tests, integration tests, browser tests, and production build pass.
- The exact merged commit is deployed to the existing Site without changing its access policy and verified after a fresh reload.

## Delivery slices

1. Repair the TypeScript baseline and add a first-class typecheck command.
2. Generate and validate the canonical capability registry.
3. Replace disconnected feature definitions with registry-backed workflow presentation.
4. Complete shared source intake and confident Job resolution.
5. Add persistent capability runs and connect existing deterministic builders.
6. Connect grounded drafting and read-only adapters with truthful blockers.
7. Add preview, approval, idempotency, mutation, and readback boundaries for allowed external operations.
8. Remove dead and duplicate capability code.
9. Complete capability-level tests, browser flows, architecture review, PR, merge, deployment, and live verification.

## Definition of done

The existing deployed Site accurately represents every canonical capability. Each item has its repository authority, required inputs, reusable context, real output or outcome, runtime, approval gate, truthful state, exact blocker, and verification evidence. Every working claim is backed by an observed persisted output or verified external readback.
