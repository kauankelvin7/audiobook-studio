use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::{
    build_ocr_candidate_receipt, build_ocr_review_receipt, sha256_source, DocumentIrV2,
    DocumentRegionV2, ExtractionQuality, OcrCandidate, OcrReviewDisposition, OcrReviewSubmission,
    QualityStatus, RegionContent, RegionType, SourceLayers, Uncertainty, PAGE_OCR_TARGET_ID,
};

#[derive(Debug, Error, PartialEq, Eq)]
pub enum CanonicalError {
    #[error("OCR review is stale or invalid: {0}")]
    InvalidReview(String),
    #[error("OCR approval does not match the active review or document")]
    InvalidApproval,
    #[error("OCR review has no approved replacement text")]
    NoApprovedText,
    #[error("canonical document is invalid: {0}")]
    InvalidDocument(String),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OcrLocalApproval {
    pub schema_version: u32,
    pub document_hash: String,
    pub review_hash: String,
    pub approved_text_hash: String,
    pub revision: u32,
    pub attestation: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CanonicalOcrPromotion {
    pub schema_version: u32,
    pub source_document_hash: String,
    pub canonical_document_hash: String,
    pub review_hash: String,
    pub approved_text_hash: String,
    pub revision: u32,
    pub attestation: String,
    pub page_number: u32,
    pub region_id: String,
    pub document: DocumentIrV2,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LocalNativeApproval {
    pub schema_version: u32,
    pub document_hash: String,
    pub revision: u32,
    pub attestation: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CanonicalNativePromotion {
    pub schema_version: u32,
    pub source_document_hash: String,
    pub canonical_document_hash: String,
    pub review_hash: String,
    pub approved_text_hash: String,
    pub revision: u32,
    pub attestation: String,
    pub document: DocumentIrV2,
}

pub fn approve_native_document(
    source: &DocumentIrV2,
    approval: &LocalNativeApproval,
) -> Result<CanonicalNativePromotion, CanonicalError> {
    let source_json = source
        .to_json()
        .map_err(|error| CanonicalError::InvalidDocument(error.to_string()))?;
    let source_document_hash = sha256_source(source_json.as_bytes());
    if approval.schema_version != 1
        || approval.revision == 0
        || approval.attestation != "local_operator_confirmed"
        || approval.document_hash != source_document_hash
    {
        return Err(CanonicalError::InvalidApproval);
    }
    let mut document = source.clone();
    let mut approved_text = Vec::new();
    for page in &mut document.pages {
        if page.extraction_quality != ExtractionQuality::Good || page.regions.is_empty() {
            return Err(CanonicalError::NoApprovedText);
        }
        for region in &mut page.regions {
            let native = region
                .sources
                .raw_text
                .as_deref()
                .ok_or(CanonicalError::NoApprovedText)?;
            if native.trim().is_empty()
                || native.chars().any(|ch| {
                    matches!(ch as u32,
                0xE000..=0xF8FF | 0xF0000..=0xFFFFD | 0x100000..=0x10FFFD)
                })
            {
                return Err(CanonicalError::NoApprovedText);
            }
            let content = match region.content {
                RegionContent::Text { .. } | RegionContent::LegacyText { .. } => {
                    RegionContent::Text {
                        display_text: native.to_owned(),
                    }
                }
                _ => return Err(CanonicalError::NoApprovedText),
            };
            approved_text.extend_from_slice(native.as_bytes());
            approved_text.push(0);
            region.content = content;
            region.uncertainty = Uncertainty::SourceConfirmed;
            region.quality_status = QualityStatus::Accepted;
            region.flags.push("native_text_locally_reviewed".into());
        }
    }
    let approved_text_hash = sha256_source(&approved_text);
    let review_hash = sha256_source(
        &serde_json::to_vec(&(
            &source_document_hash,
            &approved_text_hash,
            approval.revision,
            &approval.attestation,
        ))
        .map_err(|error| CanonicalError::InvalidDocument(error.to_string()))?,
    );
    let canonical_json = document
        .to_json()
        .map_err(|error| CanonicalError::InvalidDocument(error.to_string()))?;
    Ok(CanonicalNativePromotion {
        schema_version: 1,
        source_document_hash,
        canonical_document_hash: sha256_source(canonical_json.as_bytes()),
        review_hash,
        approved_text_hash,
        revision: approval.revision,
        attestation: approval.attestation.clone(),
        document,
    })
}

pub fn promote_approved_ocr(
    source: &DocumentIrV2,
    candidate: &OcrCandidate,
    submission: &OcrReviewSubmission,
    approval: &OcrLocalApproval,
) -> Result<CanonicalOcrPromotion, CanonicalError> {
    let candidate_receipt = build_ocr_candidate_receipt(source, candidate)
        .map_err(|error| CanonicalError::InvalidReview(error.to_string()))?;
    let review = build_ocr_review_receipt(source, candidate, submission)
        .map_err(|error| CanonicalError::InvalidReview(error.to_string()))?;
    let source_document_hash = candidate_receipt.document_hash;
    let text = match submission.disposition {
        OcrReviewDisposition::ProposeCorrection => submission
            .proposed_text
            .as_deref()
            .ok_or(CanonicalError::NoApprovedText)?,
        OcrReviewDisposition::KeepNative => return Err(CanonicalError::NoApprovedText),
        OcrReviewDisposition::RetainCandidateForReview => {
            return Err(CanonicalError::NoApprovedText)
        }
    };
    let approved_text_hash = sha256_source(text.as_bytes());
    if approval.schema_version != 1
        || approval.revision == 0
        || approval.attestation != "local_operator_confirmed"
        || approval.document_hash != source_document_hash
        || approval.review_hash != review.review_hash
        || approval.approved_text_hash != approved_text_hash
    {
        return Err(CanonicalError::InvalidApproval);
    }
    let mut document = source.clone();
    let page = document
        .pages
        .iter_mut()
        .find(|page| page.number == candidate.page_number)
        .ok_or(CanonicalError::InvalidApproval)?;
    page.ocr_text = Some(candidate.text.clone());
    page.reconstructed_text = Some(text.to_owned());
    if candidate.region_id == PAGE_OCR_TARGET_ID && page.regions.is_empty() {
        page.extraction_quality = ExtractionQuality::Partial;
        page.regions.push(DocumentRegionV2 {
            id: format!("ocr_page_{}", candidate.page_number),
            kind: RegionType::Paragraph,
            bbox: None,
            language: document.language.clone(),
            sources: SourceLayers {
                raw_text: None,
                ocr_text: Some(candidate.text.clone()),
                reconstructed_text: Some(text.to_owned()),
            },
            content: RegionContent::Text {
                display_text: text.to_owned(),
            },
            uncertainty: Uncertainty::OcrConfirmed,
            quality_status: QualityStatus::Reconciled,
            confidence: None,
            flags: vec![format!("ocr_review:{}", review.review_hash)],
        });
    } else {
        let region = page
            .regions
            .iter_mut()
            .find(|region| region.id == candidate.region_id)
            .ok_or(CanonicalError::InvalidApproval)?;
        let content = match &region.content {
            RegionContent::Text { .. } | RegionContent::LegacyText { .. } => RegionContent::Text {
                display_text: text.to_owned(),
            },
            RegionContent::Code {
                detected_language, ..
            } => RegionContent::Code {
                source_text: text.to_owned(),
                detected_language: detected_language.clone(),
                suspicious_tokens: Vec::new(),
            },
            _ => return Err(CanonicalError::InvalidApproval),
        };
        region.sources.ocr_text = Some(candidate.text.clone());
        region.sources.reconstructed_text = Some(text.to_owned());
        region.content = content;
        region.uncertainty = Uncertainty::OcrConfirmed;
        region.quality_status = QualityStatus::Reconciled;
        region
            .flags
            .push(format!("ocr_review:{}", review.review_hash));
    }
    let approved_region_id = if candidate.region_id == PAGE_OCR_TARGET_ID {
        format!("ocr_page_{}", candidate.page_number)
    } else {
        candidate.region_id.clone()
    };
    for page in &mut document.pages {
        for region in &mut page.regions {
            if region.id != approved_region_id {
                if region.quality_status != QualityStatus::Unusable {
                    region.quality_status = QualityStatus::ReviewRequired;
                }
                region.flags.push("not_approved_in_ocr_promotion".into());
            }
        }
    }
    let canonical_json = document
        .to_json()
        .map_err(|error| CanonicalError::InvalidDocument(error.to_string()))?;
    Ok(CanonicalOcrPromotion {
        schema_version: 1,
        source_document_hash,
        canonical_document_hash: sha256_source(canonical_json.as_bytes()),
        review_hash: review.review_hash,
        approved_text_hash,
        revision: approval.revision,
        attestation: approval.attestation.clone(),
        page_number: candidate.page_number,
        region_id: candidate.region_id.clone(),
        document,
    })
}
