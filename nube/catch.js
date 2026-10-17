/* ────────────────────────────────────────────────────────────
   Lo que la app Catch le cuenta al CRM
   Catch avisa cuando alguien se registra, cuando completa su perfil, cuando
   sube de etapa y cada vez que habla con el Companion. Con eso la ficha del
   contacto dice si ya está en la app y en qué va, y la conversación con el
   agente aparece en Mensajes junto a la de WhatsApp y correo, para
   supervisarla.

   El camino: Catch firma cada lote con CATCH_SECRETO y lo manda al puente
   (go.raadsports.com/catch/eventos), que es público. El puente revisa la
   firma y lo pasa aquí por un service binding, sin pasar por Cloudflare
   Access. Este archivo no confía en nada que no venga validado por el
   esquema de abajo.

   El contrato completo, con ejemplos, está en nube/CATCH.md.
   ──────────────────────────────────────────────────────────── */

import { z } from "zod";
import { cambiarDb } from "./mcp.js";

export const ETAPAS_CATCH = ["Sembrando", "Al mundo", "El sueño", "Más alto", "1er cierre", "La meta"];
export const ESTADOS_APP = ["Sin registro", "Registrado", "Perfil completo", "Activo"];
const RANGO_ESTADO = Object.fromEntries(ESTADOS_APP.map((e, i) => [e, i]));
const VISTOS_MAX = 5000;

const Base = {
  id: z.string().min(1).max(100).describe("Identificador único del evento, para no aplicarlo dos veces"),
  at: z.string().datetime({ offset: true }),
  atletaId: z.string().min(1).max(100),
};
const Persona = z.object({
  nombre: z.string().max(100).optional(),
  apellido: z.string().max(100).optional(),
  email: z.string().max(200).optional(),
  telefono: z.string().max(40).optional(),
}).partial();

export const EventoCatch = z.discriminatedUnion("tipo", [
  z.object({
    ...Base,
    tipo: z.literal("registro"),
    ref: z.string().max(100).optional().describe("El ?ref= con que llegó al registro: el id del contacto en el CRM"),
    utm: z.object({ source: z.string().max(100), medium: z.string().max(100), campaign: z.string().max(100) }).partial().optional(),
    persona: Persona.optional(),
    conversacional: z.boolean().optional().describe("Verdadero si se registró conversando con el Companion"),
  }),
  z.object({ ...Base, tipo: z.literal("perfil"), completo: z.boolean(), persona: Persona.optional() }),
  z.object({ ...Base, tipo: z.literal("etapa"), etapa: z.number().int().min(1).max(6) }),
  z.object({ ...Base, tipo: z.literal("acceso"), activo: z.boolean().describe("Pagó / se le activó una etapa paga") }),
  z.object({
    ...Base,
    tipo: z.literal("turno"),
    turnoId: z.string().min(1).max(100),
    quien: z.enum(["Atleta", "Companion", "Asesor"]),
    texto: z.string().max(8000),
    canal: z.enum(["InApp", "WhatsApp"]).default("InApp"),
    deber: z.string().max(60).optional(),
    persona: Persona.optional(),
  }),
  z.object({ ...Base, tipo: z.literal("traspaso"), motivo: z.string().max(200), abierto: z.boolean().default(true) }),
]);
export const LoteCatch = z.object({ eventos: z.array(z.unknown()).max(500) });

const uid = () => Math.random().toString(36).slice(2, 10);
const emailKey = (v) => String(v || "").trim().toLowerCase();
/* Los últimos diez dígitos: alcanza para reconocer el mismo número escrito
   con o sin indicativo, con espacios o con guiones. */
const telKey = (v) => String(v || "").replace(/\D/g, "").slice(-10);

function buscarContacto(contacts, ev) {
  const p = ev.persona || {};
  /* Una ficha ya ligada a otro atleta no se reasigna aunque coincida el
     correo o el teléfono: pasa con hermanos que comparten el del papá. */
  const libres = contacts.filter((c) => !(c.props && c.props.appId) || c.props.appId === ev.atletaId);
  return contacts.find((c) => c.props && c.props.appId === ev.atletaId)
    || (ev.ref && libres.find((c) => c.id === ev.ref))
    || (p.email && libres.find((c) => emailKey(c.props && c.props.email) === emailKey(p.email)))
    || (telKey(p.telefono).length >= 7 && libres.find((c) => telKey(c.props && c.props.phone) === telKey(p.telefono)))
    || null;
}

const subirEstado = (actual, nuevo) => ((RANGO_ESTADO[nuevo] || 0) > (RANGO_ESTADO[actual] || 0) ? nuevo : actual || nuevo);

