"use client";

import { Plus, Trash2 } from "lucide-react";
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

// Editable TTTG resume. Every field the branded PDF prints is here and
// editable. List fields take one entry per line.
export function ResumeFormEditor({
  value,
  onChange,
  fieldSources,
}: {
  value: ResumeFormDocument;
  onChange: (value: ResumeFormDocument, fieldPath?: string) => void;
  fieldSources?: Record<string, string>;
}) {
  const set = (patch: Partial<ResumeFormDocument>, fieldPath?: string) => onChange({ ...value, ...patch }, fieldPath);
  const setJob = (index: number, patch: Partial<ResumeFormJob>) =>
    set({ jobs: value.jobs.map((job, i) => (i === index ? { ...job, ...patch } : job)) }, `resume.jobs.${index}.${Object.keys(patch)[0]}`);
  const setSection = (index: number, patch: Partial<ResumeFormSection>) =>
    set({ sections: value.sections.map((section, i) => (i === index ? { ...section, ...patch } : section)) }, `resume.sections.${index}.${Object.keys(patch)[0]}`);
  const skillCount = lines(value.skills).length;

  return (
    <div className="resume-form" aria-label="Editable TTTG resume">
      <p className="resume-form-hint">
        This is what the branded PDF prints. One entry per line in list fields. Wrap the one proof
        point in a bullet or credential in **double asterisks** to bold it. No email, phone, or links.
      </p>

      <div className="resume-form-row">
        <label>Name<SourceMarker source={fieldSources?.["resume.name"]} /><Input value={value.name} onChange={(event) => set({ name: event.target.value }, "resume.name")} /></label>
        <label>Title (one current title)<SourceMarker source={fieldSources?.["resume.headline"]} /><Input value={value.headline} onChange={(event) => set({ headline: event.target.value }, "resume.headline")} /></label>
      </div>

      <label>Summary<SourceMarker source={fieldSources?.["resume.summary"]} /><Textarea value={value.summary} onChange={(event) => set({ summary: event.target.value }, "resume.summary")} placeholder="2 to 4 sentences, strongest positioning first." /></label>

      <label>
        Core skills, one per line
        <SourceMarker source={fieldSources?.["resume.skills"]} />
        <span className={`resume-form-count${skillCount % 2 ? " odd" : ""}`}>{skillCount} skill{skillCount === 1 ? "" : "s"}{skillCount % 2 ? ", add or merge one for an even count" : ""}</span>
        <Textarea value={value.skills} onChange={(event) => set({ skills: event.target.value }, "resume.skills")} />
      </label>

      <fieldset className="resume-form-group">
        <legend>Professional experience, most recent first</legend>
        {value.jobs.map((job, index) => (
          <div className="resume-form-job" key={index}>
            <div className="resume-form-row">
              <label>Job title<SourceMarker source={fieldSources?.[`resume.jobs.${index}.title`]} /><Input value={job.title} onChange={(event) => setJob(index, { title: event.target.value })} /></label>
              <label>Dates<SourceMarker source={fieldSources?.[`resume.jobs.${index}.dates`]} /><Input value={job.dates} placeholder="Mar-2019 - Present" onChange={(event) => setJob(index, { dates: event.target.value })} /></label>
            </div>
            <div className="resume-form-row">
              <label>Company<SourceMarker source={fieldSources?.[`resume.jobs.${index}.company`]} /><Input value={job.company} onChange={(event) => setJob(index, { company: event.target.value })} /></label>
              <label>Location<SourceMarker source={fieldSources?.[`resume.jobs.${index}.location`]} /><Input value={job.location} placeholder="City, ON" onChange={(event) => setJob(index, { location: event.target.value })} /></label>
            </div>
            <label>Bullets, one per line<SourceMarker source={fieldSources?.[`resume.jobs.${index}.bullets`]} /><Textarea value={job.bullets} onChange={(event) => setJob(index, { bullets: event.target.value })} /></label>
            <Button size="sm" variant="outline" onClick={() => set({ jobs: value.jobs.filter((_, i) => i !== index) }, "resume.jobs")}>
              <Trash2 size={14} />Remove job
            </Button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => set({ jobs: [...value.jobs, { ...EMPTY_JOB }] }, "resume.jobs")}><Plus size={14} />Add job</Button>
      </fieldset>

      <label>Education heading (blank = Education &amp; Certifications)<SourceMarker source={fieldSources?.["resume.educationHeading"]} /><Input value={value.educationHeading} onChange={(event) => set({ educationHeading: event.target.value }, "resume.educationHeading")} /></label>
      <label>Education and certifications, one per line<SourceMarker source={fieldSources?.["resume.education"]} /><Textarea value={value.education} placeholder="**Diploma, Mechanical Technology** - Example College" onChange={(event) => set({ education: event.target.value }, "resume.education")} /></label>

      <fieldset className="resume-form-group">
        <legend>Other sections from the original resume</legend>
        {value.sections.map((section, index) => (
          <div className="resume-form-job" key={index}>
            <label>Heading<SourceMarker source={fieldSources?.[`resume.sections.${index}.heading`]} /><Input value={section.heading} placeholder="Licenses" onChange={(event) => setSection(index, { heading: event.target.value })} /></label>
            <label>Lines, one per line<SourceMarker source={fieldSources?.[`resume.sections.${index}.items`]} /><Textarea value={section.items} onChange={(event) => setSection(index, { items: event.target.value })} /></label>
            <Button size="sm" variant="outline" onClick={() => set({ sections: value.sections.filter((_, i) => i !== index) }, "resume.sections")}>
              <Trash2 size={14} />Remove section
            </Button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => set({ sections: [...value.sections, { ...EMPTY_SECTION }] }, "resume.sections")}><Plus size={14} />Add section</Button>
      </fieldset>
    </div>
  );
}

function SourceMarker({ source }: { source?: string }) {
  return source ? <small className="autofill-source">from {source}</small> : null;
}
