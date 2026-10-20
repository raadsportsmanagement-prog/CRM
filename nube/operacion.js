/* ────────────────────────────────────────────────────────────
   La operación: los agentes trabajando en el servidor
   Hasta aquí un agente sólo hablaba cuando alguien abría la conversación y le
   pedía una propuesta. Esto lo pone a trabajar con el CRM cerrado:

     1. El puente recibe un WhatsApp (webhook de Meta o Twilio) y lo pasa aquí
        por el service binding (Puerta.mensajesWhatsApp en worker.js).
     2. El mensaje entra al cuaderno como en la app: se pega a la ficha con
        ese teléfono, o se crea el contacto si nadie lo tiene.
     3. La conversación espera unos segundos en la fila del Operador, por si
        la persona manda tres mensajes seguidos: se contesta una vez, al
        último.
     4. El agente que le toca (el mismo de Agentes → Atención) redacta.
     5. Según su modo, la respuesta queda en Supervisión esperando a una
        persona, o sale sola por el puente. Si el agente pide una persona, la
        conversación queda en manos de una persona y deja de contestar ahí.

   Todo lo que hace un agente queda en `supervision`, y cada escritura en el
   cuaderno va firmada con su nombre. Lo que manda la persona está en
   `operacion` (pausar a todos, el tope de mensajes automáticos) y en cada
   agente (encendido, modo, instrucciones, condiciones).
   ──────────────────────────────────────────────────────────── */

import { DurableObject } from "cloudflare:workers";
import { z } from "zod";
import { cambiarDb, leerDb } from "./mcp.js";
import { redactarComoAgente } from "./claude.js";
import { pedirPuente } from "./puente.js";
import { normalizeIntegrations, toE164 } from "../src/integrations.js";
import { partirNombre } from "../src/anuncios.js";
import { HUMANO, MAX_SUPERVISION, agenteDe, claveConv, normalizaOperacion, normalizeSupervision } from "../src/agentes.js";
import { fichaDe, titulo } from "../src/fichaClaude.js";

const uid = () => Math.random().toString(36).slice(2, 10);
const nowISO = () => new Date().toISOString();
const arr = (x) => (Array.isArray(x) ? x : []);

/* Cuánto espera una conversación antes de que el agente conteste: lo que
   tarda alguien en mandar el segundo mensaje de una ráfaga. */
const ESPERA_MS = 8_000;
const DIA_MS = 24 * 3600 * 1000;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

/* ── 1 y 2. Recibir ── */

const Mensaje = z.object({
  ext: z.string().min(1).max(200),
  de: z.string().min(5).max(30),
  nombre: z.string().max(200).default(""),
  at: z.string().max(40),
  tipo: z.string().max(40).default("text"),
  texto: z.string().max(4000).default(""),
});
const LoteWhatsApp = z.array(z.unknown()).max(500);

/* La misma regla de la app (importarWhatsApp en CRM.jsx): se busca la ficha
   por teléfono normalizado entre contactos y empresas; si nadie lo tiene, se
   crea un contacto. El `ext` de Meta evita que un mensaje entre dos veces,
   también si la pestaña lo trae después del puente. */
