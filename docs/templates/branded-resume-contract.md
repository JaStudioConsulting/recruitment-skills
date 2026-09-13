# Branded-resume template contract

Owned by `modules/brandedresume/GUIDE.md`. Use the bundled builder and artifact-QA validator. Required structure: name, one exact title, summary, even core skills, experience, and a single combined "Education & Certifications" section.

- Resume facts come from the resume, explicitly corrective call evidence, and approved recruiter notes. JD changes emphasis, not facts.
- No compensation, contact hyperlinks, placeholders, long dashes, or unsupported achievements. Education has institution and credential, without dates.
- Preserve every section and line the source resume has. Never merge sections or drop content unless the user says to. Any section beyond the core four (separate Certifications, Licenses, Additional Information, Awards, Languages, and so on) goes in `sections[]` with its original heading, rendered in order after Education.
- Education and certifications default to one combined "Education & Certifications" section, most relevant first. If the source keeps certifications separate, preserve that with `education_heading` plus a separate section rather than forcing a merge or a split.
- Emphasis is consistent across the resume: wrap the bullet proof point and the education credential in `**...**` so the builder renders them bold. Bold only the proof point or credential, never a whole line.
- Named and internal MPC resumes retain confirmed name and employers. External-client blind MPC removes name, contact, and real employers, using industry labels while retaining supported titles, dates, and achievements.
- Render and inspect every page for clipping, overlap, orphaning, logo placement, page breaks, and privacy before completion; automated checks do not replace visual inspection.
