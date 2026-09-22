use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::document_v2::{DocumentIrV2, QualityStatus, RegionContent, RegionType, Uncertainty};

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ContentError {
    #[error("unsupported content schema version: {0}")]
    UnsupportedSchemaVersion(u32),
    #[error("invalid content model: {0}")]
    InvalidContent(String),
    #[error("content model has no source units")]
    EmptyContentModel,
    #[error("duplicate source unit ID: {0}")]
    DuplicateSourceUnit(String),
    #[error("duplicate concept ID: {0}")]
    DuplicateConcept(String),
    #[error("relation references unknown concept: {0}")]
    UnknownConcept(String),
    #[error("duplicate outline section ID: {0}")]
    DuplicateOutlineSection(String),
    #[error("source unit belongs to multiple outline sections: {0}")]
    DuplicateOutlineOwnership(String),
    #[error("outline section contains invalid unit membership: {0}")]
    InvalidOutlineMembership(String),
    #[error("serialization failed: {0}")]
    Serialization(String),
    #[error("invalid content JSON: {0}")]
    InvalidJson(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NarrationEligibility {
    Eligible,
    ReviewRequired,
    Blocked,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ContentSourceUnit {
    pub id: String,
    pub source_refs: Vec<String>,
    pub region_type: RegionType,
    pub language: Option<String>,
    pub analysis_text: Option<String>,
    pub structured_source: bool,
    pub uncertainty: Uncertainty,
    pub quality_status: QualityStatus,
    pub narration_eligibility: NarrationEligibility,
    pub flags: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ContentConcept {
    pub id: String,
    pub label: String,
    pub source_refs: Vec<String>,
    pub definition_source_refs: Vec<String>,
    pub prerequisite_concept_ids: Vec<String>,
    pub importance: Option<ConceptImportance>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConceptImportance {
    Supporting,
    Core,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ContentRelation {
    pub id: String,
    pub from_concept_id: String,
    pub to_concept_id: String,
    pub relation: RelationType,
    pub source_refs: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RelationType {
    Prerequisite,
    Contains,
    Contrasts,
    Extends,
    ExampleOf,
    Related,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ContentModel {
    pub schema_version: u32,
    pub document_id: String,
    pub source_hash: String,
    pub language: Option<String>,
    pub source_units: Vec<ContentSourceUnit>,
    pub concepts: Vec<ContentConcept>,
    pub relations: Vec<ContentRelation>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SemanticOutlineSection {
    pub id: String,
    pub heading_unit_id: Option<String>,
    pub topic_label: Option<String>,
    pub source_unit_ids: Vec<String>,
    pub candidate_narration_unit_ids: Vec<String>,
    pub concept_ids: Vec<String>,
    pub requires_review: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SemanticOutline {
    pub schema_version: u32,
    pub document_id: String,
    pub sections: Vec<SemanticOutlineSection>,
}

impl ContentModel {
    pub fn from_document(document: &DocumentIrV2) -> Result<Self, ContentError> {
        let source_units = document
            .pages
            .iter()
            .flat_map(|page| page.regions.iter())
            .map(|region| ContentSourceUnit {
                id: format!("unit_{}", region.id),
                source_refs: vec![region.id.clone()],
                region_type: region.kind,
                language: region.language.clone(),
                analysis_text: analysis_text(&region.content),
                structured_source: matches!(
                    &region.content,
                    RegionContent::Code { .. }
                        | RegionContent::Table { .. }
                        | RegionContent::Formula { .. }
                        | RegionContent::Visual { .. }
                ),
                uncertainty: region.uncertainty,
                quality_status: region.quality_status,
                narration_eligibility: narration_eligibility(
                    region.uncertainty,
                    region.quality_status,
                ),
                flags: region.flags.clone(),
            })
            .collect();

        let model = Self {
            schema_version: 1,
            document_id: document.document_id.clone(),
            source_hash: document.source_hash.clone(),
            language: document.language.clone(),
            source_units,
            concepts: Vec::new(),
            relations: Vec::new(),
        };
        model.validate()?;
        Ok(model)
    }

    pub fn validate(&self) -> Result<(), ContentError> {
        if self.schema_version != 1 {
            return Err(ContentError::UnsupportedSchemaVersion(self.schema_version));
        }
        if self.document_id.trim().is_empty() || !is_sha256(&self.source_hash) {
            return Err(ContentError::InvalidContent(
                "invalid document identity".into(),
            ));
        }

        let mut source_ids = HashSet::new();
        for unit in &self.source_units {
            if unit.id.trim().is_empty()
                || unit.source_refs.is_empty()
                || unit.source_refs.iter().any(|value| value.trim().is_empty())
            {
                return Err(ContentError::InvalidContent("invalid source unit".into()));
            }
            if !source_ids.insert(unit.id.as_str()) {
                return Err(ContentError::DuplicateSourceUnit(unit.id.clone()));
            }
        }

        let mut concept_ids = HashSet::new();
        for concept in &self.concepts {
            if concept.id.trim().is_empty()
                || concept.label.trim().is_empty()
                || concept.source_refs.is_empty()
                || concept
                    .source_refs
                    .iter()
                    .any(|value| value.trim().is_empty())
            {
                return Err(ContentError::InvalidContent("invalid concept".into()));
            }
            if !concept_ids.insert(concept.id.as_str()) {
                return Err(ContentError::DuplicateConcept(concept.id.clone()));
            }
        }
        for relation in &self.relations {
            if relation.id.trim().is_empty()
                || relation.source_refs.is_empty()
                || relation
                    .source_refs
                    .iter()
                    .any(|value| value.trim().is_empty())
            {
                return Err(ContentError::InvalidContent("invalid relation".into()));
            }
            if !concept_ids.contains(relation.from_concept_id.as_str()) {
                return Err(ContentError::UnknownConcept(
                    relation.from_concept_id.clone(),
                ));
            }
            if !concept_ids.contains(relation.to_concept_id.as_str()) {
                return Err(ContentError::UnknownConcept(relation.to_concept_id.clone()));
            }
        }
        Ok(())
    }

    pub fn to_json(&self) -> Result<String, ContentError> {
        self.validate()?;
        serde_json::to_string(self).map_err(|error| ContentError::Serialization(error.to_string()))
    }

    pub fn from_json(input: &str) -> Result<Self, ContentError> {
        let model: Self = serde_json::from_str(input)
            .map_err(|error| ContentError::InvalidJson(error.to_string()))?;
        model.validate()?;
        Ok(model)
    }
}

impl SemanticOutline {
    pub fn from_json(input: &str, model: &ContentModel) -> Result<Self, ContentError> {
        let outline: Self = serde_json::from_str(input)
            .map_err(|error| ContentError::InvalidJson(error.to_string()))?;
        outline.validate(model)?;
        Ok(outline)
    }

    pub fn skeleton(model: &ContentModel) -> Result<Self, ContentError> {
        model.validate()?;
        if model.source_units.is_empty() {
            return Err(ContentError::EmptyContentModel);
        }

        let mut sections = Vec::<SemanticOutlineSection>::new();

        for unit in &model.source_units {
            if unit.region_type == RegionType::Heading {
                sections.push(new_section(sections.len() + 1, Some(unit)));
                continue;
            }

            if sections.is_empty() {
                sections.push(new_section(1, None));
            }

            let current = sections.last_mut().ok_or(ContentError::EmptyContentModel)?;
            current.source_unit_ids.push(unit.id.clone());
            if unit.narration_eligibility != NarrationEligibility::Blocked {
                current.candidate_narration_unit_ids.push(unit.id.clone());
            }
            if unit.narration_eligibility != NarrationEligibility::Eligible {
                current.requires_review = true;
            }
        }

        let outline = Self {
            schema_version: 1,
            document_id: model.document_id.clone(),
            sections,
        };
        outline.validate(model)?;
        Ok(outline)
    }

    pub fn validate(&self, model: &ContentModel) -> Result<(), ContentError> {
        if self.schema_version != 1 {
            return Err(ContentError::UnsupportedSchemaVersion(self.schema_version));
        }
        if self.document_id != model.document_id || self.sections.is_empty() {
            return Err(ContentError::InvalidContent(
                "invalid semantic outline identity".into(),
            ));
        }

        let source_ids: HashSet<&str> = model
            .source_units
            .iter()
            .map(|unit| unit.id.as_str())
            .collect();
        let concept_ids: HashSet<&str> = model
            .concepts
            .iter()
            .map(|concept| concept.id.as_str())
            .collect();
        let mut section_ids = HashSet::new();
        let mut ownership = HashSet::new();

        for section in &self.sections {
            if section.id.trim().is_empty() || section.source_unit_ids.is_empty() {
                return Err(ContentError::InvalidOutlineMembership(section.id.clone()));
            }
            if !section_ids.insert(section.id.as_str()) {
                return Err(ContentError::DuplicateOutlineSection(section.id.clone()));
            }
            let section_source_ids: HashSet<&str> =
                section.source_unit_ids.iter().map(String::as_str).collect();
            let candidate_ids: HashSet<&str> = section
                .candidate_narration_unit_ids
                .iter()
                .map(String::as_str)
                .collect();
            if section_source_ids.len() != section.source_unit_ids.len()
                || candidate_ids.len() != section.candidate_narration_unit_ids.len()
            {
                return Err(ContentError::InvalidOutlineMembership(section.id.clone()));
            }
            if let Some(heading) = section.heading_unit_id.as_deref() {
                if !section_source_ids.contains(heading) {
                    return Err(ContentError::InvalidOutlineMembership(section.id.clone()));
                }
            }
            for unit_id in &section.source_unit_ids {
                if !source_ids.contains(unit_id.as_str()) {
                    return Err(ContentError::InvalidOutlineMembership(unit_id.clone()));
                }
                if !ownership.insert(unit_id.as_str()) {
                    return Err(ContentError::DuplicateOutlineOwnership(unit_id.clone()));
                }
            }
            for candidate in &section.candidate_narration_unit_ids {
                if !section_source_ids.contains(candidate.as_str()) {
                    return Err(ContentError::InvalidOutlineMembership(candidate.clone()));
                }
            }
            for concept in &section.concept_ids {
                if !concept_ids.contains(concept.as_str()) {
                    return Err(ContentError::UnknownConcept(concept.clone()));
                }
            }
        }
        Ok(())
    }

    pub fn to_json(&self, model: &ContentModel) -> Result<String, ContentError> {
        self.validate(model)?;
        serde_json::to_string(self).map_err(|error| ContentError::Serialization(error.to_string()))
    }
}

fn narration_eligibility(
    uncertainty: Uncertainty,
    quality_status: QualityStatus,
) -> NarrationEligibility {
    if uncertainty == Uncertainty::Unsupported || quality_status == QualityStatus::Unusable {
        return NarrationEligibility::Blocked;
    }
    if quality_status == QualityStatus::ReviewRequired
        || matches!(
            uncertainty,
            Uncertainty::Uncertain | Uncertainty::Inferred | Uncertainty::Reconstructed
        )
    {
        return NarrationEligibility::ReviewRequired;
    }
    NarrationEligibility::Eligible
}

fn analysis_text(content: &RegionContent) -> Option<String> {
    let text = match content {
        RegionContent::Text { display_text } => display_text.clone(),
        RegionContent::Code { source_text, .. } => source_text.clone(),
        RegionContent::Formula {
            display_representation,
            ..
        } => display_representation.clone(),
        RegionContent::Visual { description, .. } => description.clone().unwrap_or_default(),
        RegionContent::LegacyText { text, .. } => text.clone(),
        RegionContent::Table { headers, rows } => headers
            .iter()
            .chain(rows.iter().flatten())
            .map(String::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .collect::<Vec<_>>()
            .join(" | "),
    };
    let trimmed = text.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_owned())
}

fn new_section(index: usize, heading: Option<&ContentSourceUnit>) -> SemanticOutlineSection {
    let heading_id = heading.map(|unit| unit.id.clone());
    let source_unit_ids = heading_id.clone().into_iter().collect::<Vec<_>>();
    let candidate_narration_unit_ids = heading
        .filter(|unit| unit.narration_eligibility != NarrationEligibility::Blocked)
        .map(|unit| vec![unit.id.clone()])
        .unwrap_or_default();

    SemanticOutlineSection {
        id: format!("outline_section_{index}"),
        heading_unit_id: heading_id,
        topic_label: heading.and_then(|unit| unit.analysis_text.clone()),
        source_unit_ids,
        candidate_narration_unit_ids,
        concept_ids: Vec::new(),
        requires_review: heading
            .is_some_and(|unit| unit.narration_eligibility != NarrationEligibility::Eligible),
    }
}

fn is_sha256(value: &str) -> bool {
    value.strip_prefix("sha256:").is_some_and(|digest| {
        digest.len() == 64
            && digest
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    })
}
