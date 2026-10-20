/* ────────────────────────────────────────────────────────────
   Los agentes de operación en el servidor
   La cadena que va de una noticia a un lead que se registra en Catch, sin
   que nadie tenga el CRM abierto (ver src/marketing.js):

     producirCampana — cada mañana, después de Tendencias: el Agente de
       Contenido elige la noticia, escribe la pieza y la manda a Meta.
     avanzarCampanas — cada diez minutos: el Agente de Campañas pregunta a
       Meta por las plantillas, envía en tandas lo aprobado, y el Agente de
       Seguimiento le escribe a quien no se registró.

   Todo queda en Supervisión, firmado con el nombre del agente, y todo se
   detiene con "Pausar todos" (operacion.pausada).
   ──────────────────────────────────────────────────────────── */

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { cambiarDb, leerDb } from "./mcp.js";
import { pedirPuente } from "./puente.js";
import { enviarCorreoSes, sesListo } from "./ses.js";
import { SISTEMA, marcaDe } from "./estudio.js";
import { applyTemplate, plantillaWaPara, VARS_META, EJEMPLOS_META, nombreParaMeta } from "../src/plantillas.js";
import { normalizeIntegrations, toE164 } from "../src/integrations.js";
import { textoAHtml, enlaceBaja, pieBajaHtml, pieBajaTexto } from "../src/tracking.js";
import { normalizaOperacion, conAnotacion } from "../src/agentes.js";
import {
  normalizaMarketing, normalizeCampanas, indiceMarketing, porQueNo, correoUtil, audienciaDe,
  enHorario, fechaBogota, MAX_CAMPANAS,
} from "../src/marketing.js";
import { titulo } from "../src/fichaClaude.js";

const MODELO = "claude-opus-5-5";
const uid = () => Math.random().toString(36).slice(2, 10);
const nowISO = () => new Date().toISOString();
const arr = (x) => (Array.isArray(x) ? x : []);
const DIA_MS = 24 * 3600 * 1000;

/* Cuántos destinatarios por pasada. Cada uno son hasta dos envíos (WhatsApp
   y correo); con esto una pasada queda lejos del límite de peticiones de un
   Worker. Cada diez minutos son ~120 por hora. */
const LOTE = 20;
/* Si una pasada quedó a medias (el Worker se cortó), la tanda se libera
   pasado este tiempo. */
const CANDADO_MS = 8 * 60 * 1000;

const AGENTE_CONTENIDO = "Agente de Contenido";
const AGENTE_CAMPANAS = "Agente de Campañas";
const AGENTE_SEGUIMIENTO = "Agente de Seguimiento";

const SEGUIMIENTO_CUERPO = "Hola {{nombre}}, hace unos días te escribimos sobre Catch, la app que te ayuda a encontrar tu ruta para estudiar y jugar en EE. UU. ¿Te quedó alguna duda? Respóndeme por aquí y la resolvemos juntos.";
const SEGUIMIENTO_NOMBRE = "catch_seguimiento_v1";

/* ── Las reglas de Meta para el texto de una plantilla ── */
function problemasWa(texto) {
  const t = String(texto || "").trim();
  const out = [];
  if (!t) out.push("está vacío");
  if (t.length > 550) out.push(`tiene ${t.length} caracteres y el máximo es 550`);
  const vars = [...t.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)].map((m) => m[1]);
  const raras = [...new Set(vars.filter((k) => !VARS_META.includes(k)))];
  if (raras.length) out.push(`usa variables que el CRM no sabe llenar: ${raras.map((k) => `{{${k}}}`).join(", ")}`);
  if (!vars.includes("registro")) out.push("no lleva el enlace {{registro}}");
  if (/^\{\{/.test(t) || /\}\}[\s.!?]*$/.test(t)) out.push("empieza o termina con una variable");
  if (/\}\}\s*\{\{/.test(t)) out.push("tiene dos variables seguidas");
  return out;
}

