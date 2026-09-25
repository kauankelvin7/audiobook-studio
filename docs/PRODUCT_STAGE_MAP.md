# Audiobook Studio — mapa de funcionalidades por etapa

Este mapa descreve ações existentes no produto, seus dados reais e a etapa responsável. A navegação usa as mesmas seis etapas da interface. A geração de áudio continua no pipeline único validado.

| Etapa | Função real | Entrada | Saída / condição para avançar |
| --- | --- | --- | --- |
| Projeto | Importar ou substituir PDF; manter o projeto neste dispositivo | PDF até 32 MB | `DocumentIR` e `DocumentIR v2`, hash da fonte e persistência local |
| Documento | Navegar páginas e ler o texto extraído | `DocumentIR` | Identificar página e trecho que exigem conferência; nenhuma aprovação ocorre aqui |
| Revisão | Comparar OCR e texto nativo; salvar e reabrir decisões; aprovar correção OCR; aprovar texto nativo | `DocumentIR v2`, PDF salvo e evidências OCR | Texto canônico aprovado, provenance e revisão registrada |
| Revisão | Aprender com correções locais e atualizar/apagar memória de ambiguidades | Correções humanas salvas | Sugestões locais para revisões futuras; não altera texto aprovado automaticamente |
| Narrativa | Gerar modelo de conteúdo, outline, plano e roteiro a partir do texto canônico; editar trechos; executar QA; aprovar roteiro | Texto canônico aprovado | Roteiro aprovado, referências de fonte, QA e SpeechUnits |
| Áudio | Preparar leitura literal de páginas, usar voz local, gerar WAV curto; gerar audiobook completo literal ou narrativo; ouvir e navegar capítulos; reabrir gravações | Texto aprovado ou SpeechUnits aprovados | WAV persistido e player com capítulos |
| Exportar | Baixar WAV completo e manifesto de capítulos, hashes e modo | Audiobook completo gerado | Arquivos entregues ao usuário |

## Regras de passagem

1. OCR produz candidato e evidência. Só uma decisão humana aprovada promove o texto corrigido para a camada canônica.
2. Aprovar texto nativo também pertence a Revisão. Um PDF com páginas sem texto aprovado continua bloqueado.
3. Narrativa consome apenas conteúdo canônico permitido. QA com finding crítico impede a aprovação e a geração narrativa.
4. Áudio usa o TTS, a persistência, os capítulos e o player existentes nos dois modos. Exportar disponibiliza somente artefatos gerados.

## Estado da interface

Os controles foram associados às etapas acima em `src/main.tsx`, `src/OcrReviewPanel.tsx`, `src/NativeTextApprovalPanel.tsx` e `src/NarrativePanel.tsx`. O histórico de gravações está em Áudio e os downloads do audiobook completo estão em Exportar. A leitura literal de páginas e seu WAV curto continuam juntos em Áudio. O download de um WAV curto permanece junto da gravação selecionada no histórico, pois é uma ação sobre esse item específico.

## Próxima verificação de produto

Conferir o percurso com um documento longo que tenha texto nativo, páginas digitalizadas, tabelas e código. O mapa não presume que todo PDF possa ser aprovado ou narrado automaticamente.
