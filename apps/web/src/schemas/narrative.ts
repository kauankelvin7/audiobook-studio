import { z } from "zod";

const id = z.string().min(1);
const sourceRefs = z.array(id).min(1);

export const spokenHeadingPolicySchema = z.enum(["announce", "integrate", "silent"]);

export const narrativePlanSchema = z.object({
  schemaVersion: z.literal(1),
  documentId: id,
  sections: z.array(z.object({
    id,
    sourceRefs,
    conceptIds: z.array(id),
    heading: z.object({ displayText: z.string().min(1), policy: spokenHeadingPolicySchema, reason: z.string().min(1) }).nullable(),
    transition: z.object({ text: z.string().min(1), relation: z.string().min(1), sourceRefs }).nullable(),
    spokenChapterId: id,
    estimatedSeconds: z.number().finite().positive().nullable(),
  }).strict()).min(1),
  spokenChapters: z.array(z.object({ id, sectionIds: z.array(id).min(1), displayTitle: z.string().min(1) }).strict()).min(1),
}).strict().superRefine((plan, context) => {
  const sections = new Set(plan.sections.map(section => section.id));
  if (sections.size !== plan.sections.length) context.addIssue({ code: "custom", message: "Duplicate section ID" });
  const chapters = new Set(plan.spokenChapters.map(chapter => chapter.id));
  if (chapters.size !== plan.spokenChapters.length) context.addIssue({ code: "custom", message: "Duplicate chapter ID" });
  const ownership = new Set<string>();
  for (const chapter of plan.spokenChapters) {
    for (const sectionId of chapter.sectionIds) {
      if (!sections.has(sectionId) || ownership.has(sectionId) || plan.sections.find(section => section.id === sectionId)?.spokenChapterId !== chapter.id) {
        context.addIssue({ code: "custom", message: "Invalid section/chapter mapping" });
      }
      ownership.add(sectionId);
    }
  }
  if (ownership.size !== sections.size || plan.sections.some(section => !chapters.has(section.spokenChapterId))) {
    context.addIssue({ code: "custom", message: "Unassigned narrative section" });
  }
});

export const speechUnitSchema = z.object({
  schemaVersion: z.literal(1),
  id,
  sourceRefs,
  displayText: z.string().min(1),
  speechText: z.string().min(1),
  pronunciationVersion: id,
}).strict();

export const narrativeMemorySchema = z.object({
  schemaVersion: z.literal(1),
  conceptsCovered: z.array(id),
  termsDefined: z.array(id),
  openThreads: z.array(id),
  currentGoal: z.string().nullable(),
  nextConcepts: z.array(id),
  sourceRefs: z.array(id),
}).strict();

export const narrationQaSchema = z.object({
  schemaVersion: z.literal(1),
  planId: id,
  status: z.enum(["pass", "review", "fail"]),
  documentSections: z.number().int().nonnegative(),
  narrativeSections: z.number().int().nonnegative(),
  spokenChapters: z.number().int().nonnegative(),
  duplicatedSpokenHeadings: z.number().int().nonnegative(),
  unsupportedClaims: z.number().int().nonnegative(),
  warnings: z.array(z.object({ code: id, sectionId: id.nullable(), message: z.string().min(1) }).strict()),
  methodVersion: id,
}).strict().superRefine((report, context) => {
  if (report.status === "pass" && (report.duplicatedSpokenHeadings !== 0 || report.unsupportedClaims !== 0)) {
    context.addIssue({ code: "custom", message: "Critical findings cannot pass" });
  }
});

export type NarrativePlan = z.infer<typeof narrativePlanSchema>;
