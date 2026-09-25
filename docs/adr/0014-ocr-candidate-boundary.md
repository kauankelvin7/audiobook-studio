# ADR 0014 — Candidato OCR vinculado à fonte

Status: accepted (contrato de candidato; engine e reconciliação pendentes)

## Contexto

A extração nativa do manual COBOL/CICS contém glifos Unicode privados em todas as páginas. O core bloqueia essas regiões para narração, mas ainda não recebe saída de OCR. Uma futura engine é uma fonte não confiável: redução de caracteres privados não demonstra que prosa ou código foram recuperados corretamente.

## Decisão

O core Rust valida um candidato OCR para uma região já existente do DocumentIR v2. O candidato declara identidade do documento/fonte, página, região, hash do texto nativo, hash dos pixels renderizados, identidade/versão da engine e texto produzido. O core reconfere documento, região e hash nativo; limita o texto OCR a 1.000.000 bytes; devolve um recibo versionado com hashes do documento, texto OCR e vínculo, além de contagens de glifos privados. O estado do recibo é sempre `pending`.

O recibo não altera DocumentIR v2, ContentModel nem elegibilidade para narração. Ele não prova que `imageHash` corresponde aos pixels corretos da região; o adapter Web terá de guardar a imagem/crop e sua proveniência. Contagens PUA são sinais, não métrica de fidelidade. Nenhum `ocr_confirmed`, `accepted`, QA `pass` ou TTS decorre deste recibo.

A primeira versão aceita apenas regiões existentes com camada `rawText`, não páginas vazias sem regiões. OCR de página inteira, comparação visual, escolha da engine, persistência de candidato/recibo e decisão humana são etapas separadas.

## Consequências

O WASM expõe a validação Rust; TypeScript mantém só schemas de fronteira e adapter. O teste de paridade usa o módulo WASM real e conserva whitespace do texto OCR. Mudança no contrato/hash exige nova versão e teste de compatibilidade. Nenhum PDF do usuário ou transcrição é publicado como fixture.
