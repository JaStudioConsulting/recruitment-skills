# Recruiter Workstation

The full-page Recruiter Workstation is the browser interface for the canonical
capabilities in this repository. It is the existing ChatGPT Site, not a second
copy of the product, and is a separate surface from the compact MCP candidate
dashboard in `ui/`.

## What is included

- a generated registry for all 24 canonical repository capabilities, including
  authority paths, required inputs, output contracts, approval gates, truthful
  implementation status, blockers, and verification evidence
- persistent Job folders and reusable candidate cases
- candidate-specific Apple Pencil Scribble/typed notes with font and size controls
- source-first file and whole-text intake for resumes, transcripts, Job
  descriptions, and call notes; sources are classified and parsed once, then
  reused by the Job or candidate case
- confident Job identity proposals from complete Job descriptions, with review
  instead of invented company or role values when confidence is insufficient
- truthful source lifecycle states: uploaded, parsed, classified, and reviewed
- large call-notes surface beside the selected uploaded resume for quick reference
- candidate-specific typed notes and `js-draw` handwriting notes, with a focus control that collapses the resume panel
- a repository-driven workflow browser grouped by candidate, Job/client,
  sourcing, pipeline/Tracker, writing, and artifact work
- the mounted Candidate Write-Up workflow, which persists source-grounded resume,
  candidate-submission, presentation-email, and Loxo-update drafts
- read-only generated output by default, with explicit Edit, Cancel, Save,
  optimistic revision checks, source provenance, run lineage, and version history
- durable capability-run and PDF-artifact history that survives reloads
- explicit preview and approval requirements represented per operation; no live
  recruiting mutation is exercised by automated tests
- independently scrolling Notes and document panes with sticky iPad actions
- D1 Job, candidate, case, source, document, run, and artifact metadata
- R2 source blobs addressed by opaque case/source IDs
- R2-backed immutable PDF storage, authenticated download, and page-by-page
  human visual-QA evidence before a PDF run can complete

Plain-text, Markdown, text-based PDF, and DOCX sources can be parsed and
classified inside the Site. Image-only files remain in the uploaded state; the
UI does not claim otherwise.

The Site does not ship private candidate data or connector credentials. Gmail,
Calendar, Drive, Tracker, Loxo, and other external operations require their real
authenticated adapters plus the repository-defined preview, approval,
idempotency, mutation, and readback gates. The capability registry names the
exact missing boundary when one is unavailable and performs no substitute write.

The approval and idempotency helpers currently encode contract tests only; they
are not durable authorization records and no production route may treat them as
such. No external mutation executor is mounted. Before the first one is mounted,
its preview, grant, single-use consumption, idempotency result, unknown-result
reconciliation, and readback evidence must be persisted with owner-scoped
database constraints and tested through the real route.

Branded Resume is mounted as a partial, fail-closed workflow using the canonical
A layout. A recruiter must save the source-grounded editable resume form before
execution. The Workstation then calls the hosted ReportLab builder, verifies its
attested authority digest, persists the exact PDF, and requires page-by-page
human visual QA before release. Named submissions and internal MPC presentation
are supported; external-client blind MPC remains blocked because verified
anonymization is not implemented.

## Local development

Use Node.js 22.13 or newer.

```bash
npm ci
npm run db:generate
npm run build
```

Apply every checked-in migration to the local Sites D1 database before running
the preview. The exact command is documented in the shared Sites runtime
instructions bundled by the starter. `npm run dev` uses the Sites local ChatGPT
sign-in shim on loopback; production authentication remains dispatch-owned.

## Safe browser end-to-end tests

Install Chromium once, then run the isolated Playwright suite:

```bash
npx playwright install chromium
npm run db:e2e:reset
npm run test:e2e
# Optional: watch the same suite in a visible browser.
npm run test:e2e:headed
```

`npm run test:e2e` removes only `workstation/.playwright/state` and
`workstation/.playwright/runtime`, reapplies every checked-in D1 migration, and
starts the Workstation on `127.0.0.1:4317` with the local Sites sign-in shim.
Connector and local-AI environment variables are removed from that server, and
the browser suite rejects off-origin requests. It therefore exercises persisted
Job, candidate, source, draft, edit, version, reload, and blocked-workflow
behavior without writing to Loxo, Gmail, Tracker, or another live service.

PDF artifact review is intentionally not fabricated in this browser suite. It
does not call the hosted branded-resume builder or mark page-by-page human QA as
complete. The mounted workflow UI, artifact storage, digest, and visual-QA
contracts remain covered by browser and Workstation unit/integration tests with
synthetic records.

Repository-level validation also regenerates and checks the capability registry:

```bash
cd ..
npm run workstation:registry:check
npm run validate
npm test
```

## Source of truth and deployment

GitHub `main` in this repository is the code authority. The existing TTTG
Recruiting Workbench Site is the deployment target. Preserve its current access
policy, publish from an exact merged repository commit, and never edit a second
Site copy as an independent source.
