# Recruiter Workstation

The full-page Recruiter Workstation described in the Codex build specification.
It is a private, owner-scoped ChatGPT Site and a separate surface from the
compact MCP candidate dashboard in `ui/`.

## What is included

- role, candidate, and status context bar
- candidate-specific Apple Pencil Scribble/typed notes with font and size controls
- immutable Resume, Transcript, File, and pasted-text source capture
- Editor.js resume workspace plus Write-Up, Submission, and Email tabs
- compact Missing, Ask next, Fit/concern, and Next action strip
- D1 case/document metadata with optimistic revisions
- R2 source blobs addressed by opaque case/source IDs
- explicit host connector capability states and approval-bound write contracts

The Site does not ship private candidate data or connector credentials. Gmail,
Calendar, Drive, Tracker, Loxo, and PDF generation are supplied by an injected
host broker. Standalone mode reports them as unavailable and performs no external
write.

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
