import { describe, expect, it } from "vitest";
import { inspectStorageQuota, requestPersistentStorage } from "./storage_quota";

describe("storage quota adapter", () => {
  it("reports measured quota and persistent state", async () => {
    await expect(inspectStorageQuota({
      estimate: async () => ({ usage: 400, quota: 1_000 }),
      persisted: async () => true,
    })).resolves.toEqual({ status: "available", usageBytes: 400, quotaBytes: 1_000, availableBytes: 600, persistent: true });
  });

  it("degrades safely when storage APIs are absent or fail", async () => {
    const unavailable = { status: "unavailable", usageBytes: null, quotaBytes: null, availableBytes: null, persistent: null };
    await expect(inspectStorageQuota()).resolves.toEqual(unavailable);
    await expect(inspectStorageQuota({ estimate: async () => { throw new Error("denied"); } })).resolves.toEqual(unavailable);
    await expect(requestPersistentStorage()).resolves.toBe("unavailable");
  });

  it("does not treat denied persistence as an error", async () => {
    await expect(requestPersistentStorage({ persist: async () => true })).resolves.toBe("granted");
    await expect(requestPersistentStorage({ persist: async () => false })).resolves.toBe("denied");
    await expect(requestPersistentStorage({ persist: async () => { throw new Error("denied"); } })).resolves.toBe("unavailable");
  });
});
