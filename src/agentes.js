/* ────────────────────────────────────────────────────────────
   Agentes de texto
   ────────────────────────────────────────────────────────────
   Un agente es una voz con un encargo: el que recibe al prospecto, el que
   acompaña al lead que ya está hablando, el que atiende al cliente, el de la
   post venta. Cada uno sabe cuándo le toca —las mismas condiciones por
   propiedad que usan las listas activas— y qué hacer cuando no sabe: pasarle
   la conversación a una persona.

   A cada conversación le toca un solo agente: el primero de la lista, de arriba
   hacia abajo, que esté encendido y cuyas condiciones cumpla la ficha. Por eso
   el orden importa. Una conversación también puede quedar fijada a mano a un
   agente, o en manos de una persona, y eso manda sobre las condiciones.

   Este archivo sólo guarda la forma. Quién cumple qué lo decide CRM.jsx con
   los filtros que ya usa en todas partes.
   ──────────────────────────────────────────────────────────── */

import { cumpleFiltros } from "./filtros.js";

const uid = () => Math.random().toString(36).slice(2, 10);
const nowISO = () => new Date().toISOString();
const arr = (x) => (Array.isArray(x) ? x : []);
const txt = (x) => String(x == null ? "" : x);

/* Etapas sugeridas; se puede escribir cualquier otra. */
export const ETAPAS_AGENTE = ["Prospecto", "Lead en curso", "Cliente", "Post venta"];

/* Lo que vale para una conversación en `agentesChat`: un id de agente fijado
   a mano, o esto, que quiere decir "la atiende una persona". */
export const HUMANO = "humano";

/* Cómo trabaja un agente en el servidor (nube/operacion.js):
   · sugerir: redacta la respuesta y la deja en Supervisión para que una
     persona la apruebe, la corrija o la descarte. Es el de fábrica.
   · automatico: la envía sola, dentro de los topes de `operacion`. */
export const MODOS_AGENTE = {
  sugerir: "Sugerir: una persona aprueba cada mensaje",
  automatico: "Automático: envía solo",
};

export const agenteVacio = () => ({
  id: uid(),
  nombre: "",
  etapa: "",
  activo: false,
  modo: "sugerir",
  objetivo: "",
  instrucciones: "",
  traspaso: "Si la persona pide hablar con alguien, se queja, o pregunta algo que no está en tus instrucciones ni en su ficha.",
  filtros: [],
  creadoEn: nowISO(),
});

const normalizaFiltro = (c) => ({
  key: txt(c && c.key),
  op: txt(c && c.op),
  value: txt(c && c.value),
  values: arr(c && c.values).map(txt),
});

export function normalizaAgente(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  return {
    ...agenteVacio(),
    id: txt(d.id) || uid(),
    nombre: txt(d.nombre),
    etapa: txt(d.etapa),
    activo: Boolean(d.activo),
    modo: d.modo === "automatico" ? "automatico" : "sugerir",
    objetivo: txt(d.objetivo),
    instrucciones: txt(d.instrucciones),
    traspaso: d.traspaso == null ? agenteVacio().traspaso : txt(d.traspaso),
    filtros: arr(d.filtros).map(normalizaFiltro),
    creadoEn: txt(d.creadoEn) || nowISO(),
  };
}

export const normalizeAgentes = (raw) => arr(raw).map(normalizaAgente);

/* Sólo sobreviven las marcas que apuntan a algo: una persona, o un agente que
   todavía existe. Las de un agente borrado vuelven a "según la etapa". */
export function normalizeAgentesChat(raw, agentes) {
  const d = raw && typeof raw === "object" ? raw : {};
  const ids = new Set(arr(agentes).map((a) => a.id));
  const out = {};
  for (const [k, v] of Object.entries(d)) if (v === HUMANO || ids.has(v)) out[k] = v;
  return out;
}

/* Un punto de partida para las cuatro etapas. Salen apagados: se revisan las
   instrucciones y las condiciones antes de que ninguno hable. Las condiciones
   usan "Estado de lead" y "Tipo", que trae todo CRM; la de post venta queda
   sin condiciones porque cada quien marca de forma distinta que ya compró. */
