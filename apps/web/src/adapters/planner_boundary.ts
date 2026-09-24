import {
  contentModelSchema,
  narrativePlanSchema,
  semanticOutlineSchema,
  type ContentModel,
  type NarrativePlan,
  type SemanticOutline,
} from "../schemas/narrative";

export type PlannerBoundaryErrorCode =
  | "INVALID_CONTENT_MODEL"
  | "INVALID_SEMANTIC_OUTLINE"
  | "INVALID_PLANNER_OUTPUT"
  | "DOCUMENT_MISMATCH"
  | "UNKNOWN_CONCEPT_REF"
  | "UNKNOWN_SOURCE_REF";

export class PlannerBoundaryError extends Error {
  constructor(
    public readonly code: PlannerBoundaryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PlannerBoundaryError";
  }
}

export type ValidatePlannerStructuredOutputInput = {
  contentModel: unknown;
  semanticOutline: unknown;
  rawOutput: unknown;
};

function parseContentModel(value: unknown): ContentModel {
  const parsed = contentModelSchema.safeParse(value);
  if (!parsed.success) {
    throw new PlannerBoundaryError("INVALID_CONTENT_MODEL", "ContentModel failed schema validation.");
  }
  return parsed.data;
}

function parseSemanticOutline(value: unknown): SemanticOutline {
  const parsed = semanticOutlineSchema.safeParse(value);
  if (!parsed.success) {
    throw new PlannerBoundaryError("INVALID_SEMANTIC_OUTLINE", "SemanticOutline failed schema validation.");
  }
  return parsed.data;
}

function collectSourceRefs(model: ContentModel): Set<string> {
  return new Set([
    ...model.concepts.flatMap(concept => concept.sourceRefs),
    ...model.relations.flatMap(relation => relation.sourceRefs),
    ...model.evidence.flatMap(item => item.sourceRefs),
  ]);
}

function assertOutlineContext(model: ContentModel, outline: SemanticOutline): void {
  if (model.documentId !== outline.documentId) {
    throw new PlannerBoundaryError("DOCUMENT_MISMATCH", "ContentModel and SemanticOutline belong to different documents.");
  }

  const concepts = new Set(model.concepts.map(concept => concept.id));
  const sourceRefs = collectSourceRefs(model);

  for (const unit of outline.units) {
    if (unit.conceptIds.some(conceptId => !concepts.has(conceptId))) {
      throw new PlannerBoundaryError("UNKNOWN_CONCEPT_REF", "SemanticOutline references a concept outside ContentModel.");
    }
    if (unit.sourceRefs.some(sourceRef => !sourceRefs.has(sourceRef))) {
      throw new PlannerBoundaryError("UNKNOWN_SOURCE_REF", "SemanticOutline references source evidence outside ContentModel.");
    }
  }
}

export function validatePlannerStructuredOutput(input: ValidatePlannerStructuredOutputInput): NarrativePlan {
  const contentModel = parseContentModel(input.contentModel);
  const semanticOutline = parseSemanticOutline(input.semanticOutline);
  assertOutlineContext(contentModel, semanticOutline);

  const parsedPlan = narrativePlanSchema.safeParse(input.rawOutput);
  if (!parsedPlan.success) {
    throw new PlannerBoundaryError("INVALID_PLANNER_OUTPUT", "Planner output failed NarrativePlan schema validation.");
  }

  const plan = parsedPlan.data;
  if (plan.documentId !== contentModel.documentId) {
    throw new PlannerBoundaryError("DOCUMENT_MISMATCH", "Planner output belongs to a different document.");
  }

  const contentConcepts = new Set(contentModel.concepts.map(concept => concept.id));
  const outlineConcepts = new Set(semanticOutline.units.flatMap(unit => unit.conceptIds));
  const sourceRefs = collectSourceRefs(contentModel);

  for (const section of plan.sections) {
    if (section.conceptIds.some(conceptId => !contentConcepts.has(conceptId) || !outlineConcepts.has(conceptId))) {
      throw new PlannerBoundaryError("UNKNOWN_CONCEPT_REF", "Planner output references a concept outside the approved semantic outline.");
    }

    const sectionRefs = [
      ...section.sourceRefs,
      ...(section.transition?.sourceRefs ?? []),
    ];
    if (sectionRefs.some(sourceRef => !sourceRefs.has(sourceRef))) {
      throw new PlannerBoundaryError("UNKNOWN_SOURCE_REF", "Planner output references source evidence outside ContentModel.");
    }
  }

  return plan;
}
