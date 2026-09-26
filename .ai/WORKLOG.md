# Worklog

## 2026-09-25 — otimização de troca de páginas do PDF, zoom responsivo e tela cheia
- Resolução da lentidão crítica ao trocar páginas do PDF (`PdfOriginalPage.tsx` e `DocumentWorkspace.tsx`):
  - Eliminada chave `original-${pageNumber}` que forçava desmontagem e remontagem completa do leitor e do worker a cada página.
  - Implementado cache com `WeakMap` para instâncias de `PDFDocumentProxy`, evitando re-parsear o arquivo PDF na navegação entre páginas.
  - Corrigido loop de `ResizeObserver` ao medir a largura do container pai estável (`.paper-scroll`) em vez do shell com `max-content`.
  - Transição de páginas sem tela preta/branca piscando, mantendo o canvas renderizado enquanto a nova página carrega em segundo plano.
- Ajuste de zoom e visibilidade de componentes:
  - Faixa de zoom expandida de 50% a 250% com clique rápido no percentual para redefinir para 100%.
  - Adicionado botão de recolhimento/expansão da lista de páginas (`PageNavigator`) na barra de ferramentas do documento para liberar mais de 250px e focar no documento e outros componentes.
  - Escala proporcional no modo texto: headings e parágrafos usam `em` para escalar harmonicamente com o zoom.
- Correção de tela cheia (Fullscreen):
  - Adicionado suporte estilizado dedicado para `:fullscreen`, `:-webkit-full-screen` e `.is-fullscreen` no `.document-canvas`.
  - Barra de ferramentas fixada no topo com backdrop blur e container rolável com suporte a zoom sem corte de margens ou distorção.
- Gates: `npm run typecheck` (0 erros), `npm test` (188 testes passaram), `npm run build` (sucesso, 39 arquivos / 81.51 MB).

## 2026-09-25 — redesign do modo leitura e reorganização dos componentes do frontend
- Reorganização completa do modo leitura (`DocumentWorkspace`, `ReadingPlayer`, `appearance.css`):
  - Barra de leitura imersiva com linha de progresso percentual no topo.
  - 4 temas de leitura: Padrão Escuro (Studio), Papel Suave (creme livro), Sépia Acolhedor e Noite (alto contraste OLED).
  - Controle de zoom de texto e alternância de largura de leitura (820px confortável / 1040px ampla).
  - Navegação por teclado: setas `ArrowLeft` / `ArrowRight`, `PageUp` / `PageDown` e `Escape` para sair da leitura.
  - Botões laterais flutuantes discretos para virar páginas com um clique sem rolar até a barra.
  - Tocador de áudio no leitor (`ReadingPlayer`) reformulado com scrubber de reprodução, botões de saltar ±10s, play/pause em destaque, minimização elegante e aviso suave quando áudio não gerado.
- Reestruturação dos componentes desorganizados do frontend:
  - `LiteralReadingPanel`: dividido em cards de seleção de páginas com grid limpa, buffer de conferência de texto e ações de voz local e síntese Faber com barra de progresso visual.
  - `CompleteAudiobookPanel`: reorganizado em cartões conceituais comparando Audiobook Narrativo vs Audiobook Literal, barra de progresso gráfica de síntese e tocador integrado.
  - `ChapterList`: numeração alinhada, badge de duração, indicador de capítulo ativo e scroll organizado.
  - `AudioHistory`: lista de gravações estruturada em cards com tags de data, tamanho e botões de ação e exclusão alinhados.
  - `ProjectImportPanel`: dropzone de importação de PDF moderna com suporte visual a arrastar/clicar e estado do arquivo.
  - `ExportPanel`: chips de metadados do audiobook, botões de download claros com ícones e status de prontidão.
  - `NativeTextApprovalPanel`: bloco de inspeção página por página elegante e card de aprovação estruturado.
  - `StudioIcon`: adicionados ícones SVG complementares (play, pause, stop, download, close, prev, next, skipBack, skipForward, upload, trash, text, refresh).
- Gates: `npm run typecheck` (0 erros), `npm test` (188 testes passaram), `npm run build` (sucesso, 39 arquivos / 81.51 MB).

## 2026-09-25 — modo leitura, rascunho narrativo e progresso por capítulo
- Commit `7e258a1` consolida o trabalho acumulado desde `dc2f147`: modo leitura, ReadingPlayer, tema Claro/Escuro/Sistema, rascunho narrativo persistido e barra de progresso de geração narrativa.
- Progresso de geração narrativa corrigido: quando o documento tem múltiplos capítulos exibe "Capítulo X de Y", caso contrário mantém "Adaptando trecho X de Y". Contagem por seção em vez de por segmento individual.
- Push confirmado: `dc2f147..7e258a1 → origin/codex/m4-content-model`. Typecheck passou antes do commit.
- Gates: typecheck passou; smoke shell passava em dez larguras antes do commit. Testes unitários (188) e build de produção validados na sessão anterior.

## 2026-09-25 — refatoração visual de composição
- A revisão concluiu que o principal problema do frontend era composição: pouco respiro, workspaces técnicos comprimidos, superfícies genéricas e breakpoint móvel que apenas reduzia tamanhos.
- `6e4e51d` substituiu fundação/shell/revisão por shell flutuante, sidebar e header glass com base escura, campos opacos, sombras em camadas, reader/inspector com largura segura e mobile <740 px com tab bar e safe area. A regra de altura fixa/overflow oculto da Revisão foi removida.
- `8b2c73a` separou visualmente Narrativa, produção de Áudio, histórico, capítulos, leitura literal e Exportação. CI remoto concluiu success.
- `5014dbd` adicionou `design_quality.test.ts` e expandiu o smoke de shell para 1920/1440/1320/1120/900/768/739/390/320. CI remoto concluiu success.
- Auditoria seguinte encontrou Narrativa e Áudio ainda comprimidos pela grade externa de duas colunas. `8111084` muda a grade para uma coluna integral, acrescenta regressão e faz o smoke subir/encerrar o Vite sozinho.
- Rust/core/adapters funcionais não foram alterados por esta refatoração visual. Desktop Commander segue offline, então screenshots 1440/390 ainda não foram inspecionados nesta sessão; o smoke foi preparado para produzi-los assim que houver Chrome disponível.


## 2026-09-24 — persistência da composição OCR
- Base `b293070` local. `canonical_ocr_batch.ts` salva conjunto escolhido de aprovações individuais já persistidas; cada item reabre a revisão histórica e a evidência, recomputa promoção no Rust e só então compõe no WASM. A chave deriva do `compositionHash`; leitura revalida o conjunto e o checkpoint. Nenhum item é selecionado automaticamente.
- QA independente identificou retry concorrente que falhava em CAS e ausência de checagem de `pinned`/`regenerable`/`finalArtifact` no manifest da aprovação individual. Corrigidos. Teste com IndexedDB/OPFS falso e WASM real cobre duas regiões, ordem, reload, retry concorrente e corrupção; passou.
- Primeira suíte completa detectou conflito de sequência no teste de duas gravações concorrentes com lock falso sem serialização. O tratamento de retry agora retorna somente batch existente integralmente revalidado e idêntico; o teste usa lock serializado como Web Locks. Web STANDARD final passou: 169 testes, 2 ignorados, typecheck e build. Interface e narrativa continuam no fluxo individual. Validação visual fica com o usuário.
- Publicação: `b293070` e `3b853c1` enviados a `origin/codex/m4-content-model`. CI `quality` 36081703501 concluiu com sucesso no HEAD `3b853c1` (Rust e Web verdes).

## 2026-09-24 — composição OCR canônica no Rust/WASM
- A pedido do usuário, validação visual do redesign ficou sob responsabilidade dele; trabalho avançou para a lacuna funcional de múltiplas correções OCR aprovadadas.
- `compose_approved_ocr` recebe revisões locais contra o mesmo DocumentIR original, valida cada uma pela promoção Rust existente, rejeita duplicatas/alvos repetidos e ordena o resultado por página/região. Referências incluem hash da revisão, hash do texto, revisão e atestado; `compositionHash` fixa o conjunto. Regiões não aprovadas seguem `review_required`.
- Revisão independente encontrou duas falhas médias: metadados de atestação omitidos e custo potencial de 256 revisões em documentos grandes. Corrigidas com campos por referência, teto de oito revisões e limite de 128 MB considerando uma serialização inicial mais três por revisão. A segunda revisão independente detectou que a primeira fórmula subestimava o trabalho; a fórmula foi corrigida. Testes cobrem duas regiões, entrada reordenada, duplicata, fonte alterada, página `__page__`, revisão inválida e limite de lote. Web testa a exportação WASM real.
- Gates finais: `cargo fmt --all -- --check`, `cargo test --workspace` (5+13+33 testes), `cargo clippy --workspace --all-targets -- -D warnings`, `npm run wasm:build`, `npm run test:standard` (168 testes, 2 ignorados, typecheck e build) e `git diff --check` passaram. Revisão independente refez a checagem da fórmula de custo; a correção final conta uma serialização inicial e três por revisão.
- Limite do lote: composição ainda não é selecionável/salva pela UI. A aprovação OCR individual existente permanece ativa; não houve promoção automática nem autorização adicional de TTS.

## 2026-09-24 — sincronização e verificação do redesign
- Branch `codex/m4-content-model` avançada por fast-forward de `99018f9` a `de75a66` após confirmação HTTPS do HEAD remoto. Ref `origin/codex/m4-content-model` alinhada; árvore inicial limpa.
- GitHub Actions `quality` 36076176027 do commit `de75a66`: `completed/success`.
- Próximo escopo no HANDOFF: comparação visual Studio Dark/Glass em 1440×960 e 390×844. Servidor Vite local iniciado, mas `cua.getState()` não encontrou navegador ou app disponível; inspeção visual não executada. Nenhuma alteração de UI sem divergência reproduzida.
- `cargo fmt --all -- --check` e `cargo test --workspace` passaram. Primeiro `npm run test:standard`: typecheck e 167 testes passaram, build falhou por `@fontsource/geist-sans/latin-400.css` ausente no `node_modules` antigo. `npm ci` pelo lockfile instalou a dependência; segundo `npm run test:standard` passou com 167 testes e build verificado (38 arquivos, 81,39 MB). Node local 24.21.0 gera aviso de engine; pacote requer 22.x.
- Pendência: comparação visual real e eventual ajuste de proporções/spacing em desktop/mobile. Sem alegação de aceite visual.

## 2026-09-24 — leitor Original e feedback de interação
- `da73c7a`: DocumentWorkspace ganhou seletor Texto/Original. Texto reflowed permanece default; Original é lazy-loaded e renderiza o `source_pdf` persistido com `pdfjs-dist`, sem alterar extração ou OCR. Recuperação local relê o mesmo artefato `source_pdf`.
- `79b3a3d`: camada `motion.css` adiciona feedback de seleção, indicador deslizante das tabs, entrada de dock/dialog e transições curtas. `accessibility.css` continua neutralizando motion e ganhou alvo touch para o seletor do leitor.
- CI de `da73c7a`: Rust e Web concluíram com sucesso. O teste de contrato seguinte protege o modo Texto como default e a disponibilidade explícita de Original.
- Tema escuro recebeu correção adicional para badge de revisão sem fundo claro legado.

## 2026-09-24 — redesign Studio Dark/Glass
- Decisão explícita do autor substitui Studio & Paper. O primeiro lote é somente visual: tokens dark/glass, hairlines translúcidos e superfícies elevadas; domínio, adapters, schemas e comportamento ficaram fora do change set.
- PRE-FLIGHT registrado no TASK_PACKET. Arquivos reais de shell/review/narrativa, DESIGN_SYSTEM, PRODUCT_UX_BASELINE e handoff foram conferidos antes da edição.
- Commits do lote inicial: `b3c3bee` aplica tokens/CSS dark-glass; `cee7e78` alinha documentação e handoff. Acessibilidade existente continua invariante.
- Próxima iteração técnica parte do mesmo princípio: ampliar motion/leitor sem alterar contratos de OCR, narrativa, TTS ou persistência.

## 2026-09-24 — Product UX foundations e shell
- Preservadas as alterações funcionais pré-existentes. Auditoria curta e baseline em `docs/PRODUCT_UX_BASELINE.md`.
- Tokens, shell responsivo, navegação por etapas e estados vazios em `main.tsx`/`styles/`; mensagens de falha traduzidas nas telas de OCR, roteiro e áudio.
- Typecheck e revisão visual inicial: 1440, 390 e 320 px, sem overflow. Gates funcionais completos registrados após a execução.

