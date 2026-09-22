use audiobook_core::{ContentModel, DocumentIr, DocumentIrV2, NarrativePlan, SemanticOutline};
use wasm_bindgen::prelude::*;

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
pub fn document_v2_has_source_units_json(input: &str) -> Result<bool, JsValue> {
    let document = DocumentIrV2::from_json(input).map_err(js_error)?;
    Ok(document.pages.iter().any(|page| !page.regions.is_empty()))
}

#[wasm_bindgen]
pub fn build_content_model_json(document_json: &str) -> Result<String, JsValue> {
    let document = DocumentIrV2::from_json(document_json).map_err(js_error)?;
    ContentModel::from_document(&document)
        .and_then(|model| model.to_json())
        .map_err(js_error)
}

#[wasm_bindgen]
pub fn build_semantic_outline_json(content_model_json: &str) -> Result<String, JsValue> {
    let content = ContentModel::from_json(content_model_json).map_err(js_error)?;
    SemanticOutline::skeleton(&content)
        .and_then(|outline| outline.to_json(&content))
        .map_err(js_error)
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
