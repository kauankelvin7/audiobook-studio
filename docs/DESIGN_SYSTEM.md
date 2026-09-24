# Audiobook Studio — Design System

## Studio Dark/Glass

O Audiobook Studio usa uma superfície escura inspirada em interfaces iOS, com glass restrito a barras, navegação, drawers e superfícies operacionais elevadas.

- **Canvas**: plano contínuo quase preto que integra sidebar e workspace.
- **Glass**: barras e superfícies elevadas translúcidas com blur, sem substituir hierarquia ou legibilidade.
- **Reading**: documento e roteiro continuam priorizando leitura prolongada, agora em cartões escuros com hairline.

A interface deve parecer uma ferramenta editorial/técnica, não um dashboard genérico e não uma UI “AI-first”. Glass é linguagem de profundidade, não decoração; continuam proibidos sparkles, gradientes arbitrários e cards aninhados sem função.

## Fontes de verdade no código

- Tokens globais: `apps/web/src/styles/tokens.css`
- Shell/layout/base legado: `apps/web/src/styles/shell.css`
- Revisão e bottom dock: `apps/web/src/styles/review.css`
- Narrativa: `apps/web/src/styles/narrative.css`
- Acessibilidade transversal: `apps/web/src/styles/accessibility.css`
- Bootstrap: `apps/web/src/main.tsx`
- Orquestração do app: `apps/web/src/App.tsx`

Não recriar tokens localmente em componentes sem necessidade. Literais antigos ainda existem no shell; normalizá-los apenas em mudanças dirigidas por screenshot para não provocar drift visual invisível.

## Tipografia

As fontes são empacotadas pelo Vite via Fontsource; não há dependência de Google Fonts/CDN em runtime.

- **Geist Sans**: interface, navegação, botões, labels e headings de UI.
- **Source Serif 4**: documento, roteiro e conteúdo editorial.
- **Geist Mono**: código, IDs técnicos, source refs e métricas de diagnóstico.

Escala de referência:

| Uso | Tamanho / linha |
| --- | --- |
| Display | 48 / 56 px |
| Título de página | 36 / 44 px |
| Seção | 24 / 32 px |
| UI/body | 16 / 24 px |
| Documento | 18 / 30 px |
| Meta | 13 / 18 px |

## Paleta

Baseline visual atual: **Studio Dark/Glass**.

| Token | Valor |
| --- | --- |
| Canvas | `#0B0D12` |
| Surface | `#14171E` |
| Paper raised | `#1C2029` |
| Ink | `#F2F3F5` |
| Ink muted | `rgba(242,243,245,0.62)` |
| Studio | `#0B0D12` |
| Primary | `#3F8CFF` |
| Primary hover | `#67A6FF` |
| Primary soft | `rgba(63,140,255,0.16)` |
| Success | `#32D74B` |
| Warning/review | `#FF9F0A` |
| Danger | `#FF453A` |
| Border | `rgba(255,255,255,0.08)` |
| Border strong | `rgba(255,255,255,0.16)` |
| Glass | `rgba(20,23,30,0.72)` |
| Glass strong | `rgba(28,32,41,0.82)` |
| Glass blur | `blur(24px) saturate(160%)` |

O tema é escuro por decisão de produto. Sidebar e canvas compartilham o mesmo plano; project bar, bottom dock, navegação móvel e diálogos podem usar glass. Conteúdo de leitura não deve depender de transparência para manter contraste previsível.

## Espaçamento, raio e motion

Escala de projeto desejada: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64 px`.

Raios:

- small: 8 px
- control: 10 px
- card: 14 px
- panel: 18 px
- shell: 22 px

Motion:

- fast: 110 ms
- base: 180 ms
- slow: 280 ms
- spring UI: stiffness 300 / damping 30
- spring tap: stiffness 500 / damping 25
- spring sheet: stiffness 260 / damping 26
- feedback de tap CSS pode usar `scale(.97)` quando não houver Motion.
- `prefers-reduced-motion` deve neutralizar animações não essenciais e continua obrigatório.

O arquivo legado ainda usa aliases antigos `--space-1..4`; não alterar toda a escala em massa sem comparação visual, pois isso muda a densidade do produto inteiro.

## Navegação

Etapas do usuário:

`Projeto -> Documento -> Revisão -> Narrativa -> Áudio -> Exportar`

Secundárias:

`Diagnóstico -> Configurações`

Nomes como DocumentIR, OPFS, ContentModel e hashes não pertencem à navegação principal. Eles podem aparecer em Diagnóstico ou em arquivos exportados.

## Mapa atual de componentes

### Shell

```text
App
└── AppShell
    ├── StudioSidebar
    ├── ProjectHeader
    ├── Workspace
    └── MobileNavigation
```

`main.tsx` é apenas bootstrap. A orquestração permanece em `App.tsx`.

### Documento / Revisão

```text
DocumentWorkspace
├── PageNavigator
└── DocumentViewer

