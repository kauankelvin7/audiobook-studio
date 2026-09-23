use std::collections::{BTreeMap, HashSet};

use audiobook_core::{
    build_narration_qa, build_script_review_packet, build_validated_narration_qa,
    compare_heading_to_body, find_repeated_formulaic_openers, normalize_narrative_text,
    reduce_narrative_memory, ContentModel, DocumentIr, DocumentIrV2, HeadingOverlapMethod,
    HeadingOverlapStatus, NarrativeHeading, NarrativeMemory, NarrativeMemoryDelta, NarrativePlan,
    NarrativeScript, NarrativeSection, QaStatus, ReviewStatus, SemanticOutline, SpokenChapter,
    SpokenHeadingPolicy,
};

const DOCUMENT_V1_FIXTURE: &str = include_str!("../../../tests/fixtures/document_ir_v1.json");
const DOCUMENT_V2_FIXTURE: &str = include_str!("../../../tests/fixtures/document_ir_v2.json");
const CONTENT_MODEL_FIXTURE: &str = include_str!("../../../tests/fixtures/content_model_v1.json");
const SEMANTIC_OUTLINE_FIXTURE: &str =
    include_str!("../../../tests/fixtures/semantic_outline_v1.json");
const NARRATIVE_PLAN_FIXTURE: &str =
    include_str!("../../../tests/fixtures/narrative_plan_content_v1.json");
const NARRATIVE_SCRIPT_FIXTURE: &str =
    include_str!("../../../tests/fixtures/narrative_script_content_v1.json");

fn document_v2() -> DocumentIrV2 {
    DocumentIrV2::from_json(DOCUMENT_V2_FIXTURE).expect("checked-in v2 fixture must be valid")
}

fn plan(policy: SpokenHeadingPolicy) -> NarrativePlan {
    NarrativePlan {
        schema_version: 1,
        document_id: document_v2().document_id,
        sections: vec![NarrativeSection {
            id: "section_1".into(),
            source_refs: vec!["r_1_1".into()],
            concept_ids: vec![],
            heading: Some(NarrativeHeading {
                display_text: "Procedure Division".into(),
                policy,
                reason: "topic boundary".into(),
            }),
            transition: None,
            spoken_chapter_id: "chapter_1".into(),
            estimated_seconds: Some(60.0),
        }],
        spoken_chapters: vec![SpokenChapter {
            id: "chapter_1".into(),
            section_ids: vec!["section_1".into()],
            display_title: "COBOL".into(),
        }],
    }
}

#[test]
fn validated_qa_requires_contextual_provenance_and_complete_speech() {
    let content = ContentModel::from_json(CONTENT_MODEL_FIXTURE).expect("content fixture");
    let outline =
        SemanticOutline::from_json(SEMANTIC_OUTLINE_FIXTURE, &content).expect("outline fixture");
    let plan = plan(SpokenHeadingPolicy::Announce);
    let mut speech = BTreeMap::from([(
        "section_1".to_owned(),
        "Procedure Division begins here".to_owned(),
    )]);
    let qa = build_validated_narration_qa("plan_1", &plan, &content, &outline, &speech)
        .expect("valid contextual QA");
    assert_eq!(qa.status, QaStatus::Fail);
    assert_eq!(qa.duplicated_spoken_headings, 1);
    assert_eq!(qa.unsupported_claims, 0);
    assert!(qa
        .warnings
        .iter()
        .any(|warning| warning.code == "CLAIM_GROUNDING_NOT_EVALUATED"));

    speech.insert(
        "section_1".into(),
        "The body discusses a distinct topic".into(),
    );
    let review = build_validated_narration_qa("plan_1", &plan, &content, &outline, &speech)
        .expect("claim grounding remains for review");
    assert_eq!(review.status, QaStatus::Review);
    assert!(build_validated_narration_qa(" ", &plan, &content, &outline, &speech).is_err());
    speech.insert("section_1".into(), "   ".into());
    assert!(build_validated_narration_qa("plan_1", &plan, &content, &outline, &speech).is_err());
    speech.insert("section_1".into(), "Valid speech".into());
    speech.insert("unknown_section".into(), "Extra speech".into());
    assert!(build_validated_narration_qa("plan_1", &plan, &content, &outline, &speech).is_err());

    speech.clear();
    assert!(build_validated_narration_qa("plan_1", &plan, &content, &outline, &speech).is_err());
    let mut invalid_plan = plan;
    invalid_plan.sections[0].source_refs = vec!["fabricated".into()];
    speech.insert("section_1".into(), "Valid speech".into());
    assert!(
        build_validated_narration_qa("plan_1", &invalid_plan, &content, &outline, &speech).is_err()
    );
}