export function importarWhatsApp(db, mensajes) {
  const vistos = new Set(arr(db.activities).map((a) => a.ext).filter(Boolean));
  const entran = mensajes.filter((m) => !vistos.has(m.ext));
  if (!entran.length) return { db, conversaciones: [], fichas: 0 };

  const cc = normalizeIntegrations(db.integrations).whatsapp.countryCode;
  const porTel = new Map();
  for (const [kind, col] of [["contact", "contacts"], ["company", "companies"]]) {
    arr(db[col]).forEach((r) => {
      const t = toE164(r.props && r.props.phone, cc);
      if (t && !porTel.has(t)) porTel.set(t, { kind, id: r.id });
    });
  }

  const fichas = [], acts = [];
  const ultimo = new Map();
  for (const m of entran) {
    const tel = String(m.de).replace(/\D/g, "");
    let f = porTel.get(tel);
    if (!f) {
      const { nombre, apellido } = partirNombre({ nombre_completo: m.nombre || "" });
      const id = uid();
      fichas.push({
        id,
        props: {
          firstName: nombre || `+${tel}`, lastName: apellido, phone: `+${tel}`,
          leadSource: "WhatsApp", leadStatus: "Nuevo", createdAt: m.at, lastActivityAt: m.at,
        },
      });
      f = { kind: "contact", id };
      porTel.set(tel, f);
    }
    acts.push({
      id: uid(), ext: m.ext, type: "whatsapp", dir: "in", at: m.at,
      subject: "Mensaje de WhatsApp", body: m.texto || "", via: "servidor",
      contactIds: f.kind === "contact" ? [f.id] : [],
      companyIds: f.kind === "company" ? [f.id] : [],
    });
    const clave = claveConv(f.kind, f.id);
    const u = ultimo.get(clave);
    if (!u || u.at <= m.at) ultimo.set(clave, { clave, ext: m.ext, at: m.at });
  }

  /* La última actividad sólo avanza: un mensaje que llega tarde no hace
     retroceder la fecha que ya mostraba la ficha. */
  const sellar = (lista) => lista.map((r) => {
    const at = acts.filter((a) => a.contactIds.includes(r.id) || a.companyIds.includes(r.id))
      .reduce((max, a) => (a.at > max ? a.at : max), "");
    if (!at || (r.props.lastActivityAt && r.props.lastActivityAt >= at)) return r;
    return { ...r, props: { ...r.props, lastActivityAt: at } };
  });

  return {
    db: {
      ...db,
      contacts: sellar([...fichas, ...arr(db.contacts)]),
      companies: sellar(arr(db.companies)),
      activities: [...acts, ...arr(db.activities)].sort((a, b) => (a.at < b.at ? 1 : -1)),
    },
    conversaciones: [...ultimo.values()],
    fichas: fichas.length,
  };
}

export async function recibirWhatsApp(env, cuaderno, cuerpo) {
  const lote = LoteWhatsApp.safeParse(cuerpo);
  if (!lote.success) return { ok: false, error: "Se esperaba una lista de mensajes." };
  const mensajes = lote.data.map((m) => Mensaje.safeParse(m)).filter((r) => r.success).map((r) => r.data);
  if (!mensajes.length) return { ok: true, nuevos: 0 };

  let res = { conversaciones: [], fichas: 0 };
  await cambiarDb(cuaderno, "whatsapp", (db) => {
    res = importarWhatsApp(db, mensajes);
    return { db: res.db };
  }, "WhatsApp");

  if (res.conversaciones.length) {
    await env.OPERADOR.getByName("principal").encolar(res.conversaciones.map(({ clave, ext }) => ({ clave, ext })));
  }
  return { ok: true, nuevos: res.conversaciones.length, fichas: res.fichas };
}

/* ── 3. La fila ──
   Un solo Operador para todo el CRM. Guarda qué conversaciones esperan
   respuesta y se despierta con una alarma; si una conversación recibe otro
   mensaje mientras espera, se reinicia su espera y se contesta al último. Las
   alarmas sobreviven a un reinicio del servidor: lo que entró no se olvida. */
export class Operador extends DurableObject {
  async encolar(items) {
    const ahora = Date.now();
    for (const it of items) await this.ctx.storage.put(`c:${it.clave}`, { ext: it.ext, at: ahora });
    if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(ahora + ESPERA_MS);
  }

  async alarm() {
    const cuaderno = this.env.CUADERNO.getByName("principal");
    const cola = await this.ctx.storage.list({ prefix: "c:" });
    let proxima = Infinity;
    for (const [k, v] of cola) {
      if (Date.now() - v.at < ESPERA_MS) { proxima = Math.min(proxima, v.at + ESPERA_MS); continue; }
      await this.ctx.storage.delete(k);
      try {
        await atenderConversacion(this.env, cuaderno, k.slice(2), v.ext);
      } catch (e) {
        console.log("El agente no pudo atender", k, (e && e.message) || e);
        await anotarFallo(cuaderno, k.slice(2), v.ext, (e && e.message) || String(e)).catch(() => {});
      }
    }
    if (Number.isFinite(proxima)) await this.ctx.storage.setAlarm(proxima);
  }
}