## 2026-09-24 — Narrativa aprovada até WAV no produto
- Rust/WASM promove correção OCR revisada em DocumentIR derivado com hash da fonte, revisão, texto, revision e confirmação local. Também permite aprovação explícita de texto nativo em todas as páginas `good` de prosa; páginas vazias/corrompidas e regiões estruturadas falham fechadas. ContentModel narrativo contém só unidades `eligible`; Outline, Plan, Script inicial, QA e SpeechUnits são produzidos/validados no core. O usuário reescreve a fala, executa QA e confirma referências; o core recusa roteiro literal, source ref inventada, revisão sem suporte, hash obsoleto e finding crítico.
- A síntese narrativa chama o mesmo `renderLocalWav`/Piper e usa o mesmo player, navegação e download. Chunks e WAV final são persistidos nos checkpoints existentes com vínculo ao hash do documento canônico, script e submissão; reload recalcula o recibo Rust e valida WAV/chunks. Modo literal anterior permanece disponível.
- Smoke Chrome: o mesmo PDF sintético de duas páginas exportou WAV literal e narrativo diferentes, cada um com dois capítulos; reprodução, download, manifesto, roteiro/QA e reload narrativo passaram. Smoke OCR de região percorreu captura→revisão→aprovação→Script/QA→TTS/WAV→reload. O primeiro uso do Piper fez quatro requisições aos endpoints conhecidos do modelo; OCR não fez outras requisições externas.
- Gates: Rust fmt e 49 testes de workspace passaram; Web typecheck, 157 testes (2 ignorados) e build passaram; build mantém avisos preexistentes de externalização `crypto/path/fs` do Piper. A fixture sintética prova integração, não qualidade narrativa em PDF real. QA retorna `review` por `CLAIM_GROUNDING_NOT_EVALUATED`; a revisão humana explícita é exigida. Aprovação local não autentica a identidade do operador. OCR de múltiplas correções no mesmo documento ainda precisa de composição canônica.

## 2026-09-24 — Exportação integral executada
- O produto agora valida todas as páginas pelo core Rust antes de sintetizar, salva cada WAV de página com o checkpoint atual, reutiliza chunks válidos, monta um WAV PCM único e publica `final_audio` com manifesto de capítulos. UI toca, busca capítulo anterior/próximo, baixa WAV e manifesto, e reabre após reload.
- Smoke Chrome: PDF de duas páginas, Piper local, WAV baixado com cerca de 4,6 s; reprodução, hash do manifesto, capítulos em ordem e recuperação após reload passaram. Cópia do download em `C:\Users\Kauan\Documents\Codex\2026-09-24\pros\outputs`. Rust fmt/47 testes; Web typecheck/157 testes/build; smoke passou. QA detectou risco de reabrir áudio após mudança do DocumentIR; o manifesto agora vincula o hash do documento ativo e rejeita versões desatualizadas. PDFs com página sem texto confiável continuam bloqueados antes da síntese; o fluxo narrativo e reconciliação OCR seguem pendentes.

## 2026-09-24 — M4.5O memória local de ambiguidades OCR
- O usuário pediu uma entrega ampla e um loop local de aprendizado para ambiguidades. O batch implementa extração Rust de regras a partir de correções humanas explícitas, banco IndexedDB local de registros derivados e modelo determinístico compilado em lote. O operador atualiza o snapshot, que recebe hash, lista de evidências distintas e regras aceitas; o OCR o consulta sem corrigir automaticamente. Não há modelo neural, serviço externo, SQLite ou retreinamento de pesos.
- Regra aceita somente tokens ASCII técnicos com dois ou mais caracteres, mesmo tamanho, uma diferença limitada aos pares `0/O`, `1/I/L`, `5/S` e `8/B`, e ao menos um dígito em um dos lados. Proposta ampla, inserção, remoção, reordenação e whitespace divergente não viram memória. Cada registro é ligado a fonte, recibo do candidato e hash da revisão; o hash do registro detecta inconsistência, mas não autentica o revisor.
- IndexedDB guarda no máximo 1.024 registros e somente hashes e pares de token. Três recibos de candidato distintos, sem empate de alternativa, são exigidos antes de o core emitir `review_required` com texto sugerido. A UI exige clique para copiar a proposta e uma caixa explícita para acrescentar uma nova correção à memória. DocumentIR, candidato, checkpoint, leitura e TTS permanecem imutáveis.
- Gates: Rust fmt/test workspace 47 testes e WASM release passaram; Web typecheck, 155 testes (2 opt-in ignorados) e build passaram. Smoke Chromium `test:browser:ocr-learning` passou com Rust/WASM, IndexedDB, três evidências diferentes, texto sugerido `MOVE TO SAMPLE01` e zero requisições externas. Revisão independente encontrou que três revisões da mesma evidência podiam satisfazer o limiar e que a memória não tinha revogação. O core agora deduplica pelo recibo do candidato; o operador pode apagar toda a memória após confirmação e o repositório oferece remoção por hash. Build mantém avisos já existentes do Piper sobre `fs`, `path` e `crypto`. O primeiro `wasm-bindgen-cli` não existia; binário oficial 0.2.128 foi usado em `work/` para gerar bindings compatíveis. Tentativa de compilá-lo localmente falhou pela ausência de `dlltool.exe` e `link.exe`.
- Próximo batch: corpus público em português e goldens revisados, métricas de falso positivo e política de retenção/limpeza da memória. Só depois avaliar classificador ONNX ou fine-tuning offline. Reconciliação canônica Rust, atestação e narração continuam bloqueadas.

## 2026-09-24 — M4.5M OCR de página digitalizada sem texto
- Base local `9f7e683` atualizada por fast-forward até `99018f9`, alinhada ao remoto e inicialmente limpa; workflow remoto anterior concluído com sucesso. PRE-FLIGHT em TASK_PACKET. ADR 0024 registra o alvo virtual `__page__` exclusivamente para página `no_text` com `rawText` vazio e nenhuma região; Rust valida recibo/comparação/revisão e recusa `keep_native`. DocumentIR e elegibilidade de narração não mudam.
- PDF.js captura a página inteira com limites existentes. Gravação e leitura histórica reabrem o PDF salvo para conferir fonte, página, bbox e dimensões renderizadas; PNG, candidato e recibo continuam verificados. UI expõe página sem texto e mostra OCR como candidato, não como transcrição aprovada. Skill humanizer aplicada aos textos de UI; sem inspeção visual a pedido do usuário.
- `npm ci` pelo lockfile: 88 pacotes, audit 0 vulnerabilidades; execução offline falhou porque `zlibjs` não estava no cache, repetição com rede passou. Rebuild WASM passou. Rust `fmt`, 46 testes e Clippy `-D warnings` passaram. Web typecheck, 150 testes (2 opt-in ignorados), build e audit 0 passaram. `git diff --check` sem erros. Avisos de externalização `fs/path/crypto` do Piper persistem no build.
- Smoke funcional Chromium com PDF sintético só de imagem: Tesseract local reconheceu `COBOL`, evidência/revisão `unverified` salvas e reabertas após recarga, 0 requisições externas observadas. Smoke regional preexistente passou. Testes direcionados após ajuste de `rawText` vazio: Rust 46 e Web 16 passaram. Sem golden privado/revisão humana real, atestação ou reconciliação; não promover OCR para TTS.
- Revisão independente apontou colisão de ID `__page__` com região real e estado `keep_native` remanescente após troca de área. A região real passou a ter precedência em Rust/Web; a seleção limpa a decisão anterior. Testes Rust/WASM cobrem a colisão. O apontamento sobre espaços foi resolvido com exigência de `rawText` exatamente vazio em ambas as fronteiras. Revisor confirmou a correção e não encontrou P0–P2 remanescentes. Commit, push e CI remoto: pendentes neste registro até confirmação.

## 2026-09-24 — M4.5L interface de revisão OCR
- CI do commit anterior `4aeae68` (run 35973083543) passou antes da edição. PRE-FLIGHT em TASK_PACKET. Interface isolada seleciona região existente, lê PDF original do OPFS e confere identidade, executa Tesseract local, persiste evidência, mostra recorte/texto nativo/OCR e diferenças Rust, salva submissão `unverified` e reabre histórico validado. PDF >8 MB ou sem região elegível é informado e não inicia captura.
- Revisões independentes encontraram P2 em cancelamento durante save e controles Unicode invisíveis capazes de confundir comparação visual. O adapter passou a aceitar abort e conferir sinal antes do commit; UI bloqueia cancelamento e nova importação no trecho de publicação. Regressão prova ausência de checkpoint/artefatos após abort pré-commit. Texto de tela representa controles Cf/Cc como `U+`, com teste adversarial; bytes de fonte/hash não mudam. QA e segurança finais sem P0–P2.
- Build dividiu painel/engine OCR em chunks sob demanda; bundle inicial ficou em 263,57 kB JS. Gates: Rust fmt/45 testes/Clippy; Web typecheck/148 testes (2 opt-in ignorados)/build; `git diff --check`. Smoke Chromium importou fixture pública, gerou OCR, salvou revisão, recarregou e abriu histórico, sem requisições externas observadas. Sem PDF/golden privado, OCR de página sem região, atestação ou promoção de texto. Avisos Piper `fs`/`path`/`crypto` preexistentes no build.
- Publicação e CI deste commit a confirmar.

## 2026-09-24 — M4.5K persistência histórica de revisão OCR
- Base `365aeb3` limpa e alinhada ao remoto; CI `quality` 35972245202 passou. PRE-FLIGHT antes do código. Novo artefato `ocr_review_submission` fixado em OPFS/IndexedDB guarda submissão, recibo `unverified` e chaves dos dois manifests OCR; gravação relê PNG/evidência e recibo Rust, exige fonte ativa e usa CAS do checkpoint. Leitura histórica exige trio em um mesmo checkpoint, revalida bytes/evidência/recibo e retorna `not_established`.
- QA apontou duas lacunas P2 de testes (órfão e corrida no retry); regressões adicionadas e passaram. Revisão final sem P0–P2. Smoke Chromium com armazenamento e Web Locks reais passou: gravação/retry, reload e leitura da revisão, 0 requisições externas; medição sintética de código continua 7/8 tokens com `SAMPLE01` ausente.
- Gates finais: Rust fmt/45 testes/Clippy `-D warnings`; Web typecheck, 146 testes (2 opt-in ignorados) e build; `git diff --check`. Primeiro smoke falhou antes de abrir navegador porque Chromium temporário não existia mais; reinstalado em `/tmp`, repetição passou. Build mantém avisos Piper de `fs`/`path`/`crypto`.
- Sem identidade confiável de revisor, promoção de OCR, goldens privados ou TTS narrativo. Publicação/CI deste commit a confirmar.

## 2026-09-24 — M4.5J submissão de revisão OCR
- Base `fd80455` limpa e alinhada ao remoto; PRE-FLIGHT registrado antes do código. Rust recalcula candidato e comparação antes de aceitar escolha explícita com justificativa, emitindo recibo hash-bound `unverified`. Proposta de correção é texto declarado, não fonte confirmada; DocumentIR, ContentModel, checkpoint e elegibilidade não mudam.
- Fachada WASM aplica limites JSON; schema/adapter TS validam a fronteira. Testes Rust cobrem hash determinístico, replay de recibo, decisão incompatível, justificativa vazia, candidato alterado e ausência de mutação. Vitest usa WASM real e confere recibo forjado. ADR 0022 e status da arquitetura OCR atualizados.
- Gates: `cargo fmt --all -- --check`, `cargo test --workspace` (45), Clippy `-D warnings`, WASM build, Web typecheck/141 testes/build e `git diff --check` passaram. Revisão independente sem P0–P2. Build preserva avisos Piper de `fs`/`path`/`crypto`. Sem corpus privado/goldens revisados, autenticação de revisor ou persistência da submissão nesta etapa.
- Publicação e CI remoto a confirmar após commit.

## 2026-09-23 — M4.5H medição pública de código OCR
- Usuário informou que não dispõe dos PDFs/goldens privados no momento e autorizou exemplos públicos. Sintaxe conferida com manual oficial GnuCOBOL; caso de cinco linhas foi criado no smoke sem copiar PDF ou código privado.
- Primeira medição real no Chromium: sete de oito tokens técnicos preservados; `SAMPLE01` foi transcrito como `SAMPLEO1`. O caso não é um golden de produção; a divergência demonstra por que OCR de código permanece em revisão e não libera narração.
- Revisão independente apontou que observação de rede na Page não cobria Worker. O smoke usa agora BrowserContext; repetição Chromium confirmou 7/8 tokens e 0 requisições externas observadas. Gates Rust fmt/43 testes e Web 137 testes/typecheck/build/diff check passaram; publicação continua bloqueada por ausência de credenciais GitHub neste ambiente.

## 2026-09-23 — M4.5G evidência OCR persistente
- Corpus privado não encontrado neste checkout. Em vez de atribuir qualidade a transcrição não revisada, a etapa preserva PNG/candidato/recibo como dois artefatos `ocr_evidence` fixados em OPFS, com manifests e checkpoint IndexedDB publicados juntos sob lock.
- Gravação exige fonte ativa correspondente e revalida PNG, dimensões, bbox, candidato e recibo pelo Rust/WASM. Leitura histórica reconfere manifests, bytes e contexto fornecido; retorna `currentness: not_established`, inclusive após troca de fonte. Não promove texto.
- Revisão independente apontou leitura sem checkpoint e retry que criava novo checkpoint. Ambos corrigidos; testes cobrem idempotência, manifest órfão, corrupção, troca de fonte e corrida de leitura. Segunda revisão pendente neste registro.
- Segunda revisão encontrou corrida no retry e PNG truncado aceito com hash coerente. O retry agora compara o checkpoint inicial após a leitura; PNG exige estrutura de chunks, CRC, IDAT e IEND terminal. Regressões específicas passaram. Gates finais: Rust fmt/43 testes; Web 137 testes (2 opt-in ignorados), typecheck/build e diff check. Revisão final read-only pendente neste registro.
- Revisão final ainda apontou PNG semanticamente inválido com CRC correto. O adapter agora limita o perfil IHDR, ordem dos chunks e exige decodificação via `createImageBitmap` no navegador antes de salvar/ler. Gates a repetir após essa correção.
- Smoke Chromium com OPFS, IndexedDB e Web Locks reais passou: OCR da fixture pública, gravação de dois artefatos, leitura, retry idempotente e recuperação após reload. A primeira execução revelou que OPFS devolve Blob sem MIME; leitura passa a atribuir `image/png` após confirmar o MIME do manifest e os bytes/decodificação. Testes completos serão repetidos antes da publicação.
- Revisão independente final apontou custo evitável em PNG malicioso; dimensões agora são limitadas antes do parse, chunks têm limite de 4.096 e CRC usa tabela. Revisor confirmou ausência de P0/P1/P2. Gates finais após correção: Rust fmt/43 testes, Web 137 testes (2 opt-in ignorados), typecheck/build, diff check; smoke Chromium real passou após reload. Publicação/CI a confirmar.

