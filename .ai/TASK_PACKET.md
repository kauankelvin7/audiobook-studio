# TASK PACKET — M1 e entrada controlada no M2

## PRE-FLIGHT
- Objetivo verificável: concluir o domínio Rust de DocumentIR (M1) e, após gates verdes, importar PDF com texto no navegador sem IA (M2).
- Evidências: `git status` limpo em `main`; `docs/CONTEXT_INDEX.md`; relatório mestre §§4.1–4.3, 10–13, 23, 28, 62; ADRs 0001–0003; código e schema existentes.
- Restrições: MVP local-first, sem backend ou IA; conteúdo PDF é dado não confiável; não descartar blocos incertos; preservar o relatório mestre original; usar a skill `humanizer` ao criar textos da interface.
- Desconhecidos: versão/API de PDF.js a confirmar em fonte oficial antes do M2; testes Rust locais bloqueados pela ausência do linker MSVC.
- Riscos: divergência Rust↔TypeScript; PDF sem camada textual; documentos grandes; estados inválidos; hashes/cache incorretos.
- Plano: (1) contratos/validações M1 e fixtures compartilhadas; (2) testes Rust e TypeScript, revisão, CI verde; (3) adapter PDF.js em Worker, viewer simples e testes com PDFs reais; (4) gates e revisão final.
- Verificação: rustfmt, testes workspace no CI, teste de schema/contratos, typecheck, build, npm audit, smoke de importação M2 e diff review.

## Critérios de aceitação
- M1: JSON versionado com páginas e blocos, IDs únicos, ordem e proveniência; validação de hash/caixa/confiança; transições explícitas; erros tipados; manifest e cache key determinística; round-trip testado.
- M2: PDF válido extrai texto por página sem rede/backend; PDF inválido retorna erro claro; página sem camada textual permanece representada e sinaliza OCR; usuário vê resultado e origem por página.

## Resultados
- Alterações: M1 implementado; contrato DocumentIR v1, validações, manifest/cache key, máquina de estados, fixture e testes; M2 aguarda CI verde.
- Verificações: rustfmt check, 4 testes TypeScript, typecheck, build e npm audit (0 vulnerabilidades) passaram localmente; Rust test/clippy aguardam CI.
- Pendências: em andamento.
- Próximo passo: começar pelo contrato M1.
