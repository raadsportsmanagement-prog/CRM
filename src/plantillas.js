/* ────────────────────────────────────────────────────────────
   Personalizar un mensaje para una ficha
   Las variables ({{nombre}}, {{registro}}…), el enlace personal a la app
   Catch y la plantilla de Meta lista para enviar. Lo usan la app y el
   servidor (los agentes de campañas), para que un mensaje salga igual lo
   mande quien lo mande. No toca la red ni el navegador.
   ──────────────────────────────────────────────────────────── */

import { escapeHtml } from "./integrations.js";
import { titulo } from "./fichaClaude.js";

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

/* ── Enlaces a la app Catch ──
   Todo enlace a la app que sale hacia un contacto lleva su id (ref) y de
   dónde viene (utm). Catch lo guarda al registrarse y lo devuelve en el
   evento de registro: así el CRM sabe quién se registró y desde qué envío.
   {{registro}} pone el enlace de registro ya armado. */
export const APP_CATCH = "https://app.catchrsm.com";
export const APP_REGISTRO = `${APP_CATCH}/register`;
export const RE_APP = /https:\/\/app\.catchrsm\.com[^\s"'<>)]*/g;
export const conParams = (url, params, enHtml) => {
  let u;
  try { u = new URL(url.replace(/&amp;/g, "&")); } catch (_) { return url; }
  for (const [k, v] of Object.entries(params)) if (v && !u.searchParams.has(k)) u.searchParams.set(k, v);
  const s = u.toString();
  return enHtml ? s.replace(/&/g, "&amp;") : s;
};
export const marcarEnlacesApp = (texto, params, enHtml) => String(texto || "").replace(RE_APP, (m) => {
  /* El punto o la coma que cierra la frase no son parte del enlace. */
  const [, url, cola] = m.match(/^(.*?)([.,;:!?]*)$/);
  return conParams(url, params, enHtml) + cola;
});
/* `extra` agrega de dónde sale el enlace (utm_medium, utm_campaign): las
   campañas de los agentes lo usan para saber qué envío trajo cada registro. */
export const refDe = (rec, kind, extra = {}) => ({
  ...(kind === "contact" && rec && rec.id ? { ref: rec.id } : {}),
  utm_source: "crm",
  ...extra,
});

export const applyTemplate = (text, rec, kind, enHtml, extra = {}) => {
  const p = rec.props || {};
  const map = {
    nombre: p.firstName || p.name || "",
    apellido: p.lastName || "",
    institucion: p.institution || p.name || "",
    empresa: p.name || p.institution || "",
    correo: p.email || "",
    telefono: p.phone || "",
    registro: conParams(APP_REGISTRO, refDe(rec, kind, extra), false),
  };
  const lleno = String(text || "").replace(/\{\{\s*([a-zA-ZñÑáéíóú_]+)\s*\}\}/g, (m, k) => {
    const v = map[norm(k)];
    if (v == null) return m;
    return enHtml ? escapeHtml(v) : v;
  });
  return marcarEnlacesApp(lleno, refDe(rec, kind, extra), enHtml);
};

/* Las variables que el CRM sabe llenar —las de applyTemplate—. Una plantilla
   que pida otra cosa saldría con el {{hueco}} a la vista, así que no se manda. */
export const VARS_META = ["nombre", "apellido", "institucion", "empresa", "correo", "telefono", "registro"];

/* Meta pide un ejemplo por variable para revisarla. Van inventados a
   propósito: lo que se le manda a revisión no tiene por qué llevar datos de
   personas reales. */
export const EJEMPLOS_META = {
  nombre: "Ana", apellido: "Gómez", institucion: "Club Deportivo Los Andes",
  empresa: "Club Deportivo Los Andes", correo: "ana@ejemplo.com", telefono: "3001234567",
  registro: `${APP_REGISTRO}?ref=ejemplo`,
};

export const nombreParaMeta = (txt) => String(txt || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);

/* Lo que se le pide a Meta para una ficha: cada variable con su valor, y el
   texto ya armado para el historial. Meta rechaza una variable vacía o con
   saltos de línea, así que eso se ataja aquí con un mensaje que se entienda. */
export const plantillaWaPara = (meta, rec, kind, extra = {}) => {
  const valores = meta.vars.map((v) => applyTemplate(v.valor, rec, kind, false, extra).replace(/\s+/g, " ").trim());
  const vacia = meta.vars.findIndex((_, i) => !valores[i]);
  if (vacia >= 0) {
    return { err: `La variable {{${meta.vars[vacia].clave}}} de «${meta.nombre}» queda vacía para ${titulo(kind, rec)} (${meta.vars[vacia].valor || "sin dato"}).` };
  }
  if (meta.cabecera === "IMAGE" && !meta.imagen) {
    return { err: `«${meta.nombre}» lleva una imagen en el encabezado y no está elegida. Súbela en Plantillas.` };
  }
  const porClave = new Map(meta.vars.map((v, i) => [v.clave, valores[i]]));
  return {
    imagen: meta.cabecera === "IMAGE" ? meta.imagen : "",
    plantilla: meta.nombre,
    idioma: meta.idioma,
    variables: meta.formato === "nombrado" ? Object.fromEntries(porClave) : valores,
    texto: meta.cuerpo.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (m, k) => (porClave.has(k) ? porClave.get(k) : m)),
  };
};