## 2026-09-23 — M4.5F engine OCR no navegador
- Tesseract.js 7.0.0 e `@tesseract.js-data/por` 1.0.0 adicionados com versões fixas. Staging copia worker, três variantes LSTM do core e idioma português para assets locais no dev/build. O adapter configura apenas URLs da própria origem e encerra worker ao concluir ou cancelar.
- Smoke em Chromium isolado executou PDF.js, captura, engine Tesseract real e recibo Rust/WASM: reconheceu o título da fixture pública, estado `pending`, hash da imagem igual no recibo e 0 requisições externas observadas. A primeira tentativa falhou por ausência de Chrome no host; um Chromium foi instalado em `/tmp` e a execução passou. Não houve teste de qualidade em PDF privado.
- Gates: `cargo fmt --all -- --check`, `cargo test --workspace` (43), Web typecheck, 131 testes (2 opt-in ignorados), build, `npm audit --audit-level=high` (0 vulnerabilidades) e `git diff --check` passaram. Build mantém avisos Piper já existentes. Assets OCR acrescentam cerca de 21 MB ao build; carregamento ocorre sob demanda.
- Próximo passo: medir engine em recortes revisados do corpus local, persistir imagem/candidato/recibo e definir reconciliação Rust. OCR permanece fora da UI e não libera texto para fala.

## 2026-09-23 — M4.5E encadeamento local OCR
- Repositório atualizado por fast-forward até `9f7e683` após fetch HTTPS; SSH não tinha chave neste ambiente. Árvore limpa antes da edição.
- Novo adapter `proposeLocalOcrCandidate` captura uma região PDF verificada, entrega o Blob imutável a um port de engine local, vincula a saída ao hash da imagem e solicita recibo ao Rust/WASM. Cancelamento e prazo de 15 segundos cobrem a chamada da engine. O recibo permanece `pending`.
- Teste com engine falsa confere que os mesmos bytes capturados chegam à engine e que o WASM real emite recibo vinculado; outro teste cobre cancelamento com engine pendente. Isso não comprova reconhecimento de texto real nem fidelidade de OCR.
- Gates executados: `cargo fmt --all -- --check`, `cargo test --workspace` (43 testes), `npm run typecheck`, `npm test` (131 passed, 2 skipped), `npm run build`, `git diff --check`. `npm ci` exigiu acesso à rede fora do sandbox e instalou o lockfile sem vulnerabilidades reportadas. Build mantém avisos existentes de externalização `fs/path/crypto` do Piper.
- Próxima etapa: escolher/empacotar engine OCR executável no navegador, validar recortes e goldens locais por prosa e código, e só depois projetar reconciliação canônica Rust. Nenhum texto foi promovido para fala.

## 2026-09-23 — validação Piper e persistência WAV literal
- Base limpa `bbb8b15`; CI `quality` do commit concluiu `success`. PRE-FLIGHT registrado antes das alterações.
- Teste funcional no navegador integrado: PDF local de 75 páginas importado; sessão Rust/WASM da página 10 aceita; Piper baixou modelo e gerou WAV reconhecido por `<audio>` com duração 105,534694 s. Fixture pública `text_and_blank.pdf` gerou WAV de 3,146304 s. Ao acionar reprodução nativa, a aba caiu nas duas tentativas; causa não isolada. Não houve escuta ou inspeção visual.
- Persistência: novo adapter grava WAV literal e metadata no OPFS, publica checkpoint/manifest via serviço existente e recupera somente após comparar documento, fonte e hash de sessão Rust/WASM. Áudio é `audio_chunk` fixado, nunca `final_audio` narrativo. Falha de armazenamento mantém WAV gerado disponível para download imediato. Gravações antigas não são excluídas automaticamente.
- Teste dirigido `saved_literal_audio.test.ts` passou. Após gerar novamente a fixture no navegador integrado, a UI confirmou salvamento e, após recarga, recuperou projeto e WAV salvo. O elemento `<audio>` e link de download estavam presentes. `waitForEvent('download')` não recebeu evento no navegador integrado; download em arquivo externo não está comprovado.
- Ajuste após revisão: salvar exige sessão idêntica à reconstruída pelo Rust/WASM; WAV ausente/corrompido não deve bloquear recuperação do documento e ganha mensagem específica. Web STANDARD passou: 119 testes, 2 opt-in ignorados, typecheck e build. Rust fmt/test/clippy passaram (43 testes); npm audit encontrou 0 vulnerabilidades; diff check passou. CI do novo commit ainda não executada.
- Riscos: reprodução externa, quota/retention e integridade do modelo remoto. A queda da aba ao reproduzir no navegador integrado permanece não isolada.

## 2026-09-23 — geração de WAV local da leitura literal
- Base limpa `4560aa7` em `codex/m4-content-model`; PRE-FLIGHT registrado antes do código. Rust/WASM permanece fonte canônica da sessão; TS apenas adapter de TTS/Web/UI.
- Instalada versão fixa de Piper Web 1.0.5, ONNX Runtime Web 1.18.0 e fonemizador Piper WASM 1.0.0. O build copia os runtimes WASM/data para mesma origem; o modelo Faber pt-BR (~63 MB) é baixado sob comando do usuário. HEAD dos endpoints ONNX e configuração retornou HTTP 200; não houve download/inferência real do modelo neste ambiente.
- Implementados Worker de síntese, validação de WAV, cancelamento e UI de reprodução/download. Saída não é persistida automaticamente no projeto. ADR 0016 registra licença, privacidade e limites.
- `npm run typecheck` passou. O primeiro `npm run test:standard` parou por erro de tipo no teste; corrigido. A primeira execução dos testes fora do sandbox achou fixture WAV sem bits-per-sample; corrigida. Gate Web STANDARD final: 118 testes passaram, 2 opt-in ignorados, typecheck e build passaram. Execução no sandbox falhou com `spawn EPERM`; repetição fora passou.
- Gates finais: Rust fmt/test/clippy passaram (43 testes); Web STANDARD passou (118 testes, 2 opt-in ignorados); `npm audit --audit-level=high` retornou 0 vulnerabilidades; `git diff --check` passou. Revisão do diff confirmou assets de runtime ignorados, dependências pinadas e ausência de PDF/modelo no Git.
- Pendente antes de afirmar TTS funcional em dispositivo: síntese real e escuta em navegador, quota/tempo e integridade do modelo. Não houve teste visual, conforme preferência do usuário. CI do novo commit ainda não executada.

## 2026-09-23 — modo de leitura local de PDF nativo
- Base limpa `2e28a7e` em `codex/m4-content-model`. PRE-FLIGHT em `.ai/TASK_PACKET.md`. Sem mudança de backend, OCR ou modelo narrativo.
- Rust cria sessões atômicas de uma a dez páginas a partir de DocumentIR v2. Bloqueia páginas sem texto, suspeitas, regiões inutilizáveis, divergência de fonte, perda/junção detectável de tokens e tamanho excedido. WASM expõe a sessão; Web valida a fronteira e usa Web Speech com `localService=true`.
- UI permite escolher intervalo, conferir todo o texto, confirmar e ouvir/pausar/retomar/parar. Importação e troca do intervalo cancelam reprodução. Áudio não é salvo/exportado; isto não é aprovação semântica nem audiobook final. ADR 0015 e README descrevem limites.
- Revisão independente identificou dois P2: cobertura incompleta do texto nativo e corrida na recuperação. Corrigidos por comparação de tokens e separação de geração de importação/requisição de leitura. Segunda revisão identificou junção de palavras ainda possível; corrigida e coberta por teste. Revisão final do trecho não encontrou P0–P2. Revisor não executou testes.
- Gates finais: Rust fmt/test/clippy passou (43 testes de workspace); `npm run wasm:build` passou; Web STANDARD passou (114 testes, 2 casos opt-in ignorados, typecheck e build). Os dois casos opt-in com PDFs locais passaram: a apostila criou sessão na página 10; o manual com PUA foi recusado. `npm audit --audit-level=high` encontrou 0 vulnerabilidades. Nenhum teste auditivo, visual ou E2E no navegador foi executado. PDFs ficaram fora do Git.
- Riscos: voz local pode não estar disponível no navegador do usuário; `localService` é declaração da plataforma; fidelidade visual do PDF não foi atestada; sem OCR, export ou roteiro narrativo. Próximo marco: validar reprodução em navegador/dispositivo real e entregar caminho de áudio persistido/exportável com QA apropriado, mantendo trilha de OCR separada.

## 2026-09-21 — Milestone 0 bootstrap
- Fato: o repositório de trabalho continha somente `outputs/` e `work/`.
- Fato: os arquivos `MASTER_ENGINEERING_REPORT.md`, `AGENTS.md`, `PROMPT_MESTRE_CODEX.md` e `Audiobook_Studio_Engineering_Package.zip` não foram encontrados no workspace.
- Decisão: inicializar um monorepo local-first mínimo, sem microserviços nem backend obrigatório.
- Decisão: manter `AGENTS.md` enxuto e usar `docs/CONTEXT_INDEX.md` para roteamento de contexto.
- Alterações: adicionados workspace Cargo, crate de domínio, crate WASM, PWA React/Vite, schemas, workers, adapters, tokens, ADRs, hooks e CI.
- Verificação: `git init` executado somente neste diretório porque não havia repositório local.
- Verificação inicial: Node `v24.0.2` e npm `11.19.1` disponíveis; Cargo/Rust não estavam no PATH. A inspeção posterior encontrou Cargo em `.rustup/toolchains/`.
- Verificação inicial: gates Rust não foram executados; gates Web dependiam de instalação e lockfile. O estado foi atualizado na seção de publicação abaixo.
- Verificação: `npm install` gerou `apps/web/package-lock.json`; instalação reportou vulnerabilidades transitórias, e `npm audit --audit-level=high` subsequente retornou 0 vulnerabilidades.
- Verificação: `npm run typecheck` passou.
- Verificação: `npm run build` passou após execução fora do sandbox; a primeira tentativa falhou com `spawn EPERM` do esbuild no sandbox.
- Verificação: revisão do estado local confirmou somente arquivos do projeto como não rastreados; nenhum arquivo pessoal fora do workspace foi alterado.
- Risco: o bootstrap contém contratos mínimos, não implementa parsing PDF, IA, TTS, persistência ou backend.
- Próximo passo registrado no bootstrap: preparar toolchain Rust, dependências Web e DocumentIR com fixtures reais. Dependências e lockfile Web foram preparados depois.

## 2026-09-22 — Publicação do Milestone 0
- Fato: os anexos originais chegaram após o bootstrap. SHA-256: relatório `AB266DE588DC388FA214526829BCD0A7813A3C20E871278B8492C2F73708A1FF`; AGENTS original `295BEC9DF5B5FE88C0A9D8CB26D2E2DFF00C2CE631FA4FA14F8A00D8C10DDAEC`; prompt `EA2932481C16434D54EAEC5109B235D9B87990D020B0858D84E6B41464091085`.
- Fato: `git ls-remote` do repositório informado retornou sem referências; publicação inicial pode usar `main`.
- Decisão: preservar os três arquivos originais em `audiobook_studio_engineering/`, com `AGENTS_SOURCE.md` para evitar instrução automática duplicada; manter `AGENTS.md` da raiz enxuto.
- Decisão: CI Web usa `npm ci` e cache baseado no lockfile.
- Fato corrigido: Cargo 1.94.1 está instalado no toolchain, mas fora do PATH. `cargo fmt` não está disponível e `cargo test --workspace` baixou dependências, gerou `Cargo.lock`, mas parou por falta do linker MSVC `link.exe`.
- Correção de contrato: schema TypeScript aceita `title: null`, como o `Option<String>` serializado pelo Rust; worker responde erro explícito enquanto não houver adapter PDF.
- Verificação: `npm run typecheck` passou em 2026-09-22.
- Verificação: `npm run build` passou em 2026-09-22.
- Verificação: `npm audit --audit-level=high` retornou 0 vulnerabilidades.
- Verificação Rust: `cargo fmt` indisponível (componente rustfmt ausente); `cargo test --workspace` parou antes dos testes por falta do linker MSVC `link.exe`. O lockfile Rust foi gerado e deve ser versionado.
- Publicação: commit inicial `48c79cc54d74681e2523308537c6f9e490fde461` enviado para `origin/main`; `git ls-remote` confirmou o mesmo hash no remoto.

