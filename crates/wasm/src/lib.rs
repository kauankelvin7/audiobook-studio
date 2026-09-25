use std::collections::BTreeMap;

use audiobook_core::{
    approve_narrative_script, approve_native_document, build_active_narrative_identity,
    build_narrative_draft, build_ocr_candidate_receipt, build_ocr_correction_training_record,
    build_ocr_review_receipt, build_reading_preview, build_reading_session,
    build_script_review_packet, build_validated_narration_qa, compare_ocr_candidate,
    compile_ocr_correction_model, compose_approved_ocr, evaluate_review_against_active,
    promote_approved_ocr, suggest_ocr_corrections, suggest_ocr_corrections_with_model,
    validate_script_review_submission, ApprovedOcrReview, ContentModel, DocumentIr, DocumentIrV2,
    GenerationJob, LocalNarrativeApproval, LocalNativeApproval, NarrativePlan, NarrativeScript,
    OcrCandidate, OcrCorrectionModel, OcrCorrectionTrainingRecord, OcrLocalApproval,
    OcrReviewSubmission, ReviewBindingReference, ScriptReviewSubmission, SemanticOutline,
};
use serde::Deserialize;
use wasm_bindgen::prelude::*;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReviewBindingInput {
    active_identity_hash: String,
    stored_binding_hash: Option<String>,
}

fn js_error(error: impl std::fmt::Display) -> JsValue {
    JsValue::from_str(&error.to_string())
}

#[wasm_bindgen]
pub fn core_version() -> String {
    env!("CARGO_PKG_VERSION").to_owned()
}

#[wasm_bindgen]
pub fn migrate_document_v1_to_v2_json(input: &str) -> Result<String, JsValue> {
    let document = DocumentIr::from_json(input).map_err(js_error)?;
    DocumentIrV2::migrate_from_v1(&document)
        .and_then(|migrated| migrated.to_json())
        .map_err(js_error)
}

#[wasm_bindgen]
pub fn validate_document_v2_json(input: &str) -> Result<String, JsValue> {
    DocumentIrV2::from_json(input)
        .and_then(|document| document.to_json())
        .map_err(js_error)
}

#[wasm_bindgen]
pub fn document_v2_hash_json(input: &str) -> Result<String, JsValue> {
    let document = DocumentIrV2::from_json(input).map_err(js_error)?;
    Ok(audiobook_core::sha256_source(
        document.to_json().map_err(js_error)?.as_bytes(),
    ))
}

#[wasm_bindgen]
pub fn document_v2_has_source_units_json(input: &str) -> Result<bool, JsValue> {
    let document = DocumentIrV2::from_json(input).map_err(js_error)?;
    Ok(document.pages.iter().any(|page| !page.regions.is_empty()))
}

#[wasm_bindgen]
pub fn build_reading_preview_json(
    document_json: &str,
    page_number: u32,
) -> Result<String, JsValue> {
    let document = DocumentIrV2::from_json(document_json).map_err(js_error)?;
    let preview = build_reading_preview(&document, page_number).map_err(js_error)?;
    serde_json::to_string(&preview).map_err(js_error)
}

#[wasm_bindgen]
pub fn build_reading_session_json(
    document_json: &str,
    start_page: u32,
    end_page: u32,
) -> Result<String, JsValue> {
    let document = DocumentIrV2::from_json(document_json).map_err(js_error)?;
    let session = build_reading_session(&document, start_page, end_page).map_err(js_error)?;
    serde_json::to_string(&session).map_err(js_error)
}

#[wasm_bindgen]
pub fn build_content_model_json(document_json: &str) -> Result<String, JsValue> {
    let document = DocumentIrV2::from_json(document_json).map_err(js_error)?;
    ContentModel::from_document(&document)
        .and_then(|model| model.to_json())
        .map_err(js_error)
}

#[wasm_bindgen]
pub fn build_permitted_content_model_json(document_json: &str) -> Result<String, JsValue> {
    let document = DocumentIrV2::from_json(document_json).map_err(js_error)?;
    ContentModel::from_permitted_document(&document)
        .and_then(|model| model.to_json())
        .map_err(js_error)
}

#[wasm_bindgen]
pub fn build_narrative_draft_json(document_json: &str) -> Result<String, JsValue> {
    let document = DocumentIrV2::from_json(document_json).map_err(js_error)?;
    let draft = build_narrative_draft(&document).map_err(js_error)?;
    serde_json::to_string(&draft).map_err(js_error)
}

