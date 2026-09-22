use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::document::{BlockType, DocumentIr, TextQuality};

pub const DOCUMENT_IR_V2_SCHEMA_VERSION: u32 = 2;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum DocumentV2Error {
    #[error("invalid JSON: {0}")]
    InvalidJson(String),
    #[error("unsupported DocumentIR v2 schema version: {0}")]
    UnsupportedSchemaVersion(u32),
    #[error("document ID does not match source hash")]
    InvalidDocumentId,
    #[error("document must contain at least one page")]
    EmptyDocument,
    #[error("page order mismatch: expected {expected}, found {found}")]
    InvalidPageOrder { expected: u32, found: u32 },
    #[error("duplicate region ID: {0}")]
    DuplicateRegionId(String),
    #[error("region has no source layer: {0}")]
    EmptySourceLayers(String),
    #[error("region content does not match region type: {0}")]
    InvalidRegionContent(String),
    #[error("unsupported region cannot be accepted: {0}")]
    UnsupportedAccepted(String),
    #[error("table has inconsistent width: {0}")]
    InvalidTable(String),
    #[error("visual interpretation requires confirmed evidence: {0}")]
    UnconfirmedVisualInterpretation(String),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DocumentIrV2 {
    pub schema_version: u32,
    pub document_id: String,
    pub source_hash: String,
    pub language: Option<String>,
    pub pages: Vec<DocumentPageV2>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DocumentPageV2 {
    pub number: u32,
    pub extraction_quality: ExtractionQuality,
    pub raw_text: String,
    pub ocr_text: Option<String>,
    pub reconstructed_text: Option<String>,
    pub regions: Vec<DocumentRegionV2>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExtractionQuality {
    Good,
    Partial,
    NoText,
    Corrupted,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RegionType {
    Heading,
    Paragraph,
    List,
    Code,
    Table,
    Formula,
    Figure,
    Diagram,
    Chart,
    Caption,
    Quote,
    Toc,
    Header,
    Footer,
    Reference,
    Metadata,
    Corrupted,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Uncertainty {
    SourceConfirmed,
    OcrConfirmed,
    Reconstructed,
    Inferred,
    Uncertain,
    Unsupported,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QualityStatus {
    Accepted,
    Reconciled,
    Reconstructed,
    ReviewRequired,
    Unusable,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceLayers {
    pub raw_text: Option<String>,
    pub ocr_text: Option<String>,
    pub reconstructed_text: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DocumentRegionV2 {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: RegionType,
    pub bbox: Option<[f64; 4]>,
    pub language: Option<String>,
    pub sources: SourceLayers,
    pub content: RegionContent,
    pub uncertainty: Uncertainty,
    pub quality_status: QualityStatus,
    pub confidence: Option<f64>,
    pub flags: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", rename_all_fields = "camelCase")]
pub enum RegionContent {
    Text {
        display_text: String,
    },
    Code {
        source_text: String,
        detected_language: Option<String>,
        suspicious_tokens: Vec<String>,
    },
    Table {
        headers: Vec<String>,
        rows: Vec<Vec<String>>,
    },
    Formula {
        source_representation: String,
        display_representation: String,
        speech_representation: Option<String>,
    },
    Visual {
        visual_type: VisualType,
        image_hash: String,
        disposition: VisualDisposition,
        description: Option<String>,
    },
    LegacyText {
        text: String,
        source_schema_version: u32,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VisualType {
    Image,
    Diagram,
    Chart,
    Screenshot,
    Flowchart,
    UnknownVisual,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VisualDisposition {
    Ignore,
    Describe,
    Interpret,
    ReviewRequired,
}

impl DocumentIrV2 {
    pub fn migrate_from_v1(document: &DocumentIr) -> Result<Self, DocumentV2Error> {
        let pages = document
            .pages
            .iter()
            .map(|page| DocumentPageV2 {
                number: page.number,
                extraction_quality: match page.text_quality {
                    TextQuality::Extracted => ExtractionQuality::Good,
                    TextQuality::NeedsOcr => ExtractionQuality::NoText,
                },
                raw_text: page.raw_text.clone(),
                ocr_text: None,
                reconstructed_text: None,
                regions: page
                    .blocks
                    .iter()
                    .map(|block| DocumentRegionV2 {
                        id: block.id.clone(),
                        kind: map_block_type(block.kind),
                        bbox: block.bbox.map(|bbox| bbox.map(f64::from)),
                        language: block.language.clone(),
                        sources: SourceLayers {
                            raw_text: Some(block.text.clone()),
                            ocr_text: None,
                            reconstructed_text: None,
                        },
                        content: RegionContent::LegacyText {
                            text: block.text.clone(),
                            source_schema_version: 1,
                        },
                        uncertainty: Uncertainty::Uncertain,
                        quality_status: QualityStatus::ReviewRequired,
                        confidence: block.confidence.map(f64::from),
                        flags: block
                            .flags
                            .iter()
                            .cloned()
                            .chain(std::iter::once(
                                "migrated_from_v1_requires_source_review".to_owned(),
                            ))
                            .collect(),
                    })
                    .collect(),
            })
            .collect();

        let migrated = Self {
            schema_version: DOCUMENT_IR_V2_SCHEMA_VERSION,
            document_id: document.document_id.clone(),
            source_hash: document.source_hash.clone(),
            language: document.language.clone(),
            pages,
        };
        migrated.validate()?;
        Ok(migrated)
    }

    pub fn from_json(input: &str) -> Result<Self, DocumentV2Error> {
        let value: serde_json::Value = serde_json::from_str(input)
            .map_err(|error| DocumentV2Error::InvalidJson(error.to_string()))?;
        let version = value
            .get("schemaVersion")
            .and_then(serde_json::Value::as_u64)
            .ok_or_else(|| DocumentV2Error::InvalidJson("missing schemaVersion".into()))?;
        if version != u64::from(DOCUMENT_IR_V2_SCHEMA_VERSION) {
            return Err(DocumentV2Error::UnsupportedSchemaVersion(
                u32::try_from(version).unwrap_or(u32::MAX),
            ));
        }
        let document: Self = serde_json::from_value(value)
            .map_err(|error| DocumentV2Error::InvalidJson(error.to_string()))?;
        document.validate()?;
        Ok(document)
    }

    pub fn to_json(&self) -> Result<String, DocumentV2Error> {
        self.validate()?;
        serde_json::to_string(self).map_err(|error| DocumentV2Error::InvalidJson(error.to_string()))
    }

    pub fn validate(&self) -> Result<(), DocumentV2Error> {
        if self.schema_version != DOCUMENT_IR_V2_SCHEMA_VERSION {
            return Err(DocumentV2Error::UnsupportedSchemaVersion(self.schema_version));
        }
        let digest = self
            .source_hash
            .strip_prefix("sha256:")
            .filter(|digest| {
                digest.len() == 64
                    && digest
                        .bytes()
                        .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
            })
            .ok_or_else(|| DocumentV2Error::InvalidJson("invalid source hash".into()))?;
        if self.document_id != format!("doc_{digest}") {
            return Err(DocumentV2Error::InvalidDocumentId);
        }
        if self.pages.is_empty() {
            return Err(DocumentV2Error::EmptyDocument);
        }

        let mut region_ids = HashSet::new();
        for (index, page) in self.pages.iter().enumerate() {
            let expected = u32::try_from(index + 1)
                .map_err(|_| DocumentV2Error::InvalidJson("too many pages".into()))?;
            if page.number != expected {
                return Err(DocumentV2Error::InvalidPageOrder {
                    expected,
                    found: page.number,
                });
            }
            for region in &page.regions {
                region.validate()?;
                if !region_ids.insert(region.id.as_str()) {
                    return Err(DocumentV2Error::DuplicateRegionId(region.id.clone()));
                }
            }
        }
        Ok(())
    }
}

impl DocumentRegionV2 {
    fn validate(&self) -> Result<(), DocumentV2Error> {
        if self.id.trim().is_empty() {
            return Err(DocumentV2Error::InvalidRegionContent(self.id.clone()));
        }
        let has_source = [
            self.sources.raw_text.as_deref(),
            self.sources.ocr_text.as_deref(),
            self.sources.reconstructed_text.as_deref(),
        ]
        .into_iter()
        .flatten()
        .any(|value| !value.trim().is_empty());
        if !has_source {
            return Err(DocumentV2Error::EmptySourceLayers(self.id.clone()));
        }
        if let Some(confidence) = self.confidence {
            if !confidence.is_finite() || !(0.0..=1.0).contains(&confidence) {
                return Err(DocumentV2Error::InvalidRegionContent(self.id.clone()));
            }
        }
        if let Some([x0, y0, x1, y1]) = self.bbox {
            if ![x0, y0, x1, y1].iter().all(|value| value.is_finite()) || x0 > x1 || y0 > y1 {
                return Err(DocumentV2Error::InvalidRegionContent(self.id.clone()));
            }
        }

        let content_matches = matches!(
            (&self.kind, &self.content),
            (_, RegionContent::LegacyText { .. })
                | (RegionType::Code, RegionContent::Code { .. })
                | (RegionType::Table, RegionContent::Table { .. })
                | (RegionType::Formula, RegionContent::Formula { .. })
                | (RegionType::Figure | RegionType::Diagram | RegionType::Chart, RegionContent::Visual { .. })
                | (
                    RegionType::Heading
                        | RegionType::Paragraph
                        | RegionType::List
                        | RegionType::Caption
                        | RegionType::Quote
                        | RegionType::Toc
                        | RegionType::Header
                        | RegionType::Footer
                        | RegionType::Reference
                        | RegionType::Metadata
                        | RegionType::Corrupted
                        | RegionType::Unknown,
                    RegionContent::Text { .. }
                )
        );
        if !content_matches {
            return Err(DocumentV2Error::InvalidRegionContent(self.id.clone()));
        }

        if self.uncertainty == Uncertainty::Unsupported && self.quality_status == QualityStatus::Accepted {
            return Err(DocumentV2Error::UnsupportedAccepted(self.id.clone()));
        }

        if let RegionContent::Table { headers, rows } = &self.content {
            let width = headers.len().max(rows.first().map_or(0, Vec::len));
            if width == 0 || rows.iter().any(|row| row.len() != width) {
                return Err(DocumentV2Error::InvalidTable(self.id.clone()));
            }
        }

        if let RegionContent::Visual { disposition: VisualDisposition::Interpret, .. } = &self.content {
            if !matches!(self.uncertainty, Uncertainty::SourceConfirmed | Uncertainty::OcrConfirmed) {
                return Err(DocumentV2Error::UnconfirmedVisualInterpretation(self.id.clone()));
            }
        }

        Ok(())
    }
}


fn map_block_type(kind: BlockType) -> RegionType {
    match kind {
        BlockType::Heading => RegionType::Heading,
        BlockType::Paragraph => RegionType::Paragraph,
        BlockType::List => RegionType::List,
        BlockType::Code => RegionType::Code,
        BlockType::Table => RegionType::Table,
        BlockType::Formula => RegionType::Formula,
        BlockType::Figure => RegionType::Figure,
        BlockType::Diagram => RegionType::Diagram,
        BlockType::Chart => RegionType::Chart,
        BlockType::Caption => RegionType::Caption,
        BlockType::Quote => RegionType::Quote,
        BlockType::Toc => RegionType::Toc,
        BlockType::Header => RegionType::Header,
        BlockType::Footer => RegionType::Footer,
        BlockType::Reference => RegionType::Reference,
        BlockType::Metadata => RegionType::Metadata,
        BlockType::Corrupted => RegionType::Corrupted,
        BlockType::Unknown => RegionType::Unknown,
    }
}