const Pieza = z.object({
  titulo: z.string().describe("Nombre corto de la campaña, para reconocerla en el CRM"),
  lector: z.enum(["Atleta", "Padres"]).describe("A quién le habla: una pieza, un lector"),
  whatsapp: z.string().describe("Texto de la plantilla de WhatsApp: máximo 550 caracteres, con {{nombre}} y el enlace como {{registro}}; no empieza ni termina con una variable"),
  correo: z.object({
    asunto: z.string().describe("Asunto del correo, máximo 70 caracteres, sin variables salvo {{nombre}}"),
    cuerpo: z.string().describe("Cuerpo del correo en texto plano, párrafos cortos, con {{nombre}} y el enlace {{registro}}; sin firma"),
  }),
  porque: z.string().describe("Por qué esta pieza lleva a registrarse, en una frase"),
});

async function escribirPieza(env, db, noticia, correccion = "") {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const marca = marcaDe(db.estudio && db.estudio.marca);
  const j = noticia.jev || {};
  const pedido = [
    marca,
    `<noticia>
Título: ${noticia.titulo}
Medio: ${noticia.medio || "sin medio"} · Fecha: ${noticia.fecha || "sin fecha"}
Resumen: ${noticia.resumen}
Fuente: ${noticia.url}
Ángulo sugerido por JEV: ${j.angulo || ""}
Gancho sugerido: ${j.gancho || ""}
Por qué la eligió: ${j.porque || ""}
</noticia>`,
    `Con esta noticia, prepara la campaña de hoy: el texto de una plantilla de WhatsApp de marketing y su versión para correo. La llamada a la acción de las dos es registrarse en la app Catch con el enlace {{registro}}. Elige un solo lector (atleta o padres).`,
    correccion ? `La versión anterior no se puede mandar a Meta porque ${correccion}. Corrígelo.` : "",
  ].filter(Boolean).join("\n\n");
  const r = await client.beta.messages.parse({
    model: MODELO,
    max_tokens: 16000,
    output_config: { effort: "medium", format: betaZodOutputFormat(Pieza) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SISTEMA,
    messages: [{ role: "user", content: pedido }],
  });
  if (r.stop_reason === "refusal") throw new Error("Claude no quiso preparar esta pieza.");
  if (!r.parsed_output) throw new Error("La pieza no salió con la forma esperada.");
  return r.parsed_output;
}

/* ── El Agente de Contenido ── */

export async function producirCampana(env, cuaderno) {
  const { db } = await leerDb(cuaderno);
  if (!db) return { hecho: false, motivo: "cuaderno vacío" };
  const mk = normalizaMarketing(db.marketing);
  if (!mk.contenido.activo) return { hecho: false, motivo: "apagado" };
  if (normalizaOperacion(db.operacion).pausada) return { hecho: false, motivo: "en pausa" };

  const hoy = fechaBogota();
  if (normalizeCampanas(db.campanas).some((c) => fechaBogota(Date.parse(c.at)) === hoy)) return { hecho: false, motivo: "ya hay campaña hoy" };

  /* La mejor de los últimos tres días que JEV marcó para producir y nadie
     usó ni descartó. */
  const tres = Date.now() - 3 * DIA_MS;
  const candidatas = arr((db.tendencias || {}).items)
    .filter((x) => x.jev && x.jev.decision === "producir" && x.jev.total >= mk.contenido.minimoJev
      && !["usada", "descartada"].includes(x.estado) && Date.parse(x.at) >= tres)
    .sort((a, b) => b.jev.total - a.jev.total);
  const noticia = candidatas[0];
  if (!noticia) {
    await cambiarDb(cuaderno, "contenido", (d) => ({
      db: { ...d, supervision: conAnotacion(d, { tipo: "campana", agente: AGENTE_CONTENIDO, nombre: "Campaña del día", texto: `Hoy ninguna tendencia llegó a ${mk.contenido.minimoJev} puntos en JEV: no hay campaña.` }) },
    }), AGENTE_CONTENIDO);
    return { hecho: false, motivo: "sin tendencia" };
  }

  const id = uid();
  const base = { id, at: nowISO(), tendenciaId: noticia.id, tendencia: { titulo: noticia.titulo, url: noticia.url, medio: noticia.medio || "", total: noticia.jev.total, porque: noticia.jev.porque || "" } };
  let campana;
  try {
    let pieza = await escribirPieza(env, db, noticia);
    let malos = problemasWa(pieza.whatsapp);
    if (malos.length) {
      pieza = await escribirPieza(env, db, noticia, malos.join("; "));
      malos = problemasWa(pieza.whatsapp);
      if (malos.length) throw new Error(`El texto de WhatsApp no cumple las reglas de Meta: ${malos.join("; ")}.`);
    }
    const cuerpo = pieza.whatsapp.trim();
    const vars = [...new Set([...cuerpo.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/g)].map((m) => m[1]))];
    const nombre = nombreParaMeta(`catch ${hoy.replace(/-/g, "")} ${pieza.titulo}`);
    const r = await pedirPuente(env, db.integrations, "/wa/plantillas/crear", {
      metodo: "POST",
      cuerpo: { nombre, idioma: "es", categoria: "MARKETING", cuerpo, ejemplos: Object.fromEntries(vars.map((k) => [k, EJEMPLOS_META[k]])) },
    });
    campana = {
      ...base, estado: "revision", titulo: pieza.titulo, lector: pieza.lector, porque: pieza.porque,
      wa: { texto: cuerpo, plantilla: { id: r.id || "", nombre: r.nombre || nombre, idioma: r.idioma || "es", estado: r.estado || "PENDING", cuerpo, vars, formato: "nombrado" } },
      correo: { asunto: pieza.correo.asunto.trim(), texto: pieza.correo.cuerpo.trim() },
      cola: [], enviados: { wa: 0, correo: 0, omitidos: 0 },
    };
  } catch (e) {
    campana = { ...base, estado: "fallo", titulo: noticia.titulo, error: (e && e.message) || String(e), wa: {}, correo: {}, cola: [], enviados: {} };
  }

  await cambiarDb(cuaderno, "contenido", (d) => ({
    db: {
      ...d,
      campanas: [campana, ...normalizeCampanas(d.campanas)].slice(0, MAX_CAMPANAS),
      tendencias: { ...(d.tendencias || {}), items: arr((d.tendencias || {}).items).map((x) => (x.id === noticia.id ? { ...x, estado: "usada" } : x)) },
      supervision: conAnotacion(d, {
        tipo: "campana", campanaId: id, agente: AGENTE_CONTENIDO, nombre: campana.titulo,
        estado: campana.estado === "fallo" ? "fallo" : "info",
        texto: campana.estado === "fallo" ? "" : `Eligió «${noticia.titulo}» (JEV ${noticia.jev.total}) y mandó la plantilla a Meta. Sale sola cuando la aprueben.\n\n${campana.wa.texto}`,
        ...(campana.error ? { error: campana.error } : {}),
      }),
    },
  }), AGENTE_CONTENIDO);
  return { hecho: campana.estado !== "fallo", campana: id };
}

