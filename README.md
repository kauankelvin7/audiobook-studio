<div align="center">

# Audiobook Studio

**Do PDF ao áudio, com revisão humana e processamento local.**

Um estúdio experimental para ler, revisar, narrar e exportar documentos em áudio — mantendo o documento original, o histórico de decisões e as gravações no dispositivo.

[![Web](https://img.shields.io/badge/Web-React%20%2B%20TypeScript-3178C6?style=flat-square&logo=react&logoColor=white)](apps/web/)
[![Core](https://img.shields.io/badge/Core-Rust%20%2B%20WASM-000000?style=flat-square&logo=rust&logoColor=white)](crates/core/)
[![Qualidade](https://github.com/kauankelvin7/audiobook-studio/actions/workflows/quality.yml/badge.svg)](https://github.com/kauankelvin7/audiobook-studio/actions/workflows/quality.yml)
[![Licença](https://img.shields.io/github/license/kauankelvin7/audiobook-studio?style=flat-square)](LICENSE)

[**Experimentar a aplicação**](https://audiobook-studio-omega.vercel.app) · [**Arquitetura**](docs/ARCHITECTURE_OVERVIEW.md) · [**Executar localmente**](#executar-localmente) · [**Limitações**](#limitações-e-maturidade)

</div>

---

## O projeto

A conversão de PDF em fala não começa na voz: começa em identificar **qual texto do arquivo é confiável**. PDFs podem misturar camadas de texto nativo, páginas digitalizadas, tabelas, código e caracteres corrompidos. Ler ou reescrever esses trechos sem revisão pode mudar seu significado.

O Audiobook Studio separa importação, análise, revisão, roteiro, geração e exportação. O **Rust** valida contratos e decisões canônicas; a aplicação **React/TypeScript** opera o navegador, os arquivos locais, o OCR e a síntese de voz.

O sistema é **local-first**, não um serviço de conversão hospedado. A interface é distribuída pela web, mas documentos, revisões e WAVs são guardados localmente no navegador. Alguns componentes/vozes precisam ser baixados na primeira utilização.

## Fluxo de uso

| Etapa | O que acontece |
|---|---|
| **01 · Projeto** | Importação de PDF (até 32 MB), identificação da fonte e checkpoint local. |
| **02 · Documento** | Navegação por páginas no modo texto ou visualização original. |
| **03 · Revisão** | Inspeção do texto nativo, OCR local seletivo, comparação e decisões explícitas. |
| **04 · Narrativa** | Estruturação, edição e revisão de um roteiro com referências à fonte e verificação de QA. |
| **05 · Áudio** | Leitura local do navegador, geração WAV literal/narrativa com Piper e navegação por capítulos. |
| **06 · Exportar** | Download do WAV e de manifesto com informações de capítulos e identidade dos artefatos. |

As aprovações são **ações locais do operador**, não prova de que o conteúdo está semanticamente correto ou de que a identidade do revisor foi verificada. Trechos problemáticos podem bloquear a geração até revisão.

## Arquitetura em uma página

```text
PDF (não confiável)
  └─ PDF.js / Web Worker ──> extração e evidências
           │
           ▼
      Rust core (DocumentIR v2 / validação / revisão / QA)
           ▲  │
           │  └─ contratos versionados via Rust/WASM
           │
    React + adapters do navegador
      ├─ IndexedDB ── checkpoints, índices e estado
      ├─ OPFS ─────── PDF, evidências e áudio
      ├─ Tesseract ── OCR candidato, com revisão
      └─ Piper/ONNX ─ síntese local por partes ── WAV + capítulos
```

**Fronteira de responsabilidade:** a UI não deve decidir por conta própria se uma fonte é aprovada ou se uma narrativa está elegível. Essas regras pertencem ao core Rust. Para fluxo completo, invariantes, estados e trade-offs, veja [Arquitetura e decisões](docs/ARCHITECTURE_OVERVIEW.md) e [ADRs](docs/adr/).

## Organização do repositório

| Diretório | Responsabilidade |
|---|---|
| [`crates/core`](crates/core/) | Domínio determinístico: documentos, OCR, referências, revisão, leitura e narrativa. |
| [`crates/wasm`](crates/wasm/) | Fronteira de exportação e contratos Rust → WebAssembly. |
| [`apps/web`](apps/web/) | UI React, PDF.js, Web Workers, Tesseract, Piper e adapters de persistência. |
| [`docs`](docs/) | Decisões arquiteturais, qualidade, segurança, limitações e evolução. |
| [`.ai`](.ai/) | Pacote de tarefa, handoff e histórico de verificações. |
| [`scripts`](scripts/) | Ferramentas de build, manutenção e validação do workspace. |

## Executar localmente

**Requisitos:** Node.js **22.x** e npm; Rust **1.94.1** para testar ou modificar o core/WASM. Os assets de OCR e síntese são copiados de dependências fixadas no lockfile durante o build. O navegador precisa oferecer os recursos de armazenamento pertinentes ao fluxo.

```bash
cd apps/web
npm ci
npm run typecheck
npm test
npm run build
npm run dev
```

Para conferir a suíte Rust, na raiz do repositório:

```bash
cargo fmt --all -- --check
cargo test --workspace --locked
cargo clippy --workspace --all-targets -- -D warnings
```

Se alterar Rust consumido pela aplicação, reconstrua o WASM **antes** dos testes Web:

```bash
cd apps/web
npm run wasm:build
npm run test:standard
```

Os testes de navegador que geram áudio/OCR de fato são **opt-in** e podem baixar o modelo de voz. Instruções em [Quality gates](docs/QUALITY_GATES.md) e [estratégia de ingestão/OCR](docs/INGESTION_TEST_STRATEGY.md).

## Limitações e maturidade

- O projeto possui **testes automatizados e smokes documentados**, mas não equivale a uma certificação de fidelidade de audiobooks arbitrários.
- OCR produz **candidatos**. Correções e sugestões locais não devem substituir texto sem decisão explícita; texto nativo corrompido também não é automaticamente confiável.
- O **rascunho narrativo inicial** usa material da fonte e demanda edição/revisão humana. A checagem estrutural não substitui avaliação semântica independente.
- A primeira geração Piper pode baixar um modelo de aproximadamente **63 MB**; navegadores móveis podem suspender trabalhos longos. Compatibilidade em Android físico permanece um gate de validação manual.
- Histórico, PDF e WAVs dependem do **armazenamento do navegador/origin**. Limpeza dos dados do site pode removê-los; exporte os arquivos que pretende conservar.
- Documentos complexos (tabelas, fórmulas, diagramas e textos de extração ruim) ainda exigem corpus de referência, benchmarks e inspeção humana.

Para o status **por capacidade**, com evidências e pendências sem promessas de prontidão, veja [Gap analysis](docs/GAP_ANALYSIS.md). Para os limites de confiança, consulte [Security](docs/SECURITY.md).

## Documentação

[Visão arquitetural](docs/ARCHITECTURE_OVERVIEW.md) · [Fluxo das etapas](docs/PRODUCT_STAGE_MAP.md) · [Segurança](docs/SECURITY.md) · [Persistência](docs/PERSISTENCE.md) · [Narrativa e performance](docs/NARRATIVE_AND_PERFORMANCE.md) · [Quality gates](docs/QUALITY_GATES.md) · [Context index](docs/CONTEXT_INDEX.md)

**Licença:** MIT. Este repositório é um laboratório de engenharia em evolução; decisões e verificações são documentadas, incluindo o que ainda não foi validado.
