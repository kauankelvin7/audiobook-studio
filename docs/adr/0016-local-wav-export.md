# ADR 0016 — Exportação WAV da leitura literal

Status: accepted (síntese, recuperação, reprodução programática e download validados em Chrome e Edge; escuta humana pendente)

## Contexto

A leitura nativa do ADR 0015 toca por Web Speech, que não entrega os bytes de áudio. O usuário precisa salvar e reproduzir a leitura após fechar o app, sem esperar o planner narrativo. O pacote `@mintplex-labs/piper-tts-web` 1.0.5 produz Blob WAV localmente com ONNX Runtime Web. A voz `pt_BR-faber-medium` consta no catálogo do pacote e seu MODEL_CARD registra dataset CC0; o repositório da voz está sob MIT. O modelo pesa 63.201.294 bytes.

## Decisão

Manter a sessão literal validada pelo Rust/WASM como única origem de texto. Após confirmação humana, o adapter Web concatena todos os trechos na ordem da sessão, limita a geração a 12.000 caracteres, chama Piper em Web Worker e aceita somente WAV PCM mono 16-bit 22.050 Hz com RIFF/data e tamanho íntegros. Um erro cancela o arquivo inteiro. Importar outro PDF, trocar intervalo ou retirar confirmação cancela o Worker e revoga o objeto de áudio. O arquivo pronto fica disponível para reprodução e download e é salvo automaticamente quando o armazenamento local está disponível.

O runtime WASM/fonemizador/ONNX é copiado das dependências pinadas para assets de mesma origem no build. O modelo de voz é baixado sob comando explícito do usuário pelo pacote Piper e fica em OPFS. Após validar o WAV, o app o salva no OPFS como `audio_chunk` fixado, junto com metadata de fonte, intervalo, voz e hash da sessão. O IndexedDB publica os dois manifests e um novo checkpoint somente após escrita e verificação dos blobs. Na recuperação, o app reconstrói a sessão via Rust/WASM e compara o hash antes de exibir o WAV. O catálogo consulta manifests históricos, lê metadata limitada a 16 KiB e valida o hash da sessão no Rust antes de listar. O WAV completo só é lido e validado ao abrir uma gravação. Metadata inválida não impede acesso às demais. Áudio literal não recebe `final_audio` nem QA `pass`. Não há upload do texto para serviço de TTS nem backend obrigatório.

## Limites e riscos

- O pacote controla o download/cache do modelo e não expõe verificação SHA-256 do peso baixado na fronteira do app. Há dependência da disponibilidade do host do modelo. Não incluir conteúdo privado no callback de progresso/erros.
- O limite de 12.000 caracteres e 80 MB WAV evita geração desmedida, mas memória, quota e desempenho reais variam por dispositivo. O Worker pode ser cancelado, porém a inferência não é retomável.
- Cada nova gravação ganha chave imutável. O checkpoint atual referencia só a mais recente; gravações antigas permanecem acessíveis pelo catálogo. Não excluir automaticamente: checkpoints históricos ainda podem referenciá-las. Quota cheia mantém o WAV em memória para download, sem afirmar persistência.
- A validação de cabeçalho WAV e o avanço do elemento de áudio não provam que todas as palavras foram pronunciadas nem qualidade perceptual. Escuta humana e cobertura de navegadores/dispositivos continuam necessárias antes de chamar o recurso de produção.
- Chrome e Edge headless executaram importação da fixture, síntese Piper real, recarga, abertura, `audio.play()` com avanço de tempo e download íntegro. O teste compara SHA-256 do download com o Blob reproduzido. O navegador integrado ainda caiu ao acionar o controle nativo em tentativas anteriores; esse comportamento não foi revalidado nesta entrega.
- OCR, planner, QA semântico, áudio por capítulo e exportação de audiobook final continuam em trilhas próprias.

Fontes verificadas: [Piper Web](https://github.com/Mintplex-Labs/piper-tts-web/blob/main/README.md), [MODEL_CARD Faber](https://huggingface.co/rhasspy/piper-voices/blob/main/pt/pt_BR/faber/medium/MODEL_CARD).
