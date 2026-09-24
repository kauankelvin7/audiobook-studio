# ADR 0005 — Compilador narrativo antes do TTS

Status: accepted (M4.1 e fronteira determinística M4.2a implementadas/testadas; provider/modelo IA ainda pendentes)

## Contexto

O relatório mestre prevê DocumentIR, estrutura, ScriptAdapter e TTS, mas não separa seção visual, unidade narrativa e capítulo falado. Um primeiro audiobook relatado pelo usuário repetiu títulos/definições e fragmentou a escuta. O áudio não foi fornecido para medição independente.

## Decisão

`DocumentSection != NarrativeSection != SpokenChapter`. Entre DocumentIR e ScriptAdapter entram ContentModel, SemanticOutline, NarrativePlanner e NarrativeModel. Após o ScriptAdapter, CohesionPass, RedundancyGuard, SpokenHeadingPolicy e GlobalNarrationQA produzem um SpeechModel validado; PronunciationCompiler altera `speechText`, nunca `displayText`.

Uma heading recebe decisão explícita `announce | integrate | silent` com motivo e source references. Nenhuma heading vira capítulo falado automaticamente. O planner usa memória semântica compacta por unidade; não reenviamos o livro inteiro como contexto. Seções narrativas de 30 s–3 min e capítulos de 5–12 min são heurísticas revisáveis, não invariantes.

Cada estágio terá schema/version, IDs, input/output tipados, validador, erros tipados, auditoria, dependências/cache e checkpoint quando custoso. TTS final só recebe roteiro com planner, schema, source mapping, redundância e QA crítico aprovados. Achados não críticos ficam como warnings explícitos. Duplicação de heading anunciado é gate de zero antes do TTS; detecção semântica tem incerteza e exige revisão, não remoção silenciosa. Relatórios de QA são sinais de regressão, não prova matemática de qualidade.

## Consequências

O roadmap M4 passa a incluir planejamento, memória, coesão, deduplicação e QA local/global antes de M5. Alterações de pronúncia invalidam áudio dependente, não DocumentIR. Os contratos TypeScript de `ContentModel`/`SemanticOutline` e a validação de structured output existem e são testados; domínio Rust, chamada real ao planner/modelo e evals semânticos continuam pendentes, com paridade exigida antes de uso em produção.

O relatório mestre original permanece preservado como fonte histórica; `docs/NARRATIVE_AND_PERFORMANCE.md` é o adendo normativo para estas decisões.
