# Audiobook Studio

Base do projeto para um compilador de documentos em audiolivros, com execução local no navegador. Esta entrega cobre o Milestone 0: governança, workspace Rust, interface React/Vite, contratos iniciais, CI e documentação. A conversão de PDF e a geração de áudio ainda não estão implementadas.

## Estrutura

- `audiobook_studio_engineering/`: relatório mestre, prompt original e regras originais do pacote.
- `crates/core/`: domínio determinístico inicial.
- `crates/wasm/`: fachada preparada para `wasm-bindgen`.
- `apps/web/`: interface e fronteiras de adapters/worker.
- `docs/`, `.ai/`: decisões, contexto e registro de trabalho.

## Desenvolvimento

Requer Node.js 22.12+ para a versão atual do Vite.

```text
cd apps/web
npm ci
npm run typecheck
npm run build
```

Com Rust e os componentes de compilação instalados:

```text
cargo fmt --all -- --check
cargo test --workspace
```

Consulte `docs/CONTEXT_INDEX.md` antes de iniciar uma tarefa. O próximo milestone define o `DocumentIR` completo e suas invariantes com fixtures reais.
