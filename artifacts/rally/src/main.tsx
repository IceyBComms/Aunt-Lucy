import { createRoot } from "react-dom/client";
import App from "./App";
// Self-hosted fonts (bundled with the app) so no visitor's browser ever calls
// Google Fonts. The variable packages carry the exact families/weights the site
// used from Google — Lora 400–700 and Plus Jakarta Sans 200–800, each with
// italics — so pages render identically. See --font-serif/--font-sans in index.css.
import "@fontsource-variable/lora/index.css";
import "@fontsource-variable/lora/wght-italic.css";
import "@fontsource-variable/plus-jakarta-sans/index.css";
import "@fontsource-variable/plus-jakarta-sans/wght-italic.css";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
