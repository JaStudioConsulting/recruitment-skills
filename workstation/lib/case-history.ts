import type {
  CandidateCase,
  CandidateRecord,
  RoleRecord,
} from "@/lib/workstation-types";

export type CaseHistoryEntry = {
  caseId: string;
  roleId: string;
  candidateId: string;
  candidateName: string;
  context: string;
  label: string;
};

export function buildCaseHistoryEntries(
  cases: CandidateCase[],
  candidates: CandidateRecord[],
  roles: RoleRecord[],
): CaseHistoryEntry[] {
  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const rolesById = new Map(roles.map((role) => [role.id, role]));

  return cases.map((candidateCase) => {
    const candidate = candidatesById.get(candidateCase.candidateId);
    const role = rolesById.get(candidateCase.roleId);
    const candidateName = candidate?.name || "Candidate unavailable";
    const context = [role?.title, role?.client].filter(Boolean).join(" · ");

    return {
      caseId: candidateCase.id,
      roleId: candidateCase.roleId,
      candidateId: candidateCase.candidateId,
      candidateName,
      context,
      label: context ? `${candidateName} — ${context}` : candidateName,
    };
  });
}
