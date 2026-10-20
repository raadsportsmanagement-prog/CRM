/* ────────────────────────────────────────────────────────────
   Filtros por propiedad
   Los mismos en la app (vistas, listas activas, masivos, agentes) y en el
   servidor (nube/operacion.js decide con ellos qué agente atiende cada
   conversación). No toca la red ni el navegador.
   ──────────────────────────────────────────────────────────── */

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

/* ── Filtros por propiedad ──
   A quién le llega un masivo se decide por lo que dice la ficha: "Tipo es
   Acudiente", "Institución contiene San José", "creados en los últimos 30
   días". Todas las condiciones deben cumplirse a la vez; para decir "esto o
   aquello" en una lista se marcan varios valores en la misma condición. Una
   condición a medio llenar no filtra: mientras se escribe, la lista no se
   vacía de golpe. */
export const VACIO_OPS = [["lleno", "tiene valor"], ["vacio", "está vacío"]];
export const OPS_FILTRO = {
  select: [["en", "es"], ["noen", "no es"], ...VACIO_OPS],
  numero: [["igual", "es igual a"], ["min", "es al menos"], ["max", "es como máximo"], ...VACIO_OPS],
  fecha: [["ultimos", "en los últimos… días"], ["desde", "desde el día"], ["hasta", "hasta el día"], ...VACIO_OPS],
  texto: [["contiene", "contiene"], ["nocontiene", "no contiene"], ["igual", "es exactamente"], ...VACIO_OPS],
};
export const grupoFiltro = (f) => (f.type === "select" ? "select" : f.type === "number" ? "numero"
  : f.type === "date" || f.type === "datetime" ? "fecha" : "texto");
export const estaVacio = (v) => v === undefined || v === null || String(v).trim() === "";

/* Una fecha se compara por día en la hora local: una ficha creada a las 9 de
   la noche del 5 sigue siendo del 5 aunque en UTC ya sea el 6. */
export const diaLocal = (v) => {
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d)) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function cumpleFiltro(r, c, f) {
  if (!f) return true;
  const v = r.props[c.key];
  if (c.op === "lleno") return !estaVacio(v);
  if (c.op === "vacio") return estaVacio(v);
  const grupo = grupoFiltro(f);
  if (grupo === "select") {
    const vals = c.values || [];
    if (!vals.length) return true;
    const esta = vals.includes(estaVacio(v) ? "" : String(v));
    return c.op === "noen" ? !esta : esta;
  }
  const q = String(c.value ?? "").trim();
  if (!q) return true;
  if (grupo === "numero") {
    const n = Number(v), m = Number(q);
    if (isNaN(m)) return true;
    if (estaVacio(v) || isNaN(n)) return false;
    return c.op === "min" ? n >= m : c.op === "max" ? n <= m : n === m;
  }
  if (grupo === "fecha") {
    if (estaVacio(v)) return false;
    if (c.op === "ultimos") {
      const dias = Number(q);
      if (isNaN(dias)) return true;
      const t = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? `${v}T00:00` : v).getTime();
      return !isNaN(t) && Date.now() - t <= dias * 86400000;
    }
    const dia = diaLocal(v);
    if (!dia) return false;
    return c.op === "desde" ? dia >= q : dia <= q;
  }
  const hay = norm(v), aguja = norm(q);
  if (c.op === "igual") return hay === aguja;
  if (c.op === "nocontiene") return !hay.includes(aguja);
  return hay.includes(aguja);
}

export const cumpleFiltros = (r, filtros, schema) =>
  filtros.every((c) => cumpleFiltro(r, c, schema.find((f) => f.key === c.key)));
