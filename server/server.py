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
import hmac
import json
import os
import subprocess
import sys
import tempfile
import time
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from candidate_input import SCHEMA_HINT, normalize_candidate  # noqa: E402

try:
    from mcp.server.fastmcp import FastMCP
except ImportError as _err:  # show the real cause (e.g. wrong mcp major version)
    sys.exit(
        "Cannot import FastMCP from mcp.server.fastmcp: "
        f"{_err}. Install pinned deps: pip install -r requirements.txt "
        "(this server needs the mcp 1.x API)."
    )

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILDER = os.path.join(
    REPO_ROOT, "skills", "recruiter", "modules", "brandedresume", "scripts", "build_resume.py"
)
DASHBOARD_HTML = os.path.join(REPO_ROOT, "ui", "candidate-dashboard.html")
DASHBOARD_URI = "ui://tttg/candidate-dashboard"

# Where generated PDFs are written, and the public base used to build download
# links. Render sets RENDER_EXTERNAL_URL automatically.
FILES_DIR = os.environ.get("FILES_DIR", os.path.join(tempfile.gettempdir(), "tttg-files"))
PUBLIC_BASE = (os.environ.get("PUBLIC_BASE_URL") or os.environ.get("RENDER_EXTERNAL_URL") or "").rstrip("/")
_FILE_NAMES: dict = {}
# Generated resumes hold real candidate data. Delete them after this many
# seconds (default one hour) so the host never accumulates them.
FILE_TTL_SECONDS = int(os.environ.get("FILE_TTL_SECONDS", "3600"))

# Access key for the broker. When BROKER_TOKEN is set in the deploy's
# environment, every /mcp request must present it, either as
# "Authorization: Bearer <token>" (the Workbench, server to server) or as
# "?key=<token>" on the connector URL (ChatGPT's no-auth connector mode).
# Unset means open access, which is only for local testing.
BROKER_TOKEN = os.environ.get("BROKER_TOKEN", "")

# The MCP SDK applies DNS-rebinding protection (a localhost-server safeguard)
# that rejects any non-localhost Host header. This is a public HTTPS endpoint, so
# that check does not apply; disable it and allow remote client origins.
_fastmcp_kwargs = {"stateless_http": True, "json_response": True}
try:
    from mcp.server.transport_security import TransportSecuritySettings

    try:
        _security = TransportSecuritySettings(
            enable_dns_rebinding_protection=False,
            allowed_hosts=["*"],
            allowed_origins=["*"],
        )
    except Exception:  # noqa: BLE001 - field name differs on older SDKs
        _security = TransportSecuritySettings(allowed_hosts=["*"], allowed_origins=["*"])
    _fastmcp_kwargs["transport_security"] = _security
except Exception:  # noqa: BLE001 - SDK without transport security settings
    pass