#[wasm_bindgen]
pub fn approve_narrative_script_json(
    document_json: &str,
    script_json: &str,
    submission_json: &str,
    approval_json: &str,
) -> Result<String, JsValue> {
    if document_json.len() > 32_000_000
        || script_json.len() > 8_000_000
        || submission_json.len() > 8_000_000
        || approval_json.len() > 16_000
    {
        return Err(js_error("narrative approval input exceeds the size limit"));
    }
    let document = DocumentIrV2::from_json(document_json).map_err(js_error)?;
    let script = NarrativeScript::from_json(script_json).map_err(js_error)?;
    let submission = ScriptReviewSubmission::from_json(submission_json).map_err(js_error)?;
    let approval: LocalNarrativeApproval = serde_json::from_str(approval_json).map_err(js_error)?;
    let approved =
        approve_narrative_script(&document, &script, &submission, &approval).map_err(js_error)?;
    serde_json::to_string(&approved).map_err(js_error)
}

#[wasm_bindgen]
pub fn promote_approved_ocr_json(
    document_json: &str,
    candidate_json: &str,
    submission_json: &str,
    approval_json: &str,
) -> Result<String, JsValue> {
    if document_json.len() > 32_000_000
        || candidate_json.len() > 8_000_000
        || submission_json.len() > 2_000_000
        || approval_json.len() > 16_000
    {
        return Err(js_error("OCR promotion input exceeds the size limit"));
    }
    let document = DocumentIrV2::from_json(document_json).map_err(js_error)?;
    let candidate = OcrCandidate::from_json(candidate_json).map_err(js_error)?;
    let submission: OcrReviewSubmission =
        serde_json::from_str(submission_json).map_err(js_error)?;
    let approval: OcrLocalApproval = serde_json::from_str(approval_json).map_err(js_error)?;
    let promoted =
        promote_approved_ocr(&document, &candidate, &submission, &approval).map_err(js_error)?;
    serde_json::to_string(&promoted).map_err(js_error)
}

#[wasm_bindgen]
pub fn compose_approved_ocr_json(
    document_json: &str,
    reviews_json: &str,
) -> Result<String, JsValue> {
    if document_json.len() > 32_000_000 || reviews_json.len() > 16_000_000 {
        return Err(js_error("OCR composition input exceeds the size limit"));
    }
    let document = DocumentIrV2::from_json(document_json).map_err(js_error)?;
    let reviews: Vec<ApprovedOcrReview> = serde_json::from_str(reviews_json).map_err(js_error)?;
    let composed = compose_approved_ocr(&document, &reviews).map_err(js_error)?;
    serde_json::to_string(&composed).map_err(js_error)
}

#[wasm_bindgen]
pub fn approve_native_document_json(
    document_json: &str,
    approval_json: &str,
) -> Result<String, JsValue> {
    if document_json.len() > 32_000_000 || approval_json.len() > 16_000 {
        return Err(js_error("native approval input exceeds the size limit"));
    }
    let document = DocumentIrV2::from_json(document_json).map_err(js_error)?;
    let approval: LocalNativeApproval = serde_json::from_str(approval_json).map_err(js_error)?;
    let promoted = approve_native_document(&document, &approval).map_err(js_error)?;
    serde_json::to_string(&promoted).map_err(js_error)
}

#[wasm_bindgen]
pub fn build_semantic_outline_json(content_model_json: &str) -> Result<String, JsValue> {
    let content = ContentModel::from_json(content_model_json).map_err(js_error)?;
    SemanticOutline::skeleton(&content)
        .and_then(|outline| outline.to_json(&content))
        .map_err(js_error)
}

#[wasm_bindgen]
pub fn build_ocr_candidate_receipt_json(
    document_json: &str,
    candidate_json: &str,
) -> Result<String, JsValue> {
    let document = DocumentIrV2::from_json(document_json).map_err(js_error)?;
    let candidate = OcrCandidate::from_json(candidate_json).map_err(js_error)?;
    let receipt = build_ocr_candidate_receipt(&document, &candidate).map_err(js_error)?;
    serde_json::to_string(&receipt).map_err(js_error)
}

#[wasm_bindgen]
pub fn compare_ocr_candidate_json(
    document_json: &str,
    candidate_json: &str,
) -> Result<String, JsValue> {
    if document_json.len() > 32_000_000 || candidate_json.len() > 8_000_000 {
        return Err(js_error("OCR comparison input exceeds the size limit"));
    }
    let document = DocumentIrV2::from_json(document_json).map_err(js_error)?;
    let candidate = OcrCandidate::from_json(candidate_json).map_err(js_error)?;
    let report = compare_ocr_candidate(&document, &candidate).map_err(js_error)?;
    serde_json::to_string(&report).map_err(js_error)
}

#[wasm_bindgen]
pub fn build_ocr_review_receipt_json(
    document_json: &str,
    candidate_json: &str,
    submission_json: &str,
) -> Result<String, JsValue> {
    if document_json.len() > 32_000_000
        || candidate_json.len() > 8_000_000
        || submission_json.len() > 8_000_000
    {
        return Err(js_error("OCR review input exceeds the size limit"));
    }
    let document = DocumentIrV2::from_json(document_json).map_err(js_error)?;
    let candidate = OcrCandidate::from_json(candidate_json).map_err(js_error)?;
    let submission: OcrReviewSubmission =
        serde_json::from_str(submission_json).map_err(js_error)?;
    let receipt = build_ocr_review_receipt(&document, &candidate, &submission).map_err(js_error)?;
    serde_json::to_string(&receipt).map_err(js_error)
}