## 2026-09-22 — Correção do CI inicial
- Fato: o workflow `quality` falhou em `npm audit --audit-level=high` e `cargo fmt --all -- --check` nos primeiros dois commits publicados.
- Causa Web: Vite 5.4.10 e esbuild transitivo tinham avisos ativos no npm registry. O audit local anterior em sandbox havia retornado 0 sem refletir esses avisos; a consulta com rede confirmou as vulnerabilidades.
- Correção Web: Vite 8.3.0 e `@vitejs/plugin-react` 6.1.1, com lockfile atualizado. Os peers opcionais do plugin foram conferidos no registro npm.
- Correção Rust: formatados os arquivos com rustfmt 1.94.1 oficial; pacote baixado para `work/` e verificado por SHA-256 antes do uso.
- Verificações locais: `npm ci`, `npm audit --audit-level=high`, `npm run typecheck`, `npm run build` e rustfmt `--check` passaram.
- Limite local: `cargo test --workspace` continua bloqueado pela ausência de `link.exe`; o job Rust do GitHub Actions deve executar os testes após a correção de formatação.

## 2026-09-22 — M1/M2 em andamento
- Estado inicial: `main` limpo em `54b2c59`; CI do bootstrap concluído com sucesso.
- PRE-FLIGHT: registrado em `.ai/TASK_PACKET.md`; M1 será validado antes da implementação do M2.
- Diretriz do usuário: a skill `humanizer` passa a ser obrigatória para textos do frontend; layout segue design tokens e acessibilidade.
- M1 implementado: DocumentIR v1 com páginas/blocos/unknown/OCR, SHA-256 e ID de documento derivados da fonte, validação de integridade, manifest/cache key, job com transições e retomada explícitas, fixture compartilhado e ADR 0004.
- Verificações locais M1: rustfmt `--check`, `npm test` (4 testes), `npm run typecheck`, `npm run build` e `npm audit --audit-level=high` (0 vulnerabilidades) passaram. Testes Rust e clippy aguardam CI por falta de `link.exe` local.
- Revisão: confiança é `null` quando não medida, `documentId` usa o digest SHA-256 completo e páginas com blocos exigem texto bruto para auditoria.
- CI M1: workflow `quality` do commit `a0de960` concluiu com sucesso, incluindo os gates Rust em Linux.

## 2026-09-22 — M2 inicial e adendo de narração/performance
- Evidência M2: PDF.js oficial `getDocument`/`getTextContent`; npm registry confirmou versões/engines. A 6.3.289 falhou no teste Node local por `Uint8Array.toHex`; 5.4.296 com build legacy passou em fixture real de duas páginas. A correção foi escolher versão compatível, sem polyfill artificial.
- Decisão M2: manter extração local em Worker, limite 32 MB/500 páginas, hash fonte, blocos `unknown` e confiança `null`; página sem texto permanece `needs_ocr`. Heurísticas de layout/noise e OCR ainda pendentes.
- Fixture PDF sintético foi gerado com reportlab, inspecionado via `pdfinfo`/render; primeira página contém texto legível e segunda é vazia. Renderização teve avisos de fontes opcionais Symbol/ArialUnicode, sem defeito visível na página 1.
- Diretriz humanizer aplicada à microcopy da tela de importação; o conteúdo PDF é mostrado como texto React, não HTML.
- Pedido complementar do usuário: problemas narrativos/performance reportados do primeiro audiobook, sem áudio/mainframe anexado. PRE-FLIGHT em TASK_PACKET; identificados gaps entre DocumentIR→ScriptAdapter e seleção fixa de TTS.
- Decisão: ADRs 0005/0006 e adendo normativo formalizam planner, memória, políticas de heading, QA pré-TTS, engine router, TTFA, geração progressiva/lazy e limites reais de background Web. Contratos/fixtures iniciais testam fronteiras, não funcionalidades ainda inexistentes.
- Pendências: teste de browser end-to-end, heurísticas PDF M2, golden mainframe real (arquivo não recebido), implementação M3–M5 e benchmarks/dispositivos.
- Browser smoke tentado: servidor Vite subiu em `localhost:5173`, mas `agent-browser` não está instalado e a aba do navegador integrado não anexou (timeout). Não há evidência de importação end-to-end no browser; servidor local foi encerrado.
- Verificações finais: `npm test` (14/14), `npm run typecheck`, `npm run build`, `npm audit --audit-level=high` (0 vulnerabilidades) e `git diff --cached --check` passaram. PDF fixture foi marcado binário em `.gitattributes` para impedir conversão CRLF.
- Commit da importação inicial: `827056a` (`feat(pdf)`). O M2 ainda não está concluído; classificação layout/noise e smoke de navegador faltam.
- Segundo pedido de performance: especificou `auto | fast | quality` na UI, tier técnico `balanced` interno, RTF com convenção geração/duração, TTFA cold/warm, estados independentes playback/export, política de voz para fallback, JIT/backpressure e fases. A arquitetura staged foi alinhada; ADR 0006 atualizado e ADR 0007 criado sem alterar snapshots Rust v1.
- `docs/PERFORMANCE_REQUIREMENTS.md` enumera requisitos PERF-01..12, estratégia de fakes/benchmark/matriz e o que ainda é apenas designed. Contratos `EnginePlan`/benchmark/estados foram ampliados; profiler/router/TTS/player não foram implementados nesta execução.
- Gates após o segundo pedido: `npm test` 16/16, `npm run typecheck`, `npm run build` e `npm audit --audit-level=high` (0 vulnerabilidades) passaram. Rust não mudou e seguirá validado no CI Linux; teste local ainda depende de linker MSVC ausente.
- Publicação: commits `827056a` e `e6097de` enviados a `origin/main`. GitHub Actions `quality` run `35730730855` do commit `e6097de` concluiu com sucesso (jobs Rust e Web definidos em `.github/workflows/quality.yml`). Estado local limpo antes deste registro.

## 2026-09-22 — M2 layout/ruído e verificação de browser
- PRE-FLIGHT atual registrado no TASK_PACKET com `main` limpo em `844cc48`; relatório RF-STR-007/M2 e ADR 0004 consultados.
- Decisão: agrupar runs adjacentes por EOL/posição, preservar `rawText` e ordem; marcar apenas candidatos de cabeçalho/rodapé quando texto exato se repetir em margens de pelo menos três páginas e 60% do total. Nenhum trecho é removido, confiança continua `null` e tipo incerto permanece `unknown`.
- Teste inicial: 20/20 Vitest, typecheck e build passaram (build exigiu repetição fora do sandbox por `spawn EPERM`).
- Browser real via agent-browser temporário revelou bug não coberto: mensagens internas PDF.js (`sourceName`, `targetName`, `action`, `data`) eram tratadas como erro, apagando status e encerrando Worker. Decoder de fronteira adicionado; três testes de regressão.
- Verificação após correção: 23/23 Vitest, typecheck e build passaram. Em sessão Chrome limpa, PDF sintético mostrou duas páginas e aviso `needs_ocr`; JSON enviado como entrada inválida mostrou erro tipado e não manteve prévia anterior. Screenshot completo inspecionado; `errors --json` retornou lista vazia na sessão limpa. Erros históricos anteriores eram da instrumentação temporária inválida e do HMR durante edição, não do fluxo final.
- Limites: página rotacionada não é classificada por margem; texto de documento real multicoluna e browser matrix não foram testados. PDF.js usa fake worker interno dentro do Worker do aplicativo; UI ficou responsiva no teste curto, sem benchmark de documentos grandes.

## 2026-09-22 — Ingestão v2 e política multiagente
- PRE-FLIGHT: ingestão/OCR e multiagente registrados no TASK_PACKET. O Lead permaneceu único writer; Explorer e QA atuaram read-only.
- Ingestão: adicionados DocumentIR v2 TS, migração explícita v1→v2, camadas `rawText`/`ocrText`/`reconstructedText`, proveniência/incerteza, conteúdo tipado para código/tabela/fórmula/visual, audit/project manifests e fixture v2.
- Policies testadas: OCR seletivo com escopo explícito e IDs normalizados; eviction LRU apenas de artefatos regeneráveis/desprotegidos, com validação numérica.
- PDF hardening: decoder separa mensagens internas do PDF.js do protocolo do aplicativo; limites de texto expandido e cancelamento cooperativo foram adicionados. Limite conhecido: `getTextContent()` pode alocar memória antes do corte e o `AbortSignal` não interrompe internamente o PDF.js.
- Arquitetura: ADRs 0008/0009, estratégia de testes, segurança e `GAP_ANALYSIS` classificam engines OCR/visual, storage físico, TTS e runtime narrativo como pendentes; schemas não foram descritos como engines funcionais.
- Multiagente: documentação oficial confirmou `.codex/agents/*.toml`; Codex CLI local `0.155.0-alpha.9.2` reportou `multi_agent` estável. Criados dez perfis e limite de três subagentes. Onze TOMLs parsearam com `tomllib`.
- Teste multiagente real: Explorer Terra/medium auditou configuração; QA Terra/medium revisou o change set; Lead integrou. QA encontrou incompatibilidade `region.type/content.kind`, fonte vazia, IDs OCR não normalizados e accounting inválido de eviction; todos foram corrigidos e rechecados. O risco de expansão PDF antes do limite permanece documentado.
- Limite de validação: perfis foram criados durante a sessão atual; descoberta automática pelo cliente requer nova sessão com o repositório confiável e não foi alegada como confirmada.
- Verificações Web finais: 41/41 Vitest, `npm run typecheck`, `npm run build` e `npm audit --audit-level=high` passaram; audit encontrou 0 vulnerabilidades.
- Verificações Rust: rustfmt 1.94.1 `--check` passou. `cargo test --workspace` baixou dependências, mas permanece `BLOCKED_TOOLING` por ausência local de `link.exe`; CI Linux é o gate executável após publicação.
- Publicação: commits `fb204ee`, `c7ab1dc` e `61c8d8e` enviados para `origin/main`; `git ls-remote` confirmou `61c8d8e3d2b60db9bcb78fb72ca34fe185442730` no remoto.
- CI: workflow `quality` run `35742455205` concluiu com `success` para `61c8d8e`, cobrindo os gates Rust e Web definidos no repositório.

## 2026-09-22 — M3.1 checkpoints IndexedDB e quota
- PRE-FLIGHT M3.1 registrado no TASK_PACKET. Lead foi o único writer; Explorer e QA atuaram read-only.
- Dependência de teste: `fake-indexeddb` 6.2.5 adicionada com versão exata; `npm audit --audit-level=high` retornou 0 vulnerabilidades.
- Contrato: schema v1 de checkpoint valida IDs, sequence, timestamps, pipeline, source hash, estados do `GenerationJob` e artifact keys. Fixture compartilhada confirma o wire format Web/Rust.
- Adapter: `IndexedDbCheckpointRepository` persiste por chave composta `projectId + sequence`, calcula checksum SHA-256, isola projetos, aceita repetição idempotente e rejeita conflito com conteúdo diferente.
- Recovery: `loadLatest` é estrito; `recoverLatest` devolve o checkpoint válido mais recente e lista registros rejeitados sem apagá-los. Busca é limitada a 1.000 candidatos; o limite só falha quando toda a janela é inválida e há histórico mais antigo.
- Resiliência: falha transitória de abertura limpa a conexão em cache e permite retry; `versionchange` fecha/invalida a conexão. Quota e pedido de persistência degradam para `unavailable`/`denied` sem bloquear leitura.
- Revisão independente encontrou dois P1: recovery bloqueava histórico grande e conexão rejeitada/fechada ficava cacheada. Ambos foram corrigidos. Last-write-wins também foi substituído por `CHECKPOINT_CONFLICT`.
- Limites: sem OPFS, lock/lease entre abas, retenção/limpeza física, integração runtime Rust/WASM, UI ou matriz real de browsers. Checksum detecta corrupção acidental, não adulteração same-origin.
- Verificações finais: 54/54 testes Web, typecheck, build, audit e rustfmt passaram. `cargo test --workspace` local continua `BLOCKED_TOOLING` por `link.exe`; CI Linux validará o fixture Rust após publicação.
- Publicação: commit `53d1418ed27b258601ff9e874d766b3a5da52b28` enviado para `origin/main`.
- CI: workflow `quality` run `35747894619` concluiu com `success`, incluindo testes Rust do fixture compartilhado e gates Web.

## 2026-09-22 — M3.2 OPFS, locks e retomada Web
- Retomada local preservou trabalho inacabado da sessão anterior em `codex/m3-persistence-resume`; nenhum reset foi necessário.
- OPFS: artefatos são nomeados por hash, verificados após escrita, validados na leitura, listados por namespace seguro e removidos explicitamente.
- Concorrência: `WebLocksProjectLock` usa lock exclusivo por projeto e preserva erros da operação protegida; lock ocupado/indisponível falha de forma tipada.
- IndexedDB foi elevado para versão 2, preservando `checkpoints` v1 e adicionando `artifacts`; manifests + checkpoint são publicados na mesma transação após OPFS validado.
- `LocalProjectPersistence` coordena persistência, sequência sob lock, inspeção de retomada, reconciliação de órfãos/ausentes e eviction física somente de artefatos regeneráveis/desprotegidos fora do projeto atual.
- Runtime Web passou a salvar PDF original + DocumentIR + checkpoint e tenta recuperar o projeto local mais recente com DocumentIR íntegro.
- Test tiers adicionados: `test:fast`, `test:standard`, `test:full`. FAST final passou 27/27 em 0,84 s; STANDARD final passou typecheck + 74/74 testes + build em 14,74 s.
- Nenhuma dependência mudou nesta fatia; audit completo não foi repetido localmente por política de risco. CI continua executando `npm audit --audit-level=high`.
- Browser smoke real: Chrome local importou a fixture PDF, persistiu PDF + DocumentIR, recarregou a página e exibiu “Seu último projeto foi recuperado neste dispositivo.” sem erros de página. O primeiro smoke revelou uma corrida de leitura com Web Locks sob React StrictMode; `inspectResume` foi tornado read-only sem lock exclusivo e o reload passou na repetição.
- Limites declarados: Edge/Firefox e matriz ampla, UI de seleção de múltiplos projetos, temporários por expiração e atomicidade cross-store sob queda de energia permanecem para hardening posterior.