/* ── El Agente de Campañas y el de Seguimiento ── */

async function plantillasDeMeta(env, integraciones) {
  const r = await pedirPuente(env, integraciones, "/wa/plantillas");
  return arr(r.plantillas);
}

/* Las bajas que anotó el puente desde la última vez: el correo de esas
   personas queda "Dado de baja" antes de mandar nada. */
async function traerBajas(env, cuaderno, db, mk) {
  const desde = Number(mk.bajasAl) || 0;
  const r = await pedirPuente(env, db.integrations, "/eventos", { params: { desde: String(desde) } });
  const bajas = arr(r.eventos).filter((e) => e && e.tipo === "baja" && e.rid);
  const hasta = arr(r.eventos).reduce((m, e) => Math.max(m, Date.parse(e.at) || 0), desde);
  if (!bajas.length && hasta === desde) return;
  const ids = new Set(bajas.map((e) => String(e.rid)));
  await cambiarDb(cuaderno, "campanas", (d) => ({
    db: {
      ...d,
      contacts: arr(d.contacts).map((c) => (ids.has(c.id) && c.props.emailStatus !== "Dado de baja" ? { ...c, props: { ...c.props, emailStatus: "Dado de baja" } } : c)),
      marketing: { ...(d.marketing || {}), bajasAl: String(hasta) },
    },
  }), AGENTE_CAMPANAS);
}

