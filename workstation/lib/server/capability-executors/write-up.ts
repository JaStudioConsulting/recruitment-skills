import { createAutofilledDraft, parseJdText, resumeFormFromCase } from "../../capabilities/deterministic-autofill";
import { featureById, type FeatureDefinition } from "../../capabilities/catalog";
import { sourceIsUsable } from "../../source-intake";
import type { ResumeFormDocument } from "../../resume-form";
import type {
  CandidateCase,
  CandidateRecord,
  CaseSource,
  RoleRecord,
  SubmissionDocument,
} from "../../workstation-types";

export type WriteUpCanonicalIncomplete = {
  brandedPdfBuilt: false;
  visualQaPassed: false;
  gmailDraftCreated: false;
  gmailAttachmentVerified: false;
  gmailDraftReadbackVerified: false;
  emailSent: false;
  loxoWritten: false;
  loxoReadbackVerified: false;
  canonicalPackageCompleted: false;
};

export type WriteUpDraftBundle = {
  resume: ResumeFormDocument;
  submission: SubmissionDocument;
  emailSubject: string;
  presentationEmailText: string;
  loxoNoteText: string;
  unknowns: string[];
  sourceRefs: string[];
};

export type WriteUpDraftReady = {
  status: "draft_ready";
  capabilityId: "write-up";
  executorId: "write-up-candidate";
  outputKind: "submission";
  bundle: WriteUpDraftBundle;
  canonicalIncomplete: WriteUpCanonicalIncomplete;
};

export type ExecuteWriteUpInput = {
  mergedCase: CandidateCase;
  role: RoleRecord;
  candidate: CandidateRecord;
  sourceRefs: readonly string[];
  now?: string;
};

const CANONICAL_INCOMPLETE: WriteUpCanonicalIncomplete = {
  brandedPdfBuilt: false,
  visualQaPassed: false,
  gmailDraftCreated: false,
  gmailAttachmentVerified: false,
  gmailDraftReadbackVerified: false,
  emailSent: false,
  loxoWritten: false,
  loxoReadbackVerified: false,
  canonicalPackageCompleted: false,
};

function requireFeature(id: string): FeatureDefinition {
  const feature = featureById(id);
  if (!feature) throw new Error(`Required capability executor is missing: ${id}.`);
  return feature;
}

function usableSource(candidateCase: CandidateCase, kind: CaseSource["kind"]): CaseSource | undefined {
  return candidateCase.sources.find((source) => source.kind === kind && sourceIsUsable(source));
}

function firstCallSource(candidateCase: CandidateCase): CaseSource | undefined {
  return candidateCase.sources.find(
    (source) => (source.kind === "transcript" || source.kind === "call_notes") && sourceIsUsable(source),
  );
}

function text(value: string | undefined): string {
  return value?.trim() ?? "";
}

function buildEmailSubject(input: {
  targetRole: string;
  candidateName: string;
  client: string;
  candidateLocation: string;
}): string {
  const parts = [input.targetRole, input.candidateName, input.client, input.candidateLocation].map(text);
  if (parts.some((part) => !part)) return "";
  return `New Candidate Submission - ${parts.join(" - ")}`;
}

const SUBMISSION_LABELS: ReadonlyArray<[keyof SubmissionDocument, string]> = [
  ["name", "Name"],
  ["title", "Title"],
  ["location", "Location"],
  ["compensationTarget", "Compensation Target"],
  ["currentCompensation", "Current Compensation"],
  ["vacation", "Vacation"],
  ["workStatus", "Work Status"],
  ["interviewAvailability", "Interview Availability"],
  ["startDateNotice", "Start Date"],
  ["reasonForLeaving", "Reason for Leaving"],
];

function buildPresentationEmailText(input: {
  submission: SubmissionDocument;
  targetRole: string;
  client: string;
  currentCompany: string;
}): string {
  const { submission } = input;
  const candidateName = text(submission.name);
  const targetRole = text(input.targetRole);
  const client = text(input.client);
  const currentCompany = text(input.currentCompany);
  let opening = "";

  if (candidateName && targetRole && client) {
    const employer = currentCompany ? `, currently with ${currentCompany},` : "";
    opening = `I would like to present ${candidateName}${employer} for the ${targetRole} role with ${client}.`;
  } else if (candidateName && currentCompany) {
    opening = `${candidateName} is currently with ${currentCompany}.`;
  } else if (candidateName) {
    opening = `I would like to present ${candidateName}.`;
  }

  const sections: string[] = ["Hi team,"];
  if (opening) sections.push(opening);

  const labels = SUBMISSION_LABELS.flatMap(([key, label]) => {
    const value = text(submission[key]);
    return value ? [`${label}: ${value}`] : [];
  });
  if (labels.length) sections.push(labels.join("\n"));

  const profileSummary = text(submission.profileSummary);
  if (profileSummary) sections.push(`Profile Summary: ${profileSummary}`);
  sections.push("CV attached.");
  return sections.join("\n\n");
}

