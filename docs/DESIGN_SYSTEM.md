# Audiobook Studio: Studio & Paper

O shell organiza o trabalho por etapas: Projeto, Documento, Revisão, Narrativa, Áudio e Exportar. O documento, o roteiro e as comparações usam superfícies de leitura; navegação e controles usam a linguagem visual do estúdio.

## Tokens

`apps/web/src/styles/tokens.css` é a fonte de cores, espaçamento, raios e fontes. `shell.css` aplica esses tokens ao layout. A paleta clara usa canvas `#F3F1EB`, papel `#FBFAF6`, estúdio `#182531` e ação `#356A8A`. O modo escuro responde a `prefers-color-scheme` e mantém o papel separado do shell.

## Tipografia

Interface: Geist Sans, com fallback local Segoe UI. Leitura: Source Serif 4, com fallback Georgia. Metadados: Geist Mono, com fallback Consolas. As três famílias são empacotadas pelo Vite a partir de Fontsource, sem CDN em runtime.

## Componentes e estados

Controles mantêm altura mínima de 44 px. Status, erros e avisos usam texto e ação, além de cor. O núcleo pode emitir diagnósticos técnicos; `user_error.ts` converte as falhas do fluxo principal em instruções curtas em português. IDs, hashes e códigos ficam nos relatórios exportados.

## Layout e acessibilidade

Sidebar no desktop, barra de cinco etapas no celular e link para pular ao conteúdo. Áreas de leitura têm largura controlada. O foco é visível. `prefers-reduced-motion` desativa transições. Verificar visualmente 320, 390 e 1440 px após alterações de layout; manter o smoke literal e narrativo após mudanças nas telas.
