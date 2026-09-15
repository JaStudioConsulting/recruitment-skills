"""TTTG Recruiting MCP server (Vercel serverless, Python-only, isolated).

Self-contained so Vercel installs its deps cleanly (no root package.json in this
folder). Exposes the candidate dashboard UI and the recruiting tools. build_pdf is
a stub on this endpoint for now (the PDF builder runs on Claude/Codex); it can be
wired in once the endpoint is confirmed working.
"""
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("tttg-recruiting", stateless_http=True, json_response=True)

DASHBOARD_URI = "ui://tttg/candidate-dashboard"

_DASH = """<!doctype html><html><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>TTTG Candidate Dashboard</title><style>body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;font-size:14px}.wrap{max-width:900px;margin:0 auto;padding:16px}.top{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:14px}.brand{font-weight:bold}.brand small{display:block;color:#6b6b6b;font-size:11px;letter-spacing:.5px}.grid{display:grid;grid-template-columns:1fr;gap:10px}@media(min-width:620px){.grid{grid-template-columns:1fr 1fr}}.card{border:1px solid #e4e4e4;border-radius:10px;padding:14px}.name{font-weight:bold;margin:0}.title{color:#6b6b6b;margin:2px 0 8px}.row{display:flex;flex-wrap:wrap;gap:6px 14px;color:#6b6b6b;font-size:12px;margin-bottom:8px}.chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.chip{background:#f2f2f2;border-radius:999px;padding:3px 9px;font-size:12px}.status{font-size:11px;font-weight:bold;text-transform:uppercase;padding:3px 8px;border-radius:6px;border:1px solid #e4e4e4}.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}button{font:inherit;font-size:12px;border:1px solid #111;background:#fff;border-radius:8px;padding:6px 10px;cursor:pointer}button.p{background:#111;color:#fff}.hint{color:#6b6b6b;font-size:11px;margin-top:14px;text-align:center}</style></head><body><div class=wrap><div class=top><div class=brand>Top Tier Talent Group<small>CANDIDATE DASHBOARD</small></div><div class=hint id=c></div></div><div id=g class=grid></div><div class=hint id=h></div></div><script type=module>const S={candidates:[{name:'Synthetic Candidate J',title:'Maintenance Manager',location:'Aurora, ON',comp:'$85K to $95K',status:'GO',tags:['433A Millwright','SAP PM','PLC/VFD']},{name:'Synthetic Candidate K',title:'Welder-Fitter',location:'Cambridge, ON',comp:'$30/hr',status:'REVIEW',tags:['CWB MIG','FCAW','Carbon Steel']}]};function el(t,c,x){const n=document.createElement(t);if(c)n.className=c;if(x!=null)n.textContent=x;return n}function render(d){const g=document.getElementById('g');const L=Array.isArray(d&&d.candidates)?d.candidates:[];g.innerHTML='';document.getElementById('c').textContent=L.length?L.length+' candidate'+(L.length>1?'s':''):'';if(!L.length){g.appendChild(el('div','hint','No candidates yet.'));return}for(const c of L){const card=el('div','card');const hd=el('div');hd.style.display='flex';hd.style.justifyContent='space-between';const lf=el('div');lf.appendChild(el('p','name',c.name||''));lf.appendChild(el('p','title',c.title||''));hd.appendChild(lf);if(c.status)hd.appendChild(el('span','status',c.status));card.appendChild(hd);const r=el('div','row');if(c.location)r.appendChild(el('span',null,c.location));if(c.comp)r.appendChild(el('span',null,c.comp));card.appendChild(r);if(Array.isArray(c.tags)){const ch=el('div','chips');c.tags.forEach(t=>ch.appendChild(el('span','chip',t)));card.appendChild(ch)}const a=el('div','actions');const mk=(l,tool,p)=>{const b=el('button',p?'p':null,l);b.addEventListener('click',()=>{try{window.parent.postMessage({type:'openai:tool',tool,arguments:{name:c.name}},'*')}catch(e){}});return b};a.appendChild(mk('Brand resume','build_pdf',1));a.appendChild(mk('Vet','vet'));a.appendChild(mk('Write-up','write_up'));card.appendChild(a);g.appendChild(card)}}window.addEventListener('message',e=>{const d=e&&e.data;if(d&&(d.type==='ui/notifications/tool-result'||d.toolResult)){const p=(d.toolResult&&d.toolResult.structuredContent)||d.structuredContent;if(p)render(p)}});render((window.__MCP_TOOL_RESULT__&&window.__MCP_TOOL_RESULT__.structuredContent)||S);document.getElementById('h').textContent='Live data replaces this sample inside ChatGPT.';</script></body></html>"""


@mcp.resource(DASHBOARD_URI, mime_type="text/html;profile=mcp-app")
def candidate_dashboard_component() -> str:
    return _DASH


@mcp.tool(
    title="Show candidate dashboard",
    description="Render the in-chat candidate dashboard: a card per candidate with name, title, location, compensation, status, and skill tags.",
    annotations={"readOnlyHint": True, "openWorldHint": False},
)
def show_candidates(candidates: list | None = None) -> dict:
    return {
        "structuredContent": {"candidates": candidates or []},
        "content": [{"type": "text", "text": f"Showing {len(candidates or [])} candidate(s)."}],
        "_meta": {"ui": {"resourceUri": DASHBOARD_URI}, "openai/outputTemplate": DASHBOARD_URI},
    }


@mcp.tool(
    title="Build branded resume PDF",
    description="Build the branded TTTG resume PDF from candidate data.",
    annotations={"readOnlyHint": False, "destructiveHint": False, "openWorldHint": False},
)
def build_pdf(candidate: dict, filename: str | None = None) -> dict:
    return {
        "ok": False,
        "status": "builder_pending",
        "message": "PDF building is not wired on this endpoint yet. Build on Claude or Codex for now. Candidate received: " + str(candidate.get("name", "")),
    }


def _stub(tool: str, connector: str) -> dict:
    return {"ok": False, "status": "not_configured", "message": tool + " is a stub. Wire it to your " + connector + " connector and OAuth. Write actions stay gated."}


@mcp.tool(title="Find email", description="Read-only Gmail lookup. Stub.", annotations={"readOnlyHint": True, "openWorldHint": True})
def find_email(query: str) -> dict:
    return _stub("find_email", "Gmail")


@mcp.tool(title="Send email", description="Send an email. Stub and gated.", annotations={"readOnlyHint": False, "destructiveHint": True, "openWorldHint": True})
def send_email(to: str, subject: str, body: str) -> dict:
    return _stub("send_email", "Gmail")


@mcp.tool(title="Update Loxo record", description="Write to Loxo. Stub and gated.", annotations={"readOnlyHint": False, "destructiveHint": True, "openWorldHint": True})
def update_loxo_record(record_id: str, fields: dict) -> dict:
    return _stub("update_loxo_record", "Loxo")


app = mcp.streamable_http_app()
