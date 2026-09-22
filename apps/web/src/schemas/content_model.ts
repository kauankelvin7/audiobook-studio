import { z } from "zod";
import { qualityStatusSchema, regionTypeSchema, uncertaintySchema } from "./ingestion";

const id = z.string().trim().min(1);
const sourceRefs = z.array(id).min(1);

export const narrationEligibilitySchema = z.enum(["eligible", "review_required", "blocked"]);

export const contentSourceUnitSchema = z.object({
  id,
  sourceRefs,
  regionType: regionTypeSchema,
  language: z.string().nullable(),
  analysisText: z.string().min(1).nullable(),
  structuredSource: z.boolean(),
  uncertainty: uncertaintySchema,
  qualityStatus: qualityStatusSchema,
  narrationEligibility: narrationEligibilitySchema,
  flags: z.array(id),
}).strict();

export const contentConceptSchema = z.object({
  id,
  label: z.string().min(1),
  sourceRefs,
  definitionSourceRefs: z.array(id),
  prerequisiteConceptIds: z.array(id),
  importance: z.enum(["supporting", "core"]).nullable(),
}).strict();

export const contentRelationSchema = z.object({
  id,
  fromConceptId: id,
  toConceptId: id,
  relation: z.enum(["prerequisite", "contains", "contrasts", "extends", "example_of", "related"]),
  sourceRefs,
}).strict();

export const contentModelSchema = z.object({
  schemaVersion: z.literal(1),
  documentId: id,
  sourceHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  language: z.string().nullable(),
  sourceUnits: z.array(contentSourceUnitSchema),
  concepts: z.array(contentConceptSchema),
  relations: z.array(contentRelationSchema),
}).strict().superRefine((model, context) => {
  const unitIds = new Set(model.sourceUnits.map(unit => unit.id));
  if (unitIds.size !== model.sourceUnits.length) {
    context.addIssue({ code: "custom", message: "Duplicate source unit ID" });
  }

  const conceptIds = new Set(model.concepts.map(concept => concept.id));
  if (conceptIds.size !== model.concepts.length) {
    context.addIssue({ code: "custom", message: "Duplicate concept ID" });
  }

  for (const relation of model.relations) {
    if (!conceptIds.has(relation.fromConceptId) || !conceptIds.has(relation.toConceptId)) {
      context.addIssue({ code: "custom", message: "Relation references an unknown concept" });
    }
  }
});

export const semanticOutlineSectionSchema = z.object({
  id,
  headingUnitId: id.nullable(),
  topicLabel: z.string().min(1).nullable(),
  sourceUnitIds: z.array(id).min(1),
  candidateNarrationUnitIds: z.array(id),
  conceptIds: z.array(id),
  requiresReview: z.boolean(),
}).strict().superRefine((section, context) => {
  const sourceIds = new Set(section.sourceUnitIds);
  const candidateIds = new Set(section.candidateNarrationUnitIds);
  if (sourceIds.size !== section.sourceUnitIds.length) {
    context.addIssue({ code: "custom", message: "Duplicate source unit in outline section" });
  }
  if (candidateIds.size !== section.candidateNarrationUnitIds.length) {
    context.addIssue({ code: "custom", message: "Duplicate narration candidate in outline section" });
  }
  if (section.headingUnitId && !sourceIds.has(section.headingUnitId)) {
    context.addIssue({ code: "custom", message: "Heading unit must belong to its outline section" });
  }
  if (section.candidateNarrationUnitIds.some(unitId => !sourceIds.has(unitId))) {
    context.addIssue({ code: "custom", message: "Narration candidate must belong to its outline section" });
  }
});

export const semanticOutlineSchema = z.object({
  schemaVersion: z.literal(1),
  documentId: id,
  sections: z.array(semanticOutlineSectionSchema).min(1),
}).strict().superRefine((outline, context) => {
  const sectionIds = new Set(outline.sections.map(section => section.id));
  if (sectionIds.size !== outline.sections.length) {
    context.addIssue({ code: "custom", message: "Duplicate outline section ID" });
  }
  const ownership = new Set<string>();
  for (const section of outline.sections) {
    for (const unitId of section.sourceUnitIds) {
      if (ownership.has(unitId)) context.addIssue({ code: "custom", message: "Source unit belongs to multiple outline sections" });
      ownership.add(unitId);
    }
  }
});

export type ContentSourceUnit = z.infer<typeof contentSourceUnitSchema>;
export type ContentModel = z.infer<typeof contentModelSchema>;
export type SemanticOutline = z.infer<typeof semanticOutlineSchema>;
