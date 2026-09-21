export type ManualProblem = { path: string; message: string };

export const REFERENCE_ANSWER_FIELDS = [
  ["answers.known_duration", "How long have you known the candidate?"],
  ["answers.working_capacity", "In what capacity did you work with the candidate?"],
  ["answers.overall_performance", "How would you describe the candidate's overall performance?"],
  ["answers.responsibilities", "What were the candidate's main responsibilities?"],
  ["answers.area_for_improvement", "What area could the candidate improve?"],
  ["answers.performance_rating", "How would you rate the candidate's performance?"],
  ["answers.communication", "How would you describe the candidate's communication?"],
  ["answers.interactions", "How did the candidate interact with colleagues and leaders?"],
  ["answers.teamwork", "How did the candidate contribute to teamwork?"],
  ["answers.adaptability", "How did the candidate respond to change?"],
  ["answers.problem_solving", "How would you describe the candidate's problem-solving ability?"],
  ["answers.dependability", "How dependable was the candidate?"],
  ["answers.leadership_potential", "How would you describe the candidate's leadership potential?"],
  ["answers.recommendation", "Would you recommend the candidate?"],
  ["answers.rehire", "Would you rehire the candidate?"],
  ["answers.additional_comments", "Is there anything else you would like to add?"],
] as const;

export const INTERVIEW_TEXT_FIELDS = [
  ["brief.document.company", "Company"], ["brief.document.role", "Role"], ["brief.document.location", "Location"],
  ["brief.document.title", "PDF title"], ["brief.document.subject", "PDF subject"], ["brief.document.author", "Author"],
  ["brief.document.footer", "Footer"], ["brief.source_control.as_of", "Facts reviewed date (YYYY-MM-DD)"],
  ["brief.source_control.role_status_evidence", "Role status evidence"],
  ["brief.cover.eyebrow", "Cover eyebrow"], ["brief.cover.headline", "Cover headline"], ["brief.cover.deck", "Cover introduction"],
  ["brief.cover.image", "Cover image path"], ["brief.cover.image_caption", "Cover image caption"],
  ["brief.cover.sections.0.title", "Cover section 1 title"], ["brief.cover.sections.0.body", "Cover section 1 body"],
  ["brief.cover.sections.1.title", "Cover section 2 title"], ["brief.cover.sections.1.body", "Cover section 2 body"],
  ["brief.role.eyebrow", "Role page eyebrow"], ["brief.role.headline", "Role page headline"], ["brief.role.intro", "Role page introduction"],
  ["brief.role.image", "Role page image path"], ["brief.role.image_caption", "Role page image caption"],
  ["brief.role.at_a_glance.0.label", "At a glance 1 label"], ["brief.role.at_a_glance.0.value", "At a glance 1 value"],
  ["brief.role.at_a_glance.1.label", "At a glance 2 label"], ["brief.role.at_a_glance.1.value", "At a glance 2 value"],
  ["brief.role.at_a_glance.2.label", "At a glance 3 label"], ["brief.role.at_a_glance.2.value", "At a glance 3 value"],
  ["brief.role.cards.0.title", "Role card 1 title"], ["brief.role.cards.0.body", "Role card 1 body"],
  ["brief.role.cards.1.title", "Role card 2 title"], ["brief.role.cards.1.body", "Role card 2 body"],
  ["brief.role.cards.2.title", "Role card 3 title"], ["brief.role.cards.2.body", "Role card 3 body"],
  ["brief.role.cards.3.title", "Role card 4 title"], ["brief.role.cards.3.body", "Role card 4 body"],
  ["brief.role.note", "Role page note"],
  ["brief.context.eyebrow", "Context page eyebrow"], ["brief.context.headline", "Context page headline"],
  ["brief.context.intro", "Context page introduction"], ["brief.context.image", "Context image path"],
  ["brief.context.image_caption", "Context image caption"], ["brief.context.columns.0.title", "Context column 1 title"],
  ["brief.context.columns.0.body", "Context column 1 body"], ["brief.context.columns.1.title", "Context column 2 title"],
  ["brief.context.columns.1.body", "Context column 2 body"], ["brief.context.note_title", "Context note title"],
  ["brief.context.note_body", "Context note body"],
  ["brief.decision.eyebrow", "Decision page eyebrow"], ["brief.decision.headline", "Decision page headline"],
  ["brief.decision.intro", "Decision page introduction"], ["brief.decision.images.0.path", "Decision image 1 path"],
  ["brief.decision.images.0.caption", "Decision image 1 caption"], ["brief.decision.images.1.path", "Decision image 2 path"],
  ["brief.decision.images.1.caption", "Decision image 2 caption"], ["brief.decision.sections.0.title", "Decision section 1 title"],
  ["brief.decision.sections.0.body", "Decision section 1 body"], ["brief.decision.sections.1.title", "Decision section 2 title"],
  ["brief.decision.sections.1.body", "Decision section 2 body"], ["brief.decision.cta_title", "Call to action title"],
  ["brief.decision.cta_body", "Call to action body"], ["source_ledger", "Source ledger"], ["asset_ledger", "Asset ledger"],
] as const;

