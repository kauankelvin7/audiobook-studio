use std::collections::{BTreeMap, HashSet};

use serde::{Deserialize, Serialize};

use crate::{
    build_validated_narration_qa, ContentModel, NarrationQa, NarrativeError, NarrativePlan,
    SemanticOutline,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScriptSegment {
    pub id: String,
    pub display_text: String,
    pub speech_text: String,
    pub source_refs: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScriptSection {
    pub id: String,
    pub segments: Vec<ScriptSegment>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NarrativeScript {
    pub schema_version: u32,
    pub plan_id: String,
    pub document_id: String,
    pub sections: Vec<ScriptSection>,
}

impl NarrativeScript {
    pub fn from_json(input: &str) -> Result<Self, NarrativeError> {
        let script: Self = serde_json::from_str(input)
            .map_err(|error| NarrativeError::InvalidJson(error.to_string()))?;
        script.validate()?;
        Ok(script)
    }

    pub fn validate(&self) -> Result<(), NarrativeError> {
        if self.schema_version != 1 {
            return Err(NarrativeError::UnsupportedSchemaVersion(
                self.schema_version,
            ));
        }
        if self.plan_id.trim().is_empty()
            || self.document_id.trim().is_empty()
            || self.sections.is_empty()
        {
            return Err(NarrativeError::InvalidScript(
                "script identity or sections are missing".into(),
            ));
        }
        let mut section_ids = HashSet::new();
        let mut segment_ids = HashSet::new();
        for section in &self.sections {
            if section.id.trim().is_empty()
                || !section_ids.insert(section.id.as_str())
                || section.segments.is_empty()
            {
                return Err(NarrativeError::InvalidScript(format!(
                    "invalid script section: {}",
                    section.id
                )));
            }
            for segment in &section.segments {
                if segment.id.trim().is_empty()
                    || !segment_ids.insert(segment.id.as_str())
                    || segment.display_text.trim().is_empty()
                    || segment.speech_text.trim().is_empty()
                    || segment.source_refs.is_empty()
                    || segment
                        .source_refs
                        .iter()
                        .any(|value| value.trim().is_empty())
                {
                    return Err(NarrativeError::InvalidScript(format!(
                        "incomplete or duplicate script segment: {}",
                        segment.id
                    )));
                }
            }
        }
        Ok(())
    }

    pub fn validate_against(
        &self,
        expected_plan_id: &str,
        plan: &NarrativePlan,
        content: &ContentModel,
        outline: &SemanticOutline,
    ) -> Result<(), NarrativeError> {
        self.validate()?;
        plan.validate_against(content, outline)?;
        if expected_plan_id.trim().is_empty()
            || self.plan_id != expected_plan_id
            || self.document_id != plan.document_id
            || self.sections.len() != plan.sections.len()
        {
            return Err(NarrativeError::InvalidScript(
                "script identity or section coverage is invalid".into(),
            ));
        }

        for (section, planned) in self.sections.iter().zip(&plan.sections) {
            if section.id != planned.id {
                return Err(NarrativeError::InvalidScript(format!(
                    "script section order or identity differs from plan: {}",
                    section.id
                )));
            }
            for segment in &section.segments {
                for source_ref in &segment.source_refs {
                    let belongs_to_section = planned.source_refs.contains(source_ref);
                    let belongs_to_transition = planned
                        .transition
                        .as_ref()
                        .is_some_and(|transition| transition.source_refs.contains(source_ref));
                    if !belongs_to_section && !belongs_to_transition {
                        return Err(NarrativeError::UnknownSourceRef(source_ref.clone()));
                    }
                }
            }
        }
        Ok(())
    }

    pub fn build_qa(
        &self,
        expected_plan_id: &str,
        plan: &NarrativePlan,
        content: &ContentModel,
        outline: &SemanticOutline,
    ) -> Result<NarrationQa, NarrativeError> {
        self.validate_against(expected_plan_id, plan, content, outline)?;
        let section_speech = self
            .sections
            .iter()
            .map(|section| {
                (
                    section.id.clone(),
                    section
                        .segments
                        .iter()
                        .map(|segment| segment.speech_text.as_str())
                        .collect::<Vec<_>>()
                        .join(" "),
                )
            })
            .collect::<BTreeMap<_, _>>();
        build_validated_narration_qa(&self.plan_id, plan, content, outline, &section_speech)
    }
}