## 2026-09-22 — M4.1 Narrative Quality determinístico
- Base confirmada: M3.2 foi fast-forward para `main` no commit `915ad6a`; o workflow `quality` em `main` concluiu Web e Rust com sucesso.
- Implementado `narrative_quality.ts` com normalização auditável, comparação heading↔corpo, detecção apenas para headings `announce`, reducer de memória narrativa compacta, detecção por frequência de aberturas formulaicas, validação de source refs e geração de QA determinístico.
- Política: overlap forte vira finding; overlap intermediário vira review; bordão repetido gera warning, não proibição automática; source ref ausente e heading anunciado duplicado impedem `pass`.
- Não foi implementada similaridade semântica por modelo nesta fatia; token overlap é sinal determinístico e casos incertos permanecem para review.
- Teste focado: 9/9 testes do novo módulo passaram; typecheck passou.
- STANDARD final: typecheck + 83/83 testes Web + build passaram em 16,94 s.
- Sem dependências novas e sem TTS/OCR/modelo externo.
- Próxima fatia M4: ContentModel/SemanticOutline + planner adapter estruturado e golden real quando o manual estiver disponível.

## 2026-09-22 — Correção de ownership Rust antes de ampliar M4
- Detectado desvio arquitetural: Rust continha principalmente DocumentIR v1/JobState, enquanto regras determinísticas de M4 estavam sendo implementadas em TypeScript.
- Criado ADR 0010 e regra persistente no AGENTS.md: domínio/invariantes canônicos em Rust; TypeScript para UI, browser APIs e adapters.
- Novos módulos Rust: `document_v2.rs`, `content.rs`, `narrative.rs`; novos testes de contrato em `crates/core/tests/domain_v2.rs`.
- DocumentIR v1→v2 foi retirado do schema TS e portado ao core Rust. Narrative Quality TS foi removido como implementação canônica.
- Fixtures `content_model_v1.json` e `semantic_outline_v1.json` são compartilhadas por Rust e schemas TS para reduzir drift de contrato.
- A fachada WASM agora expõe operações finas do core; wiring JS gerado ainda é etapa posterior.
- Web STANDARD passou: 74/74 testes, typecheck e build. Rust local não foi executado porque rustc/cargo não estão no PATH; CI é o gate real desta fatia.

## 2026-09-22 — M4 Rust ownership validado
- Branch `codex/m4-content-model` passou no GitHub Actions no commit `5807e79`: Rust format/test/clippy = success; Web audit/typecheck/test/build = success.
- O core Rust agora possui DocumentIR v2 e migração v1→v2, ContentModel, SemanticOutline, validação de NarrativePlan, memória/QA narrativos e source/provenance validation.
- Implementações canônicas equivalentes foram removidas do TypeScript; buscas por `migrateDocumentV1ToV2`, `buildNarrationQa`, `compareHeadingToBody` e `reduceNarrativeMemory` em `apps/web/src` retornaram vazio.
- TypeScript mantém schemas Zod de fronteira e adapters de browser; fixtures compartilhadas verificam compatibilidade estrutural.
- A fachada `audiobook-wasm` expõe funções finas do Rust, mas o bundle WASM ainda não está ligado ao runtime React; isso permanece próximo passo antes de ampliar planner/IA.

## 2026-09-22 — M4 integração Rust/WASM/Web
- Estado inicial: `codex/m4-content-model` limpa em `039b982`; handoff e ADR 0010 lidos antes das alterações. PRE-FLIGHT registrado no TASK_PACKET.
- Fachada Rust: exportadas migração v1→v2 e inspeção de unidades de fonte. O core continua responsável por migração, invariantes, ContentModel e SemanticOutline.
- Web: adapter TS fino carrega o módulo WASM real no Worker; protocolo valida os quatro contratos e identidade/hash na fronteira. PDF sem texto preserva DocumentIR v2, sem criar ContentModel/Outline fictícios.
- Persistência: checkpoint M4 referencia PDF, DocumentIR v1/v2 e, quando produzidos, ContentModel/Outline no OPFS. UI mantém a revisão do texto extraído. Nenhum planner, modelo ou TTS foi adicionado.
- Build: Rust 1.94.1 e `wasm-bindgen` 0.2.128 fixados; script regenera bindings Web versionados. CI recebeu gate de regeneração/paridade.
- Verificações locais: `npm run wasm:build` passou com toolchain GNU; `cargo fmt --all -- --check`, `cargo test --workspace --locked` (24 testes Rust) e `cargo clippy --workspace --all-targets -- -D warnings` passaram; `npm run test:standard` passou com 78/78 testes, typecheck e build; `npm audit --audit-level=high` encontrou 0 vulnerabilidades. O build incluiu asset WASM de aproximadamente 450 KB.
- Limite: teste visual não executado por orientação explícita. Browser integrado não acessou o servidor local durante tentativa anterior.
- Publicação: commit `ce48c3a` enviado para `origin/codex/m4-content-model`; `git ls-remote` confirmou o mesmo hash do HEAD local. CI remota ainda não verificada.
- CI dos commits `ce48c3a` e `d202bf8`: job Rust passou; job Web falhou na comparação byte a byte dos artefatos WASM regenerados em Linux com os versionados em Windows. O log público não expôs o arquivo divergente. Ajustado gate para comparar bindings JS/TypeScript, manter compilação e executar testes Web contra o WASM real gerado na CI; o binário permanece sem checagem de reprodutibilidade entre hosts.
- CI do commit `6b91326`: workflow `quality` run `35776236399` concluiu com sucesso após o ajuste. Todos os gates Rust/Web do workflow passaram.

## 2026-09-22 — checkpoint de retomada após revisão do estado remoto
- Fonte de verdade revisada pelo GitHub porque o Remote Desktop Commander estava offline nesta sessão.
- Branch `codex/m4-content-model` estava em `4fbb971`, com workflow `quality` verde; M4 Rust/WASM/Web já estava mais avançado do que o checkpoint local anterior.
- Confirmado: Worker usa o WASM real para migrar DocumentIR v1→v2 e produzir ContentModel/SemanticOutline; CI cobre Rust/Web e integração do bundle.
- Nenhum código de domínio foi alterado nesta sessão. Foi atualizado o handoff, o task packet seguinte e a gap analysis para impedir retrabalho/reexecução de M3/M4 runtime já concluídos.
- Próximo batch autorizado: M4.3 NarrativePlan/NarrationQA via Rust/WASM, sem LLM/TTS. Regeneração do WASM e todos os gates são obrigatórios antes de avançar.

## 2026-09-22 — M4.3A retomado e validado localmente
- Estado inicial confirmado: checkout local limpo em `codex/m4-content-model`, HEAD `c671945b303036314221c6ebb6eefffa2f822a7e`; GitHub Actions `quality` run `35778466312` concluído com `success` para esse commit.
- PRE-FLIGHT M4.3A registrado antes do código. O core ganhou uma entrada de QA que valida plano contra ContentModel/Outline, exige fala não vazia para cada seção e deriva source refs do ContentModel. A fachada WASM recebeu exportação JSON correspondente; um teste Rust cobre plano válido, fala incompleta e provenance inválida.
- Gate tentado: `cargo fmt --all && cargo fmt --all -- --check && cargo test --workspace --locked && cargo clippy --workspace --all-targets -- -D warnings`. Falhou imediatamente: `zsh: command not found: cargo` (exit 127). Busca nos locais de toolchain conhecidos deste ambiente não encontrou executáveis. Nenhum teste Rust executou.
- A toolchain Rust 1.94.1, target `wasm32-unknown-unknown`, `wasm-bindgen-cli` 0.2.128, Node 24.21.0 e dependências Web foram instaladas neste ambiente. As skills `context-mode`, `caveman` e `humanizer` foram instaladas; o MCP context-mode não aparece nesta sessão, mas seu CLI está disponível.
- Primeiro compile Rust detectou `serde_json` ausente nas dependências diretas da fachada WASM; corrigido `crates/wasm/Cargo.toml` e lockfile. `cargo fmt --all -- --check`, `cargo test --workspace --locked` (25 testes) e clippy com `-D warnings` passaram após a correção.
- A entrada QA contextual agora força `REVIEW` com `CLAIM_GROUNDING_NOT_EVALUATED` quando não há falha determinística, evitando sinalizar como aprovado um claim não analisado. Teste Rust cobre esse caso.
- `npm run wasm:build` regenerou bindings e binário. Primeiro STANDARD Web falhou em teste preexistente de Web Locks porque Node 24 disponibiliza `navigator.locks`; o teste agora remove essa API explicitamente. STANDARD repetido passou: typecheck, 78/78 testes e build.
- `git diff --check` passou. CI da publicação M4.3A ainda pendente; M4.3B, planner/modelo e TTS não iniciados.
- QA independente revisou o diff M4.3A sem achados P0/P1. Casos adicionais de `plan_id` vazio, fala em branco e seção extra foram incorporados; Rust fmt/test/clippy foram repetidos e passaram. Teste do export com WASM real está alocado no M4.3C.
- Publicação M4.3A: commit remoto `9f7aca594121b0488407c41f2b3c376086012c3b` na branch `codex/m4-content-model`; árvore idêntica ao commit local validado. O workflow `quality` run `35802591562` concluiu com `success` nos jobs Rust e Web. O checkout local foi alinhado ao commit remoto e ficou limpo.

## 2026-09-22 — M4.3B adapter narrativo Web
- Base: M4.3A no commit `9f7aca5`, CI Rust/Web verde. PRE-FLIGHT registrado no TASK_PACKET antes do código.
- `rust_wasm_runtime.ts` compartilha inicialização WASM entre os adapters de conteúdo e narrativa, com retry após falha. `rust_narrative_pipeline.ts` valida shape na fronteira, encaminha plano e falas ao core e valida o JSON de QA devolvido; não implementa QA ou deduplicação em TypeScript.
- Testes com port injetado cobrem encaminhamento, entrada inválida, rejeição do core, falha de inicialização e saída inválida. QA independente encontrou P1: serialização de fala circular/tipo inválido escapava como erro JS bruto. Corrigido com schema de registro de strings e erro tipado `INVALID_INPUT`; testes de regressão adicionados.
- STANDARD Web final passou: typecheck, 80/80 testes e build. `git diff --check` passou. Integração com bundle WASM real e fixture narrativa está reservada para M4.3C. CI do M4.3B ainda pendente; planner/modelo/TTS não iniciados.
- Publicação M4.3B: commit remoto `b03bd286aaaa373dcb4ed3e02c0e47bdae4f84df` na branch; checkout local alinhado e limpo. Workflow `quality` run `35803065588` concluiu com `success` para Rust e Web.

## 2026-09-22 — M4.3C fixture e integração WASM real
- Base: M4.3B publicado em `b03bd28`, CI Rust/Web verde. PRE-FLIGHT M4.3C registrado antes do código.
- Criada `narrative_plan_content_v1.json` compatível com o ContentModel/Outline compartilhados; contém source ref `r_1_1`, sem conceitos ou relações inventados. A fixture histórica `narrative_plan_v1.json` foi preservada.
- Teste Rust valida a fixture e executa QA contextual. Teste Vitest carrega `audiobook_wasm_bg.wasm` real, chama o adapter de plano/QA e confirma `REVIEW` por claim grounding não avaliado. Source ref fabricada atravessa schema TS e é rejeitada pelo core; o teste verifica a causa com o ref.
- Primeiro STANDARD falhou porque a nova fixture havia substituído a histórica usada por outro teste. Restaurada a original, criado arquivo distinto e repetidos os gates: Rust fmt/test (26 testes)/clippy, `npm run wasm:build`, Web STANDARD (82/82 testes, typecheck, build) e diff check passaram.
- QA independente não encontrou bloqueio; sugeriu assert da causa Rust, incorporado e verificado. CI do M4.3C ainda pendente. Planner/modelo/TTS não iniciados.
- Publicação M4.3C: commit remoto `5b97d1fbcfd27df4a522907679afea9c52eabf18` na branch; checkout local alinhado e limpo. Workflow `quality` run `35803514527` concluiu com `success` para Rust e Web. A fronteira NarrativePlan/QA pelo WASM real está TESTED nesse escopo.

