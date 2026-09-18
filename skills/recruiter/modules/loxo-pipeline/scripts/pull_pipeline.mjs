/**
 * pull_pipeline.mjs — reference pull of a Loxo job pipeline via a logged-in
 * browser session. Writes <out>/<slug>_pipeline.json and .csv, plus a
 * <out>/<slug>_cvs/ folder of resume text.
 *
 * AGENT-AGNOSTIC NOTE
 * -------------------
 * This reference uses `ego-browser`'s helpers (useOrCreateTaskSpace,
 * openOrReuseTab, browserFetch, pageInfo, cliLog) because that is what was
 * available where this skill was first built. `browserFetch(path, opts)` runs
 * `fetch()` inside the user's logged-in Loxo tab. Any agent can reproduce this
 * with its own browser driver (Playwright/Puppeteer/Chrome-extension): the only
 * thing that matters is issuing the same GET requests from a context that has
 * the user's Loxo session cookies. Endpoints are in reference/loxo-endpoints.md.
 *
 * Run (in the ego-browser runtime):
 *   ego-browser nodejs < pull_pipeline.mjs
 * with CONFIG below edited, or adapt the fetch layer to your environment.
 */
import fs from 'node:fs'

// ---- CONFIG (edit these) --------------------------------------------------
const AGENCY_ID = 29866
const JOB_ID = 0                 // <-- set the Loxo job id
const OUT_DIR = process.env.HOME + '/Downloads'
const SLUG = 'loxo_job'          // filename prefix
// stages to KEEP (Loxo stage ids). Default = active pipeline, no rejects/subs.
const INCLUDE = {
  268196: 'Applied', 244487: 'Longlist', 244488: 'Shortlist',
  244489: 'Outbound', 330190: 'Follow Up', 244490: 'Screening',
  245671: 'Offer', 244494: 'Hired',
}
const STAGE_ORDER = Object.keys(INCLUDE)
// ---------------------------------------------------------------------------

const BOT = /^(Loxo Agent|Loxo Bot)$/i
const CONTACT = /phone call|voicemail|no answer|email|sms|text|meeting|screen|responded|intake|call -/i
const b = p => browserFetch(p, { headers: { Accept: 'application/json' } })
// Full stage-name -> id map (for deriving stage from "Moved to X" events on the
// browser transport, which does NOT return workflow_stage_id on the list).
const STAGE_BY_NAME = {
  'Applied': 268196, 'Longlist': 244487, 'Shortlist': 244488, 'Outbound': 244489,
  'Follow Up': 330190, 'Screening': 244490, 'Internal Submission': 245262,
  'Submitted': 244491, 'Interview #1': 244492, 'Interview #2+': 305775,
  'Offer': 245671, 'Rejected': 244493, 'Hired': 244494,
}
// Derive a candidate's current stage id. API/MCP list gives workflow_stage_id
// directly; the browser list does not, so fall back to the latest job-scoped
// "Moved to <Stage>" event, then to applied_at -> Applied.
function deriveStageId(cand, jobEvs) {
  if (cand.workflow_stage_id) return cand.workflow_stage_id
  const moves = jobEvs.filter(e => /^Moved to /i.test((e.activity_type || {}).name || ''))
  if (moves.length) return STAGE_BY_NAME[moves[0].activity_type.name.replace(/^Moved to /i, '')] || null
  if (cand.applied_at) return STAGE_BY_NAME['Applied']
  return null
}

