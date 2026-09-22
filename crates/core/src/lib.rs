#![forbid(unsafe_code)]

use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum JobState {
    Created,
    Extracting,
    Analyzing,
    Verifying,
    Packaging,
    Completed,
    CompletedWithWarnings,
    Failed,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum DomainError {
    #[error("document content cannot be empty")]
    EmptyDocument,
    #[error("invalid state transition from {from:?} to {to:?}")]
    InvalidTransition { from: JobState, to: JobState },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DocumentIr {
    pub id: Uuid,
    pub title: Option<String>,
    pub blocks: Vec<DocumentBlock>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DocumentBlock {
    pub text: String,
}

impl DocumentIr {
    pub fn new(title: Option<String>, blocks: Vec<DocumentBlock>) -> Result<Self, DomainError> {
        if blocks.iter().all(|block| block.text.trim().is_empty()) {
            return Err(DomainError::EmptyDocument);
        }
        Ok(Self {
            id: Uuid::new_v4(),
            title,
            blocks,
        })
    }
}

pub fn can_transition(from: &JobState, to: &JobState) -> bool {
    match (from, to) {
        (JobState::Created, JobState::Extracting)
        | (JobState::Extracting, JobState::Analyzing)
        | (JobState::Analyzing, JobState::Verifying)
        | (JobState::Verifying, JobState::Packaging)
        | (JobState::Packaging, JobState::Completed)
        | (JobState::Packaging, JobState::CompletedWithWarnings)
        | (_, JobState::Failed) => true,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty_document() {
        assert_eq!(
            DocumentIr::new(None, vec![]),
            Err(DomainError::EmptyDocument)
        );
    }

    #[test]
    fn accepts_valid_document() {
        let document = DocumentIr::new(
            None,
            vec![DocumentBlock {
                text: "hello".into(),
            }],
        );
        assert!(document.is_ok());
    }

    #[test]
    fn allows_happy_path_transitions() {
        assert!(can_transition(&JobState::Created, &JobState::Extracting));
        assert!(can_transition(&JobState::Packaging, &JobState::Completed));
    }
}
