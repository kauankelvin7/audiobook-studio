use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

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
