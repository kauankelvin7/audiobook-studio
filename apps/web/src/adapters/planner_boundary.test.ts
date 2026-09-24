import { describe, expect, it } from "vitest";
import contentModelFixture from "../../../../tests/fixtures/content_model_v1.json";
import narrativePlanFixture from "../../../../tests/fixtures/narrative_plan_v1.json";
import semanticOutlineFixture from "../../../../tests/fixtures/semantic_outline_v1.json";
import {
  PlannerBoundaryError,
  validatePlannerStructuredOutput,
} from "./planner_boundary";

function errorCode(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(PlannerBoundaryError);
    return (error as PlannerBoundaryError).code;
  }
  throw new Error("Expected planner boundary validation to fail");
}

describe("planner structured-output boundary", () => {
  it("accepts a valid plan grounded in the approved content and outline", () => {
    const plan = validatePlannerStructuredOutput({
      contentModel: contentModelFixture,
      semanticOutline: semanticOutlineFixture,
      rawOutput: narrativePlanFixture,
    });

    expect(plan.documentId).toBe("doc_test");
    expect(plan.sections.map(section => section.id)).toEqual(["ns_1", "ns_2"]);
  });

  it("rejects malformed structured output before pipeline use", () => {
    expect(errorCode(() => validatePlannerStructuredOutput({
      contentModel: contentModelFixture,
      semanticOutline: semanticOutlineFixture,
      rawOutput: { schemaVersion: 1, documentId: "doc_test" },
    }))).toBe("INVALID_PLANNER_OUTPUT");
  });

  it("rejects a planner response for another document", () => {
    expect(errorCode(() => validatePlannerStructuredOutput({
      contentModel: contentModelFixture,
      semanticOutline: semanticOutlineFixture,
      rawOutput: { ...narrativePlanFixture, documentId: "doc_other" },
    }))).toBe("DOCUMENT_MISMATCH");
  });

  it("rejects a concept invented outside ContentModel/SemanticOutline", () => {
    const output = structuredClone(narrativePlanFixture);
    output.sections[0].conceptIds = ["INVENTED_CONCEPT"];

    expect(errorCode(() => validatePlannerStructuredOutput({
      contentModel: contentModelFixture,
      semanticOutline: semanticOutlineFixture,
      rawOutput: output,
    }))).toBe("UNKNOWN_CONCEPT_REF");
  });

  it("rejects a source reference invented by the planner", () => {
    const output = structuredClone(narrativePlanFixture);
    output.sections[1].sourceRefs = ["missing-source"];

    expect(errorCode(() => validatePlannerStructuredOutput({
      contentModel: contentModelFixture,
      semanticOutline: semanticOutlineFixture,
      rawOutput: output,
    }))).toBe("UNKNOWN_SOURCE_REF");
  });

  it("rejects an outline that escapes the approved content model", () => {
    const outline = structuredClone(semanticOutlineFixture);
    outline.units[1].conceptIds = ["INVENTED_CONCEPT"];

    expect(errorCode(() => validatePlannerStructuredOutput({
      contentModel: contentModelFixture,
      semanticOutline: outline,
      rawOutput: narrativePlanFixture,
    }))).toBe("UNKNOWN_CONCEPT_REF");
  });
});
