#!/usr/bin/env python3
"""
TTTG Recruiting MCP server.

Exposes recruiting tools over MCP (streamable HTTP at /mcp) so a host such as
ChatGPT, Codex, or Claude can call them. This is the OPTIONAL hosted-runtime
path. The skills themselves do not need this server; it exists only when you want
tools callable on a schedule or from the ChatGPT app.

What is real here:
  - build_pdf: builds the branded TTTG resume PDF with the bundled builder. No
    external account needed. This is the flagship tool.

What is a stub for you to wire (they need YOUR connector plus OAuth, so they are
intentionally not implemented in the repo, and the write actions stay gated):
  - find_email, send_email        (Gmail connector)
  - create_calendar_event         (Calendar connector)
  - update_loxo_record            (Loxo connector)

Run locally:
  pip install -r requirements.txt
  python server.py            # serves streamable HTTP at http://localhost:8000/mcp

Deploy: host this behind HTTPS, put the public URL and your OAuth client id into
.mcp.json (see server/mcp.json.example), then connect it in the host. Never put
real secrets in this repo; supply them as environment variables in the deploy.
"""
import base64
import json
import os
import subprocess
import sys
import tempfile

try:
    from mcp.server.fastmcp import FastMCP
except ImportError:
    sys.exit("Missing dependency: pip install -r requirements.txt (needs the 'mcp' package)")

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILDER = os.path.join(
    REPO_ROOT, "skills", "recruiter", "modules", "brandedresume", "scripts", "build_resume.py"
)
DASHBOARD_HTML = os.path.join(REPO_ROOT, "ui", "candidate-dashboard.html")
DASHBOARD_URI = "ui://tttg/candidate-dashboard"

mcp = FastMCP("tttg-recruiting")

# OAuth / connector config is read from the environment, never from the repo.
# See server/.env.example for the variable names. The host (ChatGPT) drives the
# OAuth handshake using the client_id in .mcp.json; downstream connector
# credentials (Gmail, Loxo) come from these variables when you wire the stubs.
OAUTH = {
    "client_id": os.environ.get("OAUTH_CLIENT_ID", ""),
    "authorization_url": os.environ.get("OAUTH_AUTHORIZATION_URL", ""),
    "token_url": os.environ.get("OAUTH_TOKEN_URL", ""),
    "redirect_uri": os.environ.get("OAUTH_REDIRECT_URI", ""),
    "scopes": os.environ.get("OAUTH_SCOPES", "").split(),
}


def oauth_configured() -> bool:
    """True when the minimum OAuth env vars are present. Tools that need user
    auth should check this and return a clear 'connect your account' message
    rather than acting unauthenticated."""
    return bool(OAUTH["client_id"] and OAUTH["token_url"])


def _dashboard_html() -> str:
    try:
        with open(DASHBOARD_HTML, "r", encoding="utf-8") as fh:
            return fh.read()
    except OSError:
        return "<div>Candidate dashboard component missing.</div>"


@mcp.resource(DASHBOARD_URI, mime_type="text/html;profile=mcp-app")
def candidate_dashboard_component() -> str:
    """The in-chat candidate dashboard UI (renders inside ChatGPT via the Apps
    bridge). Hosting note: you can also host ui/candidate-dashboard.html on
    ChatGPT Sites and point the resourceUri at that URL instead of inlining."""
    return _dashboard_html()


