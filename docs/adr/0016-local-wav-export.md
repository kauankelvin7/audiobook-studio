# ADR 0016 — Exportação WAV da leitura literal

Status: accepted (síntese real validada; reprodução auditiva pendente)

## Contexto

A leitura nativa do ADR 0015 toca por Web Speech, que não entrega os bytes de áudio. O usuário precisa salvar e reproduzir a leitura após fechar o app, sem esperar o planner narrativo. O pacote `@mintplex-labs/piper-tts-web` 1.0.5 produz Blob WAV localmente com ONNX Runtime Web. A voz `pt_BR-faber-medium` consta no catálogo do pacote e seu MODEL_CARD registra dataset CC0; o repositório da voz está sob MIT. O modelo pesa 63.201.294 bytes.

## Decisão

Manter a sessão literal validada pelo Rust/WASM como única origem de texto. Após confirmação humana, o adapter Web concatena todos os trechos na ordem da sessão, limita a geração a 12.000 caracteres, chama Piper em Web Worker e aceita somente WAV PCM mono 16-bit 22.050 Hz com RIFF/data e tamanho íntegros. Um erro cancela o arquivo inteiro. Importar outro PDF, trocar intervalo ou retirar confirmação cancela o Worker e revoga o objeto de áudio. O arquivo pronto fica disponível para reprodução e download; não se afirma persistência automática do WAV no projeto.

O runtime WASM/fonemizador/ONNX é copiado das dependências pinadas para assets de mesma origem no build. O modelo de voz é baixado sob comando explícito do usuário pelo pacote Piper e fica em OPFS. Após validar o WAV, o app o salva no OPFS como `audio_chunk` fixado, junto com metadata de fonte, intervalo, voz e hash da sessão. O IndexedDB publica os dois manifests e um novo checkpoint somente após escrita e verificação dos blobs. Na recuperação, o app reconstrói a sessão via Rust/WASM e compara o hash antes de exibir o WAV. Áudio literal não recebe `final_audio` nem QA `pass`. Não há upload do texto para serviço de TTS nem backend obrigatório.

## Limites e riscos

- O pacote controla o download/cache do modelo e não expõe verificação SHA-256 do peso baixado na fronteira do app. Há dependência da disponibilidade do host do modelo. Não incluir conteúdo privado no callback de progresso/erros.
- O limite de 12.000 caracteres e 80 MB WAV evita geração desmedida, mas memória, quota e desempenho reais variam por dispositivo. O Worker pode ser cancelado, porém a inferência não é retomável.
- Cada nova gravação ganha chave imutável. O checkpoint atual referencia só a mais recente; gravações antigas permanecem no armazenamento até política explícita de limpeza. Quota cheia mantém o WAV em memória para download, sem afirmar persistência.
- A validação de cabeçalho WAV não prova que todas as palavras foram pronunciadas, nem qualidade perceptual. Teste auditivo e matriz de navegadores continuam necessários antes de chamar o recurso de produção.
- Duas sínteses reais em navegador integrado produziram WAV reconhecido pelo elemento de áudio (105,53 s e 3,15 s). A aba caiu ao acionar reprodução nativa nas duas tentativas. O evento não isola se a causa é o navegador integrado, o decodificador ou o app; reprodução externa segue pendente.
- OCR, planner, QA semântico, áudio por capítulo e exportação de audiobook final continuam em trilhas próprias.

Fontes verificadas: [Piper Web](https://github.com/Mintplex-Labs/piper-tts-web/blob/main/README.md), [MODEL_CARD Faber](https://huggingface.co/rhasspy/piper-voices/blob/main/pt/pt_BR/faber/medium/MODEL_CARD).
