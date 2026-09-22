/* tslint:disable */
/* eslint-disable */

export function build_content_model_json(document_json: string): string;

export function build_semantic_outline_json(content_model_json: string): string;

export function core_version(): string;

export function document_v2_has_source_units_json(input: string): boolean;

export function migrate_document_v1_to_v2_json(input: string): string;

export function validate_document_v2_json(input: string): string;

export function validate_narrative_plan_json(plan_json: string, content_model_json: string, semantic_outline_json: string): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly build_content_model_json: (a: number, b: number) => [number, number, number, number];
    readonly build_semantic_outline_json: (a: number, b: number) => [number, number, number, number];
    readonly core_version: () => [number, number];
    readonly document_v2_has_source_units_json: (a: number, b: number) => [number, number, number];
    readonly migrate_document_v1_to_v2_json: (a: number, b: number) => [number, number, number, number];
    readonly validate_document_v2_json: (a: number, b: number) => [number, number, number, number];
    readonly validate_narrative_plan_json: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
