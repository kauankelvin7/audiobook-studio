# ADR 0015 — Leitura local do texto nativo

Status: accepted

## Contexto

A interface importava PDF e mostrava texto, mas não entregava áudio. O pipeline narrativo completo ainda não possui modelo real, avaliação semântica confiável ou TTS/export. Adiar toda reprodução até esses componentes estarem prontos impede verificar a experiência de escuta.

## Decisão

Adicionar um modo de leitura literal, separado do audiobook narrativo. O core Rust constrói sessões de uma a dez páginas consecutivas a partir de DocumentIR v2. A sessão falha por inteiro se houver página sem texto nativo confiável, extração `corrupted`/`no_text`, região sem fonte correspondente, conteúdo não textual ou limite de tamanho excedido. O core compara a sequência de tokens separados por espaço dos trechos com `page.rawText`, rejeitando perda, junção de palavras ou mudança de ordem detectável. Nenhum trecho é omitido silenciosamente. A UI exibe todos os trechos e exige confirmação explícita do usuário a cada sessão. A confirmação não altera `qualityStatus`, não atesta fidelidade e não transforma QA narrativo em `pass`.

O adapter TypeScript usa somente Web Speech com `SpeechSynthesisVoice.localService === true`. Sem essa voz ou sem a API, a leitura não começa. A interface oferece ouvir, pausar, retomar e parar. Importação ou alteração do intervalo cancela a reprodução. Áudio não é persistido nem exportado.

## Limites

Este modo lê texto extraído, inclusive erros que uma pessoa não percebeu na revisão. A propriedade `localService` é uma declaração da plataforma, não auditoria de tráfego. O modo não substitui OCR, interpretação de tabelas/código, Narrative Planner, QA semântico, TTS neural ou empacotamento. Esses gates continuam necessários para chamar o resultado de audiobook final.
