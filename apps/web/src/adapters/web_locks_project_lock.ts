import { storageIdSchema } from "../schemas/persistence";
import type { ProjectLock } from "./ports";

type LockLike = { name: string; mode: "exclusive" | "shared" };
type LockManagerLike = {
  request<T>(
    name: string,
    options: { mode: "exclusive"; ifAvailable: true },
    callback: (lock: LockLike | null) => Promise<T>,
  ): Promise<T>;
};

export type ProjectLockErrorCode = "LOCK_UNAVAILABLE" | "LOCK_BUSY" | "LOCK_FAILED";

export class ProjectLockError extends Error {
  constructor(public readonly code: ProjectLockErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProjectLockError";
  }
}

export class WebLocksProjectLock implements ProjectLock {
  private readonly locks: LockManagerLike;

  constructor(locks?: LockManagerLike) {
    const available = locks ?? (globalThis.navigator?.locks as unknown as LockManagerLike | undefined);
    if (!available) throw new ProjectLockError("LOCK_UNAVAILABLE", "Web Locks não está disponível neste ambiente.");
    this.locks = available;
  }

  async runExclusive<T>(projectIdInput: string, operation: () => Promise<T>): Promise<T> {
    const projectId = storageIdSchema.parse(projectIdInput);
    let operationFailed = false;
    let operationError: unknown;

    try {
      return await this.locks.request(
        `audiobook-studio:project:${projectId}`,
        { mode: "exclusive", ifAvailable: true },
        async lock => {
          if (!lock) throw new ProjectLockError("LOCK_BUSY", "Outro contexto já está alterando este projeto.");
          try {
            return await operation();
          } catch (error) {
            operationFailed = true;
            operationError = error;
            throw error;
          }
        },
      );
    } catch (error) {
      if (operationFailed && error === operationError) throw error;
      if (error instanceof ProjectLockError) throw error;
      throw new ProjectLockError("LOCK_FAILED", "Não foi possível coordenar a escrita local.", { cause: error });
    }
  }
}
