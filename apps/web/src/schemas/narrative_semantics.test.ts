import { describe, expect, it } from "vitest";
import contentModelFixture from "../../../../tests/fixtures/content_model_v1.json";
import semanticOutlineFixture from "../../../../tests/fixtures/semantic_outline_v1.json";
import { contentModelSchema, semanticOutlineSchema } from "./narrative";

describe("M4.2a semantic contracts", () => {
  it("validates ContentModel without deciding spoken structure", () => {
    const model = contentModelSchema.parse(contentModelFixture);
    expect(model.concepts.map(concept => concept.id)).toEqual(["COBOL", "PIC"]);
    expect(model.evidence.map(item => item.kind)).toEqual(["definition", "definition"]);
    expect("spokenChapters" in model).toBe(false);
  });

  it("rejects orphan concept prerequisites and relation endpoints", () => {
    const invalidPrerequisite = structuredClone(contentModelFixture);
    invalidPrerequisite.concepts[1].prerequisiteConceptIds = ["UNKNOWN"];
    expect(contentModelSchema.safeParse(invalidPrerequisite).success).toBe(false);

    const invalidRelation = structuredClone(contentModelFixture);
    invalidRelation.relations[0].toConceptId = "UNKNOWN";
    expect(contentModelSchema.safeParse(invalidRelation).success).toBe(false);
  });

  it("validates SemanticOutline as ordered semantic units, not spoken chapters", () => {
    const outline = semanticOutlineSchema.parse(semanticOutlineFixture);
    expect(outline.order).toEqual(["ou_1", "ou_2"]);
    expect(outline.units[1].prerequisiteUnitIds).toEqual(["ou_1"]);
    expect("spokenChapters" in outline).toBe(false);
  });

  it("requires every outline unit exactly once in order", () => {
    const invalid = structuredClone(semanticOutlineFixture);
    invalid.order = ["ou_1", "ou_1"];
    expect(semanticOutlineSchema.safeParse(invalid).success).toBe(false);
  });

  it("requires prerequisites to appear before dependent semantic units", () => {
    const invalid = structuredClone(semanticOutlineFixture);
    invalid.order = ["ou_2", "ou_1"];
    expect(semanticOutlineSchema.safeParse(invalid).success).toBe(false);
  });
});
