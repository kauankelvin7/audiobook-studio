use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::io::{self, Write};
use thiserror::Error;

use crate::{sha256_source, DocumentIrV2, ExtractionQuality};

const OCR_CANDIDATE_SCHEMA_VERSION: u32 = 1;
pub const PAGE_OCR_TARGET_ID: &str = "__page__";
const MAX_OCR_TEXT_BYTES: usize = 1_000_000;
const MAX_COMPARISON_NATIVE_TEXT_BYTES: usize = 1_000_000;
const MAX_COMPARISON_DOCUMENT_JSON_BYTES: usize = 32_000_000;
const MAX_UNIQUE_TOKENS: usize = 4_096;
const MAX_TOKEN_CHARS: usize = 128;
const MAX_REPORTED_DIFFERENCES: usize = 256;

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
    #[error("OCR comparison input exceeds the size limit")]
    ComparisonInputTooLarge,
    #[error("OCR review submission is invalid or does not match the candidate")]
    InvalidReviewSubmission,
}

struct BoundedJsonWriter(usize);

impl Write for BoundedJsonWriter {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        self.0 = self.0.saturating_add(bytes.len());
        if self.0 > MAX_COMPARISON_DOCUMENT_JSON_BYTES {
            return Err(io::Error::other("OCR document exceeds comparison limit"));
        }
        Ok(bytes.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OcrTokenDifference {
    pub token: String,
    pub native_count: u32,
    pub ocr_count: u32,
    pub contains_digit: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OcrComparisonStatus {
    ReviewRequired,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OcrComparisonReport {
    pub schema_version: u32,
    pub receipt_hash: String,
    pub native_text_hash: String,
    pub ocr_text_hash: String,
    pub native_private_use_count: usize,
    pub ocr_private_use_count: usize,
    pub differing_token_lower_bound: usize,
    pub differences: Vec<OcrTokenDifference>,
    pub truncated: bool,
    pub status: OcrComparisonStatus,
    pub method_version: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OcrReviewDisposition {
    KeepNative,
    RetainCandidateForReview,
    ProposeCorrection,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OcrReviewSubmission {
    pub schema_version: u32,
    pub receipt_hash: String,
    pub disposition: OcrReviewDisposition,
    pub rationale: String,
    pub proposed_text: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OcrReviewStatus {
    Unverified,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OcrReviewReceipt {
    pub schema_version: u32,
    pub document_id: String,
    pub source_hash: String,
    pub page_number: u32,
    pub region_id: String,
    pub candidate_receipt_hash: String,
    pub comparison_hash: String,
    pub disposition: OcrReviewDisposition,
    pub rationale: String,
    pub proposed_text: Option<String>,
    pub status: OcrReviewStatus,
    pub review_hash: String,
    pub method_version: String,
}

pub fn build_ocr_review_receipt(
    document: &DocumentIrV2,
    candidate: &OcrCandidate,
    submission: &OcrReviewSubmission,
) -> Result<OcrReviewReceipt, OcrCandidateError> {
    let comparison = compare_ocr_candidate(document, candidate)?;
    if submission.schema_version != 1
        || submission.receipt_hash != comparison.receipt_hash
        || submission.rationale.trim().is_empty()
        || submission.rationale.len() > 2_000
        || (candidate.region_id == PAGE_OCR_TARGET_ID
            && document
                .pages
                .iter()
                .find(|page| page.number == candidate.page_number)
                .is_some_and(|page| page.regions.is_empty())
            && submission.disposition == OcrReviewDisposition::KeepNative)
        || match submission.disposition {
            OcrReviewDisposition::ProposeCorrection => submission
                .proposed_text
                .as_ref()
                .is_none_or(|text| text.trim().is_empty() || text.len() > MAX_OCR_TEXT_BYTES),
            _ => submission.proposed_text.is_some(),
        }
    {
        return Err(OcrCandidateError::InvalidReviewSubmission);
    }
    let comparison_hash = sha256_source(
        &serde_json::to_vec(&comparison).map_err(|_| OcrCandidateError::Serialization)?,
    );
    let status = OcrReviewStatus::Unverified;
    let method_version = "ocr-review-rust-v1";
    let review_hash = sha256_source(
        &serde_json::to_vec(&(
            submission.schema_version,
            &candidate.document_id,
            &candidate.source_hash,
            candidate.page_number,
            &candidate.region_id,
            &submission.receipt_hash,
            &comparison_hash,
            submission.disposition,
            &submission.rationale,
            &submission.proposed_text,
            status,
            method_version,
        ))
        .map_err(|_| OcrCandidateError::Serialization)?,
    );
    Ok(OcrReviewReceipt {
        schema_version: 1,
        document_id: candidate.document_id.clone(),
        source_hash: candidate.source_hash.clone(),
        page_number: candidate.page_number,
        region_id: candidate.region_id.clone(),
        candidate_receipt_hash: comparison.receipt_hash,
        comparison_hash,
        disposition: submission.disposition,
        rationale: submission.rationale.clone(),
        proposed_text: submission.proposed_text.clone(),
        status,
        review_hash,
        method_version: method_version.to_owned(),
    })
}

fn ascii_token_counts(text: &str) -> (BTreeMap<String, u32>, bool) {
    let mut counts = BTreeMap::new();
    let mut token = String::new();
    let mut truncated = false;
    let finish = |token: &mut String, counts: &mut BTreeMap<String, u32>, truncated: &mut bool| {
        let normalized = token.trim_matches('-');
        if !normalized.is_empty() {
            if normalized.len() > MAX_TOKEN_CHARS
                || (!counts.contains_key(normalized) && counts.len() >= MAX_UNIQUE_TOKENS)
            {
                *truncated = true;
            } else {
                let count = counts.entry(normalized.to_owned()).or_insert(0u32);
                *count = count.saturating_add(1);
            }
        }
        token.clear();
    };
    for character in text.chars() {
        if character.is_ascii_alphanumeric() || character == '-' {
            if token.len() <= MAX_TOKEN_CHARS {
                token.push(character.to_ascii_uppercase());
            } else {
                truncated = true;
            }
        } else {
            finish(&mut token, &mut counts, &mut truncated);
        }
    }
    finish(&mut token, &mut counts, &mut truncated);
    (counts, truncated)
}

pub fn compare_ocr_candidate(
    document: &DocumentIrV2,
    candidate: &OcrCandidate,
) -> Result<OcrComparisonReport, OcrCandidateError> {
    serde_json::to_writer(BoundedJsonWriter(0), document)
        .map_err(|_| OcrCandidateError::ComparisonInputTooLarge)?;
    let native_text = candidate_native_text(document, candidate)?;
    if native_text.len() > MAX_COMPARISON_NATIVE_TEXT_BYTES {
        return Err(OcrCandidateError::ComparisonInputTooLarge);
    }
    let receipt = build_ocr_candidate_receipt(document, candidate)?;
    let (native, native_truncated) = ascii_token_counts(native_text);
    let (ocr, ocr_truncated) = ascii_token_counts(&candidate.text);
    let keys: BTreeSet<&String> = native.keys().chain(ocr.keys()).collect();
    let mut differing_token_lower_bound = 0;
    let mut differences = Vec::new();
    for token in keys {
        let native_count = native.get(token).copied().unwrap_or(0);
        let ocr_count = ocr.get(token).copied().unwrap_or(0);
        if native_count == ocr_count {
            continue;
        }
        differing_token_lower_bound += 1;
        if differences.len() < MAX_REPORTED_DIFFERENCES {
            differences.push(OcrTokenDifference {
                token: token.clone(),
                native_count,
                ocr_count,
                contains_digit: token.bytes().any(|byte| byte.is_ascii_digit()),
            });
        }
    }
    Ok(OcrComparisonReport {
        schema_version: 1,
        receipt_hash: receipt.receipt_hash,
        native_text_hash: receipt.native_text_hash,
        ocr_text_hash: receipt.ocr_text_hash,
        native_private_use_count: receipt.native_private_use_count,
        ocr_private_use_count: receipt.ocr_private_use_count,
        differing_token_lower_bound,
        truncated: native_truncated
            || ocr_truncated
            || differing_token_lower_bound > differences.len(),
        differences,
        status: OcrComparisonStatus::ReviewRequired,
        method_version: "ocr-token-comparison-rust-v1".to_owned(),
    })
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
    let native_text = candidate_native_text(document, candidate)?;
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

fn candidate_native_text<'a>(
    document: &'a DocumentIrV2,
    candidate: &OcrCandidate,
) -> Result<&'a str, OcrCandidateError> {
    let page = document
        .pages
        .iter()
        .find(|page| page.number == candidate.page_number)
        .ok_or(OcrCandidateError::UnknownRegion)?;
    if let Some(region) = page
        .regions
        .iter()
        .find(|region| region.id == candidate.region_id)
    {
        return region
            .sources
            .raw_text
            .as_deref()
            .ok_or(OcrCandidateError::StaleNativeText);
    }
    if candidate.region_id == PAGE_OCR_TARGET_ID {
        if page.extraction_quality != ExtractionQuality::NoText
            || !page.regions.is_empty()
            || !page.raw_text.is_empty()
        {
            return Err(OcrCandidateError::UnknownRegion);
        }
        return Ok(&page.raw_text);
    }
    Err(OcrCandidateError::UnknownRegion)
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
