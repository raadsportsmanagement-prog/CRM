/* ────────────────────────────────────────────────────────────
   Los agentes de operación: contenido, campañas y seguimiento
   Lo que comparten la app (para configurarlos y ver qué hacen) y el servidor
   (nube/marketing.js, que los hace trabajar):

     · Contenido — cada mañana, después de Tendencias, elige la noticia mejor
       calificada por JEV, escribe el WhatsApp y el correo con el enlace
       personal de registro y manda la plantilla a aprobación de Meta.
     · Campañas — cuando Meta la aprueba, la envía a los leads que todavía
       no se registran en Catch, en tandas y en horario de día.
     · Seguimiento — a quien recibió una campaña hace unos días y sigue sin
       registrarse, una plantilla fija que lo invita a conversar; si
       contesta, lo atiende el agente de texto (Luna).

   Nada de esto le escribe a quien ya se registró, es cliente, pidió la baja,
   está en manos de una persona o ya recibió `topeSemanal` mensajes de
   marketing en los últimos 7 días. No toca la red ni el navegador.
   ──────────────────────────────────────────────────────────── */

import { HUMANO, claveConv } from "./agentes.js";

const arr = (x) => (Array.isArray(x) ? x : []);
const txt = (x) => String(x == null ? "" : x);
const num = (x, min, max, def) => Math.min(max, Math.max(min, Math.round(Number(x)) || def));
const DIA_MS = 24 * 3600 * 1000;

/* Salen apagados: se encienden en Mensajes → Agentes, una vez configurado el
   envío (Meta, SES). */
export const MARKETING_BASE = {
  contenido: { activo: false, minimoJev: 70 },
  seguimiento: { activo: false, dias: 3 },
  topeSemanal: 2,
  /* Hora de Bogotá en que se puede escribir: nadie quiere una campaña a las
     11 de la noche. */
  horario: { desde: 8, hasta: 20 },
};

const plantillaGuardada = (p) => (p && typeof p === "object" && p.nombre ? {
  id: txt(p.id), nombre: txt(p.nombre), idioma: txt(p.idioma) || "es",
  estado: txt(p.estado) || "PENDING", rechazo: txt(p.rechazo),
  cuerpo: txt(p.cuerpo), vars: arr(p.vars).map(txt), formato: p.formato === "posicional" ? "posicional" : "nombrado",
} : null);

export function normalizaMarketing(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  const c = d.contenido || {}, s = d.seguimiento || {}, h = d.horario || {};
  return {
    contenido: {
      activo: Boolean(c.activo),
      minimoJev: num(c.minimoJev, 0, 100, MARKETING_BASE.contenido.minimoJev),
    },
    seguimiento: {
      activo: Boolean(s.activo),
      dias: num(s.dias, 1, 30, MARKETING_BASE.seguimiento.dias),
      plantilla: plantillaGuardada(s.plantilla),
    },
    topeSemanal: num(d.topeSemanal, 1, 14, MARKETING_BASE.topeSemanal),
    horario: { desde: num(h.desde, 0, 23, 8), hasta: num(h.hasta, 1, 24, 20) },
    /* Hasta dónde se leyeron las bajas del puente (hora del puente, en ms). */
    bajasAl: txt(d.bajasAl),
  };
}

/* ── Campañas ──
     revision   — la plantilla espera la aprobación de Meta
     enviando   — aprobada: sale en tandas a la cola de destinatarios
     enviada    — terminó
     rechazada  — Meta no la aprobó
     detenida   — una persona la paró
     fallo      — no se pudo preparar */
export const ESTADOS_CAMPANA = ["revision", "enviando", "enviada", "rechazada", "detenida", "fallo"];
export const MAX_CAMPANAS = 60;

export function normalizeCampanas(raw) {
  return arr(raw)
    .filter((x) => x && typeof x === "object" && x.id && ESTADOS_CAMPANA.includes(x.estado))
    .map((x) => ({
      ...x,
      cola: arr(x.cola).map(txt),
      enviados: { wa: Number((x.enviados || {}).wa) || 0, correo: Number((x.enviados || {}).correo) || 0, omitidos: Number((x.enviados || {}).omitidos) || 0 },
      wa: { texto: txt((x.wa || {}).texto), plantilla: plantillaGuardada((x.wa || {}).plantilla) },
      correo: { asunto: txt((x.correo || {}).asunto), texto: txt((x.correo || {}).texto) },
    }))
    .slice(0, MAX_CAMPANAS);
}

/* ── A quién se le puede escribir ── */

const REGISTRADO = ["Registrado", "Perfil completo", "Activo"];

/* Por contacto, los mensajes de marketing que recibió: cada campaña y cada
   seguimiento cuentan una vez, aunque hayan salido por los dos canales. */
export function indiceMarketing(db) {
  const idx = new Map();
  for (const a of arr(db.activities)) {
    if (!a.campanaId || a.dir !== "out") continue;
    for (const id of arr(a.contactIds)) {
      if (!idx.has(id)) idx.set(id, []);
      idx.get(id).push(a);
    }
  }
  return idx;
}

export function toquesRecientes(idx, id, ahora = Date.now()) {
  const vistos = new Set();
  for (const a of idx.get(id) || []) {
    if (ahora - Date.parse(a.at) < 7 * DIA_MS) vistos.add(`${a.campanaId}|${a.seguimiento ? "s" : "c"}`);
  }
  return vistos.size;
}

/* El motivo por el que no se le escribe, o "" si se puede. */
export function porQueNo(db, rec, idx, mk, ahora = Date.now()) {
  const p = (rec && rec.props) || {};
  if (REGISTRADO.includes(p.appEstado)) return "ya se registró en Catch";
  if (p.type === "Cliente") return "ya es cliente";
  if (p.leadStatus === "Descalificado") return "está descalificado";
  if ((db.agentesChat || {})[claveConv("contact", rec.id)] === HUMANO) return "lo atiende una persona";
  if (toquesRecientes(idx, rec.id, ahora) >= mk.topeSemanal) return `ya recibió ${mk.topeSemanal} mensajes de marketing esta semana`;
  return "";
}

export const correoUtil = (rec) => {
  const p = (rec && rec.props) || {};
  const e = String(p.email || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && !["Dado de baja", "Rebotado"].includes(p.emailStatus) ? e : "";
};

/* Los contactos a los que saldría una campaña hoy. */
export function audienciaDe(db, mk, ahora = Date.now()) {
  const idx = indiceMarketing(db);
  return arr(db.contacts).filter((r) => !porQueNo(db, r, idx, mk, ahora) && (r.props.phone || correoUtil(r)));
}

/* Hora de Bogotá (UTC-5, sin horario de verano). */
export const horaBogota = (ahora = Date.now()) => new Date(ahora - 5 * 3600 * 1000).getUTCHours();
export const fechaBogota = (ahora = Date.now()) => new Date(ahora - 5 * 3600 * 1000).toISOString().slice(0, 10);
export const enHorario = (mk, ahora = Date.now()) => {
  const h = horaBogota(ahora);
  return h >= mk.horario.desde && h < mk.horario.hasta;
};