OcrReviewPanel
├── OcrInspectorTabs
├── OcrTargetPicker
├── OcrNativeTextView
├── OcrComparisonView
├── OcrLearningPanel
├── OcrReviewDecisionForm
├── OcrReconciledTextView
└── OcrReviewHistoryList

ReviewBottomDock
├── Narrative summary
├── Audio summary
└── Export summary
```

A tela de Revisão desktop deve continuar reconhecível como:

```text
Pages | Paper document | Evidence inspector
Narrative summary | Audio summary | Export summary
```

O dock usa componentes-resumo; nunca voltar a comprimir `NarrativePanel`, Áudio ou Export completos com `max-height/overflow`.

### Narrativa

```text
NarrativePanel
├── NarrativeOutline
├── NarrativeScriptEditor
├── NarrativeSourceCard
├── NarrativeQaPanel
└── NarrativeApproval
```

Internamente o pipeline continua usando ContentModel/SemanticOutline/Plan/Script/QA/SpeechUnits. Na linguagem principal da interface preferir:

- “Estrutura”
- “Roteiro”
- “Fonte aprovada”
- “Conferência”
- “Trechos de narração”

Não mostrar códigos internos de QA como mensagem principal.

### Áudio

```text
AudioWorkspace
├── AudioHistory
├── CompleteAudiobookPanel
│   ├── AudioPlayer
│   └── ChapterList
└── LiteralReadingPanel
    └── AudioPlayer
```

Os dois modos continuam distintos e reais:

- Leitura literal: texto canônico/aprovado direto para leitura/TTS.
- Audiobook narrativo: roteiro aprovado -> SpeechUnits -> mesmo caminho de TTS/player/export.

Não criar waveform decorativa. Waveform só pode existir se derivada de amplitude real.

### Exportar

`ExportPanel` recebe o artefato completo real e expõe WAV + manifesto. Estado bloqueado deve explicar o requisito faltante e apontar para a etapa correta.

## OCR e linguagem de confiança

OCR sempre produz **candidato + evidência**. Promoção para texto canônico exige decisão humana.

O tipo interno `unknown` é válido no domínio. A UI deve exibir **“Texto não classificado”** e não inventar classificação estrutural.

Tabs do inspector:

- Nativo: texto original extraído.
- OCR: candidato, comparação, memória local e decisão.
- Reconciliado: proposta/decisão salva.
- Histórico: revisões persistidas.

As tabs usam semântica ARIA e teclado Left/Right/Home/End.

## Status

Status nunca depende apenas de cor. Sempre combinar cor + texto/ícone.

Referência:

- Original: neutro
- OCR: danger/attention
- Reconciliado: info
- Aprovado: success
- Requer revisão: warning
- Bloqueado: danger

## Acessibilidade

Requisitos permanentes:

- HTML semântico e labels explícitos.
- Foco visível.
- Controles touch >= 44 px em pointer coarse.
- Navegação de tabs por teclado.
- Status com texto além da cor.
- `aria-live` somente para mudanças relevantes.
- player utilizável por teclado.
- `prefers-reduced-motion`.
- `forced-colors` sem perder selected/status.
- zoom de 200% não deve impedir o fluxo.

## Responsividade

Alvos de verificação:

- 320 px
- 390 px
- 768 px
- 1024 px
- 1280 px
- 1440 px
- wide >= 1680 px

Desktop Review: Page Navigator + Paper + Inspector.

Tablet: documento prioritário; inspector pode empilhar/drawer.

Mobile: não comprimir três colunas. O shell já usa navegação inferior; a revisão ainda precisa de validação visual final para decidir se Documento/Evidência/Histórico devem virar tabs/sheet dedicados.

## Testes não visuais

- `presentation_labels.test.ts`: impede vazamento de `unknown`.
- `ui_contracts.test.tsx`: protege ARIA das tabs, linguagem de OCR, bottom dock e capítulo ativo.
- CI Web: WASM build/diff, audit high, typecheck, Vitest e build.
- CI Rust: fmt, tests e Clippy.

Esses testes não substituem screenshot/browser QA.

## Critério de validação visual

Após qualquer mudança relevante de layout:

1. abrir `#review` com documento real;
2. capturar 1440×960;
3. comparar com a referência iOS/glass aprovada para esta refatoração;
4. corrigir proporções, density, spacing e scroll;
5. repetir em 390×844;
6. executar fluxo import -> review -> narrative -> audio -> export -> reload.

Nenhum build verde, isoladamente, prova fidelidade visual.

## Não regressar

- Não voltar a um `main.tsx` monolítico.
- Não reintroduzir painéis completos dentro do bottom dock.
- Não expor `unknown`, `SpeechUnits`, códigos QA ou hashes como microcopy principal.
- Não duplicar lógica do domínio Rust dentro de components.
- Não criar state manager global apenas para reduzir props.
- Não mover core/persistência/TTS por motivo puramente visual.
