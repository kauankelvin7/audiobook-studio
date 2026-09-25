import { ocrCorrectionModelSchema, ocrCorrectionTrainingRecordSchema, type OcrCorrectionModel, type OcrCorrectionTrainingRecord } from "../schemas/ocr_learning";

const DATABASE_NAME = "audiobook-studio-ocr-learning";
const DATABASE_VERSION = 2;
const STORE = "training_records";
const MODEL_STORE = "models";
const CURRENT_MODEL_KEY = "current";
const MAX_RECORDS = 1_024;

type StoredRecord = OcrCorrectionTrainingRecord & { createdAtMs: number };

export class OcrLearningRepositoryError extends Error {
  constructor(public readonly code: "UNAVAILABLE" | "OPEN_FAILED" | "CORRUPT_RECORD" | "LIMIT_REACHED" | "CONFLICT", message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "OcrLearningRepositoryError";
  }
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error ?? new Error("IndexedDB request failed"));
  });
}

function completed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

function parse(value: unknown): StoredRecord {
  if (!value || typeof value !== "object" || !Number.isSafeInteger((value as { createdAtMs?: unknown }).createdAtMs)) {
    throw new OcrLearningRepositoryError("CORRUPT_RECORD", "A memória OCR local contém um registro inválido.");
  }
  const { createdAtMs, ...record } = value as OcrCorrectionTrainingRecord & { createdAtMs: number };
  return { ...ocrCorrectionTrainingRecordSchema.parse(record), createdAtMs };
}

export class OcrLearningRepository {
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly indexedDb: IDBFactory = globalThis.indexedDB, private readonly databaseName = DATABASE_NAME) {
    if (!indexedDb) throw new OcrLearningRepositoryError("UNAVAILABLE", "IndexedDB não está disponível para a memória OCR.");
  }

  async list(): Promise<OcrCorrectionTrainingRecord[]> {
    const database = await this.database();
    try {
      const transaction = database.transaction(STORE, "readonly");
      const done = completed(transaction);
      const values = await request(transaction.objectStore(STORE).getAll());
      await done;
      return values.map(parse).sort((left, right) => left.createdAtMs - right.createdAtMs)
        .map(({ createdAtMs: _createdAtMs, ...record }) => record);
    } catch (error) {
      if (error instanceof OcrLearningRepositoryError) throw error;
      throw new OcrLearningRepositoryError("CORRUPT_RECORD", "Não foi possível ler a memória OCR local.", { cause: error });
    }
  }

  async save(input: OcrCorrectionTrainingRecord): Promise<void> {
    const record = ocrCorrectionTrainingRecordSchema.parse(input);
    const database = await this.database();
    try {
      const transaction = database.transaction(STORE, "readwrite");
      const done = completed(transaction);
      const store = transaction.objectStore(STORE);
      const existing = await request(store.get(record.recordHash));
      if (existing !== undefined) {
        const parsed = parse(existing);
        if (JSON.stringify({ ...parsed, createdAtMs: undefined }) !== JSON.stringify({ ...record, createdAtMs: undefined })) {
          transaction.abort();
          await done.catch(() => undefined);
          throw new OcrLearningRepositoryError("CONFLICT", "A chave da memória OCR já aponta para outro registro.");
        }
        await done;
        return;
      }
      const count = await request(store.count());
      if (count >= MAX_RECORDS) {
        transaction.abort();
        await done.catch(() => undefined);
        throw new OcrLearningRepositoryError("LIMIT_REACHED", "A memória OCR atingiu o limite de 1.024 correções.");
      }
      await request(store.add({ ...record, createdAtMs: Date.now() }));
      await done;
    } catch (error) {
      if (error instanceof OcrLearningRepositoryError) throw error;
      throw new OcrLearningRepositoryError("OPEN_FAILED", "Não foi possível salvar a memória OCR local.", { cause: error });
    }
  }

  async loadModel(): Promise<OcrCorrectionModel | null> {
    const database = await this.database();
    try {
      const transaction = database.transaction(MODEL_STORE, "readonly");
      const done = completed(transaction);
      const value = await request(transaction.objectStore(MODEL_STORE).get(CURRENT_MODEL_KEY));
      await done;
      if (value === undefined) return null;
      if (!value || typeof value !== "object") throw new Error("missing model");
      const { key: _key, trainedAtMs: _trainedAtMs, ...model } = value as OcrCorrectionModel & { key?: unknown; trainedAtMs?: unknown };
      return ocrCorrectionModelSchema.parse(model);
    } catch (error) {
      throw new OcrLearningRepositoryError("CORRUPT_RECORD", "O modelo OCR local está inválido.", { cause: error });
    }
  }

  async saveModel(input: OcrCorrectionModel): Promise<void> {
    const model = ocrCorrectionModelSchema.parse(input);
    const database = await this.database();
    try {
      const transaction = database.transaction(MODEL_STORE, "readwrite");
      const done = completed(transaction);
      await request(transaction.objectStore(MODEL_STORE).put({ ...model, key: CURRENT_MODEL_KEY, trainedAtMs: Date.now() }));
      await done;
    } catch (error) {
      throw new OcrLearningRepositoryError("OPEN_FAILED", "Não foi possível salvar o modelo OCR local.", { cause: error });
    }
  }

  async remove(recordHash: string): Promise<void> {
    if (!/^sha256:[0-9a-f]{64}$/.test(recordHash)) {
      throw new OcrLearningRepositoryError("CORRUPT_RECORD", "A chave de memória OCR é inválida.");
    }
    const database = await this.database();
    try {
      const transaction = database.transaction(STORE, "readwrite");
      const done = completed(transaction);
      await request(transaction.objectStore(STORE).delete(recordHash));
      await done;
    } catch (error) {
      throw new OcrLearningRepositoryError("OPEN_FAILED", "Não foi possível apagar o registro de memória OCR.", { cause: error });
    }
  }

  async clear(): Promise<void> {
    const database = await this.database();
    try {
      const transaction = database.transaction([STORE, MODEL_STORE], "readwrite");
      const done = completed(transaction);
      await request(transaction.objectStore(STORE).clear());
      await request(transaction.objectStore(MODEL_STORE).clear());
      await done;
    } catch (error) {
      throw new OcrLearningRepositoryError("OPEN_FAILED", "Não foi possível apagar a memória OCR local.", { cause: error });
    }
  }

  private database(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise((resolve, reject) => {
      const opening = this.indexedDb.open(this.databaseName, DATABASE_VERSION);
      opening.onupgradeneeded = () => {
        if (!opening.result.objectStoreNames.contains(STORE)) opening.result.createObjectStore(STORE, { keyPath: "recordHash" });
        if (!opening.result.objectStoreNames.contains(MODEL_STORE)) opening.result.createObjectStore(MODEL_STORE, { keyPath: "key" });
      };
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(new OcrLearningRepositoryError("OPEN_FAILED", "Não foi possível abrir a memória OCR local.", { cause: opening.error ?? undefined }));
    });
    return this.databasePromise;
  }
}