#[test]
fn shared_narrative_plan_fixture_passes_contextual_qa() {
    let content = ContentModel::from_json(CONTENT_MODEL_FIXTURE).expect("content fixture");
    let outline =
        SemanticOutline::from_json(SEMANTIC_OUTLINE_FIXTURE, &content).expect("outline fixture");
    let plan = NarrativePlan::from_json(NARRATIVE_PLAN_FIXTURE).expect("narrative fixture");
    let speech = BTreeMap::from([("section_1".into(), "PR0CEDURE DIVISI0N".into())]);
    let qa = build_validated_narration_qa("plan_1", &plan, &content, &outline, &speech)
        .expect("contextual QA");
    assert_eq!(qa.status, QaStatus::Review);
    assert_eq!(qa.document_sections, 1);
    assert_eq!(qa.narrative_sections, 1);
    assert_eq!(qa.duplicated_spoken_headings, 0);
}

#[test]
fn script_mapping_requires_plan_coverage_and_keeps_claims_in_review() {
    let content = ContentModel::from_json(CONTENT_MODEL_FIXTURE).expect("content fixture");
    let outline =
        SemanticOutline::from_json(SEMANTIC_OUTLINE_FIXTURE, &content).expect("outline fixture");
    let plan = NarrativePlan::from_json(NARRATIVE_PLAN_FIXTURE).expect("narrative fixture");
    let script = NarrativeScript::from_json(NARRATIVE_SCRIPT_FIXTURE).expect("script fixture");

    let qa = script
        .build_qa("plan_1", &plan, &content, &outline)
        .expect("mapped script");
    assert_eq!(qa.status, QaStatus::Review);
    assert!(qa
        .warnings
        .iter()
        .any(|warning| warning.code == "CLAIM_GROUNDING_NOT_EVALUATED"));
    assert!(script
        .build_qa("another_plan", &plan, &content, &outline)
        .is_err());

    let mut unmapped = script.clone();
    unmapped.sections[0].segments[0].source_refs.clear();
    assert!(
        NarrativeScript::from_json(&serde_json::to_string(&unmapped).expect("serialize")).is_err()
    );
    assert!(unmapped
        .build_qa("plan_1", &plan, &content, &outline)
        .is_err());

    let mut repeated_ref = script.clone();
    repeated_ref.sections[0].segments[0]
        .source_refs
        .push("r_1_1".into());
    assert!(repeated_ref
        .build_qa("plan_1", &plan, &content, &outline)
        .is_err());

    let mut invented = script.clone();
    invented.sections[0].segments[0].source_refs = vec!["fabricated".into()];
    assert!(invented
        .build_qa("plan_1", &plan, &content, &outline)
        .is_err());

    let mut missing_section = script.clone();
    missing_section.sections.clear();
    assert!(missing_section
        .build_qa("plan_1", &plan, &content, &outline)
        .is_err());

    let mut wrong_document = script.clone();
    wrong_document.document_id = "other".into();
    assert!(wrong_document
        .build_qa("plan_1", &plan, &content, &outline)
        .is_err());

    let mut duplicate_segment = script.clone();
    let repeated = duplicate_segment.sections[0].segments[0].clone();
    duplicate_segment.sections[0].segments.push(repeated);
    assert!(duplicate_segment
        .build_qa("plan_1", &plan, &content, &outline)
        .is_err());

    let mut announced = plan.clone();
    announced.sections[0].heading = Some(NarrativeHeading {
        display_text: "Procedure Division".into(),
        policy: SpokenHeadingPolicy::Announce,
        reason: "section boundary".into(),
    });
    let mut repeated_heading = script;
    repeated_heading.sections[0].segments[0].speech_text = "Procedure Division begins here.".into();
    let failed = repeated_heading
        .build_qa("plan_1", &announced, &content, &outline)
        .expect("heading overlap is reported");
    assert_eq!(failed.status, QaStatus::Fail);
    assert_eq!(failed.duplicated_spoken_headings, 1);
}

