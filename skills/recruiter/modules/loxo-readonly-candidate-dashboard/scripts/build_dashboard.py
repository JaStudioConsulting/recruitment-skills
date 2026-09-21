#!/usr/bin/env python3
"""Build a standalone local candidate dashboard from normalized JSON data."""

from __future__ import annotations

import argparse
import html
import json
from pathlib import Path
from typing import Any

DECISIONS = ["", "Priority", "Screen", "Hold", "Pass", "Contacted", "Submit"]
ACTIVITY_TYPES = ("none", "attempted", "reached", "bounced", "replied")


def valid_stage(value: Any, label: str) -> str:
    if not isinstance(value, str) or value != value.strip() or not value or len(value) > 120:
        raise ValueError(f"{label} must be a non-empty stage string of at most 120 characters.")
    if any(ord(character) < 32 for character in value):
        raise ValueError(f"{label} must not contain control characters.")
    return value


def stage_order(job: dict[str, Any], candidates: list[dict[str, Any]]) -> list[str]:
    configured = job.get("stage_order", [])
    if not isinstance(configured, list):
        raise ValueError("'job.stage_order' must be a list when supplied.")
    ordered: list[str] = []
    seen: set[str] = set()
    for index, value in enumerate(configured):
        stage = valid_stage(value, f"job.stage_order[{index}]")
        if stage in seen:
            raise ValueError(f"Duplicate job.stage_order value: {stage}")
        seen.add(stage)
        ordered.append(stage)
    for candidate in candidates:
        stage = candidate["stage"]
        if stage not in seen:
            seen.add(stage)
            ordered.append(stage)
    return ordered


def load_payload(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or "job" not in payload or "candidates" not in payload:
        raise ValueError("Input JSON must contain 'job' and 'candidates'.")
    if not isinstance(payload["job"], dict):
        raise ValueError("'job' must be an object.")
    if not isinstance(payload["candidates"], list):
        raise ValueError("'candidates' must be a list.")
    for index, candidate in enumerate(payload["candidates"]):
        if not isinstance(candidate, dict):
            raise ValueError(f"candidates[{index}] must be an object.")
        candidate["stage"] = valid_stage(candidate.get("stage"), f"candidates[{index}].stage")
        activity_type = candidate.get("activity_type")
        if activity_type not in ACTIVITY_TYPES:
            allowed = ", ".join(ACTIVITY_TYPES)
            raise ValueError(f"candidates[{index}].activity_type must be one of: {allowed}.")
    stage_order(payload["job"], payload["candidates"])
    return payload


def js_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False).replace("</", "<\\/")


