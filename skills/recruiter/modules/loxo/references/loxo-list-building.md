# Loxo: Building a List + Adding Candidates

How to create a People List in Loxo and add candidates to it via browser automation.
Verified end-to-end with Playwright against the live app. Use this whenever Ja says
"put them in a list", "build a list", "add these to <list>", or similar.

(Examples below use placeholders like `<full name>` and `<list name>` — substitute the
real values at run time. Do not hard-code any specific person or client into this file.)

## Before you start: the existence check (do this FIRST)

**The single biggest time-saver.** Candidates pulled from a Gmail/email/spreadsheet table
are often **team-wide submissions made by other recruiters**. Those records live in
*their* systems — **they are frequently NOT in Ja's Loxo**. You can only add to a list a
person who already has a record in the database.

So before committing to "add all N":

1. Search each name (see fuzzy-search note below) and check for an **exact match**.
2. Split the list into **in-Loxo** (can add) vs **not-in-Loxo** (needs sourcing/import).
3. Tell Ja the split up front. Adding only works for the in-Loxo set; the rest is a
   separate **sourcing/import** job (you can't list-add a record that doesn't exist).

Expect a **low hit rate** for team-submission tables — often only a small fraction of the
names exist in Ja's own instance. Report the split rather than silently skipping misses.

## Browser tool / auth