## 2026-09-22 — M4.4A Planner Port com fake estruturado
- Base: M4.3C publicado em `5b97d1f`, workflow `quality` verde. PRE-FLIGHT registrado no TASK_PACKET antes do código.
- Criado `NarrativePlannerPort` Web com saída `unknown` estruturada. O adapter valida ContentModel/Outline e NarrativePlan na fronteira, chama o Rust/WASM real para provenance e devolve apenas `{kind: "candidate", qa: "pending", plan}`. Não existe caminho de TTS a partir desse retorno.
- `FixtureNarrativePlanner` em suporte de testes devolve a mesma fixture por chamada, sem implementar planejamento. Testes cobrem sucesso, contexto inválido, falha de port, shape inválido, source ref fabricada e documentos divergentes.
- QA independente encontrou P1: plano retornado diretamente poderia parecer aprovado antes do QA. Corrigido com wrapper de candidato/QA pendente. Sugestões P2 de fake reutilizável e teste cross-document também incorporadas.
- Gates locais finais: Rust fmt/test (26 testes), Web STANDARD (84/84 testes, typecheck, build) e `git diff --check` passaram. CI do M4.4A pendente; nenhum modelo real, prompt, persistência do plano ou TTS foi iniciado.
- Publicação M4.4A: commit remoto `f74229f42b54f32c4b0e471f66d0ca3e4c847208` na branch; checkout local alinhado e limpo. Workflow `quality` run `35804071973` concluiu com `success` para Rust e Web. O port/fake estruturado está TESTED nesse escopo, sem modelo real.

## 2026-09-22 — M4.4B contrato de roteiro e source mapping
- Base confirmada antes de editar: `codex/m4-content-model` limpa em `122e9b2`; GitHub Actions `quality` run `35804316448` concluído com `success` nesse HEAD. PRE-FLIGHT registrado no TASK_PACKET.
- Core Rust recebeu `NarrativeScript`, com seções e trechos ordenados, `displayText`, `speechText` e source refs por trecho. `from_json` valida estrutura; validação contextual exige o `planId` esperado, cobertura/ordem de seções e refs pertencentes à seção ou transição do plano, após validar plano e ContentModel/Outline.
- QA de roteiro agrega fala por seção e usa o QA determinístico existente. Heading anunciado duplicado resulta em `fail`; source mapping inválido é rejeitado. Claim grounding não foi avaliado e mantém `review` com aviso explícito. Referência estrutural não prova fidelidade semântica.
- WASM expõe `build_script_qa_json`; adapter TS espelha schema e classifica erros de entrada, inicialização, rejeição do core e saída inválida. Fixture e testes exercitam binário WASM real, incluindo ref de transição, ref fabricada e ID de plano divergente.
- Primeira revisão QA independente encontrou P1 na rejeição de refs de transição e no `planId` sem vínculo ao ID esperado. Ambos corrigidos. Segunda revisão não encontrou P0/P1; P2 futuro: vincular ID do plano persistido a conteúdo/provenance imutáveis.
- Gates locais finais: `cargo fmt --all -- --check`, `cargo test --workspace --locked` (28 testes), clippy com `-D warnings`, `npm run wasm:build`, `npm run test:standard` (88 testes, typecheck, build) e `git diff --check` passaram. CI após publicação ainda pendente neste registro.
- Sem modelo real, verificador semântico, golden mainframe real, geração de roteiro ou TTS. Próximo batch só após CI verde.
- Publicação: commit local `19d7693` criado; `git push` falhou por falta de autenticação HTTPS (`could not read Username for 'https://github.com'`). Não há `gh`, credential helper, token de ambiente ou sessão de navegador disponível. CI deste commit não executou. Stop condition aplicada; próximo batch não iniciado.

## 2026-09-23 — M4.4B publicado e CI verde
- Após configuração SSH pelo usuário, branch `codex/m4-content-model` e `origin/codex/m4-content-model` ficaram alinhados em `2aaa73124d52f6fda6e388a495529525e661cfe1`. GitHub Actions `quality` run `35806473115` concluiu com `success` nesse HEAD. O bloqueio de publicação anterior foi resolvido; M4.4C liberado.

## 2026-09-23 — M4.4C pacote de revisão por trecho
- PRE-FLIGHT registrado antes do código. `audiobook-core` constrói `ScriptReviewPacket` após validação de roteiro/plano/conteúdo: cada trecho recebe todas as unidades que correspondem às suas refs, preservando texto de análise opcional, incerteza, qualidade, elegibilidade e flags. Estado de cada trecho é `pending`; não há decisão automática.
- Pacote inclui `sourceHash` do documento e hashes SHA-256 de ContentModel, plano e roteiro serializados para detectar revisão desatualizada. Indexação por ref preserva ordem das unidades de fonte e evita varredura completa por trecho.
- WASM recebeu `build_script_review_packet_json`. Schema/adapter TS validam apenas a fronteira; testes Vitest usam WASM real e verificam texto, qualidade, hashes, alteração de roteiro e rejeição de ID de plano/fonte forjados. Texto importado não entra em logs.
- Primeira revisão independente encontrou P1: `ContentModel` aceitava `documentId` e `sourceHash` sem vínculo. Core agora exige `documentId == doc_<digest>`; regressões Rust/WASM cobrem hash divergente. Texto de análise vazio é rejeitado pelo Rust, e refs repetidas no mesmo segmento também. Segunda revisão não encontrou P0/P1.
- Gates locais finais: Rust fmt, `cargo test --workspace --locked` (30 testes), clippy `-D warnings`, regeneração WASM, Web STANDARD (90 testes/typecheck/build), `git diff --check`. Publicação/CI do M4.4C ainda pendentes neste registro. TTS continua bloqueado.
- Publicação M4.4C: commit `1c5394d1d5e783872502598955c5eef0d40dca36` enviado para `origin/codex/m4-content-model`. GitHub Actions `quality` run `35834617808` concluiu com `success`; jobs Rust e Web passaram. Branch local e remoto ficaram alinhados.
- Operação Git: `ssh-agent.socket` do usuário foi ativado e habilitado; `~/.ssh/config` aponta `IdentityAgent` ao socket. A chave foi desbloqueada pelo diálogo local e o push passou. A senha da chave não foi recebida pelo agente Codex nem registrada no repositório.

## 2026-09-23 — retomada remota e M4.4D local
- `git fetch` encontrou 13 commits novos em `origin/codex/m4-content-model` desde `4fbb971`; checkout limpo avançou por fast-forward até `88af119`. Página pública do GitHub Actions mostrou workflow `quality` run `35834973158` concluído com sucesso para esse HEAD. Handoff, task packet, worklog, ADR 0010 e contexto narrativo lidos antes do código; PRE-FLIGHT registrado.
- Core Rust recebeu submissão de decisão por trecho, validada contra pacote recalculado. IDs e hashes de fonte, conteúdo, plano e roteiro devem coincidir; todos os trechos exigem decisão única. `supported` exige evidência textual não bloqueada para cada source ref. Recibo inclui hash da submissão e `attestationStatus: unverified`; QA existente continua em `review`.
- WASM expõe `validate_script_review_submission_json`; adapter TS valida somente a fronteira e confere identidade dos hashes na resposta. Testes Rust e Vitest com WASM real cobrem submissão válida, stale, evidência fabricada, fonte sem texto e referência parcialmente coberta. Nenhum modelo, UI, persistência ou TTS foi conectado.
- Revisão independente encontrou P2 de cobertura parcial das referências. Corrigido no Rust com teste de evidência mista e no WASM real. Segunda revisão confirmou correção e não encontrou P0/P1; reviewer não executou Rust por ausência de Cargo em seu ambiente, mas o Lead executou Rust fmt/test/clippy localmente.
- Gates após a correção: `cargo fmt --all -- --check`, `cargo test --workspace --locked` (33 testes), clippy com `-D warnings`, `npm run wasm:build`, `npm run test:standard` (93 testes, typecheck, build) passaram. `npm audit --audit-level=high` encontrou 0 vulnerabilidades. Aviso PDF.js sobre `standardFontDataUrl` apareceu nos testes sem falha.
- `git diff --check` passou após a revisão. Publicação e CI M4.4D ainda pendentes neste registro. TTS bloqueado: não existe atestação confiável nem verificação semântica de claims; corpus/golden mainframe real indisponível.
- Publicação M4.4D: commit `28658f67c945ef7b9b450160e04beebd433b5e9f` enviado para `origin/codex/m4-content-model`; `git ls-remote` confirmou o hash. Workflow `quality` run `35856262003` concluiu com sucesso. A nota de pendência acima descreve o checkpoint local anterior.

## 2026-09-23 — M4.4E persistência local de revisão (checkpoint local)
- PRE-FLIGHT registrado antes do código, base limpa `47fbcda6` em `codex/m4-content-model`. ADR 0011 delimita persistência e atestação.
- Adapter Web salva submissão e recibo Rust/WASM em artefato OPFS `review_submission` fixado e não regenerável; manifest e checkpoint são publicados pelo fluxo local existente. Chave deriva do `submissionHash`. Checksum do checkpoint anterior evita gravação sobre mudança concorrente.
- Leitura confere manifest/checkpoint, integridade OPFS e revalida submissão no Rust/WASM contra dados atuais; recibo recalculado deve coincidir. `attestationStatus` continua `unverified`. Sem UI, QA `pass` ou TTS.
- Testes direcionados: 9/9 passaram; gate rápido atualizado: 30/30; Web STANDARD: 96/96, typecheck e build passaram. Rust: 33 testes passaram via toolchain GNU, fmt check e clippy `-D warnings` passaram. `npm audit --audit-level=high`: 0 vulnerabilidades. `git diff --check`: passou. Tentativa inicial Rust pelo PATH falhou por ausência de `cargo`; MSVC não tinha linker; reexecução com toolchain GNU funcionou. Teste inicialmente usou fixture com hash de fonte igual e depois um manifest inválido; corrigidos e reexecutados.
- Revisão independente e publicação/CI ainda pendentes neste checkpoint. Corpus mainframe real e método de atestação confiável seguem indisponíveis.
- Revisão independente apontou P1: contexto antigo poderia coincidir com a fonte sem o checkpoint identificar plano/roteiro ativos; P2: leitura poderia cruzar mudança concorrente de checkpoint. API de leitura passou a ser explicitamente histórica, retorna `currentness: not_established`, e reconsulta checksum antes do retorno. ADR 0011 explicita que aprovação exige persistir identidade ativa de plano/roteiro em etapa futura. Regressão de corrida e de contexto histórico adicionada.
- Após correções: Web STANDARD 97/97, typecheck e build passaram. Segunda revisão independente em andamento neste checkpoint.
- Segunda revisão confirmou a correção de contexto/race e apontou P1: leitura histórica ficava inacessível após troca da fonte ativa. Removida a exigência de presença no checkpoint atual; manifest fixado, integridade OPFS e revalidação contra contexto fornecido continuam obrigatórios. Teste com fonte ativa alterada e chave retirada do checkpoint passou. Gate rápido final: 31/31.
- Gate Web completo final após último ajuste: 97/97 testes, typecheck e build passaram. Rust não mudou neste batch; 33 testes, fmt e clippy já tinham passado. Publicação e CI permanecem para o passo seguinte.
- Commit M4.4E `c513744` publicado em `origin/codex/m4-content-model`; página pública de Actions confirmou `quality` run `35860380680` como `completed successfully`. Limites de atestação permanecem conforme ADR 0011.

## 2026-09-23 — M4.4F identidade narrativa ativa e corpus COBOL (validação local)
- Base limpa `cf4d66e9`, branch `codex/m4-content-model`; PRE-FLIGHT registrado antes de alterar código. Rust calcula `ActiveNarrativeIdentity` após validar contexto narrativo; inclui hashes de fonte, conteúdo, outline, plano e roteiro. WASM exporta contrato e validação de estado; TS espelha schema e opera IndexedDB/OPFS.
- Adapter Web publica uma identidade ativa por checkpoint sob checksum condicional, preserva manifests históricos e falha para identidade antiga, bytes corrompidos, múltiplos ativos e alteração concorrente. QA independente encontrou P2: troca podia conservar `READY_FOR_AUDIO` e áudio anterior. Correção: Rust exige `VERIFYING`; adapter rejeita referências a áudio ou manifest ausente antes de publicar; regressões Rust/Web e WASM real.
- Apostila COBOL do usuário: leitura local, 75 páginas A4, 599.696 bytes, texto extraível nas 75 páginas; SHA-256 e limites em `docs/INGESTION_TEST_STRATEGY.md`. Acentos estavam corretos em Unicode; exibição do terminal causou aparência de corrupção. PDF não foi copiado para o repositório. Não há golden narrativo nem avaliação end-to-end desse documento.
- Gates locais finais: `cargo test --workspace --locked` (35 testes), `cargo fmt --all -- --check`, clippy `-D warnings`, `npm run wasm:build`, `npm run test:standard` (103 testes, typecheck e build), `npm audit --audit-level=high` (0 vulnerabilidades) e `git diff --check` passaram. Primeira tentativa de Vitest no sandbox falhou com `spawn EPERM`; repetição autorizada para subprocessos passou. CI remoto não confirmado neste registro.
- Limites: nenhum vínculo de revisão ao ponteiro ativo, nenhuma atestação confiável, nenhuma avaliação semântica com goldens, nenhum TTS ou UI. Próximo batch após publicação/CI: vincular revisão histórica à identidade ativa com invalidação explícita, sem atribuir `verified` automaticamente; definir política de atestação e casos esperados do corpus antes de TTS.
- Segunda revisão independente read-only confirmou a correção da retenção de estado/áudio, sem novo P0/P1/P2; não executou os gates. O Lead executou e conferiu os resultados acima.

