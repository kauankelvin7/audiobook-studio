use serde::{Deserialize, Serialize};

use crate::DomainError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum JobState {
    Created,
    Ingesting,
    Extracting,
    Structuring,
    Scripting,
    Verifying,
    ReadyForAudio,
    Synthesizing,
    Packaging,
    FinalAudit,
    Completed,
    CompletedWithWarnings,
    Paused,
    WaitingUser,
    FailedRetryable,
    FailedFatal,
    Cancelled,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GenerationJob {
    state: JobState,
    resume_state: Option<JobState>,
}

impl Default for GenerationJob {
    fn default() -> Self {
        Self::new()
    }
}

impl GenerationJob {
    pub fn new() -> Self {
        Self {
            state: JobState::Created,
            resume_state: None,
        }
    }

    pub fn state(&self) -> JobState {
        self.state
    }

    pub fn resume_state(&self) -> Option<JobState> {
        self.resume_state
    }

    pub fn validate(&self) -> Result<(), DomainError> {
        if is_suspended(self.state) {
            if !self.resume_state.is_some_and(is_active) {
                return Err(DomainError::InvalidJobSnapshot);
            }
        } else if self.resume_state.is_some() {
            return Err(DomainError::InvalidJobSnapshot);
        }
        Ok(())
    }

    pub fn from_json(input: &str) -> Result<Self, DomainError> {
        let job: Self = serde_json::from_str(input)
            .map_err(|error| DomainError::InvalidJson(error.to_string()))?;
        job.validate()?;
        Ok(job)
    }

    pub fn to_json(&self) -> Result<String, DomainError> {
        self.validate()?;
        serde_json::to_string(self).map_err(|error| DomainError::Serialization(error.to_string()))
    }

    pub fn transition(&mut self, to: JobState) -> Result<(), DomainError> {
        let from = self.state;
        if is_suspended(to) {
            if !is_active(from) {
                return Err(DomainError::InvalidTransition { from, to });
            }
            self.resume_state = Some(from);
        } else if is_suspended(from) {
            if self.resume_state != Some(to)
                && !matches!(to, JobState::FailedFatal | JobState::Cancelled)
            {
                return Err(DomainError::InvalidTransition { from, to });
            }
            self.resume_state = None;
        } else if matches!(to, JobState::FailedFatal | JobState::Cancelled) {
            if !is_active(from) {
                return Err(DomainError::InvalidTransition { from, to });
            }
        } else if !normal_transition(from, to) {
            return Err(DomainError::InvalidTransition { from, to });
        }
        self.state = to;
        Ok(())
    }

    pub fn ensure_narrative_activation_allowed(&self) -> Result<(), DomainError> {
        self.validate()?;
        if self.state != JobState::Verifying {
            return Err(DomainError::InvalidNarrativeActivationState(self.state));
        }
        Ok(())
    }
}

fn is_suspended(state: JobState) -> bool {
    matches!(
        state,
        JobState::Paused | JobState::WaitingUser | JobState::FailedRetryable
    )
}

fn is_active(state: JobState) -> bool {
    matches!(
        state,
        JobState::Created
            | JobState::Ingesting
            | JobState::Extracting
            | JobState::Structuring
            | JobState::Scripting
            | JobState::Verifying
            | JobState::ReadyForAudio
            | JobState::Synthesizing
            | JobState::Packaging
            | JobState::FinalAudit
    )
}

fn normal_transition(from: JobState, to: JobState) -> bool {
    matches!(
        (from, to),
        (JobState::Created, JobState::Ingesting)
            | (JobState::Ingesting, JobState::Extracting)
            | (JobState::Extracting, JobState::Structuring)
            | (JobState::Structuring, JobState::Scripting)
            | (JobState::Scripting, JobState::Verifying)
            | (JobState::Verifying, JobState::ReadyForAudio)
            | (JobState::ReadyForAudio, JobState::Synthesizing)
            | (JobState::Synthesizing, JobState::Packaging)
            | (JobState::Packaging, JobState::FinalAudit)
            | (JobState::FinalAudit, JobState::Completed)
            | (JobState::FinalAudit, JobState::CompletedWithWarnings)
    )
}
