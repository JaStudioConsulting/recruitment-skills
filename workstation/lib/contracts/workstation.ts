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
]);

export const createRoleSchema = z.object({
  title: z.string().trim().min(1).max(200),
  client: z.string().trim().max(200).default(""),
});

export const createCandidateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  currentTitle: z.string().trim().max(200).default(""),
});

export const openCaseSchema = z.object({
  roleId: z.string().uuid(),
  candidateId: z.string().uuid(),
});

export const updateCaseSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    notes: z.string().max(2_000_000).optional(),
    notesFont: z.string().trim().min(1).max(100).optional(),
    notesSize: z.number().int().min(12).max(72).optional(),
    status: caseStatusSchema.optional(),
  })
  .refine(
    ({ notes, notesFont, notesSize, status }) =>
      notes !== undefined ||
      notesFont !== undefined ||
      notesSize !== undefined ||
      status !== undefined,
    { message: "At least one case field is required." },
  );

export const saveDocumentSchema = z.object({
  expectedRevision: z.number().int().positive(),
  content: z.unknown().refine((value) => value !== undefined, {
    message: "Document content is required.",
  }),
});

export const sourceKindSchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[a-z0-9_-]+$/i, "Source kind contains unsupported characters.");

export type UpdateCaseInput = z.infer<typeof updateCaseSchema>;
