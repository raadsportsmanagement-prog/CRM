import React from "react";
import { createRoot } from "react-dom/client";
import CRM from "./CRM.jsx";

/* CRM.jsx was authored for the Claude Artifacts sandbox, which supplies a
   `window.storage` key/value API. Outside that sandbox it is undefined, and the
   component's try/catch would silently drop every save. Back it with
   localStorage so data survives a reload. Same shape the component expects:
   get(key) -> { value } | null, set(key, value). */
if (!window.storage) {
  window.storage = {
    async get(key) {
      const value = localStorage.getItem(key);
      return value === null ? null : { value };
    },
    async set(key, value) {
      localStorage.setItem(key, value);
    },
    async delete(key) {
      localStorage.removeItem(key);
    },
  };
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <CRM />
  </React.StrictMode>
);