## 2026-09-23 — M4.4G vínculo versionado de revisão ativa (validação local)
- Base limpa `a868dc36`, branch `codex/m4-content-model`, remoto alinhado; workflow `quality` run `35864829680` do M4.4F verde. PRE-FLIGHT registrado antes do código. Rust passou a calcular `bindingHash` de identidade ativa completa e `submissionHash`, revalidando a submissão no mesmo contexto. Export WASM usa entrada JSON tipada; schemas e adapters TS permanecem na fronteira.
- `saveForActive` grava envelope de revisão v2 fixado no OPFS, com chave derivada do vínculo. Leitura histórica v1 permanece `not_established`; v2 reconfere vínculo, recibo e integridade. Avaliador separado retorna `bound_unverified` somente quando o vínculo persistido corresponde à narrativa ativa, com segunda checagem do checksum após ler ambos os artefatos. Não há atestação humana, QA `pass`, UI ou TTS.
- Revisão QA independente inicial encontrou falta de vínculo com outline, janela de corrida e colisão de chave para submissão idêntica em outlines diferentes. Corrigidos no contrato v2 e com regressões Rust/WASM/Web. Revisão read-only posterior não encontrou novo P0/P1/P2. O revisor não executou testes.
- Segundo manual COBOL/CICS do usuário: SHA-256 `58b839407977f054bcc36c6ea42d4f423eb73b40c6937c83655420bf654926c8`; 105 páginas, 1.066.609 bytes. PyMuPDF extraiu 488.556 caracteres, incluindo 36.111 na área privada Unicode em todas as páginas. Página 27 renderizada tinha prosa e código legíveis, com sobreposição visual em parte da lista/rodapé. Arquivo mantido fora do repositório; nenhum OCR ou golden semântico foi executado. Registrado como corpus local de texto suspeito.
- Gates finais locais: `cargo fmt --all -- --check`, `cargo test --workspace --locked` (36 testes), clippy `-D warnings`, `npm run wasm:build`, `npm run test:standard` (107 testes, typecheck, build), `npm audit --audit-level=high` (0 vulnerabilidades) e `git diff --check` passaram. Clippy inicialmente rejeitou APIs com oito parâmetros; agrupamentos `ReviewBindingReference` e JSON de fronteira corrigiram o aviso. Publicação e CI ainda não confirmados neste registro.
- Próximo passo após CI verde: definir atestação confiável vinculada ao `bindingHash` e `submissionHash`, sem confundir autenticação com revisão semântica; selecionar páginas/expectativas dos dois PDFs para avaliação de fidelidade e tratar camada de texto suspeita antes de narração. TTS permanece fechado.

## 2026-09-23 — M4.5A proteção de camada de texto suspeita
- Base `2143378`, branch `codex/m4-content-model` limpa no início. PRE-FLIGHT registrado antes do código. Rust detecta qualquer glifo Unicode de área privada na migração v1→v2, classifica a página como `corrupted` e regiões afetadas como `unsupported/unusable`, com flag estável. Texto bruto é preservado. ContentModel já mapeia `unusable` para `blocked`; regiões não afetadas seguem `review_required`.
- Teste sintético Rust passou; teste Web com WASM real comprovou o mesmo contrato. PDF.js local confirmou PUA nas páginas 1/27/105 do manual COBOL/CICS e ausência nas páginas 1/25/75 da apostila de controle. PDFs não foram copiados. Não houve OCR nem golden semântico.
- Gates locais: `cargo test --workspace --locked` 37 testes, `cargo fmt --all -- --check`, clippy `-D warnings`, `npm run wasm:build`, Web STANDARD 108 testes/typecheck/build, `npm audit --audit-level=high` 0 vulnerabilidades, `git diff --check`. Primeira execução Vitest teve `spawn EPERM` no sandbox; repetição com subprocessos permitidos passou.
- Revisão independente solicitada, mas subagente retornou erro de limite de uso sem inspecionar o diff. Lead revisou diff manualmente; nenhum novo problema identificado. Atestação confiável, OCR/reconciliação, goldens semânticos, UI e TTS continuam pendentes. Publicação/CI ainda não confirmados neste registro.

## 2026-09-23 — M4.5B medição PDF.js integral do corpus local
- Base limpa `6f1870f` em `codex/m4-content-model`; PRE-FLIGHT registrado antes da medição. M4.5A foi publicado e o workflow `quality` run `35872207447` concluiu com sucesso. Nenhum PDF foi copiado ou alterado.
- `pdfjs-dist` do projeto extraiu todas as 75 páginas da apostila COBOL: 108.550 caracteres, 14.899 itens, 0 páginas vazias, 0 PUA. No manual COBOL/CICS: 105 páginas, 443.782 caracteres, 61.360 itens, 0 páginas vazias, 36.774 PUA em todas as páginas. Hashes dos arquivos conferiram com o registro prévio. Páginas 1, 27, 70 e 105 do manual foram escolhidas como candidatas para goldens, não aprovadas como goldens.
- PDF.js em Node emitiu avisos `standardFontDataUrl`; nenhuma página falhou. A contagem não mede o `DocumentIR` final nem fidelidade visual. A diferença ante PyMuPDF foi explicitada na estratégia de testes. Não foi feito OCR, correção automática, nem transcrição de referência.
- Gates: Rust fmt e 37 testes passaram; Web typecheck, 108 testes e build passaram. Primeira execução Web no sandbox teve `spawn EPERM`; repetição com subprocessos permitidos passou. `git diff --check` passou e o diff foi revisado antes do commit. Mudança só em documentação/governança; ADR não mudou.

## 2026-09-23 — M4.5C integração com PDFs reais e referência local
- Base limpa `8b40de2` em `codex/m4-content-model`; PRE-FLIGHT registrado antes da alteração. M4.5B foi publicado; workflow `quality` run `35873228079` concluiu com sucesso.
- Páginas 1 e 27 do manual COBOL/CICS foram renderizadas localmente e inspecionadas. Página 27 contém código CICS legível e linhas sobrepostas no rodapé. Referência curta de tokens visuais ficou em `work/goldens/cobol-cics-v1.local.json` (ignorado pelo Git), ainda `candidate_not_approved`. Busca exata PDF.js encontrou os tokens de capa; na página 27 não encontrou `HANDLE AID`/`END-EXEC` como substrings exatas. Ausência não prova perda: espaços e PUA podem interferir.
- Teste opt-in em `apps/web/src/adapters/local_corpus.test.ts` usa variáveis de ambiente, hashes e pipeline real PDF.js→Rust/WASM. Primeira tentativa falhou por URL WASM de browser inválida no Node do Vitest; corrigida pela inicialização `initSync` usada na suíte existente. Execução seguinte passou 2/2: manual 105 páginas `corrupted`, fonte PUA bloqueada; apostila 75 páginas `good`, sem flag PUA. Nenhum texto foi incluído no teste/CI.
- Gates finais: teste opt-in local 2/2; Rust fmt/test (37)/clippy `-D warnings`; Web STANDARD 108 testes, 2 casos opt-in ignorados sem corpus, typecheck/build; `npm audit --audit-level=high` 0 vulnerabilidades; `git diff --check` passou. `git check-ignore` confirmou a referência local fora do Git. Diff revisado pelo Lead; não houve revisão independente nesta etapa. OCR, reconciliação, transcrição completa, Worker de browser, revisão semântica e TTS continuam pendentes. Publicação/CI ainda pendentes neste checkpoint.
- Publicação: commit `2978278` no remoto; GitHub Actions `quality` run `35874469086` concluiu com sucesso. Não houve novo teste visual do frontend, conforme orientação do usuário.

## 2026-09-23 — M4.5D contrato de candidato OCR (validação local)
- Base limpa `e185a2f` em `codex/m4-content-model`. PRE-FLIGHT antes do código. Core Rust passou a validar candidato OCR para região existente, vinculando documento/fonte, página, região e hash da camada nativa; imagem renderizada e engine são declaradas, não atestadas. Recibo versionado contém hashes e contagens PUA, sempre `pending`; DocumentIR/ContentModel não são alterados.
- WASM exporta a operação Rust; schema e adapter TS validam somente fronteira. O texto OCR mantém whitespace exato, inclusive em código. Regressões Rust cobrem identidade, stale, hash de imagem, texto vazio, idempotência e PUA; Vitest usa WASM real. ADR 0014 registra limites e ausência de engine/persistência/reconciliação.
- Revisão independente inicial encontrou dois P2: adapter não conferia engine/texto do recibo; hash Rust não cobria contagens/status. Corrigidos com comparação do SHA-256 do texto no Web e inclusão de todos esses campos no hash canônico; teste Rust confere a identidade completa. Segunda revisão read-only confirmou ambos resolvidos e nenhum novo P0/P1/P2. Gates repetidos após correção: Rust fmt/test (38)/clippy `-D warnings`, build WASM, Web STANDARD 110 testes/typecheck/build (2 opt-in ignorados); audit anterior 0 vulnerabilidades. `git diff --check` passou. Sem OCR real, QA pass ou TTS; publicação/CI pendentes neste checkpoint.
- Publicação: commit `eefd9a7` no remoto; GitHub Actions `quality` run `35877078233` concluiu com sucesso. A árvore versionada não inclui PDFs nem goldens locais.
## 2026-09-23 — recuperação defensiva de WAV literal
- Base `0186071`, branch `codex/m4-content-model` limpa no início. PRE-FLIGHT no task packet.
- Hipótese de seleção de WAV antigo refutada por teste: resalvar mantém somente uma chave de áudio no checkpoint e a leitura retorna o novo Blob. A regressão ficou coberta.
- Metadata JSON inválida agora retorna ausência de áudio recuperável, sem derrubar a leitura do projeto; teste cobre o caso. Não houve alteração de domínio Rust, UI ou síntese.
- Gates: Web STANDARD 119 testes passaram, 2 opt-in ignorados, typecheck e build passaram; Rust fmt, 43 testes e clippy passaram. Build Web manteve avisos existentes sobre `crypto`/`path` externalizados pelo Piper. Playback/download externo e CI deste commit não foram validados nesta sessão.
## 2026-09-23 — biblioteca local de gravações WAV literais
- Base `2a136ec`, branch `codex/m4-content-model` limpa no início. PRE-FLIGHT em `.ai/TASK_PACKET.md`. Rust segue dono da sessão canônica; TS apenas consulta manifests, Web APIs e UI.
- Catálogo consulta manifests históricos, lê metadata até 16 KiB, confere documento/fonte e reconstrói sessão via Rust/WASM. Só abre o WAV completo por ação explícita. Metadata inválida ou áudio ausente não impede listar outras gravações. A UI permite abrir e baixar WAV anterior, com guarda contra troca de PDF durante leitura assíncrona.
- Smoke opt-in com `playwright-core@1.63.0`: gera dois WAVs reais com Piper, recarrega, abre o mais antigo, observa `audio.play()` e avanço do tempo, baixa o arquivo e compara SHA-256 do download com o Blob reproduzido. Chrome headless passou (3,18 s; 140.332 B), Edge headless passou (3,07 s; 135.212 B). Esses valores variam por síntese. Não houve inspeção visual nem escuta humana.
- Gates finais: Web 119 testes passaram, 2 opt-in ignorados, typecheck/build; Rust fmt, 43 testes workspace e clippy `-D warnings`; npm audit 0 vulnerabilidades. Vite ainda avisa que `fs`, `crypto` e `path` do Piper são externalizados para browser; fluxo real funcionou em Chrome/Edge.
- Revisão independente solicitada, mas `spawn_agent` falhou com `agent thread limit reached`. Lead revisou diff e testes. Nenhuma exclusão automática: checkpoints históricos ainda podem referenciar WAVs antigos. Política de limpeza/compaction e escuta humana continuam pendentes. Publicação/CI do commit desta entrega ainda pendentes neste registro.

## 2026-09-23 — retenção explícita e limpeza recuperável de WAV literal
- Base `eae4ee5` limpa em `codex/m4-content-model`; PRE-FLIGHT registrado antes da implementação. Nenhum PDF do usuário ou dado persistido real foi apagado pelos testes.
- IndexedDB v3 adiciona fila de exclusão. Compactação sob Web Lock valida todo o histórico (limite 1.000), o checkpoint atual e um fallback íntegro da mesma fonte; remove referências e manifests numa transação, registra intenção durável e só então remove os dois arquivos OPFS. Falha física deixa retry idempotente na próxima abertura. UI exige confirmação da perda irreversível da gravação e dos checkpoints relacionados.
- Regressões cobrem migração v2 com dados preexistentes, histórico corrompido, ausência/corrupção de fallback, fonte distinta, corrida, rollback por falha de fila e retry após falha OPFS. Revisão independente inicial apontou teste de migração insuficiente; corrigido. Segundo retorno do subagente não ficou disponível após retomada da sessão; Lead revisou o diff e executou gates finais.
- Gates finais: Rust fmt, 43 testes e clippy `-D warnings`; Web 127 testes, 2 opt-in ignorados, typecheck/build; audit 0 vulnerabilidades; smoke Chrome headless passou com confirmação cancelada e aceita, reload e conferência de IndexedDB/OPFS. Edge não foi executado nesta repetição (script detectou apenas Chrome). `git diff --check` passou. Build preserva avisos existentes de `fs`/`crypto`/`path` do Piper; sem inspeção visual ou escuta humana.
- Limites: política deliberadamente recusa exclusão sem fallback ou com histórico inválido; não faz GC de outros artefatos órfãos. Publicação e CI ainda serão confirmados após o commit.

