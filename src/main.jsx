import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "../styles.css";

const container = document.getElementById("root");
const tree = (
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);

/* Prerendered pages arrive with markup in place, so hydrate those. */
if (container.hasChildNodes()) hydrateRoot(container, tree);
else createRoot(container).render(tree);
