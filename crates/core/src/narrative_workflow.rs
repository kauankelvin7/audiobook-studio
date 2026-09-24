use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::{
    sha256_source, validate_script_review_submission, ContentModel, DocumentIrV2, NarrationQa,
    NarrativeError, NarrativePlan, NarrativeScript, NarrativeSection, QaStatus, RegionType,
    ReviewVerdict, ScriptReviewReceipt, ScriptReviewSubmission, ScriptSection, ScriptSegment,
    SemanticOutline, SpokenChapter,
};

#[derive(Debug, Error)]
pub enum NarrativeWorkflowError {
    #[error("content or outline is invalid: {0}")]
    Content(String),
    #[error("narrative is invalid: {0}")]
    Narrative(#[from] NarrativeError),
    #[error("script review is invalid: {0}")]
    Review(String),
    #[error("narrative approval does not match the document and script")]
    InvalidApproval,
    #[error("narrative QA contains a critical finding")]
    CriticalQa,
    #[error("narrative speech still matches the literal source")]
    LiteralScript,
    #[error("every source page requires approved narratable content before full audio export")]
    IncompletePageCoverage,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NarrativeDraft {
    pub schema_version: u32,
    pub content_model: ContentModel,
    pub semantic_outline: SemanticOutline,
    pub plan: NarrativePlan,
    pub script: NarrativeScript,
    pub qa: NarrationQa,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LocalNarrativeApproval {
    pub schema_version: u32,
    pub canonical_document_hash: String,
    pub script_hash: String,
    pub submission_hash: String,
    pub revision: u32,
    pub attestation: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ApprovedSpeechUnit {
    pub schema_version: u32,
    pub id: String,
    pub source_refs: Vec<String>,
    pub display_text: String,
    pub speech_text: String,
    pub pronunciation_version: String,
    pub chapter_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ApprovedNarrative {
    pub schema_version: u32,
    pub canonical_document_hash: String,
    pub plan: NarrativePlan,
    pub script: NarrativeScript,
    pub qa: NarrationQa,
    pub review_receipt: ScriptReviewReceipt,
    pub approval: LocalNarrativeApproval,
    pub speech_units: Vec<ApprovedSpeechUnit>,
}

pub fn approve_narrative_script(
    document: &DocumentIrV2,
    script: &NarrativeScript,
    submission: &ScriptReviewSubmission,
    approval: &LocalNarrativeApproval,
) -> Result<ApprovedNarrative, NarrativeWorkflowError> {
    let draft = build_narrative_draft(document)?;
    if document.pages.iter().any(|page| {
        !page.regions.iter().any(|region| {
            draft
                .content_model
                .source_units
                .iter()
                .any(|unit| unit.source_refs.contains(&region.id))
        })
    }) {
        return Err(NarrativeWorkflowError::IncompletePageCoverage);
    }
    let plan_id = &draft.script.plan_id;
    let qa = script.build_qa(
        plan_id,
        &draft.plan,
        &draft.content_model,
        &draft.semantic_outline,
    )?;
    if qa.status == QaStatus::Fail || qa.duplicated_spoken_headings > 0 || qa.unsupported_claims > 0
    {
        return Err(NarrativeWorkflowError::CriticalQa);
    }
    let receipt = validate_script_review_submission(
        plan_id,
        script,
        &draft.plan,
        &draft.content_model,
        &draft.semantic_outline,
        submission,
    )
    .map_err(|error| NarrativeWorkflowError::Review(error.to_string()))?;
    if submission
        .decisions
        .iter()
        .any(|decision| decision.verdict != ReviewVerdict::Supported)
    {
        return Err(NarrativeWorkflowError::Review(
            "all segments require supported evidence".into(),
        ));
    }
    let literal = draft
        .script
        .sections
        .iter()
        .flat_map(|section| &section.segments)
        .map(|segment| segment.speech_text.as_str())
        .collect::<Vec<_>>();
    let spoken = script
        .sections
        .iter()
        .flat_map(|section| &section.segments)
        .map(|segment| segment.speech_text.as_str())
        .collect::<Vec<_>>();
    let normalize = |text: &str| {
        text.chars()
            .filter(|character| character.is_alphanumeric())
            .flat_map(char::to_lowercase)
            .collect::<String>()
    };
    if literal.len() != spoken.len()
        || literal
            .iter()
            .zip(&spoken)
            .any(|(source, narration)| normalize(source) == normalize(narration))
    {
        return Err(NarrativeWorkflowError::LiteralScript);
    }
    let canonical_document_hash = sha256_source(
        document
            .to_json()
            .map_err(|error| NarrativeWorkflowError::Content(error.to_string()))?
            .as_bytes(),
    );
    let packet = crate::build_script_review_packet(
        plan_id,
        script,
        &draft.plan,
        &draft.content_model,
        &draft.semantic_outline,
    )?;
    if approval.schema_version != 1
        || approval.revision == 0
        || approval.attestation != "local_operator_confirmed"
        || approval.canonical_document_hash != canonical_document_hash
        || approval.script_hash != packet.script_hash
        || approval.submission_hash != receipt.submission_hash
    {
        return Err(NarrativeWorkflowError::InvalidApproval);
    }
    let speech_units = script
        .sections
        .iter()
        .zip(&draft.plan.sections)
        .flat_map(|(section, planned)| {
            section
                .segments
                .iter()
                .map(move |segment| ApprovedSpeechUnit {
                    schema_version: 1,
                    id: segment.id.clone(),
                    source_refs: segment.source_refs.clone(),
                    display_text: segment.display_text.clone(),
                    speech_text: segment.speech_text.clone(),
                    pronunciation_version: "default-v1".into(),
                    chapter_id: planned.spoken_chapter_id.clone(),
                })
        })
        .collect();
    Ok(ApprovedNarrative {
        schema_version: 1,
        canonical_document_hash,
        plan: draft.plan,
        script: script.clone(),
        qa,
        review_receipt: receipt,
        approval: approval.clone(),
        speech_units,
    })
}

pub fn build_narrative_draft(
    document: &DocumentIrV2,
) -> Result<NarrativeDraft, NarrativeWorkflowError> {
    let content_model = ContentModel::from_permitted_document(document)
        .map_err(|error| NarrativeWorkflowError::Content(error.to_string()))?;
    let semantic_outline = SemanticOutline::skeleton(&content_model)
        .map_err(|error| NarrativeWorkflowError::Content(error.to_string()))?;
    let mut sections = Vec::new();
    let mut chapters = Vec::new();
    let mut script_sections = Vec::new();
    for (index, unit) in content_model.source_units.iter().enumerate() {
        let number = index + 1;
        let section_id = format!("narrative_section_{number}");
        let chapter_id = format!("narrative_chapter_{number}");
        let text = unit
            .analysis_text
            .as_ref()
            .ok_or_else(|| NarrativeWorkflowError::Content("approved source has no text".into()))?;
        sections.push(NarrativeSection {
            id: section_id.clone(),
            source_refs: unit.source_refs.clone(),
            concept_ids: Vec::new(),
            heading: None,
            transition: None,
            spoken_chapter_id: chapter_id.clone(),
            estimated_seconds: None,
        });
        chapters.push(SpokenChapter {
            id: chapter_id,
            section_ids: vec![section_id.clone()],
            display_title: if unit.region_type == RegionType::Heading {
                text.clone()
            } else {
                format!("Parte {number}")
            },
        });
        script_sections.push(ScriptSection {
            id: section_id,
            segments: vec![ScriptSegment {
                id: format!("narrative_segment_{number}"),
                display_text: text.clone(),
                speech_text: text.clone(),
                source_refs: unit.source_refs.clone(),
            }],
        });
    }
    let plan = NarrativePlan {
        schema_version: 1,
        document_id: document.document_id.clone(),
        sections,
        spoken_chapters: chapters,
    };
    plan.validate_against(&content_model, &semantic_outline)?;
    let script = NarrativeScript {
        schema_version: 1,
        plan_id: "plan_local_1".into(),
        document_id: document.document_id.clone(),
        sections: script_sections,
    };
    let qa = script.build_qa(&script.plan_id, &plan, &content_model, &semantic_outline)?;
    Ok(NarrativeDraft {
        schema_version: 1,
        content_model,
        semantic_outline,
        plan,
        script,
        qa,
    })
}