export function emptyReferencePayload(): Record<string, unknown> {
  return {
    candidate: { full_name: "", position_applied_for: "", company_name: "" },
    reference: { full_name: "", job_title: "", company_name: "", professional_relationship: "" },
    answers: Object.fromEntries([...REFERENCE_ANSWER_FIELDS.map(([path]) => [path.split(".")[1], ""]), ["strengths", []]]),
    completed_by: "",
    date: "",
  };
}

const pairs = (count: number, first: string, second: string) => Array.from({ length: count }, () => ({ [first]: "", [second]: "" }));

export function emptyInterviewPayload(): Record<string, unknown> {
  return {
    brief: {
      document: { company: "", role: "", location: "", title: "", subject: "", author: "", footer: "" },
      source_control: { as_of: "", publication_status: "", role_status_evidence: "", authoritative_sources: ["", ""] },
      privacy: { banned_terms: [] },
      cover: { eyebrow: "", headline: "", deck: "", image: "", image_caption: "", sections: pairs(2, "title", "body") },
      role: { eyebrow: "", headline: "", intro: "", image: "", image_caption: "", at_a_glance: pairs(3, "label", "value"), cards: pairs(4, "title", "body"), note: "" },
      context: { eyebrow: "", headline: "", intro: "", image: "", image_caption: "", columns: pairs(2, "title", "body"), note_title: "", note_body: "" },
      decision: { eyebrow: "", headline: "", intro: "", images: pairs(2, "path", "caption"), sections: pairs(2, "title", "body"), cta_title: "", cta_body: "" },
    },
    source_ledger: "",
    asset_ledger: "",
  };
}

export function emptyArtifactPayload(featureId: string): Record<string, unknown> {
  return featureId === "reference-check-pdf" ? emptyReferencePayload() : emptyInterviewPayload();
}

export function valueAtPath(value: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, part) => {
    if (Array.isArray(current)) return current[Number(part)];
    return current && typeof current === "object" ? (current as Record<string, unknown>)[part] : undefined;
  }, value);
}

export function stringAtPath(value: Record<string, unknown>, path: string): string {
  const found = valueAtPath(value, path);
  return typeof found === "string" ? found : "";
}

export function setValueAtPath(value: Record<string, unknown>, path: string, nextValue: unknown): Record<string, unknown> {
  const clone = structuredClone(value);
  const parts = path.split(".");
  let current: unknown = clone;
  parts.forEach((part, index) => {
    if (index === parts.length - 1) {
      if (Array.isArray(current)) current[Number(part)] = nextValue;
      else (current as Record<string, unknown>)[part] = nextValue;
      return;
    }
    current = Array.isArray(current) ? current[Number(part)] : (current as Record<string, unknown>)[part];
  });
  return clone;
}

function required(payload: Record<string, unknown>, fields: readonly (readonly [string, string])[]): ManualProblem[] {
  return fields.flatMap(([path, label]) => stringAtPath(payload, path).trim() ? [] : [{ path, message: `${label} is required.` }]);
}

function ledgerRecords(
  value: string,
  path: "source_ledger" | "asset_ledger",
  heading: "Claim" | "Asset",
  labels: readonly string[],
): { records: string[]; problems: ManualProblem[] } {
  const starts = [...value.matchAll(new RegExp(`^\\s*##\\s+${heading}(?:\\s+.+)?\\s*$`, "gim"))];
  if (!starts.length) {
    return {
      records: [],
      problems: [{ path, message: `${heading} ledger requires one structured ## ${heading} record per item.` }],
    };
  }
  const records = starts.map((start, index) => value.slice(
    start.index,
    starts[index + 1]?.index ?? value.length,
  ));
  const problems = records.flatMap((record, index) => labels.flatMap((label) => {
    const present = new RegExp(`^\\s*(?:[-*]\\s*)?${label.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}:\\s*\\S`, "im").test(record);
    return present ? [] : [{ path, message: `${heading} ${index + 1} is missing ${label}.` }];
  }));
  return { records, problems };
}

