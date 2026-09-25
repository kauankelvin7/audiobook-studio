import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "@fontsource/geist-sans/latin-400.css";
import "@fontsource/geist-sans/latin-600.css";
import "@fontsource/geist-mono/latin-400.css";
import "@fontsource/source-serif-4/latin-400.css";
import "@fontsource/source-serif-4/latin-600.css";
import "./styles/tokens.css";
import "./styles/shell.css";
import "./styles/review.css";
import "./styles/narrative.css";
import "./styles/production.css";
import "./styles/motion.css";
import "./styles/editorial.css";
import "./styles/accessibility.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
