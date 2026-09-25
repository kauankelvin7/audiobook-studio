import type { OcrCorrectionSuggestionReport } from "./schemas/ocr_learning";

export function OcrLearningPanel({
  suggestion,
  learningCount,
  modelRecordCount,
  learningIssue,
  trainingModel,
  clearingLearning,
  disabled,
  onUseSuggestion,
  onTrain,
  onClear,
}: {
  suggestion: OcrCorrectionSuggestionReport | null;
  learningCount: number;
  modelRecordCount: number | null;
  learningIssue: string;
  trainingModel: boolean;
  clearingLearning: boolean;
  disabled: boolean;
  onUseSuggestion: (text: string) => void;
  onTrain: () => void;
  onClear: () => void;
}) {
  return <>
    {suggestion && suggestion.suggestions.length > 0 && <section className="notice" aria-labelledby="ocr-learning-title">
      <h4 id="ocr-learning-title">Sugestões da memória local</h4>
      <p>Estas trocas vieram de pelo menos três correções salvas neste dispositivo. Confira o recorte antes de usar.</p>
      <ul>{suggestion.suggestions.map(item => <li key={item.observedToken}>
        <code>{item.observedToken}</code> para <code>{item.suggestedToken}</code> ({item.evidenceCount} revisões)
      </li>)}</ul>
      <button type="button" disabled={disabled} onClick={() => onUseSuggestion(suggestion.suggestedText)}>
        Usar texto sugerido na revisão
      </button>
    </section>}

    {(learningCount > 0 || learningIssue) && <section className="footnote" aria-labelledby="ocr-learning-memory-title">
      <h4 id="ocr-learning-memory-title">Memória de ambiguidades</h4>
      {learningIssue ? <p role="alert">A memória local precisa de atenção: {learningIssue}</p>
        : <p>{learningCount} {learningCount === 1 ? "correção local salva" : "correções locais salvas"}. {modelRecordCount === null ? "Atualize o modelo para usá-las." : `O modelo atual usa ${modelRecordCount} evidências.`}</p>}
      <button type="button" disabled={trainingModel || learningCount === 0 || disabled} onClick={onTrain}>
        {trainingModel ? "Atualizando modelo…" : "Atualizar modelo local"}
      </button>
      <button type="button" disabled={clearingLearning || disabled} onClick={onClear}>
        {clearingLearning ? "Apagando memória…" : "Apagar memória local"}
      </button>
    </section>}
  </>;
}
