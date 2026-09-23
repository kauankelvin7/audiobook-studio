use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::{
    sha256_source, ContentModel, ContentSourceUnit, NarrationEligibility, NarrativeError,
    NarrativePlan, NarrativeScript, QualityStatus, SemanticOutline, Uncertainty,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReviewStatus {
    Pending,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReviewSource {
    pub source_ref: String,
    pub source_unit_id: String,
    pub analysis_text: Option<String>,
    pub quality_status: QualityStatus,
    pub uncertainty: Uncertainty,
    pub narration_eligibility: NarrationEligibility,
    pub flags: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReviewSegment {
    pub section_id: String,
    pub segment_id: String,
    pub display_text: String,
    pub speech_text: String,
    pub source_refs: Vec<String>,
    pub sources: Vec<ReviewSource>,
    pub review_status: ReviewStatus,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScriptReviewPacket {
    pub schema_version: u32,
    pub plan_id: String,
    pub document_id: String,
    pub source_hash: String,
    pub content_hash: String,
    pub plan_hash: String,
    pub script_hash: String,
    pub segments: Vec<ReviewSegment>,
    pub method_version: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActiveNarrativeIdentity {
    pub schema_version: u32,
    pub plan_id: String,
    pub document_id: String,
    pub source_hash: String,
    pub content_hash: String,
    pub outline_hash: String,
    pub plan_hash: String,
    pub script_hash: String,
    pub identity_hash: String,
    pub method_version: String,
}

pub fn build_active_narrative_identity(
    expected_plan_id: &str,
    script: &NarrativeScript,
    plan: &NarrativePlan,
    content: &ContentModel,
    outline: &SemanticOutline,
) -> Result<ActiveNarrativeIdentity, NarrativeError> {
    let packet = build_script_review_packet(expected_plan_id, script, plan, content, outline)?;
    let outline_bytes = serde_json::to_vec(outline)
        .map_err(|error| NarrativeError::InvalidNarrative(error.to_string()))?;
    let outline_hash = sha256_source(&outline_bytes);
    let method_version = "active-narrative-rust-v1";
    let identity_bytes = serde_json::to_vec(&(
        1u32,
        &packet.plan_id,
        &packet.document_id,
        &packet.source_hash,
        &packet.content_hash,
        &outline_hash,
        &packet.plan_hash,
        &packet.script_hash,
        method_version,
    ))
    .map_err(|error| NarrativeError::InvalidNarrative(error.to_string()))?;
    Ok(ActiveNarrativeIdentity {
        schema_version: 1,
        plan_id: packet.plan_id,
        document_id: packet.document_id,
        source_hash: packet.source_hash,
        content_hash: packet.content_hash,
        outline_hash,
        plan_hash: packet.plan_hash,
        script_hash: packet.script_hash,
        identity_hash: sha256_source(&identity_bytes),
        method_version: method_version.into(),
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReviewVerdict {
    Supported,
    Unsupported,
    NeedsEvidence,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SegmentReviewDecision {
    pub segment_id: String,
    pub verdict: ReviewVerdict,
    pub evidence_source_unit_ids: Vec<String>,
    pub rationale: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScriptReviewSubmission {
    pub schema_version: u32,
    pub plan_id: String,
    pub document_id: String,
    pub source_hash: String,
    pub content_hash: String,
    pub plan_hash: String,
    pub script_hash: String,
    pub decisions: Vec<SegmentReviewDecision>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReviewAttestationStatus {
    Unverified,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScriptReviewReceipt {
    pub schema_version: u32,
    pub plan_id: String,
    pub document_id: String,
    pub source_hash: String,
    pub content_hash: String,
    pub plan_hash: String,
    pub script_hash: String,
    pub submission_hash: String,
    pub reviewed_segments: usize,
    pub attestation_status: ReviewAttestationStatus,
    pub method_version: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActiveReviewStatus {
    NotEstablished,
    BoundUnverified,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActiveReviewEvaluation {
    pub schema_version: u32,
    pub active_identity_hash: String,
    pub submission_hash: String,
    pub binding_hash: String,
    pub status: ActiveReviewStatus,
    pub method_version: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ReviewBindingReference<'a> {
    pub active_identity_hash: &'a str,
    pub stored_binding_hash: Option<&'a str>,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ReviewDecisionError {
    #[error("invalid review JSON: {0}")]
    InvalidJson(String),
    #[error("unsupported review schema version: {0}")]
    UnsupportedSchemaVersion(u32),
    #[error("review submission does not match current document, plan, content or script")]
    StaleSubmission,
    #[error("review context does not match the active narrative identity")]
    InactiveNarrative,
    #[error("saved review binding does not match the active narrative and submission")]
    InvalidBinding,
    #[error("review decisions must cover every script segment exactly once")]
    IncompleteCoverage,
    #[error("duplicate review decision for segment: {0}")]
    DuplicateSegment(String),
    #[error("unknown review segment: {0}")]
    UnknownSegment(String),
    #[error("review rationale is empty for segment: {0}")]
    EmptyRationale(String),
    #[error("duplicate evidence source unit for segment: {0}")]
    DuplicateEvidence(String),
    #[error("unknown evidence source unit for segment: {0}")]
    UnknownEvidence(String),
    #[error("supported review requires source text for segment: {0}")]
    MissingSourceText(String),
    #[error("supported review cannot use blocked source evidence for segment: {0}")]
    BlockedEvidence(String),
    #[error("supported review requires evidence for segment: {0}")]
    MissingEvidence(String),
    #[error(
        "supported review lacks evidence for source reference {source_ref} in segment {segment_id}"
    )]
    MissingReferenceEvidence {
        segment_id: String,
        source_ref: String,
    },
    #[error("could not serialize review submission: {0}")]
    Serialization(String),
    #[error("review packet could not be built: {0}")]
    InvalidPacket(#[from] NarrativeError),
}

impl ScriptReviewSubmission {
    pub fn from_json(input: &str) -> Result<Self, ReviewDecisionError> {
        serde_json::from_str(input)
            .map_err(|error| ReviewDecisionError::InvalidJson(error.to_string()))
    }
}

pub fn evaluate_review_against_active(
    expected_plan_id: &str,
    script: &NarrativeScript,
    plan: &NarrativePlan,
    content: &ContentModel,
    outline: &SemanticOutline,
    submission: &ScriptReviewSubmission,
    binding: ReviewBindingReference<'_>,
) -> Result<ActiveReviewEvaluation, ReviewDecisionError> {
    let active = build_active_narrative_identity(expected_plan_id, script, plan, content, outline)?;
    if active.identity_hash != binding.active_identity_hash {
        return Err(ReviewDecisionError::InactiveNarrative);
    }
    let receipt = validate_script_review_submission(
        expected_plan_id,
        script,
        plan,
        content,
        outline,
        submission,
    )?;
    let method_version = "active-review-evaluation-rust-v1";
    let binding_bytes = serde_json::to_vec(&(
        1u32,
        &active.identity_hash,
        &receipt.submission_hash,
        method_version,
    ))
    .map_err(|error| ReviewDecisionError::Serialization(error.to_string()))?;
    let binding_hash = sha256_source(&binding_bytes);
    if binding
        .stored_binding_hash
        .is_some_and(|saved| saved != binding_hash)
    {
        return Err(ReviewDecisionError::InvalidBinding);
    }
    Ok(ActiveReviewEvaluation {
        schema_version: 1,
        active_identity_hash: active.identity_hash,
        submission_hash: receipt.submission_hash,
        binding_hash,
        status: if binding.stored_binding_hash.is_some() {
            ActiveReviewStatus::BoundUnverified
        } else {
            ActiveReviewStatus::NotEstablished
        },
        method_version: method_version.into(),
    })
}

pub fn validate_script_review_submission(
    expected_plan_id: &str,
    script: &NarrativeScript,
    plan: &NarrativePlan,
    content: &ContentModel,
    outline: &SemanticOutline,
    submission: &ScriptReviewSubmission,
) -> Result<ScriptReviewReceipt, ReviewDecisionError> {
    let packet = build_script_review_packet(expected_plan_id, script, plan, content, outline)?;
    if submission.schema_version != 1 {
        return Err(ReviewDecisionError::UnsupportedSchemaVersion(
            submission.schema_version,
        ));
    }
    if submission.plan_id != packet.plan_id
        || submission.document_id != packet.document_id
        || submission.source_hash != packet.source_hash
        || submission.content_hash != packet.content_hash
        || submission.plan_hash != packet.plan_hash
        || submission.script_hash != packet.script_hash
    {
        return Err(ReviewDecisionError::StaleSubmission);
    }

    let segments: HashMap<&str, &ReviewSegment> = packet
        .segments
        .iter()
        .map(|segment| (segment.segment_id.as_str(), segment))
        .collect();
    let mut reviewed = HashSet::new();
    for decision in &submission.decisions {
        let segment = segments
            .get(decision.segment_id.as_str())
            .ok_or_else(|| ReviewDecisionError::UnknownSegment(decision.segment_id.clone()))?;
        if !reviewed.insert(decision.segment_id.as_str()) {
            return Err(ReviewDecisionError::DuplicateSegment(
                decision.segment_id.clone(),
            ));
        }
        if decision.rationale.trim().is_empty() {
            return Err(ReviewDecisionError::EmptyRationale(
                decision.segment_id.clone(),
            ));
        }
        let mut evidence_ids = HashSet::new();
        for source_unit_id in &decision.evidence_source_unit_ids {
            if !evidence_ids.insert(source_unit_id.as_str()) {
                return Err(ReviewDecisionError::DuplicateEvidence(
                    decision.segment_id.clone(),
                ));
            }
            let source = segment
                .sources
                .iter()
                .find(|source| source.source_unit_id == *source_unit_id)
                .ok_or_else(|| ReviewDecisionError::UnknownEvidence(decision.segment_id.clone()))?;
            if decision.verdict == ReviewVerdict::Supported && source.analysis_text.is_none() {
                return Err(ReviewDecisionError::MissingSourceText(
                    decision.segment_id.clone(),
                ));
            }
            if decision.verdict == ReviewVerdict::Supported
                && (source.quality_status == QualityStatus::Unusable
                    || source.narration_eligibility == NarrationEligibility::Blocked
                    || source.uncertainty == Uncertainty::Unsupported)
            {
                return Err(ReviewDecisionError::BlockedEvidence(
                    decision.segment_id.clone(),
                ));
            }
        }
        if decision.verdict == ReviewVerdict::Supported && evidence_ids.is_empty() {
            return Err(ReviewDecisionError::MissingEvidence(
                decision.segment_id.clone(),
            ));
        }
        if decision.verdict == ReviewVerdict::Supported {
            for source_ref in &segment.source_refs {
                if !segment.sources.iter().any(|source| {
                    source.source_ref == *source_ref
                        && evidence_ids.contains(source.source_unit_id.as_str())
                }) {
                    return Err(ReviewDecisionError::MissingReferenceEvidence {
                        segment_id: decision.segment_id.clone(),
                        source_ref: source_ref.clone(),
                    });
                }
            }
        }
    }
    if reviewed.len() != packet.segments.len() {
        return Err(ReviewDecisionError::IncompleteCoverage);
    }
    let submission_json = serde_json::to_vec(submission)
        .map_err(|error| ReviewDecisionError::Serialization(error.to_string()))?;
    Ok(ScriptReviewReceipt {
        schema_version: 1,
        plan_id: packet.plan_id,
        document_id: packet.document_id,
        source_hash: packet.source_hash,
        content_hash: packet.content_hash,
        plan_hash: packet.plan_hash,
        script_hash: packet.script_hash,
        submission_hash: sha256_source(&submission_json),
        reviewed_segments: reviewed.len(),
        attestation_status: ReviewAttestationStatus::Unverified,
        method_version: "script-review-receipt-rust-v1".into(),
    })
}

pub fn build_script_review_packet(
    expected_plan_id: &str,
    script: &NarrativeScript,
    plan: &NarrativePlan,
    content: &ContentModel,
    outline: &SemanticOutline,
) -> Result<ScriptReviewPacket, NarrativeError> {
    content
        .validate()
        .map_err(|error| NarrativeError::InvalidNarrative(error.to_string()))?;
    script.validate_against(expected_plan_id, plan, content, outline)?;

    let mut units_by_ref: HashMap<&str, Vec<&ContentSourceUnit>> = HashMap::new();
    for unit in &content.source_units {
        let mut seen = HashSet::new();
        for source_ref in &unit.source_refs {
            if seen.insert(source_ref.as_str()) {
                units_by_ref.entry(source_ref).or_default().push(unit);
            }
        }
    }

    let mut segments = Vec::new();
    for section in &script.sections {
        for segment in &section.segments {
            let mut sources = Vec::new();
            for source_ref in &segment.source_refs {
                let units = units_by_ref
                    .get(source_ref.as_str())
                    .ok_or_else(|| NarrativeError::UnknownSourceRef(source_ref.clone()))?;
                for unit in units {
                    sources.push(ReviewSource {
                        source_ref: source_ref.clone(),
                        source_unit_id: unit.id.clone(),
                        analysis_text: unit.analysis_text.clone(),
                        quality_status: unit.quality_status,
                        uncertainty: unit.uncertainty,
                        narration_eligibility: unit.narration_eligibility,
                        flags: unit.flags.clone(),
                    });
                }
            }
            segments.push(ReviewSegment {
                section_id: section.id.clone(),
                segment_id: segment.id.clone(),
                display_text: segment.display_text.clone(),
                speech_text: segment.speech_text.clone(),
                source_refs: segment.source_refs.clone(),
                sources,
                review_status: ReviewStatus::Pending,
            });
        }
    }

    let plan_json = serde_json::to_vec(plan)
        .map_err(|error| NarrativeError::InvalidNarrative(error.to_string()))?;
    let content_json = serde_json::to_vec(content)
        .map_err(|error| NarrativeError::InvalidNarrative(error.to_string()))?;
    let script_json = serde_json::to_vec(script)
        .map_err(|error| NarrativeError::InvalidScript(error.to_string()))?;
    Ok(ScriptReviewPacket {
        schema_version: 1,
        plan_id: expected_plan_id.to_owned(),
        document_id: content.document_id.clone(),
        source_hash: content.source_hash.clone(),
        content_hash: sha256_source(&content_json),
        plan_hash: sha256_source(&plan_json),
        script_hash: sha256_source(&script_json),
        segments,
        method_version: "script-review-packet-rust-v1".into(),
    })
}