#[test]
fn script_accepts_a_planned_transition_source_reference() {
    let mut content = ContentModel::from_json(CONTENT_MODEL_FIXTURE).expect("content fixture");
    let mut second_unit = content.source_units[0].clone();
    second_unit.id = "unit_r_1_2".into();
    second_unit.source_refs = vec!["r_1_2".into()];
    content.source_units.push(second_unit);
    let outline = SemanticOutline::skeleton(&content).expect("outline for both source units");
    let mut plan = NarrativePlan::from_json(NARRATIVE_PLAN_FIXTURE).expect("narrative fixture");
    plan.sections[0].transition = Some(audiobook_core::NarrativeTransition {
        text: "Ligação entre trechos".into(),
        relation: "sequence".into(),
        source_refs: vec!["r_1_2".into()],
    });
    let mut script = NarrativeScript::from_json(NARRATIVE_SCRIPT_FIXTURE).expect("script fixture");
    script.sections[0].segments[0].source_refs = vec!["r_1_2".into()];
    let qa = script
        .build_qa("plan_1", &plan, &content, &outline)
        .expect("transition source is valid");
    assert_eq!(qa.status, QaStatus::Review);
    script.sections[0].segments[0].source_refs = vec!["unrelated".into()];
    assert!(script
        .build_qa("plan_1", &plan, &content, &outline)
        .is_err());
}

#[test]
fn review_packet_preserves_all_source_evidence_and_tracks_changes() {
    let content = ContentModel::from_json(CONTENT_MODEL_FIXTURE).expect("content fixture");
    let outline =
        SemanticOutline::from_json(SEMANTIC_OUTLINE_FIXTURE, &content).expect("outline fixture");
    let plan = NarrativePlan::from_json(NARRATIVE_PLAN_FIXTURE).expect("plan fixture");
    let script = NarrativeScript::from_json(NARRATIVE_SCRIPT_FIXTURE).expect("script fixture");

    let packet = build_script_review_packet("plan_1", &script, &plan, &content, &outline)
        .expect("review packet");
    assert_eq!(packet.segments.len(), 1);
    assert_eq!(packet.segments[0].review_status, ReviewStatus::Pending);
    assert_eq!(packet.segments[0].sources[0].source_ref, "r_1_1");
    assert_eq!(packet.segments[0].sources[0].source_unit_id, "unit_r_1_1");
    assert_eq!(
        packet.segments[0].sources[0].analysis_text.as_deref(),
        Some("PR0CEDURE DIVISI0N")
    );
    assert_eq!(packet.source_hash, content.source_hash);
    assert!(packet.content_hash.starts_with("sha256:"));
    assert!(packet.plan_hash.starts_with("sha256:"));
    assert!(packet.script_hash.starts_with("sha256:"));

    let mut changed_script = script.clone();
    changed_script.sections[0].segments[0]
        .speech_text
        .push_str(" Outro texto.");
    let changed = build_script_review_packet("plan_1", &changed_script, &plan, &content, &outline)
        .expect("changed script");
    assert_ne!(packet.script_hash, changed.script_hash);
    assert_eq!(packet.content_hash, changed.content_hash);

    let mut second_content = content.clone();
    let mut unit = second_content.source_units[0].clone();
    unit.id = "unit_r_1_1_copy".into();
    unit.analysis_text = None;
    second_content.source_units.push(unit);
    let second_outline = SemanticOutline::skeleton(&second_content).expect("outline");
    let multiple =
        build_script_review_packet("plan_1", &script, &plan, &second_content, &second_outline)
            .expect("multiple units with same reference");
    assert_eq!(multiple.segments[0].sources.len(), 2);
    assert_eq!(multiple.segments[0].sources[1].analysis_text, None);
    assert_ne!(packet.content_hash, multiple.content_hash);
    assert_eq!(packet.source_hash, multiple.source_hash);

    assert!(build_script_review_packet("wrong", &script, &plan, &content, &outline).is_err());
    let mut fabricated = script;
    fabricated.sections[0].segments[0].source_refs = vec!["fabricated".into()];
    assert!(build_script_review_packet("plan_1", &fabricated, &plan, &content, &outline).is_err());
}

