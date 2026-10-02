import React from "react";
import { createRoot } from "react-dom/client";
import CRM from "./CRM.jsx";
import { almacenNube } from "./nube.js";

/* La versión publicada (`npm run deploy`) guarda en el servidor del CRM, y
   así el cuaderno es el mismo en cada equipo. `npm run dev` sigue guardando
   en este navegador, para probar sin tocar los datos de verdad. */
if (!window.storage && import.meta.env.VITE_NUBE === "1") {
  window.storage = almacenNube();
}

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
    /* set y delete no son `async` a propósito: localStorage escribe en el acto,
       y así un fallo —quedarse sin espacio, sobre todo— se conoce en el mismo
       instante del intento. Envueltos en async el error llegaría un turno
       después, cuando la pestaña que se está cerrando ya no puede avisar. */
    set(key, value) {
      localStorage.setItem(key, value);
    },
    delete(key) {
      localStorage.removeItem(key);
    },
  };
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <CRM />
  </React.StrictMode>
);
