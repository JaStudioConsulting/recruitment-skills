import { z } from "zod";

export const caseStatusSchema = z.enum([
  "active",
  "screening",
  "submission_ready",
  "on_hold",
  "closed",
]);

export const documentKindSchema = z.enum([
  "resume",
  "write_up",
  "submission",
  "email",
  "loxo_update",
]);

export const createRoleSchema = z.object({
  title: z.string().trim().min(1).max(200),
  client: z.string().trim().min(1).max(200),
});

export const createCandidateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  currentTitle: z.string().trim().max(200).default(""),
});

export const candidateSourceIntakeSchema = createCandidateSchema.extend({
  roleId: z.string().uuid(),
  kind: z.literal("resume"),
});

export const openCaseSchema = z.object({
  roleId: z.string().uuid(),
  candidateId: z.string().uuid(),
});

export const updateCaseSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    notes: z.string().max(2_000_000).optional(),
    notesDrawingSvg: z.string().max(5_000_000).optional(),
    notesFont: z.string().trim().min(1).max(100).optional(),
    notesSize: z.number().int().min(12).max(72).optional(),
    status: caseStatusSchema.optional(),
  })
  .refine(
    ({ notes, notesDrawingSvg, notesFont, notesSize, status }) =>
      notes !== undefined ||
      notesDrawingSvg !== undefined ||
      notesFont !== undefined ||
      notesSize !== undefined ||
      status !== undefined,
    { message: "At least one case field is required." },
  );

export const saveDocumentSchema = z.object({
  // Revision 0 is reserved for first materialization of loxo_update on cases
  // created before that stored document kind existed. Repository code rejects
  // revision 0 for every other document kind.
  expectedRevision: z.number().int().nonnegative(),
  content: z.unknown().refine((value) => value !== undefined, {
    message: "Document content is required.",
  }),
  origin: z.enum(["generated", "edited"]).default("edited"),
  sourceRefs: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
  capabilityRunId: z.string().trim().min(1).max(200).nullable().optional(),
});

export const sourceKindSchema = z.enum([
  "job_description",
  "resume",
  "transcript",
  "call_notes",
  "pasted_text",
  "other",
]);

export const reviewSourceSchema = z.object({
  kind: sourceKindSchema.optional(),
  lifecycleStatus: z.literal("reviewed"),
});

export type UpdateCaseInput = z.infer<typeof updateCaseSchema>;
