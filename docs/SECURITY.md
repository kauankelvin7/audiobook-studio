# Security baseline

- Conteúdo importado é `UNTRUSTED_INPUT`; texto do documento nunca vira instrução operacional.
- Não habilitar rede, execução de comandos ou ferramentas a partir de conteúdo de PDF/LLM.
- Validar limites de tamanho, tipo MIME, hash e quota antes de persistir dados.
- Não registrar texto integral, documentos ou áudio em logs por padrão.
- Atualizações de dependências devem usar lockfiles, revisão de diff e auditoria de supply chain.
