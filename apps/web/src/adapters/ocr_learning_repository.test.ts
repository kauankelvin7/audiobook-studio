import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { OcrLearningRepository } from "./ocr_learning_repository";
import { ocrCorrectionTrainingRecordSchema } from "../schemas/ocr_learning";

const record = {
  schemaVersion: 1 as const,
  sourceHash: `sha256:${"a".repeat(64)}`,
  candidateReceiptHash: `sha256:${"b".repeat(64)}`,
  reviewHash: `sha256:${"c".repeat(64)}`,
  rules: [{ observedToken: "M0VE", correctedToken: "MOVE" }],
  recordHash: `sha256:${"d".repeat(64)}`,
  methodVersion: "ocr-ambiguity-memory-rust-v1" as const,
};

describe("OCR learning repository", () => {
  it("stores each Rust-derived record once and returns no document text", async () => {
    const repository = new OcrLearningRepository(new IDBFactory(), "ocr-learning-round-trip");
    await repository.save(record);
    await repository.save(record);
    expect(await repository.list()).toEqual([record]);
  });

  it("rejects a different record under an existing record hash", async () => {
    const repository = new OcrLearningRepository(new IDBFactory(), "ocr-learning-conflict");
    await repository.save(record);
    await expect(repository.save({ ...record, reviewHash: `sha256:${"e".repeat(64)}` }))
      .rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("removes one record or clears the memory only on an explicit repository action", async () => {
    const repository = new OcrLearningRepository(new IDBFactory(), "ocr-learning-removal");
    const second = { ...record, reviewHash: `sha256:${"e".repeat(64)}`, recordHash: `sha256:${"f".repeat(64)}` };
    await repository.save(record);
    await repository.save(second);
    await repository.remove(record.recordHash);
    expect(await repository.list()).toEqual([second]);
    await repository.clear();
    expect(await repository.list()).toEqual([]);
  });

  it("rejects a stored rule outside the same ambiguity pairs accepted by Rust", () => {
    expect(ocrCorrectionTrainingRecordSchema.safeParse({ ...record,
      rules: [{ observedToken: "M0VE", correctedToken: "MAKE" }] }).success).toBe(false);
  });
});
