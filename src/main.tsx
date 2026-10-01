import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

if (import.meta.env.DEV) {
  document.title = "[LOCAL] " + document.title;
}

window.addEventListener("vite:preloadError", () => {
  if (sessionStorage.getItem("chunk_reload") === "1") return;
  sessionStorage.setItem("chunk_reload", "1");
  window.location.reload();
});
setTimeout(() => sessionStorage.removeItem("chunk_reload"), 10000);

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