/* ── 4 y 5. Atender ── */

const ES_MENSAJE = (a) => a.type === "whatsapp" || a.type === "email" || a.type === "app";
const tocaA = (a, kind, id) => (kind === "contact" ? a.contactIds || [] : a.companyIds || []).includes(id);

function ultimoMensaje(db, kind, id) {
  let u = null;
  for (const a of arr(db.activities)) if (ES_MENSAJE(a) && tocaA(a, kind, id) && (!u || a.at > u.at)) u = a;
  return u;
}

/* El WhatsApp recibido `ext`, si sigue sin respuesta: nada recibido después
   y nada enviado desde entonces. WhatsApp da la hora en segundos, así que
   los mensajes de una misma ráfaga empatan; un empate no cuenta como
   "después". */
function sinContestar(db, kind, id, ext) {
  const msgs = arr(db.activities).filter((a) => ES_MENSAJE(a) && tocaA(a, kind, id));
  const t = msgs.find((a) => a.ext === ext);
  if (!t || t.dir !== "in" || t.type !== "whatsapp") return null;
  const siguio = msgs.some((a) => a !== t && (a.at > t.at || (a.dir === "out" && a.at >= t.at)));
  return siguio ? null : t;
}

function buscar(db, clave) {
  const i = clave.indexOf(":");
  const kind = clave.slice(0, i), id = clave.slice(i + 1);
  const col = kind === "contact" ? "contacts" : kind === "company" ? "companies" : "";
  const rec = col && arr(db[col]).find((r) => r.id === id);
  return rec ? { kind, id, rec } : null;
}

const enviadosSolos = (db, clave) => arr(db.supervision).filter((x) =>
  x.clave === clave && x.modo === "automatico" && x.estado === "enviado" && Date.now() - Date.parse(x.at) < DIA_MS).length;

/* Una entrada nueva en Supervisión. Lo pendiente de la misma conversación
   queda reemplazado: contestaba a algo que ya no es lo último. */
function conEntrada(db, item) {
  const sup = normalizeSupervision(db.supervision).map((x) =>
    (x.clave === item.clave && x.estado === "pendiente" ? { ...x, estado: "reemplazado", resueltoAt: item.at } : x));
  return [item, ...sup].slice(0, MAX_SUPERVISION);
}

async function anotarFallo(cuaderno, clave, ext, error) {
  await cambiarDb(cuaderno, "operacion", (db) => {
    const f = buscar(db, clave);
    if (!f) return { error: "sin ficha" };
    const item = {
      id: uid(), at: nowISO(), clave, kind: f.kind, recId: f.id, nombre: titulo(f.kind, f.rec),
      agenteId: "", agente: "", modo: "", canal: "whatsapp", responde: ext,
      texto: "", motivo: "", estado: "fallo", error: String(error).slice(0, 500),
    };
    return { db: { ...db, supervision: conEntrada(db, item) } };
  }, "Operación");
}

