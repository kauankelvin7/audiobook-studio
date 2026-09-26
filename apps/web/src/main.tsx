import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyAppearance, storedAppearance, watchAppearance } from "./appearance";
import "@fontsource/geist-sans/latin-400.css";
import "@fontsource/geist-sans/latin-500.css";
import "@fontsource/geist-sans/latin-600.css";
import "@fontsource/source-serif-4/latin-400.css";
import "@fontsource/source-serif-4/latin-600.css";
import "@fontsource/geist-mono/latin-400.css";
import "./styles/tokens.css";
import "./styles/shell.css";
import "./styles/review.css";
import "./styles/narrative.css";
import "./styles/production.css";
import "./styles/motion.css";
import "./styles/accessibility.css";
import "./styles/appearance.css";
import "./styles/studio.css";

applyAppearance(storedAppearance(), false);
watchAppearance();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
