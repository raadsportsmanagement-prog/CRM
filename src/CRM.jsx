import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  LayoutDashboard, Users, Building2, Briefcase, Activity, MessageSquare, Mail,
  Phone, Settings, Plus, Upload, Search, X, Check, ChevronDown, Trash2, Copy,
  FileText, Clock, Eye, Download, Plug, Send, ExternalLink, ShieldCheck, LogOut,
  Code2, Paperclip, Inbox, RefreshCw, CornerDownLeft, ArrowDownLeft, User,
  MailOpen, MousePointerClick, MailX, Gauge, Pencil,
  Zap, Sparkles, Play, Pause, ListChecks, AlertTriangle, History, BellRing, Braces,
  Megaphone, UserPlus
} from "lucide-react";
import {
  EMAIL_MODES, WHATSAPP_MODES, normalizeIntegrations, toE164, waLink,
  gmailComposeLink, mailtoLink, gmailStatus, onGmailChange, connectGmail,
  disconnectGmail, sendGmail, withSignature, withSignatureHtml, htmlToText, escapeHtml,
  traerCorreos, traerRebotes,
} from "./integrations.js";
import {
  midiendo, nuevoTrk, marcarHtml, textoAHtml, traerEventos, probarMedidor, estadoDe,
} from "./tracking.js";
import {
  traerLeads, traerCampanas, enviarWhatsApp, probarPuente,
  leadAProps, leadATexto, leadAAsunto, nombrePlataforma,
} from "./anuncios.js";
import {
  EVENTOS, ACCIONES, OPERADORES, EJEMPLOS, eventoDe, accionDe, esSaliente, necesitaMano,
  camposDe, campoDe, etiquetaCampo, etapasDe, automatizacionVacia, normalizaAutomatizacion,
  normalizeAutomations, normalizeCola, normalizeLog, aDsl, deDsl, compilarVibe, resumenDe,
  textoAccion, avisosDe, cumple, disparar, barrerFrios, podarMarcas, esperaEnTexto,
  coleccionDe, buscarFicha,
} from "./automations.js";

/* ────────────────────────────────────────────────────────────
   Paleta y tipografía
   ──────────────────────────────────────────────────────────── */
const C = {
  canvas: "#EDEFE9",
  panel: "#FFFFFF",
  ink: "#131C1A",
  mute: "#5D6A66",
  faint: "#8A9591",
  line: "#D9DDD4",
  jade: "#0E5C4F",
  jadeSoft: "#DCEAE4",
  blue: "#2A4E86",
  blueSoft: "#DDE5F2",
  amber: "#9C6A12",
  amberSoft: "#F3E7CD",
  clay: "#A8412A",
  claySoft: "#F3DFD9",
  plum: "#5B3A6E",
  plumSoft: "#E7DEEC",
};

const CHANNEL = {
  whatsapp: { label: "WhatsApp", color: C.jade, soft: C.jadeSoft, Icon: MessageSquare },
  email: { label: "Correo", color: C.blue, soft: C.blueSoft, Icon: Mail },
  call: { label: "Llamada", color: C.amber, soft: C.amberSoft, Icon: Phone },
  note: { label: "Nota", color: C.mute, soft: "#E6E9E3", Icon: FileText },
};

const STAGES = [
  { key: "nuevo", label: "Nuevo", color: C.mute },
  { key: "contactado", label: "Contactado", color: C.blue },
  { key: "calificado", label: "Calificado", color: C.plum },
  { key: "propuesta", label: "Propuesta", color: C.amber },
  { key: "negociacion", label: "Negociación", color: "#7A5A0F" },
  { key: "ganado", label: "Ganado", color: C.jade },
  { key: "perdido", label: "Perdido", color: C.clay },
];
const stageColor = (k) => (STAGES.find((s) => s.key === k) || {}).color || C.mute;
const stageLabel = (k) => (STAGES.find((s) => s.key === k) || {}).label || k;

/* ────────────────────────────────────────────────────────────
   Esquema de propiedades (editable en Configuración)
   ──────────────────────────────────────────────────────────── */
const LEAD_STATUS = ["Nuevo", "Abierto", "Intento de contacto", "Conectado", "Calificado", "Descalificado"];
/* Estado de la dirección de correo. No lo escribe nadie a mano: lo pone el
   barrido de Gmail cuando vuelve un rebote, y el medidor cuando alguien abre o
   pincha —que es la prueba de que el correo sí llegó—. */
const MAIL_STATUS = ["Entregado", "Rebote temporal", "Rebotado"];
/* Un rebote definitivo no lo borra una apertura vieja que llegue tarde: el
   estado sólo sube de rango, nunca baja solo. */
const RANGO_MAIL = { "": 0, Entregado: 1, "Rebote temporal": 2, Rebotado: 3 };
const peorEstado = (a, b) => ((RANGO_MAIL[b] || 0) > (RANGO_MAIL[a] || 0) ? b : a || "");
const LEAD_SOURCE = ["Meta Lead Ads", "Google Lead Form", "Facebook", "Instagram", "WhatsApp", "Sitio web", "Referido", "Evento", "Carga masiva", "Manual", "Llamada entrante"];

const BASE_SCHEMA = {
  contact: [
    { key: "firstName", label: "Nombre", type: "text", system: true, col: true, required: true },
    { key: "lastName", label: "Apellido", type: "text", system: true, col: true },
    { key: "phone", label: "Teléfono", type: "phone", system: true, col: true },
    { key: "email", label: "Correo", type: "email", system: true, col: true },
    { key: "emailStatus", label: "Estado del correo", type: "select", options: MAIL_STATUS, system: true, readOnly: true, col: false },
    { key: "leadStatus", label: "Estado de lead", type: "select", options: LEAD_STATUS, system: true, col: true },
    { key: "leadSource", label: "Fuente de lead", type: "select", options: LEAD_SOURCE, system: true, col: true },
    { key: "campaign", label: "Campaña", type: "text", system: true, readOnly: true, col: false },
    { key: "institution", label: "Institución", type: "text", system: true, col: true },
    { key: "type", label: "Tipo", type: "select", options: ["Prospecto", "Estudiante", "Acudiente", "Docente", "Cliente", "Aliado", "Otro"], system: true, col: false },
    { key: "lastActivityAt", label: "Última actividad", type: "datetime", system: true, readOnly: true, col: true },
    { key: "createdAt", label: "Fecha de creación", type: "datetime", system: true, readOnly: true, col: false },
  ],
  company: [
    { key: "name", label: "Nombre", type: "text", system: true, col: true, required: true },
    { key: "lastName", label: "Apellido del contacto", type: "text", system: true, col: false },
    { key: "phone", label: "Teléfono", type: "phone", system: true, col: true },
    { key: "email", label: "Correo", type: "email", system: true, col: true },
    { key: "emailStatus", label: "Estado del correo", type: "select", options: MAIL_STATUS, system: true, readOnly: true, col: false },
    { key: "leadStatus", label: "Estado de lead", type: "select", options: LEAD_STATUS, system: true, col: true },
    { key: "leadSource", label: "Fuente de lead", type: "select", options: LEAD_SOURCE, system: true, col: true },
    { key: "campaign", label: "Campaña", type: "text", system: true, readOnly: true, col: false },
    { key: "url", label: "URL", type: "url", system: true, col: true },
    { key: "type", label: "Tipo", type: "select", options: ["Prospecto", "Cliente", "Aliado", "Proveedor", "Competidor", "Otro"], system: true, col: true },
    { key: "lastActivityAt", label: "Última actividad", type: "datetime", system: true, readOnly: true, col: true },
    { key: "createdAt", label: "Fecha de creación", type: "datetime", system: true, readOnly: true, col: false },
  ],
  deal: [
    { key: "name", label: "Nombre", type: "text", system: true, col: true, required: true },
    { key: "stage", label: "Etapa del negocio", type: "select", options: STAGES.map((s) => s.label), system: true, col: true },
    { key: "source", label: "Fuente del negocio", type: "select", options: LEAD_SOURCE, system: true, col: true },
    { key: "wonReason", label: "Motivo de cierre ganado", type: "select", options: ["Precio", "Producto", "Tiempos de entrega", "Relación previa", "Referido", "Otro"], system: true, col: false, showIf: { key: "stage", value: "Ganado" } },
    { key: "lostReason", label: "Motivo de cierre perdido", type: "select", options: ["Precio", "Sin presupuesto", "Eligió competencia", "Sin respuesta", "Fuera de tiempo", "Otro"], system: true, col: false, showIf: { key: "stage", value: "Perdido" } },
    { key: "amount", label: "Valor", type: "number", system: true, col: true },
    { key: "lastActivityAt", label: "Última actividad", type: "datetime", system: true, readOnly: true, col: true },
    { key: "createdAt", label: "Fecha de creación", type: "datetime", system: true, readOnly: true, col: false },
  ],
};

const OBJ = {
  contact: { plural: "Contactos", singular: "Contacto", Icon: Users },
  company: { plural: "Empresas", singular: "Empresa", Icon: Building2 },
  deal: { plural: "Negocios", singular: "Negocio", Icon: Briefcase },
};

/* ────────────────────────────────────────────────────────────
   Utilidades
   ──────────────────────────────────────────────────────────── */
const uid = () => Math.random().toString(36).slice(2, 10);
const nowISO = () => new Date().toISOString();

const isToday = (iso) => {
  if (!iso) return false;
  const d = new Date(iso), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
};
const fmt = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  const t = d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  return isToday(iso) ? `Hoy · ${t}` : `${d.toLocaleDateString("es-CO", { day: "2-digit", month: "short" })} · ${t}`;
};
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

const NEW_PROP = "__new__"; // columna sin propiedad: se crea una nueva

/* El correo es la identidad de un contacto: dos fichas con la misma dirección
   son la misma persona partida en dos, y el historial —correos entrantes,
   rebotes, conversaciones— se reparte entre ambas sin que nadie lo note. Se
   compara sin espacios ni mayúsculas, porque "Laura@Correo.com " y
   "laura@correo.com" llegan a la misma bandeja; más allá de eso no se inventan
   equivalencias: dos direcciones distintas son dos personas. */
const emailKey = (v) => String(v || "").trim().toLowerCase();

/* La ficha que ya ocupa esa dirección, si la hay. `exceptId` deja fuera al
   propio registro al editar: guardar sin tocar el correo no debe denunciarse
   a sí mismo. Sin correo no hay con qué comparar y no hay duplicado que
   declarar —un contacto que sólo llegó por WhatsApp se da de alta igual—. */
const findByEmail = (coll, email, exceptId) => {
  const k = emailKey(email);
  if (!k) return null;
  return coll.find((r) => r.id !== exceptId && emailKey(r.props.email) === k) || null;
};

function parseCSV(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === "," || ch === ";" || ch === "\t") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch !== "\r") cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== "")).map((r) => r.map((c) => c.trim()));
}

/* enHtml: dentro de una plantilla HTML las variables se escapan antes de
   entrar. Una institución llamada "Ríos & Cía." no debe poder abrir una
   etiqueta ni romper un atributo del diseño. */
const applyTemplate = (text, rec, kind, enHtml) => {
  const p = rec.props || {};
  const map = {
    nombre: p.firstName || p.name || "",
    apellido: p.lastName || "",
    institucion: p.institution || p.name || "",
    empresa: p.name || p.institution || "",
    correo: p.email || "",
    telefono: p.phone || "",
  };
  return String(text || "").replace(/\{\{\s*([a-zA-ZñÑáéíóú_]+)\s*\}\}/g, (m, k) => {
    const v = map[norm(k)];
    if (v == null) return m;
    return enHtml ? escapeHtml(v) : v;
  });
};

const titleOf = (kind, rec) => {
  const p = rec.props || {};
  if (kind === "contact") return [p.firstName, p.lastName].filter(Boolean).join(" ") || "Sin nombre";
  return p.name || "Sin nombre";
};

/* ────────────────────────────────────────────────────────────
   Almacenamiento
   ──────────────────────────────────────────────────────────── */
const STORE_KEY = "crm:data";
const CORRUPT_KEY = "crm:data:ilegible";
const BACKUP_KEY = "crm:data:respaldo-antes-de-limpieza";
const DATA_VERSION = 1;

/* Espacio de trabajo vacío: sólo el esquema de propiedades. Sin registros ni
   plantillas de muestra; todo lo que aparezca en la app lo cargaste tú. */
const emptyDb = () => ({
  v: DATA_VERSION,
  schema: BASE_SCHEMA,
  contacts: [],
  companies: [],
  deals: [],
  activities: [],
  templates: { whatsapp: [], email: [] },
  integrations: normalizeIntegrations(null),
  /* Mensajes: hasta dónde llegó el último barrido del correo y cuándo se abrió
     cada conversación por última vez, que es lo que decide qué sale marcado
     como nuevo. */
  buzon: { correoAl: "", rebotesAl: "", eventosAl: "", leadsAl: "", vistoEn: {} },
  /* Automatizaciones: las reglas, lo que quedó esperando la hora o el visto
     bueno, el rastro de lo que hicieron y a qué fichas frías ya se les avisó. */
  automations: [],
  autoCola: [],
  autoLog: [],
  autoMarcas: {},
});

/* Completa las claves que falten sin descartar nada de lo guardado: si el
   archivo llega incompleto se rellena, en vez de arrancar de cero encima. */
function normalizeDb(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  const base = emptyDb();
  const arr = (x) => (Array.isArray(x) ? x : []);
  /* El esquema guardado manda —ahí están las propiedades que creaste tú— pero
     las de sistema que la app estrena después se agregan al final. Sin esto,
     una versión nueva del CRM añadiría una propiedad que ningún cuaderno ya
     existente llegaría a ver nunca: el archivo guardado la taparía para
     siempre. Se comparan por clave, así que una tuya con el mismo nombre se
     respeta y no se duplica. */
  const sch = (k) => {
    const guardado = arr(d.schema && d.schema[k]);
    if (!guardado.length) return base.schema[k];
    const hay = new Set(guardado.map((f) => f && f.key));
    const faltan = base.schema[k].filter((f) => f.system && !hay.has(f.key));
    return faltan.length ? [...guardado, ...faltan] : guardado;
  };
  return {
    ...d,
    v: DATA_VERSION,
    schema: { contact: sch("contact"), company: sch("company"), deal: sch("deal") },
    contacts: arr(d.contacts),
    companies: arr(d.companies),
    deals: arr(d.deals),
    /* Antes de Mensajes todo lo registrado era algo que salió de aquí, así que
       lo guardado sin sentido se lee como enviado. Es la única lectura cierta:
       el CRM no tenía forma de anotar una respuesta. */
    activities: arr(d.activities).map((a) => ({ ...a, dir: a && a.dir === "in" ? "in" : "out" })),
    /* Las plantillas guardadas antes del diseño HTML no traen ese campo: se
       completa vacío para que la pantalla no tenga que adivinarlo. */
    templates: {
      whatsapp: arr(d.templates && d.templates.whatsapp).map((t) => ({ ...t, html: "" })),
      email: arr(d.templates && d.templates.email).map((t) => ({ ...t, html: String((t && t.html) || "") })),
    },
    integrations: normalizeIntegrations(d.integrations),
    buzon: {
      correoAl: String((d.buzon && d.buzon.correoAl) || ""),
      /* Cada barrido lleva su propia marca. Con una sola compartida, activar el
         medidor meses después pediría los eventos "desde el último correo" y se
         perdería todo lo anterior; y al revés, un fallo del medidor arrastraría
         la fecha del correo. */
      rebotesAl: String((d.buzon && d.buzon.rebotesAl) || ""),
      eventosAl: String((d.buzon && d.buzon.eventosAl) || ""),
      /* Hasta dónde se trajeron los leads de los anuncios. Vacío quiere decir
         "nunca", y entonces se piden los 90 días que Meta todavía conserva. */
      leadsAl: String((d.buzon && d.buzon.leadsAl) || ""),
      vistoEn: (d.buzon && typeof d.buzon.vistoEn === "object" && d.buzon.vistoEn) || {},
    },
    automations: normalizeAutomations(d.automations),
    autoCola: normalizeCola(d.autoCola),
    autoLog: normalizeLog(d.autoLog),
    autoMarcas: (d.autoMarcas && typeof d.autoMarcas === "object" && d.autoMarcas) || {},
  };
}

/* ────────────────────────────────────────────────────────────
   Limpieza de los datos de demostración
   Las versiones anteriores sembraban registros, plantillas y leads simulados.
   Aquí quedan sus huellas exactas para borrarlos del almacenamiento una sola
   vez. La comparación es por correo + nombre exactos, así que un registro real
   —o uno de muestra que hayas editado— no se toca.
   ──────────────────────────────────────────────────────────── */
const DEMO_CONTACTS = [
  ["laura.rojas@sanandres.edu.co", "Laura Rojas"],
  ["andres.vega@panamericano.edu.co", "Andrés Vega"],
  ["marcela.salas@aprender.org", "Marcela Salas"],
  ["julian.ortiz@gmail.com", "Julián Ortiz"],
  ["diana.cardenas@outlook.com", "Diana Cárdenas"],
  ["camila.herrera@nogales.edu.co", "Camila Herrera"],
  ["santiago.mejia@gimsur.edu.co", "Santiago Mejía"],
  ["valeria.pineda@cng.edu.co", "Valeria Pineda"],
  ["tomas.restrepo@merani.edu.co", "Tomás Restrepo"],
  ["isabella.q@liceocampestre.edu.co", "Isabella Quintero"],
  ["mateo.guzman@sanbarto.edu.co", "Mateo Guzmán"],
];
const DEMO_COMPANIES = [
  ["admisiones@sanandres.edu.co", "Colegio San Andrés"],
  ["contacto@panamericano.edu.co", "Instituto Panamericano"],
  ["info@aprender.org", "Fundación Aprender"],
];
const DEMO_DEALS = [
  "Licencias 2026 · Colegio San Andrés",
  "Renovación · Instituto Panamericano",
  "Piloto · Fundación Aprender",
  "Plan anual · Liceo Moderno",
];
/* Plantillas de muestra: se comparan por el cuerpo exacto, de modo que si
   alguna la reescribiste queda como tuya y sobrevive. */
const DEMO_TEMPLATES = [
  "Hola {{nombre}}, soy del equipo comercial. Vi tu interés en nuestro programa para {{institucion}}. ¿Te queda bien una llamada de 15 minutos esta semana?",
  "Hola {{nombre}}, te recuerdo nuestra reunión de mañana. Te comparto el enlace apenas confirmes.",
  "Hola {{nombre}}, seguimos con cupos para {{institucion}} este semestre. ¿Retomamos la conversación?",
  "Hola {{nombre}},\n\nTe comparto el catálogo con los programas disponibles para 2026 y los planes por número de estudiantes.\n\nQuedo atento a tus comentarios.",
  "Hola {{nombre}},\n\nAdjunto la propuesta que revisamos. Incluye la vigencia y las condiciones de implementación.\n\nUn saludo.",
];

function purgeDemoData(db) {
  const fp = (a, b) => `${norm(a)}|${norm(b)}`;
  const cSet = new Set(DEMO_CONTACTS.map(([e, n]) => fp(e, n)));
  const oSet = new Set(DEMO_COMPANIES.map(([e, n]) => fp(e, n)));
  const dSet = new Set(DEMO_DEALS.map((n) => norm(n)));
  const tSet = new Set(DEMO_TEMPLATES.map((b) => norm(b)));

  const goneC = new Set(db.contacts
    .filter((r) => cSet.has(fp((r.props || {}).email, [(r.props || {}).firstName, (r.props || {}).lastName].filter(Boolean).join(" "))))
    .map((r) => r.id));
  const goneO = new Set(db.companies
    .filter((r) => oSet.has(fp((r.props || {}).email, (r.props || {}).name)))
    .map((r) => r.id));
  const goneD = new Set(db.deals
    .filter((r) => dSet.has(norm((r.props || {}).name)))
    .map((r) => r.id));

  const contacts = db.contacts
    .filter((r) => !goneC.has(r.id))
    .map((r) => (goneO.has(r.companyId) ? { ...r, companyId: undefined } : r));
  const companies = db.companies.filter((r) => !goneO.has(r.id));
  const deals = db.deals.filter((r) => !goneD.has(r.id)).map((r) => ({
    ...r,
    companyId: goneO.has(r.companyId) ? undefined : r.companyId,
    contactIds: (r.contactIds || []).filter((id) => !goneC.has(id)),
  }));

  /* Una actividad se borra sólo si todo lo que tocaba era de demostración; si
     también apuntaba a un registro tuyo, se conserva sin esa referencia. */
  const activities = db.activities
    .filter((a) => {
      const ids = [...(a.contactIds || []), ...(a.companyIds || [])];
      const touched = ids.some((id) => goneC.has(id) || goneO.has(id)) || Boolean(a.dealId && goneD.has(a.dealId));
      if (!touched) return true;
      return ids.some((id) => !goneC.has(id) && !goneO.has(id)) || Boolean(a.dealId && !goneD.has(a.dealId));
    })
    .map((a) => ({
      ...a,
      contactIds: (a.contactIds || []).filter((id) => !goneC.has(id)),
      companyIds: (a.companyIds || []).filter((id) => !goneO.has(id)),
    }));

  const clean = (list) => (list || []).filter((t) => !tSet.has(norm(t.body)));
  const templates = { whatsapp: clean(db.templates.whatsapp), email: clean(db.templates.email) };

  const { meta, ...rest } = db; // la conexión simulada con Meta ya no existe
  const removed = {
    contactos: goneC.size,
    empresas: goneO.size,
    negocios: goneD.size,
    actividades: db.activities.length - activities.length,
    plantillas:
      db.templates.whatsapp.length + db.templates.email.length -
      (templates.whatsapp.length + templates.email.length),
  };
  const total = Object.values(removed).reduce((a, b) => a + b, 0);
  return { db: { ...rest, contacts, companies, deals, activities, templates }, removed, total };
}

/* ────────────────────────────────────────────────────────────
   Átomos de UI
   ──────────────────────────────────────────────────────────── */
const Btn = ({ children, onClick, variant = "ghost", size = "md", Icon, disabled, style }) => {
  const base = { display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 6, fontFamily: "var(--ui)", fontWeight: 500, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1, borderWidth: 1, borderStyle: "solid", borderColor: "transparent", transition: "background .12s, border-color .12s", whiteSpace: "nowrap" };
  const sizes = { sm: { fontSize: 12, padding: "5px 9px" }, md: { fontSize: 13, padding: "7px 12px" } };
  const variants = {
    solid: { background: C.jade, color: "#fff", borderColor: "transparent" },
    outline: { background: C.panel, color: C.ink, borderColor: C.line },
    ghost: { background: "transparent", color: C.mute, borderColor: "transparent" },
    danger: { background: C.panel, color: C.clay, borderColor: C.claySoft },
  };
  return (
    <button className="crm-btn" disabled={disabled} onClick={onClick} style={{ ...base, ...sizes[size], ...variants[variant], ...style }}>
      {Icon && <Icon size={size === "sm" ? 13 : 14} strokeWidth={2} />} {children}
    </button>
  );
};

const Pill = ({ children, color = C.mute, soft = "#E6E9E3" }) => (
  <span style={{ background: soft, color, fontFamily: "var(--ui)", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, letterSpacing: ".01em", whiteSpace: "nowrap" }}>{children}</span>
);

const Modal = ({ title, subtitle, onClose, children, footer, wide }) => (
  <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(19,28,26,.42)", zIndex: 60, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6vh 16px", overflowY: "auto" }}>
    <div onClick={(e) => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, width: "100%", maxWidth: wide ? 860 : 520, boxShadow: "0 24px 60px rgba(19,28,26,.22)" }}>
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "var(--display)", fontSize: 17, fontWeight: 600, color: C.ink }}>{title}</div>
          {subtitle && <div style={{ fontFamily: "var(--ui)", fontSize: 12.5, color: C.mute, marginTop: 3 }}>{subtitle}</div>}
        </div>
        <button onClick={onClose} className="crm-btn" style={{ background: "transparent", border: "none", cursor: "pointer", color: C.faint, padding: 4, borderRadius: 5 }}><X size={17} /></button>
      </div>
      <div style={{ padding: 20 }}>{children}</div>
      {footer && <div style={{ padding: "13px 20px", borderTop: `1px solid ${C.line}`, display: "flex", justifyContent: "flex-end", gap: 8, background: "#FAFBF9", borderRadius: "0 0 10px 10px" }}>{footer}</div>}
    </div>
  </div>
);

const inputStyle = { width: "100%", border: `1px solid ${C.line}`, borderRadius: 6, padding: "8px 10px", fontFamily: "var(--ui)", fontSize: 13, color: C.ink, background: C.panel, outline: "none" };

const Field = ({ def, value, onChange }) => (
  <label style={{ display: "block" }}>
    <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, fontWeight: 600, color: C.mute, marginBottom: 5, letterSpacing: ".02em" }}>
      {def.label}{def.required && <span style={{ color: C.clay }}> *</span>}
    </div>
    {def.type === "select" ? (
      <select className="crm-in" value={value || ""} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
        <option value="">—</option>
        {(def.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    ) : def.type === "textarea" ? (
      <textarea className="crm-in" rows={4} value={value || ""} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} />
    ) : (
      <input className="crm-in" type={def.type === "number" ? "number" : def.type === "date" ? "date" : "text"} value={value || ""} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    )}
  </label>
);

/* El permiso de Gmail vive en un módulo, no en React: este hook deja que
   cualquier pantalla se entere cuando se conecta o se cae. */
function useGmail() {
  const [st, setSt] = useState(gmailStatus);
  useEffect(() => onGmailChange(setSt), []);
  return st;
}

const Empty = ({ title, hint, action }) => (
  <div style={{ padding: "56px 24px", textAlign: "center" }}>
    <div style={{ fontFamily: "var(--display)", fontSize: 15, fontWeight: 600, color: C.ink }}>{title}</div>
    <div style={{ fontFamily: "var(--ui)", fontSize: 13, color: C.mute, marginTop: 5, marginBottom: 16 }}>{hint}</div>
    {action}
  </div>
);

/* ────────────────────────────────────────────────────────────
   App
   ──────────────────────────────────────────────────────────── */
