"use client";

import { Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  EMPTY_JOB,
  EMPTY_SECTION,
  lines,
  type ResumeFormDocument,
  type ResumeFormJob,
  type ResumeFormSection,
} from "@/lib/resume-form";

type ResumeFormEditorProps = {
  value: ResumeFormDocument;
  onChange: (value: ResumeFormDocument, fieldPath?: string) => void;
  fieldSources?: Record<string, string>;
};

/**
 * Editable version of the canonical A resume. The form document remains the
 * source of truth, while the controls sit in the same hierarchy as the PDF.
 */
export function ResumeFormEditor({ value, onChange, fieldSources }: ResumeFormEditorProps) {
  const set = (patch: Partial<ResumeFormDocument>, fieldPath?: string) => onChange({ ...value, ...patch }, fieldPath);
  const setJob = (index: number, patch: Partial<ResumeFormJob>) =>
    set({ jobs: value.jobs.map((job, i) => (i === index ? { ...job, ...patch } : job)) }, `resume.jobs.${index}.${Object.keys(patch)[0]}`);
  const setSection = (index: number, patch: Partial<ResumeFormSection>) =>
    set({ sections: value.sections.map((section, i) => (i === index ? { ...section, ...patch } : section)) }, `resume.sections.${index}.${Object.keys(patch)[0]}`);
  const skillCount = lines(value.skills).length;

  return (
    <div className="resume-form" aria-label="Editable TTTG resume">
      <p className="resume-form-hint">
        Unpaginated editing canvas. Use one entry per line in list fields. Wrap the one
        proof point or credential in **double asterisks** to bold it. No email, phone, or links.
        Saving marks this exact version as reviewed and ready for PDF preparation; final page
        breaks are verified in the generated PDF.
      </p>

      <div className="resume-paper resume-paper-editable">
        <ResumeLogo />

        <header className="resume-identity">
          <CanvasField label="Name" source={fieldSources?.["resume.name"]} className="resume-name-field">
            <Input value={value.name} placeholder="Candidate name" onChange={(event) => set({ name: event.target.value }, "resume.name")} />
          </CanvasField>
          <CanvasField label="Title (one current title)" source={fieldSources?.["resume.headline"]} className="resume-headline-field">
            <Input value={value.headline} placeholder="One current title" onChange={(event) => set({ headline: event.target.value }, "resume.headline")} />
          </CanvasField>
        </header>

        <ResumeSection title="Summary">
          <CanvasField label="Summary" source={fieldSources?.["resume.summary"]}>
            <Textarea className="resume-summary-field" value={value.summary} onChange={(event) => set({ summary: event.target.value }, "resume.summary")} placeholder="2 to 4 sentences, strongest positioning first." />
          </CanvasField>
        </ResumeSection>

        <ResumeSection title="Core Skills" titleAside={<span className={`resume-form-count${skillCount % 2 ? " odd" : ""}`}>{skillCount} skill{skillCount === 1 ? "" : "s"}{skillCount % 2 ? ", add or merge one for an even count" : ""}</span>}>
          <CanvasField label="Core skills, one per line" source={fieldSources?.["resume.skills"]}>
            <Textarea className="resume-skills-field" value={value.skills} onChange={(event) => set({ skills: event.target.value }, "resume.skills")} placeholder="One supported skill per line" />
          </CanvasField>
        </ResumeSection>

        <ResumeSection title="Professional Experience">
          <fieldset className="resume-form-group resume-experience-group">
            <legend className="sr-only">Professional experience, most recent first</legend>
            {value.jobs.map((job, index) => (
              <div className="resume-form-job" key={index}>
                <div className="resume-job-heading">
                  <CanvasField label="Job title" source={fieldSources?.[`resume.jobs.${index}.title`]} className="resume-job-title-field">
                    <Input value={job.title} placeholder="Job title" onChange={(event) => setJob(index, { title: event.target.value })} />
                  </CanvasField>
                  <CanvasField label="Dates" source={fieldSources?.[`resume.jobs.${index}.dates`]} className="resume-job-dates-field">
                    <Input value={job.dates} placeholder="Mar-2019 - Present" onChange={(event) => setJob(index, { dates: event.target.value })} />
                  </CanvasField>
                </div>
                <div className="resume-job-subheading">
                  <CanvasField label="Company" source={fieldSources?.[`resume.jobs.${index}.company`]} className="resume-company-field">
                    <Input value={job.company} placeholder="Company" onChange={(event) => setJob(index, { company: event.target.value })} />
                  </CanvasField>
                  <CanvasField label="Location" source={fieldSources?.[`resume.jobs.${index}.location`]} className="resume-job-location-field">
                    <Input value={job.location} placeholder="City, ON" onChange={(event) => setJob(index, { location: event.target.value })} />
                  </CanvasField>
                </div>
                <CanvasField label="Bullets, one per line" source={fieldSources?.[`resume.jobs.${index}.bullets`]}>
                  <Textarea className="resume-bullets-field" value={job.bullets} onChange={(event) => setJob(index, { bullets: event.target.value })} placeholder="One source-grounded achievement per line" />
                </CanvasField>
                <Button className="resume-remove-control" size="sm" variant="ghost" onClick={() => set({ jobs: value.jobs.filter((_, i) => i !== index) }, "resume.jobs")}>
                  <Trash2 size={14} />Remove job
                </Button>
              </div>
            ))}
            <Button className="resume-add-control" size="sm" variant="outline" onClick={() => set({ jobs: [...value.jobs, { ...EMPTY_JOB }] }, "resume.jobs")}><Plus size={14} />Add job</Button>
          </fieldset>
        </ResumeSection>

        <section className="resume-section">
          <CanvasField label="Education heading (blank = Education & Certifications)" source={fieldSources?.["resume.educationHeading"]} className="resume-section-title-field">
            <Input value={value.educationHeading} placeholder="Education & Certifications" onChange={(event) => set({ educationHeading: event.target.value }, "resume.educationHeading")} />
          </CanvasField>
          <CanvasField label="Education and certifications, one per line" source={fieldSources?.["resume.education"]}>
            <Textarea className="resume-education-field" value={value.education} placeholder="**Diploma, Mechanical Technology** - Example College" onChange={(event) => set({ education: event.target.value }, "resume.education")} />
          </CanvasField>
        </section>

        <fieldset className="resume-form-group resume-sections-group">
          <legend className="resume-editor-legend">Other sections from the original resume</legend>
          {value.sections.map((section, index) => (
            <section className="resume-section resume-custom-section" key={index}>
              <CanvasField label="Heading" source={fieldSources?.[`resume.sections.${index}.heading`]} className="resume-section-title-field">
                <Input value={section.heading} placeholder="Section heading" onChange={(event) => setSection(index, { heading: event.target.value })} />
              </CanvasField>
              <CanvasField label="Lines, one per line" source={fieldSources?.[`resume.sections.${index}.items`]}>
                <Textarea className="resume-education-field" value={section.items} onChange={(event) => setSection(index, { items: event.target.value })} placeholder="One source line per row" />
              </CanvasField>
              <Button className="resume-remove-control" size="sm" variant="ghost" onClick={() => set({ sections: value.sections.filter((_, i) => i !== index) }, "resume.sections")}>
                <Trash2 size={14} />Remove section
              </Button>
            </section>
          ))}
          <Button className="resume-add-control" size="sm" variant="outline" onClick={() => set({ sections: [...value.sections, { ...EMPTY_SECTION }] }, "resume.sections")}><Plus size={14} />Add section</Button>
        </fieldset>
      </div>
    </div>
  );
}

