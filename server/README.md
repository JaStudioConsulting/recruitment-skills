# TTTG Recruiting MCP server

Optional hosted-runtime path. Turns the recruiting tools into an MCP server a host
(ChatGPT, Codex, Claude) can call, including on a schedule. The skills do NOT need
this; use it only when you want callable tools or unattended runs.

## Local artifact builders

- `build_pdf` is the mounted canonical A-layout branded-resume renderer. It
  validates structured input, returns the attested builder digest, and keeps
  `release_ready: false` until the Workstation persists the exact PDF and a
  recruiter completes page-by-page human visual QA. Named submissions and
  internal MPC presentation are supported; external-client blind MPC remains
  unavailable because verified anonymization is not implemented.
- `build_reference_check_pdf` invokes the canonical sanitized-DOCX builder and
  renders that DOCX with LibreOffice. It fails closed when `SOFFICE`, `soffice`,
  or `libreoffice` is unavailable; it never substitutes a newly drawn PDF.
- `build_interview_prep_pdf` requires the complete repository payload plus
  closed, field-complete source and asset ledger records. It rejects free-form
  filler and checks that every declared authority and used visual is represented.
  The tool cannot independently prove caller-supplied evidence or permissions,
  so it returns `release_ready: false` and still requires human source,
  permission, and page-by-page visual review.

## What is left for you (needs your accounts, so it stays out of the repo)
- `find_email`, `send_email` (Gmail), `create_calendar_event` (Calendar),
  `update_loxo_record` (Loxo) are **stubs**. Implement each against your own
  connector and OAuth in your deployment. Write actions (`send_email`,
  `create_calendar_event`, `update_loxo_record`) must stay gated behind an explicit
  human yes.
- Hosting: this must run somewhere reachable over HTTPS. Pick your host (a small
  server, a container, or your Hermes runtime). ChatGPT scheduled tasks call the
  hosted URL; the server itself is the persistent worker.
- Secrets: never commit real tokens. Supply OAuth client id/secret and any API
  keys as environment variables in the deploy environment.

## OAuth setup

OAuth is scaffolded, not filled. No real secret is in the repo.

1. Copy `server/.env.example` to `server/.env` (gitignored) and fill your values,
   or set the same variables in your host's environment.
2. Create the OAuth app with your identity provider to get `OAUTH_CLIENT_ID` and
   `OAUTH_CLIENT_SECRET`, and set `OAUTH_AUTHORIZATION_URL`, `OAUTH_TOKEN_URL`,
   `OAUTH_REDIRECT_URI`, and `OAUTH_SCOPES`.
3. Put the same `client_id` into `.mcp.json` (see `server/mcp.json.example`) so the
   host (ChatGPT) can run the OAuth handshake when the connector is added.
4. For the downstream connector stubs (Gmail, Calendar, Loxo), set their own
   credentials (`GMAIL_OAUTH_CLIENT_ID`, `LOXO_API_KEY`, etc.) when you implement
   them. Keep write actions gated behind an explicit human yes.

The server reads these at startup (`OAUTH` in `server.py`) and never stores them in
the repo.

## Run locally to test
```
pip install -r requirements.txt
python server.py
```
This serves streamable HTTP at `http://localhost:8000/mcp`. Inspect it with the MCP
Inspector, or point a local host at it.

## Wire it into the plugin / host
After deploying and getting a public HTTPS URL:
1. Copy `server/mcp.json.example` to `.mcp.json` at the repo root.
2. Put your real `url` (ending in `/mcp`) and OAuth `client_id` into it.
3. Reinstall or refresh the plugin so the host picks up the server.
4. In ChatGPT: connect the server, test the tools interactively, then create the
   scheduled task once the interactive flow works.

The `.app.json` app id for the ChatGPT app is issued by ChatGPT when you register
the app. Add it on the ChatGPT side; it is not stored in this repo.

## Notes
- `build_pdf` uses the repository ReportLab renderer and returns a non-release-ready
  draft until the Workstation persists the exact output and a recruiter completes
  page-by-page human visual QA.
- Reference-check PDF rendering additionally requires LibreOffice. Set
  `SOFFICE` to its executable when it is not on `PATH`.
- Keep GitHub `main` as the single authority. This server reads the same skills and
  builder from the repo, so there is one source of truth.
