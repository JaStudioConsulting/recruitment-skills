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
}: {
  value: ResumeFormDocument;
  onChange: (value: ResumeFormDocument) => void;
}) {
  const set = (patch: Partial<ResumeFormDocument>) => onChange({ ...value, ...patch });
  const setJob = (index: number, patch: Partial<ResumeFormJob>) =>
    set({ jobs: value.jobs.map((job, i) => (i === index ? { ...job, ...patch } : job)) });
  const setSection = (index: number, patch: Partial<ResumeFormSection>) =>
    set({ sections: value.sections.map((section, i) => (i === index ? { ...section, ...patch } : section)) });
  const skillCount = lines(value.skills).length;

  return (
    <div className="resume-form" aria-label="Editable TTTG resume">
      <p className="resume-form-hint">
        This is what the branded PDF prints. One entry per line in list fields. Wrap the one proof
        point in a bullet or credential in **double asterisks** to bold it. No email, phone, or links.
      </p>

      <div className="resume-form-row">
        <label>Name<Input value={value.name} onChange={(event) => set({ name: event.target.value })} /></label>
        <label>Title (one current title)<Input value={value.headline} onChange={(event) => set({ headline: event.target.value })} /></label>
      </div>

      <label>Summary<Textarea value={value.summary} onChange={(event) => set({ summary: event.target.value })} placeholder="2 to 4 sentences, strongest positioning first." /></label>

      <label>
        Core skills, one per line
        <span className={`resume-form-count${skillCount % 2 ? " odd" : ""}`}>{skillCount} skill{skillCount === 1 ? "" : "s"}{skillCount % 2 ? ", add or merge one for an even count" : ""}</span>
        <Textarea value={value.skills} onChange={(event) => set({ skills: event.target.value })} />
      </label>

      <fieldset className="resume-form-group">
        <legend>Professional experience, most recent first</legend>
        {value.jobs.map((job, index) => (
          <div className="resume-form-job" key={index}>
            <div className="resume-form-row">
              <label>Job title<Input value={job.title} onChange={(event) => setJob(index, { title: event.target.value })} /></label>
              <label>Dates<Input value={job.dates} placeholder="Mar-2019 - Present" onChange={(event) => setJob(index, { dates: event.target.value })} /></label>
            </div>
            <div className="resume-form-row">
              <label>Company<Input value={job.company} onChange={(event) => setJob(index, { company: event.target.value })} /></label>
              <label>Location<Input value={job.location} placeholder="City, ON" onChange={(event) => setJob(index, { location: event.target.value })} /></label>
            </div>
            <label>Bullets, one per line<Textarea value={job.bullets} onChange={(event) => setJob(index, { bullets: event.target.value })} /></label>
            <Button size="sm" variant="outline" onClick={() => set({ jobs: value.jobs.filter((_, i) => i !== index) })}>
              <Trash2 size={14} />Remove job
            </Button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => set({ jobs: [...value.jobs, { ...EMPTY_JOB }] })}><Plus size={14} />Add job</Button>
      </fieldset>

      <label>Education heading (blank = Education &amp; Certifications)<Input value={value.educationHeading} onChange={(event) => set({ educationHeading: event.target.value })} /></label>
      <label>Education and certifications, one per line<Textarea value={value.education} placeholder="**Diploma, Mechanical Technology** - Example College" onChange={(event) => set({ education: event.target.value })} /></label>

      <fieldset className="resume-form-group">
        <legend>Other sections from the original resume</legend>
        {value.sections.map((section, index) => (
          <div className="resume-form-job" key={index}>
            <label>Heading<Input value={section.heading} placeholder="Licenses" onChange={(event) => setSection(index, { heading: event.target.value })} /></label>
            <label>Lines, one per line<Textarea value={section.items} onChange={(event) => setSection(index, { items: event.target.value })} /></label>
            <Button size="sm" variant="outline" onClick={() => set({ sections: value.sections.filter((_, i) => i !== index) })}>
              <Trash2 size={14} />Remove section
            </Button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => set({ sections: [...value.sections, { ...EMPTY_SECTION }] })}><Plus size={14} />Add section</Button>
      </fieldset>
    </div>
  );
}