export async function atenderConversacion(env, cuaderno, clave, ext) {
  const { db } = await leerDb(cuaderno);
  if (!db) return;
  if (normalizaOperacion(db.operacion).pausada) return;
  const f = buscar(db, clave);
  if (!f) return;

  /* Sólo si ese WhatsApp sigue sin respuesta: si alguien ya contestó, o
     llegó otro mensaje, no hay nada que hacer. */
  const u = sinContestar(db, f.kind, f.id, ext);
  if (!u) return;

  const quien = agenteDe(db, f.kind, f.rec);
  if (!quien.agente || !quien.agente.activo) return;
  const agente = quien.agente;
  const nombreAgente = agente.nombre.trim() || "Agente sin nombre";

  const r = await redactarComoAgente(env, agente, fichaDe(db, f.kind, f.rec));

  const op = normalizaOperacion(db.operacion);
  const quiereSolo = agente.modo === "automatico" && !r.traspaso;
  const enTope = quiereSolo && enviadosSolos(db, clave) >= op.topeAutomatico;
  const solo = quiereSolo && !enTope;

  const item = {
    id: uid(), at: nowISO(), clave, kind: f.kind, recId: f.id, nombre: titulo(f.kind, f.rec),
    agenteId: agente.id, agente: nombreAgente, modo: solo ? "automatico" : "sugerir",
    canal: "whatsapp", responde: ext, recibido: String(u.body || "").slice(0, 500),
    texto: r.texto,
    motivo: r.traspaso || (enTope ? `Llegó al tope de ${op.topeAutomatico} mensajes automáticos en 24 horas: espera tu aprobación.` : ""),
    estado: r.traspaso ? "traspaso" : solo ? "enviando" : "pendiente",
  };

  const res = await cambiarDb(cuaderno, "operacion", (db2) => {
    /* Claude tardó unos segundos: puede que entre medias alguien haya
       contestado o que haya entrado otro mensaje. */
    if (!sinContestar(db2, f.kind, f.id, ext)) return { error: "la conversación siguió" };
    return {
      db: {
        ...db2,
        supervision: conEntrada(db2, item),
        ...(r.traspaso ? { agentesChat: { ...(db2.agentesChat || {}), [clave]: HUMANO } } : {}),
      },
    };
  }, `${nombreAgente} (agente)`);
  if (res.error) return;

  if (solo) await enviarPropuesta(env, cuaderno, item.id, { firma: `${nombreAgente} (agente)`, yaBloqueada: true });
}

/* ── Enviar ──
   Un solo camino para lo que sale solo y lo que aprueba una persona: así un
   mensaje aprobado y uno automático quedan registrados igual. Primero se
   marca "enviando" (dos clics seguidos no lo mandan dos veces), después sale
   por el puente, y al final se anota en el historial o se marca el fallo. */
export async function enviarPropuesta(env, cuaderno, id, { texto, firma, yaBloqueada = false }) {
  let item = null, rec = null, integ = null;
  const lock = await cambiarDb(cuaderno, "operacion", (db) => {
    const it = arr(db.supervision).find((x) => x.id === id);
    if (!it) return { error: "Esa propuesta ya no existe." };
    if (yaBloqueada ? it.estado !== "enviando" : !["pendiente", "fallo"].includes(it.estado)) {
      return { error: `Esa propuesta ya está en «${it.estado}».` };
    }
    const final = String(texto != null ? texto : it.texto || "").trim();
    if (!final) return { error: "El mensaje está vacío." };
    const f = buscar(db, it.clave);
    if (!f) return { error: "La ficha ya no existe." };
    rec = f.rec;
    integ = normalizeIntegrations(db.integrations);
    item = { ...it, estado: "enviando", texto: final, ...(texto != null && final !== String(it.texto || "").trim() ? { editado: true } : {}), error: "" };
    return { db: { ...db, supervision: arr(db.supervision).map((x) => (x.id === id ? item : x)) } };
  }, firma);
  if (lock.error) return { ok: false, error: lock.error };

  let enviado = null, error = "";
  try {
    const a = toE164(rec.props && rec.props.phone, integ.whatsapp.countryCode);
    if (!a) throw new Error("La ficha no tiene un teléfono que WhatsApp pueda marcar.");
    enviado = await pedirPuente(env, integ, "/wa/enviar", { metodo: "POST", cuerpo: { a, texto: item.texto } });
  } catch (e) {
    error = (e && e.message) || String(e);
  }

  const at = nowISO();
  await cambiarDb(cuaderno, "operacion", (db) => {
    const final = { ...item, estado: error ? "fallo" : "enviado", error, resueltoAt: at, resueltoPor: firma };
    const supervision = arr(db.supervision).map((x) => (x.id === id ? final : x));
    if (error) return { db: { ...db, supervision } };
    const act = {
      id: uid(), type: "whatsapp", dir: "out", at,
      subject: "Mensaje de WhatsApp", body: item.texto, via: "servidor",
      autor: firma, agenteId: item.agenteId,
      ...(enviado && enviado.id ? { waId: enviado.id } : {}),
      contactIds: item.kind === "contact" ? [item.recId] : [],
      companyIds: item.kind === "company" ? [item.recId] : [],
    };
    const sellar = (lista) => lista.map((r) => (r.id === item.recId ? { ...r, props: { ...r.props, lastActivityAt: at } } : r));
    return {
      db: {
        ...db, supervision,
        activities: [act, ...arr(db.activities)],
        contacts: item.kind === "contact" ? sellar(arr(db.contacts)) : db.contacts,
        companies: item.kind === "company" ? sellar(arr(db.companies)) : db.companies,
      },
    };
  }, firma);
  return error ? { ok: false, error } : { ok: true };
}

