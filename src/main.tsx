import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

const R2_HOST = "pub-383108e3bad04ba994957fa1155847a8.r2.dev";
const IMG_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23fce7f3'/%3E%3Ctext x='50' y='66' font-size='42' text-anchor='middle'%3E%F0%9F%9B%92%3C/text%3E%3C/svg%3E";

window.addEventListener(
  "error",
  (e) => {
    const el = e.target as HTMLImageElement | null;
    if (!el || el.tagName !== "IMG") return;
    const src = el.getAttribute("src") || "";
    if (src.includes(R2_HOST) && el.dataset.imgFix !== "1") {
      el.dataset.imgFix = "1";
      let path = "";
      try {
        path = new URL(el.src).pathname;
      } catch {
        path = src.replace(/^https?:\/\/[^/]+/, "");
      }
      el.src = "/img" + path;
      return;
    }
    if (el.dataset.imgPh !== "1" && src && src !== IMG_PLACEHOLDER) {
      el.dataset.imgPh = "1";
      el.src = IMG_PLACEHOLDER;
    }
  },
  true
);

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