def build_html(payload: dict[str, Any]) -> str:
    job = payload["job"]
    candidates = payload["candidates"]
    stages = stage_order(job, candidates)
    title = html.escape(f"{job.get('title', 'Candidate Dashboard')} — {job.get('company', '')}")
    storage_key = f"loxo-dashboard-{job.get('job_id', 'job')}-v1"

    return f"""<!doctype html>
<html lang=\"en\">
<head>
<meta charset=\"utf-8\">
<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">
<title>{title}</title>
<style>
:root{{--bg:#f4efe6;--paper:#fffdf8;--ink:#202524;--muted:#68706d;--line:#d8d2c8;--sage:#4b635e;--purple:#7451c8}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}}
.shell{{max-width:1900px;margin:auto;padding:24px}}.hero{{background:#2d3532;color:white;border-radius:20px;padding:26px}}
h1{{margin:0 0 8px;font-family:Georgia,serif;font-weight:500}}.meta{{color:#d7dfdc;font-size:14px}}
.controls{{display:flex;gap:10px;flex-wrap:wrap;position:sticky;top:8px;background:rgba(255,253,248,.94);padding:12px;border:1px solid var(--line);border-radius:14px;margin:16px 0;z-index:3}}
input,select,textarea,button{{font:inherit}}input,select,textarea{{border:1px solid var(--line);border-radius:9px;background:white;padding:9px}}input{{min-width:260px;flex:1}}button{{border:1px solid var(--line);border-radius:9px;padding:9px 12px;background:white;cursor:pointer}}
.stage{{background:var(--paper);border:1px solid var(--line);border-radius:16px;overflow:hidden;margin:14px 0}}.stage h2{{font-size:15px;margin:0;padding:15px 17px;cursor:pointer}}
.wrap{{overflow:auto}}table{{border-collapse:collapse;width:100%;min-width:1450px}}th,td{{padding:12px;border-top:1px solid var(--line);text-align:left;vertical-align:top;font-size:13px}}th{{background:#f1ede5;font-size:11px;text-transform:uppercase;letter-spacing:.07em}}
.badge{{display:inline-block;border-radius:999px;padding:5px 8px;background:#e2e8e5;font-weight:700;font-size:11px}}.applied{{background:#eee7ff;color:#54359a}}.not-applied{{background:#eee;color:#666}}
.role{{margin-bottom:6px}}.role b{{display:block}}.summary{{border-top:1px dashed var(--line);padding-top:7px;margin-top:7px;color:var(--muted)}}textarea{{width:100%;min-height:70px;resize:vertical}}.hidden{{display:none}}
</style>
</head>
<body><div class=\"shell\">
<section class=\"hero\"><h1 id=\"title\"></h1><div class=\"meta\" id=\"meta\"></div></section>
<section class=\"controls\"><input id=\"search\" type=\"search\" placeholder=\"Search candidates…\"><select id=\"stage\"><option value=\"\">All stages</option></select><select id=\"applied\"><option value=\"\">Applied: All</option><option value=\"yes\">Applied: Yes</option><option value=\"no\">Applied: No</option></select><select id=\"outreach\"><option value=\"\">Outreach: All</option><option value=\"none\">Outreach: No job-specific outreach</option><option value=\"attempted\">Outreach: Attempted</option><option value=\"reached\">Outreach: Reached</option><option value=\"bounced\">Outreach: Bounced</option><option value=\"replied\">Outreach: Replied</option></select><button id=\"csv\">Export CSV</button><button id=\"json\">Export JSON</button></section>
<main id=\"app\"></main>
</div>
<script>
const job={js_json(job)};const candidates={js_json(candidates)};const stageOrder={js_json(stages)};const storageKey={js_json(storage_key)};const decisions={js_json(DECISIONS)};
const saved=JSON.parse(localStorage.getItem(storageKey)||'{{}}');const esc=s=>String(s??'').replace(/[&<>\"']/g,c=>({{'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}}[c]));
document.getElementById('title').textContent=`${{job.title||'Candidate Dashboard'}} — ${{job.company||''}}`;document.getElementById('meta').textContent=[job.location,job.salary,job.schedule,`Job ID ${{job.job_id}}`].filter(Boolean).join(' • ');
stageOrder.forEach(s=>document.getElementById('stage').insertAdjacentHTML('beforeend',`<option>${{esc(s)}}</option>`));
function rows(){{const q=document.getElementById('search').value.toLowerCase();const st=document.getElementById('stage').value;const ap=document.getElementById('applied').value;const outreach=document.getElementById('outreach').value;return candidates.filter(r=>{{const h=[r.candidate,r.stage,r.industry,r.tickets,r.activity,(r.employment||[]).join(' '),r.employment_summary].join(' ').toLowerCase();return(!q||h.includes(q))&&(!st||r.stage===st)&&(!ap||(ap==='yes')===!!r.applied)&&(!outreach||r.activity_type===outreach)}})}}
function emp(r){{return(r.employment||[]).map(x=>{{const p=x.split(' | ');return`<div class=\"role\"><b>${{esc(p[0])}}</b>${{esc(p.slice(1).join(' • '))}}</div>`}}).join('')+`<div class=\"summary\">${{esc(r.employment_summary||'')}}</div>`}}
function render(){{const rs=rows();document.getElementById('app').innerHTML=stageOrder.map(st=>{{const g=rs.filter(r=>r.stage===st);if(!g.length)return'';return`<section class=\"stage\"><h2>${{esc(st)}} (${{g.length}})</h2><div class=\"wrap\"><table><thead><tr><th>Stage</th><th>🟣 Applied</th><th>Candidate</th><th>Recent Employment Snapshot</th><th>Industry</th><th>Tickets / Licences</th><th>Activity / Outreach</th><th>Decision</th><th>Notes</th></tr></thead><tbody>${{g.map(r=>{{const l=saved[r.id]||{{}};return`<tr data-id=\"${{r.id}}\"><td><span class=\"badge\">${{esc(r.stage)}}</span></td><td><span class=\"badge ${{r.applied?'applied':'not-applied'}}\">${{r.applied?'Yes':'No'}}</span></td><td><b>${{esc(r.candidate)}}</b></td><td>${{emp(r)}}</td><td>${{esc(r.industry)}}</td><td>${{esc(r.tickets)}}</td><td>${{esc(r.activity)}}</td><td><select class=\"decision\">${{decisions.map(d=>`<option value=\"${{esc(d)}}\" ${{(l.decision||'')===d?'selected':''}}>${{esc(d||'Unreviewed')}}</option>`).join('')}}</select></td><td><textarea class=\"notes\">${{esc(l.notes||'')}}</textarea></td></tr>`}}).join('')}}</tbody></table></div></section>`}}).join('');wire()}}
function wire(){{document.querySelectorAll('.stage h2').forEach(h=>h.onclick=()=>h.nextElementSibling.classList.toggle('hidden'));document.querySelectorAll('tr[data-id]').forEach(tr=>{{const id=tr.dataset.id,d=tr.querySelector('.decision'),n=tr.querySelector('.notes');const save=()=>{{saved[id]={{decision:d.value,notes:n.value}};localStorage.setItem(storageKey,JSON.stringify(saved))}};d.onchange=save;n.oninput=save}})}}
function download(text,name,type){{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{{type}}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}}
function exportRows(){{return candidates.map(r=>{{const l=saved[r.id]||{{}};return{{Stage:r.stage,Applied:r.applied?'Yes':'No',Candidate:r.candidate,Employment:[...(r.employment||[]),r.employment_summary||''].join(' | '),Industry:r.industry,Tickets:r.tickets,Activity:r.activity,OutreachStatus:r.activity_type,Decision:l.decision||'',Notes:l.notes||''}}}})}}
document.getElementById('csv').onclick=()=>{{const r=exportRows(),h=Object.keys(r[0]),csv=[h.join(','),...r.map(x=>h.map(k=>`\"${{String(x[k]??'').replace(/\"/g,'\"\"')}}\"`).join(','))].join('\n');download(csv,'candidate-dashboard.csv','text/csv')}};document.getElementById('json').onclick=()=>download(JSON.stringify({{job,candidates:exportRows()}},null,2),'candidate-dashboard.json','application/json');['search','stage','applied','outreach'].forEach(id=>document.getElementById(id).addEventListener(id==='search'?'input':'change',render));render();
</script></body></html>"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_json", type=Path)
    parser.add_argument("output_html", type=Path)
    args = parser.parse_args()

    payload = load_payload(args.input_json)
    args.output_html.write_text(build_html(payload), encoding="utf-8")
    print(args.output_html)


if __name__ == "__main__":
    main()
