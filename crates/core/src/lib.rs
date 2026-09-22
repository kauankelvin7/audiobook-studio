#![forbid(unsafe_code)]

mod content;
mod document;
mod document_v2;
mod job;
mod narrative;

pub use content::{
    ConceptImportance, ContentConcept, ContentError, ContentModel, ContentRelation,
    ContentSourceUnit, NarrationEligibility, RelationType, SemanticOutline,
    SemanticOutlineSection,
};
pub use document::{
    sha256_source, BlockType, DocumentBlock, DocumentIr, DocumentManifest, DocumentPage,
    TextQuality, DOCUMENT_IR_SCHEMA_VERSION,
};
pub use document_v2::{
    DocumentIrV2, DocumentPageV2, DocumentRegionV2, DocumentV2Error, ExtractionQuality,
    QualityStatus, RegionContent, RegionType, SourceLayers, Uncertainty, VisualDisposition,
    VisualType, DOCUMENT_IR_V2_SCHEMA_VERSION,
};
pub use job::{GenerationJob, JobState};
pub use narrative::{
    build_narration_qa, compare_heading_to_body, find_duplicated_spoken_headings,
    find_repeated_formulaic_openers, normalize_narrative_text, reduce_narrative_memory,
    FormulaicFinding, HeadingFinding, HeadingOverlap, HeadingOverlapMethod,
    HeadingOverlapStatus, NarrationQa, NarrationWarning, NarrativeError, NarrativeHeading,
    NarrativeMemory, NarrativeMemoryDelta, NarrativePlan, NarrativeSection,
    NarrativeTransition, QaStatus, SpokenChapter, SpokenHeadingPolicy,
};

use thiserror::Error;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum DomainError {
    #[error("document must contain at least one page")]
    EmptyDocument,
    #[error("source hash must be sha256 followed by 64 lowercase hexadecimal characters")]
    InvalidSourceHash,
    #[error("document ID does not match source hash")]
    InvalidDocumentId,
    #[error("unsupported DocumentIR schema version: {0}")]
    UnsupportedSchemaVersion(u32),
    #[error("page order mismatch: expected {expected}, found {found}")]
    InvalidPageOrder { expected: u32, found: u32 },
    #[error("block ID is empty")]
    EmptyBlockId,
    #[error("block ID occurs more than once: {0}")]
    DuplicateBlockId(String),
    #[error("block has no text: {0}")]
    EmptyBlockText(String),
    #[error("block confidence must be finite and between 0 and 1: {0}")]
    InvalidConfidence(String),
    #[error("block bounding box must contain finite, ordered coordinates: {0}")]
    InvalidBoundingBox(String),
    #[error("page {0} is marked extracted but has no blocks")]
    EmptyExtractedPage(u32),
    #[error("page {0} has extracted blocks but no raw text")]
    MissingRawText(u32),
    #[error("parser version must not be empty")]
    EmptyParserVersion,
    #[error("invalid JSON: {0}")]
    InvalidJson(String),
    #[error("failed to serialize DocumentIR: {0}")]
    Serialization(String),
    #[error("invalid state transition from {from:?} to {to:?}")]
    InvalidTransition { from: JobState, to: JobState },
    #[error("invalid serialized job state")]
    InvalidJobSnapshot,
}
