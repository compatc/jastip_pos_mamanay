import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

const root = document.getElementById("root");

if (!root) {
  document.body.innerHTML =
    '<div style="color:white;padding:20px;font-family:sans-serif"><h1>Error</h1><p>Root element not found.</p></div>';
} else {
  try {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  } catch (err: any) {
    root.innerHTML = `<div style="color:white;padding:20px;font-family:monospace;background:#1e293b;min-height:100vh"><h1>Render Error</h1><pre>${err.message}\n${err.stack}</pre></div>`;
  }
}
