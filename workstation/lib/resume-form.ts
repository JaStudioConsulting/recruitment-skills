/**
 * The editable TTTG resume form stored as the case's "resume" document, and its
 * conversion to the candidate.json shape the hosted builder expects
 * (skills/recruiter/modules/brandedresume/references/example-candidate.json).
 *
 * List fields are stored as one entry per line so the recruiter edits plain
 * text. Conversion trims every line and drops blank ones; it never invents,
 * reorders, or rewrites content.
 */

export const RESUME_FORM_FORMAT = "tttg-resume-form-v1" as const;

export type ResumeFormJob = {
  title: string;
  company: string;
  location: string;
  dates: string;
  bullets: string;
};

export type ResumeFormSection = { heading: string; items: string };

export type ResumeFormDocument = {
  format: typeof RESUME_FORM_FORMAT;
  /** Set only by an explicit human save in the editable resume canvas. */
  reviewed: boolean;
  name: string;
  headline: string;
  summary: string;
  skills: string;
  jobs: ResumeFormJob[];
  educationHeading: string;
  education: string;
  sections: ResumeFormSection[];
};

export const EMPTY_JOB: ResumeFormJob = { title: "", company: "", location: "", dates: "", bullets: "" };
export const EMPTY_SECTION: ResumeFormSection = { heading: "", items: "" };

export function emptyResumeForm(): ResumeFormDocument {
  return {
    format: RESUME_FORM_FORMAT,
    reviewed: false,
    name: "",
    headline: "",
    summary: "",
    skills: "",
    jobs: [{ ...EMPTY_JOB }],
    educationHeading: "",
    education: "",
    sections: [],
  };
}

export function hasResumeFormFormat(value: unknown): value is { format: typeof RESUME_FORM_FORMAT } & Record<string, unknown> {
  return typeof value === "object" && value !== null && (value as { format?: unknown }).format === RESUME_FORM_FORMAT;
}

function hasStringFields(value: unknown, fields: string[]): boolean {
  if (typeof value !== "object" || value === null) return false;
  return fields.every((field) => typeof (value as Record<string, unknown>)[field] === "string");
}

export function isResumeForm(value: unknown): value is ResumeFormDocument {
  if (!hasResumeFormFormat(value) || typeof value.reviewed !== "boolean") return false;
  if (!hasStringFields(value, ["name", "headline", "summary", "skills", "educationHeading", "education"])) {
    return false;
  }
  return (
    Array.isArray(value.jobs) &&
    value.jobs.every((job) => hasStringFields(job, ["title", "company", "location", "dates", "bullets"])) &&
    Array.isArray(value.sections) &&
    value.sections.every((section) => hasStringFields(section, ["heading", "items"]))
  );
}

/** Hydrate a stored resume document. Anything that is not a saved form (an
 * empty or legacy editor document) opens as a blank form; nothing is lost
 * because the legacy document is only replaced once the recruiter edits. */
export function toResumeForm(value: unknown): ResumeFormDocument {
  if (!hasResumeFormFormat(value)) return emptyResumeForm();
  const text = (field: unknown) => (typeof field === "string" ? field : "");
  const jobs = Array.isArray(value.jobs) ? value.jobs : [];
  const sections = Array.isArray(value.sections) ? value.sections : [];
  return {
    format: RESUME_FORM_FORMAT,
    reviewed: value.reviewed === true,
    name: text(value.name),
    headline: text(value.headline),
    summary: text(value.summary),
    skills: text(value.skills),
    jobs: jobs.map((job) => ({
      title: text(job?.title), company: text(job?.company), location: text(job?.location),
      dates: text(job?.dates), bullets: text(job?.bullets),
    })),
    educationHeading: text(value.educationHeading),
    education: text(value.education),
    sections: sections.map((section) => ({ heading: text(section?.heading), items: text(section?.items) })),
  };
}

export function lines(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function jobHasContent(job: ResumeFormJob) {
  return [job.title, job.company, job.location, job.dates, job.bullets].some((field) => field.trim() !== "");
}

export function resumeFormHasContent(form: ResumeFormDocument): boolean {
  return (
    [form.summary, form.skills, form.education].some((field) => field.trim() !== "") ||
    form.jobs.some(jobHasContent) ||
    form.sections.some((section) => section.heading.trim() !== "" || section.items.trim() !== "")
  );
}

/** candidate.json for the hosted builder. Blank jobs and sections are left
 * out; everything the recruiter typed is sent, so the builder (not this
 * conversion) decides what to refuse, and names the field when it does. */
export function resumeFormToCandidate(form: ResumeFormDocument): Record<string, unknown> {
  const candidate: Record<string, unknown> = {
    name: form.name.trim(),
    headline: form.headline.trim(),
    summary: form.summary.trim(),
    skills: lines(form.skills),
    experience: form.jobs.filter(jobHasContent).map((job) => ({
      title: job.title.trim(),
      company: job.company.trim(),
      location: job.location.trim(),
      dates: job.dates.trim(),
      bullets: lines(job.bullets),
    })),
    education: lines(form.education),
    sections: form.sections
      .map((section) => ({ heading: section.heading.trim(), items: lines(section.items) }))
      .filter((section) => section.heading || section.items.length),
  };
  if (form.educationHeading.trim()) candidate.education_heading = form.educationHeading.trim();
  return candidate;
}
