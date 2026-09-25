# ADR 0024 — OCR de página sem texto nativo

Status: accepted

## Contexto

O fluxo OCR anterior exigia uma região do DocumentIR com texto nativo e bbox. Uma página digitalizada pode ter `extractionQuality: no_text`, `rawText` vazio e nenhuma região. Nesse caso não há alvo para captura, mesmo com PDF original e engine local disponíveis.

## Decisão

O core Rust usa `regionId: "__page__"` como alvo virtual somente para página `no_text` sem regiões e com `rawText` exatamente vazio. Uma região real existente com esse ID tem precedência e mantém o fluxo regional. O hash nativo do alvo virtual é o SHA-256 do texto vazio; o candidato continua `pending`, a comparação `review_required` e a revisão `unverified`. `keep_native` é inválido apenas no alvo virtual. O alvo não cria uma região no DocumentIR, não reconcilia texto e não muda elegibilidade para narração/TTS.

PDF.js captura a página inteira usando `page.view` e o mesmo teto de 8 MB para PDF, 4 milhões de pixels, 4.096 px por lado e prazo de 15 segundos da captura regional. A evidência registra `pdfjs-page-crop-v1`. Antes de gravar e ao reabrir o histórico, o adapter relê o PDF original, verifica hash, número de página, geometria e dimensões renderizadas contra o PNG e o recibo Rust. TypeScript apenas espelha o identificador reservado e valida a fronteira Web; Rust decide se o alvo existe.

## Consequências

Há OCR local e revisão histórica também para PDFs digitalizados sem camada de texto. A comparação com nativo vazio mostra tokens do OCR, não prova correção. Nenhuma transcrição é promovida automaticamente. Páginas grandes excedem o limite e falham fechadas. O teste funcional sintético de imagem não substitui goldens de documentos reais revisados nem atestação de revisor.
