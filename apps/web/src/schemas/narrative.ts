import { z } from "zod";

const id = z.string().min(1);
const sourceRefs = z.array(id).min(1);

export const spokenHeadingPolicySchema = z.enum(["announce", "integrate", "silent"]);
export const narrativeCertaintySchema = z.enum(["source", "inferred", "uncertain"]);
export const narrativeImportanceSchema = z.enum(["core", "supporting", "reference"]);
export const contentEvidenceKindSchema = z.enum(["definition", "code", "example", "table", "note"]);

export const contentModelSchema = z.object({
  schemaVersion: z.literal(1),
  documentId: id,
  concepts: z.array(z.object({
    id,
    label: z.string().min(1),
    importance: narrativeImportanceSchema,
    certainty: narrativeCertaintySchema,
    sourceRefs,
    prerequisiteConceptIds: z.array(id),
  }).strict()).min(1),
  relations: z.array(z.object({
    id,
    fromConceptId: id,
    toConceptId: id,
    kind: id,
    certainty: narrativeCertaintySchema,
    sourceRefs,
  }).strict()),
  evidence: z.array(z.object({
    id,
    kind: contentEvidenceKindSchema,
    conceptIds: z.array(id).min(1),
    sourceRefs,
  }).strict()),
}).strict().superRefine((model, context) => {
  const conceptIds = new Set(model.concepts.map(concept => concept.id));
  if (conceptIds.size !== model.concepts.length) {
    context.addIssue({ code: "custom", message: "Duplicate concept ID" });
  }

  for (const concept of model.concepts) {
    const prerequisites = new Set(concept.prerequisiteConceptIds);
    if (prerequisites.size !== concept.prerequisiteConceptIds.length) {
      context.addIssue({ code: "custom", message: "Duplicate prerequisite concept ID" });
    }
    if (prerequisites.has(concept.id) || [...prerequisites].some(prerequisite => !conceptIds.has(prerequisite))) {
      context.addIssue({ code: "custom", message: "Invalid prerequisite concept mapping" });
    }
  }

  const prerequisitesByConcept = new Map(model.concepts.map(concept => [concept.id, concept.prerequisiteConceptIds]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const hasPrerequisiteCycle = (conceptId: string): boolean => {
    if (visiting.has(conceptId)) return true;
    if (visited.has(conceptId)) return false;
    visiting.add(conceptId);
    for (const prerequisite of prerequisitesByConcept.get(conceptId) ?? []) {
      if (prerequisitesByConcept.has(prerequisite) && hasPrerequisiteCycle(prerequisite)) return true;
    }
    visiting.delete(conceptId);
    visited.add(conceptId);
    return false;
  };
  if (model.concepts.some(concept => hasPrerequisiteCycle(concept.id))) {
    context.addIssue({ code: "custom", message: "Cyclic concept prerequisites" });
  }

  const relationIds = new Set(model.relations.map(relation => relation.id));
  if (relationIds.size !== model.relations.length) {
    context.addIssue({ code: "custom", message: "Duplicate relation ID" });
  }
  for (const relation of model.relations) {
    if (
      relation.fromConceptId === relation.toConceptId ||
      !conceptIds.has(relation.fromConceptId) ||
      !conceptIds.has(relation.toConceptId)
    ) {
      context.addIssue({ code: "custom", message: "Invalid concept relation mapping" });
    }
  }

  const evidenceIds = new Set(model.evidence.map(item => item.id));
  if (evidenceIds.size !== model.evidence.length) {
    context.addIssue({ code: "custom", message: "Duplicate evidence ID" });
  }
  for (const item of model.evidence) {
    if (new Set(item.conceptIds).size !== item.conceptIds.length || item.conceptIds.some(conceptId => !conceptIds.has(conceptId))) {
      context.addIssue({ code: "custom", message: "Invalid evidence concept mapping" });
    }
  }
});

export const semanticOutlineSchema = z.object({
  schemaVersion: z.literal(1),
  documentId: id,
  units: z.array(z.object({
    id,
    title: z.string().min(1),
    objective: z.string().min(1),
    importance: narrativeImportanceSchema,
    conceptIds: z.array(id).min(1),
    sourceRefs,
    prerequisiteUnitIds: z.array(id),
  }).strict()).min(1),
  order: z.array(id).min(1),
}).strict().superRefine((outline, context) => {
  const unitIds = new Set(outline.units.map(unit => unit.id));
  if (unitIds.size !== outline.units.length) {
    context.addIssue({ code: "custom", message: "Duplicate outline unit ID" });
  }

  const orderIds = new Set(outline.order);
  if (
    orderIds.size !== outline.order.length ||
    orderIds.size !== unitIds.size ||
    outline.order.some(unitId => !unitIds.has(unitId))
  ) {
    context.addIssue({ code: "custom", message: "Invalid semantic outline order" });
  }

  const orderIndex = new Map(outline.order.map((unitId, index) => [unitId, index]));
  for (const unit of outline.units) {
    const prerequisites = new Set(unit.prerequisiteUnitIds);
    if (
      prerequisites.size !== unit.prerequisiteUnitIds.length ||
      prerequisites.has(unit.id) ||
      [...prerequisites].some(prerequisite => !unitIds.has(prerequisite))
    ) {
      context.addIssue({ code: "custom", message: "Invalid outline prerequisite mapping" });
      continue;
    }

    const unitPosition = orderIndex.get(unit.id);
    if (
      unitPosition !== undefined &&
      [...prerequisites].some(prerequisite => (orderIndex.get(prerequisite) ?? Number.MAX_SAFE_INTEGER) >= unitPosition)
    ) {
      context.addIssue({ code: "custom", message: "Outline prerequisite must precede dependent unit" });
    }
  }
});

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

export type ContentModel = z.infer<typeof contentModelSchema>;
export type SemanticOutline = z.infer<typeof semanticOutlineSchema>;
export type NarrativePlan = z.infer<typeof narrativePlanSchema>;
export type SpeechUnit = z.infer<typeof speechUnitSchema>;
export type NarrativeMemory = z.infer<typeof narrativeMemorySchema>;
export type NarrationQa = z.infer<typeof narrationQaSchema>;
