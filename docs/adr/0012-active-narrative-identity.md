# ADR 0012 — Identidade da narrativa ativa

Status: accepted (contrato e persistência local; integração ao fluxo de edição pendente)

## Contexto

O recibo de revisão guarda hashes do conteúdo, plano e roteiro, mas o checkpoint do projeto não indicava qual combinação estava ativa. Uma revisão histórica podia ser revalidada contra um contexto antigo fornecido pelo chamador sem demonstrar que esse contexto era o publicado no projeto.

## Decisão

O `audiobook-core` calcula `ActiveNarrativeIdentity` após validar roteiro, plano, ContentModel e outline. O contrato inclui IDs, `sourceHash`, `contentHash`, `outlineHash`, `planHash`, `scriptHash` e um `identityHash` calculado sobre esses campos e a versão do método. O WASM apenas expõe o resultado; o schema TypeScript valida a fronteira.

O adapter Web publica a identidade como artefato OPFS `active_narrative`, fixado e não regenerável. O checkpoint seguinte referencia uma única chave `active_<identityHash>` e deixa de referenciar a identidade ativa anterior. Manifests antigos permanecem para diagnóstico e recuperação. A publicação usa o checksum do checkpoint anterior sob Web Lock; se a fonte ou o checkpoint mudou, a operação falha. O Rust exige estado `VERIFYING`; o adapter rejeita checkpoints com referência a artefatos de áudio ou manifest ausente. Assim, uma troca não conserva estado `READY_FOR_AUDIO` nem áudio anterior.

Na leitura, o adapter verifica o manifest, a integridade do arquivo, a fonte do checkpoint e recalcula a identidade no Rust/WASM contra o contexto fornecido. Contexto antigo não corresponde ao ponteiro ativo. O checksum do checkpoint é relido antes do retorno para detectar mudança concorrente.

## Limites

Este ponteiro define apenas qual identidade de narrativa foi publicada por este adapter. A UI e os futuros fluxos de edição ainda precisam chamar a publicação a cada mudança de plano ou roteiro, retornando a `VERIFYING` e retirando referências a áudio antes disso. A identidade não atesta quem revisou, não comprova fidelidade semântica e não muda QA para `pass`. TTS permanece bloqueado até atestação confiável, avaliação semântica e integração desses estados.
