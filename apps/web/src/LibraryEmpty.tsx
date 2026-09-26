import { StudioIcon } from "./StudioIcon";

export function LibraryEmpty() {
  return (
    <section className="library-empty" aria-labelledby="library-empty-title">
      <div className="library-empty-heading">
        <span className="library-empty-icon" aria-hidden="true"><StudioIcon name="book" size={22} /></span>
        <div>
          <h2 id="library-empty-title">Como funciona</h2>
          <p>O projeto avança em três etapas.</p>
        </div>
      </div>
      <ol className="library-empty-steps">
        <li className="library-empty-step"><span>01</span><div><strong>Abra um PDF</strong><p>Adicione o documento ao projeto.</p></div></li>
        <li className="library-empty-step"><span>02</span><div><strong>Confira o texto</strong><p>Revise o conteúdo extraído antes de seguir.</p></div></li>
        <li className="library-empty-step"><span>03</span><div><strong>Prepare o áudio</strong><p>Configure a leitura na etapa Áudio.</p></div></li>
      </ol>
    </section>
  );
}
