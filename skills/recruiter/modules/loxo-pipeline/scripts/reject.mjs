/**
 * reject.mjs — GATED bulk-reject of Loxo candidates on a job.
 *
 * SAFETY: rejecting is a WRITE. This script is deliberately not "one click":
 *   1. It reads a plain-text file of person_ids you have already reviewed.
 *   2. It does a TEST-OF-ONE first and verifies the stage moved to Rejected.
 *   3. Only then does it process the rest, in small batches.
 * The calling agent MUST have shown the user the exact list and gotten an
 * explicit go, and asked what rejection reason/note to log, before running this.
 *
 * Rejecting = creating a "Rejected" activity event (activity_type_id 1937229).
 * It moves the candidate to the Rejected stage and is reversible (not a delete).
 *
 * Reference transport = ego-browser's browserFetch (runs fetch() in the user's
 * logged-in Loxo tab, so the CSRF token + cookies apply). Adapt the postJSON /
 * verify layer to your environment if using a different driver or the Loxo API
 * (person_events_create).
 *
 * Run:  ego-browser nodejs < reject.mjs
 */
import fs from 'node:fs'

// ---- CONFIG (edit) --------------------------------------------------------
const AGENCY_ID = 29866
const JOB_ID = 0
const IDS_FILE = process.env.HOME + '/Downloads/reject_ids.txt' // one person_id per line
const REASON = ''            // optional rejection note the user approved
const REJECTED_ACTIVITY = 1937229
const REJECTED_STAGE = 244493
const BATCH = 40
// ---------------------------------------------------------------------------

const getJSON = p => browserFetch(p, { headers: { Accept: 'application/json' } })

async function reject(pid) {
  // Preferred: Loxo API / MCP person_events_create({activity_type_id, job_id, person_id, notes})
  // Browser transport: POST with the page CSRF token.
  const body = { activity_type_id: REJECTED_ACTIVITY, job_id: JOB_ID, person_id: pid }
  if (REASON) body.notes = REASON
  return js(`(async()=>{const t=(document.querySelector('meta[name=csrf-token]')||{}).content;
    const r=await fetch('/agencies/${AGENCY_ID}/person_events',{method:'POST',
      headers:{'Content-Type':'application/json','X-CSRF-Token':t,'Accept':'application/json'},
      credentials:'same-origin',body:JSON.stringify({person_event:${JSON.stringify(body)}})});
    return r.status;})()`)
}

async function stageOf(pid) {
  const r = JSON.parse(await getJSON(`/agencies/${AGENCY_ID}/jobs/${JOB_ID}/candidates.json?per_page=1&person_id=${pid}`))
  const c = (r.candidates || r)[0]
  return c ? c.workflow_stage_id : null
}

async function main() {
  await useOrCreateTaskSpace('loxo reject ' + JOB_ID)
  await openOrReuseTab(`https://top-tier-talent-group.app.loxo.co/agencies/${AGENCY_ID}/jobs/${JOB_ID}/pipeline`, { wait: true, timeout: 30 })
  const info = await pageInfo()
  if (/login/.test(info.url)) { cliLog('LOGIN_WALL'); return }

  const ids = fs.readFileSync(IDS_FILE, 'utf8').split(/\s+/).map(s => s.trim()).filter(Boolean).map(Number)
  if (!ids.length) { cliLog('no ids'); return }
  cliLog(`will reject ${ids.length} (reason: ${REASON || 'none'})`)

  // TEST OF ONE
  const t = ids[0]
  await reject(t)
  const st = await stageOf(t)
  if (st !== REJECTED_STAGE) { cliLog(`TEST FAILED: person ${t} stage=${st}, expected ${REJECTED_STAGE}. Aborting.`); return }
  cliLog(`test ok: ${t} -> Rejected. Proceeding with ${ids.length - 1} more.`)

  let done = 1, fail = 0
  for (let i = 1; i < ids.length; i++) {
    try { const s = await reject(ids[i]); if (String(s).startsWith('2')) done++; else fail++ }
    catch { fail++ }
    if (i % BATCH === 0) cliLog(`... ${done} done, ${fail} failed`)
  }
  cliLog(`DONE: ${done} rejected, ${fail} failed of ${ids.length}`)
}
main()
