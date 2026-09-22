# Security baseline

- Conteúdo importado é `UNTRUSTED_INPUT`; texto do documento nunca vira instrução operacional.
- Não habilitar rede, execução de comandos ou ferramentas a partir de conteúdo de PDF/LLM.
- Validar limites de tamanho, tipo MIME, hash e quota antes de persistir dados.
- Não registrar texto integral, documentos ou áudio em logs por padrão.
- Atualizações de dependências devem usar lockfiles, revisão de diff e auditoria de supply chain.
- PDF atual: máximo 32 MB, 500 páginas, 100.000 itens de texto por página, 2 milhões de caracteres por página e 20 milhões por documento, com cancelamento cooperativo entre páginas. OCR futuro deve limitar pixels, resolução, dimensões, timeout, memória e concorrência por página/região.
- Não renderizar texto importado como HTML. Não executar JavaScript, anexos, ações ou URLs incorporadas ao documento.
- Formatos compactados futuros exigem limite de expansão, validação de caminhos e bloqueio de path traversal antes da extração.
- Quota insuficiente falha explicitamente. Eviction automática considera somente caches regeneráveis fora do projeto atual; nunca remove fonte, edição humana ou artefato final.
- Checkpoints passam por schema estrito, versão e checksum antes da retomada. O checksum detecta corrupção acidental, não adulteração por código com acesso ao mesmo origin. Corrupção ou versão desconhecida gera erro/recovery report e nunca causa exclusão automática.
