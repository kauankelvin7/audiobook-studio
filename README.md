# Audiobook Studio

Projeto local-first para transformar documentos em audiolivros. A interface importa PDFs com texto selecionável, mostra o texto por página e permite ouvir de uma a dez páginas após conferência explícita. A leitura imediata usa somente vozes que o navegador declara locais. Também é possível gerar e salvar um WAV literal com a voz Faber pt-BR em um Worker local. Não há OCR funcional, modelo narrativo real ou audiolivro final nesta versão.

## Estrutura

- `audiobook_studio_engineering/`: relatório mestre, prompt original e regras originais do pacote.
- `crates/core/`: domínio determinístico, validação de fonte e sessões de leitura.
- `crates/wasm/`: fachada Rust/WASM usada pelo navegador.
- `apps/web/`: interface, PDF.js, storage local, Web Worker e adapter de voz.
- `docs/`, `.ai/`: decisões, contexto e registro de trabalho.

O modo de leitura está delimitado em `docs/adr/0015-native-text-reading-preview.md` e a exportação em `docs/adr/0016-local-wav-export.md`. Páginas escaneadas ou com extração suspeita não entram na sessão. O usuário deve conferir todo o texto exibido antes de ouvir ou gerar WAV. A voz de leitura imediata depende das vozes locais expostas pelo navegador; a exportação baixa um modelo de cerca de 63 MB na primeira geração. O app salva cada WAV localmente, lista gravações anteriores válidas e permite abrir e baixar uma cópia. Reprodução programática e download foram testados em Chrome e Edge; qualidade auditiva ainda exige escuta humana.

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

O smoke funcional de áudio é opt-in porque baixa o modelo de voz na primeira execução e requer Chrome ou Edge instalado. Ele não faz inspeção visual:

```text
cd apps/web
npm run test:browser:audio
$env:AUDIO_BROWSER_CHANNEL='msedge'; npm run test:browser:audio
```