/* Le manda a un contacto la campaña (o el seguimiento) por los canales que
   tenga. Devuelve las actividades a anotar y qué salió. */
async function enviarA(env, db, rec, { plantilla, campana, seguimiento }) {
  const integ = normalizeIntegrations(db.integrations);
  const acts = [];
  const salio = { wa: false, correo: false, error: "" };
  const at = nowISO();
  const base = { via: "servidor", campanaId: campana ? campana.id : seguimiento.campanaId, contactIds: [rec.id], companyIds: [] };

  const tel = toE164(rec.props.phone, integ.whatsapp.countryCode);
  if (tel && plantilla) {
    const meta = { ...plantilla, vars: plantilla.vars.map((k) => ({ clave: k, valor: `{{${k}}}` })), cabecera: "", imagen: "" };
    const p = plantillaWaPara(meta, rec, "contact", { utm_medium: "whatsapp", utm_campaign: base.campanaId });
    if (p.err) salio.error = p.err;
    else {
      try {
        const r = await pedirPuente(env, db.integrations, "/wa/enviar", { metodo: "POST", cuerpo: { a: tel, plantilla: p.plantilla, idioma: p.idioma, variables: p.variables } });
        acts.push({ id: uid(), type: "whatsapp", dir: "out", at, subject: seguimiento ? "Seguimiento" : `Campaña: ${campana.titulo}`, body: p.texto, autor: seguimiento ? AGENTE_SEGUIMIENTO : AGENTE_CAMPANAS, ...(r.id ? { waId: r.id } : {}), ...(seguimiento ? { seguimiento: true } : {}), ...base });
        salio.wa = true;
      } catch (e) { salio.error = (e && e.message) || String(e); }
    }
  }

  const correo = correoUtil(rec);
  if (campana && correo && sesListo(env) && campana.correo.texto) {
    const extra = { utm_medium: "email", utm_campaign: campana.id };
    const asunto = applyTemplate(campana.correo.asunto, rec, "contact", false, extra).replace(/\s+/g, " ").trim();
    const cuerpo = applyTemplate(campana.correo.texto, rec, "contact", false, extra);
    try {
      const baja = integ.puente.base && integ.puente.clave ? await enlaceBaja(integ.puente, rec.id) : "";
      await enviarCorreoSes(env, {
        para: correo, asunto,
        texto: baja ? pieBajaTexto(cuerpo, baja) : cuerpo,
        html: baja ? pieBajaHtml(textoAHtml(cuerpo), baja) : textoAHtml(cuerpo),
        baja,
      });
      acts.push({ id: uid(), type: "email", dir: "out", at, subject: asunto, body: cuerpo, autor: AGENTE_CAMPANAS, ...base });
      salio.correo = true;
    } catch (e) { salio.error = salio.error || (e && e.message) || String(e); }
  }
  return { acts, salio };
}

/* Anota lo que salió de una tanda: actividades, última actividad de cada
   ficha y, si se pasa `campanaId`, la cola y los contadores. */