export default function CRM() {
  const [db, setDb] = useState(null);
  const [view, setView] = useState("dashboard");
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null); // {kind:'record'|'import'|'prop'|'send'|'deal', ...}
  const [detail, setDetail] = useState(null); // {kind, id}
  const [save, setSave] = useState({ state: "idle", at: null, error: null });
  const [fatal, setFatal] = useState(null);

  const dbRef = useRef(null);
  const pending = useRef(false);
  const external = useRef(false);
  /* Cada cambio sube `rev`. El guardado anota qué número está escribiendo y
     sólo baja la bandera de pendiente si nadie tocó nada mientras escribía; si
     entró un cambio nuevo, sigue pendiente y lo alcanza el guardado siguiente.
     Sin esto, una escritura vieja podría declarar "todo guardado" y dejar el
     último cambio sin escribir hasta que el usuario tocara otra cosa. */
  const rev = useRef(0);
  const brokenSave = useRef(false);

  const say = (m) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  /* Escritura real en el almacenamiento. Se dispara al vencer el rebote y
     también al cerrar o esconder la pestaña, para que nada quede a medias. */
  const persist = React.useCallback(() => {
    if (!pending.current || !dbRef.current) return;
    const writing = rev.current;
    const failed = (e) => {
      brokenSave.current = true;
      /* Quedarse sin espacio es el fallo probable y el único con solución a la
         mano, así que se nombra en vez de mostrar el mensaje crudo del navegador. */
      const lleno = e && (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED" || e.code === 22);
      setSave({ state: "error", at: null, error: lleno ? "el navegador se quedó sin espacio para este sitio" : (e && e.message) || String(e) });
    };
    const ok = () => {
      brokenSave.current = false;
      if (rev.current === writing) pending.current = false;
      setSave({ state: pending.current ? "saving" : "saved", at: new Date(), error: null });
    };
    let payload;
    try { payload = JSON.stringify(dbRef.current); }
    catch (e) { return failed(e); }
    try {
      /* Con localStorage la escritura ya ocurrió al volver de aquí, así que se
         confirma en el acto; un almacenamiento que devuelva promesa se espera. */
      const r = window.storage.set(STORE_KEY, payload);
      if (r && typeof r.then === "function") r.then(ok, failed);
      else ok();
    } catch (e) { failed(e); }
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      let raw = null;
      try { const r = await window.storage.get(STORE_KEY); raw = r ? r.value : null; }
      catch (e) {
        if (live) setFatal(`No pude abrir el almacenamiento de este navegador (${(e && e.message) || e}). Suele pasar en ventanas de incógnito o con las cookies bloqueadas para este sitio; no se cargó nada para no arriesgar lo que ya esté guardado.`);
        return;
      }

      let parsed = null;
      if (raw) {
        try { parsed = JSON.parse(raw); }
        catch (e) {
          /* No arrancamos vacíos: eso borraría lo guardado en el primer cambio.
             Se preserva el original tal cual y se avisa. */
          try { await window.storage.set(CORRUPT_KEY, raw); } catch (_) {}
          if (live) setFatal(`Los datos guardados no se pudieron leer (${(e && e.message) || e}). No se sobrescribió nada: quedan intactos en la clave “${CORRUPT_KEY}” del navegador para recuperarlos.`);
          return;
        }
      }

      let next = normalizeDb(parsed);
      let cleaned = 0;
      if (!next.demoPurgedAt) {
        const res = purgeDemoData(next);
        cleaned = res.total;
        if (cleaned > 0 && raw) { try { await window.storage.set(BACKUP_KEY, raw); } catch (_) {} }
        next = { ...res.db, demoPurgedAt: nowISO() };
      }
      if (!live) return;
      dbRef.current = next;
      setDb(next);
      if (cleaned > 0) say(`Se eliminaron ${cleaned} elementos de demostración`);
    })();
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!db) return;
    dbRef.current = db;
    if (external.current) { external.current = false; return; } // llegó ya guardado de otra pestaña
    rev.current += 1;
    pending.current = true;
    setSave((s) => ({ ...s, state: "saving" }));
    const t = setTimeout(persist, 300);
    return () => clearTimeout(t);
  }, [db, persist]);

  /* Con el CRM abierto en dos pestañas, la que no tiene cambios pendientes
     adopta lo que escribió la otra en vez de pisarlo al guardar. */
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== STORE_KEY || !e.newValue || pending.current) return;
      try {
        const next = normalizeDb(JSON.parse(e.newValue));
        external.current = true;
        dbRef.current = next;
        setDb(next);
      } catch (_) {}
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  /* Cerrar la pestaña, recargar o pasar a otra app vacía lo que esté pendiente.
     Y si esa última escritura falla —el caso real es el almacenamiento lleno—
     el navegador pregunta antes de cerrar, en vez de llevarse el cambio en
     silencio: da la oportunidad de descargar un respaldo. */
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") persist(); };
    const onLeave = (e) => {
      persist();
      if (pending.current && brokenSave.current) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", onLeave);
    window.addEventListener("pagehide", persist);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", onLeave);
      window.removeEventListener("pagehide", persist);
      document.removeEventListener("visibilitychange", onHide);
      persist();
    };
  }, [persist]);

  /* Google recuerda el consentimiento, así que al recargar se puede recuperar
     el permiso sin abrir ninguna ventana ni preguntar nada. Si falla se queda
     desconectado en silencio: el usuario lo verá en Conexiones. */
  const triedGmail = useRef(false);
  const emailCfg = db && db.integrations.email;
  useEffect(() => {
    if (triedGmail.current) return;
    /* Con la bandeja activada se renueva aunque el envío no sea por la API:
       leer el correo es un permiso propio y Mensajes lo necesita igual. */
    if (!emailCfg || !emailCfg.clientId) return;
    if (emailCfg.mode !== "gmailApi" && !emailCfg.leerBandeja) return;
    triedGmail.current = true;
    connectGmail(emailCfg.clientId, { silent: true, leer: emailCfg.leerBandeja }).catch(() => {});
  }, [emailCfg && emailCfg.mode, emailCfg && emailCfg.clientId, emailCfg && emailCfg.leerBandeja]);

  /* ── mutaciones ── */
  const collKey = (kind) => (kind === "contact" ? "contacts" : kind === "company" ? "companies" : "deals");

  const addRecords = (kind, list) => setDb((d) => ({ ...d, [collKey(kind)]: [...list, ...d[collKey(kind)]] }));
  const updateRecord = (kind, id, props) => setDb((d) => ({
    ...d, [collKey(kind)]: d[collKey(kind)].map((r) => (r.id === id ? { ...r, props: { ...r.props, ...props } } : r)),
  }));
  const deleteRecords = (kind, ids) => setDb((d) => ({ ...d, [collKey(kind)]: d[collKey(kind)].filter((r) => !ids.includes(r.id)) }));

  /* Un mismo valor en muchas fichas de una sola pasada. `mode` decide a quién
     le toca: "fill" sólo a los que tienen el campo vacío, "overwrite" a todos
     los marcados y "clear" borra el valor. La cuenta se saca del estado que ya
     está en memoria y no dentro de setDb, porque React puede correr ese
     actualizador después de que esta función regresó —y en modo estricto lo
     corre dos veces—, así que el aviso diría cero habiendo cambiado cientos. */
  const setPropOnRecords = (kind, ids, key, value, mode) => {
    const marcados = new Set(ids);
    const vacio = (v) => v === undefined || v === null || v === "";
    const alcanza = (r) => marcados.has(r.id) && (mode === "fill" ? vacio(r.props[key]) : mode === "clear" ? !vacio(r.props[key]) : true);
    const escribir = (props) => {
      if (mode === "clear") { const { [key]: _fuera, ...resto } = props; return resto; }
      return { ...props, [key]: value };
    };
    const actuales = ((dbRef.current || db)[collKey(kind)] || []);
    const n = actuales.filter((r) => alcanza(r) && String(r.props[key] == null ? "" : r.props[key]) !== (mode === "clear" ? "" : value)).length;
    setDb((d) => ({ ...d, [collKey(kind)]: d[collKey(kind)].map((r) => (alcanza(r) ? { ...r, props: escribir(r.props) } : r)) }));
    return n;
  };

  const logActivity = (act) => setDb((d) => {
    const at = act.at || nowISO();
    const dir = act.dir === "in" ? "in" : "out";
    const stamp = (arr) => arr.map((r) => ((act.contactIds || []).includes(r.id) || (act.companyIds || []).includes(r.id)) ? { ...r, props: { ...r.props, lastActivityAt: at } } : r);
    return {
      ...d,
      activities: [{ id: uid(), ...act, at, dir }, ...d.activities],
      contacts: stamp(d.contacts),
      companies: stamp(d.companies),
      deals: act.dealId ? d.deals.map((x) => x.id === act.dealId ? { ...x, props: { ...x.props, lastActivityAt: at } } : x) : d.deals,
    };
  });

  /* Entrada masiva desde el correo. Se descarta lo que ya está guardado
     comparando el identificador de Gmail, así que sincronizar dos veces no
     duplica nada y se puede repetir sin miedo. */
  const importActivities = (list) => {
    /* La cuenta se saca aquí y no dentro de setDb: React puede ejecutar el
       actualizador después de que esta función haya regresado —y en modo
       estricto lo ejecuta dos veces—, así que un contador escrito allá adentro
       vuelve en cero y el aviso diría "sin correos nuevos" habiendo traído
       decenas. Los identificadores también se reparten aquí por lo mismo. */
    const actuales = (dbRef.current || db || {}).activities || [];
    const vistos = new Set(actuales.map((a) => a.ext).filter(Boolean));
    const conId = list
      .filter((a) => a.ext && !vistos.has(a.ext))
      .map((a) => ({ id: uid(), ...a }));
    if (!conId.length) return 0;

    setDb((d) => {
      /* Se vuelve a filtrar contra el estado real por si entró algo entre
         medias —otra pestaña, dos sincronizaciones seguidas—. */
      const yaEstan = new Set(d.activities.map((a) => a.ext).filter(Boolean));
      const entran = conId.filter((a) => !yaEstan.has(a.ext));
      if (!entran.length) return d;

      /* La última actividad de cada ficha se recalcula sólo hacia adelante: un
         correo viejo que llega tarde al CRM no debe hacer retroceder la fecha
         que ya mostraba el registro. */
      const ultima = new Map();
      entran.forEach((a) => [...(a.contactIds || []), ...(a.companyIds || [])].forEach((id) => {
        if (!ultima.has(id) || ultima.get(id) < a.at) ultima.set(id, a.at);
      }));
      const sellar = (arr) => arr.map((r) => {
        const at = ultima.get(r.id);
        if (!at || (r.props.lastActivityAt && r.props.lastActivityAt >= at)) return r;
        return { ...r, props: { ...r.props, lastActivityAt: at } };
      });
      return {
        ...d,
        activities: [...entran, ...d.activities].sort((a, b) => (a.at < b.at ? 1 : -1)),
        contacts: sellar(d.contacts),
        companies: sellar(d.companies),
      };
    });
    return conId.length;
  };

  /* ── Los leads de los anuncios ──
     Un lead trae dos cosas a la vez y se guardan por separado a propósito:

       · una persona, que se convierte en ficha. Antes de crearla se busca, y
         se busca por correo y por teléfono: quien ya está en el CRM y vuelve a
         llenar un formulario no debe partirse en dos fichas con la mitad del
         historial cada una. El correo manda; el teléfono es el respaldo,
         porque un formulario de Instagram muchas veces sólo pide eso.

       · lo que escribió, que se convierte en una actividad recibida con el
         formulario entero dentro. Va así y no en columnas nuevas porque cada
         campaña pregunta otra cosa: convertir cada pregunta en una propiedad
         llenaría el CRM de columnas vacías en un mes. Aquí queda todo, en la
         ficha de esa persona y con su fecha.

     El identificador que da Meta o Google viaja en la actividad, y ahí es
     donde se ataja el duplicado: importActivities descarta lo que ya tiene ese
     `ext`, así que traer los leads dos veces no crea nada dos veces —ni la
     ficha, porque para entonces ya existe y se encuentra—. */
  const importarLeads = (leads, destino) => {
    const kind = destino === "company" ? "company" : "contact";
    const coll = collKey(kind);
    /* Del estado en memoria y no de dentro de setDb: React puede correr ese
       actualizador después de que esta función haya regresado —y en modo
       estricto lo corre dos veces—, así que las cuentas saldrían en cero y el
       aviso diría "sin leads nuevos" habiendo traído veinte. */
    const actual = dbRef.current || db;
    const vistos = new Set((actual.activities || []).map((a) => a.ext).filter(Boolean));
    const entran = (leads || []).filter((l) => l && l.ext && !vistos.has(l.ext));
    if (!entran.length) return { fichas: 0, leads: 0 };

    const cc = actual.integrations.whatsapp.countryCode;
    /* Los teléfonos se comparan ya normalizados: "300 123 4567" y
       "+57 300 1234567" son el mismo número y crearían dos fichas. */
    const claveTel = (v) => toE164(v, cc);
    const porCorreo = new Map(), porTel = new Map();
    (actual[coll] || []).forEach((r) => {
      const c = emailKey(r.props.email);
      if (c && !porCorreo.has(c)) porCorreo.set(c, r.id);
      const t = claveTel(r.props.phone);
      if (t && !porTel.has(t)) porTel.set(t, r.id);
    });

    const fichas = [], acts = [];
    for (const lead of entran) {
      const props = leadAProps(lead, kind);
      const c = emailKey(props.email), t = claveTel(props.phone);
      let id = (c && porCorreo.get(c)) || (t && porTel.get(t)) || "";
      if (!id) {
        id = uid();
        fichas.push({ id, props });
        /* Se anota en el índice al vuelo: dos leads de la misma persona en la
           misma tanda —dos formularios, dos campañas— son una sola ficha. */
        if (c) porCorreo.set(c, id);
        if (t) porTel.set(t, id);
      }
      acts.push({
        ext: lead.ext,
        /* Nota y no mensaje: un formulario no es una conversación, y meterlo en
           Mensajes pondría un hilo con una sola frase que nadie escribió a
           nadie. Queda en Actividades y en la ficha, que es donde se mira. */
        type: "note", dir: "in", at: lead.at || nowISO(),
        subject: leadAAsunto(lead), body: leadATexto(lead),
        contactIds: kind === "contact" ? [id] : [],
        companyIds: kind === "company" ? [id] : [],
      });
    }

    /* Las fichas primero: la actividad que entra después las nombra, y
       importActivities les pone la fecha de última actividad. React aplica los
       dos actualizadores en orden sobre el mismo estado. */
    if (fichas.length) setDb((d) => ({ ...d, [coll]: [...fichas, ...d[coll]] }));
    return { fichas: fichas.length, leads: importActivities(acts) };
  };

  /* ── Lo que anotó el medidor ──
     Los eventos llegan sueltos —"el envío ab12ef abrió a tal hora"— y aquí se
     pegan a la actividad que los espera. El identificador es lo único que los
     une: el medidor nunca supo de quién era ese correo, y ésa es justamente la
     idea. Un evento cuyo envío ya no exista en el cuaderno se descarta sin
     ruido; su actividad pudo borrarse hace meses. */
  const aplicarEventos = (eventos) => {
    const porTrk = new Map();
    for (const e of eventos || []) {
      if (!e || !e.trk || !e.at) continue;
      if (!porTrk.has(e.trk)) porTrk.set(e.trk, []);
      porTrk.get(e.trk).push(e);
    }
    if (!porTrk.size) return 0;

    /* Se pide con un minuto de solape, así que los mismos eventos vuelven a
       llegar en cada pasada: sin esta comparación, un contacto acumularía una
       apertura nueva cada vez que se pulsa Actualizar. Fecha y tipo alcanzan
       para reconocerlos —dos aperturas distintas al mismo milisegundo no
       existen—. */
    const huella = (tipo, at, u) => `${tipo}|${at}|${u || ""}`;
    const fusionar = (a, evs) => {
      const aperturas = [...(a.aperturas || [])];
      const clics = [...(a.clics || [])];
      const vistos = new Set([
        ...aperturas.map((x) => huella("apertura", x.at)),
        ...clics.map((x) => huella("clic", x.at, x.u)),
      ]);
      let cambios = 0;
      for (const e of evs) {
        const h = huella(e.tipo, e.at, e.u);
        if (vistos.has(h)) continue;
        vistos.add(h);
        cambios++;
        if (e.tipo === "clic") clics.push({ at: e.at, u: e.u || "", ua: e.ua || "", pais: e.pais || "" });
        else aperturas.push({ at: e.at, ua: e.ua || "", pais: e.pais || "" });
      }
      if (!cambios) return null;
      const porFecha = (x, y) => (x.at < y.at ? -1 : 1);
      /* Un tope por si un correo acaba reenviado por media empresa: lo que
         importa es la primera apertura y la lista de enlaces, no un registro
         infinito que engorde el almacenamiento del navegador. */
      return { aperturas: aperturas.sort(porFecha).slice(0, 200), clics: clics.sort(porFecha).slice(0, 200) };
    };

    const actuales = (dbRef.current || db || {}).activities || [];
    const cambios = new Map();
    const entregados = new Set();
    for (const a of actuales) {
      const evs = a.trk && porTrk.get(a.trk);
      if (!evs) continue;
      const fusion = fusionar(a, evs);
      if (!fusion) continue;
      cambios.set(a.id, fusion);
      /* Una apertura o un clic prueban lo que ningún acuse de recibo prueba:
         que el correo llegó a un buzón de verdad y alguien lo tenía delante. */
      [...(a.contactIds || []), ...(a.companyIds || [])].forEach((id) => entregados.add(id));
    }
    if (!cambios.size) return 0;

    const sellar = (arr) => arr.map((r) => (
      entregados.has(r.id) && peorEstado(r.props.emailStatus, "Entregado") !== r.props.emailStatus
        ? { ...r, props: { ...r.props, emailStatus: peorEstado(r.props.emailStatus, "Entregado") } }
        : r
    ));
    setDb((d) => ({
      ...d,
      activities: d.activities.map((a) => (cambios.has(a.id) ? { ...a, ...cambios.get(a.id) } : a)),
      contacts: sellar(d.contacts),
      companies: sellar(d.companies),
    }));
    return cambios.size;
  };

  /* ── Los que no llegaron ──
     El aviso de rebote ya entró al historial como mensaje recibido. Falta lo
     que de verdad sirve: marcar cuál de los envíos fue el que no llegó, y dejar
     la dirección señalada para no volver a gastar un envío en ella. */
  const aplicarRebotes = (lista) => {
    if (!(lista || []).length) return 0;
    const actuales = (dbRef.current || db || {}).activities || [];
    const yaEstaban = new Set(actuales.map((a) => a.ext).filter(Boolean));

    const marcas = new Map();
    const estados = new Map();
    for (const r of lista) {
      const ids = new Set([...(r.contactIds || []), ...(r.companyIds || [])]);
      if (!ids.size) continue;
      const estado = r.permanente ? "Rebotado" : "Rebote temporal";
      ids.forEach((id) => estados.set(id, peorEstado(estados.get(id) || "", estado)));

      /* Qué envío rebotó. El aviso trae el asunto del original, y ése es el
         mejor indicio; cuando no viene —hay servidores que no lo adjuntan— se
         toma el último correo que salió a esa persona antes del rebote, que es
         lo que cualquiera supondría mirando las fechas. Nunca uno posterior:
         un rebote no puede hablar de algo que todavía no se había enviado. */
      const toca = (a) => (a.contactIds || []).some((x) => ids.has(x)) || (a.companyIds || []).some((x) => ids.has(x));
      const previos = actuales.filter((a) => a.type === "email" && a.dir === "out" && a.at <= r.at && toca(a));
      if (!previos.length) continue;
      const mismoAsunto = r.asunto ? previos.filter((a) => norm(a.subject) === norm(r.asunto)) : [];
      const elegido = (mismoAsunto.length ? mismoAsunto : previos)
        .reduce((mejor, a) => (!mejor || a.at > mejor.at ? a : mejor), null);
      if (elegido) marcas.set(elegido.id, { at: r.at, permanente: r.permanente, codigo: r.codigo, motivo: r.motivo, addr: r.addr });
    }
    if (!marcas.size && !estados.size) return 0;

    const sellar = (arr) => arr.map((r) => (
      estados.has(r.id)
        ? { ...r, props: { ...r.props, emailStatus: peorEstado(r.props.emailStatus, estados.get(r.id)) } }
        : r
    ));
    setDb((d) => ({
      ...d,
      activities: d.activities.map((a) => (marcas.has(a.id) ? { ...a, reboto: marcas.get(a.id) } : a)),
      contacts: sellar(d.contacts),
      companies: sellar(d.companies),
    }));
    /* Se cuentan los que no se habían visto: volver a marcar uno viejo es
       inofensivo —se escribe lo mismo encima— pero anunciarlo como novedad
       haría que cada actualización pareciera traer rebotes nuevos. */
    return lista.filter((r) => !yaEstaban.has(r.ext)).length;
  };

  /* ────────────────────────────────────────────────────────────
     Automatizaciones
     ────────────────────────────────────────────────────────────
     Las reglas viven en automations.js, que sólo sabe decidir. Aquí está la
     mano: lo que de verdad escribe en el cuaderno, abre WhatsApp o manda el
     correo. La frontera importa —lo que decide se puede leer y probar sin
     riesgo de que dispare nada— y explica por qué `disparar` devuelve tareas
     en vez de ejecutarlas.
     ──────────────────────────────────────────────────────────── */

  const entidadDeKind = (k) => (k === "company" ? "company" : k === "deal" ? "deal" : "contact");
  const enlacesDe = (kind, id) => (kind === "contact" ? { contactIds: [id] } : kind === "company" ? { companyIds: [id] } : { dealId: id });

  /* Lo que se aplica sin preguntar. Es una función pura sobre el cuaderno: no
     toca la red ni el reloj de nadie, así que puede correr dentro del
     actualizador de estado junto con todo lo demás del mismo disparo y dejar
     el cuaderno consistente de una sola escritura. */
  const aplicarAccionPura = (d, t) => {
    const x = t.accion;
    const coll = coleccionDe(t.kind);
    const ent = entidadDeKind(t.kind);
    if (x.tipo === "propiedad" || x.tipo === "etapa") {
      const campo = x.tipo === "etapa" ? "stage" : x.campo;
      const valor = x.tipo === "etapa" ? x.etapa : x.valor;
      if (!campo) return { d, texto: "Sin propiedad que cambiar", nivel: "fallo" };
      const rec = buscarFicha(d, t.kind, t.recId);
      if (!rec) return { d, texto: "La ficha ya no existe", nivel: "fallo" };
      if (String(rec.props[campo] == null ? "" : rec.props[campo]) === valor) {
        return { d, texto: `${etiquetaCampo(d, ent, campo)} ya estaba en «${valor}»`, nivel: "info" };
      }
      return {
        d: { ...d, [coll]: d[coll].map((r) => (r.id === t.recId ? { ...r, props: { ...r.props, [campo]: valor, lastActivityAt: nowISO() } } : r)) },
        texto: `${titleOf(ent, rec)}: ${etiquetaCampo(d, ent, campo)} → «${valor}»`,
        nivel: "ok",
      };
    }
    if (x.tipo === "negocio") {
      const rec = buscarFicha(d, t.kind, t.recId);
      if (!rec) return { d, texto: "La ficha ya no existe", nivel: "fallo" };
      /* Sin nombre dictado se usa el de la ficha: un negocio llamado "" no lo
         encuentra nadie en el tablero. */
      const nombre = x.nombre || titleOf(ent, rec);
      const negocio = {
        id: uid(),
        props: {
          name: nombre,
          stage: x.etapa || (etapasDe(d)[0] || "Nuevo"),
          source: rec.props.leadSource || "Manual",
          ...(x.valor ? { amount: x.valor } : {}),
          createdAt: nowISO(), lastActivityAt: nowISO(),
        },
        contactIds: t.kind === "contact" ? [t.recId] : [],
        ...(t.kind === "company" ? { companyId: t.recId } : {}),
      };
      return { d: { ...d, deals: [negocio, ...d.deals] }, texto: `Negocio «${nombre}» creado`, nivel: "ok" };
    }
    if (x.tipo === "nota") {
      const rec = buscarFicha(d, t.kind, t.recId);
      if (!rec) return { d, texto: "La ficha ya no existe", nivel: "fallo" };
      const act = { id: uid(), type: "note", body: x.texto, at: nowISO(), dir: "out", auto: t.autoId, ...enlacesDe(t.kind, t.recId) };
      return { d: { ...d, activities: [act, ...d.activities] }, texto: `Nota en ${titleOf(ent, rec)}`, nivel: "ok" };
    }
    return { d, texto: "Acción desconocida", nivel: "fallo" };
  };

  const lineaLog = (t, nivel, texto) => ({ id: uid(), at: nowISO(), autoId: t.autoId, auto: t.auto, nivel, texto });

  /* Todas las tareas de un mismo disparo entran en una escritura: si una regla
     cambia una propiedad y encola un envío, o pasan las dos o no pasa ninguna. */
  const aplicarTareas = (tareas) => {
    if (!tareas.length) return;
    setDb((d) => {
      let n = d;
      const cola = [];
      const log = [];
      const corridas = new Map();
      for (const t of tareas) {
        corridas.set(t.autoId, (corridas.get(t.autoId) || 0) + 1);
        const ent = entidadDeKind(t.kind);
        if (t.estado === "espera") {
          cola.push(t);
          log.push(lineaLog(t, "espera", `Programado para ${fmt(t.listaEn)} · ${textoAccion(t.accion, n, ent)}`));
          continue;
        }
        if (necesitaMano(t.accion.tipo)) {
          cola.push({ ...t, estado: "listo" });
          log.push(lineaLog(t, "espera", `En Pendientes · ${textoAccion(t.accion, n, ent)}`));
          continue;
        }
        const r = aplicarAccionPura(n, t);
        n = r.d;
        log.push(lineaLog(t, r.nivel, r.texto));
      }
      return {
        ...n,
        automations: n.automations.map((a) => (corridas.has(a.id) ? { ...a, corridas: a.corridas + corridas.get(a.id), ultimaEn: nowISO() } : a)),
        autoCola: [...cola, ...n.autoCola].slice(0, 500),
        autoLog: [...log, ...n.autoLog].slice(0, 300),
      };
    });
  };

  /* Un evento no encadena con otro: lo que hace una automatización no vuelve a
     entrar por aquí. Es a propósito. Dos reglas que se llamen entre sí —una
     que marca un estado y otra que dispara con ese estado— darían vueltas para
     siempre sin que nadie pudiera verlo venir, y el precio de impedirlo es que
     los encadenamientos hay que escribirlos como dos acciones de la misma
     regla, que además se lee mejor. */
  const emitir = (evento) => {
    const base = dbRef.current;
    if (!base || !(base.automations || []).some((a) => a.activa)) return;
    aplicarTareas(disparar(base, evento));
  };

  const emitirActividad = (act) => {
    if (!act || act.auto) return; // lo que escribió una regla no vuelve a disparar
    if (act.type !== "whatsapp" && act.type !== "email") return;
    const kind = (act.contactIds || []).length ? "contact" : (act.companyIds || []).length ? "company" : "";
    const recId = kind === "contact" ? act.contactIds[0] : kind === "company" ? act.companyIds[0] : "";
    if (!recId) return;
    const rec = buscarFicha(dbRef.current || {}, kind, recId);
    if (!rec) return;
    emitir({
      tipo: act.dir === "in" ? "mensaje.recibido" : "mensaje.enviado",
      kind, recId, rec, canal: act.type === "email" ? "email" : "whatsapp", at: act.at,
    });
  };

  /* ── Envío de un pendiente ──
     Vale para el botón de Pendientes y para el modo automático: un solo camino,
     así que lo que se apruebe a mano y lo que salga solo arman el mensaje
     exactamente igual. Devuelve qué pasó en vez de avisar por su cuenta, porque
     quien llama sabe si hay que pintar un error o anotarlo en el historial. */
  const enviarPendiente = async (p) => {
    const d = dbRef.current;
    const rec = buscarFicha(d, p.kind, p.recId);
    if (!rec) return { ok: false, err: "La ficha ya no existe." };
    const esCorreo = p.accion.tipo === "correo";
    const lista = (d.templates[esCorreo ? "email" : "whatsapp"]) || [];
    const t = lista.find((x) => norm(x.name) === norm(p.accion.plantilla));
    if (!t) return { ok: false, err: `Ya no existe la plantilla «${p.accion.plantilla}».` };

    const ent = entidadDeKind(p.kind);
    const kindT = ent === "company" ? "company" : "contact";
    const integ = d.integrations;
    const conHtml = esCorreo && Boolean(String(t.html || "").trim());
    const asunto = esCorreo ? (applyTemplate(t.subject, rec, kindT).trim() || "Correo de marketing") : `WhatsApp · ${t.name}`;
    const escrito = applyTemplate(t.body, rec, kindT);
    const htmlBase = conHtml ? withSignatureHtml(applyTemplate(t.html, rec, kindT, true), integ.email.signature) : "";
    const cuerpoTexto = escrito.trim() || (conHtml ? htmlToText(htmlBase) : escrito);
    const cuerpo = esCorreo ? withSignature(cuerpoTexto, integ.email.signature) : cuerpoTexto;
    const enlaces = enlacesDe(p.kind, p.recId);

    if (!esCorreo) {
      if (!toE164(rec.props.phone, integ.whatsapp.countryCode)) return { ok: false, err: "El contacto no tiene teléfono." };
      if (!window.open(waLink(rec.props.phone, cuerpo, integ.whatsapp.countryCode), "_blank", "noopener,noreferrer")) {
        return { ok: false, err: "El navegador bloqueó la ventana. Permite las ventanas emergentes para este sitio." };
      }
      logActivity({ type: "whatsapp", subject: asunto, body: cuerpo, auto: p.autoId, ...enlaces });
      return { ok: true, texto: `WhatsApp abierto para ${titleOf(ent, rec)}` };
    }

    const to = String(rec.props.email || "").trim();
    if (!to) return { ok: false, err: "El contacto no tiene correo." };

    /* Sólo con Gmail conectado el CRM arma y manda el mensaje entero; por las
       otras dos vías se le entrega al programa de correo, y eso pide un clic:
       nunca ocurre solo. */
    if (integ.email.mode !== EMAIL_MODES.gmailApi || !gmailStatus().connected) {
      const url = integ.email.mode === "mailto"
        ? mailtoLink({ to, subject: asunto, body: cuerpo })
        : gmailComposeLink({ to, subject: asunto, body: cuerpo });
      if (url.startsWith("mailto:")) {
        const a = document.createElement("a");
        a.href = url; document.body.appendChild(a); a.click(); a.remove();
      } else if (!window.open(url, "_blank", "noopener,noreferrer")) {
        return { ok: false, err: "El navegador bloqueó la ventana. Permite las ventanas emergentes para este sitio." };
      }
      logActivity({ type: "email", subject: asunto, body: cuerpo, auto: p.autoId, ...enlaces });
      return { ok: true, texto: `Redactor abierto para ${titleOf(ent, rec)}` };
    }

    let trk = "";
    let html = htmlBase;
    if (midiendo(integ.medicion)) {
      trk = nuevoTrk();
      html = await marcarHtml(htmlBase || textoAHtml(cuerpo), {
        base: integ.medicion.base, clave: integ.medicion.clave, trk,
        aperturas: integ.medicion.aperturas, clics: integ.medicion.clics,
      });
    }
    try {
      await sendGmail({ to, subject: asunto, body: cuerpo, html, clientId: integ.email.clientId });
    } catch (e) {
      return { ok: false, err: (e && e.message) || String(e) };
    }
    logActivity({ type: "email", subject: asunto, body: cuerpo, auto: p.autoId, ...(trk ? { trk } : {}), ...enlaces });
    return { ok: true, texto: `Correo enviado a ${titleOf(ent, rec)}` };
  };

  const cerrarPendiente = (id, estado, nota, linea) => setDb((d) => ({
    ...d,
    autoCola: d.autoCola.map((x) => (x.id === id ? { ...x, estado, nota: nota || "" } : x)),
    autoLog: linea ? [linea, ...d.autoLog].slice(0, 300) : d.autoLog,
  }));

  /* Se guarda cuáles están saliendo para que un doble clic —o el segundo pase
     que React hace en modo estricto— no mande el mismo correo dos veces. */
  const enviando = useRef(new Set());

  const atenderPendiente = async (p) => {
    if (enviando.current.has(p.id)) return;
    enviando.current.add(p.id);
    try {
      const r = await enviarPendiente(p);
      cerrarPendiente(p.id, r.ok ? "hecho" : "fallo", r.ok ? "" : r.err,
        lineaLog(p, r.ok ? "ok" : "fallo", r.ok ? r.texto : `No salió: ${r.err}`));
      say(r.ok ? r.texto : r.err);
    } finally {
      enviando.current.delete(p.id);
    }
  };

  /* ── El paso del tiempo ──
     Lo que espera una hora y lo que se enfría no lo avisa nadie: hay que ir a
     mirar. Se mira al abrir y cada medio minuto mientras el CRM esté abierto.
     Con la pestaña cerrada no corre nada, y es honesto que así sea: esto vive
     en el navegador, no en un servidor. */
  useEffect(() => {
    let vivo = true;
    const tic = async () => {
      const d = dbRef.current;
      if (!d || !vivo) return;
      const ahora = Date.now();

      /* 1. Lo programado que ya llegó a su hora. */
      const maduros = (d.autoCola || []).filter((x) => x.estado === "espera" && Date.parse(x.listaEn) <= ahora);
      if (maduros.length) {
        setDb((db2) => {
          let n = db2;
          const log = [];
          const ids = new Set(maduros.map((x) => x.id));
          const quedan = [];
          for (const x of n.autoCola) {
            if (!ids.has(x.id)) { quedan.push(x); continue; }
            if (necesitaMano(x.accion.tipo)) { quedan.push({ ...x, estado: "listo" }); continue; }
            const r = aplicarAccionPura(n, x);
            n = r.d;
            log.push(lineaLog(x, r.nivel, `${r.texto} (programado)`));
            quedan.push({ ...x, estado: r.nivel === "fallo" ? "fallo" : "hecho", nota: r.nivel === "fallo" ? r.texto : "" });
          }
          return { ...n, autoCola: quedan, autoLog: [...log, ...n.autoLog].slice(0, 300) };
        });
      }

      /* 2. Las fichas que se enfriaron. */
      const frios = barrerFrios(d, d.autoMarcas);
      if (frios.length) {
        const marcas = { ...d.autoMarcas };
        frios.forEach((e) => { marcas[e.marca[0]] = e.marca[1]; });
        setDb((db2) => ({ ...db2, autoMarcas: podarMarcas(marcas) }));
        frios.forEach((e) => emitir(e));
      }

      /* 3. Los correos de las reglas en modo automático, que sólo pueden salir
            solos con Gmail conectado. */
      const solas = new Set((d.automations || []).filter((a) => a.modo === "auto").map((a) => a.id));
      const auto = (d.autoCola || []).filter((x) => (
        x.estado === "listo" && x.accion.tipo === "correo" && solas.has(x.autoId) && !enviando.current.has(x.id)
      ));
      if (auto.length && d.integrations.email.mode === EMAIL_MODES.gmailApi && gmailStatus().connected) {
        for (const x of auto.slice(0, 10)) {
          if (!vivo) break;
          await atenderPendiente(x);
        }
      }
    };
    tic();
    const h = setInterval(tic, 30000);
    return () => { vivo = false; clearInterval(h); };
  }, []);

  const marcarBuzon = (parche) => setDb((d) => ({ ...d, buzon: { ...d.buzon, ...parche } }));
  const activarLectura = () => setDb((d) => ({
    ...d,
    integrations: normalizeIntegrations({ ...d.integrations, email: { ...d.integrations.email, leerBandeja: true } }),
  }));
  const marcarVisto = (clave) => setDb((d) => (
    { ...d, buzon: { ...d.buzon, vistoEn: { ...d.buzon.vistoEn, [clave]: nowISO() } } }
  ));

  if (fatal) {
    return (
      <div style={{ minHeight: "100vh", background: C.canvas, display: "grid", placeItems: "center", padding: 24 }}>
        <div style={{ maxWidth: 520, background: C.panel, border: `1px solid ${C.claySoft}`, borderRadius: 10, padding: 22 }}>
          <div style={{ fontFamily: "system-ui", fontSize: 16, fontWeight: 600, color: C.clay, marginBottom: 8 }}>No se pudo abrir tu CRM</div>
          <div style={{ fontFamily: "system-ui", fontSize: 13.5, color: C.ink, lineHeight: 1.6 }}>{fatal}</div>
        </div>
      </div>
    );
  }

  if (!db) {
    return <div style={{ minHeight: "100vh", background: C.canvas, display: "grid", placeItems: "center", fontFamily: "system-ui", color: C.mute, fontSize: 13 }}>Cargando tu CRM…</div>;
  }

  const sinLeer = contarSinLeer(db);

  const NAV = [
    { key: "dashboard", label: "Panel", Icon: LayoutDashboard },
    { key: "messages", label: "Mensajes", Icon: Inbox },
    { key: "contact", label: "Contactos", Icon: Users },
    { key: "company", label: "Empresas", Icon: Building2 },
    { key: "deal", label: "Negocios", Icon: Briefcase },
    { key: "activities", label: "Actividades", Icon: Activity },
    { key: "templates", label: "Plantillas", Icon: MessageSquare },
    { key: "connections", label: "Conexiones", Icon: Plug },
    { key: "settings", label: "Configuración", Icon: Settings },
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.canvas, color: C.ink }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        :root{ --display:'Space Grotesk','Segoe UI',system-ui,sans-serif; --ui:'IBM Plex Sans','Segoe UI',system-ui,sans-serif; --mono:'IBM Plex Mono',ui-monospace,monospace; }
        *{ box-sizing:border-box; }
        .crm-btn:hover:not(:disabled){ filter:brightness(.96); }
        .crm-in:focus{ border-color:${C.jade} !important; box-shadow:0 0 0 3px ${C.jadeSoft}; }
        .crm-row:hover{ background:#F7F9F6; }
        .crm-nav:hover{ background:#E3E7DE; }
        button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible{ outline:2px solid ${C.jade}; outline-offset:1px; }
        table{ border-collapse:collapse; width:100%; }
        ::-webkit-scrollbar{ width:9px; height:9px; } ::-webkit-scrollbar-thumb{ background:#C9CFC4; border-radius:9px; }
        @media (prefers-reduced-motion: reduce){ *{ transition:none !important; animation:none !important; } }
      `}</style>

      <div style={{ display: "flex", minHeight: "100vh" }}>
        {/* Rail */}
        <aside style={{ width: 208, flexShrink: 0, borderRight: `1px solid ${C.line}`, background: "#E9EDE5", padding: "18px 12px", display: "flex", flexDirection: "column", gap: 4, position: "sticky", top: 0, height: "100vh" }}>
          <div style={{ padding: "0 8px 18px" }}>
            <img src="/raadsports-logo.png" alt="Raad Sports Management" style={{ display: "block", width: "100%", maxWidth: 168, height: "auto" }} />
            <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: C.faint, letterSpacing: ".08em", textTransform: "uppercase", marginTop: 6 }}>CRM comercial</div>
          </div>
          {NAV.map(({ key, label, Icon }) => {
            const on = view === key;
            const nuevos = key === "messages" ? sinLeer : 0;
            return (
              <button key={key} className={on ? "" : "crm-nav"} onClick={() => { setView(key); setDetail(null); }}
                style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: on ? C.jade : "transparent", color: on ? "#fff" : C.ink, fontFamily: "var(--ui)", fontSize: 13.5, fontWeight: on ? 600 : 400, textAlign: "left" }}>
                <Icon size={15} strokeWidth={2} />
                <span style={{ flex: 1 }}>{label}</span>
                {nuevos > 0 && (
                  <span style={{ background: on ? "rgba(255,255,255,.25)" : C.clay, color: "#fff", fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600, borderRadius: 99, padding: "1px 6px", minWidth: 18, textAlign: "center" }}>{nuevos > 99 ? "99+" : nuevos}</span>
                )}
              </button>
            );
          })}
          <div style={{ marginTop: "auto", padding: "12px 10px", borderTop: `1px solid ${C.line}` }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: C.faint, lineHeight: 1.6 }}>
              {db.contacts.length} contactos<br />{db.companies.length} empresas<br />{db.deals.length} negocios
            </div>
            <div title={save.error || ""} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 9, fontFamily: "var(--ui)", fontSize: 11, color: save.state === "error" ? C.clay : C.mute }}>
              <span style={{ width: 7, height: 7, borderRadius: 99, flexShrink: 0, background: save.state === "error" ? C.clay : save.state === "saving" ? C.amber : C.jade }} />
              {save.state === "error" ? "Sin guardar" : save.state === "saving" ? "Guardando…" : save.at ? `Guardado ${save.at.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}` : "Todo guardado"}
            </div>
          </div>
        </aside>

        {/* Main */}
        <main style={{ flex: 1, minWidth: 0 }}>
          {view === "dashboard" && <Dashboard db={db} go={setView} />}
          {view === "messages" && (
            <MessagesView db={db} say={say} setDetail={setDetail} setView={setView}
              onLog={logActivity} onImport={importActivities} onBuzon={marcarBuzon} onVisto={marcarVisto}
              onEventos={aplicarEventos} onRebotes={aplicarRebotes}
              onLeerBandeja={activarLectura} onLeads={importarLeads} />
          )}
          {(view === "contact" || view === "company") && (
            <RecordList key={view} kind={view} db={db} setModal={setModal} setDetail={setDetail} onDelete={(ids) => { deleteRecords(view, ids); say(`${ids.length} registro(s) eliminados`); }} />
          )}
          {view === "deal" && <DealsView db={db} setModal={setModal} setDetail={setDetail} onStage={(id, stage) => { updateRecord("deal", id, { stage, lastActivityAt: nowISO() }); say(`Negocio movido a ${stage}`); }} />}
          {view === "activities" && (
            <ActivitiesView db={db} setModal={setModal} say={say}
              onImport={importActivities} onBuzon={marcarBuzon} onEventos={aplicarEventos} onRebotes={aplicarRebotes}
              onLeerBandeja={activarLectura} onLeads={importarLeads} />
          )}
          {view === "templates" && <TemplatesView db={db} setDb={setDb} say={say} />}
          {view === "connections" && <ConnectionsView db={db} setDb={setDb} say={say} onLeads={importarLeads} onBuzon={marcarBuzon} />}
          {view === "settings" && <SettingsView db={db} setDb={setDb} setModal={setModal} say={say} />}
        </main>
      </div>

      {/* Detalle */}
      {detail && (
        <RecordDetail db={db} detail={detail} onClose={() => setDetail(null)} setModal={setModal}
          onLog={(a) => { logActivity(a); say("Actividad registrada"); }}
          onEdit={() => setModal({ kind: "record", objKind: detail.kind, id: detail.id })} />
      )}

      {/* Modales */}
      {modal?.kind === "record" && (
        <RecordForm db={db} objKind={modal.objKind} id={modal.id} presets={modal.presets}
          onClose={() => setModal(null)}
          onAbrirDuplicado={(dupId) => { setModal(null); setDetail({ kind: modal.objKind, id: dupId }); }}
          onSave={(props, id) => {
            if (id) { updateRecord(modal.objKind, id, props); say("Cambios guardados"); }
            else { addRecords(modal.objKind, [{ id: uid(), props: { createdAt: nowISO(), ...props }, ...(modal.links || {}) }]); say(`${OBJ[modal.objKind].singular} creado`); }
            setModal(null);
          }} />
      )}
      {modal?.kind === "import" && (
        <ImportModal db={db} objKind={modal.objKind} onClose={() => setModal(null)}
          onImport={({ records, newFields, optionAdds, omitidos }) => {
            if (newFields.length || optionAdds.length) {
              setDb((d) => ({
                ...d,
                schema: {
                  ...d.schema,
                  [modal.objKind]: [
                    ...d.schema[modal.objKind].map((f) => {
                      const add = optionAdds.find((o) => o.key === f.key);
                      return add ? { ...f, options: [...(f.options || []), ...add.values] } : f;
                    }),
                    ...newFields,
                  ],
                },
              }));
            }
            addRecords(modal.objKind, records);
            setModal(null);
            say(`${records.length} registros importados${omitidos ? ` · ${omitidos} omitidos por correo repetido` : ""}${newFields.length ? ` · ${newFields.length} propiedades creadas` : ""}`);
          }} />
      )}
      {modal?.kind === "prop" && (
        <PropertyModal objKind={modal.objKind} onClose={() => setModal(null)}
          onCreate={(def) => {
            setDb((d) => ({ ...d, schema: { ...d.schema, [modal.objKind]: [...d.schema[modal.objKind], def] } }));
            setModal(null); say(`Propiedad "${def.label}" creada`);
          }} />
      )}
      {modal?.kind === "bulk" && (
        <BulkEditModal db={db} objKind={modal.objKind} ids={modal.ids} onClose={() => setModal(null)}
          onApply={({ key, value, mode, addOption }) => {
            /* Un valor escrito a mano en una propiedad de lista se suma a las
               opciones: si no, la ficha mostraría algo que el formulario no
               puede volver a elegir. */
            if (addOption) {
              setDb((d) => ({
                ...d,
                schema: {
                  ...d.schema,
                  [modal.objKind]: d.schema[modal.objKind].map((f) => (f.key === key ? { ...f, options: [...(f.options || []), addOption] } : f)),
                },
              }));
            }
            const n = setPropOnRecords(modal.objKind, modal.ids, key, value, mode);
            const campo = (db.schema[modal.objKind].find((f) => f.key === key) || {}).label || key;
            setModal(null);
            say(n === 0 ? `Nada que cambiar en ${campo}` : `${campo} actualizado en ${n} registro${n === 1 ? "" : "s"}`);
          }} />
      )}
      {modal?.kind === "send" && (
        <SendModal db={db} channel={modal.channel} kind={modal.objKind} ids={modal.ids}
          onClose={() => setModal(null)}
          onLogOne={(id, payload) => logActivity({
            type: modal.channel, subject: payload.subject, body: payload.body,
            /* Sólo si lo hay: un campo vacío en cada actividad ocuparía sitio en
               el almacenamiento y haría creer que el envío se midió. */
            ...(payload.trk ? { trk: payload.trk } : {}),
            ...(modal.objKind === "contact" ? { contactIds: [id] } : { companyIds: [id] }),
          })}
          onSend={(payload) => {
            /* Se registra sólo en los que quedaron marcados en el modal. */
            const dest = payload.ids || modal.ids;
            dest.forEach((id) => logActivity({ type: modal.channel, subject: payload.subject, body: payload.body, ...(modal.objKind === "contact" ? { contactIds: [id] } : { companyIds: [id] }) }));
            setModal(null);
            say(`Envío registrado en ${dest.length} registro(s)`);
          }} />
      )}
      {modal?.kind === "deal" && (
        <RecordForm db={db} objKind="deal" presets={modal.presets} onClose={() => setModal(null)}
          onSave={(props) => {
            addRecords("deal", [{ id: uid(), props: { createdAt: nowISO(), lastActivityAt: nowISO(), ...props }, contactIds: modal.contactIds || [], companyId: modal.companyId }]);
            setModal(null); say("Negocio creado");
          }} />
      )}

      {save.state === "error" && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, background: C.clay, color: "#fff", padding: "9px 16px", fontFamily: "var(--ui)", fontSize: 12.5, zIndex: 100, textAlign: "center" }}>
          Los últimos cambios no se pudieron guardar{save.error ? ` (${save.error})` : ""}. Descarga un respaldo desde Configuración → Datos antes de cerrar esta pestaña.
        </div>
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: C.ink, color: "#fff", padding: "10px 16px", borderRadius: 7, fontFamily: "var(--ui)", fontSize: 13, zIndex: 90, boxShadow: "0 10px 30px rgba(19,28,26,.3)" }}>{toast}</div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Encabezado de sección
   ──────────────────────────────────────────────────────────── */
const Header = ({ eyebrow, title, right }) => (
  <div style={{ padding: "26px 28px 18px", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
    <div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: C.faint, letterSpacing: ".1em", textTransform: "uppercase" }}>{eyebrow}</div>
      <h1 style={{ fontFamily: "var(--display)", fontSize: 26, fontWeight: 600, letterSpacing: "-.02em", margin: "4px 0 0" }}>{title}</h1>
    </div>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{right}</div>
  </div>
);

/* ────────────────────────────────────────────────────────────
   Panel
   ──────────────────────────────────────────────────────────── */
function Dashboard({ db, go }) {
  const today = db.activities.filter((a) => isToday(a.at));
  const k = {
    contacts: db.contacts.filter((c) => isToday(c.props.createdAt)).length,
    companies: db.companies.filter((c) => isToday(c.props.createdAt)).length,
    messages: today.filter((a) => a.type === "whatsapp" || a.type === "email").length,
    activities: today.length,
  };
  const byType = ["whatsapp", "email", "call", "note"].map((t) => ({ t, n: today.filter((a) => a.type === t).length }));
  const open = db.deals.filter((d) => !["ganado", "perdido"].includes(norm(d.props.stage)));
  const pipeline = open.reduce((s, d) => s + (Number(d.props.amount) || 0), 0);

  const KPI = ({ label, value, sub, accent }) => (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 9, padding: "16px 18px", flex: "1 1 190px", minWidth: 175 }}>
      <div style={{ fontFamily: "var(--ui)", fontSize: 12, color: C.mute, fontWeight: 500 }}>{label}</div>
      <div style={{ fontFamily: "var(--display)", fontSize: 40, fontWeight: 600, letterSpacing: "-.03em", lineHeight: 1.05, marginTop: 6, color: accent || C.ink }}>{value}</div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: C.faint, marginTop: 4, letterSpacing: ".04em" }}>{sub}</div>
    </div>
  );

  return (
    <div>
      <Header eyebrow={new Date().toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })} title="Lo que pasó hoy"
        right={<Btn variant="outline" Icon={Eye} onClick={() => go("activities")}>Ver actividades</Btn>} />

      <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <KPI label="Contactos creados hoy" value={k.contacts} sub={`${db.contacts.length} en total`} />
          <KPI label="Mensajes registrados hoy" value={k.messages} sub="WhatsApp + correo" accent={C.jade} />
          <KPI label="Empresas creadas hoy" value={k.companies} sub={`${db.companies.length} en total`} />
          <KPI label="Actividades de hoy" value={k.activities} sub="llamadas · WhatsApp · correos" />
        </div>

        {/* Firma: la cinta del día */}
        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 9, padding: "18px 20px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <div style={{ fontFamily: "var(--display)", fontSize: 15, fontWeight: 600 }}>Cinta del día</div>
            <div style={{ display: "flex", gap: 14 }}>
              {byType.map(({ t, n }) => (
                <div key={t} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: CHANNEL[t].color, display: "inline-block" }} />
                  <span style={{ fontFamily: "var(--ui)", fontSize: 12, color: C.mute }}>{CHANNEL[t].label}</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 500 }}>{n}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ position: "relative", height: 74, borderBottom: `1px solid ${C.line}` }}>
            {[0, 6, 12, 18, 24].map((h) => (
              <div key={h} style={{ position: "absolute", left: `${(h / 24) * 100}%`, bottom: 0, top: 0, borderLeft: `1px dashed ${C.line}` }} />
            ))}
            {today.map((a) => {
              const d = new Date(a.at);
              const x = ((d.getHours() + d.getMinutes() / 60) / 24) * 100;
              return (
                <div key={a.id} title={`${CHANNEL[a.type].label} · ${a.subject}`}
                  style={{ position: "absolute", left: `${x}%`, bottom: 0, width: 3, height: 30 + (a.type === "whatsapp" ? 18 : a.type === "email" ? 12 : 0), background: CHANNEL[a.type].color, borderRadius: 2, transform: "translateX(-1.5px)" }} />
              );
            })}
            {today.length === 0 && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontFamily: "var(--ui)", fontSize: 12.5, color: C.faint }}>Aún no hay actividad hoy. Empieza enviando una plantilla.</div>}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
            {["00:00", "06:00", "12:00", "18:00", "24:00"].map((h) => <span key={h} style={{ fontFamily: "var(--mono)", fontSize: 10, color: C.faint }}>{h}</span>)}
          </div>
        </div>

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {/* Embudo */}
          <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 9, padding: 20, flex: "2 1 420px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
              <div style={{ fontFamily: "var(--display)", fontSize: 15, fontWeight: 600 }}>Negocios por etapa</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: C.mute }}>${pipeline.toLocaleString("es-CO")} abiertos</div>
            </div>
            {STAGES.map((s) => {
              const n = db.deals.filter((d) => norm(d.props.stage) === s.key).length;
              const max = Math.max(1, ...STAGES.map((x) => db.deals.filter((d) => norm(d.props.stage) === x.key).length));
              return (
                <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
                  <div style={{ width: 96, fontFamily: "var(--ui)", fontSize: 12.5, color: C.mute }}>{s.label}</div>
                  <div style={{ flex: 1, height: 16, background: "#F2F4EF", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${(n / max) * 100}%`, height: "100%", background: s.color, opacity: n ? 1 : 0 }} />
                  </div>
                  <div style={{ width: 22, textAlign: "right", fontFamily: "var(--mono)", fontSize: 12 }}>{n}</div>
                </div>
              );
            })}
          </div>

          {/* Últimas actividades */}
          <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 9, padding: 20, flex: "1 1 300px" }}>
            <div style={{ fontFamily: "var(--display)", fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Últimos movimientos</div>
            {db.activities.slice(0, 7).map((a) => {
              const ch = CHANNEL[a.type]; const who = resolveNames(db, a);
              return (
                <div key={a.id} style={{ display: "flex", gap: 10, padding: "7px 0", borderBottom: `1px solid #F0F2EE` }}>
                  <div style={{ width: 24, height: 24, borderRadius: 5, background: ch.soft, display: "grid", placeItems: "center", flexShrink: 0 }}>
                    <ch.Icon size={12} color={ch.color} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontFamily: "var(--ui)", fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.subject}</div>
                    <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, color: C.faint }}>{who} · {fmt(a.at)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const resolveNames = (db, a) => {
  const names = [
    ...(a.contactIds || []).map((id) => { const r = db.contacts.find((c) => c.id === id); return r ? titleOf("contact", r) : null; }),
    ...(a.companyIds || []).map((id) => { const r = db.companies.find((c) => c.id === id); return r ? titleOf("company", r) : null; }),
  ].filter(Boolean);
  if (!names.length) return "Sin destinatario";
  return names.length > 2 ? `${names[0]} +${names.length - 1}` : names.join(", ");
};

/* ────────────────────────────────────────────────────────────
   Lista de contactos / empresas
   ──────────────────────────────────────────────────────────── */
function RecordList({ kind, db, setModal, setDetail, onDelete }) {
  const schema = db.schema[kind];
  const rows = kind === "contact" ? db.contacts : db.companies;
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [sel, setSel] = useState([]);
  const [cols, setCols] = useState(schema.filter((f) => f.col).map((f) => f.key));
  const [showCols, setShowCols] = useState(false);

  useEffect(() => { setSel([]); setQ(""); }, [kind]);
  // Las propiedades creadas al importar aparecen de inmediato en la tabla,
  // sin volver a mostrar las columnas que el usuario ocultó.
  const known = useRef(new Set(schema.map((f) => f.key)));
  useEffect(() => {
    const fresh = schema.filter((f) => f.col && !known.current.has(f.key)).map((f) => f.key);
    schema.forEach((f) => known.current.add(f.key));
    if (fresh.length) setCols((c) => [...c, ...fresh.filter((k) => !c.includes(k))]);
  }, [schema]);

  const filtered = useMemo(() => rows.filter((r) => {
    const hay = norm(Object.values(r.props).join(" "));
    return (!q || hay.includes(norm(q))) && (!status || r.props.leadStatus === status);
  }), [rows, q, status]);

  const shown = schema.filter((f) => cols.includes(f.key));
  const allSel = filtered.length > 0 && sel.length === filtered.length;

  return (
    <div>
      <Header eyebrow={`${rows.length} registros`} title={OBJ[kind].plural}
        right={<>
          <Btn variant="outline" Icon={Upload} onClick={() => setModal({ kind: "import", objKind: kind })}>Cargar archivo</Btn>
          <Btn variant="solid" Icon={Plus} onClick={() => setModal({ kind: "record", objKind: kind })}>Crear {OBJ[kind].singular.toLowerCase()}</Btn>
        </>} />

      <div style={{ padding: "14px 28px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", borderBottom: `1px solid ${C.line}` }}>
        <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 340 }}>
          <Search size={14} color={C.faint} style={{ position: "absolute", left: 10, top: 10 }} />
          <input className="crm-in" placeholder="Buscar por nombre, correo, institución…" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...inputStyle, paddingLeft: 30 }} />
        </div>
        <select className="crm-in" value={status} onChange={(e) => setStatus(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          <option value="">Todos los estados</option>
          {LEAD_STATUS.map((s) => <option key={s}>{s}</option>)}
        </select>
        <div style={{ position: "relative" }}>
          <Btn variant="outline" Icon={ChevronDown} onClick={() => setShowCols((v) => !v)}>Columnas</Btn>
          {showCols && (
            <div style={{ position: "absolute", top: 38, right: 0, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, padding: 10, zIndex: 20, minWidth: 210, boxShadow: "0 12px 30px rgba(19,28,26,.14)" }}>
              {schema.map((f) => (
                <label key={f.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 2px", fontFamily: "var(--ui)", fontSize: 12.5, cursor: "pointer" }}>
                  <input type="checkbox" checked={cols.includes(f.key)} onChange={() => setCols((c) => c.includes(f.key) ? c.filter((x) => x !== f.key) : [...c, f.key])} />
                  {f.label}
                </label>
              ))}
            </div>
          )}
        </div>
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" Icon={Plus} size="sm" onClick={() => setModal({ kind: "prop", objKind: kind })}>Nueva propiedad</Btn>
      </div>

      {sel.length > 0 && (
        <div style={{ padding: "10px 28px", background: C.jadeSoft, borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--ui)", fontSize: 13, fontWeight: 600, color: C.jade }}>{sel.length} seleccionados</span>
          <Btn size="sm" variant="outline" Icon={MessageSquare} onClick={() => setModal({ kind: "send", channel: "whatsapp", objKind: kind, ids: sel })}>Enviar WhatsApp</Btn>
          <Btn size="sm" variant="outline" Icon={Mail} onClick={() => setModal({ kind: "send", channel: "email", objKind: kind, ids: sel })}>Enviar correo</Btn>
          <Btn size="sm" variant="outline" Icon={Briefcase} onClick={() => setModal({ kind: "deal", contactIds: kind === "contact" ? sel : [], companyId: kind === "company" ? sel[0] : undefined, presets: { source: "Manual" } })}>Crear negocio</Btn>
          <Btn size="sm" variant="outline" Icon={Pencil} onClick={() => setModal({ kind: "bulk", objKind: kind, ids: sel })}>Editar propiedad</Btn>
          <div style={{ flex: 1 }} />
          <Btn size="sm" variant="danger" Icon={Trash2} onClick={() => { onDelete(sel); setSel([]); }}>Eliminar</Btn>
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        {filtered.length === 0 ? (
          <Empty title="No hay registros que coincidan" hint="Crea uno manualmente, carga un archivo o trae leads desde Meta."
            action={<Btn variant="solid" Icon={Plus} onClick={() => setModal({ kind: "record", objKind: kind })}>Crear {OBJ[kind].singular.toLowerCase()}</Btn>} />
        ) : (
          <table>
            <thead>
              <tr style={{ background: "#F4F6F1", borderBottom: `1px solid ${C.line}` }}>
                <th style={{ padding: "9px 12px 9px 28px", width: 34 }}>
                  <input type="checkbox" checked={allSel} onChange={() => setSel(allSel ? [] : filtered.map((r) => r.id))} />
                </th>
                {shown.map((f) => (
                  <th key={f.key} style={{ padding: "9px 12px", textAlign: "left", fontFamily: "var(--mono)", fontSize: 10.5, fontWeight: 500, color: C.mute, letterSpacing: ".07em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{f.label}</th>
                ))}
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="crm-row" style={{ borderBottom: `1px solid #EEF1EC` }}>
                  <td style={{ padding: "9px 12px 9px 28px" }}>
                    <input type="checkbox" checked={sel.includes(r.id)} onChange={() => setSel((s) => s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id])} />
                  </td>
                  {shown.map((f, i) => (
                    <td key={f.key} style={{ padding: "9px 12px", fontFamily: "var(--ui)", fontSize: 13, color: C.ink, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {i === 0 ? (
                        <button onClick={() => setDetail({ kind, id: r.id })} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: C.jade, fontFamily: "var(--ui)", fontSize: 13, fontWeight: 600 }}>{r.props[f.key] || "Sin nombre"}</button>
                      ) : <CellValue f={f} v={r.props[f.key]} />}
                    </td>
                  ))}
                  <td style={{ paddingRight: 20, textAlign: "right" }}>
                    <button onClick={() => setDetail({ kind, id: r.id })} className="crm-btn" style={{ background: "none", border: "none", cursor: "pointer", color: C.faint, padding: 4 }}><Eye size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const CellValue = ({ f, v }) => {
  if (!v) return <span style={{ color: "#B9C0BA" }}>—</span>;
  if (f.key === "leadStatus") {
    const map = { "Calificado": [C.jade, C.jadeSoft], "Conectado": [C.blue, C.blueSoft], "Descalificado": [C.clay, C.claySoft], "Nuevo": [C.plum, C.plumSoft] };
    const [c, s] = map[v] || [C.mute, "#E6E9E3"];
    return <Pill color={c} soft={s}>{v}</Pill>;
  }
  if (f.key === "stage") return <Pill color={stageColor(norm(v))} soft="#F1F3EE">{v}</Pill>;
  if (f.key === "leadSource" || f.key === "source") return <span style={{ fontFamily: "var(--ui)", fontSize: 12.5, color: C.mute }}>{v}</span>;
  if (f.type === "datetime") return <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: C.mute }}>{fmt(v)}</span>;
  if (f.type === "number") return <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>${Number(v).toLocaleString("es-CO")}</span>;
  if (f.type === "url") return <a href={v} target="_blank" rel="noreferrer" style={{ color: C.blue, fontSize: 12.5, fontFamily: "var(--ui)" }}>{String(v).replace(/^https?:\/\//, "")}</a>;
  return String(v);
};

/* ────────────────────────────────────────────────────────────
   Negocios (tablero + tabla)
   ──────────────────────────────────────────────────────────── */
function DealsView({ db, setModal, setDetail, onStage }) {
  const [mode, setMode] = useState("board");
  const total = db.deals.reduce((s, d) => s + (Number(d.props.amount) || 0), 0);

  return (
    <div>
      <Header eyebrow={`${db.deals.length} negocios · $${total.toLocaleString("es-CO")}`} title="Negocios"
        right={<>
          <Btn variant="outline" onClick={() => setMode(mode === "board" ? "table" : "board")}>{mode === "board" ? "Ver tabla" : "Ver tablero"}</Btn>
          <Btn variant="ghost" size="md" Icon={Plus} onClick={() => setModal({ kind: "prop", objKind: "deal" })}>Nueva propiedad</Btn>
          <Btn variant="solid" Icon={Plus} onClick={() => setModal({ kind: "deal", presets: { stage: "Nuevo", source: "Manual" } })}>Crear negocio</Btn>
        </>} />

      {mode === "board" ? (
        <div style={{ padding: 20, display: "flex", gap: 12, overflowX: "auto", alignItems: "flex-start" }}>
          {STAGES.map((s) => {
            const items = db.deals.filter((d) => norm(d.props.stage) === s.key);
            const sum = items.reduce((a, d) => a + (Number(d.props.amount) || 0), 0);
            return (
              <div key={s.key} style={{ minWidth: 218, flex: "1 0 218px", background: "#E9EDE5", borderRadius: 9, padding: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "2px 4px 10px" }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: s.color }} />
                  <span style={{ fontFamily: "var(--ui)", fontSize: 12.5, fontWeight: 600 }}>{s.label}</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: C.faint, marginLeft: "auto" }}>{items.length}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {items.map((d) => (
                    <div key={d.id} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 7, padding: 10 }}>
                      <button onClick={() => setDetail({ kind: "deal", id: d.id })} style={{ background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: "var(--ui)", fontSize: 12.5, fontWeight: 600, color: C.ink, lineHeight: 1.35 }}>{d.props.name}</button>
                      <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: s.color, marginTop: 5 }}>${(Number(d.props.amount) || 0).toLocaleString("es-CO")}</div>
                      <div style={{ fontFamily: "var(--ui)", fontSize: 11, color: C.faint, marginTop: 3 }}>{fmt(d.props.lastActivityAt)}</div>
                      <select className="crm-in" value={d.props.stage} onChange={(e) => onStage(d.id, e.target.value)}
                        style={{ ...inputStyle, marginTop: 7, padding: "3px 5px", fontSize: 11.5 }}>
                        {STAGES.map((x) => <option key={x.key}>{x.label}</option>)}
                      </select>
                    </div>
                  ))}
                  {items.length === 0 && <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, color: C.faint, padding: "10px 4px" }}>Vacío</div>}
                </div>
                {sum > 0 && <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: C.mute, marginTop: 9, paddingLeft: 4 }}>${sum.toLocaleString("es-CO")}</div>}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr style={{ background: "#F4F6F1", borderBottom: `1px solid ${C.line}` }}>
                {db.schema.deal.filter((f) => f.col).map((f) => (
                  <th key={f.key} style={{ padding: "9px 12px", textAlign: "left", fontFamily: "var(--mono)", fontSize: 10.5, fontWeight: 500, color: C.mute, letterSpacing: ".07em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{f.label}</th>
                ))}
                <th style={{ padding: "9px 12px", textAlign: "left", fontFamily: "var(--mono)", fontSize: 10.5, color: C.mute, letterSpacing: ".07em", textTransform: "uppercase" }}>Asociado a</th>
              </tr>
            </thead>
            <tbody>
              {db.deals.map((d) => (
                <tr key={d.id} className="crm-row" style={{ borderBottom: "1px solid #EEF1EC" }}>
                  {db.schema.deal.filter((f) => f.col).map((f, i) => (
                    <td key={f.key} style={{ padding: "9px 12px", fontFamily: "var(--ui)", fontSize: 13 }}>
                      {i === 0 ? <button onClick={() => setDetail({ kind: "deal", id: d.id })} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: C.jade, fontWeight: 600, fontSize: 13, fontFamily: "var(--ui)" }}>{d.props.name}</button> : <CellValue f={f} v={d.props[f.key]} />}
                    </td>
                  ))}
                  <td style={{ padding: "9px 12px", fontFamily: "var(--ui)", fontSize: 12.5, color: C.mute }}>
                    {(db.companies.find((c) => c.id === d.companyId)?.props.name) || (d.contactIds || []).map((id) => titleOf("contact", db.contacts.find((c) => c.id === id) || { props: {} })).join(", ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {db.deals.length === 0 && <Empty title="Todavía no hay negocios" hint="Créalos desde un contacto, desde una empresa o de forma manual." />}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Actividades
   ──────────────────────────────────────────────────────────── */
/* ── El estado de un envío, en pastillas ──
   Lo que la lista tenía hasta ahora era "salió". Estas tres pastillas son las
   tres cosas distintas que pueden haber pasado después, y se pintan igual en
   Actividades y en la ficha de cada persona, para que un mismo envío no se lea
   de dos maneras según por dónde se mire. */
const EstadoEnvio = ({ a }) => {
  if (a.type !== "email" || a.dir !== "out") return null;
  const e = estadoDe(a);
  const p = [];

  if (e.rebote) {
    p.push(<Pill key="r" color={C.clay} soft={C.claySoft}>{e.rebote.permanente ? "No entregado" : "Entrega demorada"}</Pill>);
  } else if (e.abiertoAt) {
    p.push(<Pill key="a" color={C.jade} soft={C.jadeSoft}>Abierto</Pill>);
  } else if (e.soloPrecarga) {
    /* Apple Mail descarga las imágenes al recibir, no al abrir. Decir "abierto"
       por eso sería mentir con más confianza que decir "no se sabe". */
    p.push(<Pill key="p" color={C.faint} soft="#E6E9E3">Apertura dudosa</Pill>);
  } else if (e.medido) {
    p.push(<Pill key="s" color={C.mute} soft="#E6E9E3">Sin abrir</Pill>);
  }

  if (e.clics) p.push(<Pill key="c" color={C.plum} soft={C.plumSoft}>{e.clics === 1 ? "1 clic" : `${e.clics} clics`}</Pill>);
  return <>{p}</>;
};

/* La versión larga, para la ficha: cuándo y en qué. */
const DetalleEnvio = ({ a }) => {
  const e = estadoDe(a);
  if (!e.medido && !e.rebote) return null;
  const linea = { fontFamily: "var(--ui)", fontSize: 11.5, color: C.mute, marginTop: 3, lineHeight: 1.5 };
  return (
    <div>
      {e.rebote && <div style={{ ...linea, color: C.clay }}>{e.rebote.motivo.split("\n")[0]}</div>}
      {e.abiertoAt && <div style={linea}>Abierto {fmt(e.abiertoAt)}{e.aperturas > 1 ? ` · ${e.aperturas} veces` : ""}</div>}
      {!e.abiertoAt && e.soloPrecarga && <div style={linea}>La imagen se descargó a los pocos segundos del envío: suele ser el programa de correo precargando, no una persona.</div>}
      {e.enlaces.map((u) => (
        <div key={u} style={{ ...linea, color: C.plum, overflowWrap: "anywhere" }}>Pinchó {u}</div>
      ))}
    </div>
  );
};

const porcentaje = (parte, total) => (total ? `${Math.round((parte / total) * 100)}% de ${total}` : "—");

/* ────────────────────────────────────────────────────────────
   Actividades
   ──────────────────────────────────────────────────────────── */
function ActivitiesView({ db, setModal, say, onImport, onBuzon, onEventos, onRebotes, onLeerBandeja, onLeads }) {
  const [f, setF] = useState("all");
  const [sync, setSync] = useState({ busy: false, nota: "", err: "" });
  const mide = midiendo(db.integrations.medicion);

  const actualizar = async () => {
    setSync({ busy: true, nota: "Pidiendo permiso…", err: "" });
    try {
      const r = await correrBarrido({
        db,
        progreso: (nota) => setSync({ busy: true, nota, err: "" }),
        onImport, onBuzon, onLeerBandeja, onEventos, onRebotes, onLeads,
      });
      setSync({ busy: false, nota: r.notas.join(" · "), err: "" });
      say(resumenBarrido(r));
    } catch (e) {
      setSync({ busy: false, nota: "", err: (e && e.message) || String(e) });
    }
  };

  /* Las cifras se calculan sobre los correos medidos, no sobre todos los
     enviados: los de antes de encender el medidor, o los que salieron por un
     borrador de Gmail, no se pudieron mirar. Meterlos en el denominador
     inventaría un porcentaje bajo y haría creer que nadie abre nada. */
  const enviados = db.activities.filter((a) => a.type === "email" && a.dir === "out");
  const medidos = enviados.filter((a) => a.trk);
  const abiertos = medidos.filter((a) => estadoDe(a).abiertoAt);
  const conClic = medidos.filter((a) => (a.clics || []).length);
  const rebotados = enviados.filter((a) => a.reboto);
  const hayCifras = medidos.length > 0 || rebotados.length > 0;

  const FILTROS = [
    ["all", "Todas"], ["whatsapp", "WhatsApp"], ["email", "Correos"], ["call", "Llamadas"], ["note", "Notas"],
    ["abierto", "Abiertos"], ["clic", "Con clic"], ["rebote", "No entregados"],
  ];
  const pasa = (a) => {
    if (f === "all") return true;
    if (f === "abierto") return Boolean(estadoDe(a).abiertoAt);
    if (f === "clic") return Boolean((a.clics || []).length);
    if (f === "rebote") return Boolean(a.reboto);
    return a.type === f;
  };
  const list = db.activities.filter(pasa);

  const Cifra = ({ label, valor, sub, color, Icon }) => (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 14px", flex: "1 1 150px", minWidth: 140 }}>
      <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, color: C.mute, fontWeight: 500, display: "flex", alignItems: "center", gap: 5 }}>
        {Icon && <Icon size={12} color={color || C.mute} />}{label}
      </div>
      <div style={{ fontFamily: "var(--display)", fontSize: 24, fontWeight: 600, letterSpacing: "-.02em", marginTop: 2, color: color || C.ink }}>{valor}</div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: C.faint, marginTop: 2, letterSpacing: ".04em" }}>{sub || " "}</div>
    </div>
  );

  return (
    <div>
      <Header eyebrow={`${db.activities.length} registradas`} title="Actividades"
        right={<>
          <Btn variant="outline" Icon={RefreshCw} disabled={sync.busy} onClick={actualizar}>
            {sync.busy ? "Actualizando…" : "Actualizar estados"}
          </Btn>
          <Btn variant="outline" Icon={MessageSquare} onClick={() => setModal({ kind: "send", channel: "whatsapp", objKind: "contact", ids: db.contacts.map((c) => c.id) })}>WhatsApp masivo</Btn>
          <Btn variant="solid" Icon={Mail} onClick={() => setModal({ kind: "send", channel: "email", objKind: "contact", ids: db.contacts.map((c) => c.id) })}>Correo masivo</Btn>
        </>} />

      {(sync.busy || sync.nota || sync.err) && (
        <div style={{ padding: "10px 28px", background: sync.err ? C.claySoft : "#F6F8F4", borderBottom: `1px solid ${C.line}`, fontFamily: "var(--ui)", fontSize: 12.5, color: sync.err ? C.clay : C.mute, lineHeight: 1.55 }}>
          {sync.err || sync.nota || "Buscando novedades…"}
        </div>
      )}

      {hayCifras && (
        <div style={{ padding: "16px 28px 4px", display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Cifra Icon={Mail} label="Correos enviados" valor={enviados.length} sub={medidos.length < enviados.length ? `${medidos.length} con medición` : "todos medidos"} />
          <Cifra Icon={MailOpen} label="Abiertos" valor={abiertos.length} sub={porcentaje(abiertos.length, medidos.length)} color={C.jade} />
          <Cifra Icon={MousePointerClick} label="Con clic" valor={conClic.length} sub={porcentaje(conClic.length, medidos.length)} color={C.plum} />
          <Cifra Icon={MailX} label="No entregados" valor={rebotados.length} sub={rebotados.length ? "revisa esas direcciones" : "ninguno rebotó"} color={rebotados.length ? C.clay : C.ink} />
        </div>
      )}

      {hayCifras && (
        <div style={{ padding: "6px 28px 0", fontFamily: "var(--ui)", fontSize: 11.5, color: C.faint, lineHeight: 1.6, maxWidth: 900 }}>
          El <b>clic</b> es la cifra firme: nadie pincha un enlace por accidente del sistema. La <b>apertura</b> se
          queda corta —quien lee con las imágenes bloqueadas no aparece— y a veces sobra, porque algunos programas
          descargan las imágenes solos al recibir el correo; ésas quedan marcadas como dudosas. <b>No entregado</b> sí
          es definitivo: lo dijo el servidor del destinatario.
        </div>
      )}

      <div style={{ padding: "14px 28px", display: "flex", gap: 7, borderBottom: `1px solid ${C.line}`, flexWrap: "wrap" }}>
        {FILTROS.map(([k, l]) => (
          <button key={k} onClick={() => setF(k)} className="crm-btn"
            style={{ border: `1px solid ${f === k ? C.jade : C.line}`, background: f === k ? C.jade : C.panel, color: f === k ? "#fff" : C.mute, borderRadius: 999, padding: "5px 13px", fontFamily: "var(--ui)", fontSize: 12.5, cursor: "pointer" }}>{l}</button>
        ))}
      </div>
      <div style={{ padding: "8px 28px 40px" }}>
        {list.map((a) => {
          const ch = CHANNEL[a.type];
          return (
            <div key={a.id} style={{ display: "flex", gap: 12, padding: "13px 0", borderBottom: "1px solid #EEF1EC" }}>
              <div style={{ width: 30, height: 30, borderRadius: 7, background: ch.soft, display: "grid", placeItems: "center", flexShrink: 0 }}><ch.Icon size={14} color={ch.color} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "var(--ui)", fontSize: 13.5, fontWeight: 600 }}>{a.subject}</span>
                  <Pill color={ch.color} soft={ch.soft}>{ch.label}</Pill>
                  {a.dir === "in" && ES_MENSAJE(a) && <Pill color={C.clay} soft={C.claySoft}>Recibido</Pill>}
                  <EstadoEnvio a={a} />
                </div>
                <div style={{ fontFamily: "var(--ui)", fontSize: 12.5, color: C.mute, marginTop: 2 }}>{resolveNames(db, a)}</div>
                <DetalleEnvio a={a} />
                {a.body && <div style={{ fontFamily: "var(--ui)", fontSize: 12.5, color: C.mute, marginTop: 6, background: "#F6F8F4", padding: "8px 10px", borderRadius: 6, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{a.body}</div>}
              </div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: C.faint, whiteSpace: "nowrap" }}>{fmt(a.at)}</div>
            </div>
          );
        })}
        {list.length === 0 && (
          <Empty
            title="Sin actividades en este filtro"
            hint={f === "abierto" || f === "clic"
              ? (mide
                  ? "Todavía no ha llegado ninguna. Pulsa “Actualizar estados” para preguntarle al medidor."
                  : "La medición está apagada. Se enciende en Conexiones → Medición de correos.")
              : f === "rebote"
                ? "Ningún correo ha rebotado, o todavía no se ha barrido la bandeja. Pulsa “Actualizar estados”."
                : "Envía una plantilla o registra una llamada desde un contacto."} />
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Mensajes
   La bandeja del CRM: una conversación por persona o por empresa, con lo que
   salió y lo que llegó en la misma columna, sin importar si fue WhatsApp o
   correo. Lo que se ve aquí sale de las mismas actividades que alimentan el
   historial de cada ficha —no hay una copia aparte que se pueda desincronizar—;
   la diferencia es que ahora cada una sabe hacia dónde iba.
   ──────────────────────────────────────────────────────────── */

const ES_MENSAJE = (a) => a && (a.type === "whatsapp" || a.type === "email");

/* Se cuenta en cada pintada de la app para el número del rail, así que lo
   primero que hace es descartar todo lo que no sea un mensaje recibido: con
   miles de actividades guardadas eso deja el recorrido en nada.

   Sólo cuentan los mensajes de fichas que siguen existiendo. Al borrar un
   registro sus actividades quedan huérfanas, y si se contaran el número del
   rail marcaría algo sin leer que no se puede abrir para leerlo: quedaría
   encendido para siempre. */
function contarSinLeer(db) {
  const visto = (db.buzon && db.buzon.vistoEn) || {};
  const vivos = { contact: new Set(db.contacts.map((r) => r.id)), company: new Set(db.companies.map((r) => r.id)) };
  let n = 0;
  for (const a of db.activities) {
    if (a.dir !== "in" || !ES_MENSAJE(a)) continue;
    const claves = [
      ...(a.contactIds || []).filter((id) => vivos.contact.has(id)).map((id) => `contact:${id}`),
      ...(a.companyIds || []).filter((id) => vivos.company.has(id)).map((id) => `company:${id}`),
    ];
    if (claves.some((k) => a.at > (visto[k] || ""))) n++;
  }
  return n;
}

/* Una actividad puede tocar a varios registros a la vez —un correo con copia,
   un envío masivo— y entonces aparece en la conversación de cada uno. Es lo
   correcto: para cada persona, ése es su intercambio. */
function construirConversaciones(db) {
  const mapa = new Map();
  const meter = (kind, id, a) => {
    const clave = `${kind}:${id}`;
    let c = mapa.get(clave);
    if (!c) {
      const coll = kind === "contact" ? db.contacts : db.companies;
      const rec = coll.find((r) => r.id === id);
      /* Si el registro se borró, su historial ya no tiene a quién pertenecer:
         no se inventa una conversación huérfana. */
      if (!rec) return;
      c = { clave, kind, id, rec, nombre: titleOf(kind, rec), items: [] };
      mapa.set(clave, c);
    }
    c.items.push(a);
  };

  db.activities.forEach((a) => {
    (a.contactIds || []).forEach((id) => meter("contact", id, a));
    (a.companyIds || []).forEach((id) => meter("company", id, a));
  });

  const out = [];
  mapa.forEach((c) => {
    /* Las actividades llegan de lo más nuevo a lo más viejo; una conversación
       se lee al revés, como cualquier chat. */
    c.items.sort((a, b) => (a.at < b.at ? -1 : 1));
    const msgs = c.items.filter(ES_MENSAJE);
    /* Una ficha con sólo llamadas y notas no es una conversación: se queda en
       Actividades, que es donde se mira eso. */
    if (!msgs.length) return;
    const visto = (db.buzon.vistoEn || {})[c.clave] || "";
    out.push({
      ...c,
      msgs,
      ultimo: msgs[msgs.length - 1],
      nuevos: msgs.filter((m) => m.dir === "in" && m.at > visto).length,
      canales: [...new Set(msgs.map((m) => m.type))],
    });
  });
  out.sort((a, b) => (a.ultimo.at < b.ultimo.at ? 1 : -1));
  return out;
}

const iniciales = (nombre) => String(nombre || "?").trim().split(/\s+/).slice(0, 2)
  .map((w) => w[0]).join("").toUpperCase() || "?";

/* Color estable por conversación: el mismo nombre cae siempre en el mismo
   tono, así que la lista se reconoce de un vistazo sin tener que leerla. */
const TONOS = [C.jade, C.blue, C.plum, C.amber, C.clay, "#3C6E63", "#7A5A0F"];
const tonoDe = (txt) => {
  let h = 0;
  for (let i = 0; i < String(txt).length; i++) h = (h * 31 + String(txt).charCodeAt(i)) >>> 0;
  return TONOS[h % TONOS.length];
};

const diaDe = (iso) => {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const hoy = new Date();
  const ayer = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1);
  if (isToday(iso)) return "Hoy";
  if (d.toDateString() === ayer.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
};
const horaDe = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
};
/* En la lista de la izquierda el tiempo se dice corto: lo que importa ahí es
   si fue hace un rato o la semana pasada, no la hora exacta. */
const haceRato = (iso) => {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `${min} min`;
  if (isToday(iso)) return horaDe(iso);
  const dias = Math.floor((Date.now() - t) / 86400000);
  if (dias < 7) return `${dias} d`;
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
};

const resumen = (a) => {
  const t = String(a.body || "").replace(/\s+/g, " ").trim();
  return t || String(a.subject || "").trim() || "—";
};

/* ────────────────────────────────────────────────────────────
   El barrido: enterarse de lo que pasó después de enviar

   Cuatro preguntas distintas, cuatro fuentes, un solo botón, porque para quien
   lo usa son la misma: "¿qué me perdí?".

     1. ¿Contestaron?      → los correos cruzados, de Gmail.
     2. ¿Llegó siquiera?   → los rebotes, también de Gmail. Es el único acuse
                             de recibo que existe en el correo: no hay
                             "entregado", hay "no rebotó".
     3. ¿Lo abrieron?      → el medidor, si está publicado.
     4. ¿Llegó alguien?    → los leads de los anuncios, por el puente.

   La cuarta es la que más urge de las cuatro, aunque no lo parezca: Meta borra
   los leads a los 90 días y Google a los 30. Con las otras tres, no barrer
   significa enterarse tarde; con ésta significa no enterarse nunca.

   Cada fuente falla por su cuenta y se cuenta aparte. Que el medidor esté caído
   no puede impedir que se enteren de un rebote, que es el dato caro.
   ──────────────────────────────────────────────────────────── */
async function correrBarrido({ db, progreso = () => {}, onImport, onBuzon, onLeerBandeja, onEventos, onRebotes, onLeads }) {
  const integ = db.integrations;
  const mide = midiendo(integ.medicion);
  /* Los anuncios sólo entran si hay puente y alguna plataforma encendida.
     Media configuración no se intenta: daría un error por cada barrido. */
  const anun = integ.anuncios;
  const trayendoLeads = Boolean(onLeads && integ.puente.base && integ.puente.clave && (anun.meta || anun.google));

  /* Índice dirección → fichas. Dos personas pueden compartir el correo de la
     empresa, así que una dirección puede apuntar a varias. */
  const porDireccion = new Map();
  const anotar = (correo, kind, id) => {
    const d = String(correo || "").trim().toLowerCase();
    if (!d) return;
    if (!porDireccion.has(d)) porDireccion.set(d, []);
    porDireccion.get(d).push({ kind, id });
  };
  db.contacts.forEach((r) => anotar(r.props.email, "contact", r.id));
  db.companies.forEach((r) => anotar(r.props.email, "company", r.id));

  const fichasDe = (correo) => {
    const contactIds = [], companyIds = [];
    (porDireccion.get(String(correo || "").toLowerCase()) || [])
      .forEach(({ kind, id }) => (kind === "contact" ? contactIds : companyIds).push(id));
    return { contactIds: [...new Set(contactIds)], companyIds: [...new Set(companyIds)] };
  };

  const conGmail = Boolean(integ.email.clientId) && porDireccion.size > 0;

  /* Si no hay nada que barrer por ningún lado, se dice cuál es el estorbo en
     vez de devolver un "0 correos nuevos" que parecería una respuesta. */
  if (!conGmail && !mide && !trayendoLeads) {
    if (!integ.email.clientId) throw new Error("Falta el ID de cliente de Google. Pégalo en Conexiones.");
    throw new Error("Ningún contacto ni empresa tiene correo guardado: no hay con quién cruzar la bandeja.");
  }

  const notas = [];
  const marca = {};
  let nuevos = 0, revisados = 0, rebotados = 0, movidos = 0, leads = 0, fichas = 0;

  if (conGmail) {
    progreso("Pidiendo permiso…");
    if (!gmailStatus().puedeLeer) {
      const st = await connectGmail(integ.email.clientId, { leer: true });
      if (!st.puedeLeer) {
        throw new Error("Google no concedió el permiso de lectura. Vuelve a intentarlo y marca la casilla de leer el correo.");
      }
      /* Autorizar desde aquí también deja activada la bandeja en Conexiones:
         así al recargar el permiso se renueva solo y no hay que volver a pasar
         por la ventana de Google. */
      onLeerBandeja();
    }

    progreso("Buscando en la bandeja…");
    const { mensajes, revisados: rev, truncado } = await traerCorreos({
      clientId: integ.email.clientId,
      direcciones: [...porDireccion.keys()],
      desde: db.buzon.correoAl,
      alAvanzar: (hechos, total) => progreso(`Revisando ${hechos} de ${total}…`),
    });
    revisados = rev;

    const acts = mensajes.map((m) => {
      const contactIds = [], companyIds = [];
      m.contrapartes.forEach((d) => (porDireccion.get(d) || []).forEach(({ kind, id }) => {
        (kind === "contact" ? contactIds : companyIds).push(id);
      }));
      return {
        ext: m.ext, type: "email", dir: m.dir, at: m.at,
        subject: m.subject, body: m.body,
        contactIds: [...new Set(contactIds)], companyIds: [...new Set(companyIds)],
      };
    });

    progreso("Buscando correos devueltos…");
    const { rebotes, truncado: rebotesCortados, revisados: avisos } = await traerRebotes({
      clientId: integ.email.clientId,
      direcciones: [...porDireccion.keys()],
      desde: db.buzon.rebotesAl,
    });
    /* Callar un tope sería lo peor que puede hacer esta pantalla: "0 rebotes"
       sobre una revisión incompleta se lee como "llegaron todos". Gmail
       devuelve lo más nuevo primero, así que lo que falta es lo más viejo. */
    if (rebotesCortados) notas.push(`Se revisaron los ${avisos} avisos de entrega más recientes; puede quedar alguno más antiguo sin mirar.`);
    const conFichas = rebotes.map((r) => ({ ...r, ...fichasDe(r.addr) }));

    /* El rebote entra al historial como un mensaje recibido, porque eso es: la
       respuesta del servidor del otro lado. Así aparece en el hilo de la
       persona, en su fecha, sin tener que ir a buscarlo a otra pantalla. */
    const actsRebote = conFichas.map((r) => ({
      ext: r.ext, type: "email", dir: "in", at: r.at,
      subject: `No entregado · ${r.asunto || "correo"}`,
      body: `${r.addr}\n\n${r.motivo}`,
      contactIds: r.contactIds, companyIds: r.companyIds,
    }));

    nuevos = onImport([...acts, ...actsRebote]);
    rebotados = onRebotes(conFichas);
    marca.correoAl = nowISO();
    marca.rebotesAl = nowISO();

    /* Si se llegó al tope quedó historia vieja sin traer, y hay que decirlo: un
       hilo incompleto que no avisa se lee como si eso fuera todo lo que se
       habló. Lo nuevo sí entra completo en las siguientes pasadas. */
    if (truncado) notas.push(`Se trajeron los ${rev} correos más recientes; queda historia más antigua sin bajar.`);
  }

  if (mide) {
    progreso("Preguntando al medidor…");
    try {
      const { eventos, truncado } = await traerEventos({
        base: integ.medicion.base,
        clave: integ.medicion.clave,
        desde: db.buzon.eventosAl,
      });
      movidos = onEventos(eventos);
      marca.eventosAl = nowISO();
      if (truncado) notas.push("El medidor tenía más eventos de los que caben en una respuesta; vuelve a actualizar para terminar de bajarlos.");
    } catch (e) {
      /* Un medidor caído no puede tumbar el barrido entero: los rebotes que
         acaban de entrar valen más que la cifra de aperturas, y perderlos por
         un error de red del otro servicio sería cambiar lo caro por lo barato. */
      notas.push(`Medidor: ${(e && e.message) || String(e)}`);
    }
  }

  if (trayendoLeads) {
    progreso("Preguntando por los leads…");
    try {
      const r = await traerLeads({
        base: integ.puente.base,
        clave: integ.puente.clave,
        meta: anun.meta,
        google: anun.google,
        desde: db.buzon.leadsAl,
        dias: anun.dias,
      });
      const hecho = onLeads(r.leads, anun.destino);
      leads = hecho.leads;
      fichas = hecho.fichas;
      notas.push(...r.notas);
      /* La marca se mueve aunque una de las dos plataformas haya fallado, y es
         a propósito: la que sí respondió ya entregó lo suyo, y volver a pedirle
         lo mismo mañana gastaría el presupuesto de peticiones para descartarlo
         todo por duplicado. Lo que falló se reintenta igual, porque su lado
         pide siempre los últimos 30 o 90 días, no desde la marca. */
      marca.leadsAl = nowISO();
    } catch (e) {
      notas.push(`Anuncios: ${(e && e.message) || String(e)}`);
    }
  }

  if (Object.keys(marca).length) onBuzon(marca);
  return { nuevos, revisados, rebotados, movidos, leads, fichas, notas, mide, conGmail, trayendoLeads };
}

/* Resumen de una pasada, en una línea. */
function resumenBarrido({ nuevos, revisados, rebotados, movidos, leads, fichas, conGmail, trayendoLeads }) {
  const trozos = [];
  if (conGmail) trozos.push(nuevos ? `${nuevos} correo(s) nuevos` : "Sin correos nuevos");
  if (rebotados) trozos.push(`${rebotados} rebote(s)`);
  if (movidos) trozos.push(`${movidos} envío(s) con novedad`);
  /* Los leads y las fichas se cuentan aparte porque no son lo mismo: cinco
     leads de tres personas son cinco leads y tres fichas, y decir sólo "5"
     haría creer que llegaron cinco personas nuevas. */
  if (trayendoLeads) trozos.push(leads ? `${leads} lead(s)${fichas ? `, ${fichas} ficha(s) nueva(s)` : " de gente ya conocida"}` : "Sin leads nuevos");
  if (conGmail) trozos.push(`${revisados} revisados`);
  return trozos.length ? trozos.join(" · ") : "Sin novedades";
}

function MessagesView({ db, say, setDetail, setView, onLog, onImport, onBuzon, onVisto, onLeerBandeja, onEventos, onRebotes, onLeads }) {
  const integ = db.integrations;
  const conversaciones = useMemo(() => construirConversaciones(db), [db]);

  const [sel, setSel] = useState("");
  const [buscar, setBuscar] = useState("");
  const [filtro, setFiltro] = useState("all");
  const [sync, setSync] = useState({ busy: false, nota: "", err: "" });

  const filtradas = useMemo(() => {
    const q = norm(buscar);
    return conversaciones.filter((c) => {
      if (filtro === "nuevos" && !c.nuevos) return false;
      if ((filtro === "whatsapp" || filtro === "email") && !c.canales.includes(filtro)) return false;
      if (!q) return true;
      return norm(`${c.nombre} ${c.rec.props.email || ""} ${c.rec.props.phone || ""} ${resumen(c.ultimo)}`).includes(q);
    });
  }, [conversaciones, buscar, filtro]);

  /* La conversación abierta se sigue por su clave, no por posición: al entrar
     un mensaje nuevo la lista se reordena y una posición fija saltaría sola a
     otra persona a mitad de lectura. */
  const activa = conversaciones.find((c) => c.clave === sel) || null;

  useEffect(() => {
    if (!activa && filtradas.length) setSel(filtradas[0].clave);
  }, [activa, filtradas]);

  /* Al abrirla se da por leída, y otra vez si le entran mensajes mientras
     está a la vista: quedaría marcada como nueva algo que ya se está leyendo. */
  const abiertaCon = activa ? activa.msgs.length : 0;
  useEffect(() => {
    if (activa && activa.nuevos) onVisto(activa.clave);
  }, [sel, abiertaCon]);

  /* ── Traer el correo ── */
  /* La pasada entera vive en correrBarrido, fuera del componente: Actividades
     dispara exactamente la misma, y dos copias de esto se habrían separado a la
     primera corrección que se hiciera en una sola. */
  const sincronizar = async () => {
    setSync({ busy: true, nota: "Pidiendo permiso…", err: "" });
    try {
      const r = await correrBarrido({
        db,
        progreso: (nota) => setSync({ busy: true, nota, err: "" }),
        onImport, onBuzon, onLeerBandeja, onEventos, onRebotes, onLeads,
      });
      setSync({ busy: false, nota: r.notas.join(" · "), err: "" });
      say(resumenBarrido(r));
    } catch (e) {
      setSync({ busy: false, nota: "", err: (e && e.message) || String(e) });
    }
  };

  const sinNada = conversaciones.length === 0;

  return (
    <div style={{ display: "flex", height: "100vh", minWidth: 0 }}>
      {/* Lista de conversaciones */}
      <div style={{ width: 316, flexShrink: 0, borderRight: `1px solid ${C.line}`, background: C.panel, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "18px 16px 12px", borderBottom: `1px solid ${C.line}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: C.faint, letterSpacing: ".1em", textTransform: "uppercase" }}>
                {conversaciones.length} conversacion{conversaciones.length === 1 ? "" : "es"}
              </div>
              <h1 style={{ fontFamily: "var(--display)", fontSize: 21, fontWeight: 600, letterSpacing: "-.02em", margin: "3px 0 0" }}>Mensajes</h1>
            </div>
            <Btn size="sm" variant="outline" Icon={RefreshCw} disabled={sync.busy} onClick={sincronizar}>
              {sync.busy ? "…" : "Correo"}
            </Btn>
          </div>

          <div style={{ position: "relative", marginTop: 12 }}>
            <Search size={13} color={C.faint} style={{ position: "absolute", left: 9, top: 9 }} />
            <input className="crm-in" placeholder="Buscar conversación…" value={buscar} onChange={(e) => setBuscar(e.target.value)}
              style={{ ...inputStyle, padding: "7px 10px 7px 27px", fontSize: 12.5 }} />
          </div>

          <div style={{ display: "flex", gap: 5, marginTop: 10, flexWrap: "wrap" }}>
            {[["all", "Todo"], ["whatsapp", "WhatsApp"], ["email", "Correo"], ["nuevos", "Sin leer"]].map(([k, l]) => (
              <button key={k} onClick={() => setFiltro(k)} className="crm-btn"
                style={{ border: `1px solid ${filtro === k ? C.jade : C.line}`, background: filtro === k ? C.jade : C.panel, color: filtro === k ? "#fff" : C.mute, borderRadius: 999, padding: "3px 10px", fontFamily: "var(--ui)", fontSize: 11.5, cursor: "pointer" }}>{l}</button>
            ))}
          </div>
        </div>

        {(sync.nota || sync.err) && (
          <div style={{ padding: "9px 16px", borderBottom: `1px solid ${C.line}`, background: sync.err ? C.claySoft : "#F6F8F4", fontFamily: "var(--ui)", fontSize: 11.5, color: sync.err ? C.clay : C.mute, lineHeight: 1.5 }}>
            {sync.err || sync.nota}
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtradas.map((c) => {
            const on = c.clave === sel;
            const ch = CHANNEL[c.ultimo.type];
            return (
              <button key={c.clave} onClick={() => setSel(c.clave)} className={on ? "" : "crm-row"}
                style={{ display: "flex", gap: 10, width: "100%", textAlign: "left", padding: "11px 14px", borderTop: "none", borderRight: "none", borderBottom: "1px solid #F2F4F0", borderLeft: `3px solid ${on ? C.jade : "transparent"}`, background: on ? C.jadeSoft : "transparent", cursor: "pointer" }}>
                <div style={{ width: 32, height: 32, borderRadius: 99, flexShrink: 0, background: tonoDe(c.nombre), color: "#fff", display: "grid", placeItems: "center", fontFamily: "var(--ui)", fontSize: 11.5, fontWeight: 600 }}>
                  {iniciales(c.nombre)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ flex: 1, minWidth: 0, fontFamily: "var(--ui)", fontSize: 13, fontWeight: c.nuevos ? 700 : 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nombre}</span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: C.faint, flexShrink: 0 }}>{haceRato(c.ultimo.at)}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
                    <ch.Icon size={11} color={ch.color} style={{ flexShrink: 0 }} />
                    {c.ultimo.dir === "in" && <ArrowDownLeft size={11} color={C.clay} style={{ flexShrink: 0 }} />}
                    <span style={{ flex: 1, minWidth: 0, fontFamily: "var(--ui)", fontSize: 11.5, color: c.nuevos ? C.ink : C.mute, fontWeight: c.nuevos ? 500 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{resumen(c.ultimo)}</span>
                    {c.nuevos > 0 && (
                      <span style={{ background: C.clay, color: "#fff", fontFamily: "var(--mono)", fontSize: 9.5, fontWeight: 600, borderRadius: 99, padding: "1px 5px", flexShrink: 0 }}>{c.nuevos}</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
          {filtradas.length === 0 && (
            <div style={{ padding: "30px 18px", textAlign: "center", fontFamily: "var(--ui)", fontSize: 12.5, color: C.faint, lineHeight: 1.6 }}>
              {sinNada
                ? "Todavía no hay mensajes. Escribe a un contacto por WhatsApp o correo y la conversación aparece aquí."
                : "Ninguna conversación coincide con este filtro."}
            </div>
          )}
        </div>
      </div>

      {/* Conversación */}
      {activa
        ? <Conversacion key={activa.clave} conv={activa} db={db} say={say} setDetail={setDetail} onLog={onLog} />
        : (
          <div style={{ flex: 1, display: "grid", placeItems: "center", padding: 24 }}>
            <div style={{ textAlign: "center", maxWidth: 380 }}>
              <Inbox size={30} color={C.faint} />
              <div style={{ fontFamily: "var(--display)", fontSize: 16, fontWeight: 600, marginTop: 12 }}>
                {sinNada ? "Aquí van tus conversaciones" : "Elige una conversación"}
              </div>
              <div style={{ fontFamily: "var(--ui)", fontSize: 13, color: C.mute, marginTop: 6, lineHeight: 1.6 }}>
                {sinNada
                  ? "WhatsApp y correo, cada persona en un solo hilo. Empieza escribiéndole a un contacto, o trae con “Correo” las respuestas que ya están en tu bandeja de Gmail."
                  : "Selecciónala en la lista de la izquierda."}
              </div>
              {sinNada && (
                <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                  <Btn variant="outline" Icon={Users} onClick={() => setView("contact")}>Ir a Contactos</Btn>
                  <Btn variant="solid" Icon={RefreshCw} disabled={sync.busy} onClick={sincronizar}>Traer correo</Btn>
                </div>
              )}
            </div>
          </div>
        )}
    </div>
  );
}

/* ── Un hilo abierto ──
   Lo recibido a la izquierda y lo enviado a la derecha, como en cualquier
   chat, con el color del canal por el que fue. Las llamadas y las notas
   aparecen en el medio y en pequeño: son parte de la relación pero no del
   intercambio de mensajes, y mezclarlas como globos haría creer que se le
   escribió algo a la persona. */
function Conversacion({ conv, db, say, setDetail, onLog }) {
  const integ = db.integrations;
  const gmail = useGmail();
  const rec = conv.rec;
  const kind = conv.kind;

  const tel = toE164(rec.props.phone, integ.whatsapp.countryCode);
  const correo = String(rec.props.email || "").trim();

  const [modo, setModo] = useState("responder");
  const [canal, setCanal] = useState(tel ? "whatsapp" : "email");
  const [texto, setTexto] = useState("");
  const [asunto, setAsunto] = useState("");
  const [tid, setTid] = useState("");
  /* El diseño de la plantilla se guarda sin reemplazar todavía: las variables
     se meten al enviar, y ahí escapadas, porque van dentro de marcación. */
  const [html, setHtml] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const hilo = useRef(null);
  useEffect(() => {
    const el = hilo.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conv.items.length]);

  /* Se ofrece sólo el canal por el que se puede escribir de verdad: un botón
     de WhatsApp sobre un contacto sin teléfono no lleva a ninguna parte. */
  const canales = [
    ...(tel ? [["whatsapp", "WhatsApp"]] : []),
    ...(correo ? [["email", "Correo"]] : []),
  ];
  const canalReal = canales.some(([k]) => k === canal) ? canal : (canales[0] || [])[0] || "whatsapp";
  const esCorreo = canalReal === "email";
  const puedeEscribir = canales.length > 0;

  const plantillas = db.templates[canalReal] || [];
  const usarPlantilla = (id) => {
    setTid(id);
    const t = plantillas.find((x) => x.id === id);
    if (!t) { setHtml(""); return; }
    setTexto(applyTemplate(t.body || "", rec, kind));
    if (esCorreo) { setAsunto(applyTemplate(t.subject || "", rec, kind)); setHtml(t.html || ""); }
  };

  const limpiar = () => { setTexto(""); setAsunto(""); setTid(""); setHtml(""); };

  /* El diseño sólo viaja cuando el CRM manda el correo él mismo. Un enlace que
     abre un borrador no puede llevar HTML —ni mailto: ni la ventana de Gmail
     lo aceptan—, así que ahí sale el texto y se avisa, en vez de dejar creer
     que salió con formato. */
  const conDiseno = esCorreo && Boolean(String(html).trim());
  const porApi = esCorreo && integ.email.mode === "gmailApi";
  const disenoSeQueda = conDiseno && !porApi;

  /* Registrar una respuesta a mano. Es lo que mantiene completo el hilo de
     WhatsApp: por ahí no hay forma de leer lo que llega sin un servidor y una
     cuenta de empresa aprobada por Meta, así que la respuesta se pega aquí y
     queda con su fecha, del lado que le corresponde. */
  const guardarRecibido = () => {
    const cuerpo = texto.trim();
    if (!cuerpo) return;
    onLog({
      type: canalReal, dir: "in",
      subject: (esCorreo ? asunto.trim() : "") || `Respuesta por ${CHANNEL[canalReal].label}`,
      body: cuerpo,
      ...(kind === "contact" ? { contactIds: [conv.id] } : { companyIds: [conv.id] }),
    });
    limpiar();
    say("Respuesta registrada");
  };

  const registrarSalida = (cuerpo, asuntoFinal, trk) => onLog({
    type: canalReal, dir: "out",
    subject: asuntoFinal || (esCorreo ? "Correo" : "Mensaje de WhatsApp"),
    body: cuerpo,
    ...(trk ? { trk } : {}),
    ...(kind === "contact" ? { contactIds: [conv.id] } : { companyIds: [conv.id] }),
  });

  const abrirUrl = (url) => {
    if (url.startsWith("mailto:")) {
      const a = document.createElement("a");
      a.href = url;
      document.body.appendChild(a); a.click(); a.remove();
      return true;
    }
    return Boolean(window.open(url, "_blank", "noopener,noreferrer"));
  };

  const enviar = async () => {
    const crudo = texto.trim();
    if (!crudo) return;
    setErr("");

    if (!esCorreo) {
      const cuerpo = crudo;
      if (!abrirUrl(waLink(rec.props.phone, cuerpo, integ.whatsapp.countryCode))) {
        setErr("El navegador bloqueó la ventana. Permite las ventanas emergentes para este sitio.");
        return;
      }
      registrarSalida(cuerpo);
      limpiar();
      say("WhatsApp abierto y registrado");
      return;
    }

    const asu = asunto.trim() || "Correo";
    const cuerpo = withSignature(crudo, integ.email.signature);
    const diseno = conDiseno
      ? withSignatureHtml(applyTemplate(html, rec, kind, true), integ.email.signature)
      : "";
    const modoCorreo = integ.email.mode;

    if (modoCorreo === "gmailApi") {
      if (!gmail.connected) {
        setBusy(true);
        try { await connectGmail(integ.email.clientId); }
        catch (e) { setErr((e && e.message) || String(e)); setBusy(false); return; }
        setBusy(false);
      }
      setBusy(true);
      try {
        /* Mismo trato que en el envío masivo: si hay medidor, este correo
           también se marca. Un mensaje suelto del hilo es tan medible como uno
           de una campaña, y que sólo contaran los masivos daría un porcentaje
           calculado sobre la mitad de lo que se manda. */
        const mideEsto = midiendo(integ.medicion);
        const trk = mideEsto ? nuevoTrk() : "";
        const html = mideEsto
          ? await marcarHtml(diseno || textoAHtml(cuerpo), {
              base: integ.medicion.base, clave: integ.medicion.clave, trk,
              aperturas: integ.medicion.aperturas, clics: integ.medicion.clics,
            })
          : diseno;
        await sendGmail({ to: correo, subject: asu, body: cuerpo, html, clientId: integ.email.clientId });
        registrarSalida(cuerpo, asu, trk);
        limpiar();
        say(`Correo enviado a ${correo}`);
      } catch (e) {
        setErr((e && e.message) || String(e));
      }
      setBusy(false);
      return;
    }

    const url = modoCorreo === "mailto"
      ? mailtoLink({ to: correo, subject: asu, body: cuerpo })
      : gmailComposeLink({ to: correo, subject: asu, body: cuerpo });
    if (!abrirUrl(url)) {
      setErr("El navegador bloqueó la ventana. Permite las ventanas emergentes para este sitio.");
      return;
    }
    registrarSalida(cuerpo, asu);
    limpiar();
    say("Borrador abierto y registrado");
  };

  /* Enter manda, Mayús+Enter hace un salto de línea: es lo que la mano ya
     espera en cualquier chat. En correo no, porque ahí se escriben párrafos y
     un Enter de más saldría a medio mensaje. */
  const teclas = (e) => {
    if (e.key !== "Enter" || e.shiftKey || esCorreo) return;
    e.preventDefault();
    if (modo === "recibido") guardarRecibido(); else enviar();
  };

  const comoSale = !esCorreo
    ? "Se abre WhatsApp con el mensaje escrito; tú das el último clic."
    : integ.email.mode === "gmailApi"
      ? (gmail.connected ? `Sale desde ${gmail.account || "tu cuenta de Gmail"}.` : "Falta autorizar la cuenta de Gmail.")
      : integ.email.mode === "mailto"
        ? "Se abre tu programa de correo con el borrador listo."
        : "Se abre Gmail con el borrador listo; tú das el último clic.";

  /* Separadores de día: se marca el primero de cada fecha al recorrer el hilo. */
  let diaPrevio = "";

  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: C.canvas }}>
      {/* Encabezado del hilo */}
      <div style={{ padding: "14px 22px", background: C.panel, borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 99, flexShrink: 0, background: tonoDe(conv.nombre), color: "#fff", display: "grid", placeItems: "center", fontFamily: "var(--ui)", fontSize: 13, fontWeight: 600 }}>
          {iniciales(conv.nombre)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--display)", fontSize: 16.5, fontWeight: 600, letterSpacing: "-.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{conv.nombre}</div>
          <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, color: C.mute, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {[OBJ[kind].singular, correo, tel ? `+${tel}` : ""].filter(Boolean).join(" · ")}
          </div>
        </div>
        <Btn size="sm" variant="outline" Icon={User} onClick={() => setDetail({ kind, id: conv.id })}>Ver ficha</Btn>
      </div>

      {/* Hilo */}
      <div ref={hilo} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        {/* Los mensajes se empujan al fondo: lo último dicho queda pegado a
            donde se escribe, y una conversación corta no deja un hueco debajo. */}
        <div style={{ marginTop: "auto", padding: "18px 22px 22px" }}>
        {conv.items.map((a) => {
          const dia = diaDe(a.at);
          const marca = dia !== diaPrevio ? dia : "";
          diaPrevio = dia;
          const ch = CHANNEL[a.type] || CHANNEL.note;
          const mensaje = ES_MENSAJE(a);
          const mio = a.dir !== "in";

          return (
            <div key={a.id}>
              {marca && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0 12px" }}>
                  <div style={{ flex: 1, height: 1, background: C.line }} />
                  <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: C.faint, textTransform: "uppercase", letterSpacing: ".08em" }}>{marca}</span>
                  <div style={{ flex: 1, height: 1, background: C.line }} />
                </div>
              )}

              {!mensaje ? (
                <div style={{ display: "flex", justifyContent: "center", margin: "8px 0" }}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#E6E9E3", borderRadius: 999, padding: "3px 11px", fontFamily: "var(--ui)", fontSize: 11.5, color: C.mute, maxWidth: "80%" }}>
                    <ch.Icon size={11} color={ch.color} style={{ flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.subject || ch.label}</span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: C.faint, flexShrink: 0 }}>{horaDe(a.at)}</span>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", justifyContent: mio ? "flex-end" : "flex-start", margin: "7px 0" }}>
                  <div style={{ maxWidth: "min(560px, 78%)", minWidth: 0 }}>
                    <div style={{
                      background: mio ? ch.soft : C.panel,
                      border: `1px solid ${mio ? ch.soft : C.line}`,
                      borderRadius: mio ? "10px 10px 3px 10px" : "10px 10px 10px 3px",
                      padding: "9px 12px",
                    }}>
                      {a.type === "email" && a.subject && (
                        <div style={{ fontFamily: "var(--ui)", fontSize: 12, fontWeight: 600, color: C.ink, paddingBottom: 5, marginBottom: 6, borderBottom: `1px solid ${mio ? "rgba(19,28,26,.10)" : "#F0F2ED"}`, overflowWrap: "anywhere" }}>
                          {a.subject}
                        </div>
                      )}
                      <div style={{ fontFamily: "var(--ui)", fontSize: 13, color: C.ink, lineHeight: 1.55, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                        {String(a.body || "").trim() || <span style={{ color: C.faint }}>(sin texto)</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3, justifyContent: mio ? "flex-end" : "flex-start", fontFamily: "var(--mono)", fontSize: 10, color: C.faint }}>
                      <ch.Icon size={10} color={ch.color} />
                      <span>{mio ? "Enviado" : "Recibido"}</span>
                      <span>·</span>
                      <span>{horaDe(a.at)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        </div>
      </div>

      {/* Redactar */}
      <div style={{ borderTop: `1px solid ${C.line}`, background: C.panel, padding: "12px 22px 16px" }}>
        {!puedeEscribir ? (
          <div style={{ fontFamily: "var(--ui)", fontSize: 12.5, color: C.mute, lineHeight: 1.6 }}>
            Este registro no tiene teléfono ni correo guardado, así que no hay por dónde escribirle.{" "}
            <button onClick={() => setDetail({ kind, id: conv.id })} style={{ border: "none", background: "none", padding: 0, color: C.jade, fontFamily: "var(--ui)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}>Abre la ficha</button> para agregarlo.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 9 }}>
              {[["responder", "Responder", CornerDownLeft], ["recibido", "Registrar recibido", ArrowDownLeft]].map(([k, l, I]) => (
                <button key={k} onClick={() => setModo(k)} className="crm-btn"
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${modo === k ? C.jade : C.line}`, background: modo === k ? C.jade : C.panel, color: modo === k ? "#fff" : C.mute, borderRadius: 999, padding: "4px 11px", fontFamily: "var(--ui)", fontSize: 11.5, cursor: "pointer" }}>
                  <I size={11} /> {l}
                </button>
              ))}
              <span style={{ width: 1, height: 18, background: C.line, margin: "0 3px" }} />
              {canales.map(([k, l]) => {
                const on = canalReal === k;
                const ch = CHANNEL[k];
                return (
                  <button key={k} onClick={() => { setCanal(k); setTid(""); }} className="crm-btn"
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${on ? ch.color : C.line}`, background: on ? ch.soft : C.panel, color: on ? ch.color : C.mute, borderRadius: 999, padding: "4px 11px", fontFamily: "var(--ui)", fontSize: 11.5, fontWeight: on ? 600 : 400, cursor: "pointer" }}>
                    <ch.Icon size={11} /> {l}
                  </button>
                );
              })}
              {modo === "responder" && plantillas.length > 0 && (
                <select className="crm-in" value={tid} onChange={(e) => usarPlantilla(e.target.value)}
                  style={{ ...inputStyle, width: "auto", maxWidth: 220, padding: "4px 8px", fontSize: 11.5, borderRadius: 999 }}>
                  <option value="">Plantilla…</option>
                  {plantillas.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}
            </div>

            {esCorreo && (
              <input className="crm-in" placeholder="Asunto" value={asunto} onChange={(e) => setAsunto(e.target.value)}
                style={{ ...inputStyle, marginBottom: 7, fontSize: 12.5 }} />
            )}

            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <textarea className="crm-in" rows={esCorreo ? 4 : 2} value={texto} onKeyDown={teclas}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={modo === "recibido"
                  ? `Pega aquí lo que ${conv.nombre} respondió por ${CHANNEL[canalReal].label}…`
                  : `Escribe por ${CHANNEL[canalReal].label}…`}
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.55, fontSize: 13 }} />
              {modo === "recibido" ? (
                <Btn variant="outline" Icon={ArrowDownLeft} disabled={!texto.trim()} onClick={guardarRecibido}>Guardar</Btn>
              ) : (
                <Btn variant="solid" Icon={porApi ? Send : ExternalLink}
                  disabled={!texto.trim() || busy} onClick={enviar}>
                  {busy ? "Enviando…" : "Enviar"}
                </Btn>
              )}
            </div>

            <div style={{ marginTop: 6, fontFamily: "var(--ui)", fontSize: 11, color: err ? C.clay : C.faint, lineHeight: 1.5 }}>
              {err || (modo === "recibido"
                ? "Queda en el hilo con la fecha de hoy, del lado de quien lo escribió."
                : disenoSeQueda
                  ? `Esta plantilla trae diseño HTML y por aquí sale sólo el texto. Para enviarla con formato, elige “Gmail conectado” en Conexiones. · ${comoSale}`
                  : conDiseno ? `Sale con el diseño de la plantilla. · ${comoSale}` : comoSale)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Diseño HTML del correo
   Una plantilla de correo puede llevar, además del texto, una pieza en HTML:
   la que diseñaste aparte y guardaste como .html. Se carga del disco o se
   pega, se queda dentro de la plantilla y viaja junto al texto en el mismo
   correo, así que quien no vea el diseño lee el mensaje igual.
   ──────────────────────────────────────────────────────────── */

/* La vista previa va dentro de un iframe con el sandbox vacío: el diseño se
   ve tal como saldrá, pero no puede ejecutar scripts ni tocar el CRM. Es la
   misma cautela que aplica cualquier lector de correo. */
const HtmlPreview = ({ html, height = 240 }) => (
  <iframe title="Vista previa del diseño" sandbox="" srcDoc={html || ""}
    style={{ width: "100%", height, border: `1px solid ${C.line}`, borderRadius: 8, background: "#fff", display: "block" }} />
);

const pesoKb = (t) => Math.round(new Blob([t || ""]).size / 1024);

/* Anexar el HTML: cargarlo de un archivo o pegarlo, verlo y quitarlo.
   El archivo se lee en el navegador; no se sube a ningún lado. */
function HtmlAttach({ value, onChange }) {
  const input = useRef(null);
  const [tab, setTab] = useState("diseno");
  const [err, setErr] = useState("");
  const html = value || "";
  const kb = pesoKb(html);

  const cargar = (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = ""; // permite volver a cargar el mismo archivo tras editarlo
    if (!f) return;
    setErr("");
    if (f.size > 500_000) {
      setErr("El archivo pesa más de 500 KB. Un correo así no lo acepta ningún lector: aligera el diseño o deja las imágenes enlazadas en vez de incrustadas.");
      return;
    }
    const fr = new FileReader();
    fr.onload = () => { onChange(String(fr.result || "")); setTab("diseno"); };
    fr.onerror = () => setErr("No se pudo leer el archivo.");
    fr.readAsText(f, "UTF-8");
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, fontWeight: 600, color: C.mute, letterSpacing: ".02em", flex: 1 }}>
          DISEÑO HTML (OPCIONAL)
        </div>
        {html && <Pill color={C.blue} soft={C.blueSoft}>{kb} KB</Pill>}
        <input ref={input} type="file" accept=".html,.htm,text/html" onChange={cargar} style={{ display: "none" }} />
        <Btn size="sm" variant="outline" Icon={Paperclip} onClick={() => input.current && input.current.click()}>
          {html ? "Reemplazar archivo" : "Anexar archivo .html"}
        </Btn>
        {html && <Btn size="sm" variant="ghost" Icon={Trash2} onClick={() => { setErr(""); onChange(""); }}>Quitar</Btn>}
      </div>

      {!html && !err && (
        <div style={{ border: `1px dashed ${C.line}`, borderRadius: 8, padding: "14px 14px", fontFamily: "var(--ui)", fontSize: 12, color: C.faint, lineHeight: 1.6 }}>
          Sin diseño: el correo sale como texto. Anexa un archivo <b>.html</b> —o escríbelo aquí mismo— para
          enviarlo con formato. Las variables {"{{nombre}}"}, {"{{apellido}}"}, {"{{institucion}}"} y {"{{empresa}}"} también
          se reemplazan dentro del HTML.
          <div style={{ marginTop: 9 }}>
            <Btn size="sm" variant="outline" Icon={Code2} onClick={() => { setTab("codigo"); onChange("<p>Hola {{nombre}},</p>\n"); }}>Escribir el HTML</Btn>
          </div>
        </div>
      )}

      {html && (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 7 }}>
            {[["diseno", "Diseño"], ["codigo", "Código"]].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setTab(k)} className="crm-btn"
                style={{ border: `1px solid ${tab === k ? C.blue : C.line}`, background: tab === k ? C.blueSoft : C.panel, color: tab === k ? C.blue : C.mute, borderRadius: 999, padding: "3px 11px", fontFamily: "var(--ui)", fontSize: 11.5, cursor: "pointer" }}>{l}</button>
            ))}
          </div>
          {tab === "diseno"
            ? <HtmlPreview html={html} />
            : <textarea className="crm-in" rows={10} value={html} onChange={(e) => onChange(e.target.value)} spellCheck={false}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "var(--mono)", fontSize: 12, lineHeight: 1.5 }} />}
          {kb > 100 && (
            <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, color: C.amber, marginTop: 6, lineHeight: 1.5 }}>
              Pesa {kb} KB. Gmail recorta los correos que pasan de ~100 KB y muestra “Mensaje recortado”; conviene aligerarlo.
            </div>
          )}
        </>
      )}

      {err && <div style={{ background: C.claySoft, borderRadius: 6, padding: "8px 10px", marginTop: 7, fontFamily: "var(--ui)", fontSize: 12, color: C.clay, lineHeight: 1.5 }}>{err}</div>}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Plantillas
   ──────────────────────────────────────────────────────────── */
function TemplatesView({ db, setDb, say }) {
  const [tab, setTab] = useState("whatsapp");
  const [draft, setDraft] = useState(null);
  const list = db.templates[tab];

  const save = () => {
    if (!draft.name.trim()) return;
    setDb((d) => {
      const arr = d.templates[tab];
      const exists = arr.some((t) => t.id === draft.id);
      return { ...d, templates: { ...d.templates, [tab]: exists ? arr.map((t) => t.id === draft.id ? draft : t) : [...arr, draft] } };
    });
    setDraft(null); say("Plantilla guardada");
  };

  return (
    <div>
      <Header eyebrow="Mensajería" title="Plantillas"
        right={<Btn variant="solid" Icon={Plus} onClick={() => setDraft({ id: uid(), name: "", subject: "", body: "", html: "" })}>Nueva plantilla</Btn>} />
      <div style={{ padding: "14px 28px", display: "flex", gap: 7, borderBottom: `1px solid ${C.line}` }}>
        {[["whatsapp", "WhatsApp"], ["email", "Correo de marketing"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className="crm-btn" style={{ border: `1px solid ${tab === k ? C.jade : C.line}`, background: tab === k ? C.jade : C.panel, color: tab === k ? "#fff" : C.mute, borderRadius: 999, padding: "5px 13px", fontFamily: "var(--ui)", fontSize: 12.5, cursor: "pointer" }}>{l}</button>
        ))}
      </div>
      <div style={{ padding: 28, display: "flex", flexWrap: "wrap", gap: 14 }}>
        {list.map((t) => (
          <div key={t.id} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 9, padding: 16, flex: "1 1 300px", maxWidth: 400 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontFamily: "var(--display)", fontSize: 14.5, fontWeight: 600 }}>{t.name}</div>
              <div style={{ display: "flex", gap: 4 }}>
                <Btn size="sm" variant="ghost" onClick={() => setDraft(t)}>Editar</Btn>
                <Btn size="sm" variant="ghost" Icon={Trash2} onClick={() => { setDb((d) => ({ ...d, templates: { ...d.templates, [tab]: d.templates[tab].filter((x) => x.id !== t.id) } })); say("Plantilla eliminada"); }} />
              </div>
            </div>
            {t.subject && <div style={{ fontFamily: "var(--ui)", fontSize: 12, color: C.blue, marginTop: 6 }}>Asunto: {t.subject}</div>}
            {t.html && <div style={{ marginTop: 7 }}><Pill color={C.blue} soft={C.blueSoft}>HTML anexo · {pesoKb(t.html)} KB</Pill></div>}
            <div style={{ fontFamily: "var(--ui)", fontSize: 12.5, color: C.mute, marginTop: 8, whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{t.body}</div>
          </div>
        ))}
        {list.length === 0 && <Empty title="Sin plantillas aún" hint="Crea la primera para enviarla a una lista de contactos." />}
      </div>

      {draft && (
        <Modal wide={tab === "email"} title="Plantilla" subtitle="Usa {{nombre}}, {{apellido}}, {{institucion}} o {{empresa}} para personalizar." onClose={() => setDraft(null)}
          footer={<><Btn variant="outline" onClick={() => setDraft(null)}>Cancelar</Btn><Btn variant="solid" Icon={Check} onClick={save}>Guardar plantilla</Btn></>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field def={{ label: "Nombre de la plantilla", type: "text" }} value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
            {tab === "email" && <Field def={{ label: "Asunto", type: "text" }} value={draft.subject} onChange={(v) => setDraft({ ...draft, subject: v })} />}
            <Field def={{ label: tab === "email" && draft.html ? "Mensaje en texto (respaldo del diseño)" : "Mensaje", type: "textarea" }}
              value={draft.body} onChange={(v) => setDraft({ ...draft, body: v })} />
            {tab === "email" && (
              <>
                {draft.html && !String(draft.body || "").trim() && (
                  <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, color: C.faint, marginTop: -4, lineHeight: 1.5 }}>
                    Si lo dejas vacío, el respaldo se saca automáticamente del diseño.
                  </div>
                )}
                <HtmlAttach value={draft.html} onChange={(v) => setDraft({ ...draft, html: v })} />
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Configuración
   ──────────────────────────────────────────────────────────── */
/* ────────────────────────────────────────────────────────────
   Conexiones
   ──────────────────────────────────────────────────────────── */
const Card = ({ title, badge, children }) => (
  <div style={{ background: C.panel, border: "1px solid " + C.line, borderRadius: 9, padding: 18 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10, flexWrap: "wrap" }}>
      <div style={{ fontFamily: "var(--display)", fontSize: 15, fontWeight: 600 }}>{title}</div>
      {badge}
    </div>
    {children}
  </div>
);

const Prose = ({ children }) => (
  <div style={{ fontFamily: "var(--ui)", fontSize: 12.5, color: C.mute, lineHeight: 1.65 }}>{children}</div>
);

const Mono = ({ children }) => (
  <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, background: "#F1F3EE", padding: "1px 5px", borderRadius: 4, color: C.ink, overflowWrap: "anywhere" }}>{children}</span>
);

function ConnectionsView({ db, setDb, say }) {
  const integ = db.integrations;
  const gmail = useGmail();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [probe, setProbe] = useState("");
  const [guide, setGuide] = useState(false);
  const [guiaMed, setGuiaMed] = useState(false);
  const [medProbe, setMedProbe] = useState({ tipo: "", texto: "" });

  const patch = (canal, p) => setDb((d) => ({
    ...d,
    integrations: normalizeIntegrations({ ...d.integrations, [canal]: { ...d.integrations[canal], ...p } }),
  }));

  const gente = [...db.contacts, ...db.companies];
  const conTel = gente.filter((r) => r.props.phone).length;
  const conMail = gente.filter((r) => r.props.email).length;

  const cc = integ.whatsapp.countryCode;
  const ejemplo = probe || (gente.find((r) => r.props.phone) || {}).props?.phone || "";
  const resuelto = toE164(ejemplo, cc);

  const modo = integ.email.mode;
  const med = integ.medicion;
  const origen = window.location.origin;
  const [copiado, setCopiado] = useState(false);
  const copiarOrigen = async () => {
    try { await navigator.clipboard.writeText(origen); setCopiado(true); setTimeout(() => setCopiado(false), 1800); } catch (_) {}
  };
  const BotonOrigen = () => (
    <button onClick={copiarOrigen} className="crm-btn"
      style={{ border: "1px solid " + C.line, background: "#F1F3EE", borderRadius: 4, padding: "1px 6px", cursor: "pointer", fontFamily: "var(--mono)", fontSize: 11.5, color: C.ink }}>
      {copiado ? "copiado ✓" : origen}
    </button>
  );

  const conectar = async () => {
    setErr(""); setBusy(true);
    try {
      const st = await connectGmail(integ.email.clientId);
      patch("email", { account: st.account });
      say(st.account ? "Gmail conectado · " + st.account : "Gmail conectado");
    } catch (e) { setErr((e && e.message) || String(e)); }
    setBusy(false);
  };

  return (
    <div>
      <Header eyebrow="Ajustes" title="Conexiones" />
      <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 20, maxWidth: 880 }}>

        {/* ── WhatsApp ── */}
        <Card title="WhatsApp" badge={<Pill color={C.jade} soft={C.jadeSoft}>Listo para usar</Pill>}>
          <Prose>
            El CRM personaliza el mensaje con los datos de cada registro y abre WhatsApp con el texto
            ya escrito en el chat correcto: tú das el último clic para enviar. Funciona con tu WhatsApp
            de siempre —el del celular o WhatsApp Web—, sin cuenta de empresa ni permisos de Meta.
            <br /><br />
            El envío automático existe (WhatsApp Cloud API), pero pide un token permanente de Meta.
            Guardarlo aquí lo dejaría legible para cualquiera que abra este navegador, y además Meta
            sólo deja iniciar conversaciones con plantillas que ellos aprueban antes. Por eso el CRM
            no lo ofrece: haría falta un servidor propio donde el token esté a resguardo.
          </Prose>

          <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 14, marginTop: 16, alignItems: "start" }}>
            <Field def={{ label: "Indicativo del país" }} value={cc} onChange={(v) => patch("whatsapp", { countryCode: v.replace(/\D/g, "").slice(0, 4) })} />
            <Field def={{ label: "Probar un número" }} value={probe} onChange={setProbe} />
          </div>
          <Prose>
            <div style={{ marginTop: 10 }}>
              {ejemplo ? (
                resuelto
                  ? <>Se marcará a <Mono>+{resuelto}</Mono>{" · "}
                      <a href={waLink(ejemplo, "", cc)} target="_blank" rel="noreferrer" style={{ color: C.jade, fontWeight: 600 }}>abrir este chat</a></>
                  : <>Ese número no tiene dígitos que WhatsApp pueda marcar.</>
              ) : <>Escribe un número arriba para ver cómo quedará marcado.</>}
            </div>
            <div style={{ marginTop: 6, fontSize: 11.5, color: C.faint }}>
              Los números que empiezan por <Mono>+</Mono> o <Mono>00</Mono> se respetan tal cual; a los demás se les
              antepone el indicativo. {conTel} de {gente.length} registros tienen teléfono.
            </div>
          </Prose>
        </Card>

        {/* ── Correo ── */}
        <Card title="Correo electrónico"
          badge={modo === "gmailApi"
            ? (gmail.connected
                ? <Pill color={C.jade} soft={C.jadeSoft}>Conectado{gmail.account ? " · " + gmail.account : ""}</Pill>
                : <Pill color={C.amber} soft={C.amberSoft}>Sin conectar</Pill>)
            : <Pill color={C.blue} soft={C.blueSoft}>Listo para usar</Pill>}>
          <Prose>Elige cómo quieres que salga cada correo desde el CRM.</Prose>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "14px 0" }}>
            {Object.entries(EMAIL_MODES).map(([key, label]) => (
              <label key={key} style={{ display: "flex", gap: 10, alignItems: "flex-start", border: "1px solid " + (modo === key ? C.jade : C.line), background: modo === key ? "#F7FAF8" : C.panel, borderRadius: 7, padding: "10px 12px", cursor: "pointer" }}>
                <input type="radio" name="modo-correo" checked={modo === key} onChange={() => { setErr(""); patch("email", { mode: key }); }} style={{ marginTop: 2, accentColor: C.jade }} />
                <div>
                  <div style={{ fontFamily: "var(--ui)", fontSize: 13, fontWeight: 600 }}>{label}</div>
                  <div style={{ fontFamily: "var(--ui)", fontSize: 12, color: C.mute, marginTop: 2, lineHeight: 1.55 }}>
                    {key === "gmailApi" && "El CRM envía por ti, uno tras otro, y cada correo queda en tus Enviados de Gmail. Requiere autorizar la cuenta una vez (abajo)."}
                    {key === "gmailCompose" && "Abre Gmail en una pestaña con el destinatario, el asunto y el texto ya puestos. Tú revisas y le das a Enviar. Sin configurar nada."}
                    {key === "mailto" && "Abre el programa de correo del computador (Mail, Outlook) con el borrador listo."}
                  </div>
                </div>
              </label>
            ))}
          </div>

          {modo === "gmailApi" && (
            <div style={{ borderTop: "1px solid " + C.line, paddingTop: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "end" }}>
                <Field def={{ label: "ID de cliente de Google" }} value={integ.email.clientId}
                  onChange={(v) => { setErr(""); patch("email", { clientId: v.trim() }); }} />
                {gmail.connected
                  ? <Btn variant="outline" Icon={LogOut} onClick={() => { disconnectGmail(); patch("email", { account: "" }); say("Gmail desconectado"); }}>Desconectar</Btn>
                  : <Btn variant="solid" Icon={ShieldCheck} disabled={busy || !integ.email.clientId} onClick={conectar}>{busy ? "Autorizando…" : "Conectar Gmail"}</Btn>}
              </div>

              {err && (
                <div style={{ marginTop: 10, background: C.claySoft, color: C.clay, borderRadius: 6, padding: "10px 12px", fontFamily: "var(--ui)", fontSize: 12.5, lineHeight: 1.6 }}>
                  <div style={{ fontWeight: 600 }}>{err}</div>
                  <div style={{ marginTop: 8, color: C.ink }}>
                    Casi siempre es una de dos. En <b>Google Cloud → Credenciales → tu ID de cliente</b>:
                    <ol style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                      <li>Que <b>Orígenes autorizados de JavaScript</b> tenga exactamente <BotonOrigen /> (clic para copiar). Si está vacío, Google responde <i>“no registered origin”</i>.</li>
                      <li>Que tu correo esté en <b>Usuarios de prueba</b>, en la pantalla de consentimiento.</li>
                    </ol>
                    <div style={{ marginTop: 6, color: C.mute }}>Después de guardar en Google, los cambios tardan unos minutos en surtir efecto.</div>
                  </div>
                </div>
              )}

              <Prose>
                <div style={{ marginTop: 10, fontSize: 11.5, color: C.faint }}>
                  {integ.email.leerBandeja
                    ? <>Para enviar, el CRM pide <Mono>gmail.send</Mono>; como abajo activaste la bandeja, pide además <Mono>gmail.readonly</Mono>, que deja mirar el correo pero nunca borrarlo ni marcarlo. </>
                    : <>El CRM sólo pide el permiso <Mono>gmail.send</Mono>: alcanza para enviar y para nada más —no puede leer, buscar ni borrar tu correo. </>}
                  El permiso dura una hora, se queda en memoria y nunca se guarda
                  en el disco; al recargar la página se renueva solo, sin volver a preguntarte.
                </div>
              </Prose>

              <button onClick={() => setGuide(!guide)} className="crm-btn"
                style={{ marginTop: 12, background: "none", border: "none", padding: 0, cursor: "pointer", color: C.jade, fontFamily: "var(--ui)", fontSize: 12.5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5 }}>
                <ChevronDown size={14} style={{ transform: guide ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
                Cómo obtener el ID de cliente
              </button>

              {guide && (
                <ol style={{ margin: "10px 0 0", paddingLeft: 20, fontFamily: "var(--ui)", fontSize: 12.5, color: C.mute, lineHeight: 1.75 }}>
                  <li>Entra a <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" style={{ color: C.jade }}>console.cloud.google.com</a> y crea un proyecto (o usa uno que ya tengas).</li>
                  <li><b>APIs y servicios → Biblioteca</b>: busca <b>Gmail API</b> y actívala.</li>
                  <li><b>Pantalla de consentimiento de OAuth</b>: tipo <b>Externo</b>. En <b>Usuarios de prueba</b> agrega tu propio correo, si no Google bloqueará la autorización.</li>
                  <li><b>Credenciales → Crear credenciales → ID de cliente de OAuth</b>, tipo <b>Aplicación web</b>.</li>
                  <li>En <b>Orígenes autorizados de JavaScript</b> agrega exactamente <BotonOrigen /> — sin barra al final, y es un campo distinto del de redireccionamiento. Sin esto Google rechaza la conexión con <i>“no registered origin”</i>.</li>
                  <li>Copia el <b>ID de cliente</b> (termina en <Mono>.apps.googleusercontent.com</Mono>) y pégalo arriba. El <i>secreto</i> no se usa aquí: no hace falta y no debe pegarse.</li>
                </ol>
              )}
            </div>
          )}

          <div style={{ borderTop: "1px solid " + C.line, paddingTop: 14, marginTop: 14 }}>
            <Field def={{ label: "Firma al pie de cada correo", type: "textarea" }} value={integ.email.signature}
              onChange={(v) => patch("email", { signature: v })} />
            <Prose><div style={{ marginTop: 6, fontSize: 11.5, color: C.faint }}>Se agrega al final del mensaje, separada por una línea. {conMail} de {gente.length} registros tienen correo.</div></Prose>
          </div>
        </Card>

        {/* ── Lo que llega ── */}
        <Card title="Mensajes recibidos"
          badge={integ.email.leerBandeja
            ? (gmail.puedeLeer
                ? <Pill color={C.jade} soft={C.jadeSoft}>Bandeja conectada</Pill>
                : <Pill color={C.amber} soft={C.amberSoft}>Falta autorizar</Pill>)
            : <Pill color={C.mute} soft="#E6E9E3">Sólo a mano</Pill>}>
          <Prose>
            Enviar deja constancia solo, pero las respuestas llegan por fuera del CRM. En <b>Mensajes</b> cada
            contacto tiene un hilo con las dos mitades de la conversación; esto decide cómo se llena.
          </Prose>

          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", border: "1px solid " + (integ.email.leerBandeja ? C.jade : C.line), background: integ.email.leerBandeja ? "#F7FAF8" : C.panel, borderRadius: 7, padding: "11px 12px", cursor: "pointer", margin: "14px 0 0" }}>
            <input type="checkbox" checked={integ.email.leerBandeja} style={{ marginTop: 2, accentColor: C.jade }}
              onChange={(e) => {
                const on = e.target.checked;
                setErr("");
                patch("email", { leerBandeja: on });
                /* Apagarlo devuelve el permiso en el acto en vez de dejarlo
                   vivo hasta que caduque: si dijiste que no, que sea ya. */
                if (!on && gmail.puedeLeer) { disconnectGmail(); patch("email", { account: "" }); }
              }} />
            <div>
              <div style={{ fontFamily: "var(--ui)", fontSize: 13, fontWeight: 600 }}>Traer los correos de Gmail</div>
              <div style={{ fontFamily: "var(--ui)", fontSize: 12, color: C.mute, marginTop: 2, lineHeight: 1.55 }}>
                El botón <b>Correo</b> de Mensajes revisa tu bandeja y baja los correos cruzados con la gente que ya
                está en el CRM. Todo lo demás —boletines, facturas, lo personal— se descarta al leer la cabecera y
                nunca se guarda. Los que sí entran quedan en este navegador, como el resto del cuaderno.
              </div>
            </div>
          </label>

          {integ.email.leerBandeja && (
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {gmail.puedeLeer
                ? <Prose><span style={{ fontSize: 12 }}>Leyendo desde <b>{gmail.account || "tu cuenta"}</b>. {db.buzon.correoAl ? `Último barrido: ${fmt(db.buzon.correoAl)}.` : "Todavía sin sincronizar."}</span></Prose>
                : <>
                    <Btn variant="solid" Icon={ShieldCheck} disabled={busy || !integ.email.clientId}
                      onClick={async () => {
                        setErr(""); setBusy(true);
                        try {
                          const st = await connectGmail(integ.email.clientId, { leer: true });
                          patch("email", { account: st.account });
                          say(st.puedeLeer ? "Bandeja autorizada" : "Google no concedió el permiso de lectura");
                        } catch (e) { setErr((e && e.message) || String(e)); }
                        setBusy(false);
                      }}>{busy ? "Autorizando…" : "Autorizar lectura"}</Btn>
                    <Prose><span style={{ fontSize: 11.5, color: C.faint }}>
                      {integ.email.clientId
                        ? "Usa el mismo ID de cliente de Google de arriba. Se pide una vez por sesión."
                        : "Pega antes el ID de cliente de Google en “Correo electrónico”, arriba."}
                    </span></Prose>
                  </>}
            </div>
          )}

          <div style={{ borderTop: "1px solid " + C.line, paddingTop: 14, marginTop: 16 }}>
            <div style={{ fontFamily: "var(--ui)", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>WhatsApp: las respuestas se pegan a mano</div>
            <Prose>
              No hay forma de leerlas desde aquí. Lo que llega a tu WhatsApp sólo se puede consultar con la API de
              Meta, y eso pide una cuenta de empresa aprobada y un servidor propio donde guardar el token; WhatsApp
              Web tampoco deja que otra página lea sus chats. Así que en el hilo de cada contacto hay un botón
              <b> Registrar recibido</b>: pegas la respuesta, queda con su fecha y del lado de quien la escribió, y la
              conversación se lee completa.
            </Prose>
          </div>
        </Card>

        {/* ── Medición ── */}
        <Card title="Medición de correos"
          badge={midiendo(med)
            ? <Pill color={C.jade} soft={C.jadeSoft}>Midiendo{med.aperturas && med.clics ? " aperturas y clics" : med.aperturas ? " aperturas" : " clics"}</Pill>
            : (med.base || med.clave)
              ? <Pill color={C.amber} soft={C.amberSoft}>Sin terminar</Pill>
              : <Pill color={C.mute} soft="#E6E9E3">Apagada</Pill>}>
          <Prose>
            Que Gmail acepte un correo no quiere decir que alguien lo haya leído. Esto agrega dos marcas
            invisibles a cada envío —una imagen de un píxel al final, y los enlaces pasando por un
            redirector— y con eso el CRM puede decir <b>quién abrió</b> y <b>quién pinchó</b>.
            <br /><br />
            Hace falta publicar un servicio diminuto, una vez: la apertura ocurre en la máquina de otra
            persona, horas después, con esta pestaña cerrada, y alguien tiene que estar despierto para
            recibir el aviso. Está en la carpeta <Mono>tracker/</Mono> del proyecto y corre gratis en
            Cloudflare. No guarda ni el correo ni el nombre de nadie: sólo el identificador aleatorio del
            envío, que únicamente significa algo dentro de este CRM.
          </Prose>

          <div style={{ marginTop: 14, background: "#F6F8F4", border: "1px solid " + C.line, borderRadius: 7, padding: "11px 13px" }}>
            <div style={{ fontFamily: "var(--ui)", fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>Antes de fiarte de los números</div>
            <Prose>
              <ul style={{ margin: 0, paddingLeft: 17 }}>
                <li><b>El clic es firme.</b> Ningún sistema pincha un enlace por su cuenta. Si quieres una sola cifra en la que confiar, es ésa.</li>
                <li><b>La apertura se queda corta.</b> Quien lee con las imágenes bloqueadas no aparece nunca, aunque haya leído entero.</li>
                <li><b>Y a veces sobra.</b> Apple Mail descarga las imágenes al recibir el correo, sin que nadie lo abra. El CRM marca como <i>dudosas</i> las que llegan en el primer minuto, que son casi siempre ésas.</li>
                <li><b>El “cuántas veces” no sirve.</b> Gmail guarda la imagen en su caché la primera vez, así que las relecturas se pierden. Fíate del <i>sí abrió</i>.</li>
              </ul>
            </Prose>
          </div>

          {modo !== "gmailApi" && (
            <div style={{ marginTop: 12, background: C.amberSoft, color: C.amber, borderRadius: 6, padding: "10px 12px", fontFamily: "var(--ui)", fontSize: 12.5, lineHeight: 1.6 }}>
              Medir exige que el CRM arme el mensaje, y ahora mismo está en <b>“{EMAIL_MODES[modo]}”</b>: por ahí se
              le entrega el texto a Gmail o a tu programa de correo, y no queda dónde poner la marca. Cambia
              a <b>“Gmail conectado”</b> arriba para que la medición se aplique.
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
            <Field def={{ label: "Dirección del medidor" }} value={med.base}
              onChange={(v) => { setMedProbe({ tipo: "", texto: "" }); patch("medicion", { base: v }); }} />
            <Field def={{ label: "Clave" }} value={med.clave}
              onChange={(v) => { setMedProbe({ tipo: "", texto: "" }); patch("medicion", { clave: v }); }} />
          </div>
          <Prose><div style={{ marginTop: 6, fontSize: 11.5, color: C.faint }}>
            La dirección es la que imprime <Mono>wrangler deploy</Mono>, algo como
            <Mono>https://crm-medidor.tu-cuenta.workers.dev</Mono>. La clave es la misma que guardaste
            con <Mono>wrangler secret put CLAVE</Mono>.
          </div></Prose>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
            {[
              ["aperturas", "Medir aperturas", "Agrega la imagen de un píxel al final del correo. Si el envío no lleva diseño HTML, el CRM le arma una versión con el mismo texto para poder ponerla; quien lo reciba lee exactamente lo mismo."],
              ["clics", "Medir clics en los enlaces", "Los enlaces del correo pasan por el medidor antes de llegar a su destino. El destinatario no nota nada salvo un parpadeo. Es la señal más confiable de las dos."],
            ].map(([clave, titulo, detalle]) => (
              <label key={clave} style={{ display: "flex", gap: 10, alignItems: "flex-start", border: "1px solid " + (med[clave] ? C.jade : C.line), background: med[clave] ? "#F7FAF8" : C.panel, borderRadius: 7, padding: "11px 12px", cursor: "pointer" }}>
                <input type="checkbox" checked={med[clave]} style={{ marginTop: 2, accentColor: C.jade }}
                  onChange={(e) => patch("medicion", { [clave]: e.target.checked })} />
                <div>
                  <div style={{ fontFamily: "var(--ui)", fontSize: 13, fontWeight: 600 }}>{titulo}</div>
                  <div style={{ fontFamily: "var(--ui)", fontSize: 12, color: C.mute, marginTop: 2, lineHeight: 1.55 }}>{detalle}</div>
                </div>
              </label>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <Btn variant="outline" Icon={Gauge} disabled={busy || !med.base || !med.clave}
              onClick={async () => {
                setBusy(true); setMedProbe({ tipo: "", texto: "" });
                try {
                  await probarMedidor({ base: med.base, clave: med.clave });
                  setMedProbe({ tipo: "ok", texto: "El medidor responde y la clave es la correcta." });
                } catch (e) {
                  setMedProbe({ tipo: "err", texto: (e && e.message) || String(e) });
                }
                setBusy(false);
              }}>Probar el medidor</Btn>
            {medProbe.texto && (
              <Prose><span style={{ fontSize: 12, color: medProbe.tipo === "ok" ? C.jade : C.clay, fontWeight: 500 }}>{medProbe.texto}</span></Prose>
            )}
          </div>
          <Prose><div style={{ marginTop: 8, fontSize: 11.5, color: C.faint }}>
            {db.buzon.eventosAl
              ? <>Lo anotado se recoge con <b>Actualizar estados</b>, en Actividades. Última vez: {fmt(db.buzon.eventosAl)}.</>
              : <>Lo anotado se recoge con <b>Actualizar estados</b>, en Actividades. Todavía sin recoger nada.</>}
          </div></Prose>

          <button onClick={() => setGuiaMed(!guiaMed)} className="crm-btn"
            style={{ marginTop: 12, background: "none", border: "none", padding: 0, cursor: "pointer", color: C.jade, fontFamily: "var(--ui)", fontSize: 12.5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <ChevronDown size={14} style={{ transform: guiaMed ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
            Cómo publicar el medidor
          </button>
          {guiaMed && (
            <ol style={{ margin: "10px 0 0", paddingLeft: 20, fontFamily: "var(--ui)", fontSize: 12.5, color: C.mute, lineHeight: 1.85 }}>
              <li>Crea una cuenta gratuita en <a href="https://dash.cloudflare.com/sign-up" target="_blank" rel="noreferrer" style={{ color: C.jade }}>Cloudflare</a>.</li>
              <li>En una terminal, dentro de la carpeta del proyecto: <Mono>cd tracker</Mono> y luego <Mono>npx wrangler login</Mono>.</li>
              <li><Mono>npx wrangler kv namespace create EVENTOS</Mono> — imprime un id; pégalo en <Mono>tracker/wrangler.toml</Mono>, donde dice <Mono>PEGA_AQUI_EL_ID</Mono>.</li>
              <li><Mono>npx wrangler secret put CLAVE</Mono> — inventa una clave larga y apúntala: es la misma que va aquí arriba.</li>
              <li><Mono>npx wrangler deploy</Mono>. Copia la dirección que imprime y pégala aquí arriba.</li>
              <li>Pulsa <b>Probar el medidor</b>. Si responde, activa las casillas y manda un correo de prueba a una dirección tuya.</li>
            </ol>
          )}
        </Card>

        <Prose>
          Las conexiones se guardan junto al resto del cuaderno y viajan en el respaldo. El ID de cliente de Google
          no es un secreto —identifica la app, no a ti— pero el permiso de la cuenta nunca sale de esta pestaña.
        </Prose>
      </div>
    </div>
  );
}

function SettingsView({ db, setDb, setModal, say }) {
  const exportBackup = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `crm-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    say("Respaldo descargado");
  };

  const restoreBackup = async (file) => {
    if (!file) return;
    try {
      const next = normalizeDb(JSON.parse(await file.text()));
      const n = next.contacts.length + next.companies.length + next.deals.length;
      if (!window.confirm(`Se reemplazarán los datos actuales por los del respaldo (${n} registros). Esta acción no se puede deshacer. ¿Continuar?`)) return;
      setDb({ ...purgeDemoData(next).db, demoPurgedAt: nowISO() });
      say(`Respaldo restaurado · ${n} registros`);
    } catch (e) {
      say(`No pude leer el respaldo: ${(e && e.message) || e}`);
    }
  };

  const removeProp = (objKind, key) => {
    setDb((d) => ({ ...d, schema: { ...d.schema, [objKind]: d.schema[objKind].filter((f) => f.key !== key) } }));
    say("Propiedad eliminada");
  };
  return (
    <div>
      <Header eyebrow="Ajustes" title="Propiedades y datos" />
      <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 20 }}>
        {Object.keys(OBJ).map((k) => (
          <div key={k} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 9, padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontFamily: "var(--display)", fontSize: 15, fontWeight: 600 }}>Propiedades de {OBJ[k].plural.toLowerCase()}</div>
              <Btn size="sm" variant="outline" Icon={Plus} onClick={() => setModal({ kind: "prop", objKind: k })}>Crear propiedad</Btn>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {db.schema[k].map((f) => (
                <div key={f.key} style={{ border: `1px solid ${C.line}`, borderRadius: 7, padding: "8px 11px", display: "flex", alignItems: "center", gap: 9, background: f.system ? "#F7F9F5" : C.jadeSoft }}>
                  <div>
                    <div style={{ fontFamily: "var(--ui)", fontSize: 12.5, fontWeight: 600 }}>{f.label}</div>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: C.faint }}>{f.key} · {f.type}{f.system ? " · sistema" : ""}</div>
                  </div>
                  {!f.system && <button onClick={() => removeProp(k, f.key)} className="crm-btn" style={{ border: "none", background: "none", cursor: "pointer", color: C.clay, padding: 2 }}><Trash2 size={13} /></button>}
                </div>
              ))}
            </div>
          </div>
        ))}

        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 9, padding: 18 }}>
          <div style={{ fontFamily: "var(--display)", fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Datos y respaldo</div>
          <div style={{ fontFamily: "var(--ui)", fontSize: 12.5, color: C.mute, marginBottom: 12, lineHeight: 1.6 }}>
            {db.contacts.length} contactos · {db.companies.length} empresas · {db.deals.length} negocios · {db.activities.length} actividades.
            <br />Todo queda guardado en este navegador apenas lo escribes. El respaldo es un archivo con la copia completa: sirve para conservarla fuera del equipo o para pasarla a otro navegador.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Btn variant="outline" Icon={Download} onClick={exportBackup}>Descargar respaldo</Btn>
            <label className="crm-btn" style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 6, border: `1px solid ${C.line}`, background: C.panel, color: C.ink, fontFamily: "var(--ui)", fontSize: 13, fontWeight: 500, padding: "7px 12px", cursor: "pointer" }}>
              <Upload size={14} strokeWidth={2} /> Restaurar respaldo
              <input type="file" accept=".json,application/json" style={{ display: "none" }} onChange={(e) => { restoreBackup(e.target.files && e.target.files[0]); e.target.value = ""; }} />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Formulario de registro
   ──────────────────────────────────────────────────────────── */
function RecordForm({ db, objKind, id, presets, onClose, onSave, onAbrirDuplicado }) {
  const schema = db.schema[objKind];
  const coll = objKind === "contact" ? db.contacts : objKind === "company" ? db.companies : db.deals;
  const existing = id ? coll.find((r) => r.id === id) : null;
  const [v, setV] = useState(existing ? { ...existing.props } : { ...(presets || {}) });

  const visible = schema.filter((f) => !f.readOnly && (!f.showIf || v[f.showIf.key] === f.showIf.value));
  const missing = schema.filter((f) => f.required && !String(v[f.key] || "").trim()).map((f) => f.label);

  /* Se revisa mientras se escribe y no al guardar: enterarse de que la persona
     ya estaba después de teclear la ficha entera es enterarse tarde. Vale
     igual al editar —cambiarle el correo a alguien puede pisar el de otro—. */
  const duplicado = objKind === "contact" ? findByEmail(coll, v.email, id) : null;

  return (
    <Modal wide title={existing ? `Editar ${OBJ[objKind].singular.toLowerCase()}` : `Crear ${OBJ[objKind].singular.toLowerCase()}`}
      subtitle={existing ? "Los cambios se guardan en el registro y quedan visibles para el equipo." : "Los campos con * son obligatorios."}
      onClose={onClose}
      footer={<><Btn variant="outline" onClick={onClose}>Cancelar</Btn>
        <Btn variant="solid" Icon={Check} disabled={missing.length > 0 || !!duplicado} onClick={() => onSave({ ...v, lastActivityAt: v.lastActivityAt || nowISO() }, id)}>
          {existing ? "Guardar cambios" : "Crear"}</Btn></>}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 13 }}>
        {visible.map((f) => <Field key={f.key} def={f} value={v[f.key]} onChange={(val) => setV({ ...v, [f.key]: val })} />)}
      </div>
      {duplicado && (
        <div style={{ marginTop: 14, background: C.claySoft, border: `1px solid ${C.clay}33`, borderRadius: 8, padding: "10px 12px", fontFamily: "var(--ui)", fontSize: 12.5, color: C.ink, lineHeight: 1.55 }}>
          <div><strong style={{ fontWeight: 600 }}>{titleOf("contact", duplicado)}</strong> ya tiene el correo {emailKey(v.email)}.</div>
          <div style={{ color: C.mute, marginTop: 2 }}>
            {existing ? "Ese correo es de otra ficha. Cámbialo o edita la ficha que ya lo tiene." : "No se crea otra ficha: trabaja sobre la que ya existe o usa un correo distinto."}
          </div>
          {onAbrirDuplicado && (
            <button onClick={() => onAbrirDuplicado(duplicado.id)}
              style={{ marginTop: 6, background: "none", border: "none", padding: 0, cursor: "pointer", color: C.jade, fontFamily: "var(--ui)", fontSize: 12.5, fontWeight: 600, textDecoration: "underline" }}>
              Abrir esa ficha
            </button>
          )}
        </div>
      )}
      {missing.length > 0 && <div style={{ marginTop: 14, fontFamily: "var(--ui)", fontSize: 12.5, color: C.clay }}>Falta completar: {missing.join(", ")}.</div>}
    </Modal>
  );
}

/* ────────────────────────────────────────────────────────────
   Carga masiva
   ──────────────────────────────────────────────────────────── */
function ImportModal({ db, objKind, onClose, onImport }) {
  const schema = db.schema[objKind];
  const [text, setText] = useState("");
  const [map, setMap] = useState({});
  const [fileName, setFileName] = useState("");
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const rows = useMemo(() => (text.trim() ? parseCSV(text) : []), [text]);
  const headers = rows[0] || [];
  const body = rows.slice(1);

  const labelOf = (h, i) => String(h || "").trim() || `Columna ${i + 1}`;
  const colValues = (i) => body.map((r) => String(r[i] ?? "").trim()).filter(Boolean);

  // Tipo de dato deducido a partir de los valores de la columna.
  const guessType = (i) => {
    const vals = colValues(i).slice(0, 40);
    if (!vals.length) return "text";
    const all = (re) => vals.every((v) => re.test(v));
    if (all(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) return "email";
    if (all(/^(https?:\/\/|www\.)\S+$/i)) return "url";
    if (all(/^(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})$/)) return "date";
    if (all(/^\+?[\d][\d\s().-]{6,}$/)) return "phone";
    if (vals.some((v) => v.length > 60)) return "textarea";
    return "text";
  };

  // Toda columna reconocida se asigna a su propiedad; el resto se crea nueva.
  useEffect(() => {
    if (!headers.length) return;
    const m = {};
    headers.forEach((h, i) => {
      const hit = schema.find((f) => norm(f.label) === norm(h) || norm(f.key) === norm(h));
      m[i] = hit ? hit.key : NEW_PROP;
    });
    setMap(m);
  }, [text]);

  const newCols = headers.map((h, i) => i).filter((i) => map[i] === NEW_PROP);

  // Valores nuevos que llegan a propiedades de tipo lista y aún no son opción.
  const optionAdds = useMemo(() => {
    const out = [];
    headers.forEach((h, i) => {
      const f = schema.find((x) => x.key === map[i]);
      if (!f || f.type !== "select") return;
      const known = (f.options || []).map(norm);
      const extra = [...new Set(colValues(i))].filter((v) => !known.includes(norm(v)));
      if (!extra.length) return;
      const prev = out.find((o) => o.key === f.key);
      if (prev) prev.values = [...new Set([...prev.values, ...extra])];
      else out.push({ key: f.key, values: extra });
    });
    return out;
  }, [map, rows]);

  /* Misma regla que en el formulario, aplicada fila por fila: se descarta lo
     que ya está en el CRM y lo que el propio archivo repite —una lista
     exportada dos veces trae a la misma persona dos veces—. Sin columna de
     correo mapeada no hay con qué comparar y entra todo; una fila sin correo
     también entra, porque donde no hay dirección no hay regla que aplicar. */
  const dedupe = useMemo(() => {
    const todo = { keep: body.map((_, i) => i), enCrm: [], enArchivo: [] };
    if (objKind !== "contact") return todo;
    const col = Object.keys(map).map(Number).find((i) => map[i] === "email");
    if (col === undefined) return todo;
    const yaEstan = new Set(db.contacts.map((r) => emailKey(r.props.email)).filter(Boolean));
    const vistos = new Set();
    const keep = [], enCrm = [], enArchivo = [];
    body.forEach((r, i) => {
      const k = emailKey(r[col]);
      if (!k) { keep.push(i); return; }
      if (yaEstan.has(k)) { enCrm.push(k); return; }
      if (vistos.has(k)) { enArchivo.push(k); return; }
      vistos.add(k); keep.push(i);
    });
    return { keep, enCrm, enArchivo };
  }, [map, rows, db.contacts, objKind]);

  const omitidos = dedupe.enCrm.length + dedupe.enArchivo.length;

  const build = () => {
    const used = new Set(schema.map((f) => f.key));
    const newFields = [];
    const keyByCol = {};
    newCols.forEach((i) => {
      const label = labelOf(headers[i], i);
      let key = `c_${norm(label) || "col"}_${uid().slice(0, 4)}`;
      while (used.has(key)) key = `c_${norm(label) || "col"}_${uid().slice(0, 4)}`;
      used.add(key);
      keyByCol[i] = key;
      newFields.push({ key, label, type: guessType(i), col: true });
    });

    const records = dedupe.keep.map((fila) => {
      const props = { createdAt: nowISO(), lastActivityAt: nowISO(), leadSource: "Carga masiva" };
      body[fila].forEach((cell, i) => {
        const val = String(cell ?? "").trim();
        if (!val) return;
        const key = map[i] === NEW_PROP ? keyByCol[i] : map[i];
        if (key) props[key] = val;
      });
      if (!props.leadStatus) props.leadStatus = "Nuevo";
      return { id: uid(), props };
    });

    return { records, newFields, optionAdds, omitidos };
  };

  // Lee CSV/TSV/TXT y hojas de cálculo (.xlsx, .xls, .ods); detecta el formato
  // por firma binaria, no solo por la extensión.
  const loadFile = async (file) => {
    if (!file) return;
    setErr(""); setNote(""); setBusy(true); setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const sig = new Uint8Array(buf.slice(0, 4));
      const isZip = sig[0] === 0x50 && sig[1] === 0x4b;   // xlsx / ods
      const isXls = sig[0] === 0xd0 && sig[1] === 0xcf;   // xls antiguo
      const ext = (file.name.split(".").pop() || "").toLowerCase();
      if (isZip || isXls || ["xlsx", "xlsm", "xlsb", "xls", "ods", "numbers"].includes(ext)) {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(buf, { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        if (!ws) throw new Error("El archivo no tiene hojas con datos.");
        // Excel exporta fechas como 4/12/07 (ambiguo); las pasamos a yyyy-mm-dd.
        const pad = (n) => String(n).padStart(2, "0");
        Object.keys(ws).forEach((addr) => {
          const c = ws[addr];
          if (addr[0] === "!" || c?.t !== "d" || !(c.v instanceof Date)) return;
          c.w = `${c.v.getFullYear()}-${pad(c.v.getMonth() + 1)}-${pad(c.v.getDate())}`;
        });
        const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false });
        if (!csv.trim()) throw new Error("La primera hoja está vacía.");
        setText(csv);
        if (wb.SheetNames.length > 1) setNote(`Se leyó la hoja “${wb.SheetNames[0]}”. El archivo tiene ${wb.SheetNames.length} hojas; las demás no se importan.`);
      } else {
        let txt = new TextDecoder("utf-8").decode(buf);
        if (txt.includes("\uFFFD")) txt = new TextDecoder("windows-1252").decode(buf); // CSV exportado desde Excel
        if (!txt.trim()) throw new Error("El archivo está vacío.");
        setText(txt);
      }
    } catch (e) {
      setText("");
      setErr(`No pude leer “${file.name}”. ${e?.message || ""} Guárdalo como CSV o Excel (.xlsx) e inténtalo de nuevo.`);
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e) => { e.preventDefault(); setDrag(false); loadFile(e.dataTransfer.files?.[0]); };

  const sample = objKind === "contact" ? "Nombre,Apellido,Teléfono,Correo,Institución" : "Nombre,Teléfono,Correo,URL";

  return (
    <Modal wide title={`Cargar ${OBJ[objKind].plural.toLowerCase()} desde archivo`} subtitle="Sube un CSV o pega los datos. La primera fila debe traer los encabezados. Las columnas que no existan se crean como propiedades nuevas." onClose={onClose}
      footer={<><Btn variant="outline" onClick={onClose}>Cancelar</Btn>
        <Btn variant="solid" Icon={Upload} disabled={!dedupe.keep.length} onClick={() => onImport(build())}>
          {body.length && !dedupe.keep.length ? "Nada que importar" : `Importar ${dedupe.keep.length || ""} registros`}</Btn></>}>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap", border: `1px dashed ${drag ? C.jade : C.line}`, background: drag ? C.jadeSoft : "transparent", borderRadius: 8, padding: "10px 12px" }}>
        <input type="file" accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xlsb,.xls,.ods,.numbers" onChange={(e) => loadFile(e.target.files?.[0])} style={{ fontFamily: "var(--ui)", fontSize: 12.5 }} />
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: C.faint }}>
          {busy ? "leyendo archivo…" : fileName ? `${fileName} · arrastra otro o pega abajo` : "CSV o Excel · arrastra aquí o pega abajo"}
        </span>
      </div>
      {err && <div style={{ fontFamily: "var(--ui)", fontSize: 12.5, color: C.clay, marginBottom: 10, lineHeight: 1.5 }}>{err}</div>}
      {note && <div style={{ fontFamily: "var(--ui)", fontSize: 12.5, color: C.mute, marginBottom: 10, lineHeight: 1.5 }}>{note}</div>}
      <textarea className="crm-in" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={`${sample}\nLaura,Gómez,+57 300 000 0000,laura@correo.com,Colegio Central`}
        style={{ ...inputStyle, fontFamily: "var(--mono)", fontSize: 12, lineHeight: 1.6, resize: "vertical" }} />

      {headers.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
            <div style={{ fontFamily: "var(--ui)", fontSize: 12.5, fontWeight: 600 }}>Asigna cada columna a una propiedad</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: C.faint, textTransform: "uppercase", letterSpacing: ".06em" }}>
              {headers.length} columnas · {newCols.length} nuevas
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 9 }}>
            {headers.map((h, i) => {
              const isNew = map[i] === NEW_PROP;
              return (
                <label key={i} style={{ border: `1px solid ${isNew ? C.jade : C.line}`, borderRadius: 7, padding: 9, background: isNew ? C.jadeSoft : "transparent" }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: C.faint, marginBottom: 5, textTransform: "uppercase", letterSpacing: ".06em" }}>{labelOf(h, i)}</div>
                  <select className="crm-in" value={map[i] ?? ""} onChange={(e) => setMap({ ...map, [i]: e.target.value })} style={{ ...inputStyle, padding: "5px 7px", fontSize: 12 }}>
                    <option value={NEW_PROP}>+ Crear propiedad nueva</option>
                    {schema.map((f) => <option key={f.key} value={f.key}>{f.label}{f.readOnly ? " (sistema)" : ""}</option>)}
                    <option value="">No importar</option>
                  </select>
                  {isNew && <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: C.mute, marginTop: 5 }}>se creará como {guessType(i)}</div>}
                </label>
              );
            })}
          </div>
          <div style={{ fontFamily: "var(--ui)", fontSize: 12.5, color: C.mute, marginTop: 12, lineHeight: 1.6 }}>
            Se importarán <b>{dedupe.keep.length}</b> de {body.length} registros con fuente “Carga masiva”.
            {omitidos > 0 && (
              <><br /><span style={{ color: C.clay }}>
                Se omiten <b>{omitidos}</b> por correo repetido
                {dedupe.enCrm.length > 0 && `: ${dedupe.enCrm.length} ya ${dedupe.enCrm.length === 1 ? "está" : "están"} en el CRM`}
                {dedupe.enCrm.length > 0 && dedupe.enArchivo.length > 0 && " y"}
                {dedupe.enArchivo.length > 0 && `${dedupe.enCrm.length > 0 ? " " : ": "}${dedupe.enArchivo.length} se ${dedupe.enArchivo.length === 1 ? "repite" : "repiten"} dentro del archivo`}.
              </span></>
            )}
            {newCols.length > 0 && <><br />Se crearán <b>{newCols.length}</b> propiedades nuevas: {newCols.map((i) => labelOf(headers[i], i)).join(", ")}.</>}
            {optionAdds.length > 0 && <><br />Se agregarán opciones nuevas a: {optionAdds.map((o) => schema.find((f) => f.key === o.key)?.label).join(", ")}.</>}
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ────────────────────────────────────────────────────────────
   Nueva propiedad
   ──────────────────────────────────────────────────────────── */