export const agentesDeBase = () => [
  normalizaAgente({
    nombre: "Luna",
    etapa: "Prospecto",
    objetivo: "Dar la bienvenida a quien llega de un anuncio, resolver sus dudas y llevarlo a registrarse en la app.",
    instrucciones: "Saluda por el nombre y preséntate como Luna, de Raad Sports. Mensajes cortos, de dos o tres líneas. Haz una sola pregunta a la vez. Cuando haya interés, invita a registrarse en la app.",
    filtros: [
      { key: "leadStatus", op: "en", values: ["Nuevo", "Abierto", "Intento de contacto"] },
      { key: "type", op: "noen", values: ["Cliente"] },
    ],
  }),
  normalizaAgente({
    nombre: "Agente de seguimiento",
    etapa: "Lead en curso",
    objetivo: "Acompañar a quien ya está conversando: aclarar precios, planes y tiempos, y acordar el siguiente paso.",
    instrucciones: "Retoma lo último que se habló en el historial. No repitas la presentación. Si la persona está lista, propón una llamada o el pago.",
    filtros: [
      { key: "leadStatus", op: "en", values: ["Conectado", "Calificado"] },
      { key: "type", op: "noen", values: ["Cliente"] },
    ],
  }),
  normalizaAgente({
    nombre: "Agente de clientes",
    etapa: "Cliente",
    objetivo: "Atender a quien ya es cliente: dudas de uso, pagos y novedades.",
    instrucciones: "Trata a la persona como cliente que ya conoce el servicio. Resuelve con claridad y, si es un problema con un pago o una cuenta, pásalo a una persona.",
    filtros: [{ key: "type", op: "en", values: ["Cliente"] }],
  }),
  normalizaAgente({
    nombre: "Agente de post venta",
    etapa: "Post venta",
    objetivo: "Preguntar cómo le fue, pedir una opinión o un referido, y ofrecer lo que sigue.",
    instrucciones: "Agradece la compra. Pregunta por la experiencia en una sola línea. Si la respuesta es buena, pide una recomendación; si es mala, pásalo a una persona.",
  }),
];

/* ── Quién atiende cada conversación ──
   Fijado a mano manda; si no, el primero de la lista que esté encendido y
   cuyas condiciones cumpla la ficha. Lo usan la app y el servidor. */
export const claveConv = (kind, id) => `${kind}:${id}`;

export function agentePorEtapa(db, kind, rec) {
  if (kind !== "contact") return null;
  const schema = (db.schema && db.schema.contact) || [];
  return (db.agentes || []).find((a) => a.activo
    && cumpleFiltros(rec, (a.filtros || []).filter((c) => c.key), schema)) || null;
}

export function agenteDe(db, kind, rec) {
  const fijo = (db.agentesChat || {})[claveConv(kind, rec.id)];
  if (fijo === HUMANO) return { humano: true, fijo: true };
  const a = fijo && (db.agentes || []).find((x) => x.id === fijo);
  if (a) return { agente: a, fijo: true };
  const porEtapa = agentePorEtapa(db, kind, rec);
  return porEtapa ? { agente: porEtapa } : {};
}

/* ── La operación ──
   El tablero general de los agentes en el servidor. `pausada` los detiene a
   todos de un golpe: siguen entrando los mensajes, pero nadie redacta ni
   envía. `topeAutomatico` es cuántos mensajes puede mandar solo un agente a
   una misma conversación en 24 horas antes de pasársela a una persona: corta
   los bucles (un bot que le contesta a otro) y las conversaciones que se le
   fueron de las manos. */
export const OPERACION_BASE = { pausada: false, topeAutomatico: 8 };

export function normalizaOperacion(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  return {
    pausada: Boolean(d.pausada),
    topeAutomatico: Math.min(50, Math.max(1, Math.round(Number(d.topeAutomatico)) || OPERACION_BASE.topeAutomatico)),
  };
}

/* ── Supervisión ──
   Cada cosa que hace o propone un agente deja aquí su huella, para que una
   persona la revise: lo que espera aprobación, lo que salió solo, lo que
   pasó a una persona y lo que falló.
     pendiente   — redactado, espera que una persona lo apruebe
     enviando    — saliendo ahora (evita mandarlo dos veces)
     enviado     — salió (solo o aprobado)
     descartado  — una persona dijo que no
     reemplazado — llegó otro mensaje antes de aprobarlo: hay uno más nuevo
     traspaso    — el agente pidió que atienda una persona
     fallo       — no se pudo redactar o enviar; el error dice por qué
     info        — algo que un agente hizo o que pasó y conviene saber (una
                   campaña creada, un lead que se registró o pagó)
   `tipo` dice de qué se trata: respuesta (por omisión), campana, seguimiento
   o conversion. */
export const ESTADOS_SUPERVISION = ["pendiente", "enviando", "enviado", "descartado", "reemplazado", "traspaso", "fallo", "info"];
export const POR_REVISAR = ["pendiente", "traspaso", "fallo"];
export const MAX_SUPERVISION = 400;

export function normalizeSupervision(raw) {
  return arr(raw)
    .filter((x) => x && typeof x === "object" && x.id && ESTADOS_SUPERVISION.includes(x.estado))
    .slice(0, MAX_SUPERVISION);
}

/* Una entrada nueva arriba, con su id y su hora. */
export const conAnotacion = (db, item) => [
  { id: uid(), at: nowISO(), estado: "info", ...item },
  ...normalizeSupervision(db.supervision),
].slice(0, MAX_SUPERVISION);