#[wasm_bindgen]
pub fn build_ocr_correction_training_record_json(
    document_json: &str,
    candidate_json: &str,
    submission_json: &str,
) -> Result<String, JsValue> {
    if document_json.len() > 32_000_000
        || candidate_json.len() > 8_000_000
        || submission_json.len() > 8_000_000
    {
        return Err(js_error("OCR learning input exceeds the size limit"));
    }
    let document = DocumentIrV2::from_json(document_json).map_err(js_error)?;
    let candidate = OcrCandidate::from_json(candidate_json).map_err(js_error)?;
    let submission: OcrReviewSubmission =
        serde_json::from_str(submission_json).map_err(js_error)?;
    let record = build_ocr_correction_training_record(&document, &candidate, &submission)
        .map_err(js_error)?;
    serde_json::to_string(&record).map_err(js_error)
}

#[wasm_bindgen]
pub fn suggest_ocr_corrections_json(
    document_json: &str,
    candidate_json: &str,
    records_json: &str,
) -> Result<String, JsValue> {
    if document_json.len() > 32_000_000
        || candidate_json.len() > 8_000_000
        || records_json.len() > 8_000_000
    {
        return Err(js_error("OCR learning input exceeds the size limit"));
    }
    let document = DocumentIrV2::from_json(document_json).map_err(js_error)?;
    let candidate = OcrCandidate::from_json(candidate_json).map_err(js_error)?;
    let records: Vec<OcrCorrectionTrainingRecord> =
        serde_json::from_str(records_json).map_err(js_error)?;
    let report = suggest_ocr_corrections(&document, &candidate, &records).map_err(js_error)?;
    serde_json::to_string(&report).map_err(js_error)
}

#[wasm_bindgen]
pub fn compile_ocr_correction_model_json(records_json: &str) -> Result<String, JsValue> {
    if records_json.len() > 8_000_000 {
        return Err(js_error("OCR learning input exceeds the size limit"));
    }
    let records: Vec<OcrCorrectionTrainingRecord> =
        serde_json::from_str(records_json).map_err(js_error)?;
    let model = compile_ocr_correction_model(&records).map_err(js_error)?;
    serde_json::to_string(&model).map_err(js_error)
}

#[wasm_bindgen]
pub fn suggest_ocr_corrections_with_model_json(
    document_json: &str,
    candidate_json: &str,
    model_json: &str,
) -> Result<String, JsValue> {
    if document_json.len() > 32_000_000
        || candidate_json.len() > 8_000_000
        || model_json.len() > 8_000_000
    {
        return Err(js_error("OCR learning input exceeds the size limit"));
    }
    let document = DocumentIrV2::from_json(document_json).map_err(js_error)?;
    let candidate = OcrCandidate::from_json(candidate_json).map_err(js_error)?;
    let model: OcrCorrectionModel = serde_json::from_str(model_json).map_err(js_error)?;
    let report =
        suggest_ocr_corrections_with_model(&document, &candidate, &model).map_err(js_error)?;
    serde_json::to_string(&report).map_err(js_error)
}

#[wasm_bindgen]
pub fn validate_narrative_plan_json(
    plan_json: &str,
    content_model_json: &str,
    semantic_outline_json: &str,
) -> Result<(), JsValue> {
    let content = ContentModel::from_json(content_model_json).map_err(js_error)?;
    let outline = SemanticOutline::from_json(semantic_outline_json, &content).map_err(js_error)?;
    let plan = NarrativePlan::from_json(plan_json).map_err(js_error)?;
    plan.validate_against(&content, &outline).map_err(js_error)
}

#[wasm_bindgen]
pub fn build_narration_qa_json(
    plan_id: &str,
    plan_json: &str,
    content_model_json: &str,
    semantic_outline_json: &str,
    section_speech_json: &str,
) -> Result<String, JsValue> {
    let content = ContentModel::from_json(content_model_json).map_err(js_error)?;
    let outline = SemanticOutline::from_json(semantic_outline_json, &content).map_err(js_error)?;
    let plan = NarrativePlan::from_json(plan_json).map_err(js_error)?;
    let section_speech: BTreeMap<String, String> =
        serde_json::from_str(section_speech_json).map_err(js_error)?;
    let qa = build_validated_narration_qa(plan_id, &plan, &content, &outline, &section_speech)
        .map_err(js_error)?;
    serde_json::to_string(&qa).map_err(js_error)
}

