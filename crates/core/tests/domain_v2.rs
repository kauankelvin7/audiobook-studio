use std::collections::{BTreeMap, HashSet};

use audiobook_core::{
    build_active_narrative_identity, build_narration_qa, build_ocr_candidate_receipt,
    build_ocr_correction_training_record, build_ocr_review_receipt, build_script_review_packet,
    build_validated_narration_qa, compare_heading_to_body, compare_ocr_candidate,
    evaluate_review_against_active, find_repeated_formulaic_openers, normalize_narrative_text,
    reduce_narrative_memory, suggest_ocr_corrections, validate_script_review_submission,
    ActiveReviewStatus, ContentModel, DocumentIr, DocumentIrV2, ExtractionQuality, GenerationJob,
    HeadingOverlapMethod, HeadingOverlapStatus, NarrationEligibility, NarrativeHeading,
    NarrativeMemory, NarrativeMemoryDelta, NarrativePlan, NarrativeScript, NarrativeSection,
    OcrCandidate, OcrCandidateError, OcrCandidateStatus, OcrComparisonStatus, OcrLearningError,
    OcrReviewDisposition, OcrReviewStatus, OcrReviewSubmission, QaStatus, ReviewAttestationStatus,
    ReviewBindingReference, ReviewDecisionError, ReviewStatus, ReviewVerdict, ScriptReviewPacket,
    ScriptReviewSubmission, SegmentReviewDecision, SemanticOutline, SpokenChapter,
    SpokenHeadingPolicy, PAGE_OCR_TARGET_ID,
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

#[test]
fn page_without_native_text_accepts_only_pending_full_page_ocr() {
    let mut document = document_v2();
    let mut page = document.pages[0].clone();
    page.number = 2;
    page.extraction_quality = ExtractionQuality::NoText;
    page.raw_text.clear();
    page.ocr_text = None;
    page.reconstructed_text = None;
    page.regions.clear();
    document.pages.push(page);
    document.validate().unwrap();
    let candidate = OcrCandidate {
        schema_version: 1,
        document_id: document.document_id.clone(),
        source_hash: document.source_hash.clone(),
        page_number: 2,
        region_id: PAGE_OCR_TARGET_ID.into(),
        native_text_hash: audiobook_core::sha256_source(b""),
        image_hash: audiobook_core::sha256_source(b"full page PNG"),
        engine_id: "fixture-engine".into(),
        engine_version: "1".into(),
        text: "Texto da pagina digitalizada".into(),
    };
    let original = document.clone();
    let receipt = build_ocr_candidate_receipt(&document, &candidate).unwrap();
    assert_eq!(receipt.status, OcrCandidateStatus::Pending);
    assert_eq!(receipt.native_private_use_count, 0);
    let comparison = compare_ocr_candidate(&document, &candidate).unwrap();
    assert_eq!(comparison.status, OcrComparisonStatus::ReviewRequired);
    assert!(comparison
        .differences
        .iter()
        .all(|difference| difference.native_count == 0));
    let mut submission = OcrReviewSubmission {
        schema_version: 1,
        receipt_hash: receipt.receipt_hash,
        disposition: OcrReviewDisposition::RetainCandidateForReview,
        rationale: "Sem camada de texto nativa para comparar.".into(),
        proposed_text: None,
    };
    assert_eq!(
        build_ocr_review_receipt(&document, &candidate, &submission)
            .unwrap()
            .status,
        OcrReviewStatus::Unverified
    );
    submission.disposition = OcrReviewDisposition::KeepNative;
    assert_eq!(
        build_ocr_review_receipt(&document, &candidate, &submission),
        Err(OcrCandidateError::InvalidReviewSubmission)
    );
    let mut stale = candidate.clone();
    stale.native_text_hash = audiobook_core::sha256_source(b"invented native text");
    assert_eq!(
        build_ocr_candidate_receipt(&document, &stale),
        Err(OcrCandidateError::StaleNativeText)
    );
    let mut wrong_target = candidate.clone();
    wrong_target.region_id = "__page__:other".into();
    assert_eq!(
        build_ocr_candidate_receipt(&document, &wrong_target),
        Err(OcrCandidateError::UnknownRegion)
    );
    let mut wrong_page = candidate.clone();
    wrong_page.page_number = 1;
    assert_eq!(
        build_ocr_candidate_receipt(&document, &wrong_page),
        Err(OcrCandidateError::UnknownRegion)
    );
    let mut whitespace_page = document.clone();
    whitespace_page.pages[1].raw_text = " ".into();
    assert_eq!(
        build_ocr_candidate_receipt(&whitespace_page, &candidate),
        Err(OcrCandidateError::UnknownRegion)
    );
    let mut real_region_document = document_v2();
    real_region_document.pages[0].regions[0].id = PAGE_OCR_TARGET_ID.into();
    let mut real_region_candidate = candidate.clone();
    real_region_candidate.page_number = 1;
    real_region_candidate.native_text_hash = audiobook_core::sha256_source(
        real_region_document.pages[0].regions[0]
            .sources
            .raw_text
            .as_ref()
            .unwrap()
            .as_bytes(),
    );
    assert!(build_ocr_candidate_receipt(&real_region_document, &real_region_candidate).is_ok());
    let real_region_receipt =
        build_ocr_candidate_receipt(&real_region_document, &real_region_candidate).unwrap();
    submission.receipt_hash = real_region_receipt.receipt_hash;
    assert!(
        build_ocr_review_receipt(&real_region_document, &real_region_candidate, &submission)
            .is_ok()
    );
    assert_eq!(document, original);
}

#[test]
fn ocr_candidate_is_bound_and_remains_pending_without_changing_source() {
    let document = document_v2();
    let region = &document.pages[0].regions[0];
    let native = region
        .sources
        .raw_text
        .as_deref()
        .expect("fixture raw text");
    let candidate = OcrCandidate {
        schema_version: 1,
        document_id: document.document_id.clone(),
        source_hash: document.source_hash.clone(),
        page_number: 1,
        region_id: region.id.clone(),
        native_text_hash: audiobook_core::sha256_source(native.as_bytes()),
        image_hash: audiobook_core::sha256_source(b"rendered region bytes"),
        engine_id: "fixture-engine".into(),
        engine_version: "1".into(),
        text: "Recovered code candidate".into(),
    };
    let original = document.clone();
    let receipt = build_ocr_candidate_receipt(&document, &candidate).expect("bound candidate");
    assert_eq!(document, original);
    assert_eq!(receipt.status, OcrCandidateStatus::Pending);
    assert_eq!(
        receipt.ocr_text_hash,
        audiobook_core::sha256_source(candidate.text.as_bytes())
    );
    assert_eq!(
        receipt,
        build_ocr_candidate_receipt(&document, &candidate).unwrap()
    );
    assert_ne!(receipt.receipt_hash, receipt.ocr_text_hash);
    let complete_identity = serde_json::to_vec(&(
        receipt.schema_version,
        &receipt.document_id,
        &receipt.source_hash,
        &receipt.document_hash,
        receipt.page_number,
        &receipt.region_id,
        &receipt.native_text_hash,
        &receipt.image_hash,
        &receipt.engine_id,
        &receipt.engine_version,
        &receipt.ocr_text_hash,
        receipt.native_private_use_count,
        receipt.ocr_private_use_count,
        receipt.status,
        &receipt.method_version,
    ))
    .unwrap();
    assert_eq!(
        receipt.receipt_hash,
        audiobook_core::sha256_source(&complete_identity)
    );

    let mut stale = candidate.clone();
    stale.native_text_hash = audiobook_core::sha256_source(b"older text");
    assert_eq!(
        build_ocr_candidate_receipt(&document, &stale),
        Err(OcrCandidateError::StaleNativeText)
    );
    let mut wrong_page = candidate.clone();
    wrong_page.page_number = 2;
    assert_eq!(
        build_ocr_candidate_receipt(&document, &wrong_page),
        Err(OcrCandidateError::UnknownRegion)
    );
    let mut wrong_source = candidate.clone();
    wrong_source.source_hash = audiobook_core::sha256_source(b"other PDF");
    assert_eq!(
        build_ocr_candidate_receipt(&document, &wrong_source),
        Err(OcrCandidateError::WrongDocument)
    );
    let mut invalid_image = candidate.clone();
    invalid_image.image_hash = "sha256:bad".into();
    assert_eq!(
        build_ocr_candidate_receipt(&document, &invalid_image),
        Err(OcrCandidateError::InvalidImageHash)
    );
    let mut blank = candidate.clone();
    blank.text = "  ".into();
    assert_eq!(
        build_ocr_candidate_receipt(&document, &blank),
        Err(OcrCandidateError::InvalidText)
    );
    let mut changed = candidate.clone();
    changed.text.push('!');
    assert_ne!(
        receipt.receipt_hash,
        build_ocr_candidate_receipt(&document, &changed)
            .unwrap()
            .receipt_hash
    );
    let mut glyphs = candidate.clone();
    glyphs.text = "\u{E000}".into();
    let glyph_receipt = build_ocr_candidate_receipt(&document, &glyphs).unwrap();
    assert_eq!(glyph_receipt.ocr_private_use_count, 1);
    assert_eq!(glyph_receipt.status, OcrCandidateStatus::Pending);

    let mut ambiguous = candidate.clone();
    ambiguous.text = "PROCEDURE DIVISION".into();
    let comparison = compare_ocr_candidate(&document, &ambiguous).unwrap();
    assert_eq!(comparison.status, OcrComparisonStatus::ReviewRequired);
    assert_eq!(comparison.differing_token_lower_bound, 4);
    assert!(comparison
        .differences
        .iter()
        .any(|difference| difference.token == "PR0CEDURE"
            && difference.contains_digit
            && difference.native_count == 1
            && difference.ocr_count == 0));
    assert!(comparison
        .differences
        .iter()
        .any(|difference| difference.token == "PROCEDURE"
            && !difference.contains_digit
            && difference.native_count == 0
            && difference.ocr_count == 1));
    assert_eq!(
        comparison.receipt_hash,
        build_ocr_candidate_receipt(&document, &ambiguous)
            .unwrap()
            .receipt_hash
    );
    ambiguous.text = native.to_owned();
    let identical = compare_ocr_candidate(&document, &ambiguous).unwrap();
    assert_eq!(identical.differing_token_lower_bound, 0);
    assert_eq!(identical.status, OcrComparisonStatus::ReviewRequired);
}

#[test]
fn ocr_comparison_is_bounded_and_reports_only_observed_differences() {
    let mut document = document_v2();
    let mut candidate = OcrCandidate {
        schema_version: 1,
        document_id: document.document_id.clone(),
        source_hash: document.source_hash.clone(),
        page_number: 1,
        region_id: document.pages[0].regions[0].id.clone(),
        native_text_hash: String::new(),
        image_hash: audiobook_core::sha256_source(b"pixels"),
        engine_id: "fixture".into(),
        engine_version: "1".into(),
        text: "B".into(),
    };
    let set_native = |document: &mut DocumentIrV2, candidate: &mut OcrCandidate, text: String| {
        candidate.native_text_hash = audiobook_core::sha256_source(text.as_bytes());
        document.pages[0].raw_text = text.clone();
        document.pages[0].regions[0].sources.raw_text = Some(text);
    };

    set_native(&mut document, &mut candidate, "A".repeat(1_000_001));
    assert_eq!(
        compare_ocr_candidate(&document, &candidate),
        Err(OcrCandidateError::ComparisonInputTooLarge)
    );

    set_native(&mut document, &mut candidate, "A".into());
    document.pages[0].raw_text = "X".repeat(32_000_001);
    assert_eq!(
        compare_ocr_candidate(&document, &candidate),
        Err(OcrCandidateError::ComparisonInputTooLarge)
    );
    document.pages[0].raw_text = "A".into();

    let native = (0..4_096)
        .map(|index| format!("T{index:04}"))
        .collect::<Vec<_>>()
        .join(" ");
    set_native(&mut document, &mut candidate, native.clone());
    candidate.text = format!("{native} EXTRA");
    let subset = compare_ocr_candidate(&document, &candidate).unwrap();
    assert!(subset.truncated);
    assert_eq!(subset.differing_token_lower_bound, 0);
    assert!(subset.differences.is_empty());
    assert_eq!(subset.status, OcrComparisonStatus::ReviewRequired);

    set_native(&mut document, &mut candidate, "A".repeat(129));
    candidate.text = "B".into();
    let long_token = compare_ocr_candidate(&document, &candidate).unwrap();
    assert!(long_token.truncated);
    assert_eq!(long_token.differing_token_lower_bound, 1);

    let native = (0..300)
        .map(|index| format!("A{index:03}"))
        .collect::<Vec<_>>()
        .join(" ");
    set_native(&mut document, &mut candidate, native);
    candidate.text = "Z".into();
    let limited_output = compare_ocr_candidate(&document, &candidate).unwrap();
    assert_eq!(limited_output.differing_token_lower_bound, 301);
    assert_eq!(limited_output.differences.len(), 256);
    assert_eq!(limited_output.differences[0].token, "A000");
    assert!(limited_output.truncated);
}

#[test]
fn ocr_review_receipt_binds_explicit_unverified_decision() {
    let document = document_v2();
    let native = document.pages[0].regions[0]
        .sources
        .raw_text
        .as_ref()
        .unwrap();
    let candidate = OcrCandidate {
        schema_version: 1,
        document_id: document.document_id.clone(),
        source_hash: document.source_hash.clone(),
        page_number: 1,
        region_id: document.pages[0].regions[0].id.clone(),
        native_text_hash: audiobook_core::sha256_source(native.as_bytes()),
        image_hash: audiobook_core::sha256_source(b"pixels"),
        engine_id: "fixture".into(),
        engine_version: "1".into(),
        text: "PROCEDURE DIVISION".into(),
    };
    let before = document.clone();
    let receipt_hash = build_ocr_candidate_receipt(&document, &candidate)
        .unwrap()
        .receipt_hash;
    let mut submission = OcrReviewSubmission {
        schema_version: 1,
        receipt_hash,
        disposition: OcrReviewDisposition::ProposeCorrection,
        rationale: "Corrigir token técnico após conferir a imagem.".into(),
        proposed_text: Some("PR0CEDURE DIVISION".into()),
    };
    let receipt = build_ocr_review_receipt(&document, &candidate, &submission).unwrap();
    assert_eq!(receipt.status, OcrReviewStatus::Unverified);
    assert_eq!(
        receipt,
        build_ocr_review_receipt(&document, &candidate, &submission).unwrap()
    );
    assert_eq!(document, before);
    submission.rationale.push('!');
    assert_ne!(
        receipt.review_hash,
        build_ocr_review_receipt(&document, &candidate, &submission)
            .unwrap()
            .review_hash
    );
    submission.receipt_hash = audiobook_core::sha256_source(b"forged");
    assert_eq!(
        build_ocr_review_receipt(&document, &candidate, &submission),
        Err(OcrCandidateError::InvalidReviewSubmission)
    );
    submission.receipt_hash = receipt.candidate_receipt_hash;
    submission.rationale = " ".into();
    assert_eq!(
        build_ocr_review_receipt(&document, &candidate, &submission),
        Err(OcrCandidateError::InvalidReviewSubmission)
    );
    submission.rationale = "review".into();
    submission.disposition = OcrReviewDisposition::KeepNative;
    assert_eq!(
        build_ocr_review_receipt(&document, &candidate, &submission),
        Err(OcrCandidateError::InvalidReviewSubmission)
    );
    submission.proposed_text = None;
    let kept = build_ocr_review_receipt(&document, &candidate, &submission).unwrap();
    assert_eq!(kept.status, OcrReviewStatus::Unverified);
    assert_ne!(kept.review_hash, receipt.review_hash);
    let mut stale = candidate.clone();
    stale.text.push('!');
    assert_eq!(
        build_ocr_review_receipt(&document, &stale, &submission),
        Err(OcrCandidateError::InvalidReviewSubmission)
    );
}

#[test]
fn ambiguity_memory_requires_three_distinct_explicit_reviews_and_never_auto_applies() {
    let document = document_v2();
    let native = document.pages[0].regions[0]
        .sources
        .raw_text
        .as_ref()
        .unwrap();
    let candidate = OcrCandidate {
        schema_version: 1,
        document_id: document.document_id.clone(),
        source_hash: document.source_hash.clone(),
        page_number: 1,
        region_id: document.pages[0].regions[0].id.clone(),
        native_text_hash: audiobook_core::sha256_source(native.as_bytes()),
        image_hash: audiobook_core::sha256_source(b"ambiguity pixels"),
        engine_id: "fixture".into(),
        engine_version: "1".into(),
        text: "M0VE T0 SAMPLE01".into(),
    };
    let records = (1..=3)
        .map(|index| {
            let reviewed_candidate = OcrCandidate {
                image_hash: audiobook_core::sha256_source(
                    format!("ambiguity pixels {index}").as_bytes(),
                ),
                ..candidate.clone()
            };
            let receipt_hash = build_ocr_candidate_receipt(&document, &reviewed_candidate)
                .unwrap()
                .receipt_hash;
            build_ocr_correction_training_record(
                &document,
                &reviewed_candidate,
                &OcrReviewSubmission {
                    schema_version: 1,
                    receipt_hash: receipt_hash.clone(),
                    disposition: OcrReviewDisposition::ProposeCorrection,
                    rationale: format!("Conferência explícita {index}."),
                    proposed_text: Some("MOVE TO SAMPLE01".into()),
                },
            )
            .unwrap()
        })
        .collect::<Vec<_>>();
    let two = suggest_ocr_corrections(&document, &candidate, &records[..2]).unwrap();
    assert!(two.suggestions.is_empty());
    assert_eq!(two.suggested_text, candidate.text);

    let same_evidence_reviews = (1..=3)
        .map(|index| {
            let receipt_hash = build_ocr_candidate_receipt(&document, &candidate)
                .unwrap()
                .receipt_hash;
            build_ocr_correction_training_record(
                &document,
                &candidate,
                &OcrReviewSubmission {
                    schema_version: 1,
                    receipt_hash,
                    disposition: OcrReviewDisposition::ProposeCorrection,
                    rationale: format!("Mesma evidência {index}."),
                    proposed_text: Some("MOVE TO SAMPLE01".into()),
                },
            )
            .unwrap()
        })
        .collect::<Vec<_>>();
    assert!(
        suggest_ocr_corrections(&document, &candidate, &same_evidence_reviews)
            .unwrap()
            .suggestions
            .is_empty()
    );

    let report = suggest_ocr_corrections(&document, &candidate, &records).unwrap();
    assert_eq!(report.suggested_text, "MOVE TO SAMPLE01");
    assert_eq!(report.suggestions.len(), 2);
    assert!(report
        .suggestions
        .iter()
        .all(|item| item.evidence_count == 3));
    assert_eq!(
        report.status,
        audiobook_core::OcrCorrectionSuggestionStatus::ReviewRequired
    );

    let invalid = OcrReviewSubmission {
        schema_version: 1,
        receipt_hash: build_ocr_candidate_receipt(&document, &candidate)
            .unwrap()
            .receipt_hash,
        disposition: OcrReviewDisposition::ProposeCorrection,
        rationale: "Mudança ampla.".into(),
        proposed_text: Some("WRITE A DIFFERENT SENTENCE".into()),
    };
    assert_eq!(
        build_ocr_correction_training_record(&document, &candidate, &invalid),
        Err(OcrLearningError::NoEligibleCorrection)
    );
}

#[test]
fn migration_quarantines_private_use_glyphs_without_losing_source_text() {
    let mut v1 = DocumentIr::from_json(DOCUMENT_V1_FIXTURE).expect("v1 fixture");
    v1.pages[0].raw_text.push('\u{E000}');
    v1.pages[0].blocks[0].text.push('\u{E000}');
    let v2 = DocumentIrV2::migrate_from_v1(&v1).expect("migration");
    assert_eq!(
        v2.pages[0].extraction_quality,
        audiobook_core::ExtractionQuality::Corrupted
    );
    assert!(v2.pages[0].raw_text.contains('\u{E000}'));
    let suspect = &v2.pages[0].regions[0];
    assert!(suspect
        .flags
        .iter()
        .any(|flag| flag == "private_use_glyphs_in_native_text"));
    assert_eq!(
        suspect.quality_status,
        audiobook_core::QualityStatus::Unusable
    );
    assert_eq!(
        suspect.uncertainty,
        audiobook_core::Uncertainty::Unsupported
    );
    assert_eq!(
        v2.pages[0].regions[1].quality_status,
        audiobook_core::QualityStatus::ReviewRequired
    );
    let content = ContentModel::from_document(&v2).expect("content model");
    assert_eq!(
        content.source_units[0].narration_eligibility,
        NarrationEligibility::Blocked
    );
    assert_eq!(
        content.source_units[1].narration_eligibility,
        NarrationEligibility::ReviewRequired
    );
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
fn active_narrative_identity_tracks_every_review_dependency() {
    let content = ContentModel::from_json(CONTENT_MODEL_FIXTURE).expect("content fixture");
    let outline =
        SemanticOutline::from_json(SEMANTIC_OUTLINE_FIXTURE, &content).expect("outline fixture");
    let plan = NarrativePlan::from_json(NARRATIVE_PLAN_FIXTURE).expect("plan fixture");
    let script = NarrativeScript::from_json(NARRATIVE_SCRIPT_FIXTURE).expect("script fixture");
    let identity = build_active_narrative_identity("plan_1", &script, &plan, &content, &outline)
        .expect("valid active identity");
    let packet = build_script_review_packet("plan_1", &script, &plan, &content, &outline)
        .expect("review packet");
    assert_eq!(identity.source_hash, packet.source_hash);
    assert_eq!(identity.content_hash, packet.content_hash);
    assert!(identity.outline_hash.starts_with("sha256:"));
    assert_eq!(identity.plan_hash, packet.plan_hash);
    assert_eq!(identity.script_hash, packet.script_hash);
    assert!(identity.identity_hash.starts_with("sha256:"));
    assert_eq!(
        identity,
        build_active_narrative_identity("plan_1", &script, &plan, &content, &outline).unwrap()
    );

    let mut changed_script = script.clone();
    changed_script.sections[0].segments[0]
        .speech_text
        .push_str(" Outro texto.");
    let changed =
        build_active_narrative_identity("plan_1", &changed_script, &plan, &content, &outline)
            .expect("changed script");
    assert_ne!(identity.script_hash, changed.script_hash);
    assert_ne!(identity.identity_hash, changed.identity_hash);
    assert!(build_active_narrative_identity("other", &script, &plan, &content, &outline).is_err());
}

#[test]
fn active_narrative_publication_requires_verifying_state() {
    let verifying =
        GenerationJob::from_json(r#"{"state":"VERIFYING","resumeState":null}"#).expect("valid job");
    verifying
        .ensure_narrative_activation_allowed()
        .expect("verification can publish");
    for state in [
        "READY_FOR_AUDIO",
        "SYNTHESIZING",
        "COMPLETED",
        "WAITING_USER",
    ] {
        let resume = if state == "WAITING_USER" {
            "\"VERIFYING\""
        } else {
            "null"
        };
        let json = format!(r#"{{"state":"{state}","resumeState":{resume}}}"#);
        let job = GenerationJob::from_json(&json).expect("valid job state");
        assert!(job.ensure_narrative_activation_allowed().is_err());
    }
}

#[test]
fn active_review_evaluation_revalidates_without_attesting() {
    let content = ContentModel::from_json(CONTENT_MODEL_FIXTURE).expect("content fixture");
    let outline =
        SemanticOutline::from_json(SEMANTIC_OUTLINE_FIXTURE, &content).expect("outline fixture");
    let plan = NarrativePlan::from_json(NARRATIVE_PLAN_FIXTURE).expect("plan fixture");
    let script = NarrativeScript::from_json(NARRATIVE_SCRIPT_FIXTURE).expect("script fixture");
    let packet =
        build_script_review_packet("plan_1", &script, &plan, &content, &outline).expect("packet");
    let submission = supported_submission(&packet);
    let active = build_active_narrative_identity("plan_1", &script, &plan, &content, &outline)
        .expect("active identity");
    let evaluation = evaluate_review_against_active(
        "plan_1",
        &script,
        &plan,
        &content,
        &outline,
        &submission,
        ReviewBindingReference {
            active_identity_hash: &active.identity_hash,
            stored_binding_hash: None,
        },
    )
    .expect("review revalidated against active context");
    assert_eq!(evaluation.status, ActiveReviewStatus::NotEstablished);
    assert_eq!(evaluation.active_identity_hash, active.identity_hash);
    assert!(evaluation.submission_hash.starts_with("sha256:"));
    let bound = evaluate_review_against_active(
        "plan_1",
        &script,
        &plan,
        &content,
        &outline,
        &submission,
        ReviewBindingReference {
            active_identity_hash: &active.identity_hash,
            stored_binding_hash: Some(&evaluation.binding_hash),
        },
    )
    .expect("persisted binding matches");
    assert_eq!(bound.status, ActiveReviewStatus::BoundUnverified);
    assert_eq!(bound.binding_hash, evaluation.binding_hash);
    assert_eq!(
        evaluate_review_against_active(
            "plan_1",
            &script,
            &plan,
            &content,
            &outline,
            &submission,
            ReviewBindingReference {
                active_identity_hash: &active.identity_hash,
                stored_binding_hash: Some(&format!("sha256:{}", "0".repeat(64)))
            },
        ),
        Err(ReviewDecisionError::InvalidBinding)
    );

    let mut changed_outline = outline.clone();
    changed_outline.sections[0].requires_review = false;
    assert_eq!(
        evaluate_review_against_active(
            "plan_1",
            &script,
            &plan,
            &content,
            &changed_outline,
            &submission,
            ReviewBindingReference {
                active_identity_hash: &active.identity_hash,
                stored_binding_hash: None
            },
        ),
        Err(ReviewDecisionError::InactiveNarrative)
    );
    assert_eq!(
        evaluate_review_against_active(
            "plan_1",
            &script,
            &plan,
            &content,
            &outline,
            &submission,
            ReviewBindingReference {
                active_identity_hash: &format!("sha256:{}", "0".repeat(64)),
                stored_binding_hash: None
            },
        ),
        Err(ReviewDecisionError::InactiveNarrative)
    );
}

fn supported_submission(packet: &ScriptReviewPacket) -> ScriptReviewSubmission {
    ScriptReviewSubmission {
        schema_version: 1,
        plan_id: packet.plan_id.clone(),
        document_id: packet.document_id.clone(),
        source_hash: packet.source_hash.clone(),
        content_hash: packet.content_hash.clone(),
        plan_hash: packet.plan_hash.clone(),
        script_hash: packet.script_hash.clone(),
        decisions: packet
            .segments
            .iter()
            .map(|segment| SegmentReviewDecision {
                segment_id: segment.segment_id.clone(),
                verdict: ReviewVerdict::Supported,
                evidence_source_unit_ids: vec![segment.sources[0].source_unit_id.clone()],
                rationale: "Trecho conferido com a fonte indicada.".into(),
            })
            .collect(),
    }
}

#[test]
fn review_submission_is_bound_to_current_artifacts_and_never_attested() {
    let content = ContentModel::from_json(CONTENT_MODEL_FIXTURE).expect("content fixture");
    let outline =
        SemanticOutline::from_json(SEMANTIC_OUTLINE_FIXTURE, &content).expect("outline fixture");
    let plan = NarrativePlan::from_json(NARRATIVE_PLAN_FIXTURE).expect("plan fixture");
    let script = NarrativeScript::from_json(NARRATIVE_SCRIPT_FIXTURE).expect("script fixture");
    let packet = build_script_review_packet("plan_1", &script, &plan, &content, &outline)
        .expect("review packet");
    let submission = supported_submission(&packet);
    let receipt = validate_script_review_submission(
        "plan_1",
        &script,
        &plan,
        &content,
        &outline,
        &submission,
    )
    .expect("structurally valid submission");
    assert_eq!(
        receipt.attestation_status,
        ReviewAttestationStatus::Unverified
    );
    assert_eq!(receipt.reviewed_segments, packet.segments.len());
    assert_eq!(receipt.script_hash, packet.script_hash);
    assert_eq!(receipt.plan_id, packet.plan_id);
    assert_eq!(receipt.document_id, packet.document_id);
    assert!(receipt.submission_hash.starts_with("sha256:"));
    let mut unsupported = submission.clone();
    unsupported.decisions[0].verdict = ReviewVerdict::Unsupported;
    let unsupported_receipt = validate_script_review_submission(
        "plan_1",
        &script,
        &plan,
        &content,
        &outline,
        &unsupported,
    )
    .expect("unsupported decision can be recorded without approval");
    assert_ne!(receipt.submission_hash, unsupported_receipt.submission_hash);
    assert_eq!(
        unsupported_receipt.attestation_status,
        ReviewAttestationStatus::Unverified
    );
    assert_eq!(
        script
            .build_qa("plan_1", &plan, &content, &outline)
            .expect("QA remains separate")
            .status,
        QaStatus::Review
    );
    let json = serde_json::to_string(&submission).expect("serialize submission");
    assert_eq!(
        ScriptReviewSubmission::from_json(&json).unwrap(),
        submission
    );
    assert!(ScriptReviewSubmission::from_json("{bad").is_err());

    let mut stale = submission.clone();
    stale.script_hash = format!("sha256:{}", "0".repeat(64));
    assert_eq!(
        validate_script_review_submission("plan_1", &script, &plan, &content, &outline, &stale),
        Err(ReviewDecisionError::StaleSubmission)
    );
    let mut changed_script = script.clone();
    changed_script.sections[0].segments[0]
        .speech_text
        .push_str(" Alteração.");
    assert_eq!(
        validate_script_review_submission(
            "plan_1",
            &changed_script,
            &plan,
            &content,
            &outline,
            &submission
        ),
        Err(ReviewDecisionError::StaleSubmission)
    );
    for field in [
        "sourceHash",
        "contentHash",
        "planHash",
        "documentId",
        "planId",
    ] {
        let mut json: serde_json::Value = serde_json::from_str(&json).expect("submission JSON");
        json[field] = serde_json::Value::String("forged".into());
        let forged = ScriptReviewSubmission::from_json(&json.to_string()).expect("shape parses");
        assert_eq!(
            validate_script_review_submission(
                "plan_1", &script, &plan, &content, &outline, &forged
            ),
            Err(ReviewDecisionError::StaleSubmission),
            "field: {field}"
        );
    }
}

#[test]
fn review_submission_requires_complete_unique_segments_and_real_text_evidence() {
    let content = ContentModel::from_json(CONTENT_MODEL_FIXTURE).expect("content fixture");
    let outline =
        SemanticOutline::from_json(SEMANTIC_OUTLINE_FIXTURE, &content).expect("outline fixture");
    let plan = NarrativePlan::from_json(NARRATIVE_PLAN_FIXTURE).expect("plan fixture");
    let mut script = NarrativeScript::from_json(NARRATIVE_SCRIPT_FIXTURE).expect("script fixture");
    let packet = build_script_review_packet("plan_1", &script, &plan, &content, &outline)
        .expect("review packet");
    let submission = supported_submission(&packet);
    let check = |value: &ScriptReviewSubmission| {
        validate_script_review_submission("plan_1", &script, &plan, &content, &outline, value)
    };

    let mut duplicate = submission.clone();
    duplicate.decisions.push(duplicate.decisions[0].clone());
    assert!(matches!(
        check(&duplicate),
        Err(ReviewDecisionError::DuplicateSegment(_))
    ));
    let mut missing = submission.clone();
    missing.decisions.clear();
    assert_eq!(
        check(&missing),
        Err(ReviewDecisionError::IncompleteCoverage)
    );
    let mut unknown = submission.clone();
    unknown.decisions[0].segment_id = "invented".into();
    assert!(matches!(
        check(&unknown),
        Err(ReviewDecisionError::UnknownSegment(_))
    ));
    let mut no_reason = submission.clone();
    no_reason.decisions[0].rationale = " ".into();
    assert!(matches!(
        check(&no_reason),
        Err(ReviewDecisionError::EmptyRationale(_))
    ));
    let mut no_evidence = submission.clone();
    no_evidence.decisions[0].evidence_source_unit_ids.clear();
    assert!(matches!(
        check(&no_evidence),
        Err(ReviewDecisionError::MissingEvidence(_))
    ));
    let mut fake_evidence = submission.clone();
    fake_evidence.decisions[0].evidence_source_unit_ids = vec!["invented".into()];
    assert!(matches!(
        check(&fake_evidence),
        Err(ReviewDecisionError::UnknownEvidence(_))
    ));
    let mut repeated_evidence = submission.clone();
    let repeated_id = repeated_evidence.decisions[0].evidence_source_unit_ids[0].clone();
    repeated_evidence.decisions[0]
        .evidence_source_unit_ids
        .push(repeated_id);
    assert!(matches!(
        check(&repeated_evidence),
        Err(ReviewDecisionError::DuplicateEvidence(_))
    ));

    let mut textless_content = content.clone();
    textless_content.source_units[0].analysis_text = None;
    let textless_outline = SemanticOutline::skeleton(&textless_content).expect("outline");
    let textless_packet = build_script_review_packet(
        "plan_1",
        &script,
        &plan,
        &textless_content,
        &textless_outline,
    )
    .expect("textless source remains reviewable");
    let mut textless_submission = supported_submission(&textless_packet);
    assert!(matches!(
        validate_script_review_submission(
            "plan_1",
            &script,
            &plan,
            &textless_content,
            &textless_outline,
            &textless_submission
        ),
        Err(ReviewDecisionError::MissingSourceText(_))
    ));
    let mut blocked_content = content.clone();
    blocked_content.source_units[0].narration_eligibility = NarrationEligibility::Blocked;
    let blocked_outline = SemanticOutline::skeleton(&blocked_content).expect("outline");
    let blocked_packet =
        build_script_review_packet("plan_1", &script, &plan, &blocked_content, &blocked_outline)
            .expect("blocked source remains reviewable");
    assert!(matches!(
        validate_script_review_submission(
            "plan_1",
            &script,
            &plan,
            &blocked_content,
            &blocked_outline,
            &supported_submission(&blocked_packet)
        ),
        Err(ReviewDecisionError::BlockedEvidence(_))
    ));
    textless_submission.decisions[0].verdict = ReviewVerdict::NeedsEvidence;
    textless_submission.decisions[0]
        .evidence_source_unit_ids
        .clear();
    assert_eq!(
        validate_script_review_submission(
            "plan_1",
            &script,
            &plan,
            &textless_content,
            &textless_outline,
            &textless_submission
        )
        .expect("needs evidence can be recorded")
        .attestation_status,
        ReviewAttestationStatus::Unverified
    );

    let mut second = script.sections[0].segments[0].clone();
    second.id = "segment_2".into();
    script.sections[0].segments.push(second);
    assert_eq!(
        validate_script_review_submission(
            "plan_1",
            &script,
            &plan,
            &content,
            &outline,
            &submission
        ),
        Err(ReviewDecisionError::StaleSubmission)
    );
}

#[test]
fn supported_review_requires_evidence_for_every_segment_source_reference() {
    let mut content = ContentModel::from_json(CONTENT_MODEL_FIXTURE).expect("content fixture");
    let mut second_unit = content.source_units[0].clone();
    second_unit.id = "unit_r_1_2".into();
    second_unit.source_refs = vec!["r_1_2".into()];
    second_unit.analysis_text = None;
    content.source_units.push(second_unit);
    let outline = SemanticOutline::skeleton(&content).expect("outline");
    let mut plan = NarrativePlan::from_json(NARRATIVE_PLAN_FIXTURE).expect("plan fixture");
    plan.sections[0].transition = Some(audiobook_core::NarrativeTransition {
        text: "Ligação entre trechos".into(),
        relation: "sequence".into(),
        source_refs: vec!["r_1_2".into()],
    });
    let mut script = NarrativeScript::from_json(NARRATIVE_SCRIPT_FIXTURE).expect("script fixture");
    script.sections[0].segments[0]
        .source_refs
        .push("r_1_2".into());
    let packet = build_script_review_packet("plan_1", &script, &plan, &content, &outline)
        .expect("review packet");
    let mut submission = supported_submission(&packet);
    assert_eq!(
        validate_script_review_submission(
            "plan_1",
            &script,
            &plan,
            &content,
            &outline,
            &submission,
        ),
        Err(ReviewDecisionError::MissingReferenceEvidence {
            segment_id: "segment_1".into(),
            source_ref: "r_1_2".into(),
        })
    );
    submission.decisions[0]
        .evidence_source_unit_ids
        .push("unit_r_1_2".into());
    assert!(matches!(
        validate_script_review_submission(
            "plan_1",
            &script,
            &plan,
            &content,
            &outline,
            &submission,
        ),
        Err(ReviewDecisionError::MissingSourceText(_))
    ));

    content.source_units[1].analysis_text = Some("Texto da transição".into());
    let updated_outline = SemanticOutline::skeleton(&content).expect("updated outline");
    let updated_packet =
        build_script_review_packet("plan_1", &script, &plan, &content, &updated_outline)
            .expect("updated packet");
    let mut complete = supported_submission(&updated_packet);
    complete.decisions[0]
        .evidence_source_unit_ids
        .push("unit_r_1_2".into());
    assert_eq!(
        validate_script_review_submission(
            "plan_1",
            &script,
            &plan,
            &content,
            &updated_outline,
            &complete,
        )
        .expect("all references are covered")
        .attestation_status,
        ReviewAttestationStatus::Unverified
    );
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
