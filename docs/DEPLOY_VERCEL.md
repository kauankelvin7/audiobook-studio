# Deploy na Vercel

O Audiobook Studio é um aplicativo Vite estático e local-first. O deploy não exige backend para o fluxo principal.

## Configuração recomendada

O repositório contém `vercel.json` na raiz. Ao importar o repositório inteiro na Vercel, mantenha o Root Directory na raiz do repositório; a configuração executa:

- install: `npm --prefix apps/web ci`
- build: `npm --prefix apps/web run build`
- output: `apps/web/dist`
- runtime de build: Node 22.x, declarado em `apps/web/package.json`

Não é necessário adicionar rewrite de SPA porque a navegação de produto usa fragmentos de URL (`#review`, `#narrative`, etc.).

## O que roda no navegador

Após o deploy, continuam locais ao dispositivo:

- PDF.js e Worker de ingestão;
- IndexedDB;
- OPFS;
- Web Locks;
- Tesseract.js OCR;
- Rust/WASM do domínio;
- Piper/ONNX para TTS;
- geração e persistência dos WAVs.

O servidor da Vercel entrega apenas os arquivos estáticos do app.

## Primeira geração de voz

Os runtimes WASM/ONNX necessários ao Piper são publicados junto com o site em `/tts-runtime`.

O modelo `pt_BR-faber-medium` não fica dentro do bundle do deploy. A biblioteca Piper Web faz download do modelo na primeira geração e o armazena no Origin Private File System do navegador. Portanto:

- a primeira síntese exige conexão à internet;
- gerações seguintes podem reutilizar o modelo salvo naquele domínio/navegador;
- Preview e Production da Vercel têm origins diferentes e, por isso, não compartilham o mesmo OPFS.

## OCR

O build copia worker, cores WASM e idioma português para `/ocr-runtime`. O OCR não depende de CDN em runtime.

## Verificação automática do build

`npm run build` termina executando `scripts/verify-deploy-output.mjs`.

O verificador falha o build se estiver ausente qualquer um destes grupos:

- `index.html` e marca;
- runtime Piper/ONNX;
- worker/cores/idioma do Tesseract;
- bundle Rust/WASM gerado pelo Vite.

Ele também imprime o tamanho total do deploy e os maiores artefatos.

## Cabeçalhos

A configuração adiciona apenas cabeçalhos seguros para este estágio:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` sem câmera/microfone/geolocalização

Não adicionar COOP/COEP ou uma CSP restritiva sem testar o download do modelo Piper e os Workers. O produto usa recursos locais, WebAssembly, Workers e um download de modelo externo na primeira execução.

## Checklist depois do primeiro Preview

Testar no domínio Vercel, nesta ordem:

1. abrir o app e confirmar que não há erro de console;
2. importar um PDF nativo;
3. recarregar a página e confirmar recuperação local;
4. abrir Revisão e conferir Nativo/OCR/Reconciliado/Histórico;
5. gerar OCR de uma região ou página digitalizada;
6. aprovar texto;
7. gerar/revisar narrativa;
8. gerar um WAV curto;
9. gerar audiobook literal e narrativo;
10. navegar capítulos;
11. baixar WAV + manifesto;
12. recarregar e reabrir o áudio persistido;
13. testar 1440×960 e 390×844.

## Limites de interpretação

Build verde na Vercel prova que os artefatos foram produzidos e publicados. Não prova por si só:

- qualidade visual;
- qualidade auditiva;
- compatibilidade com todos os navegadores;
- fidelidade OCR em PDFs reais;
- disponibilidade futura do host externo do modelo de voz.

Esses pontos exigem teste no Preview real.
