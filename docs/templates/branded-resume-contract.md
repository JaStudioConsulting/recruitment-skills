# Branded-resume template contract

Owned by `modules/brandedresume/GUIDE.md`. Use the bundled builder and artifact-QA validator. Required structure: name, one exact title, summary, even core skills, experience, and a single combined "Education & Certifications" section.

- Resume facts come from the resume, explicitly corrective call evidence, and approved recruiter notes. JD changes emphasis, not facts.
- No compensation, contact hyperlinks, placeholders, long dashes, or unsupported achievements. Education has institution and credential, without dates.
- Education and certifications live in one combined section, one list, most relevant first, never split into two groups.
- Emphasis is consistent across the resume: wrap the bullet proof point and the education credential in `**...**` so the builder renders them bold. Bold only the proof point or credential, never a whole line.
- Named and internal MPC resumes retain confirmed name and employers. External-client blind MPC removes name, contact, and real employers, using industry labels while retaining supported titles, dates, and achievements.
- Render and inspect every page for clipping, overlap, orphaning, logo placement, page breaks, and privacy before completion; automated checks do not replace visual inspection.
