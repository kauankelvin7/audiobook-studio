import { z } from "zod";

export const userPerformanceModeSchema = z.enum(["auto", "fast", "quality"]);
export const selectedPerformanceTierSchema = z.enum(["fast", "balanced", "quality"]);
export const playbackAvailabilitySchema = z.enum(["unavailable", "buffering", "available", "starved", "finished"]);
export const fullArtifactStatusSchema = z.enum(["not_requested", "processing", "ready", "failed"]);
export const resourceSchedulerStateSchema = z.enum(["interactive", "prefetch", "idle_precompute", "battery_saver", "paused"]);

export const deviceCapabilityProfileSchema = z.object({
  schemaVersion: z.literal(1),
  webgpu: z.boolean().nullable(),
  wasmSimd: z.boolean().nullable(),
  wasmThreads: z.boolean().nullable(),
  deviceMemoryGiB: z.number().finite().positive().nullable(),
  hardwareConcurrency: z.number().int().positive().nullable(),
  nativeDesktop: z.boolean(),
  benchmarkId: z.string().nullable(),
}).strict();

export const enginePlanSchema = z.object({
  schemaVersion: z.literal(1),
  requestedMode: userPerformanceModeSchema,
  selectedTier: selectedPerformanceTierSchema,
  engineId: z.string().min(1),
  modelId: z.string().min(1),
  modelVersion: z.string().min(1),
  quantization: z.string().min(1),
  executionProvider: z.string().min(1),
  inferenceConcurrency: z.number().int().positive(),
  renderAheadSeconds: z.number().int().positive(),
  fallbacks: z.array(z.object({
    engineId: z.string().min(1),
    voiceCompatibility: z.enum(["same", "perceptible_change", "unknown"]),
    activation: z.enum(["automatic", "requires_confirmation"]),
  }).strict()),
  estimatedPerformanceClass: z.enum(["unmeasured", "slow", "realtime", "fast"]),
  reason: z.string().min(1),
  benchmarkId: z.string().nullable(),
}).strict().superRefine((plan, context) => {
  const fallbackIds = plan.fallbacks.map(fallback => fallback.engineId);
  if (fallbackIds.includes(plan.engineId) || new Set(fallbackIds).size !== fallbackIds.length) {
    context.addIssue({ code: "custom", message: "Invalid engine fallback chain" });
  }
  if (plan.fallbacks.some(fallback => fallback.voiceCompatibility !== "same" && fallback.activation === "automatic")) {
    context.addIssue({ code: "custom", message: "Voice-changing fallback requires confirmation" });
  }
  if (plan.estimatedPerformanceClass !== "unmeasured" && plan.benchmarkId === null) {
    context.addIssue({ code: "custom", message: "Measured performance requires benchmark" });
  }
});

export const ttsBenchmarkSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  engineId: z.string().min(1),
  modelVersion: z.string().min(1),
  executionProvider: z.string().min(1),
  modelLoadMs: z.number().finite().nonnegative(),
  generationMs: z.number().finite().nonnegative(),
  audioDurationMs: z.number().finite().positive(),
  realtimeFactor: z.number().finite().nonnegative(),
  coldStart: z.boolean(),
}).strict().superRefine((benchmark, context) => {
  if (Math.abs(benchmark.realtimeFactor - benchmark.generationMs / benchmark.audioDurationMs) > 0.01) {
    context.addIssue({ code: "custom", message: "RTF does not match measured durations" });
  }
});

export type EnginePlan = z.infer<typeof enginePlanSchema>;
