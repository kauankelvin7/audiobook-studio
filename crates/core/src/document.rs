use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::DomainError;

pub const DOCUMENT_IR_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DocumentIr {
    pub schema_version: u32,
    pub document_id: String,
    pub source_hash: String,
    pub language: Option<String>,
    pub pages: Vec<DocumentPage>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DocumentPage {
    pub number: u32,
    pub raw_text: String,
    pub text_quality: TextQuality,
    pub blocks: Vec<DocumentBlock>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DocumentBlock {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: BlockType,
    pub language: Option<String>,
    pub text: String,
    pub confidence: Option<f32>,
    pub bbox: Option<[f32; 4]>,
    pub flags: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TextQuality {
    Extracted,
    NeedsOcr,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BlockType {
    Heading,
    Paragraph,
    List,
    Code,
    Table,
    Formula,
    Figure,
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DocumentManifest {
    pub schema_version: u32,
    pub document_id: String,
    pub source_hash: String,
    pub parser_version: String,
    pub extraction_cache_key: String,
    pub page_count: usize,
    pub block_count: usize,
    pub unknown_block_count: usize,
    pub needs_ocr_page_count: usize,
}

pub fn sha256_source(bytes: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(bytes))
}

impl DocumentIr {
    pub fn new(
        source_hash: String,
        language: Option<String>,
        pages: Vec<DocumentPage>,
    ) -> Result<Self, DomainError> {
        let document_id = document_id_for_hash(&source_hash)?;
        let document = Self {
            schema_version: DOCUMENT_IR_SCHEMA_VERSION,
            document_id,
            source_hash,
            language,
            pages,
        };
        document.validate()?;
        Ok(document)
    }

    pub fn validate(&self) -> Result<(), DomainError> {
        if self.schema_version != DOCUMENT_IR_SCHEMA_VERSION {
            return Err(DomainError::UnsupportedSchemaVersion(self.schema_version));
        }
        if self.document_id != document_id_for_hash(&self.source_hash)? {
            return Err(DomainError::InvalidDocumentId);
        }
        if self.pages.is_empty() {
            return Err(DomainError::EmptyDocument);
        }

        let mut block_ids = HashSet::new();
        for (index, page) in self.pages.iter().enumerate() {
            let expected = u32::try_from(index + 1)
                .map_err(|_| DomainError::InvalidJson("too many pages".into()))?;
            if page.number != expected {
                return Err(DomainError::InvalidPageOrder {
                    expected,
                    found: page.number,
                });
            }
            if page.text_quality == TextQuality::Extracted && page.blocks.is_empty() {
                return Err(DomainError::EmptyExtractedPage(page.number));
            }
            if !page.blocks.is_empty() && page.raw_text.trim().is_empty() {
                return Err(DomainError::MissingRawText(page.number));
            }
            for block in &page.blocks {
                if block.id.trim().is_empty() {
                    return Err(DomainError::EmptyBlockId);
                }
                if !block_ids.insert(&block.id) {
                    return Err(DomainError::DuplicateBlockId(block.id.clone()));
                }
                if block.text.trim().is_empty() {
                    return Err(DomainError::EmptyBlockText(block.id.clone()));
                }
                if let Some(confidence) = block.confidence {
                    if !confidence.is_finite() || !(0.0..=1.0).contains(&confidence) {
                        return Err(DomainError::InvalidConfidence(block.id.clone()));
                    }
                }
                if let Some([x0, y0, x1, y1]) = block.bbox {
                    if ![x0, y0, x1, y1].iter().all(|value| value.is_finite()) || x0 > x1 || y0 > y1
                    {
                        return Err(DomainError::InvalidBoundingBox(block.id.clone()));
                    }
                }
            }
        }
        Ok(())
    }

    pub fn from_json(input: &str) -> Result<Self, DomainError> {
        let value: serde_json::Value = serde_json::from_str(input)
            .map_err(|error| DomainError::InvalidJson(error.to_string()))?;
        let version = value
            .get("schemaVersion")
            .and_then(serde_json::Value::as_u64)
            .ok_or_else(|| DomainError::InvalidJson("missing schemaVersion".into()))?;
        if version != u64::from(DOCUMENT_IR_SCHEMA_VERSION) {
            return Err(DomainError::UnsupportedSchemaVersion(
                u32::try_from(version).unwrap_or(u32::MAX),
            ));
        }
        let document: Self = serde_json::from_value(value)
            .map_err(|error| DomainError::InvalidJson(error.to_string()))?;
        document.validate()?;
        Ok(document)
    }

    pub fn to_json(&self) -> Result<String, DomainError> {
        self.validate()?;
        serde_json::to_string(self).map_err(|error| DomainError::Serialization(error.to_string()))
    }

    pub fn manifest(&self, parser_version: &str) -> Result<DocumentManifest, DomainError> {
        self.validate()?;
        if parser_version.trim().is_empty() {
            return Err(DomainError::EmptyParserVersion);
        }
        let blocks = self.pages.iter().flat_map(|page| page.blocks.iter());
        Ok(DocumentManifest {
            schema_version: self.schema_version,
            document_id: self.document_id.clone(),
            source_hash: self.source_hash.clone(),
            parser_version: parser_version.to_owned(),
            extraction_cache_key: extraction_cache_key(&self.source_hash, parser_version),
            page_count: self.pages.len(),
            block_count: self.pages.iter().map(|page| page.blocks.len()).sum(),
            unknown_block_count: blocks
                .filter(|block| block.kind == BlockType::Unknown)
                .count(),
            needs_ocr_page_count: self
                .pages
                .iter()
                .filter(|page| page.text_quality == TextQuality::NeedsOcr)
                .count(),
        })
    }
}

fn document_id_for_hash(source_hash: &str) -> Result<String, DomainError> {
    let digest = source_hash
        .strip_prefix("sha256:")
        .ok_or(DomainError::InvalidSourceHash)?;
    if digest.len() != 64
        || !digest
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(DomainError::InvalidSourceHash);
    }
    Ok(format!("doc_{digest}"))
}

fn extraction_cache_key(source_hash: &str, parser_version: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"audiobook-studio:extraction:v1\0");
    hasher.update(source_hash.as_bytes());
    hasher.update(b"\0");
    hasher.update(parser_version.as_bytes());
    format!("sha256:{:x}", hasher.finalize())
}