function conTanda(d, acts) {
  const ult = new Map();
  for (const a of acts) for (const id of a.contactIds) if (!ult.has(id) || ult.get(id) < a.at) ult.set(id, a.at);
  return {
    ...d,
    activities: [...acts, ...arr(d.activities)],
    contacts: arr(d.contacts).map((c) => (ult.has(c.id) ? { ...c, props: { ...c.props, lastActivityAt: ult.get(c.id) } } : c)),
  };
}

async function tandaDeCampana(env, cuaderno, campanaId) {
  /* El candado: la tanda que se toma queda marcada, para que una pasada que
     se cruce con otra no la mande dos veces. */
  let tomados = [];
  const lock = await cambiarDb(cuaderno, "campanas", (d) => {
    const cs = normalizeCampanas(d.campanas);
    const c = cs.find((x) => x.id === campanaId);
    if (!c || c.estado !== "enviando") return { error: "no está enviando" };
    if (c.loteAt && Date.now() - Date.parse(c.loteAt) < CANDADO_MS) return { error: "otra pasada la tiene" };
    tomados = c.cola.slice(0, LOTE);
    return { db: { ...d, campanas: cs.map((x) => (x.id === campanaId ? { ...x, loteAt: nowISO() } : x)) } };
  }, AGENTE_CAMPANAS);
  if (lock.error) return;

  const { db } = await leerDb(cuaderno);
  const mk = normalizaMarketing(db.marketing);
  const campana = normalizeCampanas(db.campanas).find((x) => x.id === campanaId);
  const idx = indiceMarketing(db);
  const acts = [];
  let wa = 0, correo = 0, omitidos = 0, errores = [];
  for (const id of tomados) {
    const rec = arr(db.contacts).find((c) => c.id === id);
    if (!rec || porQueNo(db, rec, idx, mk)) { omitidos++; continue; }
    const r = await enviarA(env, db, rec, { plantilla: campana.wa.plantilla, campana });
    acts.push(...r.acts);
    if (r.salio.wa) wa++;
    if (r.salio.correo) correo++;
    if (!r.salio.wa && !r.salio.correo) { omitidos++; if (r.salio.error) errores.push(`${titulo("contact", rec)}: ${r.salio.error}`); }
  }

  const listos = new Set(tomados);
  await cambiarDb(cuaderno, "campanas", (d) => {
    const cs = normalizeCampanas(d.campanas);
    const c = cs.find((x) => x.id === campanaId);
    if (!c) return { db: conTanda(d, acts) };
    const cola = c.cola.filter((x) => !listos.has(x));
    const fin = !cola.length && c.estado === "enviando";
    const enviados = { wa: c.enviados.wa + wa, correo: c.enviados.correo + correo, omitidos: c.enviados.omitidos + omitidos };
    const nueva = { ...c, cola, enviados, loteAt: "", ...(fin ? { estado: "enviada", terminadaAt: nowISO() } : {}), ...(errores.length ? { ultimoError: errores.slice(-3).join(" · ") } : {}) };
    let d2 = { ...conTanda(d, acts), campanas: cs.map((x) => (x.id === campanaId ? nueva : x)) };
    if (fin) {
      d2 = { ...d2, supervision: conAnotacion(d2, { tipo: "campana", campanaId, agente: AGENTE_CAMPANAS, nombre: c.titulo, estado: "enviado", texto: `Campaña enviada: ${enviados.wa} por WhatsApp y ${enviados.correo} por correo. ${enviados.omitidos} omitidos (ya registrados, sin canal, en el tope semanal o con error).` }) };
    }
    return { db: d2 };
  }, AGENTE_CAMPANAS);
}

/* Revisa en Meta las plantillas que esperan: la de cada campaña en revisión
   y la fija del seguimiento. Una campaña aprobada arma su cola y pasa a
   enviando; una rechazada queda en Supervisión con el motivo. */
