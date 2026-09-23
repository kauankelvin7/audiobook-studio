use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::{sha256_source, DocumentIrV2};

const OCR_CANDIDATE_SCHEMA_VERSION: u32 = 1;
const MAX_OCR_TEXT_BYTES: usize = 1_000_000;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum OcrCandidateError {
    #[error("invalid OCR candidate JSON")]
    InvalidJson,
    #[error("unsupported OCR candidate schema version")]
    UnsupportedSchema,
    #[error("OCR candidate belongs to another document")]
    WrongDocument,
    #[error("OCR candidate was checked against an invalid document")]
    InvalidDocument,
    #[error("OCR candidate refers to an unknown page or region")]
    UnknownRegion,
    #[error("OCR candidate native text is stale")]
    StaleNativeText,
    #[error("OCR candidate image hash is invalid")]
    InvalidImageHash,
    #[error("OCR candidate engine identity is invalid")]
    InvalidEngine,
    #[error("OCR candidate text is empty or exceeds the size limit")]
    InvalidText,
    #[error("OCR candidate cannot be serialized")]
    Serialization,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OcrCandidate {
    pub schema_version: u32,
    pub document_id: String,
    pub source_hash: String,
    pub page_number: u32,
    pub region_id: String,
    pub native_text_hash: String,
    pub image_hash: String,
    pub engine_id: String,
    pub engine_version: String,
    pub text: String,
}

impl OcrCandidate {
    pub fn from_json(input: &str) -> Result<Self, OcrCandidateError> {
        serde_json::from_str(input).map_err(|_| OcrCandidateError::InvalidJson)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OcrCandidateStatus {
    Pending,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OcrCandidateReceipt {
    pub schema_version: u32,
    pub document_id: String,
    pub source_hash: String,
    pub document_hash: String,
    pub page_number: u32,
    pub region_id: String,
    pub native_text_hash: String,
    pub image_hash: String,
    pub engine_id: String,
    pub engine_version: String,
    pub ocr_text_hash: String,
    pub native_private_use_count: usize,
    pub ocr_private_use_count: usize,
    pub status: OcrCandidateStatus,
    pub receipt_hash: String,
    pub method_version: String,
}

pub fn build_ocr_candidate_receipt(
    document: &DocumentIrV2,
    candidate: &OcrCandidate,
) -> Result<OcrCandidateReceipt, OcrCandidateError> {
    document
        .validate()
        .map_err(|_| OcrCandidateError::InvalidDocument)?;
    if candidate.schema_version != OCR_CANDIDATE_SCHEMA_VERSION {
        return Err(OcrCandidateError::UnsupportedSchema);
    }
    if candidate.document_id != document.document_id
        || candidate.source_hash != document.source_hash
    {
        return Err(OcrCandidateError::WrongDocument);
    }
    let region = document
        .pages
        .iter()
        .find(|page| page.number == candidate.page_number)
        .and_then(|page| {
            page.regions
                .iter()
                .find(|region| region.id == candidate.region_id)
        })
        .ok_or(OcrCandidateError::UnknownRegion)?;
    let native_text = region
        .sources
        .raw_text
        .as_deref()
        .ok_or(OcrCandidateError::StaleNativeText)?;
    if candidate.native_text_hash != sha256_source(native_text.as_bytes()) {
        return Err(OcrCandidateError::StaleNativeText);
    }
    if !is_sha256(&candidate.image_hash) {
        return Err(OcrCandidateError::InvalidImageHash);
    }
    if !valid_engine_part(&candidate.engine_id) || !valid_engine_part(&candidate.engine_version) {
        return Err(OcrCandidateError::InvalidEngine);
    }
    if candidate.text.trim().is_empty() || candidate.text.len() > MAX_OCR_TEXT_BYTES {
        return Err(OcrCandidateError::InvalidText);
    }

    let document_json = document
        .to_json()
        .map_err(|_| OcrCandidateError::Serialization)?;
    let document_hash = sha256_source(document_json.as_bytes());
    let ocr_text_hash = sha256_source(candidate.text.as_bytes());
    let native_private_use_count = private_use_count(native_text);
    let ocr_private_use_count = private_use_count(&candidate.text);
    let status = OcrCandidateStatus::Pending;
    let method_version = "ocr-candidate-rust-v1";
    let receipt_bytes = serde_json::to_vec(&(
        OCR_CANDIDATE_SCHEMA_VERSION,
        &candidate.document_id,
        &candidate.source_hash,
        &document_hash,
        candidate.page_number,
        &candidate.region_id,
        &candidate.native_text_hash,
        &candidate.image_hash,
        &candidate.engine_id,
        &candidate.engine_version,
        &ocr_text_hash,
        native_private_use_count,
        ocr_private_use_count,
        status,
        method_version,
    ))
    .map_err(|_| OcrCandidateError::Serialization)?;
    Ok(OcrCandidateReceipt {
        schema_version: OCR_CANDIDATE_SCHEMA_VERSION,
        document_id: candidate.document_id.clone(),
        source_hash: candidate.source_hash.clone(),
        document_hash,
        page_number: candidate.page_number,
        region_id: candidate.region_id.clone(),
        native_text_hash: candidate.native_text_hash.clone(),
        image_hash: candidate.image_hash.clone(),
        engine_id: candidate.engine_id.clone(),
        engine_version: candidate.engine_version.clone(),
        ocr_text_hash,
        native_private_use_count,
        ocr_private_use_count,
        status,
        receipt_hash: sha256_source(&receipt_bytes),
        method_version: method_version.to_owned(),
    })
}

fn valid_engine_part(value: &str) -> bool {
    !value.trim().is_empty() && value.len() <= 128 && !value.chars().any(char::is_control)
}

fn is_sha256(value: &str) -> bool {
    value.strip_prefix("sha256:").is_some_and(|digest| {
        digest.len() == 64
            && digest
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    })
}

fn private_use_count(text: &str) -> usize {
    text.chars()
        .filter(|character| {
            matches!(*character as u32, 0xE000..=0xF8FF | 0xF0000..=0xFFFFD | 0x100000..=0x10FFFD)
        })
        .count()
}
