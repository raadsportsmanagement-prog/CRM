import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/* El puerto es parte de la identidad del almacenamiento: el navegador guarda
   los datos por origen, así que localhost:5173 y localhost:5174 son cuadernos
   distintos. Sin strictPort, Vite se cambia solo de puerto cuando el 5173 está
   ocupado y el CRM abre vacío, como si se hubiera borrado todo. Con strictPort
   falla de frente y avisa, en vez de mostrar un cuaderno en blanco. */
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
});