async function revisarPlantillas(env, cuaderno, db, mk) {
  const enRevision = normalizeCampanas(db.campanas).filter((c) => c.estado === "revision");
  const segPend = mk.seguimiento.activo && (!mk.seguimiento.plantilla || mk.seguimiento.plantilla.estado !== "APPROVED");
  if (!enRevision.length && !segPend) return;

  const lista = await plantillasDeMeta(env, db.integrations);
  const buscar = (p) => lista.find((x) => (p.id && x.id === p.id) || (x.nombre === p.nombre && x.idioma === p.idioma));

  /* La plantilla fija del seguimiento se crea una sola vez. */
  let crearSeg = false;
  if (segPend && !mk.seguimiento.plantilla) {
    const ya = lista.find((x) => x.nombre === SEGUIMIENTO_NOMBRE);
    if (!ya) {
      try {
        await pedirPuente(env, db.integrations, "/wa/plantillas/crear", {
          metodo: "POST",
          cuerpo: {
            nombre: SEGUIMIENTO_NOMBRE, idioma: "es", categoria: "MARKETING", cuerpo: SEGUIMIENTO_CUERPO,
            ejemplos: { nombre: EJEMPLOS_META.nombre },
            botones: [{ tipo: "RESPUESTA", texto: "Tengo una duda" }, { tipo: "RESPUESTA", texto: "Quiero registrarme" }],
          },
        });
        crearSeg = true;
      } catch (e) {
        await cambiarDb(cuaderno, "seguimiento", (d) => ({ db: { ...d, supervision: conAnotacion(d, { tipo: "seguimiento", agente: AGENTE_SEGUIMIENTO, nombre: "Plantilla de seguimiento", estado: "fallo", error: (e && e.message) || String(e) }) } }), AGENTE_SEGUIMIENTO);
      }
    }
  }

  await cambiarDb(cuaderno, "campanas", (d) => {
    let d2 = d;
    const cs = normalizeCampanas(d.campanas).map((c) => {
      if (c.estado !== "revision" || !c.wa.plantilla) return c;
      const p = buscar(c.wa.plantilla);
      if (!p || p.estado === c.wa.plantilla.estado) return c;
      if (p.estado === "APPROVED") {
        const audiencia = audienciaDe(d, normalizaMarketing(d.marketing)).map((r) => r.id);
        d2 = { ...d2, supervision: conAnotacion(d2, { tipo: "campana", campanaId: c.id, agente: AGENTE_CAMPANAS, nombre: c.titulo, texto: `Meta aprobó la plantilla. Empieza el envío a ${audiencia.length} leads sin registro.` }) };
        return { ...c, estado: audiencia.length ? "enviando" : "enviada", cola: audiencia, wa: { ...c.wa, plantilla: { ...c.wa.plantilla, estado: "APPROVED", vars: p.vars, formato: p.formato, cuerpo: p.cuerpo } } };
      }
      if (p.estado === "REJECTED") {
        d2 = { ...d2, supervision: conAnotacion(d2, { tipo: "campana", campanaId: c.id, agente: AGENTE_CAMPANAS, nombre: c.titulo, estado: "fallo", error: `Meta rechazó la plantilla${p.rechazo ? ` (${p.rechazo})` : ""}. Mañana el Agente de Contenido prepara otra.` }) };
        return { ...c, estado: "rechazada", wa: { ...c.wa, plantilla: { ...c.wa.plantilla, estado: "REJECTED", rechazo: p.rechazo || "" } } };
      }
      return { ...c, wa: { ...c.wa, plantilla: { ...c.wa.plantilla, estado: p.estado } } };
    });
    const m = normalizaMarketing(d2.marketing);
    let seg = m.seguimiento.plantilla;
    const p = lista.find((x) => x.nombre === SEGUIMIENTO_NOMBRE);
    if (p) seg = { id: p.id, nombre: p.nombre, idioma: p.idioma, estado: p.estado, rechazo: p.rechazo || "", cuerpo: p.cuerpo, vars: p.vars, formato: p.formato };
    else if (crearSeg) seg = { nombre: SEGUIMIENTO_NOMBRE, idioma: "es", estado: "PENDING", cuerpo: SEGUIMIENTO_CUERPO, vars: ["nombre"], formato: "nombrado" };
    return { db: { ...d2, campanas: cs, marketing: { ...(d2.marketing || {}), seguimiento: { ...m.seguimiento, plantilla: seg } } } };
  }, AGENTE_CAMPANAS);
}

