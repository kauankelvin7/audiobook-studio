import { describe, expect, it } from "vitest";
import v1 from "../../../../tests/fixtures/document_ir_v1.json";
import v2 from "../../../../tests/fixtures/document_ir_v2.json";
import { documentIrSchema } from "./document";
import { documentIrV2Schema, documentQualityReportSchema, migrateDocumentV1ToV2, projectManifestSchema } from "./ingestion";

describe("DocumentIR v2 ingestion contract", () => {
  it("preserves native, OCR and reconstructed layers", () => {
    const document = documentIrV2Schema.parse(v2);
    expect(document.pages[0].regions[0].sources).toEqual({ rawText: "PR0CEDURE DIVISI0N", ocrText: "PROCEDURE DIVISION", reconstructedText: "PROCEDURE DIVISION" });
    expect(document.pages[0].regions[0]).toMatchObject({ uncertainty: "reconstructed", qualityStatus: "review_required" });
  });

  it("rejects unsupported facts marked accepted and uncertain visual interpretation", () => {
    const unsupported = documentIrV2Schema.parse(structuredClone(v2));
    unsupported.pages[0].regions[0].uncertainty = "unsupported";
    unsupported.pages[0].regions[0].qualityStatus = "accepted";
    expect(documentIrV2Schema.safeParse(unsupported).success).toBe(false);

    const visual = documentIrV2Schema.parse(structuredClone(v2));
    visual.pages[0].regions[0].type = "chart";
    visual.pages[0].regions[0].content = { kind: "visual", visualType: "chart", imageHash: `sha256:${"0".repeat(64)}`, disposition: "interpret", description: "Tendência" };
    visual.pages[0].regions[0].uncertainty = "uncertain";
    expect(documentIrV2Schema.safeParse(visual).success).toBe(false);
  });

  it("validates table shape and formula source/display separation", () => {
    const table = documentIrV2Schema.parse(structuredClone(v2));
    table.pages[0].regions[0].type = "table";
    table.pages[0].regions[0].content = { kind: "table", headers: ["A", "B"], rows: [["1"]] };
    expect(documentIrV2Schema.safeParse(table).success).toBe(false);

    const formula = documentIrV2Schema.parse(structuredClone(v2));
    formula.pages[0].regions[0].type = "formula";
    formula.pages[0].regions[0].content = { kind: "formula", sourceRepresentation: "x^2+y^2", displayRepresentation: "x² + y²", speechRepresentation: null };
    expect(documentIrV2Schema.safeParse(formula).success).toBe(true);
  });

  it("rejects empty provenance and incompatible region content", () => {
    const emptySource = documentIrV2Schema.parse(structuredClone(v2));
    emptySource.pages[0].regions[0].sources = { rawText: "   ", ocrText: null, reconstructedText: null };
    expect(documentIrV2Schema.safeParse(emptySource).success).toBe(false);

    const mismatched = documentIrV2Schema.parse(structuredClone(v2));
    mismatched.pages[0].regions[0].type = "table";
    expect(documentIrV2Schema.safeParse(mismatched).success).toBe(false);
  });

  it("migrates v1 losslessly and marks missing provenance for review", () => {
    const migrated = migrateDocumentV1ToV2(documentIrSchema.parse(v1));
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.pages[0].rawText).toBe(v1.pages[0].rawText);
    expect(migrated.pages[0].regions.map(region => region.content.kind)).toEqual(["legacy_text", "legacy_text"]);
    expect(migrated.pages[0].regions.every(region => region.uncertainty === "uncertain" && region.qualityStatus === "review_required")).toBe(true);
    expect(migrated.pages[1]).toMatchObject({ extractionQuality: "no_text", regions: [] });
  });

  it("versions project/audit manifests and rejects impossible page counts", () => {
    expect(projectManifestSchema.safeParse({ schemaVersion: 1, projectId: "p1", documentIrVersion: 2, narrativeModelVersion: null, speechModelVersion: null, auditManifestVersion: 1, pipelineVersion: "1" }).success).toBe(true);
    const report = { schemaVersion: 1, documentId: "d1", pages: 2, nativeTextPages: 3, ocrPages: 0, partialOcrPages: 0, visualRegions: 0, tables: 0, codeRegions: 0, formulaRegions: 0, reconstructedRegions: 0, reviewRequired: 0, unsupported: 0, analyzerVersion: "1" };
    expect(documentQualityReportSchema.safeParse(report).success).toBe(false);
    expect(documentQualityReportSchema.safeParse({ ...report, nativeTextPages: 2 }).success).toBe(true);
  });
});
