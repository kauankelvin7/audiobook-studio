import { describe, expect, it } from "vitest";
import fixture from "../../../../tests/fixtures/document_ir_v1.json";
import { decodePipelineResponse } from "./protocol";

describe("pipeline worker boundary", () => {
  it("ignores PDF.js internal messages without ending import", () => {
    expect(decodePipelineResponse({ sourceName: "worker", targetName: "main", action: "Ready", data: null })).toBeNull();
    expect(decodePipelineResponse(null)).toBeNull();
  });

  it("accepts only a validated document result", () => {
    expect(decodePipelineResponse({ type: "result", document: fixture })).toMatchObject({ type: "result", document: { schemaVersion: 1 } });
    expect(decodePipelineResponse({ type: "result", document: { schemaVersion: 99 } })).toMatchObject({ type: "error", code: "INVALID_RESULT" });
  });

  it("requires typed errors", () => {
    expect(decodePipelineResponse({ type: "error", code: "PARSER_ERROR", message: "Falha" })).toMatchObject({ type: "error", code: "PARSER_ERROR" });
    expect(decodePipelineResponse({ type: "error", message: undefined })).toBeNull();
  });
});
