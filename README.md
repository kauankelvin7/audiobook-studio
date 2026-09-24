# Audiobook Studio

Projeto local-first para transformar documentos em áudio. A interface importa PDFs, mostra o texto por página e permite ouvir de uma a dez páginas após conferência explícita. A leitura imediata usa vozes locais do navegador. O produto gera WAV literal completo ou WAV narrativo com a voz Faber pt-BR, capítulos, player, download e reabertura após reload. O modo narrativo exige aprovação local do texto nativo ou de correção OCR, roteiro reescrito e revisado pelo operador, QA sem finding crítico e SpeechUnits validados em Rust. Páginas vazias/corrompidas bloqueiam a aprovação nativa; o rascunho narrativo inicial ainda usa texto literal e precisa de edição humana.

## Estrutura

- `audiobook_studio_engineering/`: relatório mestre, prompt original e regras originais do pacote.
- `crates/core/`: domínio determinístico, validação de fonte e sessões de leitura.
- `crates/wasm/`: fachada Rust/WASM usada pelo navegador.
- `apps/web/`: interface, PDF.js, storage local, Web Worker e adapter de voz.
- `docs/`, `.ai/`: decisões, contexto e registro de trabalho.

O modo de leitura está delimitado em `docs/adr/0015-native-text-reading-preview.md` e a exportação em `docs/adr/0016-local-wav-export.md`. Páginas escaneadas ou com extração suspeita não entram na sessão. O usuário deve conferir todo o texto exibido antes de ouvir ou gerar WAV. A voz de leitura imediata depende das vozes locais expostas pelo navegador; a exportação baixa um modelo de cerca de 63 MB na primeira geração. O app salva cada WAV localmente, lista gravações anteriores válidas e permite abrir, baixar ou excluir uma gravação antiga após confirmação. A exclusão preserva o projeto atual e um checkpoint de recuperação (ADR 0017). Reprodução programática e download foram testados em Chrome e Edge; qualidade auditiva ainda exige escuta humana.

## Desenvolvimento

Requer Node.js 22.12+ para a versão atual do Vite.

```text
cd apps/web
npm ci
npm run typecheck
npm test
npm run build
npm run dev
```

Com Rust e os componentes de compilação instalados:

```text
cargo fmt --all -- --check
cargo test --workspace
```

Após mudar código Rust usado no navegador, rode `npm run wasm:build` em `apps/web` antes dos testes Web. Consulte `docs/CONTEXT_INDEX.md` antes de iniciar uma tarefa.

O smoke opt-in `npm run test:browser:local-ocr` executa a engine OCR em uma fixture pública e exige Chromium ou um canal definido por `AUDIO_BROWSER_CHANNEL`. Os assets OCR são copiados das dependências fixadas em `predev` e `prebuild`, sem CDN em tempo de uso. O resultado permanece candidato pendente de revisão.

Correções explicitamente salvas podem alimentar uma memória local de ambiguidades OCR. Ela só aceita pares técnicos limitados, como `0`/`O`, e precisa de três revisões distintas antes de mostrar uma sugestão. O operador atualiza um modelo local versionado em lote; ele contém hashes e regras verificáveis, sem imagens ou texto completo do PDF. A sugestão nunca altera o documento nem é aplicada automaticamente. O smoke `npm run test:browser:ocr-learning` valida Rust/WASM, IndexedDB e ausência de requisições externas.

O smoke funcional de áudio é opt-in porque baixa o modelo de voz na primeira execução e requer Chrome ou Edge instalado. Ele não faz inspeção visual:

```text
cd apps/web
npm run test:browser:audio
$env:AUDIO_BROWSER_CHANNEL='msedge'; npm run test:browser:audio
npm run test:browser:complete-audio
```

`test:browser:complete-audio` importa a mesma fixture de duas páginas, exporta os modos literal e narrativo, compara os WAVs, verifica capítulos, roteiro/QA, download e reload. A primeira geração Piper baixa o modelo de voz. O QA marca `review` enquanto claim grounding depende de conferência humana; a confirmação local não autentica identidade.