## 2026-09-23 — M4.5I comparação OCR canônica
- PRE-FLIGHT em `.ai/TASK_PACKET.md`. O core Rust agora emite relatório determinístico de diferenças de tokens ASCII entre texto nativo e candidato OCR, vinculado ao recibo e sempre `review_required`; não altera fonte, QA ou elegibilidade. WASM e adapter Web expõem o contrato. ADR 0021 registra limites e a insuficiência da comparação lexical para aprovar fidelidade.
- A revisão independente encontrou limite ausente para documento agregado, contagem inicialmente apresentada como completa, wire cap estreito para JSON com controles e exceção não tipada de digest. Corrigidos com limite canônico streaming de 32 MB, `differingTokenLowerBound`/`truncated`, wire cap de 8 MB e erro tipado. Nova revisão pediu reduzir o cap intermediário de 40 MB; reduzido para 8 MB.
- Regressões Rust cobrem ambiguidade `0`/`O`, documento grande fora da região, texto nativo >1 MB, 4.096 tokens únicos, token >128 e saída limitada a 256. Teste Web com WASM real cobre candidato de 1 MB com caracteres de controle. Chromium repetiu OCR, histórico e comparação: 7/8 tokens de código preservados, falta `SAMPLE01`, 0 requisições externas. Sem goldens privados revisados.
- Gates após o ajuste final: Rust fmt, 44 testes e Clippy passaram; WASM build, typecheck, 140 testes Web e build passaram. Smoke Chromium repetido com o WASM final; `git diff --check` passou. Revisão independente final aprovou sem achados P0–P2.
- Publicação: commits `d4ed6ac`, `a13b337`, `73dcd33` e `c23a194` enviados via HTTPS para `codex/m4-content-model`; workflow `quality` do HEAD iniciou como run `35946577513`. SSH não tinha identidade carregada; HTTPS conseguiu autenticar. Resultado final do CI será confirmado no novo HEAD documental.

## 2026-09-23 — captura limitada de região PDF para OCR
- Base `4b25d5e` limpa em `codex/m4-content-model`; PRE-FLIGHT em `.ai/TASK_PACKET.md`. Captura recebe PDF original e DocumentIR v2, compara hash SHA-256 da fonte, valida região/bbox e gera PNG limitado com hash e metadata de vínculo. Não há engine OCR, persistência de candidato, reconciliação, promoção de texto ou novo TTS.
- Primeiro gate completo revelou falha de teste Node por configuração global do PDF.js worker; restrita ao navegador. Revisão independente encontrou três riscos: prazo parcial, trabalho de página além do canvas e smoke sem prova espacial. Corrigidos com prazo da operação completa, limite próprio de PDF 8 MB, `maxImageSize` 4 milhões de pixels, comparação pixel a pixel com renderização da página inteira e teste de cancelamento durante PNG. Segunda revisão read-only não apontou P0–P2 restantes. Prazo é best-effort se trabalho síncrono bloquear event loop; rotação real ainda não foi testada.
- Gates após correção: Rust fmt, 43 testes e clippy `-D warnings`; Web 129 testes, 2 opt-in ignorados, typecheck/build e audit 0 vulnerabilidades. Chrome headless com fixture pública passou: crop 241×32, PNG 4.701 B, 1.438 pixels escuros, igualdade pixel a pixel, fonte divergente rejeitada e cancelamento durante codificação. Sem inspeção visual nem PDF privado copiado. Vite ainda exibe avisos existentes do Piper (`path`, `crypto`, `fs`). Commit/push/CI pendentes neste registro.
## 2026-09-24 — M4.5N medição OCR em PDF público
- Usuário escolheu avaliação pública como próxima frente. Baixado para `work/public-eval/` o PDF público de Ron Norman sobre integração GnuCOBOL/C, 313.579 bytes, 29 páginas, SHA-256 `97a8bb7e95ad0538aaced88aba469fae3ba02d8045831538333a57711164ee69`. Fonte e licença ficam no site público; o PDF não foi versionado. Páginas 2 e 4 renderizadas e conferidas visualmente.
- Script opt-in com hash fixo usa PDF.js em Chromium e Tesseract português local. Página 2: 4/4 frases/tokens de prosa presentes. Página 4: 6/7 alvos de código presentes; `STOP RUN RETURNING 0.` visual virou `STOP RUN RETURNING O.` no OCR. Zero requisições externas observadas. Saída detalhada local em `work/public-eval/measurement.json`, fora do Git.
- Medição explora só alvos selecionados de manual inglês com modelo OCR português. Não é CER/WER, golden do usuário, aprovação de texto, QA `pass` ou autorização de TTS. Contrato de revisão continua `unverified`.
- Gates: script Chromium passou após correção do PDF.js worker; Rust fmt e 46 testes workspace passaram com toolchain GNU instalada; Web typecheck e build passaram. Tentativas iniciais no sandbox falharam por `rustup` sem acesso a temporário e Vite `spawn EPERM`; repetição com acesso adequado passou. Build mantém avisos Piper existentes de `path`, `crypto`, `fs`. QA independente encontrou P2: a avaliação retornava sucesso mesmo com regressão total. Adicionadas asserções do baseline e divergência específica, com JSON diagnóstico emitido antes da falha; Chromium repetido e passou.
# 2026-09-24 — fidelidade visual da shell e revisão

- Reconstruída a shell Studio & Paper: sidebar escura de 220 px, topbar de 64 px, ícones SVG locais, navegação responsiva e detalhes de diagnóstico acessíveis.
- Reconstruídos page navigator, paper viewer, toolbar, inspector OCR com abas e dock Narrativa/Áudio/Exportar. O tipo interno `unknown` é apresentado como "Texto não classificado".
- O visor usa PDF público GnuCOBOL de 29 páginas para captura visual; não foram inventados capítulos, qualidade de OCR ou estados de aprovação.
- Validações: typecheck, 160 testes Web, build, smoke OCR e E2E literal+narrativo com capítulos/reload. Capturas 1440×960 e 390×844 passaram sem overflow horizontal.

## 2026-09-25 — redesign de workspace editorial (em andamento, sem commit)

- Base sincronizada por HTTPS em `a3f496e`; alterações locais anteriores permanecem preservadas em `stash@{0}`. PRE-FLIGHT registrado em `.ai/TASK_PACKET.md`.
- Frontend passou a carregar Geist Sans e Source Serif 4, alinhando fontes reais aos tokens. `studio.css` introduz aliases semânticos claros/escuros, escala de espaçamento, raios discretos e superfícies opacas para o workspace.
- Shell ganhou paleta de ações nativa via `Ctrl/Cmd+K`; modo sem documento agora mostra importação e estado de biblioteca vazio em vez de etapas indisponíveis. Importação aceita seleção e arrastar/soltar PDF; fluxo de pipeline existente continua sendo único ponto de entrada.
- Player de leitura recebeu velocidade e volume baseados no elemento `<audio>` nativo; não foram adicionadas dependências, nem alterados contratos Rust/WASM, PDF, worker, persistência ou TTS.
- Validação parcial: `npm run typecheck` passou após mudanças de importação. Ainda pendentes nesta etapa: teste Web completo, build, smoke visual responsivo e revisão independente.

- Validação final: `npm run typecheck`, `npm test` (188 passed, 2 skipped), `npm run build` e `git diff --check` passaram. Build mantém avisos já existentes do Piper para `fs`, `path` e `crypto`, além de chunks grandes de runtimes locais; saída de deploy conferida com 39 arquivos e 81,60 MB.
- Revisão independente Terra encontrou e confirmou correção de três pontos: etapas sem conteúdo não aparecem antes do PDF, botões da paleta preservam semântica nativa e player/miniplayer não usam blur ou transparência. A revisão final aprovou; IAB ficou indisponível no reteste, mas a prévia anterior e as condições de código foram verificadas. `test:browser:shell` não rodou por ausência de Chrome em `/opt/google/chrome/chrome`.

## 2026-09-25 — reader e player (em andamento, sem commit)

- Leitor ganhou zoom por `Ctrl/Cmd + wheel`, limitado de 50% a 250%, mantendo botões explícitos e atalho de reset em 100%. O modo leitura real foi aberto com o PDF local de 75 páginas; o ajuste de zoom para 120% foi observado via árvore de acessibilidade.
- Player persistente inclui seleção de capítulo baseada em metadados já existentes, velocidade e volume nativos. Em viewport estreita, seleção de capítulo/volume e opções secundárias ficam fora do player compacto; toolbar do leitor prioriza página, zoom e saída.
- Revisão Terra recusou inicialmente rótulos de encaixe sem cálculo real; controles foram removidos. Revisão posterior aprovou o batch. `npm run typecheck`, `npm test` (188 passed, 2 skipped) e `git diff --check` passaram. Smoke visual móvel automático segue pendente por indisponibilidade intermitente do IAB/Chrome local.

## 2026-09-26 — correções visuais do documento e tocador (sem commit)

- No IAB local com `tests/fixtures/text_and_blank.pdf`, a página original agora termina de carregar (`aria-busy=false`) e o canvas cabe no visor móvel. Antes, sua largura incluía o padding interno e criava overflow horizontal de 7 px. Em zoom de 110%, o excedente fica no scroll do visor, sem ampliar a página inteira.
- O mesmo elemento `<audio>` permanece montado ao minimizar/expandir o tocador. O estado de erro de carregamento/reprodução agora é visível, e o tema padrão de leitura recebeu rótulo coerente com a superfície clara.
- Conferidos projeto, documento, revisão, narrativa, áudio e exportação na árvore e na captura de página longa a 390 px; leitor em 1280, 739, 390 e 320 px. Em 320/739 px, seletor de tema cabe no toolbar e `scrollWidth` global não supera `innerWidth`.
- Terra recusou o primeiro diff por sete falhas: nome acessível instável ao ocultar rail, grade de temas móvel, Configurações inacessíveis antes do PDF, `showModal` repetido, erro do player sem estilo, captura de zoom do navegador fora da leitura e `dragleave` interno. As sete foram corrigidas; segunda revisão independente aprovou sem P0–P2.
- Gates finais desta rodada: `npm run typecheck`, `npm test` (188 passed, 2 skipped), `npm run build`, `cargo fmt --all -- --check`, `cargo test --workspace` e `git diff --check` passaram. Build conserva avisos existentes do Piper e chunks grandes. Sem commit por instrução do usuário.

## 2026-09-26 — rolagem do leitor na tela aberta (sem commit)

- Reproduzido no IAB a 601×610 px: roda sobre o canvas original não movia a página. `.paper-scroll` tinha `overflow: auto` sem excedente vertical próprio, criando região de rolagem aninhada que consumia o gesto. Em modo leitura, passou a usar `overflow: visible`; a roda sobre o PDF moveu `scrollY` de 0 para 610, com máximo 644. Fora do modo leitura, visor existente não foi alterado.
- Leitura agora abre em Texto quando a página tem texto utilizável; Original permanece no seletor para conferir o PDF. Página que exige OCR continua abrindo em Original. Sem áudio gerado, aviso inicia recolhido como botão compacto e pode ser expandido.
- Conferidos visualmente Texto/Original, zoom 100–110% e rolagem pelo canvas em 601×610 px; Texto também rolou em 390×844 px sem overflow horizontal. A tela aberta contém a fixture local `text_and_blank.pdf` (2 páginas, uma sem texto), não um livro completo.
- Revisão Terra encontrou `PageUp`/`PageDown` capturados para trocar página. Removida a captura; no IAB, `PageDown` moveu `scrollY` de 0 para 270 mantendo Página 1. Segunda revisão aprovou sem P0–P2 no escopo.
- `npm run typecheck`, `npm test` (188 passed, 2 skipped), `npm run build` e `git diff --check` passaram. Smoke visual de zoom horizontal/fullscreen móvel segue pendente. Sem commit.

## 2026-09-26 — polimento da tela inicial e controles (sem commit)

- Ícones locais normalizados em SVG 24×24; botões de ícone e toolbar ganharam contraste, estados hover/desabilitado e foco visível consistente.
- Tela inicial reorganizada: chamada principal mais clara, importação de PDF com hierarquia e espaçamento melhores, e três passos de orientação no estado vazio. O card de documento aberto agora acomoda título, estado e ação de troca sem compressão.
- Importação passou a informar arquivo inválido arrastado em `role=status`, mostra nome substituto quando o projeto recuperado não tem nome e evita a instrução inicial contraditória enquanto já há documento.
- Prévia local inspecionada em desktop e 320/390 px. Em 320 px não houve overflow horizontal; os três passos continuam acessíveis por rolagem acima da navegação fixa. Nenhum PDF do usuário foi substituído.
- Revisão independente Terra apontou três P2 na recuperação/importação, corrigidos e aprovados na segunda rodada, sem novos P0–P2.
- Gates: `cargo fmt --all -- --check`, `cargo test --workspace` (51 testes), `npm run typecheck`, `npm test` (188 passaram, 2 ignorados), `npm run build` e `git diff --check` passaram. Avisos existentes do Piper (`fs`, `path`, `crypto`) e chunks grandes permanecem.
