import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/tokens.css";

function App() {
  return <main className="shell"><h1>Audiobook Studio</h1><p>Local-first workspace inicializado.</p><p>Próximo marco: DocumentIR e domínio Rust.</p></main>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
