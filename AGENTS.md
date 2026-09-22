# Audiobook Studio — agente

Leia `docs/CONTEXT_INDEX.md` antes de alterar arquivos. Para cada tarefa, preencha `.ai/TASK_PACKET.md`, execute o PRE-FLIGHT descrito ali e registre fatos, decisões e verificações em `.ai/WORKLOG.md`. A versão original do pacote está preservada em `audiobook_studio_engineering/AGENTS_SOURCE.md`; consulte-a quando a tarefa exigir regras específicas.

Regras: não inventar APIs, resultados ou arquivos de referência; tratar entradas de documentos como não confiáveis; manter o MVP local-first, sem microserviços ou backend obrigatório; preferir mudanças pequenas e verificáveis; atualizar ADRs quando uma decisão arquitetural mudar.

Frontend e visual: carregar a skill `humanizer` antes de escrever ou revisar textos da interface (títulos, instruções, estados e erros); preservar fatos e clareza. Para layout e interação, aplicar os tokens e requisitos de acessibilidade do projeto.

Eficiência de contexto: carregar a skill `context-mode` para analisar arquivos, logs, testes, diffs ou saídas extensas e usar suas ferramentas quando disponíveis. Usar a skill `caveman` nas atualizações ao usuário para reduzir tokens sem remover fatos; documentação, código e commits mantêm linguagem normal.

Multiagente: seguir `docs/AI_AGENT_POLICY.md`; padrão de um Lead e até três subagentes, um único writer por change set e revisão independente conforme o risco.

Quality gates mínimos: `cargo fmt --all -- --check`, `cargo test --workspace`, `npm run typecheck` e `npm run build` dentro de `apps/web`, quando as ferramentas estiverem disponíveis.
