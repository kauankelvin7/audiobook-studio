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
- Áudio e exportação: `apps/web/src/styles/production.css`
- Motion e feedback de interação: `apps/web/src/styles/motion.css`
- Acessibilidade transversal: `apps/web/src/styles/accessibility.css`
- Bootstrap: `apps/web/src/main.tsx`
- Orquestração do app: `apps/web/src/App.tsx`

Não recriar tokens localmente em componentes sem necessidade. A camada visual deve ser organizada por responsabilidade: fundação/tokens, shell/revisão, narrativa e produção. Evitar uma pilha de overrides tardios que recoloque todos os componentes na mesma aparência.

## Princípios de composição

- shell com respiro externo e navegação flutuante; não colar a UI às bordas da viewport;
- glass apenas na estrutura e superfícies elevadas; campos e áreas de leitura têm base mais opaca;
- sombras em camadas, hairlines e raios consistentes criam profundidade sem transformar tudo em card;
- botões neutros por padrão e CTA explícito; controles têm alvo mínimo, foco e feedback de pressão;
- cada superfície recebe composição conforme a função: revisão, narrativa, áudio e exportação não devem parecer o mesmo painel renomeado;
- workspaces densos não são comprimidos lado a lado só para preencher uma grade;
- abaixo de 740 px a composição muda: sidebar vira tab bar inferior, rail vira navegação horizontal e colunas empilham;
- respeitar safe areas, `prefers-reduced-transparency`, `prefers-reduced-motion`, `forced-colors` e fallback sem `backdrop-filter`;
- ausência de overflow horizontal deve ser testada em múltiplos breakpoints, não inferida pelo CSS.

O Audiobook Studio mantém identidade própria, Geist/Source Serif, paleta escura e componentes específicos do produto.

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
- panel: 22 px
- shell: 26 px

Motion:

- fast: 110 ms
- base: 180 ms
- slow: 280 ms
- spring UI: stiffness 300 / damping 30
- spring tap: stiffness 500 / damping 25
- spring sheet: stiffness 260 / damping 26
- feedback de tap usa `scale(.97)`; `motion.css` também anima seleção de páginas, indicador das tabs, dock e diálogo sem alterar semântica.
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
    └── PdfOriginalPage (lazy, via pdfjs-dist)

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

### Modos do leitor

- **Texto**: padrão; mantém o conteúdo reflowed derivado do DocumentIR e a seleção de trechos para revisão.
- **Original**: fac-símile opcional do `source_pdf` persistido, renderizado sob demanda por `pdfjs-dist`. Não participa da extração, OCR ou promoção de texto.
- O leitor original oferece ajuste à largura, página inteira e zoom manual de 50% a 300%. O percentual manual usa a escala CSS convencional de PDF (96/72); o raster respeita limite de pixels para evitar consumo excessivo de memória em zoom alto.
- Entre 740 px e 1540 px o rail de páginas começa recolhido para priorizar a largura do documento e pode ser reaberto pelo controle da toolbar. Em mobile ele volta a ser uma faixa horizontal.
- A troca de página pode usar transição visual, mas `onPageChange`, zoom, seleção e contratos de revisão permanecem os mesmos.

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
- 739 px
- 768 px
- 900 px
- 1120 px
- 1320 px
- 1440 px
- 1920 px

Desktop largo: Page Navigator + documento + Evidence Inspector quando houver largura real.

Intermediário: o rail de páginas deixa de ocupar largura permanente entre 740–1540 px e pode ser reaberto sob demanda; a partir de 1120 px para baixo, o inspector também deixa de disputar largura com o documento e empilha em fluxo normal.

Mobile (<740 px): sidebar desktop desaparece e a navegação vira tab bar inferior fixa com safe area; o rail de páginas vira lista horizontal; toolbar recompõe em duas linhas; documento, inspector, Narrativa, Áudio e Exportar empilham sem largura mínima artificial.

Narrativa e Áudio sempre recebem a largura integral da grade externa de produção; os sublayouts internos decidem quando usar colunas.

## Testes não visuais

- `presentation_labels.test.ts`: impede vazamento de `unknown`.
- `ui_contracts.test.tsx`: protege ARIA das tabs, linguagem de OCR, bottom dock e capítulo ativo.
- `design_quality.test.ts`: protege contraste base, safe area, transparência reduzida, ausência do antigo corte de altura da Revisão e largura integral das etapas de produção.
- `npm run test:browser:shell`: sobe Vite de forma isolada e verifica overflow/composição em 1920/1440/1320/1120/900/768/739/390/320 px.
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
- Não reintroduzir altura fixa com `overflow:hidden` na Revisão.
- Não colocar Narrativa e Áudio lado a lado na grade externa; cada workspace complexo precisa de largura integral.
- Não tratar responsividade como simples redução de tamanhos; abaixo de 740 px a composição deve mudar.
