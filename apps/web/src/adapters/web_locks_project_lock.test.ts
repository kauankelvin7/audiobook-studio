import { describe, expect, it, vi } from "vitest";
import { ProjectLockError, WebLocksProjectLock } from "./web_locks_project_lock";

describe("WebLocksProjectLock", () => {
  it("runs the operation while holding a namespaced exclusive lock", async () => {
    const operation = vi.fn(async () => "done");
    const request = vi.fn(async (name, options, callback) => callback({ name, mode: "exclusive" }));
    const lock = new WebLocksProjectLock({ request });

    await expect(lock.runExclusive("project_1", operation)).resolves.toBe("done");
    expect(request).toHaveBeenCalledWith(
      "audiobook-studio:project:project_1",
      { mode: "exclusive", ifAvailable: true },
      expect.any(Function),
    );
    expect(operation).toHaveBeenCalledOnce();
  });

  it("fails closed when another context owns the lock", async () => {
    const operation = vi.fn(async () => undefined);
    const lock = new WebLocksProjectLock({ request: async (_name, _options, callback) => callback(null) });

    await expect(lock.runExclusive("project_1", operation)).rejects.toMatchObject({ code: "LOCK_BUSY" });
    expect(operation).not.toHaveBeenCalled();
  });

  it("preserves operation failures and types lock manager failures", async () => {
    const operationError = new Error("operation failed");
    const granted = new WebLocksProjectLock({ request: async (name, _options, callback) => callback({ name, mode: "exclusive" }) });
    await expect(granted.runExclusive("project_1", async () => { throw operationError; })).rejects.toBe(operationError);

    const failed = new WebLocksProjectLock({ request: async () => { throw new Error("manager failed"); } });
    await expect(failed.runExclusive("project_1", async () => undefined)).rejects.toMatchObject({ code: "LOCK_FAILED" });
  });

  it("reports an unavailable API explicitly", () => {
    vi.stubGlobal("navigator", {});
    try {
      expect(() => new WebLocksProjectLock()).toThrow(ProjectLockError);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
