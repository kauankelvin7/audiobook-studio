import { hasHiddenOcrControls, visibleOcrText } from "./adapters/ocr_display_text";
import type { SavedOcrEvidence } from "./adapters/ocr_evidence_persistence";
import type { OcrComparisonReport } from "./schemas/ocr_candidate";

export function OcrComparisonView({
  evidence,
  comparison,
  cropUrl,
  pageOnly,
  nativeText,
}: {
  evidence: SavedOcrEvidence;
  comparison: OcrComparisonReport;
  cropUrl: string | null;
  pageOnly: boolean;
  nativeText: string;
}) {
  const hasHiddenControls = hasHiddenOcrControls(evidence.candidate.text) || hasHiddenOcrControls(nativeText);
  return <>
    {hasHiddenControls && <p className="notice">Caracteres invisíveis aparecem como códigos Unicode nesta comparação. Os textos originais foram preservados.</p>}
    {cropUrl && <img className="ocr-crop" src={cropUrl}
      alt={pageOnly ? `Página ${evidence.candidate.pageNumber} inteira usada no OCR` : `Recorte da página ${evidence.candidate.pageNumber} usado no OCR desta região`} />}
    <div className="ocr-columns">
      <section aria-label="Texto extraído do PDF"><h4>Texto extraído</h4>
        {pageOnly ? <p>Sem texto extraído nesta página.</p> : <pre>{visibleOcrText(nativeText)}</pre>}
      </section>
      <section aria-label="Texto candidato do OCR"><h4>Texto candidato do OCR</h4>
        <pre>{visibleOcrText(evidence.candidate.text)}</pre>
      </section>
    </div>
    <p>{pageOnly ? "Tokens OCR observados" : "Diferenças de tokens observadas"}: {comparison.differingTokenLowerBound}. Estado: revisão necessária.</p>
    {comparison.truncated && <p className="notice">A comparação foi truncada. A contagem é um limite inferior.</p>}
    {comparison.differences.length > 0 && <div className="ocr-table-wrap"><table>
      <caption>{pageOnly ? "Tokens encontrados pelo OCR nesta página sem texto extraído" : "Tokens diferentes entre texto extraído e OCR"}</caption>
      <thead><tr><th scope="col">Token</th><th scope="col">Extraído</th><th scope="col">OCR</th></tr></thead>
      <tbody>{comparison.differences.map(item => <tr key={item.token}>
        <th scope="row">{item.token}</th><td>{item.nativeCount}</td><td>{item.ocrCount}</td>
      </tr>)}</tbody>
    </table></div>}
  </>;
}
