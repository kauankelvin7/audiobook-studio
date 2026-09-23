# ADR 0011 — Persistência de submissões de revisão

Status: accepted (persistência local sem atestação)

## Contexto

O core Rust valida decisões por trecho contra o pacote de evidências atual e emite um recibo com `submissionHash`. O recibo tem `attestationStatus: unverified`. Sem persistência, uma revisão estruturalmente válida se perde ao fechar a sessão. O armazenamento local já dispõe de OPFS, manifest e checkpoint em IndexedDB, além de Web Locks por projeto.

## Decisão

Salvar submissão e recibo juntos em JSON como artefato `review_submission` não regenerável e fixado. A chave do artefato deriva do `submissionHash` calculado pelo Rust. A gravação revalida a submissão via Rust/WASM, exige que `sourceHash` corresponda ao checkpoint do projeto e usa o checksum desse checkpoint como condição para publicar o próximo. O fluxo existente grava e verifica os bytes em OPFS antes do commit de manifest e checkpoint em IndexedDB.

Na leitura histórica, validar o manifest persistido e o hash dos bytes do OPFS e revalidar a submissão contra roteiro, plano, conteúdo e outline fornecidos pelo chamador via Rust/WASM. O recibo recalculado deve coincidir com o salvo. O manifest continua acessível quando o checkpoint atual troca de fonte ou deixa de referenciar a revisão arquivada. Uma segunda leitura do checksum do checkpoint detecta mudança concorrente durante a operação.

O checkpoint ainda não identifica o plano e o roteiro ativos. Assim, mesmo uma revalidação bem-sucedida contra o contexto fornecido não prova que ele seja o contexto ativo do projeto. A API retorna `currentness: not_established` e se chama `readHistoricalAgainstContext`; não fornece operação de aprovação ou declaração de atualidade. Uma etapa posterior terá de persistir e atualizar a identidade canônica do plano/roteiro ativo antes de avaliar qualquer revisão para QA ou TTS.

Atualização: ADR 0012 introduz o ponteiro de identidade narrativa ativa no checkpoint, sem alterar a semântica histórica desta API. Uma integração posterior deverá vincular a submissão ao ponteiro ativo e definir atestação; `currentness` continua `not_established` neste adapter.

Atualização: ADR 0013 adiciona gravação v2 vinculada à identidade ativa e avaliação estrutural. A leitura histórica mantém `currentness: not_established` para as duas versões; somente o avaliador separado distingue vínculo estrutural válido. Atestação continua pendente.

Este registro é durável apenas dentro das garantias do armazenamento do navegador. Checksum e hash detectam corrupção e inconsistência, mas não atestam identidade humana nem protegem contra código malicioso executado na mesma origem. O campo `unverified` permanece inalterado. Nenhuma regra de QA passa para `pass` e nenhum TTS é liberado por este artefato.

## Próxima decisão necessária

Definir quem pode atestar a revisão, como provar presença/identidade no ambiente local-first e qual política liga essa prova ao `submissionHash` e aos hashes das fontes. WebAuthn é candidato a avaliar, não uma solução adotada: provar posse de credencial ou verificação do usuário não comprova leitura ou correção semântica. Avaliar também ameaça de código de mesma origem comprometido, revogação e portabilidade. Corpus/golden real é necessário para avaliação de claims antes de qualquer aprovação automatizada.