#[wasm_bindgen]
pub fn build_script_qa_json(
    expected_plan_id: &str,
    script_json: &str,
    plan_json: &str,
    content_model_json: &str,
    semantic_outline_json: &str,
) -> Result<String, JsValue> {
    let content = ContentModel::from_json(content_model_json).map_err(js_error)?;
    let outline = SemanticOutline::from_json(semantic_outline_json, &content).map_err(js_error)?;
    let plan = NarrativePlan::from_json(plan_json).map_err(js_error)?;
    let script = NarrativeScript::from_json(script_json).map_err(js_error)?;
    let qa = script
        .build_qa(expected_plan_id, &plan, &content, &outline)
        .map_err(js_error)?;
    serde_json::to_string(&qa).map_err(js_error)
}

#[wasm_bindgen]
pub fn build_script_review_packet_json(
    expected_plan_id: &str,
    script_json: &str,
    plan_json: &str,
    content_model_json: &str,
    semantic_outline_json: &str,
) -> Result<String, JsValue> {
    let content = ContentModel::from_json(content_model_json).map_err(js_error)?;
    let outline = SemanticOutline::from_json(semantic_outline_json, &content).map_err(js_error)?;
    let plan = NarrativePlan::from_json(plan_json).map_err(js_error)?;
    let script = NarrativeScript::from_json(script_json).map_err(js_error)?;
    let packet = build_script_review_packet(expected_plan_id, &script, &plan, &content, &outline)
        .map_err(js_error)?;
    serde_json::to_string(&packet).map_err(js_error)
}

#[wasm_bindgen]
pub fn build_active_narrative_identity_json(
    expected_plan_id: &str,
    script_json: &str,
    plan_json: &str,
    content_model_json: &str,
    semantic_outline_json: &str,
) -> Result<String, JsValue> {
    let content = ContentModel::from_json(content_model_json).map_err(js_error)?;
    let outline = SemanticOutline::from_json(semantic_outline_json, &content).map_err(js_error)?;
    let plan = NarrativePlan::from_json(plan_json).map_err(js_error)?;
    let script = NarrativeScript::from_json(script_json).map_err(js_error)?;
    let identity =
        build_active_narrative_identity(expected_plan_id, &script, &plan, &content, &outline)
            .map_err(js_error)?;
    serde_json::to_string(&identity).map_err(js_error)
}

#[wasm_bindgen]
pub fn validate_active_narrative_activation_json(job_json: &str) -> Result<(), JsValue> {
    GenerationJob::from_json(job_json)
        .and_then(|job| job.ensure_narrative_activation_allowed())
        .map_err(js_error)
}

#[wasm_bindgen]
pub fn evaluate_review_against_active_json(
    expected_plan_id: &str,
    script_json: &str,
    plan_json: &str,
    content_model_json: &str,
    semantic_outline_json: &str,
    submission_json: &str,
    binding_json: &str,
) -> Result<String, JsValue> {
    let content = ContentModel::from_json(content_model_json).map_err(js_error)?;
    let outline = SemanticOutline::from_json(semantic_outline_json, &content).map_err(js_error)?;
    let plan = NarrativePlan::from_json(plan_json).map_err(js_error)?;
    let script = NarrativeScript::from_json(script_json).map_err(js_error)?;
    let submission = ScriptReviewSubmission::from_json(submission_json).map_err(js_error)?;
    let binding: ReviewBindingInput = serde_json::from_str(binding_json).map_err(js_error)?;
    let evaluation = evaluate_review_against_active(
        expected_plan_id,
        &script,
        &plan,
        &content,
        &outline,
        &submission,
        ReviewBindingReference {
            active_identity_hash: &binding.active_identity_hash,
            stored_binding_hash: binding.stored_binding_hash.as_deref(),
        },
    )
    .map_err(js_error)?;
    serde_json::to_string(&evaluation).map_err(js_error)
}

#[wasm_bindgen]
pub fn validate_script_review_submission_json(
    expected_plan_id: &str,
    script_json: &str,
    plan_json: &str,
    content_model_json: &str,
    semantic_outline_json: &str,
    submission_json: &str,
) -> Result<String, JsValue> {
    let content = ContentModel::from_json(content_model_json).map_err(js_error)?;
    let outline = SemanticOutline::from_json(semantic_outline_json, &content).map_err(js_error)?;
    let plan = NarrativePlan::from_json(plan_json).map_err(js_error)?;
    let script = NarrativeScript::from_json(script_json).map_err(js_error)?;
    let submission = ScriptReviewSubmission::from_json(submission_json).map_err(js_error)?;
    let receipt = validate_script_review_submission(
        expected_plan_id,
        &script,
        &plan,
        &content,
        &outline,
        &submission,
    )
    .map_err(js_error)?;
    serde_json::to_string(&receipt).map_err(js_error)
}
