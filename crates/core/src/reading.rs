use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::document_v2::{
    DocumentIrV2, ExtractionQuality, QualityStatus, RegionContent, Uncertainty,
};

const MAX_PAGE_CHARS: usize = 8_000;
const MAX_REGION_CHARS: usize = 2_000;
const MAX_SESSION_PAGES: u32 = 10;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ReadingError {
    #[error("page is not present: {0}")]
    MissingPage(u32),
    #[error("page has no reliable native text: {0}")]
    UnreadablePage(u32),
    #[error("page contains unsupported or non-text regions: {0}")]
    UnsupportedPage(u32),
    #[error("page exceeds reading limit: {0}")]
    PageTooLong(u32),
    #[error("page regions do not cover the native text: {0}")]
    IncompletePage(u32),
    #[error("reading range must contain between 1 and 10 pages")]
    InvalidRange,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReadingChunk {
    pub region_id: String,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReadingPreview {
    pub document_id: String,
    pub source_hash: String,
    pub page_number: u32,
    pub chunks: Vec<ReadingChunk>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReadingSession {
    pub document_id: String,
    pub source_hash: String,
    pub start_page: u32,
    pub end_page: u32,
    pub pages: Vec<ReadingPreview>,
}

pub fn build_reading_session(
    document: &DocumentIrV2,
    start_page: u32,
    end_page: u32,
) -> Result<ReadingSession, ReadingError> {
    if start_page == 0 || end_page < start_page || end_page - start_page >= MAX_SESSION_PAGES {
        return Err(ReadingError::InvalidRange);
    }
    let pages = (start_page..=end_page)
        .map(|page| build_reading_preview(document, page))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(ReadingSession {
        document_id: document.document_id.clone(),
        source_hash: document.source_hash.clone(),
        start_page,
        end_page,
        pages,
    })
}

pub fn build_reading_preview(
    document: &DocumentIrV2,
    page_number: u32,
) -> Result<ReadingPreview, ReadingError> {
    let page = document
        .pages
        .iter()
        .find(|page| page.number == page_number)
        .ok_or(ReadingError::MissingPage(page_number))?;
    if page.extraction_quality != ExtractionQuality::Good || page.regions.is_empty() {
        return Err(ReadingError::UnreadablePage(page_number));
    }

    let mut total = 0;
    let mut chunks = Vec::with_capacity(page.regions.len());
    for region in &page.regions {
        let RegionContent::LegacyText { text, .. } = &region.content else {
            return Err(ReadingError::UnsupportedPage(page_number));
        };
        if !matches!(
            region.uncertainty,
            Uncertainty::Uncertain | Uncertainty::SourceConfirmed
        ) || region.quality_status == QualityStatus::Unusable
            || region.sources.raw_text.as_deref() != Some(text)
            || text.trim().is_empty()
        {
            return Err(ReadingError::UnsupportedPage(page_number));
        }
        let length = text.chars().count();
        if length > MAX_REGION_CHARS {
            return Err(ReadingError::PageTooLong(page_number));
        }
        total += length;
        if total > MAX_PAGE_CHARS {
            return Err(ReadingError::PageTooLong(page_number));
        }
        chunks.push(ReadingChunk {
            region_id: region.id.clone(),
            text: text.clone(),
        });
    }
    let native_tokens: Vec<_> = page.raw_text.split_whitespace().collect();
    let chunk_tokens: Vec<_> = chunks
        .iter()
        .flat_map(|chunk| chunk.text.split_whitespace())
        .collect();
    if native_tokens != chunk_tokens {
        return Err(ReadingError::IncompletePage(page_number));
    }
    Ok(ReadingPreview {
        document_id: document.document_id.clone(),
        source_hash: document.source_hash.clone(),
        page_number,
        chunks,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::DocumentIr;

    fn source() -> DocumentIrV2 {
        let v1 = DocumentIr::from_json(include_str!("../../../tests/fixtures/document_ir_v1.json"))
            .unwrap();
        DocumentIrV2::migrate_from_v1(&v1).unwrap()
    }

    #[test]
    fn keeps_source_order_and_text() {
        let document = source();
        let preview = build_reading_preview(&document, 1).unwrap();
        assert_eq!(preview.source_hash, document.source_hash);
        assert_eq!(preview.chunks.len(), 2);
        assert_eq!(preview.chunks[0].region_id, "b_1_1");
        assert_eq!(preview.chunks[0].text, "Olá mundo");
        assert_eq!(preview.chunks[1].text, "Trecho incerto");
    }

    #[test]
    fn rejects_missing_scanned_and_suspect_pages() {
        let mut document = source();
        assert_eq!(
            build_reading_preview(&document, 99),
            Err(ReadingError::MissingPage(99))
        );
        assert_eq!(
            build_reading_preview(&document, 2),
            Err(ReadingError::UnreadablePage(2))
        );
        document.pages[0].extraction_quality = ExtractionQuality::Corrupted;
        assert_eq!(
            build_reading_preview(&document, 1),
            Err(ReadingError::UnreadablePage(1))
        );
    }

    #[test]
    fn rejects_mismatch_and_oversize_without_partial_audio() {
        let mut document = source();
        document.pages[0].regions[0].sources.raw_text = Some("different".into());
        assert_eq!(
            build_reading_preview(&document, 1),
            Err(ReadingError::UnsupportedPage(1))
        );
        let mut document = source();
        document.pages[0].regions[0].quality_status = QualityStatus::Unusable;
        assert_eq!(
            build_reading_preview(&document, 1),
            Err(ReadingError::UnsupportedPage(1))
        );
        let mut document = source();
        let text = "x".repeat(MAX_REGION_CHARS + 1);
        document.pages[0].regions[0].sources.raw_text = Some(text.clone());
        document.pages[0].regions[0].content = RegionContent::LegacyText {
            text,
            source_schema_version: 1,
        };
        assert_eq!(
            build_reading_preview(&document, 1),
            Err(ReadingError::PageTooLong(1))
        );
    }

    #[test]
    fn rejects_silent_omission_from_region_list() {
        let mut document = source();
        document.pages[0].regions.pop();
        assert_eq!(
            build_reading_preview(&document, 1),
            Err(ReadingError::IncompletePage(1))
        );
        let mut document = source();
        document.pages[0].regions[0].sources.raw_text = Some("Olámundo".into());
        document.pages[0].regions[0].content = RegionContent::LegacyText {
            text: "Olámundo".into(),
            source_schema_version: 1,
        };
        assert_eq!(
            build_reading_preview(&document, 1),
            Err(ReadingError::IncompletePage(1))
        );
    }

    #[test]
    fn range_is_atomic_and_limited() {
        let mut document = source();
        assert_eq!(
            build_reading_session(&document, 1, 1).unwrap().pages.len(),
            1
        );
        assert_eq!(
            build_reading_session(&document, 1, 2),
            Err(ReadingError::UnreadablePage(2))
        );
        assert_eq!(
            build_reading_session(&document, 1, 11),
            Err(ReadingError::InvalidRange)
        );
        assert_eq!(
            build_reading_session(&document, 2, 1),
            Err(ReadingError::InvalidRange)
        );
        let mut second = document.pages[0].clone();
        second.number = 2;
        for region in &mut second.regions {
            region.id.push_str("_second");
        }
        document.pages[1] = second;
        let session = build_reading_session(&document, 1, 2).unwrap();
        assert_eq!(session.pages.len(), 2);
        assert_eq!(session.pages[1].chunks[0].text, "Olá mundo");
    }
}
