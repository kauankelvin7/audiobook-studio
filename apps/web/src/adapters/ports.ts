import type { DocumentIr } from "../schemas/document";

export interface DocumentSource { extract(file: File): Promise<DocumentIr>; }
export interface SpeechEngine { synthesize(text: string): Promise<Blob>; }
export interface ArtifactStore { put(key: string, value: Blob): Promise<void>; }