/* A quién le toca el seguimiento: recibió una campaña hace entre `dias` y
   `dias + 7` días, sigue sin registrarse, no contestó nada desde entonces y
   no ha recibido el seguimiento de esa campaña. */
function paraSeguimiento(db, mk, ahora = Date.now()) {
  const desde = ahora - (mk.seguimiento.dias + 7) * DIA_MS;
  const hasta = ahora - mk.seguimiento.dias * DIA_MS;
  const idx = indiceMarketing(db);
  const out = [];
  for (const rec of arr(db.contacts)) {
    const suyas = idx.get(rec.id) || [];
    const envio = suyas.filter((a) => !a.seguimiento && Date.parse(a.at) >= desde && Date.parse(a.at) <= hasta)
      .sort((a, b) => (a.at < b.at ? 1 : -1))[0];
    if (!envio) continue;
    if (suyas.some((a) => a.seguimiento && a.campanaId === envio.campanaId)) continue;
    const contesto = arr(db.activities).some((a) => a.dir === "in" && (a.contactIds || []).includes(rec.id) && a.at > envio.at);
    if (contesto || porQueNo(db, rec, idx, mk, ahora)) continue;
    out.push({ rec, campanaId: envio.campanaId });
  }
  return out;
}

async function tandaDeSeguimiento(env, cuaderno, db, mk) {
  const plantilla = mk.seguimiento.plantilla;
  const lista = paraSeguimiento(db, mk).slice(0, LOTE);
  if (!lista.length) return;
  const acts = [];
  for (const { rec, campanaId } of lista) {
    const r = await enviarA(env, db, rec, { plantilla, seguimiento: { campanaId } });
    acts.push(...r.acts);
  }
  if (!acts.length) return;
  await cambiarDb(cuaderno, "seguimiento", (d) => ({
    db: {
      ...conTanda(d, acts),
      supervision: conAnotacion(d, { tipo: "seguimiento", agente: AGENTE_SEGUIMIENTO, nombre: "Seguimiento", estado: "enviado", texto: `Les escribió a ${acts.length} leads que recibieron una campaña y no se han registrado. Si contestan, los atiende el agente de texto.` }),
    },
  }), AGENTE_SEGUIMIENTO);
}

export async function avanzarCampanas(env, cuaderno) {
  const { db } = await leerDb(cuaderno);
  if (!db) return;
  if (normalizaOperacion(db.operacion).pausada) return;
  const mk = normalizaMarketing(db.marketing);
  const hay = normalizeCampanas(db.campanas).some((c) => c.estado === "revision" || c.estado === "enviando");
  if (!hay && !mk.seguimiento.activo) return;

  await revisarPlantillas(env, cuaderno, db, mk);
  if (!enHorario(mk)) return;

  if (sesListo(env)) await traerBajas(env, cuaderno, db, mk).catch((e) => console.log("No se leyeron las bajas", e && e.message));

  const fresco = (await leerDb(cuaderno)).db;
  for (const c of normalizeCampanas(fresco.campanas).filter((x) => x.estado === "enviando")) {
    await tandaDeCampana(env, cuaderno, c.id);
  }
  const mk2 = normalizaMarketing(fresco.marketing);
  if (mk2.seguimiento.activo && mk2.seguimiento.plantilla && mk2.seguimiento.plantilla.estado === "APPROVED") {
    await tandaDeSeguimiento(env, cuaderno, (await leerDb(cuaderno)).db, mk2);
  }
}