This works through **Playwright MCP** (`mcp__playwright__*`) **only when Ja is logged
into Loxo in that browser context**. Playwright starts logged-out (`/login` redirect);
once Ja signs in, the session carries. Never enter Ja's credentials yourself — if it's
logged out, stop and ask Ja to log in. (In Cowork, `mcp__Claude_in_Chrome__*` is the
preferred equivalent and rides Ja's existing tab.)

## Fuzzy search — never trust the first result

`GET /agencies/{agencyId}/people?query=First%20Last` does a **relevance search**, not exact
match. A common surname can return 50–150 fuzzy matches (everyone sharing a first or last
name), and the person you want may not be among them at all. So:

- Read the result cards and confirm an **exact full-name match** before acting.
- `Total = 0`, or no card whose name equals the target → **not in Loxo**.
- An exact full-name match ranks at/near the top when it exists; if it's not on the first
  page of a relevance-sorted result, scroll once to be sure, then treat as not-found.

Reading cards fast (avoids huge snapshots) — each result card has an "Add to..." button;
the name is the prominent line in that card. Pattern that works (substitute `<full name>`):

```js
() => {
  const want='<full name>'.toLowerCase();   // the exact name you're checking, lowercased
  const addBtns=[...document.querySelectorAll('button')].filter(b=>/Add to\.\.\./.test(b.textContent));
  const bad=/Add to|EXPERIENCE|EDUCATION|Skills|CV|more_horiz|graphic_eq|apartment|school|SHOW MORE|Candidate Ownership|Sent Email|Moved to|Rejected|Fetch Contacts|^by /i;
  const cards=addBtns.map(b=>{let el=b;for(let i=0;i<6;i++){if(el.parentElement)el=el.parentElement;}
    const lines=el.innerText.split('\n').map(s=>s.trim()).filter(Boolean);
    const name=lines.find(l=>/^[A-Za-z][A-Za-z.'-]+(\s+[A-Za-z][A-Za-z.'-]+){1,2}$/.test(l)&&!bad.test(l));
    return {name, title:name?lines[lines.indexOf(name)+1]:null};});
  const idx=cards.findIndex(c=>c.name&&c.name.toLowerCase()===want);
  return {idx, match:idx>=0?cards[idx]:null, names:[...new Set(cards.map(c=>c.name))].slice(0,8)};
}
```
`idx >= 0` → exact match found at that card position; use `addBtns[idx]` to add.

### Fast batch existence sweep (recommended for many names)

When checking a whole table, do a **first round for everyone before adding anyone**:
navigate `?query=<name>` → run the reader → record found / not-found → move on. Don't stop
to add as you go. If not found and there are more results than shown, scroll once and
re-read, then conclude. Present the full in-Loxo vs not-in-Loxo roster, then add the
in-Loxo set in a second pass. Self-scrolling reader:

```js
async () => {
  const want='<full name>'.toLowerCase();
  const read=()=>{const a=[...document.querySelectorAll('button')].filter(b=>/Add to\.\.\./.test(b.textContent));
    const bad=/Add to|EXPERIENCE|EDUCATION|Skills|CV|more_horiz|graphic_eq|apartment|school|SHOW MORE|Candidate Ownership|Sent Email|Moved to|Rejected|Fetch Contacts|^by /i;
    return a.map(b=>{let el=b;for(let i=0;i<6;i++){if(el.parentElement)el=el.parentElement;}
      const L=el.innerText.split('\n').map(s=>s.trim()).filter(Boolean);
      return L.find(l=>/^[A-Za-z][A-Za-z.'-]+(\s+[A-Za-z][A-Za-z.'-]+){1,3}$/.test(l)&&!bad.test(l));});};
  let names=read(); let idx=names.findIndex(n=>n&&n.toLowerCase()===want);
  const m=document.body.innerText.match(/Total\s*(\d+)/); const total=m?+m[1]:0;
  if(idx<0 && total>names.length){window.scrollTo(0,document.body.scrollHeight); await new Promise(r=>setTimeout(r,900)); names=read(); idx=names.findIndex(n=>n&&n.toLowerCase()===want);}
  return {total, found:idx>=0, idx};
}
```

## Create the list (once)

1. Go to `https://app.loxo.co/agencies/{agencyId}/people`.
2. Click **Lists** (header button) → **Create List**.
3. Type the list name → **Save** (enables once a name is typed). A clear naming convention
   like `<Recruiter> - <Role/Ticket> - <Client>` keeps lists findable, but use whatever
   Ja specifies.
4. Verify it exists: `GET /agencies/{agencyId}/person_lists.json` returns
   `{person_lists:[{id, name, created_by_name, ...}]}`. Find yours by name; note the `id`.

## Add a candidate to the list (per person)

For each in-Loxo candidate, from their search result card:

1. Click that card's **"Add to..."** button.
2. In the menu, click **"Add to a list"**.
3. Type the list name into the **`[data-testid="autocomplete_input"]`** field
   (placeholder "Choose or create list").
4. Click the option whose text is **exactly the list name** — NOT the
   "Create a new list: …" option (that would make a duplicate list).
5. Click **Add** (enables only once a list is selected).
6. Success toast: **"The selected people will be added shortly."**

### Reliable click pattern (Playwright)

Refs re-number after every action and snapshots are ~58KB — prefer `browser_evaluate`
clicks by text + `browser_type` for the one React-controlled input. Let `LIST` be the
exact list-name string:

```js
// 1. open add menu on the matched card (IDX from the reader above)
() => {[...document.querySelectorAll('button')].filter(b=>/Add to\.\.\./.test(b.textContent))[IDX].click();}
// 2. choose "Add to a list"
() => {[...document.querySelectorAll('button')].find(b=>/Add to a list/i.test(b.textContent)).click();}
// 3. type the name  -> browser_type target [data-testid="autocomplete_input"] , text = LIST
// 4. pick the EXACT existing option (not "Create a new list: ...")
() => {const o=[...document.querySelectorAll('[role="option"]')].find(o=>o.textContent.trim()===LIST); o&&o.click();}
// 5. click Add (do in a SEPARATE call — button enables async after option click)
() => {const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Add'&&!b.disabled); if(b){b.click();return{added:true};}return{added:false};}
```

Note: the Add button enables a tick after the option is clicked — split steps 4 and 5
into separate calls or it reads as still-disabled.

## Verify (keep it simple)

Do **not** chase member APIs — the list-member endpoints are guarded (all 404):
`person_lists/{id}/people.json`, `people.json?person_list_id=…`, etc. all fail. Only
`person_lists.json` (list metadata) is readable. Instead:

- **Best:** in the People page, open **Lists**, check the list's box to filter, read the
  updated **Total** stat = member count.
- Or open one added person's profile and confirm the list shows on it.

The Lists dropdown renders in a floating portal (`#loxo-floating-base`) and is a toggle —
scripting it is flaky; the ref-based snapshot click or a real screenshot is more reliable
than `evaluate` here.

## Same menu, other targets

The "Add to..." menu also offers **Add to a job** and **Add to a campaign** — identical
flow, pick the other option. Adding to a **job** drops the person into that job's pipeline
at the entry stage. All of these are **writes** — gate per the SKILL.md matrix
(state plan → Ja yes → execute → verify).

## API endpoint notes (read-only, for reference)

- People search is **not** `people.json?query=` (that 404s). The app's people data comes
  via a guarded internal endpoint; use the rendered page for people reads.
- `GET /agencies/{agencyId}/person_lists.json` → lists with `id`, `name`, `created_by_name`,
  `created_at`, `updated_at`. Works. Use it to find a list id or confirm creation.
- Jobs API (`jobs.json`, `jobs/{id}.json`) still works per `loxo-data-fetch.md`.