/* Aplica un lote al cuaderno. Devuelve el cuaderno nuevo y el resumen. */
export function aplicarEventosCatch(db, eventos) {
  const app = db.catchApp || {};
  const vistos = new Set(Array.isArray(app.vistos) ? app.vistos : []);
  const contacts = [...(db.contacts || [])];
  const nuevasActs = [];
  const res = { aplicados: 0, repetidos: 0, invalidos: 0, fichasNuevas: 0 };

  const tocar = (i, props) => { contacts[i] = { ...contacts[i], props: { ...contacts[i].props, ...props } }; };

  for (const crudo of eventos) {
    const ok = EventoCatch.safeParse(crudo);
    if (!ok.success) { res.invalidos++; continue; }
    const ev = ok.data;
    if (vistos.has(ev.id)) { res.repetidos++; continue; }
    vistos.add(ev.id);

    let c = buscarContacto(contacts, ev);
    if (!c) {
      const p = ev.persona || {};
      c = {
        id: uid(),
        props: {
          firstName: p.nombre || "Atleta de Catch", lastName: p.apellido || "",
          email: p.email || "", phone: p.telefono || "",
          leadSource: "App Catch", leadStatus: "Nuevo", type: "Estudiante",
          createdAt: ev.at, lastActivityAt: ev.at,
        },
      };
      contacts.unshift(c);
      res.fichasNuevas++;
    }
    const i = contacts.findIndex((x) => x.id === c.id);
    const props = contacts[i].props;
    const base = { appId: ev.atletaId, lastActivityAt: ev.at > (props.lastActivityAt || "") ? ev.at : props.lastActivityAt };
    const p = ev.persona || {};
    /* Lo que la persona escribió en la app completa la ficha, sin pisar lo
       que ya tenía. */
    const completar = {
      ...(p.email && !props.email ? { email: p.email } : {}),
      ...(p.telefono && !props.phone ? { phone: p.telefono } : {}),
      ...(p.apellido && !props.lastName ? { lastName: p.apellido } : {}),
    };
    const nota = (subject, body = "") => nuevasActs.push({ id: uid(), ext: `catch:${ev.id}`, type: "note", dir: "out", at: ev.at, subject, body, contactIds: [c.id] });

    if (ev.tipo === "registro") {
      tocar(i, {
        ...base, ...completar,
        appEstado: subirEstado(props.appEstado, "Registrado"),
        appRegistroAt: props.appRegistroAt || ev.at,
        ...(ev.utm && ev.utm.campaign ? { appCampana: ev.utm.campaign } : {}),
        ...(ev.utm && ev.utm.medium ? { appCanal: ev.utm.medium } : {}),
        appEtapa: props.appEtapa || ETAPAS_CATCH[0],
      });
      const desde = ev.utm && ev.utm.medium ? ` desde ${ev.utm.medium === "whatsapp" ? "WhatsApp" : ev.utm.medium === "email" ? "un correo" : ev.utm.medium}` : "";
      nota(`Se registró en Catch${desde}${ev.conversacional ? " conversando con el Companion" : ""}`);
    } else if (ev.tipo === "perfil") {
      tocar(i, { ...base, ...completar, ...(ev.completo ? { appEstado: subirEstado(props.appEstado, "Perfil completo") } : {}) });
      if (ev.completo) nota("Completó su perfil en Catch");
    } else if (ev.tipo === "etapa") {
      const etapa = ETAPAS_CATCH[ev.etapa - 1];
      tocar(i, { ...base, appEtapa: etapa, appEstado: subirEstado(props.appEstado, "Registrado") });
      nota(`Pasó a la etapa ${ev.etapa} en Catch: ${etapa}`);
    } else if (ev.tipo === "acceso") {
      tocar(i, { ...base, ...(ev.activo ? { appEstado: subirEstado(props.appEstado, "Activo") } : {}) });
      nota(ev.activo ? "Activó su acceso pago en Catch" : "Se le cerró el acceso pago en Catch");
    } else if (ev.tipo === "turno") {
      tocar(i, { ...base, ...completar });
      nuevasActs.push({
        id: uid(), ext: `catch:${ev.turnoId}`, type: "app", dir: ev.quien === "Atleta" ? "in" : "out",
        at: ev.at, subject: `${ev.quien} en Catch`, body: ev.texto,
        autor: ev.quien, canal: ev.canal, ...(ev.deber ? { deber: ev.deber } : {}),
        contactIds: [c.id],
      });
    } else if (ev.tipo === "traspaso") {
      tocar(i, { ...base, appTraspaso: ev.abierto ? ev.motivo : "" });
      /* Un traspaso abierto se anota como algo recibido: así enciende el
         contador de Mensajes y alguien lo ve. */
      nuevasActs.push({
        id: uid(), ext: `catch:${ev.id}`, type: "app", dir: ev.abierto ? "in" : "out", at: ev.at,
        subject: ev.abierto ? "El Companion pide un asesor" : "El asesor cerró el traspaso",
        body: ev.abierto ? `Motivo: ${ev.motivo}` : "", autor: "Sistema", canal: "InApp",
        contactIds: [c.id],
      });
    }
    res.aplicados++;
  }

  const yaHay = new Set((db.activities || []).map((a) => a.ext).filter(Boolean));
  const entran = nuevasActs.filter((a) => !yaHay.has(a.ext));
  return {
    db: {
      ...db,
      contacts,
      activities: [...entran.sort((a, b) => (a.at < b.at ? 1 : -1)), ...(db.activities || [])],
      catchApp: { ...app, vistos: [...vistos].slice(-VISTOS_MAX), ultimoAt: new Date().toISOString() },
    },
    res,
  };
}

/* Lo llama el puente por el service binding (ver Puerta en worker.js). */
export async function recibirEventosCatch(cuaderno, cuerpo) {
  const lote = LoteCatch.safeParse(cuerpo);
  if (!lote.success) return { ok: false, error: "Se esperaba {eventos: [...]}, máximo 500." };
  let res;
  await cambiarDb(cuaderno, "catch", (db) => {
    const r = aplicarEventosCatch(db, lote.data.eventos);
    res = r.res;
    return { db: r.db };
  }, "App Catch");
  return { ok: true, ...res };
}
