# Branded Resume

Drop in a candidate's raw resume, interview notes, or LinkedIn export and get back a
finished, branded PDF resume, ready to download and send.

## How to use it

Say **"brand this"** with the candidate's material. `$recruiter` routes internally to this module.

You get back one file: `<Candidate Name> - Top Tier Talent Group.pdf`.

## What it does for you

- Centered company logo, clean Arial, black text, print-ready.
- One title under the name, a tight summary, an even two-column skills list.
- Experience with dates and locations lined up on the right, achievement bullets.
- Education and certifications.
- Removes personal contact info for client submission.
- Never invents facts: missing essential facts stop the build before any PDF is produced.
- No em dashes, no long dashes, no hyperlinks. Ever.

## Works anywhere

It builds the PDF with Chrome if your computer has it, otherwise with a built-in
maker that needs no browser, so it runs the same on a laptop or in Claude Cowork.
Dependencies come from the repository/workspace runtime. The builder never installs packages itself.

## Rebranding it for a different company

Replace `assets/tttg_logo.png` with another company's banner logo, using the same
filename. Nothing else needs to change.

## What's inside

- `GUIDE.md` — internal instructions routed by `$recruiter`.
- `scripts/build_resume.py` — the PDF builder.
- `assets/tttg_logo.png` — the logo placed on every resume.
- `assets/example_candidate.json` — shows the exact information the builder expects.
