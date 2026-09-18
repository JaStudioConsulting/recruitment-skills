#!/usr/bin/env python3
"""
build_review.py — turn a candidates JSON into a plain interactive review page.

Agent-agnostic: no vendor libraries, no network. Reads a JSON array of candidate
objects and writes a single self-contained HTML file (search + filter chips +
tap-to-expand cards with resume snippet, recruiter activity, and contacts).

Candidate object fields (all optional except name):
  name, stage, title, company, location,
  phone, email, linkedin, loxo_url,
  has_resume (bool), snippet (str, resume text ~900 chars),
  contacted (bool), contacts (list[str]),
  applied (bool),
  flags (list[str])   # role-specific tags, e.g. ["433A"], ["Heavy Equipment"]

Usage:
  python3 build_review.py --data candidates.json --out review.html \
      --title "Maintenance Millwright (433A) - Candidate Review" \
      --subtitle "Tycos Tool & Die - Concord - 40 candidates"
"""
import argparse, json, html


def esc(s):
    return html.escape(str(s if s is not None else ""))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--title", default="Candidate Review")
    ap.add_argument("--subtitle", default="")
    args = ap.parse_args()

    data = json.load(open(args.data))
    for d in data:
        d.setdefault("flags", [])
        d.setdefault("contacts", [])
    blob = json.dumps(data, ensure_ascii=False)

    tpl = TEMPLATE
    tpl = tpl.replace("__TITLE__", esc(args.title))
    tpl = tpl.replace("__SUBTITLE__", esc(args.subtitle))
    tpl = tpl.replace("__BLOB__", blob)
    open(args.out, "w").write(tpl)
    print(f"wrote {args.out} ({len(data)} candidates)")


