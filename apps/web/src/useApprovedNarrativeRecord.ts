import { useEffect, useState } from "react";
import { loadLatestApprovedNarrative, type ApprovedNarrativeRecord } from "./adapters/approved_narrative";
import type { LocalProjectPersistence } from "./adapters/local_project_persistence";
import type { DocumentIrV2 } from "./schemas/ingestion";

export function useApprovedNarrativeRecord(
  document: DocumentIrV2 | null,
  persistence: LocalProjectPersistence | null,
  enabled: boolean,
  revisionKey: string,
) {
  const [approvedNarrative, setApprovedNarrative] = useState<ApprovedNarrativeRecord | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!document || !persistence || !enabled) {
      setApprovedNarrative(null);
      return;
    }

    void loadLatestApprovedNarrative(persistence, document)
      .then(value => { if (!cancelled) setApprovedNarrative(value); })
      .catch(() => { if (!cancelled) setApprovedNarrative(null); });

    return () => { cancelled = true; };
  }, [document, persistence, enabled, revisionKey]);

  return approvedNarrative;
}