mcp = FastMCP("tttg-recruiting", **_fastmcp_kwargs)

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
        "candidate data. Use when the user asks to brand or format a resume. "
        + SCHEMA_HINT
        + " If the result has ok=false, fix every listed problem and call again."
    ),
    annotations={"readOnlyHint": False, "destructiveHint": False, "openWorldHint": False},
)
def build_pdf(candidate: dict, filename: str | None = None) -> dict:
    """candidate is the candidate.json schema (name, headline, summary, skills[],
    experience[], education[], education_heading?, sections[]). Builds the PDF and
    returns a download link the user can click, plus the filename and size.
    Input is normalized, contact-stripped, and checked for dropped content before
    the builder runs (see candidate_input.py)."""
    _sweep_expired_files()
    candidate, report = normalize_candidate(candidate)
    if report["problems"]:
        return {
            "ok": False,
            "error": "input_rejected",
            "problems": report["problems"],
            "message": "Nothing was built. Fix each problem listed and call build_pdf again.",
        }
    name = (candidate.get("name") or "Candidate").strip()
    out_name = filename or f"{name} - Top Tier Talent Group.pdf"
    token = uuid.uuid4().hex
    stored_path = os.path.join(FILES_DIR, token + ".pdf")
    os.makedirs(FILES_DIR, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        data_path = os.path.join(tmp, "candidate.json")
        with open(data_path, "w", encoding="utf-8") as fh:
            json.dump(candidate, fh)
        # reportlab engine: hosted runtimes have no headless Chrome.
        result = subprocess.run(
            [sys.executable, BUILDER, "--data", data_path, "--out", stored_path,
             "--engine", "reportlab"],
            capture_output=True, text=True, timeout=180,
        )
    if not os.path.exists(stored_path):
        return {
            "ok": False,
            "error": "builder did not produce a PDF",
            "detail": (result.stderr or result.stdout)[-1000:],
        }
    size = os.path.getsize(stored_path)
    _FILE_NAMES[token] = out_name
    return {
        "ok": True,
        "filename": out_name,
        "download_url": f"{PUBLIC_BASE}/files/{token}.pdf" if PUBLIC_BASE else f"/files/{token}.pdf",
        "bytes": size,
        "message": f"Branded resume ready: {out_name}. Click the download link to save it.",
        "builder_output": (result.stdout or "").strip()[-400:],
        "contact_removed": report["stripped"],
        "notes": report["notes"],
        "expires_in_seconds": FILE_TTL_SECONDS,
    }


def _sweep_expired_files() -> None:
    if not os.path.isdir(FILES_DIR):
        return
    cutoff = time.time() - FILE_TTL_SECONDS
    for entry in os.listdir(FILES_DIR):
        path = os.path.join(FILES_DIR, entry)
        try:
            if os.path.getmtime(path) < cutoff:
                os.remove(path)
                _FILE_NAMES.pop(entry[:-4], None)
        except OSError:
            pass


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


# ---------------------------------------------------------------- access key
def _presented_key(scope) -> str:
    headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers", [])}
    auth = headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    from urllib.parse import parse_qs

    return (parse_qs(scope.get("query_string", b"").decode()).get("key") or [""])[0]


class _BrokerKeyMiddleware:
    """Guards /mcp with BROKER_TOKEN. /health and /files stay open: health is an
    uptime ping, and download links are unguessable one-hour tokens a browser
    opens directly (it cannot attach a header)."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope.get("path", "").startswith("/mcp"):
            if not hmac.compare_digest(_presented_key(scope), BROKER_TOKEN):
                from starlette.responses import JSONResponse

                await JSONResponse({"error": "unauthorized", "message": "Missing or wrong broker key."},
                                   status_code=401)(scope, receive, send)
                return
        await self.app(scope, receive, send)


# ---------------------------------------------------------------- ASGI app
# Hosted runtimes serve this app. It carries the MCP endpoint at /mcp plus two
# plain HTTP routes: /health (uptime ping) and /files/<token>.pdf (downloads).
def _build_app():
    from starlette.responses import FileResponse, JSONResponse, PlainTextResponse
    from starlette.routing import Route

    application = mcp.streamable_http_app()

    async def health(_request):
        return JSONResponse({"ok": True, "service": "tttg-recruiting"})

    async def download(request):
        token = (request.path_params.get("token") or "").replace("/", "").replace("..", "")
        path = os.path.join(FILES_DIR, token + ".pdf")
        if not token or not os.path.exists(path):
            return PlainTextResponse("Not found or expired.", status_code=404)
        return FileResponse(
            path,
            media_type="application/pdf",
            filename=_FILE_NAMES.get(token, "resume.pdf"),
        )

    if BROKER_TOKEN:
        application.add_middleware(_BrokerKeyMiddleware)

    application.router.routes.append(Route("/health", health, methods=["GET"]))
    application.router.routes.append(
        Route("/files/{token}.pdf", download, methods=["GET"])
    )
    return application


try:
    app = _build_app()
except Exception:  # noqa: BLE001
    app = None


if __name__ == "__main__":
    # Local/hosted run. Render supplies PORT and requires binding 0.0.0.0.
    mcp.settings.host = os.environ.get("HOST", "0.0.0.0")
    mcp.settings.port = int(os.environ.get("PORT", "8000"))
    mcp.run(transport="streamable-http")