TEMPLATE = r"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>__TITLE__</title>
<style>
:root{--bg:#f4f5f7;--surface:#fff;--surface-2:#eef0f3;--ink:#1c2430;--muted:#5b6675;--line:#d9dee5;--accent:#2f6f9e;--accent-ink:#1c4d70;--good:#1f7a4d;--good-bg:#e3f3ea;--warn:#8a5a12;--warn-bg:#faf0dc;--neutral:#4a5568;--neutral-bg:#e7ebf0;--flag:#245a7a;--flag-bg:#e2eef4;--app:#1f7a4d;--app-bg:#e3f3ea;--src:#6a6a72;--src-bg:#e9e9ee}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#12161c;--surface:#1a2029;--surface-2:#222a35;--ink:#e6eaf0;--muted:#9aa6b4;--line:#2c3542;--accent:#5aa6d6;--accent-ink:#8cc4e8;--good:#67c795;--good-bg:#153026;--warn:#e0b467;--warn-bg:#33280f;--neutral:#aab4c2;--neutral-bg:#232b36;--flag:#7cc0e2;--flag-bg:#16303f;--app:#67c795;--app-bg:#153026;--src:#b6b6c0;--src-bg:#26262d}}
:root[data-theme="dark"]{--bg:#12161c;--surface:#1a2029;--surface-2:#222a35;--ink:#e6eaf0;--muted:#9aa6b4;--line:#2c3542;--accent:#5aa6d6;--accent-ink:#8cc4e8;--good:#67c795;--good-bg:#153026;--warn:#e0b467;--warn-bg:#33280f;--neutral:#aab4c2;--neutral-bg:#232b36;--flag:#7cc0e2;--flag-bg:#16303f;--app:#67c795;--app-bg:#153026;--src:#b6b6c0;--src-bg:#26262d}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.wrap{max-width:860px;margin:0 auto;padding-inline:16px}
header.top{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--line);padding-block:14px 10px}
h1{font-size:18px;margin:0 0 2px;font-weight:700}.sub{color:var(--muted);font-size:12.5px;margin:0 0 12px}
.controls{display:flex;flex-direction:column;gap:8px}
#q{width:100%;padding:9px 12px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink);font-size:14px}
#q:focus{outline:2px solid var(--accent);outline-offset:1px}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{border:1px solid var(--line);background:var(--surface);color:var(--muted);border-radius:999px;padding:4px 10px;font-size:12px;cursor:pointer;font-weight:600}
.chip[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:#fff}
.count{color:var(--muted);font-size:12px;padding:10px 2px 4px}
ul.list{list-style:none;margin:0;padding:0 0 40px;display:flex;flex-direction:column;gap:8px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:10px;overflow:hidden}
.head{display:grid;grid-template-columns:1fr auto;gap:6px 12px;align-items:start;padding:12px 14px;cursor:pointer;width:100%;text-align:left;background:none;border:0;color:inherit;font:inherit}
.name{font-size:15px;font-weight:700}.row2{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.badge{font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;white-space:nowrap}
.b-app{background:var(--app-bg);color:var(--app)}.b-src{background:var(--src-bg);color:var(--src)}.b-flag{background:var(--flag-bg);color:var(--flag)}.b-good{background:var(--good-bg);color:var(--good)}.b-warn{background:var(--warn-bg);color:var(--warn)}.b-stage{background:var(--neutral-bg);color:var(--neutral)}
.chev{color:var(--muted);font-size:12px;align-self:center;justify-self:end}
.contact{font-size:12.5px;color:var(--muted);text-align:right;font-variant-numeric:tabular-nums;line-height:1.7}
.contact a{color:var(--accent-ink);text-decoration:none}
.body{border-top:1px solid var(--line);padding:12px 14px;background:var(--surface-2);display:flex;flex-direction:column;gap:12px}
.lbl{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:4px}
.snippet{white-space:pre-wrap;font-size:12.5px;line-height:1.55;max-height:230px;overflow:auto;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:10px}
.norz{color:var(--warn);font-weight:600}.act{display:flex;flex-direction:column;gap:3px;font-size:12.5px}.act .none{color:var(--muted)}
.links a{color:var(--accent-ink);font-weight:600;text-decoration:none;font-size:12.5px}
[hidden]{display:none!important}
@media(max-width:520px){.head{grid-template-columns:1fr}.chev{display:none}.contact{text-align:left}}
</style></head><body>
<div class="wrap">
<header class="top"><h1>__TITLE__</h1><p class="sub">__SUBTITLE__</p>
<div class="controls"><input id="q" type="search" placeholder="Search name, company, background..." autocomplete="off">
<div class="chips" id="chips">
<button class="chip" data-f="applied" aria-pressed="false">Applied only</button>
<button class="chip" data-f="flag" aria-pressed="false">Flagged</button>
<button class="chip" data-f="uncontacted" aria-pressed="false">Not yet contacted</button>
<button class="chip" data-f="resume" aria-pressed="false">Has resume</button>
</div></div></header>
<div class="count" id="count"></div><ul class="list" id="list"></ul></div>
<script>
const DATA=__BLOB__;
const esc=s=>(s||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const filters={applied:false,flag:false,uncontacted:false,resume:false};let q='';
function passes(d){
  if(filters.applied&&!d.applied)return false;
  if(filters.flag&&!(d.flags&&d.flags.length))return false;
  if(filters.uncontacted&&d.contacted)return false;
  if(filters.resume&&!d.has_resume)return false;
  if(q){const hay=(d.name+' '+(d.title||'')+' '+(d.company||'')+' '+(d.snippet||'')).toLowerCase();if(!hay.includes(q))return false;}
  return true;
}
function cblock(d){if(!d.contacts||!d.contacts.length)return '<span class="none">No recruiter activity logged.</span>';return d.contacts.map(c=>'<span>'+esc(c)+'</span>').join('');}
function bg(d){if(d.has_resume)return esc(d.snippet)||'&mdash;';return 'No resume on file. Profile: '+esc(d.title||'-')+(d.company?(' at '+esc(d.company)):'');}
function render(){
  const list=document.getElementById('list');const shown=DATA.filter(passes);
  document.getElementById('count').textContent=shown.length+' of '+DATA.length+' shown';
  list.innerHTML=shown.map(d=>{const i=DATA.indexOf(d);
    const app=d.applied?'<span class="badge b-app">Applied</span>':'<span class="badge b-src">Sourced</span>';
    const fl=(d.flags||[]).map(f=>'<span class="badge b-flag">'+esc(f)+'</span>').join('');
    const cb=d.contacted?'<span class="badge b-warn">Contacted</span>':'<span class="badge b-good">Not contacted</span>';
    const rz=d.has_resume?'':'<span class="norz">No resume</span>';
    const em=d.email?d.email.split(';')[0].trim():'';
    return `<li class="card"><button class="head" aria-expanded="false" aria-controls="b${i}" onclick="tog(${i},this)">
      <div><div class="name">${esc(d.name)}</div><div class="row2">${app}<span class="badge b-stage">${esc(d.stage||'')}</span>${fl}${cb} ${rz}</div></div>
      <div class="contact">${d.phone?`<a href="tel:${esc((d.phone||'').replace(/[^+0-9]/g,''))}">${esc(d.phone)}</a><br>`:''}${em?`<a href="mailto:${esc(em)}">${esc(em)}</a>`:'<span style="color:var(--muted)">no email</span>'}</div>
      <span class="chev">&#9662;</span></button>
      <div class="body" id="b${i}" hidden>
        <div><div class="lbl">Background</div><div class="snippet">${bg(d)}</div></div>
        <div><div class="lbl">Recruiter activity</div><div class="act">${cblock(d)}</div></div>
        ${d.loxo_url?`<div class="links"><a href="${esc(d.loxo_url)}" target="_blank" rel="noopener">Open in Loxo &#8599;</a></div>`:''}
      </div></li>`;}).join('');
}
function tog(i,btn){const b=document.getElementById('b'+i);const o=b.hidden;b.hidden=!o;btn.setAttribute('aria-expanded',o?'true':'false');btn.querySelector('.chev').innerHTML=o?'&#9652;':'&#9662;';}
document.getElementById('chips').addEventListener('click',e=>{const b=e.target.closest('.chip');if(!b)return;const f=b.dataset.f;filters[f]=!filters[f];b.setAttribute('aria-pressed',filters[f]?'true':'false');render();});
document.getElementById('q').addEventListener('input',e=>{q=e.target.value.trim().toLowerCase();render();});
render();
</script></body></html>"""


if __name__ == "__main__":
    main()
