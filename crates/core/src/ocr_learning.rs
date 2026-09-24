use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::{
    build_ocr_candidate_receipt, build_ocr_review_receipt, sha256_source, DocumentIrV2,
    OcrCandidate, OcrReviewDisposition, OcrReviewSubmission,
};

const MAX_TRAINING_RECORDS: usize = 1_024;
const MAX_RULES_PER_RECORD: usize = 64;
const MAX_TOKEN_BYTES: usize = 128;
const MIN_CONFIRMATIONS: usize = 3;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum OcrLearningError {
    #[error("OCR learning input is invalid")]
    InvalidInput,
    #[error("OCR learning record is invalid")]
    InvalidRecord,
    #[error("OCR learning record contains no eligible ambiguity correction")]
    NoEligibleCorrection,
    #[error("OCR learning input exceeds its safe limit")]
    InputTooLarge,
    #[error("OCR learning data cannot be serialized")]
    Serialization,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OcrCorrectionRule {
    pub observed_token: String,
    pub corrected_token: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OcrCorrectionTrainingRecord {
    pub schema_version: u32,
    pub source_hash: String,
    pub candidate_receipt_hash: String,
    pub review_hash: String,
    pub rules: Vec<OcrCorrectionRule>,
    pub record_hash: String,
    pub method_version: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OcrCorrectionSuggestionStatus {
    ReviewRequired,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OcrCorrectionSuggestion {
    pub observed_token: String,
    pub suggested_token: String,
    pub evidence_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OcrCorrectionSuggestionReport {
    pub schema_version: u32,
    pub candidate_receipt_hash: String,
    pub candidate_text_hash: String,
    pub training_record_count: usize,
    pub accepted_rule_count: usize,
    pub suggestions: Vec<OcrCorrectionSuggestion>,
    pub suggested_text: String,
    pub status: OcrCorrectionSuggestionStatus,
    pub method_version: String,
}

pub fn build_ocr_correction_training_record(
    document: &DocumentIrV2,
    candidate: &OcrCandidate,
    submission: &OcrReviewSubmission,
) -> Result<OcrCorrectionTrainingRecord, OcrLearningError> {
    let receipt = build_ocr_review_receipt(document, candidate, submission)
        .map_err(|_| OcrLearningError::InvalidInput)?;
    if receipt.disposition != OcrReviewDisposition::ProposeCorrection {
        return Err(OcrLearningError::NoEligibleCorrection);
    }
    let proposed = receipt
        .proposed_text
        .as_deref()
        .ok_or(OcrLearningError::NoEligibleCorrection)?;
    let rules = derive_rules(&candidate.text, proposed);
    if rules.is_empty() {
        return Err(OcrLearningError::NoEligibleCorrection);
    }
    let method_version = "ocr-ambiguity-memory-rust-v1";
    let candidate_receipt = build_ocr_candidate_receipt(document, candidate)
        .map_err(|_| OcrLearningError::InvalidInput)?;
    let record_hash = record_hash(
        &candidate.source_hash,
        &candidate_receipt.receipt_hash,
        &receipt.review_hash,
        &rules,
        method_version,
    )?;
    Ok(OcrCorrectionTrainingRecord {
        schema_version: 1,
        source_hash: candidate.source_hash.clone(),
        candidate_receipt_hash: candidate_receipt.receipt_hash,
        review_hash: receipt.review_hash,
        rules,
        record_hash,
        method_version: method_version.to_owned(),
    })
}

pub fn suggest_ocr_corrections(
    document: &DocumentIrV2,
    candidate: &OcrCandidate,
    records: &[OcrCorrectionTrainingRecord],
) -> Result<OcrCorrectionSuggestionReport, OcrLearningError> {
    if records.len() > MAX_TRAINING_RECORDS {
        return Err(OcrLearningError::InputTooLarge);
    }
    let candidate_receipt = build_ocr_candidate_receipt(document, candidate)
        .map_err(|_| OcrLearningError::InvalidInput)?;
    let mut seen_evidence = BTreeSet::new();
    let mut votes: BTreeMap<String, BTreeMap<String, usize>> = BTreeMap::new();
    for record in records {
        validate_record(record)?;
        if !seen_evidence.insert(record.candidate_receipt_hash.as_str()) {
            continue;
        }
        for rule in &record.rules {
            let count = votes
                .entry(rule.observed_token.clone())
                .or_default()
                .entry(rule.corrected_token.clone())
                .or_insert(0);
            *count = count.saturating_add(1);
        }
    }
    let mut accepted = BTreeMap::new();
    for (observed, alternatives) in votes {
        let mut ranked = alternatives.into_iter().collect::<Vec<_>>();
        ranked.sort_by(|left, right| right.1.cmp(&left.1).then_with(|| left.0.cmp(&right.0)));
        let Some((suggested, evidence_count)) = ranked.first() else {
            continue;
        };
        let tied = ranked
            .get(1)
            .is_some_and(|second| second.1 == *evidence_count);
        if *evidence_count >= MIN_CONFIRMATIONS && !tied {
            accepted.insert(observed.clone(), (suggested.clone(), *evidence_count));
        }
    }
    let (suggested_text, seen_tokens) = replace_accepted_tokens(&candidate.text, &accepted);
    let suggestions = seen_tokens
        .into_iter()
        .filter_map(|observed| {
            accepted
                .get(&observed)
                .map(|(suggested, evidence_count)| OcrCorrectionSuggestion {
                    observed_token: observed,
                    suggested_token: suggested.clone(),
                    evidence_count: *evidence_count,
                })
        })
        .collect();
    Ok(OcrCorrectionSuggestionReport {
        schema_version: 1,
        candidate_receipt_hash: candidate_receipt.receipt_hash,
        candidate_text_hash: sha256_source(candidate.text.as_bytes()),
        training_record_count: seen_evidence.len(),
        accepted_rule_count: accepted.len(),
        suggestions,
        suggested_text,
        status: OcrCorrectionSuggestionStatus::ReviewRequired,
        method_version: "ocr-ambiguity-suggestion-rust-v1".to_owned(),
    })
}

fn derive_rules(observed: &str, corrected: &str) -> Vec<OcrCorrectionRule> {
    let observed_tokens = ascii_tokens(observed);
    let corrected_tokens = ascii_tokens(corrected);
    if observed_tokens.len() != corrected_tokens.len()
        || observed_tokens.len() > MAX_RULES_PER_RECORD
    {
        return Vec::new();
    }
    let mut rules = BTreeSet::new();
    for (observed_token, corrected_token) in observed_tokens.iter().zip(corrected_tokens) {
        if observed_token != &corrected_token
            && valid_ambiguity_rule(observed_token, &corrected_token)
        {
            rules.insert((observed_token.clone(), corrected_token));
        }
    }
    rules
        .into_iter()
        .map(|(observed_token, corrected_token)| OcrCorrectionRule {
            observed_token,
            corrected_token,
        })
        .collect()
}

fn validate_record(record: &OcrCorrectionTrainingRecord) -> Result<(), OcrLearningError> {
    if record.schema_version != 1
        || record.method_version != "ocr-ambiguity-memory-rust-v1"
        || !is_sha256(&record.source_hash)
        || !is_sha256(&record.candidate_receipt_hash)
        || !is_sha256(&record.review_hash)
        || !is_sha256(&record.record_hash)
        || record.rules.is_empty()
        || record.rules.len() > MAX_RULES_PER_RECORD
    {
        return Err(OcrLearningError::InvalidRecord);
    }
    let mut unique = BTreeSet::new();
    for rule in &record.rules {
        if !valid_ambiguity_rule(&rule.observed_token, &rule.corrected_token)
            || !unique.insert((&rule.observed_token, &rule.corrected_token))
        {
            return Err(OcrLearningError::InvalidRecord);
        }
    }
    let expected = record_hash(
        &record.source_hash,
        &record.candidate_receipt_hash,
        &record.review_hash,
        &record.rules,
        &record.method_version,
    )?;
    if expected != record.record_hash {
        return Err(OcrLearningError::InvalidRecord);
    }
    Ok(())
}

fn record_hash(
    source_hash: &str,
    candidate_receipt_hash: &str,
    review_hash: &str,
    rules: &[OcrCorrectionRule],
    method_version: &str,
) -> Result<String, OcrLearningError> {
    let bytes = serde_json::to_vec(&(
        1u32,
        source_hash,
        candidate_receipt_hash,
        review_hash,
        rules,
        method_version,
    ))
    .map_err(|_| OcrLearningError::Serialization)?;
    Ok(sha256_source(&bytes))
}

fn valid_ambiguity_rule(observed: &str, corrected: &str) -> bool {
    if observed.is_empty()
        || observed.len() < 2
        || observed.len() > MAX_TOKEN_BYTES
        || observed.len() != corrected.len()
        || !observed
            .bytes()
            .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit() || byte == b'-')
        || !corrected
            .bytes()
            .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit() || byte == b'-')
        || (!observed.bytes().any(|byte| byte.is_ascii_digit())
            && !corrected.bytes().any(|byte| byte.is_ascii_digit()))
    {
        return false;
    }
    let differences = observed
        .bytes()
        .zip(corrected.bytes())
        .filter(|(left, right)| left != right)
        .collect::<Vec<_>>();
    !differences.is_empty()
        && differences.len() <= 4
        && differences.into_iter().all(|(left, right)| {
            matches!(
                (left, right),
                (b'0', b'O')
                    | (b'O', b'0')
                    | (b'1', b'I')
                    | (b'I', b'1')
                    | (b'1', b'L')
                    | (b'L', b'1')
                    | (b'5', b'S')
                    | (b'S', b'5')
                    | (b'8', b'B')
                    | (b'B', b'8')
            )
        })
}

fn ascii_tokens(text: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut token = String::new();
    let finish = |token: &mut String, tokens: &mut Vec<String>| {
        let normalized = token.trim_matches('-');
        if !normalized.is_empty() && normalized.len() <= MAX_TOKEN_BYTES {
            tokens.push(normalized.to_owned());
        }
        token.clear();
    };
    for character in text.chars() {
        if character.is_ascii_alphanumeric() || character == '-' {
            token.push(character.to_ascii_uppercase());
        } else {
            finish(&mut token, &mut tokens);
        }
    }
    finish(&mut token, &mut tokens);
    tokens
}

fn replace_accepted_tokens(
    text: &str,
    accepted: &BTreeMap<String, (String, usize)>,
) -> (String, BTreeSet<String>) {
    let mut output = String::with_capacity(text.len());
    let mut token = String::new();
    let mut seen = BTreeSet::new();
    let finish = |token: &mut String, output: &mut String, seen: &mut BTreeSet<String>| {
        let normalized = token.trim_matches('-').to_ascii_uppercase();
        if normalized.len() == token.len() {
            if let Some((replacement, _)) = accepted.get(&normalized) {
                output.push_str(replacement);
                seen.insert(normalized);
            } else {
                output.push_str(token);
            }
        } else {
            output.push_str(token);
        }
        token.clear();
    };
    for character in text.chars() {
        if character.is_ascii_alphanumeric() || character == '-' {
            token.push(character);
        } else {
            finish(&mut token, &mut output, &mut seen);
            output.push(character);
        }
    }
    finish(&mut token, &mut output, &mut seen);
    (output, seen)
}

fn is_sha256(value: &str) -> bool {
    value.strip_prefix("sha256:").is_some_and(|digest| {
        digest.len() == 64
            && digest
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    })
}
