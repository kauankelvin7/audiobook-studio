# ADR 0009 — Ciclo de vida de storage local

Status: accepted (IndexedDB/checkpoints e quota implementados; OPFS/locks pendentes)

## Decisão

O `StorageManager` futuro consulta quota antes de baixar modelos ou renderizar lotes. Artefatos têm tamanho, último acesso, regenerabilidade, vínculo ao projeto, pin e classe. Eviction usa LRU somente entre itens regeneráveis, não fixados, fora do projeto atual e que não sejam artefatos finais. Se a seleção segura não liberar espaço suficiente, a operação falha com erro de quota e pede ação; não amplia a lista de exclusão silenciosamente.

PDF original, edição humana, artefato final e qualquer dado não regenerável nunca são removidos sem autorização. Cache OCR inclui hash do documento, página, região, engine/versão e settings. Cache de modelo evita quantizações duplicadas quando não necessárias e deve expor tamanho e remoção ao usuário. Temporários têm expiração explícita; manifest é atualizado somente após persistência validada.

## Consequências

A função pura de candidatos à eviction está implementada e testada. M3.1 adiciona checkpoints versionados em IndexedDB, checksum SHA-256, recuperação explícita do último registro válido e consulta best-effort de quota/persistência. Registros inválidos não são removidos automaticamente. OPFS, locks entre abas, limpeza física, UI e atomicidade IndexedDB/OPFS ficam para M3.2; M5 adicionará modelos e áudio.