#[test]
fn rust_owns_document_v1_to_v2_migration() {
    let v1 = DocumentIr::from_json(DOCUMENT_V1_FIXTURE).expect("v1 fixture");
    let migrated = DocumentIrV2::migrate_from_v1(&v1).expect("migration succeeds");
    assert_eq!(migrated.schema_version, 2);
    assert_eq!(migrated.pages[0].raw_text, v1.pages[0].raw_text);
    assert!(migrated.pages[0]
        .regions
        .iter()
        .all(|region| region.quality_status == audiobook_core::QualityStatus::ReviewRequired));
    assert_eq!(
        migrated.pages[1].extraction_quality,
        audiobook_core::ExtractionQuality::NoText
    );
}

#[test]
fn document_v2_round_trip_preserves_uncertainty_and_code() {
    let document = document_v2();
    let json = document.to_json().expect("v2 document serializes");
    let restored = DocumentIrV2::from_json(&json).expect("serialized v2 document parses");
    assert_eq!(restored, document);
    assert_eq!(restored.pages[0].regions[0].id, "r_1_1");
}

#[test]
fn content_model_rejects_wrong_schema_version() {
    let changed = CONTENT_MODEL_FIXTURE.replace("\"schemaVersion\": 1", "\"schemaVersion\": 2");
    assert!(ContentModel::from_json(&changed).is_err());
}

#[test]
fn content_model_binds_document_identity_and_rejects_empty_analysis_text() {
    let content = ContentModel::from_json(CONTENT_MODEL_FIXTURE).expect("content fixture");
    let mut forged = content.clone();
    forged.source_hash = format!("sha256:{}", "1".repeat(64));
    assert!(forged.validate().is_err());
    assert!(ContentModel::from_json(&serde_json::to_string(&forged).expect("serialize")).is_err());

    let mut empty_text = content;
    empty_text.source_units[0].analysis_text = Some(" ".into());
    assert!(empty_text.validate().is_err());
}

#[test]
fn content_model_preserves_every_region_without_inventing_concepts() {
    let document = document_v2();
    let content = ContentModel::from_document(&document).expect("valid content model");
    assert_eq!(content.source_units.len(), 1);
    assert_eq!(content.source_units[0].source_refs, vec!["r_1_1"]);
    assert!(content.concepts.is_empty());
    assert!(content.relations.is_empty());
}

