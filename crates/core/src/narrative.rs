use std::collections::{BTreeMap, BTreeSet, HashSet};

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::content::{ContentModel, SemanticOutline};

#[derive(Debug, Error, PartialEq, Eq)]
pub enum NarrativeError {
    #[error("invalid narrative JSON: {0}")]
    InvalidJson(String),
    #[error("unsupported narrative schema version: {0}")]
    UnsupportedSchemaVersion(u32),
    #[error("invalid narrative data: {0}")]
    InvalidNarrative(String),
    #[error("duplicate narrative section ID: {0}")]
    DuplicateSection(String),
    #[error("duplicate spoken chapter ID: {0}")]
    DuplicateChapter(String),
    #[error("invalid section/chapter mapping: {0}")]
    InvalidChapterMapping(String),
    #[error("planner returned unknown source reference: {0}")]
    UnknownSourceRef(String),
    #[error("planner returned unknown concept: {0}")]
    UnknownConcept(String),
    #[error("content model and outline belong to different documents")]
    DocumentMismatch,
    #[error("outline references unknown source unit: {0}")]
    UnknownSourceUnit(String),
    #[error("invalid minimum occurrence count")]
    InvalidMinimumOccurrences,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SpokenHeadingPolicy {
    Announce,
    Integrate,
    Silent,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NarrativeHeading {
    pub display_text: String,
    pub policy: SpokenHeadingPolicy,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NarrativeTransition {
    pub text: String,
    pub relation: String,
    pub source_refs: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NarrativeSection {
    pub id: String,
    pub source_refs: Vec<String>,
    pub concept_ids: Vec<String>,
    pub heading: Option<NarrativeHeading>,
    pub transition: Option<NarrativeTransition>,
    pub spoken_chapter_id: String,
    pub estimated_seconds: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpokenChapter {
    pub id: String,
    pub section_ids: Vec<String>,
    pub display_title: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NarrativePlan {
    pub schema_version: u32,
    pub document_id: String,
    pub sections: Vec<NarrativeSection>,
    pub spoken_chapters: Vec<SpokenChapter>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NarrativeMemory {
    pub schema_version: u32,
    pub concepts_covered: Vec<String>,
    pub terms_defined: Vec<String>,
    pub open_threads: Vec<String>,
    pub current_goal: Option<String>,
    pub next_concepts: Vec<String>,
    pub source_refs: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct NarrativeMemoryDelta {
    pub concepts_covered: Vec<String>,
    pub terms_defined: Vec<String>,
    pub open_threads: Vec<String>,
    pub resolved_threads: Vec<String>,
    pub current_goal: Option<Option<String>>,
    pub next_concepts: Option<Vec<String>>,
    pub source_refs: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QaStatus {
    Pass,
    Review,
    Fail,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NarrationWarning {
    pub code: String,
    pub section_id: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NarrationQa {
    pub schema_version: u32,
    pub plan_id: String,
    pub status: QaStatus,
    pub document_sections: usize,
    pub narrative_sections: usize,
    pub spoken_chapters: usize,
    pub duplicated_spoken_headings: usize,
    pub unsupported_claims: usize,
    pub warnings: Vec<NarrationWarning>,
    pub method_version: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HeadingOverlapStatus {
    Duplicate,
    Review,
    Distinct,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HeadingOverlapMethod {
    Exact,
    Prefix,
    TokenOverlap,
    None,
}

#[derive(Debug, Clone, PartialEq)]
pub struct HeadingOverlap {
    pub status: HeadingOverlapStatus,
    pub method: HeadingOverlapMethod,
    pub score: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct HeadingFinding {
    pub section_id: String,
    pub heading: String,
    pub overlap: HeadingOverlap,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FormulaicFinding {
    pub opener: String,
    pub count: usize,
    pub section_indexes: Vec<usize>,
}

const FORMULAIC_OPENERS: [&str; 5] = [
    "agora vamos entender",
    "e importante entender",
    "o ponto importante aqui e",
    "em outras palavras",
    "agora que vimos",
];

const STOP_WORDS: [&str; 20] = [
    "a", "as", "o", "os", "um", "uma", "de", "da", "das", "do", "dos", "e", "em", "para", "por",
    "que", "como", "no", "na", "nos",
];

impl NarrativePlan {
    pub fn validate(&self) -> Result<(), NarrativeError> {
        if self.schema_version != 1 {
            return Err(NarrativeError::UnsupportedSchemaVersion(
                self.schema_version,
            ));
        }
        if self.document_id.trim().is_empty()
            || self.sections.is_empty()
            || self.spoken_chapters.is_empty()
        {
            return Err(NarrativeError::InvalidNarrative(
                "missing narrative identity or sections".into(),
            ));
        }

        let mut sections = HashSet::new();
        for section in &self.sections {
            if section.id.trim().is_empty()
                || section.source_refs.is_empty()
                || section
                    .source_refs
                    .iter()
                    .any(|value| value.trim().is_empty())
                || section.spoken_chapter_id.trim().is_empty()
                || section
                    .estimated_seconds
                    .is_some_and(|value| !value.is_finite() || value <= 0.0)
            {
                return Err(NarrativeError::InvalidNarrative(section.id.clone()));
            }
            if let Some(heading) = &section.heading {
                if heading.display_text.trim().is_empty() || heading.reason.trim().is_empty() {
                    return Err(NarrativeError::InvalidNarrative(section.id.clone()));
                }
            }
            if let Some(transition) = &section.transition {
                if transition.text.trim().is_empty()
                    || transition.relation.trim().is_empty()
                    || transition.source_refs.is_empty()
                    || transition
                        .source_refs
                        .iter()
                        .any(|value| value.trim().is_empty())
                {
                    return Err(NarrativeError::InvalidNarrative(section.id.clone()));
                }
            }
            if !sections.insert(section.id.as_str()) {
                return Err(NarrativeError::DuplicateSection(section.id.clone()));
            }
        }

        let mut chapters = HashSet::new();
        for chapter in &self.spoken_chapters {
            if chapter.id.trim().is_empty()
                || chapter.display_title.trim().is_empty()
                || chapter.section_ids.is_empty()
            {
                return Err(NarrativeError::InvalidNarrative(chapter.id.clone()));
            }
            if !chapters.insert(chapter.id.as_str()) {
                return Err(NarrativeError::DuplicateChapter(chapter.id.clone()));
            }
        }

        let mut ownership = HashSet::new();
        for chapter in &self.spoken_chapters {
            for section_id in &chapter.section_ids {
                let Some(section) = self
                    .sections
                    .iter()
                    .find(|section| section.id == *section_id)
                else {
                    return Err(NarrativeError::InvalidChapterMapping(section_id.clone()));
                };
                if section.spoken_chapter_id != chapter.id || !ownership.insert(section_id.as_str())
                {
                    return Err(NarrativeError::InvalidChapterMapping(section_id.clone()));
                }
            }
        }

        if ownership.len() != self.sections.len()
            || self
                .sections
                .iter()
                .any(|section| !chapters.contains(section.spoken_chapter_id.as_str()))
        {
            return Err(NarrativeError::InvalidChapterMapping(
                "unassigned narrative section".into(),
            ));
        }

        Ok(())
    }

    pub fn from_json(input: &str) -> Result<Self, NarrativeError> {
        let plan: Self = serde_json::from_str(input)
            .map_err(|error| NarrativeError::InvalidJson(error.to_string()))?;
        plan.validate()?;
        Ok(plan)
    }

    pub fn validate_against(
        &self,
        content: &ContentModel,
        outline: &SemanticOutline,
    ) -> Result<(), NarrativeError> {
        self.validate()?;
        if self.document_id != content.document_id || outline.document_id != content.document_id {
            return Err(NarrativeError::DocumentMismatch);
        }
        outline
            .validate(content)
            .map_err(|error| NarrativeError::InvalidNarrative(error.to_string()))?;

        let source_units: HashSet<&str> = content
            .source_units
            .iter()
            .map(|unit| unit.id.as_str())
            .collect();
        let source_refs: HashSet<&str> = content
            .source_units
            .iter()
            .flat_map(|unit| unit.source_refs.iter().map(String::as_str))
            .collect();
        let concepts: HashSet<&str> = content
            .concepts
            .iter()
            .map(|concept| concept.id.as_str())
            .collect();

        for section in &outline.sections {
            for unit_id in &section.source_unit_ids {
                if !source_units.contains(unit_id.as_str()) {
                    return Err(NarrativeError::UnknownSourceUnit(unit_id.clone()));
                }
            }
            for concept_id in &section.concept_ids {
                if !concepts.contains(concept_id.as_str()) {
                    return Err(NarrativeError::UnknownConcept(concept_id.clone()));
                }
            }
        }

        for section in &self.sections {
            for source_ref in section.source_refs.iter().chain(
                section
                    .transition
                    .iter()
                    .flat_map(|transition| transition.source_refs.iter()),
            ) {
                if !source_refs.contains(source_ref.as_str()) {
                    return Err(NarrativeError::UnknownSourceRef(source_ref.clone()));
                }
            }
            for concept_id in &section.concept_ids {
                if !concepts.contains(concept_id.as_str()) {
                    return Err(NarrativeError::UnknownConcept(concept_id.clone()));
                }
            }
        }
        Ok(())
    }
}

pub fn normalize_narrative_text(input: &str) -> String {
    input
        .chars()
        .flat_map(char::to_lowercase)
        .map(fold_latin_char)
        .map(|ch| if ch.is_alphanumeric() { ch } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn compare_heading_to_body(heading: &str, body: &str) -> HeadingOverlap {
    let normalized_heading = normalize_narrative_text(heading);
    let normalized_body = normalize_narrative_text(body);
    if normalized_heading.is_empty() || normalized_body.is_empty() {
        return HeadingOverlap {
            status: HeadingOverlapStatus::Distinct,
            method: HeadingOverlapMethod::None,
            score: 0.0,
        };
    }

    if normalized_heading == normalized_body {
        return HeadingOverlap {
            status: HeadingOverlapStatus::Duplicate,
            method: HeadingOverlapMethod::Exact,
            score: 1.0,
        };
    }

    if normalized_body
        .strip_prefix(&normalized_heading)
        .is_some_and(|rest| rest.is_empty() || rest.starts_with(' '))
    {
        return HeadingOverlap {
            status: HeadingOverlapStatus::Duplicate,
            method: HeadingOverlapMethod::Prefix,
            score: 1.0,
        };
    }

    let heading_tokens = content_tokens(heading);
    if heading_tokens.is_empty() {
        return HeadingOverlap {
            status: HeadingOverlapStatus::Distinct,
            method: HeadingOverlapMethod::None,
            score: 0.0,
        };
    }
    let body_tokens = content_tokens(body);
    let window = body_tokens
        .iter()
        .take((heading_tokens.len() + 4).max(8))
        .map(String::as_str)
        .collect::<HashSet<_>>();
    let matched = heading_tokens
        .iter()
        .filter(|token| window.contains(token.as_str()))
        .count();
    let score = matched as f64 / heading_tokens.len() as f64;

    if score >= 0.8 {
        HeadingOverlap {
            status: HeadingOverlapStatus::Duplicate,
            method: HeadingOverlapMethod::TokenOverlap,
            score,
        }
    } else if score >= 0.5 {
        HeadingOverlap {
            status: HeadingOverlapStatus::Review,
            method: HeadingOverlapMethod::TokenOverlap,
            score,
        }
    } else {
        HeadingOverlap {
            status: HeadingOverlapStatus::Distinct,
            method: HeadingOverlapMethod::None,
            score,
        }
    }
}

pub fn find_duplicated_spoken_headings(
    plan: &NarrativePlan,
    section_speech: &BTreeMap<String, String>,
) -> Vec<HeadingFinding> {
    plan.sections
        .iter()
        .filter_map(|section| {
            let heading = section.heading.as_ref()?;
            if heading.policy != SpokenHeadingPolicy::Announce {
                return None;
            }
            let body = section_speech.get(&section.id)?;
            let overlap = compare_heading_to_body(&heading.display_text, body);
            (overlap.status != HeadingOverlapStatus::Distinct).then(|| HeadingFinding {
                section_id: section.id.clone(),
                heading: heading.display_text.clone(),
                overlap,
            })
        })
        .collect()
}

pub fn reduce_narrative_memory(
    memory: &NarrativeMemory,
    delta: NarrativeMemoryDelta,
) -> NarrativeMemory {
    let concepts_covered = unique(
        memory
            .concepts_covered
            .iter()
            .cloned()
            .chain(delta.concepts_covered)
            .collect(),
    );
    let terms_defined = unique(
        memory
            .terms_defined
            .iter()
            .cloned()
            .chain(delta.terms_defined)
            .collect(),
    );
    let resolved: HashSet<String> = delta.resolved_threads.into_iter().collect();
    let open_threads = unique(
        memory
            .open_threads
            .iter()
            .cloned()
            .chain(delta.open_threads)
            .collect(),
    )
    .into_iter()
    .filter(|thread| !resolved.contains(thread))
    .collect();
    let covered: HashSet<&str> = concepts_covered.iter().map(String::as_str).collect();
    let requested_next = delta
        .next_concepts
        .unwrap_or_else(|| memory.next_concepts.clone());
    let next_concepts = unique(requested_next)
        .into_iter()
        .filter(|concept| !covered.contains(concept.as_str()))
        .collect();

    NarrativeMemory {
        schema_version: 1,
        concepts_covered,
        terms_defined,
        open_threads,
        current_goal: delta
            .current_goal
            .unwrap_or_else(|| memory.current_goal.clone()),
        next_concepts,
        source_refs: unique(
            memory
                .source_refs
                .iter()
                .cloned()
                .chain(delta.source_refs)
                .collect(),
        ),
    }
}

pub fn find_repeated_formulaic_openers(
    section_texts: &[String],
    min_occurrences: usize,
) -> Result<Vec<FormulaicFinding>, NarrativeError> {
    if min_occurrences < 2 {
        return Err(NarrativeError::InvalidMinimumOccurrences);
    }

    Ok(FORMULAIC_OPENERS
        .iter()
        .filter_map(|opener| {
            let section_indexes = section_texts
                .iter()
                .enumerate()
                .filter_map(|(index, text)| {
                    normalize_narrative_text(text)
                        .starts_with(opener)
                        .then_some(index)
                })
                .collect::<Vec<_>>();
            (section_indexes.len() >= min_occurrences).then(|| FormulaicFinding {
                opener: (*opener).to_owned(),
                count: section_indexes.len(),
                section_indexes,
            })
        })
        .collect())
}

pub fn build_narration_qa(
    plan_id: &str,
    document_sections: usize,
    plan: &NarrativePlan,
    section_speech: &BTreeMap<String, String>,
    valid_source_refs: &HashSet<String>,
    unsupported_claims: usize,
) -> Result<NarrationQa, NarrativeError> {
    plan.validate()?;
    let heading_findings = find_duplicated_spoken_headings(plan, section_speech);
    let duplicated_spoken_headings = heading_findings
        .iter()
        .filter(|finding| finding.overlap.status == HeadingOverlapStatus::Duplicate)
        .count();

    let mut invalid_refs = BTreeSet::<String>::new();
    for section in &plan.sections {
        for source_ref in section.source_refs.iter().chain(
            section
                .transition
                .iter()
                .flat_map(|transition| transition.source_refs.iter()),
        ) {
            if !valid_source_refs.contains(source_ref) {
                invalid_refs.insert(source_ref.clone());
            }
        }
    }

    let section_texts = plan
        .sections
        .iter()
        .map(|section| section_speech.get(&section.id).cloned().unwrap_or_default())
        .collect::<Vec<_>>();
    let formulaic = find_repeated_formulaic_openers(&section_texts, 3)?;

    let mut warnings = Vec::new();
    for source_ref in &invalid_refs {
        warnings.push(NarrationWarning {
            code: "INVALID_SOURCE_REF".into(),
            section_id: None,
            message: format!("Source reference not found: {source_ref}"),
        });
    }
    for finding in heading_findings
        .iter()
        .filter(|finding| finding.overlap.status == HeadingOverlapStatus::Review)
    {
        warnings.push(NarrationWarning {
            code: "HEADING_OVERLAP_REVIEW".into(),
            section_id: Some(finding.section_id.clone()),
            message: format!(
                "Heading/body overlap requires review (score {:.2}).",
                finding.overlap.score
            ),
        });
    }
    for finding in formulaic {
        warnings.push(NarrationWarning {
            code: "FORMULAIC_OPENER".into(),
            section_id: finding
                .section_indexes
                .first()
                .and_then(|index| plan.sections.get(*index))
                .map(|section| section.id.clone()),
            message: format!(
                "Repeated opener \"{}\" appears {} times.",
                finding.opener, finding.count
            ),
        });
    }

    let critical =
        duplicated_spoken_headings > 0 || unsupported_claims > 0 || !invalid_refs.is_empty();
    let status = if critical {
        QaStatus::Fail
    } else if warnings.is_empty() {
        QaStatus::Pass
    } else {
        QaStatus::Review
    };

    Ok(NarrationQa {
        schema_version: 1,
        plan_id: plan_id.to_owned(),
        status,
        document_sections,
        narrative_sections: plan.sections.len(),
        spoken_chapters: plan.spoken_chapters.len(),
        duplicated_spoken_headings,
        unsupported_claims,
        warnings,
        method_version: "narrative-quality-rust-v1".into(),
    })
}

pub fn build_validated_narration_qa(
    plan_id: &str,
    plan: &NarrativePlan,
    content: &ContentModel,
    outline: &SemanticOutline,
    section_speech: &BTreeMap<String, String>,
) -> Result<NarrationQa, NarrativeError> {
    plan.validate_against(content, outline)?;
    if plan_id.trim().is_empty()
        || section_speech.len() != plan.sections.len()
        || plan.sections.iter().any(|section| {
            section_speech
                .get(&section.id)
                .is_none_or(|speech| speech.trim().is_empty())
        })
    {
        return Err(NarrativeError::InvalidNarrative(
            "plan ID or section speech is incomplete".into(),
        ));
    }
    let valid_source_refs = content
        .source_units
        .iter()
        .flat_map(|unit| unit.source_refs.iter().cloned())
        .collect();
    let mut qa = build_narration_qa(
        plan_id,
        outline.sections.len(),
        plan,
        section_speech,
        &valid_source_refs,
        0,
    )?;
    qa.warnings.push(NarrationWarning {
        code: "CLAIM_GROUNDING_NOT_EVALUATED".into(),
        section_id: None,
        message: "Claim grounding requires a separate review.".into(),
    });
    if qa.status == QaStatus::Pass {
        qa.status = QaStatus::Review;
    }
    Ok(qa)
}

fn content_tokens(input: &str) -> Vec<String> {
    let stop_words: HashSet<&str> = STOP_WORDS.into_iter().collect();
    unique(
        normalize_narrative_text(input)
            .split_whitespace()
            .filter(|token| !stop_words.contains(*token))
            .map(str::to_owned)
            .collect(),
    )
}

fn unique(values: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    values
        .into_iter()
        .filter(|value| !value.trim().is_empty() && seen.insert(value.clone()))
        .collect()
}

fn fold_latin_char(ch: char) -> char {
    match ch {
        'á' | 'à' | 'â' | 'ã' | 'ä' => 'a',
        'é' | 'è' | 'ê' | 'ë' => 'e',
        'í' | 'ì' | 'î' | 'ï' => 'i',
        'ó' | 'ò' | 'ô' | 'õ' | 'ö' => 'o',
        'ú' | 'ù' | 'û' | 'ü' => 'u',
        'ç' => 'c',
        'ñ' => 'n',
        _ => ch,
    }
}
