/** Keep domain and storage diagnostics out of the main product flow. */
export function userError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/every source page requires approved narratable content|incomplete.page.coverage/i.test(message))
    return "Ainda há páginas sem texto aprovado. Revise todas as páginas antes de gerar o audiobook.";
  if (/literal source|LiteralScript|still matches the literal/i.test(message))
    return "O roteiro ainda repete o texto original. Reescreva cada trecho para a narração e execute o QA novamente.";
  if (/critical finding|CriticalQa|unsupported.claim|qa.*fail/i.test(message))
    return "O roteiro tem uma pendência importante. Confira os avisos do QA e corrija o texto antes de gerar áudio.";
  if (/approval|attestation|review.*invalid|unverified|review.required/i.test(message))
    return "Esta etapa ainda precisa de revisão e aprovação. Confira o texto e tente novamente.";
  if (/source.ref|concept.id|schema|invalid json|deserialize|serialize|hash|checksum|does not match|mismatch/i.test(message))
    return "Os dados salvos não conferem com o documento atual. Reabra o projeto e refaça a revisão desta etapa.";
  if (/quota|storage|indexeddb|opfs|disk full/i.test(message))
    return "Não há espaço ou acesso ao armazenamento deste navegador. Libere espaço e tente novamente.";
  if (/network|fetch|download|model/i.test(message))
    return "Não foi possível preparar os arquivos da voz. Confira a conexão e tente novamente.";
  if (/abort|cancel/i.test(message)) return "Operação cancelada.";
  if (/^(Escolha|Confira|Aprove|Revise|Corrija|Não foi possível|Ainda há|Operação cancelada)\b/u.test(message)
    && /^[\p{L}\d][^{}\[\]<>]{0,240}$/u.test(message)
    && !/\b(?:Error|Exception|WASM|OPFS|IndexedDB|approved|source|script|candidate|region|receipt|schema|hash)\b/i.test(message)) return message;
  return fallback;
}