function PropertyModal({ objKind, onClose, onCreate }) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState("text");
  const [opts, setOpts] = useState("");
  const key = norm(label) || "";
  return (
    <Modal title={`Nueva propiedad de ${OBJ[objKind].plural.toLowerCase()}`} subtitle="Aparecerá en los formularios, en la tabla y en la importación." onClose={onClose}
      footer={<><Btn variant="outline" onClick={onClose}>Cancelar</Btn>
        <Btn variant="solid" Icon={Check} disabled={!label.trim()} onClick={() => onCreate({ key: `c_${key}_${uid().slice(0, 4)}`, label: label.trim(), type, options: type === "select" ? opts.split(",").map((s) => s.trim()).filter(Boolean) : undefined, col: true })}>Crear propiedad</Btn></>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field def={{ label: "Nombre de la propiedad", type: "text", required: true }} value={label} onChange={setLabel} />
        <Field def={{ label: "Tipo de dato", type: "select", options: ["text", "number", "email", "phone", "url", "date", "select", "textarea"] }} value={type} onChange={setType} />
        {type === "select" && <Field def={{ label: "Opciones separadas por coma", type: "text" }} value={opts} onChange={setOpts} />}
      </div>
    </Modal>
  );
}

/* ────────────────────────────────────────────────────────────
   Edición en masa
   Rellenar una propiedad en muchas fichas sin abrirlas una por una: se elige
   el campo, se pone el valor y se decide a quién le toca. Antes de aplicar se
   dice cuántos registros cambian y cuántos ya traían un valor, porque pisar
   datos buenos por descuido es el riesgo real de una acción masiva.
   ──────────────────────────────────────────────────────────── */