#[test]
fn content_and_outline_match_checked_in_cross_language_fixtures() {
    let document = document_v2();
    let content = ContentModel::from_document(&document).expect("valid content model");
    let expected_content: serde_json::Value =
        serde_json::from_str(CONTENT_MODEL_FIXTURE).expect("content fixture JSON");
    let actual_content: serde_json::Value =
        serde_json::from_str(&content.to_json().expect("content serializes"))
            .expect("content JSON");
    assert_eq!(actual_content, expected_content);

    let outline = SemanticOutline::skeleton(&content).expect("outline skeleton");
    let expected_outline: serde_json::Value =
        serde_json::from_str(SEMANTIC_OUTLINE_FIXTURE).expect("outline fixture JSON");
    let actual_outline: serde_json::Value =
        serde_json::from_str(&outline.to_json(&content).expect("outline serializes"))
            .expect("outline JSON");
    assert_eq!(actual_outline, expected_outline);
    assert!(outline.sections[0].requires_review);
}

#[test]
fn narrative_normalization_and_heading_overlap_are_core_rules() {
    assert_eq!(
        normalize_narrative_text("  SQLCODE -911: Introdução! "),
        "sqlcode 911 introducao"
    );
    let overlap = compare_heading_to_body(
        "Arquivos indexados",
        "Arquivos indexados permitem acesso por chave.",
    );
    assert_eq!(overlap.status, HeadingOverlapStatus::Duplicate);
    assert_eq!(overlap.method, HeadingOverlapMethod::Prefix);
}

#[test]
fn narrative_memory_does_not_reintroduce_covered_or_resolved_items() {
    let memory = NarrativeMemory {
        schema_version: 1,
        concepts_covered: vec!["PIC".into()],
        terms_defined: vec!["PIC".into()],
        open_threads: vec!["loops".into()],
        current_goal: Some("data".into()),
        next_concepts: vec!["OCCURS".into()],
        source_refs: vec!["r_1_1".into()],
    };
    let reduced = reduce_narrative_memory(
        &memory,
        NarrativeMemoryDelta {
            concepts_covered: vec!["OCCURS".into()],
            terms_defined: vec!["OCCURS".into()],
            open_threads: vec!["REDEFINES".into()],
            resolved_threads: vec!["loops".into()],
            next_concepts: Some(vec!["OCCURS".into(), "REDEFINES".into()]),
            source_refs: vec!["r_1_1".into()],
            ..NarrativeMemoryDelta::default()
        },
    );
    assert_eq!(reduced.concepts_covered, vec!["PIC", "OCCURS"]);
    assert_eq!(reduced.open_threads, vec!["REDEFINES"]);
    assert_eq!(reduced.next_concepts, vec!["REDEFINES"]);
}

#[test]
fn repeated_formulaic_openers_are_review_signals() {
    let texts = vec![
        "Agora vamos entender um.".into(),
        "Agora vamos entender dois.".into(),
        "Outro início.".into(),
        "Agora vamos entender três.".into(),
    ];
    let findings = find_repeated_formulaic_openers(&texts, 3).expect("valid threshold");
    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].count, 3);
}

#[test]
fn narration_qa_fails_duplicated_announced_heading() {
    let plan = plan(SpokenHeadingPolicy::Announce);
    let speech = BTreeMap::from([(
        "section_1".into(),
        "Procedure Division organiza a lógica executável.".into(),
    )]);
    let valid_refs = HashSet::from(["r_1_1".into()]);
    let report = build_narration_qa("plan_1", 1, &plan, &speech, &valid_refs, 0).expect("QA runs");
    assert_eq!(report.status, QaStatus::Fail);
    assert_eq!(report.duplicated_spoken_headings, 1);
}

#[test]
fn narrative_plan_requires_nonempty_provenance() {
    let mut invalid = plan(SpokenHeadingPolicy::Integrate);
    invalid.sections[0].source_refs.clear();
    assert!(invalid.validate().is_err());
}

#[test]
fn narrative_plan_rejects_fabricated_source_reference_against_content_model() {
    let document = document_v2();
    let content = ContentModel::from_document(&document).expect("valid content model");
    let outline = SemanticOutline::skeleton(&content).expect("valid outline");
    let mut plan = plan(SpokenHeadingPolicy::Integrate);
    plan.sections[0].source_refs = vec!["invented".into()];
    assert!(plan.validate_against(&content, &outline).is_err());
}
