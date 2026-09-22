use audiobook_core::{
    sha256_source, BlockType, DocumentIr, DocumentManifest, DomainError, GenerationJob, JobState,
    TextQuality,
};

const FIXTURE: &str = include_str!("../../../tests/fixtures/document_ir_v1.json");

fn fixture() -> DocumentIr {
    DocumentIr::from_json(FIXTURE).expect("checked-in fixture must be valid")
}

#[test]
fn source_hash_matches_known_sha256_vector() {
    assert_eq!(
        sha256_source(b"abc"),
        "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
}

#[test]
fn document_round_trip_preserves_unknown_and_ocr_pages() {
    let document = fixture();
    let json = document.to_json().expect("valid document serializes");
    let restored = DocumentIr::from_json(&json).expect("serialized document parses");
    assert_eq!(document, restored);
    assert_eq!(restored.pages[0].blocks[1].text, "Trecho incerto");
    assert_eq!(restored.pages[1].text_quality, TextQuality::NeedsOcr);
}

#[test]
fn complex_visual_block_types_keep_stable_wire_names() {
    assert_eq!(
        serde_json::to_string(&BlockType::Diagram).unwrap(),
        "\"diagram\""
    );
    assert_eq!(
        serde_json::to_string(&BlockType::Chart).unwrap(),
        "\"chart\""
    );
}

#[test]
fn manifest_counts_content_and_cache_key_is_versioned() {
    let document = fixture();
    let first = document.manifest("pdfjs/8.3.0").expect("valid manifest");
    let same = document.manifest("pdfjs/8.3.0").expect("valid manifest");
    let changed = document.manifest("pdfjs/8.4.0").expect("valid manifest");
    assert_eq!(first.page_count, 2);
    assert_eq!(first.block_count, 2);
    assert_eq!(first.unknown_block_count, 1);
    assert_eq!(first.needs_ocr_page_count, 1);
    assert_eq!(first.extraction_cache_key, same.extraction_cache_key);
    assert_ne!(first.extraction_cache_key, changed.extraction_cache_key);
    let serialized = serde_json::to_string(&first).expect("manifest serializes");
    let restored: DocumentManifest =
        serde_json::from_str(&serialized).expect("manifest deserializes");
    assert_eq!(first, restored);
}

#[test]
fn empty_document_and_empty_parser_version_are_rejected() {
    let result = DocumentIr::new(fixture().source_hash, None, vec![]);
    assert_eq!(result, Err(DomainError::EmptyDocument));
    assert_eq!(fixture().manifest(""), Err(DomainError::EmptyParserVersion));
}

#[test]
fn rejects_duplicate_and_out_of_order_blocks() {
    let mut document = fixture();
    document.pages[0].blocks[1].id = "b_1_1".into();
    assert_eq!(
        document.validate(),
        Err(DomainError::DuplicateBlockId("b_1_1".into()))
    );
    let mut document = fixture();
    document.pages[1].number = 3;
    assert_eq!(
        document.validate(),
        Err(DomainError::InvalidPageOrder {
            expected: 2,
            found: 3,
        })
    );
}

#[test]
fn rejects_invalid_confidence_bounds_and_hash() {
    let mut document = fixture();
    document.pages[0].blocks[0].confidence = Some(f32::NAN);
    assert_eq!(
        document.validate(),
        Err(DomainError::InvalidConfidence("b_1_1".into()))
    );
    let mut document = fixture();
    document.pages[0].blocks[0].bbox = Some([10.0, 20.0, 5.0, 40.0]);
    assert_eq!(
        document.validate(),
        Err(DomainError::InvalidBoundingBox("b_1_1".into()))
    );
    let mut document = fixture();
    document.source_hash = "sha256:ABC".into();
    assert_eq!(document.validate(), Err(DomainError::InvalidSourceHash));
}

#[test]
fn extracted_blocks_require_raw_text_for_audit() {
    let mut document = fixture();
    document.pages[0].raw_text.clear();
    assert_eq!(document.validate(), Err(DomainError::MissingRawText(1)));
}

#[test]
fn rejects_unsupported_schema_version() {
    let changed = FIXTURE.replace("\"schemaVersion\": 1", "\"schemaVersion\": 2");
    assert_eq!(
        DocumentIr::from_json(&changed),
        Err(DomainError::UnsupportedSchemaVersion(2))
    );
}

#[test]
fn job_only_advances_through_explicit_stages() {
    let mut job = GenerationJob::new();
    assert_eq!(
        job.transition(JobState::Packaging),
        Err(DomainError::InvalidTransition {
            from: JobState::Created,
            to: JobState::Packaging,
        })
    );
    for state in [
        JobState::Ingesting,
        JobState::Extracting,
        JobState::Structuring,
        JobState::Scripting,
        JobState::Verifying,
        JobState::ReadyForAudio,
        JobState::Synthesizing,
        JobState::Packaging,
        JobState::FinalAudit,
        JobState::CompletedWithWarnings,
    ] {
        job.transition(state).expect("valid next stage");
    }
    assert_eq!(job.state(), JobState::CompletedWithWarnings);
    assert!(job.transition(JobState::FailedFatal).is_err());
}

#[test]
fn pause_and_resume_preserve_the_prior_stage() {
    let mut job = GenerationJob::new();
    job.transition(JobState::Ingesting)
        .expect("valid next stage");
    job.transition(JobState::Paused).expect("pause active job");
    assert_eq!(job.resume_state(), Some(JobState::Ingesting));
    assert!(job.transition(JobState::Packaging).is_err());
    job.transition(JobState::Ingesting)
        .expect("resume checkpointed stage");
    assert_eq!(job.resume_state(), None);
    job.transition(JobState::Extracting)
        .expect("advance after resume");
}

#[test]
fn job_snapshot_round_trips_and_rejects_impossible_resume() {
    let mut job = GenerationJob::new();
    job.transition(JobState::Ingesting)
        .expect("valid next stage");
    job.transition(JobState::Paused).expect("valid pause");
    let json = job.to_json().expect("valid job serializes");
    assert_eq!(GenerationJob::from_json(&json), Ok(job));
    assert_eq!(
        GenerationJob::from_json("{\"state\":\"PAUSED\",\"resumeState\":null}"),
        Err(DomainError::InvalidJobSnapshot)
    );
}