const OTRO_VALOR = "__otro__"; // en una propiedad de lista: valor fuera de las opciones

function BulkEditModal({ db, objKind, ids, onClose, onApply }) {
  const schema = db.schema[objKind];
  const coll = objKind === "contact" ? db.contacts : objKind === "company" ? db.companies : db.deals;
  const editables = schema.filter((f) => !f.readOnly);

  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [otro, setOtro] = useState(false);
  const [mode, setMode] = useState("overwrite");

  const def = editables.find((f) => f.key === key) || null;
  const registros = useMemo(() => {
    const marcados = new Set(ids);
    return coll.filter((r) => marcados.has(r.id));
  }, [coll, ids]);

  const limpio = String(value || "").trim();
  const conValor = key ? registros.filter((r) => !(r.props[key] === undefined || r.props[key] === null || r.props[key] === "")).length : 0;
  const cambian = !key ? 0 : registros.filter((r) => {
    const actual = r.props[key] == null ? "" : String(r.props[key]);
    if (mode === "fill") return actual === "" && limpio !== "";
    if (mode === "clear") return actual !== "";
    return actual !== limpio;
  }).length;

  const nuevaOpcion = def && def.type === "select" && limpio && !(def.options || []).includes(limpio) ? limpio : null;
  const listo = !!key && (mode === "clear" || limpio !== "");

  /* Cambiar de campo limpia el valor —lo que servía para uno rara vez sirve
     para otro— y saca del modo borrar si el campo nuevo es obligatorio. */
  const elegirCampo = (k) => {
    const nuevo = editables.find((f) => f.key === k);
    setKey(k); setValue(""); setOtro(false);
    if (mode === "clear" && nuevo && nuevo.required) setMode("overwrite");
  };

  const MODOS = [
    { key: "overwrite", label: "Todos los seleccionados", hint: "Escribe el valor en cada registro marcado, tenga o no algo escrito." },
    { key: "fill", label: "Sólo los que estén vacíos", hint: "Respeta lo que ya esté diligenciado y completa el resto." },
    { key: "clear", label: "Borrar el valor", hint: "Deja la propiedad en blanco en los registros marcados." },
  ].filter((m) => !(m.key === "clear" && def && def.required));

  return (
    <Modal title="Editar una propiedad en masa"
      subtitle={`${registros.length} ${registros.length === 1 ? OBJ[objKind].singular.toLowerCase() : OBJ[objKind].plural.toLowerCase()} seleccionado${registros.length === 1 ? "" : "s"}.`}
      onClose={onClose}
      footer={<><Btn variant="outline" onClick={onClose}>Cancelar</Btn>
        <Btn variant="solid" Icon={Check} disabled={!listo || cambian === 0}
          onClick={() => onApply({ key, value: mode === "clear" ? "" : limpio, mode, addOption: mode === "clear" ? null : nuevaOpcion })}>
          {cambian === 0 ? "Sin cambios" : `Aplicar a ${cambian} registro${cambian === 1 ? "" : "s"}`}</Btn></>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        <label style={{ display: "block" }}>
          <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, fontWeight: 600, color: C.mute, marginBottom: 5, letterSpacing: ".02em" }}>Propiedad</div>
          <select className="crm-in" value={key} onChange={(e) => elegirCampo(e.target.value)} style={inputStyle}>
            <option value="">Elige la propiedad a diligenciar…</option>
            {editables.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </label>

        {def && mode !== "clear" && (
          def.type === "select" && !otro ? (
            <label style={{ display: "block" }}>
              <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, fontWeight: 600, color: C.mute, marginBottom: 5, letterSpacing: ".02em" }}>Valor</div>
              <select className="crm-in" value={value} style={inputStyle}
                onChange={(e) => { if (e.target.value === OTRO_VALOR) { setOtro(true); setValue(""); } else setValue(e.target.value); }}>
                <option value="">—</option>
                {(def.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                <option value={OTRO_VALOR}>Otro valor…</option>
              </select>
            </label>
          ) : (
            <Field def={{ label: "Valor", type: def.type === "select" ? "text" : def.type }} value={value} onChange={setValue} />
          )
        )}

        {def && (
          <div>
            <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, fontWeight: 600, color: C.mute, marginBottom: 6, letterSpacing: ".02em" }}>¿A cuáles se aplica?</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {MODOS.map((m) => (
                <label key={m.key} style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}>
                  <input type="radio" name="modo-masivo" checked={mode === m.key} onChange={() => setMode(m.key)} style={{ marginTop: 3, accentColor: C.jade }} />
                  <div>
                    <div style={{ fontFamily: "var(--ui)", fontSize: 13, color: C.ink }}>{m.label}</div>
                    <div style={{ fontFamily: "var(--ui)", fontSize: 12, color: C.mute, lineHeight: 1.45 }}>{m.hint}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {def && (
          <div style={{ background: "#F4F6F1", border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px", fontFamily: "var(--ui)", fontSize: 12.5, color: C.mute, lineHeight: 1.6 }}>
            <div><strong style={{ color: C.ink, fontWeight: 600 }}>{cambian}</strong> de {registros.length} cambiarán · {conValor} ya tienen un valor en {def.label}.</div>
            {mode === "overwrite" && conValor > 0 && <div style={{ color: C.clay }}>Se reemplazará lo que esos {conValor} tengan escrito hoy.</div>}
            {mode === "clear" && conValor > 0 && <div style={{ color: C.clay }}>Se borrará el valor de {conValor} registro{conValor === 1 ? "" : "s"}. No se puede deshacer.</div>}
            {nuevaOpcion && mode !== "clear" && <div>“{nuevaOpcion}” se añadirá a las opciones de la propiedad.</div>}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ────────────────────────────────────────────────────────────
   Preparar y enviar
   El texto se personaliza por destinatario y el envío sale por el canal que
   esté configurado en Conexiones. Cada envío queda registrado en el momento
   en que ocurre —uno a uno—, no en bloque al final: si algo falla a mitad de
   camino, el historial refleja lo que de verdad salió.
   ──────────────────────────────────────────────────────────── */
function SendModal({ db, channel, kind, ids, onClose, onSend, onLogOne }) {
  const integ = db.integrations;
  const gmail = useGmail();
  const templates = db.templates[channel];
  const [tid, setTid] = useState(templates[0]?.id || "");
  const t = templates.find((x) => x.id === tid);
  const [subject, setSubject] = useState(t?.subject || "");
  const [body, setBody] = useState(t?.body || "");
  const [html, setHtml] = useState(t?.html || "");

  useEffect(() => {
    const n = templates.find((x) => x.id === tid);
    setSubject(n?.subject || ""); setBody(n?.body || ""); setHtml(n?.html || "");
  }, [tid]);

  const [done, setDone] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState("");
  const [copiedHtml, setCopiedHtml] = useState("");
  const [vista, setVista] = useState("diseno");

  /* Quien recibe. La lista llega marcada entera —lo normal es escribirle a
     todos los que se traian seleccionados— y quitar a alguien es un clic. */
  const [chosen, setChosen] = useState(() => new Set(ids));
  const [buscar, setBuscar] = useState("");

  const coll = kind === "contact" ? db.contacts : db.companies;
  const candidatos = coll.filter((r) => ids.includes(r.id));
  const recipients = candidatos.filter((r) => chosen.has(r.id));
  const first = recipients[0];
  const ch = CHANNEL[channel];
  const cc = integ.whatsapp.countryCode;
  const modo = integ.email.mode;
  const esCorreo = channel === "email";
  const porApi = esCorreo && modo === "gmailApi";

  const destOf = (r) => (esCorreo ? String(r.props.email || "").trim() : toE164(r.props.phone, cc));
  const sendable = recipients.filter((r) => destOf(r));
  const missingChannel = recipients.length - sendable.length;
  const pending = sendable.filter((r) => !done.has(r.id));

  const conDato = candidatos.filter((r) => destOf(r));
  const filtro = buscar.trim().toLowerCase();
  const visibles = filtro
    ? candidatos.filter((r) => `${titleOf(kind, r)} ${destOf(r)}`.toLowerCase().includes(filtro))
    : candidatos;
  /* Se pintan hasta 100 filas: una lista masiva no se recorre a ojo, se filtra.
     Los botones de arriba siguen actuando sobre la lista completa. */
  const listados = visibles.slice(0, 100);
  const toggle = (id) => setChosen((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  /* El diseño sólo cuenta en correo: por WhatsApp no hay HTML que valga. */
  const conHtml = esCorreo && Boolean(String(html).trim());

  const asuntoDe = (r) => (esCorreo ? applyTemplate(subject, r, kind).trim() || "Correo de marketing" : "");

  /* Versión en texto: la escrita a mano y, si no hay, la que se saca del
     diseño. Nunca se manda un correo con el cuerpo vacío. */
  const cuerpoDe = (r) => {
    const escrito = applyTemplate(body, r, kind);
    const txt = escrito.trim() || (conHtml ? htmlToText(applyTemplate(html, r, kind, true)) : escrito);
    return esCorreo ? withSignature(txt, integ.email.signature) : txt;
  };

  const htmlDe = (r) => (conHtml ? withSignatureHtml(applyTemplate(html, r, kind, true), integ.email.signature) : "");
  const asuntoLog = (r) => (esCorreo ? asuntoDe(r) : t ? `WhatsApp · ${t.name}` : "Mensaje de WhatsApp");

  /* Medir exige que el CRM arme el mensaje, y eso sólo pasa con "Gmail
     conectado". Por las otras dos vías se le entrega el texto al programa de
     correo y ahí ya no hay dónde poner la marca: no se anuncia una medición que
     luego no ocurriría. */
  const medicion = integ.medicion;
  const mideEsto = porApi && midiendo(medicion);

  const prepararEnvio = async (r) => {
    if (!mideEsto) return { trk: "", html: htmlDe(r) };
    /* Un identificador por destinatario: uno compartido diría que "alguien" de
       los doscientos abrió, que no es una respuesta. */
    const trk = nuevoTrk();
    /* Un correo escrito a secas no tiene dónde llevar la marca —en texto plano
       no hay imágenes—, así que se le arma una versión HTML con el mismo texto
       y sale con las dos partes, como cualquier correo con diseño. Quien lo
       reciba lee exactamente lo mismo. */
    const fuente = htmlDe(r) || textoAHtml(cuerpoDe(r));
    const marcado = await marcarHtml(fuente, {
      base: medicion.base, clave: medicion.clave, trk,
      aperturas: medicion.aperturas, clics: medicion.clics,
    });
    return { trk, html: marcado };
  };

  const marcar = (r, trk) => {
    onLogOne(r.id, { subject: asuntoLog(r), body: cuerpoDe(r), trk });
    setDone((s) => new Set(s).add(r.id));
  };

  /* mailto: no puede abrirse con window.open sin dejar una pestaña huérfana;
     un enlace pinchado por código llama al programa de correo y ya. */
  const abrirUrl = (url) => {
    if (url.startsWith("mailto:")) {
      const a = document.createElement("a");
      a.href = url;
      document.body.appendChild(a); a.click(); a.remove();
      return true;
    }
    return Boolean(window.open(url, "_blank", "noopener,noreferrer"));
  };

  const abrirSiguiente = () => {
    const r = pending[0];
    if (!r) return;
    setErr("");
    const url = !esCorreo
      ? waLink(r.props.phone, cuerpoDe(r), cc)
      : modo === "mailto"
        ? mailtoLink({ to: destOf(r), subject: asuntoDe(r), body: cuerpoDe(r) })
        : gmailComposeLink({ to: destOf(r), subject: asuntoDe(r), body: cuerpoDe(r) });
    if (!abrirUrl(url)) {
      setErr("El navegador bloqueó la ventana. Permite las ventanas emergentes para este sitio y vuelve a intentar.");
      return;
    }
    marcar(r);
  };

  /* Envío real por la API de Gmail, uno tras otro. Si uno falla se detiene ahí
     y se dice cuántos alcanzaron a salir: seguir a ciegas dejaría el historial
     mintiendo sobre lo que pasó. */
  const enviarTodo = async () => {
    const cola = pending;
    setErr(""); setBusy(true);
    let ok = 0;
    for (const r of cola) {
      try {
        const { trk, html: cuerpoHtml } = await prepararEnvio(r);
        await sendGmail({ to: destOf(r), subject: asuntoDe(r), body: cuerpoDe(r), html: cuerpoHtml, clientId: integ.email.clientId });
        marcar(r, trk);
        ok++;
      } catch (e) {
        setErr(`Se enviaron ${ok} de ${cola.length}. Se detuvo en ${titleOf(kind, r)}: ${(e && e.message) || e}`);
        break;
      }
    }
    setBusy(false);
  };

  const conectarAqui = async () => {
    setErr(""); setBusy(true);
    try { await connectGmail(integ.email.clientId); }
    catch (e) { setErr((e && e.message) || String(e)); }
    setBusy(false);
  };

  const copyAll = async () => {
    const texto = recipients.map((r) => {
      const dest = destOf(r) || (esCorreo ? "sin correo" : "sin teléfono");
      const asunto = esCorreo ? `\nAsunto: ${asuntoDe(r)}` : "";
      return `${titleOf(kind, r)} · ${dest}${asunto}\n${cuerpoDe(r)}`;
    }).join("\n\n———\n\n");
    try {
      await navigator.clipboard.writeText(texto);
      setCopied(`Copiado · ${recipients.length}`);
    } catch (e) {
      setCopied("No se pudo copiar");
    }
    setTimeout(() => setCopied(""), 2000);
  };

  /* Copia el diseño ya renderizado, no su código: pegado en un borrador de
     Gmail entra con formato. Si el navegador no admite el portapapeles rico,
     se copia el código para pegarlo a mano. */
  const copiarDiseno = async () => {
    const r = first;
    if (!r) return;
    const doc = htmlDe(r);
    try {
      if (typeof ClipboardItem === "function" && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({
          "text/html": new Blob([doc], { type: "text/html" }),
          "text/plain": new Blob([cuerpoDe(r)], { type: "text/plain" }),
        })]);
        setCopiedHtml("Diseño copiado");
      } else {
        await navigator.clipboard.writeText(doc);
        setCopiedHtml("Código copiado");
      }
    } catch (e) {
      setCopiedHtml("No se pudo copiar");
    }
    setTimeout(() => setCopiedHtml(""), 2200);
  };

  const sinTexto = (!body.trim() && !conHtml) || recipients.length === 0;
  const terminado = sendable.length > 0 && pending.length === 0;

  const comoSale = !esCorreo
    ? "Se abre WhatsApp con el mensaje escrito; tú das el último clic."
    : porApi
      ? (gmail.connected
          ? `El CRM envía desde ${gmail.account || "tu cuenta de Gmail"}${conHtml ? ", con el diseño HTML" : ""}.` +
            (mideEsto ? ` Se medirá ${[medicion.aperturas && "la apertura", medicion.clics && "los clics"].filter(Boolean).join(" y ")}.` : "")
          : "Falta autorizar la cuenta de Gmail.")
      : modo === "mailto"
        ? "Se abre tu programa de correo con el borrador listo."
        : "Se abre Gmail con el borrador listo; tú das el último clic.";

  const principal = () => {
    if (porApi && !gmail.connected) {
      return <Btn variant="solid" Icon={ShieldCheck} disabled={busy || !integ.email.clientId} onClick={conectarAqui}>{busy ? "Autorizando…" : "Conectar Gmail"}</Btn>;
    }
    if (porApi) {
      return <Btn variant="solid" Icon={Send} disabled={sinTexto || busy || !pending.length}
        onClick={enviarTodo}>{busy ? "Enviando…" : `Enviar ${pending.length} por Gmail`}</Btn>;
    }
    return <Btn variant="solid" Icon={ExternalLink} disabled={sinTexto || !pending.length} onClick={abrirSiguiente}>
      {esCorreo ? "Abrir borrador" : "Abrir WhatsApp"} · {pending.length} sin enviar
    </Btn>;
  };

  return (
    <Modal wide title={esCorreo ? "Enviar correo" : "Enviar por WhatsApp"}
      subtitle={`${recipients.length} de ${candidatos.length} destinatario(s) · ${comoSale}`} onClose={onClose}
      footer={<><Btn variant="outline" onClick={onClose}>{done.size ? "Cerrar" : "Cancelar"}</Btn>
        <Btn variant="outline" Icon={Copy} disabled={sinTexto} onClick={copyAll}>{copied || "Copiar textos"}</Btn>
        <Btn variant="outline" Icon={Check} disabled={sinTexto}
          onClick={() => onSend({ subject: t ? `Plantilla: ${t.name}` : esCorreo ? subject || "Correo de marketing" : "Mensaje de WhatsApp", body: body.trim() || (conHtml ? htmlToText(html) : body), ids: recipients.map((r) => r.id) })}>
          Registrar sin enviar</Btn>
        {principal()}</>}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field def={{ label: "Plantilla", type: "select", options: templates.map((x) => x.name) }}
            value={t?.name || ""} onChange={(name) => setTid((templates.find((x) => x.name === name) || {}).id || "")} />
          {esCorreo && <Field def={{ label: "Asunto", type: "text" }} value={subject} onChange={setSubject} />}
          <Field def={{ label: conHtml ? "Mensaje en texto (respaldo del diseño)" : "Mensaje", type: "textarea" }} value={body} onChange={setBody} />
          <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, color: C.faint }}>Variables: {"{{nombre}}"}, {"{{apellido}}"}, {"{{institucion}}"}, {"{{empresa}}"}</div>

          {esCorreo && <HtmlAttach value={html} onChange={setHtml} />}

          {conHtml && !porApi && (
            <div style={{ background: C.amberSoft, borderRadius: 6, padding: "9px 11px", fontFamily: "var(--ui)", fontSize: 12, color: C.amber, lineHeight: 1.55 }}>
              El diseño no cabe en un enlace: el borrador que se abre sale sólo con el texto. Copia el diseño y pégalo
              en el borrador, o cambia a <b>“Gmail conectado”</b> en Conexiones para que el CRM lo mande con formato.
              <div style={{ marginTop: 8 }}>
                <Btn size="sm" variant="outline" Icon={Copy} disabled={!first} onClick={copiarDiseno}>{copiedHtml || "Copiar diseño"}</Btn>
              </div>
            </div>
          )}

          {porApi && !gmail.connected && (
            <div style={{ background: C.amberSoft, borderRadius: 6, padding: "9px 11px", fontFamily: "var(--ui)", fontSize: 12, color: C.amber, lineHeight: 1.55 }}>
              {integ.email.clientId
                ? "La cuenta de Gmail no está autorizada en esta pestaña. Conéctala aquí abajo y el envío sale solo."
                : "Falta el ID de cliente de Google. Ve a Conexiones para configurarlo, o usa “Registrar sin enviar”."}
            </div>
          )}

          {missingChannel > 0 && (
            <div style={{ background: C.claySoft, borderRadius: 6, padding: "8px 10px", fontFamily: "var(--ui)", fontSize: 12, color: C.clay }}>
              {missingChannel} destinatario(s) no tienen {esCorreo ? "correo" : "teléfono"}. Se omiten del envío; compléta{missingChannel === 1 ? "lo" : "los"} para poder contactarlos.
            </div>
          )}

          {err && (
            <div style={{ background: C.claySoft, borderRadius: 6, padding: "9px 11px", fontFamily: "var(--ui)", fontSize: 12, color: C.clay, lineHeight: 1.55 }}>{err}</div>
          )}

          {terminado && !err && (
            <div style={{ background: C.jadeSoft, borderRadius: 6, padding: "9px 11px", fontFamily: "var(--ui)", fontSize: 12, color: C.jade, lineHeight: 1.55 }}>
              Listo: {done.size} {porApi ? "enviado(s)" : "abierto(s)"} y registrado(s) en el historial.
            </div>
          )}
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, fontWeight: 600, color: C.mute, flex: 1, minWidth: 0 }}>VISTA PREVIA · {first ? titleOf(kind, first) : "sin destinatario"}</div>
            {conHtml && [["diseno", "Diseño"], ["texto", "Texto"]].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setVista(k)} className="crm-btn"
                style={{ border: `1px solid ${vista === k ? C.blue : C.line}`, background: vista === k ? C.blueSoft : C.panel, color: vista === k ? C.blue : C.mute, borderRadius: 999, padding: "3px 11px", fontFamily: "var(--ui)", fontSize: 11.5, cursor: "pointer" }}>{l}</button>
            ))}
          </div>
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 9, overflow: "hidden" }}>
            <div style={{ background: ch.soft, padding: "9px 12px", display: "flex", alignItems: "center", gap: 8 }}>
              <ch.Icon size={14} color={ch.color} />
              <span style={{ fontFamily: "var(--ui)", fontSize: 12.5, fontWeight: 600, color: ch.color }}>{ch.label}</span>
            </div>
            <div style={{ padding: 14, background: !esCorreo ? "#F4F7F2" : C.panel, minHeight: 170 }}>
              {esCorreo && <div style={{ fontFamily: "var(--ui)", fontSize: 13, fontWeight: 600, marginBottom: 8, paddingBottom: 8, borderBottom: `1px solid ${C.line}` }}>{first ? asuntoDe(first) : subject}</div>}
              {conHtml && vista === "diseno" ? (
                <HtmlPreview html={first ? htmlDe(first) : html} height={260} />
              ) : (
                <div style={{ fontFamily: "var(--ui)", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", background: !esCorreo ? "#DCF8C6" : "transparent", padding: !esCorreo ? "10px 12px" : 0, borderRadius: !esCorreo ? 9 : 0 }}>
                  {first ? cuerpoDe(first) : body}
                </div>
              )}
            </div>
          </div>
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, fontWeight: 600, color: C.mute }}>
              DESTINATARIOS · {recipients.length} de {candidatos.length}
            </div>
            <div style={{ display: "flex", gap: 2 }}>
              <Btn size="sm" onClick={() => setChosen(new Set(candidatos.map((r) => r.id)))}>Todos</Btn>
              <Btn size="sm" onClick={() => setChosen(new Set(conDato.map((r) => r.id)))}>{esCorreo ? "Con correo" : "Con teléfono"}</Btn>
              <Btn size="sm" onClick={() => setChosen(new Set())}>Ninguno</Btn>
            </div>
          </div>
          {candidatos.length > 8 && (
            <input className="crm-in" placeholder="Filtrar por nombre o dato…" value={buscar} onChange={(e) => setBuscar(e.target.value)}
              style={{ ...inputStyle, marginTop: 6, padding: "6px 9px", fontSize: 12 }} />
          )}
          <div style={{ marginTop: 6, maxHeight: 186, overflowY: "auto", border: `1px solid ${C.line}`, borderRadius: 8 }}>
            {listados.map((r) => {
              const dest = destOf(r);
              const ya = done.has(r.id);
              return (
                <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--ui)", fontSize: 12, color: ya ? C.jade : C.mute, padding: "5px 9px", cursor: "pointer", borderBottom: `1px solid ${C.canvas}` }}>
                  <input type="checkbox" checked={chosen.has(r.id)} onChange={() => toggle(r.id)} style={{ accentColor: C.jade, flexShrink: 0 }} />
                  <span style={{ overflowWrap: "anywhere", flex: 1 }}>
                    {titleOf(kind, r)} · <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: dest ? "inherit" : C.clay }}>
                      {esCorreo ? dest || "sin correo" : dest ? `+${dest}` : "sin teléfono"}
                    </span>
                  </span>
                  {ya && <Check size={12} strokeWidth={3} style={{ flexShrink: 0 }} />}
                </label>
              );
            })}
            {listados.length === 0 && (
              <div style={{ padding: "10px 9px", fontFamily: "var(--ui)", fontSize: 12, color: C.faint }}>
                {candidatos.length ? "Nadie coincide con el filtro." : "No hay registros para enviar."}
              </div>
            )}
          </div>
          {visibles.length > listados.length && (
            <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, color: C.faint, marginTop: 5 }}>
              y {visibles.length - listados.length} más… usa el filtro para llegar a alguien puntual, o los botones de arriba para marcarlos todos.
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ────────────────────────────────────────────────────────────
   Detalle de registro
   ──────────────────────────────────────────────────────────── */
