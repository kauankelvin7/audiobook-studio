# ADR 0019 — Engine OCR local no navegador

Status: accepted (engine executável; fidelidade em corpus real pendente)

## Contexto

As ADRs 0014 e 0018 estabelecem candidato pendente e captura de pixels vinculada à fonte. Faltava uma engine que executasse no navegador sem enviar o documento a outro serviço.

## Decisão

O adapter usa Tesseract.js 7.0.0 com dados portugueses `@tesseract.js-data/por` 1.0.0, perfil LSTM `4.0.0_best_int`. Worker, três variantes do core LSTM com seus binários WASM e dados de idioma são copiados de dependências fixadas para assets servidos pela própria aplicação. `workerPath`, `corePath` e `langPath` apontam explicitamente para essa origem; cache da engine fica desativado. A chamada cria um worker por região e o encerra após uso ou cancelamento. O adapter limita a operação a uma região e ao prazo de 15 segundos. O texto produzido continua não confiável e só entra no contrato de candidato `pending` validado pelo Rust/WASM.

O estágio dos assets ocorre em `predev` e `prebuild`, a partir do lockfile. Não há download de CDN em tempo de uso nem backend. Os assets adicionam cerca de 21 MB ao build; o navegador carrega apenas a variante de core escolhida, mais o idioma. O estágio não incorpora PDFs do usuário.

## Verificação e limites

O smoke em Chromium com fixture pública executa PDF.js, captura, Tesseract.js e Rust/WASM reais, reconhece o título, confere o hash da imagem no recibo e observa zero requisições fora da origem local. Isto prova execução e vínculo nessa fixture. Não mede acurácia em páginas COBOL/CICS, código, acentos complexos, rotação ou sobreposição. Um recibo `pending` não altera DocumentIR, não remove bloqueios e não libera fala. Goldens locais revisados, persistência de candidatos, reconciliação canônica e UI de revisão continuam etapas posteriores.
