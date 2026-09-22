export interface DocumentSource { extract(file: File): Promise<string>; }
export interface SpeechEngine { synthesize(text: string): Promise<Blob>; }
export interface ArtifactStore { put(key: string, value: Blob): Promise<void>; }
