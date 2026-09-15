# TTTG Recruiting MCP server

Optional hosted-runtime path. Turns the recruiting tools into an MCP server a host
(ChatGPT, Codex, Claude) can call, including on a schedule. The skills do NOT need
this; use it only when you want callable tools or unattended runs.

## What is built (works now)
- `build_pdf` — builds the branded TTTG resume PDF from candidate data using the
  bundled builder. No external account. This is the real, working tool.

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
- `build_pdf` needs Python and, for best fidelity, headless Chrome on the host. It
  falls back to reportlab and pillow (in requirements) when Chrome is absent.
- Keep GitHub `main` as the single authority. This server reads the same skills and
  builder from the repo, so there is one source of truth.
