# TTTG Document Structure and Rules, canonical branded resume

This reference records the single production design implemented by `skills/recruiter/modules/brandedresume/scripts/build_resume.py`.

The former A4, Noto Sans, left-logo alternative is retired. Do not expose it as a selectable design and do not use it for production output.

## 1. Canvas and paper

- Paper: US Letter.
- Margins: `1.6cm` top and bottom, `1.7cm` left and right.
- Background: pure white.
- Base font: Arial, with Helvetica as the compatible fallback.
- Base text: black, `10.5pt`, with approximately `1.34` line height.

## 2. Identity header

- Logo: centered at the top, `235px` wide in the Chrome renderer, with `10px` below it.
- Name: bold, left aligned, `17pt` by default.
- Title: one exact current title, bold, left aligned, `11.5pt`.
- Named submission: show the confirmed candidate name and real employer names.
- Internal MPC: show the confirmed candidate name and real employer names.
- External blind MPC: show the candidate title in the name position, omit the candidate name, and replace employer names with confirmed industry descriptions.
- Do not print email, phone number, LinkedIn URL, website, or other contact details.

## 3. Section headings

Every section heading uses:

- `11pt` bold text.
- Uppercase text.
- `0.4px` letter spacing.
- A `1.2px` solid black bottom rule.
- Compact spacing matching the bundled builder.

## 4. Professional summary

- Use `10.5pt` black text.
- Use justified alignment.
- Keep the summary concise and source grounded.

## 5. Core skills

- Use an even number of source-supported skills.
- Use a borderless two-column grid.
- Use a standard bullet for each item.
- Never add a filler skill to balance the grid.

## 6. Professional experience

- Order experience most recent first.
- Line 1 shows the bold job title on the left and dates on the right.
- Line 2 shows the italic company on the left and location on the right.
- Keep same-company roles in one timeline entry.
- Use justified achievement bullets.
- Bold only the supported proof point inside a bullet.
- Keep headings with at least the first bullet across page breaks.

## 7. Education, certifications, and additional sections

- Education contains the credential and institution without dates.
- Bold the credential only.
- Use a regular hyphen between the credential and institution.
- Preserve separate Certifications, Licenses, Awards, Languages, Projects, and other source sections when the original resume separates them.
- Never merge or drop source sections without explicit user direction.

## 8. Functional and release rules

- Use the bundled branded resume builder for PDF output.
- Refuse unresolved placeholders, long dashes, double hyphens, hyperlinks, contact details, and an odd number of skills.
- Persist the exact produced PDF before the temporary hosted link expires.
- Treat the PDF as incomplete until every page has recorded human visual QA for clipping, overlap, orphaning, bullets, logo placement, privacy, and page breaks.
- A second visual design is not part of the production interface.
