import { afterEach, describe, expect, it, vi } from "vitest";
import { generateLocalNarrative, listLocalNarrativeModels } from "./local_narrative_model";
import type { NarrativeScript } from "../schemas/narrative";

const source = (): NarrativeScript => ({ schemaVersion: 1, planId: "plan", documentId: "document",
  sections: [{ id: "section", segments: [
    { id: "first", sourceRefs: ["region1"], speechText: "Fonte um.", displayText: "Fonte um." },
    { id: "second", sourceRefs: ["region2"], speechText: "Fonte dois.", displayText: "Fonte dois." },
  ] }] });
const answer = (speechText: string, done_reason = "stop") => new Response(JSON.stringify({ done: true,
  done_reason, message: { role: "assistant", content: JSON.stringify({ speechText }) } }));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("local narrative candidates", () => {
  it("lists installed models only from loopback", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ models: [{ name: "local:small" }] })));
    vi.stubGlobal("fetch", fetch);
    expect(await listLocalNarrativeModels()).toEqual(["local:small"]);
    expect(fetch.mock.calls[0][0]).toBe("http://127.0.0.1:11434/api/tags");
  });
  it("generates sequentially without changing source identities or input", async () => {
    const input = source();
    const fetch = vi.fn().mockResolvedValueOnce(answer("Primeira fala.")).mockResolvedValueOnce(answer("Segunda fala."));
    vi.stubGlobal("fetch", fetch);
    const progress = vi.fn();
    const result = await generateLocalNarrative(input, { model: "local:small", onProgress: progress });
    expect(result.sections[0].segments.map(segment => segment.speechText)).toEqual(["Primeira fala.", "Segunda fala."]);
    expect(result.sections[0].segments.map(segment => [segment.id, segment.sourceRefs])).toEqual([["first", ["region1"]], ["second", ["region2"]]]);
    expect(result.planId).toBe(input.planId);
    expect(input).toEqual(source());
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body).toMatchObject({ stream: false, think: false, model: "local:small" });
    expect(JSON.parse(body.messages[1].content)).toEqual({ approvedSource: "Fonte um." });
    expect(progress).toHaveBeenLastCalledWith({ completed: 2, total: 2, segmentId: "second" });
  });
  it("rejects truncated output without returning a partial candidate", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(answer("Primeira fala.")).mockResolvedValueOnce(answer("Cortado", "length")));
    const input = source();
    await expect(generateLocalNarrative(input, { model: "local" })).rejects.toThrow("não terminou");
    expect(input).toEqual(source());
  });
  it("rejects model-provided source metadata", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ done: true, done_reason: "stop",
      message: { role: "assistant", content: JSON.stringify({ speechText: "Fala", sourceRefs: ["invented"] }) } }))));
    await expect(generateLocalNarrative(source(), { model: "local" })).rejects.toThrow("válido");
  });
  it("rejects oversized source before requesting anything", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const input = source(); input.sections[0].segments[1].speechText = "a".repeat(12_001);
    await expect(generateLocalNarrative(input, { model: "local" })).rejects.toThrow("nenhum texto foi cortado");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("honors cancellation before generation", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(generateLocalNarrative(source(), { model: "local", signal: AbortSignal.abort() })).rejects.toThrow("cancelada");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("limits response bytes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x".repeat(256_001))));
    await expect(generateLocalNarrative(source(), { model: "local" })).rejects.toThrow("grande demais");
  });
  it("times out a stalled local service", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })));
    const request = listLocalNarrativeModels();
    const assertion = expect(request).rejects.toThrow("demorou demais");
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
  });
});