/* ── Lo que pide la app desde Supervisión (/api/operacion) ── */

const Pedido = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("enviar"), id: z.string().min(1), texto: z.string().max(4096).optional() }),
  z.object({ accion: z.literal("descartar"), id: z.string().min(1) }),
  /* Volver a pedirle al agente la respuesta de una conversación, p. ej.
     después de cambiar sus instrucciones o de un fallo. */
  z.object({ accion: z.literal("redactar"), clave: z.string().min(3) }),
]);

export async function atenderOperacion(req, env, cuaderno, quien) {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  let cuerpo;
  try { cuerpo = await req.json(); } catch (_) { return json({ error: "Petición ilegible" }, 400); }
  const p = Pedido.safeParse(cuerpo);
  if (!p.success) return json({ error: "Pedido inválido." }, 400);
  const c = p.data;

  try {
    if (c.accion === "enviar") {
      const r = await enviarPropuesta(env, cuaderno, c.id, { texto: c.texto, firma: quien });
      return json(r, r.ok ? 200 : 409);
    }
    if (c.accion === "descartar") {
      const r = await cambiarDb(cuaderno, quien, (db) => {
        const it = arr(db.supervision).find((x) => x.id === c.id);
        if (!it) return { error: "Esa propuesta ya no existe." };
        if (!["pendiente", "fallo", "traspaso"].includes(it.estado)) return { error: `Esa propuesta ya está en «${it.estado}».` };
        const at = nowISO();
        return { db: { ...db, supervision: arr(db.supervision).map((x) => (x.id === c.id ? { ...x, estado: "descartado", resueltoAt: at, resueltoPor: quien } : x)) } };
      }, quien);
      return json(r.error ? { ok: false, error: r.error } : { ok: true }, r.error ? 409 : 200);
    }
    if (c.accion === "redactar") {
      const { db } = await leerDb(cuaderno);
      const f = db && buscar(db, c.clave);
      if (!f) return json({ ok: false, error: "No existe esa conversación." }, 404);
      const u = ultimoMensaje(db, f.kind, f.id);
      if (!u || u.dir !== "in" || u.type !== "whatsapp") return json({ ok: false, error: "Lo último de esa conversación no es un WhatsApp recibido: no hay nada que contestar." }, 409);
      const quienAtiende = agenteDe(db, f.kind, f.rec);
      if (quienAtiende.humano) return json({ ok: false, error: "Esa conversación la atiende una persona. Asígnale un agente para que redacte." }, 409);
      if (!quienAtiende.agente || !quienAtiende.agente.activo) return json({ ok: false, error: "Ningún agente encendido atiende esa conversación." }, 409);
      if (normalizaOperacion(db.operacion).pausada) return json({ ok: false, error: "Los agentes están en pausa." }, 409);
      await atenderConversacion(env, cuaderno, c.clave, u.ext);
      return json({ ok: true });
    }
  } catch (e) {
    return json({ ok: false, error: (e && e.message) || String(e) }, 502);
  }
  return json({ error: "Acción desconocida" }, 400);
}
