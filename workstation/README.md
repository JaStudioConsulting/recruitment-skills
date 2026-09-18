# Recruiter Workstation

The full-page Recruiter Workstation described in the Codex build specification.
It is a private, owner-scoped ChatGPT Site and a separate surface from the
compact MCP candidate dashboard in `ui/`.

## What is included

- role and candidate context bar
- candidate-specific Apple Pencil Scribble/typed notes with font and size controls
- one multi-file drop zone plus dedicated Resume, Transcript, Job Description,
  Call Notes, and pasted-text source capture
- truthful source lifecycle states: uploaded, parsed, classified, and reviewed
- large call-notes surface beside the selected uploaded resume for quick reference
- on-demand Brand Resume and Candidate Write-Up actions instead of permanent output tabs
- independently scrolling Notes and document panes with sticky iPad actions
- D1 case/document metadata with optimistic revisions
- R2 source blobs addressed by opaque case/source IDs
- explicit host connector capability states and approval-bound write contracts

Plain-text and Markdown sources can be parsed and classified inside the Site.
PDF and DOCX sources remain in the uploaded state until a real parser is
connected; the UI does not claim otherwise.

The Site does not ship private candidate data or connector credentials. Gmail,
Calendar, Drive, Tracker, Loxo, package generation, and PDF generation require an
authenticated host broker. Standalone mode reports them as unavailable and
performs no external write.

## Local development

Use Node.js 22.13 or newer.

```bash
npm ci
npm run db:generate
npm run build
```

Apply the generated migration to the local Sites D1 database before running the
preview. The exact command is documented in the shared Sites runtime instructions
bundled by the starter. `npm run dev` uses the Sites local ChatGPT sign-in shim on
loopback; production authentication remains dispatch-owned.

## Source of truth and deployment

GitHub `main` in this repository is the code authority. The existing TTTG
Recruiting Workbench Site is the deployment target. Keep its current owner-only
audience, publish from an exact repository commit, and never edit a second Site
copy as an independent source.
