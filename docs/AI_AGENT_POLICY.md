# Política multiagente

## Objetivo

Usar especialização somente quando ela melhorar evidência, qualidade ou velocidade sem criar conflito de escrita. O padrão é um Lead e de zero a três subagentes ativos. Mais paralelismo exige justificativa explícita no `TASK_PACKET` e tarefas independentes.

## Fluxo por risco

- `LOW`: Lead implementa e testa.
- `MEDIUM`: Explorer reúne evidência; um Writer implementa; QA faz revisão independente.
- `HIGH`: Explorer, especialista necessário, reviewer de segurança ou performance quando aplicável, um Writer, QA e revisão final do Lead.

O Lead planeja, define ownership, integra resultados e aprova o estado final. Apenas um Writer possui o change set principal. Agentes paralelos não editam simultaneamente `DocumentIR`, state machine, manifests ou schemas centrais.

## Papéis configurados

| Papel | Modelo | Esforço | Uso principal |
|---|---|---:|---|
| `architect` | `gpt-5.6-sol` | high | arquitetura, decomposição e integração |
| `explorer` | `gpt-5.6-terra` | medium | exploração read-only e evidências |
| `rust-core` | `gpt-5.6-sol` | high | domínio Rust, persistência e WASM |
| `frontend` | `gpt-5.6-sol` | medium | React, workers, UI e acessibilidade |
| `narrative-ai` | `gpt-5.6-sol` | high | narrativa, prompts, evals e source mapping |
| `document-ocr` | `gpt-5.6-sol` | high | PDF, OCR, layout e conteúdo complexo |
| `performance` | `gpt-5.6-sol` | high | TTFA, RTF, memória e roteamento adaptativo |
| `security-reviewer` | `gpt-5.6-sol` | high | revisão independente de segurança/privacidade |
| `qa-reviewer` | `gpt-5.6-terra` | medium | testes, regressão, recuperação e cache |
| `docs` | `gpt-5.6-luna` | low | ADRs, worklog e documentação factual |

Esses perfis ficam disponíveis; não são iniciados em conjunto por padrão. O limite do projeto é três subagentes concorrentes. O modelo do Lead é controlado pelo host da sessão; o perfil `architect` define a escolha para uma sessão delegada desse papel.

## Esforço e escalonamento

- `low`: formatação, renomeações, boilerplate e documentação simples.
- `medium`: exploração, UI comum, implementação delimitada e testes normais.
- `high`: arquitetura, Rust core, OCR, narrativa, performance, segurança e debugging difícil.
- `xhigh/max`: excepcional; exige no `TASK_PACKET` a falha ou ambiguidade concreta que justificou a escalada.

Começar no menor esforço adequado. Não escalar porque a tarefa é grande; escalar quando a incerteza ou o risco técnico exigirem.

## Economia de contexto e tokens

Cada agente lê apenas `AGENTS.md`, o `TASK_PACKET`, a rota relevante de `CONTEXT_INDEX` e arquivos diretamente relacionados. O relatório mestre não deve ser repetido integralmente. Saídas devem ser curtas e usar:

```text
RESULT
Evidence:
Findings:
Files inspected:
Risks:
Recommendation:
Tests/commands actually run:
Unknowns:
```

Nenhum agente expõe cadeia de pensamento ou inventa resultados. Terra/Luna são preferidos para exploração, QA comum, documentação e trabalho mecânico. Sol High fica reservado a engenharia complexa. A configuração não promete cota específica do plano Plus; ela apenas reduz chamadas, contexto e concorrência desnecessários.

## Revisão independente

Mudanças de risco médio ou alto devem ter reviewer diferente do Writer. A revisão procura correctness, perda de dados, segurança, privacidade, race conditions, estados inválidos, retries, cache, recuperação, regressões, performance, acessibilidade e manutenção. Aprovação superficial não substitui testes.

## Exemplos

- OCR: Lead + Explorer + `document-ocr` + QA; incluir `security-reviewer` apenas se a superfície maliciosa estiver no change set.
- Performance: Lead + Explorer + `performance` + QA; nenhuma melhoria sem medição antes/depois.
- UI simples: Lead/`frontend` + QA.
- Documentação: `docs` em low, com Lead validando fatos.
- Segurança crítica: Lead + `security-reviewer` + QA em high.

## Limites operacionais

Configuração de projeto do Codex só é carregada quando o repositório é confiável e pode exigir nova sessão para descoberta dos novos perfis. Arquivos TOML parseáveis demonstram configuração; reconhecimento pelo cliente deve ser confirmado em uma nova sessão, não presumido.
