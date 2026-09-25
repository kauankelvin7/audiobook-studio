# ADR 0020 — Evidência OCR histórica no armazenamento local

Status: accepted (persistência histórica; promoção de texto pendente)

## Contexto

A engine local produz PNG, candidato e recibo Rust `pending`. Sem persistência, esses dados se perdem ao fechar a aba e não podem ser conferidos posteriormente contra a mesma fonte.

## Decisão

Salvar dois artefatos `ocr_evidence` fixados e não regeneráveis: PNG e envelope JSON com metadata da captura, candidato e recibo. As chaves são derivadas do `receiptHash` canônico do Rust. OPFS grava e verifica os bytes; IndexedDB publica os dois manifests e o novo checkpoint juntos sob lock, exigindo checksum do checkpoint anterior. A fonte ativa precisa corresponder ao candidato no momento da gravação.

Antes de salvar e ao reler, conferir estrutura e CRC dos chunks PNG, dimensões, hash da imagem, bbox e identidade da região no DocumentIR fornecido, vínculo do candidato à captura e recibo recalculado pelo Rust/WASM. No navegador, decodificar o PNG com `createImageBitmap` dentro do limite de pixels antes de gravar e ao ler. A leitura histórica exige manifests exatos, valida os bytes OPFS e detecta troca concorrente do checkpoint. Continua disponível após troca de fonte, mas retorna `currentness: not_established`: revalidar contra um documento fornecido não prova que ele ainda é o documento ativo.

Não substituir texto nativo, promover OCR, alterar elegibilidade, aprovar QA ou liberar narração por causa dessa evidência. O recibo permanece `pending`. A integridade local detecta corrupção e inconsistência acidental, não autentica um revisor nem protege contra código malicioso na mesma origem.

## Limites

O corpus COBOL/CICS privado não estava acessível no checkout durante esta implementação. Testes usam documento e PNG de fixture sintética com WASM real e storage compatível em memória. Smoke em Chromium gera OCR real da fixture PDF pública, salva no OPFS/IndexedDB e relê após reload. Ainda faltam goldens visuais revisados, medição da fidelidade, interface de revisão, reconciliação canônica e política de retenção explícita para evidências históricas.