async function main() {
  await useOrCreateTaskSpace('loxo pull ' + JOB_ID)
  await openOrReuseTab(`https://top-tier-talent-group.app.loxo.co/agencies/${AGENCY_ID}/jobs/${JOB_ID}/pipeline`, { wait: true, timeout: 30 })
  const info = await pageInfo()
  if (/login/.test(info.url)) { cliLog('LOGIN_WALL — user must be logged into Loxo in this browser.'); return }

  // 1. all candidates (paged)
  let all = [], page = 1, got
  do { got = JSON.parse(await b(`/agencies/${AGENCY_ID}/jobs/${JOB_ID}/candidates.json?per_page=250&page=${page}`)); all = all.concat(got.candidates || got); page++ }
  while ((got.candidates || got).length === 250 && page <= 8)
  const uniq = Object.values(Object.fromEntries(all.map(c => [c.person.id, c])))

  const cvdir = `${OUT_DIR}/${SLUG}_cvs`; fs.mkdirSync(cvdir, { recursive: true })
  const rows = []

  // 2+3. enrich every candidate (events give stage on the browser transport),
  //      then keep only the included stages.
  for (const c of uniq) {
    const p = c.person
    // activity (also used to derive stage + applied on the browser transport)
    let evs = []
    try { evs = (JSON.parse(await b(`/agencies/${AGENCY_ID}/person_events.json?person_id=${p.id}&per_page=80`)).person_events) || [] } catch {}
    const jobEvs = evs.filter(e => e.job_id === JOB_ID)
    const stageId = deriveStageId(c, jobEvs)
    if (!INCLUDE[stageId]) continue // filter to included stages

    const loc = p.location || [p.city, p.state].filter(Boolean).join(', ')
    const r = {
      stage: INCLUDE[stageId], _o: STAGE_ORDER.indexOf(String(stageId)),
      person_id: p.id, name: p.name, title: p.current_title || '', company: p.current_company || '',
      location: loc, email: (p.emails || []).map(e => e.value).join('; '),
      phone: (p.phones || []).map(x => x.value).join('; '), linkedin: p.linkedin_url || '',
      has_resume: false,
      applied: (c.applied_at != null) || jobEvs.some(e => /^applied$/i.test((e.activity_type || {}).key || '')),
      contacted: false, contacts: [], snippet: '',
      loxo_url: `https://app.loxo.co/agencies/${AGENCY_ID}/people/${p.id}`,
    }
    // resume
    let list = []
    try { list = JSON.parse(await b(`/agencies/${AGENCY_ID}/people/${p.id}/resumes.json`)) } catch {}
    if (Array.isArray(list) && list.length) {
      r.has_resume = true; let combined = ''
      for (const res of list) {
        let txt = res.extracted_text
        if (txt == null) { try { txt = JSON.parse(await b(`/agencies/${AGENCY_ID}/people/${p.id}/resumes/${res.id}`)).extracted_text || '' } catch { txt = '' } }
        combined += `\n----- ${res.name} -----\n${txt || '(no extracted text)'}\n`
      }
      r.snippet = combined.replace(/-----[^\n]*-----/g, '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim().slice(0, 900)
      const safe = r.name.replace(/[^A-Za-z0-9 .-]/g, '').trim()
      fs.writeFileSync(`${cvdir}/${r.stage} - ${safe}.txt`, `${r.name}\nStage: ${r.stage}\nPhone: ${r.phone || '-'}\nEmail: ${r.email || '-'}\nCurrent: ${r.title} at ${r.company}\nLoxo: ${r.loxo_url}\n${'='.repeat(50)}\n${combined}`)
    }
    // contact activity
    const human = evs.filter(e => { const by = e.created_by_name || '', tn = (e.activity_type || {}).name || ''; return by && !BOT.test(by) && (CONTACT.test(tn) || e.email || e.sms || e.twilio_call) })
    r.contacted = human.length > 0
    r.contacts = human.slice(0, 6).map(e => `${(e.created_at || '').slice(0, 10)} · ${e.created_by_name}: ${(e.activity_type || {}).name}`)
    rows.push(r)
  }
  rows.sort((a, z) => a._o - z._o || a.name.localeCompare(z.name))
  rows.forEach(r => delete r._o)

  // 4. write JSON + CSV
  fs.writeFileSync(`${OUT_DIR}/${SLUG}_pipeline.json`, JSON.stringify(rows, null, 2))
  const cols = ['stage', 'applied', 'name', 'title', 'company', 'location', 'email', 'phone', 'linkedin', 'has_resume', 'contacted', 'person_id', 'loxo_url']
  const csv = [cols.join(',')].concat(rows.map(r => cols.map(c => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))).join('\n')
  fs.writeFileSync(`${OUT_DIR}/${SLUG}_pipeline.csv`, csv)
  cliLog(`wrote ${rows.length} candidates | resumes ${rows.filter(r => r.has_resume).length} | applied ${rows.filter(r => r.applied).length} | contacted ${rows.filter(r => r.contacted).length}`)
}
main()
