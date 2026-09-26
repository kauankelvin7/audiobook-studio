# Audiobook Studio — Design System

## Workspace editorial

O Audiobook Studio usa um workspace claro, denso e calmo para leitura e produção. A barra lateral e a project bar são escuras para orientar navegação; conteúdo, documento e controles são superfícies opacas de alto contraste.

- **Canvas**: `#F7F7F5`, sem texturas ou gradientes decorativos.
- **Navegação**: Studio `#202A36`, com estado atual visível e poucas ações por nível.
- **Reading**: papel e roteiro mantêm tipografia serifada, largura confortável e fundo dedicado.

A interface deve parecer ferramenta editorial/técnica, não dashboard genérico, nem clone de player. Gradientes decorativos, glass, sombras pesadas e cartões aninhados sem função são proibidos.

## Fontes de verdade no código

- Tokens globais: `apps/web/src/styles/tokens.css`
- Camada de alinhamento atual: `apps/web/src/styles/studio.css`
- Shell/layout/base legado: `apps/web/src/styles/shell.css`
- Revisão e bottom dock: `apps/web/src/styles/review.css`
- Narrativa: `apps/web/src/styles/narrative.css`
- Áudio e exportação: `apps/web/src/styles/production.css`
- Motion e feedback de interação: `apps/web/src/styles/motion.css`
- Acessibilidade transversal: `apps/web/src/styles/accessibility.css`
- Bootstrap: `apps/web/src/main.tsx`
- Orquestração do app: `apps/web/src/App.tsx`

Não recriar tokens localmente em componentes sem necessidade. A camada visual deve ser organizada por responsabilidade: fundação/tokens, shell/revisão, narrativa e produção. A consolidação gradual de estilos legados deve terminar removendo overrides substituídos, sem alterar contratos de domínio.

## Princípios de composição

- shell com respiro externo e navegação persistente; não colar UI às bordas da viewport;
- superfícies opacas, hairlines e raios discretos criam hierarquia sem transformar tudo em card;
- botões neutros por padrão e CTA explícito; controles têm alvo mínimo, foco e feedback de pressão;
- cada superfície recebe composição conforme a função: revisão, narrativa, áudio e exportação não devem parecer o mesmo painel renomeado;
- workspaces densos não são comprimidos lado a lado só para preencher uma grade;
- abaixo de 740 px a composição muda: sidebar vira tab bar inferior, rail vira navegação horizontal e colunas empilham;
- respeitar safe areas, `prefers-reduced-transparency`, `prefers-reduced-motion`, `forced-colors` e fallback sem `backdrop-filter`;
- ausência de overflow horizontal deve ser testada em múltiplos breakpoints, não inferida pelo CSS.

O Audiobook Studio mantém identidade própria, Geist/Source Serif, paleta editorial clara e componentes específicos do produto.

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

Baseline visual atual: **Workspace editorial**.

| Token | Valor |
| --- | --- |
| Canvas | `#F7F7F5` |
| Surface | `#FFFFFF` |
| Reader | `#ECEBE7` |
| Ink | `#1C1D1F` |
| Ink muted | `#62656B` |
| Studio | `#202A36` |
| Primary | `#2F5EE5` |
| Primary hover | `#254BCC` |
| Primary soft | `#EDF2FF` |
| Warning/review | `#9A5B18` |
| Danger | `#B23A3A` |
| Border | `#E5E5E1` |
| Border strong | `#D5D5CF` |

Tema escuro é suporte integral, não inversão parcial: superfícies, bordas, texto, diálogo e player usam tokens sem depender de transparência.

## Espaçamento, raio e motion

Escala de projeto desejada: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64 px`.

Raios:

- small: 6 px
- control: 8 px
- card: 10 px
- panel: 12 px
- shell: 14 px

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

Intermediário: a partir de 1120 px para baixo, o inspector deixa de disputar largura com o documento e empilha em fluxo normal.

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
