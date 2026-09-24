/* tslint:disable */
/* eslint-disable */

export function approve_narrative_script_json(document_json: string, script_json: string, submission_json: string, approval_json: string): string;

export function approve_native_document_json(document_json: string, approval_json: string): string;

export function build_active_narrative_identity_json(expected_plan_id: string, script_json: string, plan_json: string, content_model_json: string, semantic_outline_json: string): string;

export function build_content_model_json(document_json: string): string;

export function build_narration_qa_json(plan_id: string, plan_json: string, content_model_json: string, semantic_outline_json: string, section_speech_json: string): string;

export function build_narrative_draft_json(document_json: string): string;

export function build_ocr_candidate_receipt_json(document_json: string, candidate_json: string): string;

export function build_ocr_correction_training_record_json(document_json: string, candidate_json: string, submission_json: string): string;

export function build_ocr_review_receipt_json(document_json: string, candidate_json: string, submission_json: string): string;

export function build_permitted_content_model_json(document_json: string): string;

export function build_reading_preview_json(document_json: string, page_number: number): string;

export function build_reading_session_json(document_json: string, start_page: number, end_page: number): string;

export function build_script_qa_json(expected_plan_id: string, script_json: string, plan_json: string, content_model_json: string, semantic_outline_json: string): string;

export function build_script_review_packet_json(expected_plan_id: string, script_json: string, plan_json: string, content_model_json: string, semantic_outline_json: string): string;

export function build_semantic_outline_json(content_model_json: string): string;

export function compare_ocr_candidate_json(document_json: string, candidate_json: string): string;

export function compile_ocr_correction_model_json(records_json: string): string;

export function core_version(): string;

export function document_v2_has_source_units_json(input: string): boolean;

export function document_v2_hash_json(input: string): string;

export function evaluate_review_against_active_json(expected_plan_id: string, script_json: string, plan_json: string, content_model_json: string, semantic_outline_json: string, submission_json: string, binding_json: string): string;

export function migrate_document_v1_to_v2_json(input: string): string;

export function promote_approved_ocr_json(document_json: string, candidate_json: string, submission_json: string, approval_json: string): string;

export function suggest_ocr_corrections_json(document_json: string, candidate_json: string, records_json: string): string;

export function suggest_ocr_corrections_with_model_json(document_json: string, candidate_json: string, model_json: string): string;

export function validate_active_narrative_activation_json(job_json: string): void;

export function validate_document_v2_json(input: string): string;

export function validate_narrative_plan_json(plan_json: string, content_model_json: string, semantic_outline_json: string): void;

export function validate_script_review_submission_json(expected_plan_id: string, script_json: string, plan_json: string, content_model_json: string, semantic_outline_json: string, submission_json: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly approve_narrative_script_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly approve_native_document_json: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly build_active_narrative_identity_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number, number];
    readonly build_content_model_json: (a: number, b: number) => [number, number, number, number];
    readonly build_narration_qa_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number, number];
    readonly build_narrative_draft_json: (a: number, b: number) => [number, number, number, number];
    readonly build_ocr_candidate_receipt_json: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly build_ocr_correction_training_record_json: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly build_ocr_review_receipt_json: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly build_permitted_content_model_json: (a: number, b: number) => [number, number, number, number];
    readonly build_reading_preview_json: (a: number, b: number, c: number) => [number, number, number, number];
    readonly build_reading_session_json: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly build_script_qa_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number, number];
    readonly build_script_review_packet_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number, number];
    readonly build_semantic_outline_json: (a: number, b: number) => [number, number, number, number];
    readonly compare_ocr_candidate_json: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly compile_ocr_correction_model_json: (a: number, b: number) => [number, number, number, number];
    readonly core_version: () => [number, number];
    readonly document_v2_has_source_units_json: (a: number, b: number) => [number, number, number];
    readonly document_v2_hash_json: (a: number, b: number) => [number, number, number, number];
    readonly evaluate_review_against_active_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number) => [number, number, number, number];
    readonly migrate_document_v1_to_v2_json: (a: number, b: number) => [number, number, number, number];
    readonly promote_approved_ocr_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly suggest_ocr_corrections_json: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly suggest_ocr_corrections_with_model_json: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly validate_active_narrative_activation_json: (a: number, b: number) => [number, number];
    readonly validate_document_v2_json: (a: number, b: number) => [number, number, number, number];
    readonly validate_narrative_plan_json: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly validate_script_review_submission_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => [number, number, number, number];
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