function RecordDetail({ db, detail, onClose, setModal, onLog, onEdit }) {
  const { kind, id } = detail;
  const coll = kind === "contact" ? db.contacts : kind === "company" ? db.companies : db.deals;
  const rec = coll.find((r) => r.id === id);
  const [note, setNote] = useState("");
  if (!rec) return null;

  const schema = db.schema[kind];
  const acts = db.activities.filter((a) => (a.contactIds || []).includes(id) || (a.companyIds || []).includes(id) || a.dealId === id);
  const relatedDeals = kind === "deal" ? [] : db.deals.filter((d) => (d.contactIds || []).includes(id) || d.companyId === id);

  const link = kind === "contact" ? { contactIds: [id] } : kind === "company" ? { companyIds: [id] } : { dealId: id };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(19,28,26,.35)", zIndex: 50, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(520px,100%)", background: C.canvas, height: "100%", overflowY: "auto", borderLeft: `1px solid ${C.line}` }}>
        <div style={{ padding: "20px 22px", background: C.panel, borderBottom: `1px solid ${C.line}`, position: "sticky", top: 0, zIndex: 2 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: C.faint, textTransform: "uppercase", letterSpacing: ".1em" }}>{OBJ[kind].singular}</div>
              <div style={{ fontFamily: "var(--display)", fontSize: 21, fontWeight: 600, letterSpacing: "-.02em", marginTop: 2 }}>{titleOf(kind, rec)}</div>
            </div>
            <button onClick={onClose} className="crm-btn" style={{ border: "none", background: "none", cursor: "pointer", color: C.faint }}><X size={18} /></button>
          </div>
          <div style={{ display: "flex", gap: 7, marginTop: 14, flexWrap: "wrap" }}>
            {kind !== "deal" && <>
              <Btn size="sm" variant="outline" Icon={MessageSquare} onClick={() => setModal({ kind: "send", channel: "whatsapp", objKind: kind, ids: [id] })}>WhatsApp</Btn>
              <Btn size="sm" variant="outline" Icon={Mail} onClick={() => setModal({ kind: "send", channel: "email", objKind: kind, ids: [id] })}>Correo</Btn>
              <Btn size="sm" variant="outline" Icon={Phone} onClick={() => onLog({ type: "call", subject: "Llamada registrada", ...link })}>Registrar llamada</Btn>
              <Btn size="sm" variant="outline" Icon={Briefcase} onClick={() => setModal({ kind: "deal", presets: { stage: "Nuevo", source: rec.props.leadSource || "Manual", name: `Negocio · ${titleOf(kind, rec)}` }, contactIds: kind === "contact" ? [id] : [], companyId: kind === "company" ? id : undefined })}>Crear negocio</Btn>
            </>}
            <Btn size="sm" variant="solid" onClick={onEdit}>Editar</Btn>
          </div>
        </div>

        <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 9, padding: 16 }}>
            <div style={{ fontFamily: "var(--display)", fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Propiedades</div>
            {schema.map((f) => (
              <div key={f.key} style={{ display: "flex", gap: 10, padding: "6px 0", borderBottom: "1px solid #F2F4F0" }}>
                <div style={{ width: 150, flexShrink: 0, fontFamily: "var(--ui)", fontSize: 12, color: C.mute }}>{f.label}</div>
                <div style={{ fontFamily: "var(--ui)", fontSize: 12.5, minWidth: 0, overflowWrap: "anywhere" }}><CellValue f={f} v={rec.props[f.key]} /></div>
              </div>
            ))}
          </div>

          {relatedDeals.length > 0 && (
            <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 9, padding: 16 }}>
              <div style={{ fontFamily: "var(--display)", fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Negocios asociados</div>
              {relatedDeals.map((d) => (
                <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", gap: 8 }}>
                  <span style={{ fontFamily: "var(--ui)", fontSize: 12.5 }}>{d.props.name}</span>
                  <Pill color={stageColor(norm(d.props.stage))} soft="#F1F3EE">{d.props.stage}</Pill>
                </div>
              ))}
            </div>
          )}

          <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 9, padding: 16 }}>
            <div style={{ fontFamily: "var(--display)", fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Historial</div>
            <div style={{ display: "flex", gap: 7, marginBottom: 12 }}>
              <input className="crm-in" placeholder="Escribe una nota…" value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} />
              <Btn variant="outline" disabled={!note.trim()} onClick={() => { onLog({ type: "note", subject: note.trim(), ...link }); setNote(""); }}>Guardar</Btn>
            </div>
            {acts.length === 0 && <div style={{ fontFamily: "var(--ui)", fontSize: 12.5, color: C.faint }}>Sin actividad todavía. Empieza con un WhatsApp o una llamada.</div>}
            {acts.map((a) => {
              const ch = CHANNEL[a.type];
              return (
                <div key={a.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderTop: "1px solid #F2F4F0" }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: ch.soft, display: "grid", placeItems: "center", flexShrink: 0 }}><ch.Icon size={12} color={ch.color} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                      {a.dir === "in" && <ArrowDownLeft size={11} color={C.clay} style={{ flexShrink: 0 }} />}
                      <span style={{ fontFamily: "var(--ui)", fontSize: 12.5, fontWeight: 500 }}>{a.subject}</span>
                      <EstadoEnvio a={a} />
                    </div>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: C.faint, marginTop: 2 }}><Clock size={9} style={{ display: "inline", marginRight: 4 }} />{fmt(a.at)}</div>
                    <DetalleEnvio a={a} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
