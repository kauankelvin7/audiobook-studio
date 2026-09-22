import { describe, expect, it } from "vitest";
import narrativeFixture from "../../../../tests/fixtures/narrative_plan_v1.json";
import engineFixture from "../../../../tests/fixtures/engine_plan_v1.json";
import { narrationQaSchema, narrativeMemorySchema, narrativePlanSchema, speechUnitSchema } from "./narrative";
import { deviceCapabilityProfileSchema, enginePlanSchema, fullArtifactStatusSchema, playbackAvailabilitySchema, ttsBenchmarkSchema } from "./performance";

describe("future narrative boundary contracts", () => {
  it("keeps visual sections separate from spoken chapters", () => {
    const plan = narrativePlanSchema.parse(narrativeFixture);
    expect(plan.sections).toHaveLength(2);
    expect(plan.spokenChapters).toHaveLength(1);
    expect(plan.sections[1].heading?.policy).toBe("integrate");
  });

  it("rejects a missing or duplicated section/chapter mapping", () => {
    const invalid = structuredClone(narrativeFixture);
    invalid.spokenChapters[0].sectionIds = ["ns_1", "ns_1"];
    expect(narrativePlanSchema.safeParse(invalid).success).toBe(false);
  });

  it("preserves display and speech text independently with source references", () => {
    const unit = speechUnitSchema.parse({ schemaVersion: 1, id: "u1", sourceRefs: ["p1-t1"], displayText: "SQLCODE -911", speechText: "SQL Code menos novecentos e onze", pronunciationVersion: "1" });
    expect(unit.displayText).not.toBe(unit.speechText);
    expect(speechUnitSchema.safeParse({ ...unit, sourceRefs: [] }).success).toBe(false);
  });

  it("requires a typed narrative-memory shape", () => {
    expect(narrativeMemorySchema.safeParse({ schemaVersion: 1, conceptsCovered: ["PIC"], termsDefined: ["PIC"], openThreads: [], currentGoal: "estruturas", nextConcepts: ["OCCURS"], sourceRefs: ["p1-t1"] }).success).toBe(true);
  });

  it("does not mark critical narration findings as pass", () => {
    const report = { schemaVersion: 1, planId: "plan_1", status: "pass", documentSections: 10, narrativeSections: 3, spokenChapters: 1, duplicatedSpokenHeadings: 0, unsupportedClaims: 0, warnings: [], methodVersion: "1" };
    expect(narrationQaSchema.safeParse(report).success).toBe(true);
    expect(narrationQaSchema.safeParse({ ...report, duplicatedSpokenHeadings: 1 }).success).toBe(false);
  });

  it("represents unavailable hardware signals as unknown, not false", () => {
    expect(deviceCapabilityProfileSchema.safeParse({ schemaVersion: 1, webgpu: null, wasmSimd: null, wasmThreads: null, deviceMemoryGiB: null, hardwareConcurrency: null, nativeDesktop: false, benchmarkId: null }).success).toBe(true);
  });

  it("requires explicit engine fallbacks and benchmark evidence for performance claims", () => {
    expect(enginePlanSchema.safeParse(engineFixture).success).toBe(true);
    expect(enginePlanSchema.safeParse({ ...engineFixture, fallbacks: [{ engineId: engineFixture.engineId, voiceCompatibility: "same", activation: "automatic" }] }).success).toBe(false);
    expect(enginePlanSchema.safeParse({ ...engineFixture, estimatedPerformanceClass: "fast" }).success).toBe(false);
    expect(enginePlanSchema.safeParse({ ...engineFixture, fallbacks: [{ engineId: "different_voice", voiceCompatibility: "perceptible_change", activation: "automatic" }] }).success).toBe(false);
  });

  it("keeps playback available while full render is processing", () => {
    expect(playbackAvailabilitySchema.parse("available")).toBe("available");
    expect(fullArtifactStatusSchema.parse("processing")).toBe("processing");
  });

  it("defines RTF as generation time divided by audio duration", () => {
    const benchmark = { schemaVersion: 1, id: "bench_1", engineId: "test", modelVersion: "1", executionProvider: "wasm", modelLoadMs: 500, generationMs: 5000, audioDurationMs: 10000, realtimeFactor: 0.5, coldStart: true };
    expect(ttsBenchmarkSchema.safeParse(benchmark).success).toBe(true);
    expect(ttsBenchmarkSchema.safeParse({ ...benchmark, realtimeFactor: 2 }).success).toBe(false);
  });
});
