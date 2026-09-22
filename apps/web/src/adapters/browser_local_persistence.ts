import { IndexedDbCheckpointRepository } from "./indexeddb_checkpoint_repository";
import { LocalProjectPersistence } from "./local_project_persistence";
import { OpfsArtifactStore } from "./opfs_artifact_store";
import { WebLocksProjectLock } from "./web_locks_project_lock";

export type BrowserLocalPersistence = {
  service: LocalProjectPersistence;
  close(): void;
};

export function createBrowserLocalPersistence(): BrowserLocalPersistence {
  const state = new IndexedDbCheckpointRepository();
  const artifacts = new OpfsArtifactStore();
  const lock = new WebLocksProjectLock();

  return {
    service: new LocalProjectPersistence(state, artifacts, lock),
    close: () => state.close(),
  };
}
