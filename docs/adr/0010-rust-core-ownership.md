# ADR 0010 — Rust core ownership

Status: accepted

## Contexto

O projeto foi concebido com Rust como domínio determinístico e TypeScript como camada Web/adapters. Durante M2–M4 parte crescente das regras canônicas foi implementada em TypeScript (DocumentIR v2, Narrative Quality e início de ContentModel), enquanto o crate Rust permaneceu pequeno. Isso cria risco de duas fontes de verdade e reduz portabilidade para desktop/CLI.

## Decisão

O `audiobook-core` em Rust é a fonte canônica para:

- DocumentIR e migrações de schema;
- ContentModel e SemanticOutline;
- NarrativeMemory e regras determinísticas de narração/QA;
- provenance/source validation;
- state machines;
- cache keys e dependency invalidation;
- regras determinísticas de chunking, artefatos, retry/fallback e integridade.

TypeScript mantém:

- React/UI;
- PDF.js e browser Workers;
- IndexedDB, OPFS, Web Locks e `navigator.*`;
- adapters WebLLM/TTS/WebGPU;
- schemas de fronteira necessários para validar dados não confiáveis antes/depois do WASM.

Schemas TypeScript não são autoridade de domínio. Quando espelham um contrato Rust, precisam de fixture/parity test. Nova regra de negócio em TypeScript exige ADR explícito.

O crate `audiobook-wasm` deve permanecer uma fachada fina: serializa/valida fronteiras e chama `audiobook-core`; não duplica regra de domínio.

## Consequências

M4 passa a portar para Rust a lógica determinística já criada em TypeScript antes de ampliar o Narrative Compiler. Código Web específico de armazenamento continua TypeScript. A porcentagem de linhas por linguagem não é métrica de sucesso; ownership das invariantes é.