@mcp.tool(
    title="Build branded resume PDF",
    description=(
        "Build the finished Top Tier Talent Group branded resume PDF from structured "
        "candidate data. Preserves every section, strips contact info for the client "
        "copy, and enforces the house rules. Use when the user asks to brand or format a resume."
    ),
    annotations={"readOnlyHint": False, "destructiveHint": False, "openWorldHint": False},
)
def build_pdf(candidate: dict, filename: str | None = None) -> dict:
    """candidate is the candidate.json schema (name, headline, summary, skills[],
    experience[], education[], education_heading?, sections[]). Returns the PDF as
    base64 plus its filename and page count."""
    name = (candidate.get("name") or "Candidate").strip()
    out_name = filename or f"{name} - Top Tier Talent Group.pdf"
    with tempfile.TemporaryDirectory() as tmp:
        data_path = os.path.join(tmp, "candidate.json")
        out_path = os.path.join(tmp, out_name)
        with open(data_path, "w", encoding="utf-8") as fh:
            json.dump(candidate, fh)
        result = subprocess.run(
            [sys.executable, BUILDER, "--data", data_path, "--out", out_path],
            capture_output=True, text=True, timeout=180,
        )
        if not os.path.exists(out_path):
            return {
                "ok": False,
                "error": "builder did not produce a PDF",
                "detail": (result.stderr or result.stdout)[-1000:],
            }
        with open(out_path, "rb") as fh:
            pdf_bytes = fh.read()
    return {
        "ok": True,
        "filename": out_name,
        "pdf_base64": base64.b64encode(pdf_bytes).decode(),
        "bytes": len(pdf_bytes),
        "builder_output": (result.stdout or "").strip()[-400:],
    }


def _not_configured(tool: str, connector: str) -> dict:
    return {
        "ok": False,
        "status": "not_configured",
        "message": (
            f"{tool} is a stub. Implement it against your {connector} connector and OAuth "
            f"in your deployment. Write actions must stay gated behind an explicit human yes."
        ),
    }


@mcp.tool(
    title="Find email",
    description="Read-only Gmail lookup. Stub: wire to your Gmail connector.",
    annotations={"readOnlyHint": True, "openWorldHint": True},
)
def find_email(query: str) -> dict:
    return _not_configured("find_email", "Gmail")


@mcp.tool(
    title="Send email",
    description="Send an email. Stub and gated: never send without an explicit human yes.",
    annotations={"readOnlyHint": False, "destructiveHint": True, "openWorldHint": True},
)
def send_email(to: str, subject: str, body: str) -> dict:
    return _not_configured("send_email", "Gmail")


@mcp.tool(
    title="Create calendar event",
    description="Create a calendar event. Stub: wire to your Calendar connector.",
    annotations={"readOnlyHint": False, "destructiveHint": True, "openWorldHint": True},
)
def create_calendar_event(title: str, start: str, end: str, attendees: list | None = None) -> dict:
    return _not_configured("create_calendar_event", "Calendar")


@mcp.tool(
    title="Update Loxo record",
    description="Write to a Loxo record. Stub and gated: Loxo stays read-only unless separately authorized.",
    annotations={"readOnlyHint": False, "destructiveHint": True, "openWorldHint": True},
)
def update_loxo_record(record_id: str, fields: dict) -> dict:
    return _not_configured("update_loxo_record", "Loxo")


@mcp.tool(
    title="Show candidate dashboard",
    description=(
        "Render the in-chat candidate dashboard: one card per candidate with name, "
        "title, location, compensation, status, and skill tags. Use when the user wants "
        "to see their candidates or a pipeline overview."
    ),
    annotations={"readOnlyHint": True, "openWorldHint": False},
)
def show_candidates(candidates: list | None = None) -> dict:
    """Pass a list of candidate summaries to display. Each item may include name,
    title, location, comp, status, and tags[]. The dashboard component reads this
    structuredContent and renders it. Data is treated as untrusted by the UI."""
    return {
        "structuredContent": {"candidates": candidates or []},
        "content": [{"type": "text", "text": f"Showing {len(candidates or [])} candidate(s)."}],
        "_meta": {"ui": {"resourceUri": DASHBOARD_URI}, "openai/outputTemplate": DASHBOARD_URI},
    }


if __name__ == "__main__":
    # Streamable HTTP transport; serves the MCP endpoint at /mcp.
    mcp.run(transport="streamable-http")