/** Read-only A layout, shared by the Generated output preview. */
export function ResumeFormPreview({ value }: { value: ResumeFormDocument }) {
  const skills = lines(value.skills);
  const jobs = value.jobs.filter((job) => [job.title, job.company, job.location, job.dates, job.bullets].some((part) => part.trim()));
  const sections = value.sections.filter((section) => section.heading.trim() || section.items.trim());

  return <div className="resume-paper resume-paper-preview" aria-label="Unpaginated TTTG branded resume layout preview">
    <ResumeLogo />
    <header className="resume-identity">
      <h1>{value.name || "Candidate name"}</h1>
      {value.headline ? <p className="resume-headline">{value.headline}</p> : null}
    </header>
    {value.summary ? <ResumeSection title="Summary"><p className="resume-summary-copy">{value.summary}</p></ResumeSection> : null}
    {skills.length ? <ResumeSection title="Core Skills"><div className="resume-skills-grid">{skills.map((skill, index) => <div className="resume-skill" key={`${skill}-${index}`}>{skill}</div>)}</div></ResumeSection> : null}
    {jobs.length ? <ResumeSection title="Professional Experience">{jobs.map((job, index) => <div className="resume-preview-job" key={index}>
      <div className="resume-job-heading"><strong>{job.title}</strong><span>{job.dates}</span></div>
      <div className="resume-job-subheading"><em>{job.company}</em><span>{job.location}</span></div>
      {lines(job.bullets).length ? <ul>{lines(job.bullets).map((bullet, bulletIndex) => <li key={bulletIndex}><RichText value={bullet} /></li>)}</ul> : null}
    </div>)}</ResumeSection> : null}
    {value.education.trim() ? <ResumeSection title={value.educationHeading || "Education & Certifications"}><div className="resume-education-list">{lines(value.education).map((item, index) => <p key={index}><RichText value={item} /></p>)}</div></ResumeSection> : null}
    {sections.map((section, index) => <ResumeSection title={section.heading || "Additional Information"} key={`${section.heading}-${index}`}><div className="resume-education-list">{lines(section.items).map((item, itemIndex) => <p key={itemIndex}><RichText value={item} /></p>)}</div></ResumeSection>)}
  </div>;
}

function ResumeLogo() {
  // eslint-disable-next-line @next/next/no-img-element -- canonical repository brand asset in public/
  return <img className="resume-logo" src="/tttg-logo.png" alt="Top Tier Talent Group" />;
}

function ResumeSection({ title, titleAside, children }: { title: string; titleAside?: ReactNode; children: ReactNode }) {
  return <section className="resume-section">
    <div className="resume-section-heading"><h2>{title}</h2>{titleAside}</div>
    {children}
  </section>;
}

function CanvasField({ label, source, className = "", children }: { label: string; source?: string; className?: string; children: ReactNode }) {
  return <label className={`resume-canvas-field ${className}`.trim()}>
    <span className="sr-only">{label}</span>
    <SourceMarker source={source} />
    {children}
  </label>;
}

function RichText({ value }: { value: string }) {
  const parts = value.split(/(\*\*[^*]+\*\*)/g);
  return <>{parts.map((part, index) => part.startsWith("**") && part.endsWith("**")
    ? <strong key={index}>{part.slice(2, -2)}</strong>
    : <span key={index}>{part}</span>)}</>;
}

function SourceMarker({ source }: { source?: string }) {
  return source ? <small className="autofill-source">from {source}</small> : null;
}
