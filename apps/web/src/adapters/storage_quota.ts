export type StorageEstimateResult = {
  status: "available" | "unavailable";
  usageBytes: number | null;
  quotaBytes: number | null;
  availableBytes: number | null;
  persistent: boolean | null;
};

export type PersistenceRequestResult = "granted" | "denied" | "unavailable";

export type StorageManagerLike = {
  estimate?: () => Promise<{ usage?: number; quota?: number }>;
  persisted?: () => Promise<boolean>;
  persist?: () => Promise<boolean>;
};

function validBytes(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export async function inspectStorageQuota(manager?: StorageManagerLike): Promise<StorageEstimateResult> {
  if (!manager?.estimate) {
    return { status: "unavailable", usageBytes: null, quotaBytes: null, availableBytes: null, persistent: null };
  }

  try {
    const [estimate, persistent] = await Promise.all([
      manager.estimate(),
      manager.persisted ? manager.persisted().catch(() => null) : Promise.resolve(null),
    ]);
    const usageBytes = validBytes(estimate.usage) ? estimate.usage : null;
    const quotaBytes = validBytes(estimate.quota) ? estimate.quota : null;
    const availableBytes = usageBytes !== null && quotaBytes !== null ? Math.max(0, quotaBytes - usageBytes) : null;
    return { status: "available", usageBytes, quotaBytes, availableBytes, persistent };
  } catch {
    return { status: "unavailable", usageBytes: null, quotaBytes: null, availableBytes: null, persistent: null };
  }
}

export async function requestPersistentStorage(manager?: StorageManagerLike): Promise<PersistenceRequestResult> {
  if (!manager?.persist) return "unavailable";
  try {
    return await manager.persist() ? "granted" : "denied";
  } catch {
    return "unavailable";
  }
}