function buildLoxoNoteText(submission: SubmissionDocument): string {
  const lines: Array<[string, string]> = [
    ["Salary expectation", submission.compensationTarget],
    ["Current compensation", submission.currentCompensation],
    ["Vacation", submission.vacation],
    ["Location", submission.location],
    ["Work status", submission.workStatus],
    ["Interview availability", submission.interviewAvailability],
    ["Start date/notice period", submission.startDateNotice],
    ["Reason for leaving", submission.reasonForLeaving],
  ];
  return lines.flatMap(([label, value]) => text(value) ? [`- ${label}: ${text(value)}`] : []).join("\n");
}

function collectUnknowns(input: {
  candidateCase: CandidateCase;
  resume: ResumeFormDocument;
  submission: SubmissionDocument;
  targetRole: string;
  client: string;
}): string[] {
  const unknowns: string[] = [];
  const seen = new Set<string>();
  const add = (label: string, unknown: boolean) => {
    if (unknown && !seen.has(label)) {
      seen.add(label);
      unknowns.push(label);
    }
  };

  add("Reviewed resume", !usableSource(input.candidateCase, "resume"));
  add(
    "Reviewed call notes or transcript",
    !firstCallSource(input.candidateCase) && !input.candidateCase.notes.trim(),
  );
  add("Reviewed job description", !usableSource(input.candidateCase, "job_description"));

  add("Candidate name", !text(input.resume.name));
  add("Current title", !text(input.resume.headline));
  add("Resume Professional Summary", !text(input.resume.summary));
  add("Core Competencies & Skills", !text(input.resume.skills));
  add(
    "Professional Experience",
    !input.resume.jobs.some((job) => [job.title, job.company, job.location, job.dates, job.bullets].some(text)),
  );
  add("Education", !text(input.resume.education));
  add("Target role", !text(input.targetRole));
  add("Client", !text(input.client));

  for (const [key, label] of SUBMISSION_LABELS) add(label, !text(input.submission[key]));
  add("Profile Summary", !text(input.submission.profileSummary));
  return unknowns;
}

/**
 * Builds editable, source-grounded write-up material only. This function has no
 * persistence or connector boundary and cannot create a PDF, Gmail draft,
 * attachment, send, Loxo mutation, or readback evidence.
 */
export function executeWriteUp(input: ExecuteWriteUpInput): WriteUpDraftReady {
  const timestamp = input.now ?? input.mergedCase.updatedAt;
  const writeUpFeature = requireFeature("write-up-candidate");
  const writeUpDraft = createAutofilledDraft(writeUpFeature, input.mergedCase, timestamp);
  const parsedResume = resumeFormFromCase(input.mergedCase).form;
  const candidateNameFromContext = !text(parsedResume.name) && Boolean(text(input.candidate.name));
  const candidateTitleFromContext = !text(parsedResume.headline) && Boolean(text(input.candidate.currentTitle ?? ""));
  const resume = {
    ...parsedResume,
    name: text(parsedResume.name) || text(input.candidate.name),
    headline: text(parsedResume.headline) || text(input.candidate.currentTitle ?? ""),
  };
  if (!writeUpDraft.submission) {
    throw new Error("The canonical write-up executor registry returned an incompatible result kind.");
  }

  const jdSource = usableSource(input.mergedCase, "job_description");
  const jd = jdSource
    ? parseJdText(jdSource.parsedText ?? "", jdSource.filename)
    : { title: "", client: "", location: "", source: "" };
  const submission = {
    ...writeUpDraft.submission,
    name: text(writeUpDraft.submission.name) || resume.name,
    title: text(writeUpDraft.submission.title) || resume.headline,
  };
  const roleTitleFromContext = !text(jd.title) && Boolean(text(input.role.title));
  const roleClientFromContext = !text(jd.client) && Boolean(text(input.role.client ?? ""));
  const targetRole = text(jd.title) || text(input.role.title);
  const client = text(jd.client) || text(input.role.client ?? "");
  const outputSourceRefs = new Set(input.sourceRefs);
  if (candidateNameFromContext || candidateTitleFromContext) {
    outputSourceRefs.add(`candidate-record:${input.candidate.id}`);
  }
  if (roleTitleFromContext || roleClientFromContext) {
    outputSourceRefs.add(`role-record:${input.role.id}`);
  }
  const currentCompany = resume.jobs.find((job) => text(job.company))?.company ?? "";
  const unknowns = collectUnknowns({
    candidateCase: input.mergedCase,
    resume,
    submission,
    targetRole,
    client,
  });

  return {
    status: "draft_ready",
    capabilityId: "write-up",
    executorId: "write-up-candidate",
    outputKind: "submission",
    bundle: {
      resume,
      submission,
      emailSubject: buildEmailSubject({
        targetRole,
        candidateName: submission.name,
        client,
        candidateLocation: submission.location,
      }),
      presentationEmailText: buildPresentationEmailText({
        submission,
        targetRole,
        client,
        currentCompany,
      }),
      loxoNoteText: buildLoxoNoteText(submission),
      unknowns,
      sourceRefs: [...outputSourceRefs].sort((left, right) => left.localeCompare(right)),
    },
    canonicalIncomplete: { ...CANONICAL_INCOMPLETE },
  };
}