export function validateManualArtifactPayload(featureId: string, payload: Record<string, unknown>): ManualProblem[] {
  if (featureId === "reference-check-pdf") {
    return required(payload, [
      ["candidate.full_name", "Candidate name"], ["candidate.position_applied_for", "Position applied for"],
      ["candidate.company_name", "Client company"], ["reference.full_name", "Reference name"],
      ["reference.job_title", "Reference job title"], ["reference.company_name", "Reference company"],
      ["reference.professional_relationship", "Professional relationship"], ["completed_by", "Completed by"], ["date", "Date"],
    ]);
  }
  if (featureId !== "interview-prep-pdf") return [{ path: "payload", message: "That feature has no manual PDF builder." }];
  const problems = required(payload, INTERVIEW_TEXT_FIELDS);
  const asOf = stringAtPath(payload, "brief.source_control.as_of");
  if (asOf && !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) problems.push({ path: "brief.source_control.as_of", message: "Use YYYY-MM-DD." });
  const status = stringAtPath(payload, "brief.source_control.publication_status");
  if (!status) problems.push({ path: "brief.source_control.publication_status", message: "Publication status is required." });
  else if (!["draft_only", "approved_for_candidate_use"].includes(status)) problems.push({ path: "brief.source_control.publication_status", message: "Choose Draft only or Approved for candidate use." });
  const authorities = valueAtPath(payload, "brief.source_control.authoritative_sources");
  if (!Array.isArray(authorities) || authorities.filter((item) => typeof item === "string" && item.trim()).length < 2) {
    problems.push({ path: "brief.source_control.authoritative_sources", message: "At least two authoritative source identifiers are required." });
  }
  const sourceLedger = stringAtPath(payload, "source_ledger");
  const sourceRecords = ledgerRecords(sourceLedger, "source_ledger", "Claim", [
    "Claim", "Source", "Publication date", "Retrieval date", "Scope", "Status",
  ]);
  problems.push(...sourceRecords.problems);
  if (Array.isArray(authorities)) {
    for (const authority of authorities) {
      if (typeof authority === "string" && authority.trim() && !sourceLedger.toLocaleLowerCase().includes(authority.trim().toLocaleLowerCase())) {
        problems.push({ path: "source_ledger", message: `Source ledger is missing authoritative source: ${authority.trim()}.` });
      }
    }
  }
  if (status === "approved_for_candidate_use") {
    for (const [index, record] of sourceRecords.records.entries()) {
      if (!/^\s*(?:[-*]\s*)?Status:\s*supported\s*$/im.test(record)) {
        problems.push({ path: "source_ledger", message: `Claim ${index + 1} must be supported before candidate-facing approval.` });
      }
    }
  }
  const assetLedger = stringAtPath(payload, "asset_ledger");
  const assetRecords = ledgerRecords(assetLedger, "asset_ledger", "Asset", [
    "Creator", "Source page", "Direct asset URL or generated-file path", "Licence", "Allowed use", "Modifications", "Rendered caption",
  ]);
  problems.push(...assetRecords.problems);
  const usedAssets = [
    stringAtPath(payload, "brief.cover.image"),
    stringAtPath(payload, "brief.role.image"),
    stringAtPath(payload, "brief.context.image"),
    stringAtPath(payload, "brief.decision.images.0.path"),
    stringAtPath(payload, "brief.decision.images.1.path"),
  ];
  for (const asset of new Set(usedAssets.filter(Boolean))) {
    if (!assetLedger.includes(asset)) {
      problems.push({ path: "asset_ledger", message: `Asset ledger is missing visual used by the brief: ${asset}.` });
    }
  }
  return problems;
}

export function problemsFromBuilderDetail(detail: string): ManualProblem[] {
  const known = [
    ...INTERVIEW_TEXT_FIELDS.map(([path]) => path),
    "brief.source_control.publication_status", "brief.source_control.authoritative_sources", "brief.privacy.banned_terms",
    "candidate.full_name", "candidate.position_applied_for", "candidate.company_name", "reference.full_name", "reference.job_title",
    "reference.company_name", "reference.professional_relationship", "completed_by", "date", "answers.strengths",
  ];
  const path = known.find((item) => detail.includes(item) || (item.startsWith("brief.") && detail.includes(item.slice("brief.".length)))) ?? "payload";
  return [{ path, message: detail }];
}
