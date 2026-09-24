# Product UX baseline — 2026-09-24

Estado antes do redesign: beta funcional. O smoke do mesmo PDF passou nos modos literal e narrativo, com player, dois capítulos, download e reload. O smoke OCR confirmou que uma página sem conteúdo aprovado bloqueia a exportação narrativa completa. Rust: 49 testes. Web: 157 testes, typecheck e build. Esses resultados pertencem ao checkpoint funcional anterior; os testes desta fase são registrados separadamente.

## Auditoria curta

- **Interface atual:** uma tela React, seções contínuas e um arquivo CSS. OCR e roteiro já são componentes separados.
- **Reuso:** importação, revisão, roteiro, player, capítulos, downloads, persistência e smokes existentes.
- **Ajuste:** tokens, shell responsivo, estados vazios, textos de erro e hierarquia visual.
- **Ausências observadas:** navegação por etapas, fontes empacotadas, tratamento uniforme de erros, foco visual testado e teste de overflow.
- **Riscos:** regressão dos seletores do smoke, textos técnicos vindos do núcleo e perda de acesso ao player no celular.

Foco atual: Product UX. Release hardening continua com composição OCR de várias páginas, QA semântico, atestação granular, corpus real, documentos complexos, testes em outros navegadores, CI, retenção de WAV e paráfrase assistida.

## Entrega visual validada

- Shell Studio com menu escuro, estado ativo e navegação móvel; área Paper com visor, páginas reais e painel de revisão sincronizado.
- Fontes locais Geist Sans, Geist Mono e Source Serif 4; tokens de cor, tipo, espaço e raio em `apps/web/src/styles/tokens.css`.
- Estados vazios e mensagens de erro em português com ação sugerida. Nenhum dado de capítulos, andamento ou duração foi inventado na interface.
- Layout verificado com o PDF de fixture em 320, 360, 390, 768, 1280, 1440 e 1920 px, sem overflow horizontal.
- Verificações finais: 160 testes web passaram (2 ignorados), typecheck e build passaram; smoke OCR de revisão/aprovação/reload passou; E2E do mesmo PDF gerou WAV literal e narrativo, com capítulos e reload.

O PDF de fixture contém uma página curta e outra sem texto, portanto a captura visual não reproduz a densidade de um manual com centenas de páginas. A interface mantém os controles reais de revisão e exportação; o acabamento dos estados densos precisa de avaliação com corpus maior.
