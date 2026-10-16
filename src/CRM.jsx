import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  LayoutDashboard, Users, Building2, Briefcase, Activity, MessageSquare, Mail,
  Phone, Settings, Plus, Upload, Search, X, Check, ChevronDown, Trash2, Copy,
  FileText, Clock, Eye, Download, Plug, Send, ExternalLink, ShieldCheck, LogOut,
  Code2, Paperclip, Inbox, RefreshCw, CornerDownLeft, ArrowDownLeft, User,
  MailOpen, MousePointerClick, MailX, Gauge, Pencil,
  Zap, Sparkles, Play, Pause, ListChecks, AlertTriangle, History, BellRing, Braces,
  Megaphone, UserPlus, ArrowUp, ArrowDown, RotateCcw, ChevronRight, ArrowLeft, Reply, MailCheck, ListFilter,
  Trophy, Bot, Headset, Palette, Newspaper, Lightbulb, ImagePlus, Save, Instagram
} from "lucide-react";
import {
  EMAIL_MODES, WHATSAPP_MODES, normalizeIntegrations, toE164, waLink,
  gmailComposeLink, mailtoLink, gmailStatus, onGmailChange, connectGmail,
  disconnectGmail, sendGmail, withSignature, withSignatureHtml, htmlToText, escapeHtml,
  aligerarHtml, analizarHtml, desempaquetarHtml,
  traerCorreos, traerRebotes,
} from "./integrations.js";
import {
  midiendo, nuevoTrk, marcarHtml, textoAHtml, traerEventos, estadoDe,
  puedeDarBaja, enlaceBaja, pieBajaTexto, pieBajaHtml,
} from "./tracking.js";
import {
  traerLeads, traerCampanas, enviarWhatsApp, probarPuente, traerPlantillasWa, crearPlantillaWa, subirImagenWa, publicarInstagram, traerWhatsApp,
  leadAProps, leadATexto, leadAAsunto, nombrePlataforma, partirNombre,
} from "./anuncios.js";
import {
  EVENTOS, ACCIONES, OPERADORES, EJEMPLOS, eventoDe, accionDe, esSaliente, necesitaMano,
  camposDe, campoDe, etiquetaCampo, etapasDe, automatizacionVacia, normalizaAutomatizacion,
  normalizeAutomations, normalizeCola, normalizeLog, aDsl, deDsl, compilarVibe, resumenDe,
  textoAccion, avisosDe, cumple, disparar, barrerFrios, podarMarcas, esperaEnTexto,
  coleccionDe, buscarFicha,
} from "./automations.js";
import { ANOS, GRUPOS, DIVISIONES, analizarRoster } from "./drafts.js";
import {
  ETAPAS_AGENTE, HUMANO, agenteVacio, normalizaAgente, normalizeAgentes, normalizeAgentesChat, agentesDeBase,
} from "./agentes.js";

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
const MAIL_STATUS = ["Entregado", "Rebote temporal", "Rebotado", "Dado de baja"];
/* Un rebote definitivo no lo borra una apertura vieja que llegue tarde: el
   estado sólo sube de rango, nunca baja solo. La baja es lo más alto: la pidió
   la persona, y ninguna apertura posterior la deshace. */
const RANGO_MAIL = { "": 0, Entregado: 1, "Rebote temporal": 2, Rebotado: 3, "Dado de baja": 4 };
const peorEstado = (a, b) => ((RANGO_MAIL[b] || 0) > (RANGO_MAIL[a] || 0) ? b : a || "");
/* A quién no se le vuelve a escribir. Mandar a una dirección que ya rebotó, o a
   alguien que pidió la baja, es lo que más rápido hunde la reputación de una
   cuenta de correo. */
const noSeEscribe = (r) => {
  const e = (r && r.props && r.props.emailStatus) || "";
  return e === "Rebotado" || e === "Dado de baja";
};
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

/* ── Plantillas de WhatsApp aprobadas en Meta ──
   Una plantilla del CRM puede ir enlazada a una que Meta ya aprobó. Por la
   API eso es lo único que deja escribirle a alguien que no te ha escrito en
   las últimas 24 horas, y Meta exige que salga tal cual la aprobó: lo único
   que cambia de una persona a otra son sus variables. Por eso el enlace
   guarda, por cada variable, qué dato del CRM va ahí ({{nombre}},
   {{institucion}}…), y el texto de la plantilla no se edita desde aquí. */
const metaWa = (m) => (m && typeof m === "object" && m.nombre ? {
  nombre: String(m.nombre),
  idioma: String(m.idioma || "es"),
  formato: m.formato === "nombrado" ? "nombrado" : "posicional",
  cuerpo: String(m.cuerpo || ""),
  vars: (Array.isArray(m.vars) ? m.vars : []).map((v) => ({ clave: String((v && v.clave) || ""), valor: String((v && v.valor) || "") })),
  /* Cómo se ve en WhatsApp. `imagen` es la que sale en cada envío cuando el
     encabezado es una imagen: Meta la pide cada vez. */
  cabecera: String(m.cabecera || ""),
  encabezado: String(m.encabezado || ""),
  pie: String(m.pie || ""),
  botones: botonesWa(m.botones),
  imagen: String(m.imagen || ""),
} : null);

/* ── Plantillas creadas desde el CRM y mandadas a revisión ──
   La revisión es de Meta y tarda lo que tarde; aquí se guarda con qué nombre
   se mandó y en qué va, para preguntar por ella hasta que la decidan. `nueva`
   marca una decisión que todavía no viste: aprobada o rechazada, se avisa una
   vez y el envío lo das tú. */
const botonesWa = (b) => (Array.isArray(b) ? b : []).map((x) => ({
  tipo: x && x.tipo === "URL" ? "URL" : "RESPUESTA",
  texto: String((x && x.texto) || ""),
  url: String((x && x.url) || ""),
}));

const revisionWa = (r) => (r && typeof r === "object" && r.nombre ? {
  id: String(r.id || ""),
  nombre: String(r.nombre),
  idioma: String(r.idioma || "es"),
  categoria: r.categoria === "UTILITY" ? "UTILITY" : "MARKETING",
  estado: String(r.estado || "PENDING"),
  rechazo: String(r.rechazo || ""),
  enviadaEn: String(r.enviadaEn || ""),
  imagen: String(r.imagen || ""),
  nueva: Boolean(r.nueva),
} : null);

const revisionAbierta = (r) => Boolean(r) && r.estado !== "APPROVED" && r.estado !== "REJECTED";

/* Las variables que el CRM sabe llenar —las de applyTemplate—. Una plantilla
   que pida otra cosa saldría con el {{hueco}} a la vista, así que no se manda. */
const VARS_META = ["nombre", "apellido", "institucion", "empresa", "correo", "telefono"];

/* Meta pide un ejemplo por variable para revisarla. Van inventados a
   propósito: lo que se le manda a revisión no tiene por qué llevar datos de
   personas reales. */
const EJEMPLOS_META = {
  nombre: "Ana", apellido: "Gómez", institucion: "Club Deportivo Los Andes",
  empresa: "Club Deportivo Los Andes", correo: "ana@ejemplo.com", telefono: "3001234567",
};

const nombreParaMeta = (txt) => String(txt || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);

/* Lo que Meta rechazaría de entrada, dicho antes de mandarlo. Las reglas de
   contenido (qué se considera engañoso, la categoría) las decide su revisión. */
const problemasParaMeta = ({ nombreMeta, cuerpo, encabezado, pie, botones = [] }) => {
  const out = [];
  const txt = String(cuerpo || "").trim();
  if (!/^[a-z0-9_]{1,512}$/.test(nombreMeta || "")) out.push("El nombre para Meta sólo admite minúsculas, números y guion bajo.");
  if (!txt) out.push("Escribe el mensaje.");
  if (txt.length > 1024) out.push(`El mensaje tiene ${txt.length} caracteres; Meta acepta hasta 1.024.`);
  const vars = [...txt.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)].map((m) => m[1]);
  const raras = [...new Set(vars.filter((k) => !VARS_META.includes(k)))];
  if (raras.length) out.push(`El CRM no sabe qué poner en ${raras.map((k) => `{{${k}}}`).join(", ")}. Usa ${VARS_META.slice(0, 4).map((k) => `{{${k}}}`).join(", ")}.`);
  if (/^\{\{/.test(txt) || /\}\}$/.test(txt)) out.push("Meta no deja que el mensaje empiece o termine con una variable.");
  if (/\}\}\s*\{\{/.test(txt)) out.push("Meta no deja dos variables seguidas.");
  if (encabezado && (encabezado.length > 60 || /\{\{|\n/.test(encabezado))) out.push("El encabezado va en una línea, sin variables y con 60 caracteres como mucho.");
  if (pie && (pie.length > 60 || /\{\{|\n/.test(pie))) out.push("El pie va en una línea, sin variables y con 60 caracteres como mucho.");
  const llenos = botones.filter((b) => b.texto.trim() || b.url.trim());
  if (llenos.filter((b) => b.tipo === "URL").length > 2) out.push("Meta acepta como mucho dos botones con enlace.");
  llenos.forEach((b, i) => {
    if (!b.texto.trim()) out.push(`Al botón ${i + 1} le falta el texto.`);
    else if (b.texto.trim().length > 25) out.push(`El botón «${b.texto.trim()}» pasa de 25 caracteres.`);
    if (b.tipo === "URL" && !/^https:\/\/\S+$/.test(b.url.trim())) out.push(`El botón «${b.texto.trim() || i + 1}» necesita un enlace que empiece por https://.`);
  });
  return out;
};

/* Pasa lo que contestó Meta a las plantillas del CRM. Una aprobada queda
   enlazada con cada variable apuntando al dato del mismo nombre, que es como
   se escribió; lista para enviar sin tocar nada. Devuelve qué avisar. */
const aplicarRevisiones = (d, lista) => {
  const avisos = [];
  const whatsapp = d.templates.whatsapp.map((t) => {
    const rv = t.revision;
    if (!revisionAbierta(rv)) return t;
    const p = lista.find((x) => (rv.id && x.id === rv.id) || (x.nombre === rv.nombre && x.idioma === rv.idioma));
    if (!p || p.estado === rv.estado) return t;
    if (p.estado === "APPROVED") {
      avisos.push(`Meta aprobó «${t.name}». Ya la puedes enviar desde Plantillas.`);
      return {
        ...t,
        body: p.cuerpo,
        meta: metaWa({
          nombre: p.nombre, idioma: p.idioma, formato: p.formato, cuerpo: p.cuerpo,
          vars: p.vars.map((k) => ({ clave: k, valor: VARS_META.includes(k) ? `{{${k}}}` : "" })),
          cabecera: p.cabecera, encabezado: p.encabezado, pie: p.pie, botones: p.botones, imagen: rv.imagen,
        }),
        revision: { ...rv, estado: "APPROVED", nueva: true },
      };
    }
    if (p.estado === "REJECTED") {
      avisos.push(`Meta rechazó «${t.name}». Mira el motivo en Plantillas.`);
      return { ...t, revision: { ...rv, estado: "REJECTED", rechazo: p.rechazo || "", nueva: true } };
    }
    return { ...t, revision: { ...rv, estado: p.estado } };
  });
  return { d: avisos.length || whatsapp.some((t, i) => t !== d.templates.whatsapp[i]) ? { ...d, templates: { ...d.templates, whatsapp } } : d, avisos };
};

/* Por qué la rechazó, en palabras. Meta contesta con una clave en inglés. */
const MOTIVO_RECHAZO = {
  ABUSIVE_CONTENT: "contenido que Meta considera abusivo",
  INCORRECT_CATEGORY: "la categoría no corresponde al contenido",
  INVALID_FORMAT: "formato inválido (variables, longitud o caracteres)",
  SCAM: "Meta lo consideró posible fraude",
  PROMOTIONAL: "es promocional y se mandó como utilidad",
  TAG_CONTENT_MISMATCH: "el contenido no coincide con la categoría",
};

/* Lo que se le pide a Meta para una ficha: cada variable con su valor, y el
   texto ya armado para el historial. Meta rechaza una variable vacía o con
   saltos de línea, así que eso se ataja aquí con un mensaje que se entienda. */
const plantillaWaPara = (meta, rec, kind) => {
  const valores = meta.vars.map((v) => applyTemplate(v.valor, rec, kind).replace(/\s+/g, " ").trim());
  const vacia = meta.vars.findIndex((_, i) => !valores[i]);
  if (vacia >= 0) {
    return { err: `La variable {{${meta.vars[vacia].clave}}} de «${meta.nombre}» queda vacía para ${titleOf(kind, rec)} (${meta.vars[vacia].valor || "sin dato"}).` };
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
  buzon: { correoAl: "", rebotesAl: "", eventosAl: "", leadsAl: "", whatsappAl: "", vistoEn: {} },
  /* Automatizaciones: las reglas, lo que quedó esperando la hora o el visto
     bueno, el rastro de lo que hicieron y a qué fichas frías ya se les avisó. */
  automations: [],
  autoCola: [],
  autoLog: [],
  autoMarcas: {},
  /* Propiedades borradas: salen del esquema al instante pero sus datos se
     guardan PAPELERA_DIAS días por si fue un error. */
  papelera: { contact: [], company: [], deal: [] },
  /* Vistas: cómo se mira una tabla (búsqueda, filtros, columnas, orden).
     Listas: a quién se le escribe. Una lista activa guarda condiciones y sus
     miembros cambian solos; una fija guarda personas concretas. */
  vistas: [],
  listas: [],
  /* Drafts: cada roster analizado con sus jugadores (ver src/drafts.js). */
  drafts: [],
  /* Agentes de texto (ver src/agentes.js) y, por conversación, a quién se
     dejó fijado a mano: un agente o una persona. */
  agentes: [],
  agentesChat: {},
});

const PAPELERA_DIAS = 15;
const COLECCION = { contact: "contacts", company: "companies", deal: "deals" };

/* Vencido el plazo, la propiedad se borra de verdad: sale de la papelera y su
   valor se quita de cada registro. Antes de eso no se toca ningún dato. */
function vaciarPapelera(db, ahora = Date.now()) {
  const plazo = PAPELERA_DIAS * 864e5;
  let n = 0;
  let out = db;
  for (const k of Object.keys(COLECCION)) {
    const lista = db.papelera[k] || [];
    const vencidas = lista.filter((f) => ahora - Date.parse(f.borradaEn) >= plazo);
    if (!vencidas.length) continue;
    n += vencidas.length;
    const claves = new Set(vencidas.map((f) => f.key));
    const col = COLECCION[k];
    out = {
      ...out,
      papelera: { ...out.papelera, [k]: lista.filter((f) => !claves.has(f.key)) },
      [col]: out[col].map((r) => {
        if (!r.props || !Object.keys(r.props).some((x) => claves.has(x))) return r;
        const props = { ...r.props };
        claves.forEach((x) => { delete props[x]; });
        return { ...r, props };
      }),
    };
  }
  return { db: out, n };
}

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
  const agentes = normalizeAgentes(d.agentes);
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
      whatsapp: arr(d.templates && d.templates.whatsapp).map((t) => ({ ...t, html: "", meta: metaWa(t && t.meta), revision: revisionWa(t && t.revision) })),
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
      /* Hasta dónde se recogió lo que llegó por WhatsApp. Es la hora del
         puente en milisegundos, no una fecha de este computador. */
      whatsappAl: String((d.buzon && d.buzon.whatsappAl) || ""),
      vistoEn: (d.buzon && typeof d.buzon.vistoEn === "object" && d.buzon.vistoEn) || {},
    },
    papelera: {
      contact: arr(d.papelera && d.papelera.contact),
      company: arr(d.papelera && d.papelera.company),
      deal: arr(d.papelera && d.papelera.deal),
    },
    automations: normalizeAutomations(d.automations),
    autoCola: normalizeCola(d.autoCola),
    autoLog: normalizeLog(d.autoLog),
    autoMarcas: (d.autoMarcas && typeof d.autoMarcas === "object" && d.autoMarcas) || {},
    vistas: arr(d.vistas).filter((v) => v && v.id && v.kind),
    listas: arr(d.listas).filter((l) => l && l.id && l.kind)
      .map((l) => ({ ...l, tipo: l.tipo === "fija" ? "fija" : "activa", ids: arr(l.ids) })),
    drafts: arr(d.drafts).filter((x) => x && x.id).map((x) => ({ ...x, jugadores: arr(x.jugadores) })),
    agentes,
    agentesChat: normalizeAgentesChat(d.agentesChat, agentes),
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
      const vencidas = vaciarPapelera(next);
      next = vencidas.db;
      if (!live) return;
      dbRef.current = next;
      setDb(next);
      if (vencidas.n > 0) say(`Se borraron definitivamente ${vencidas.n} propiedad(es) que llevaban ${PAPELERA_DIAS} días en la papelera`);
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

  const addRecords = (kind, list) => {
    setDb((d) => ({ ...d, [collKey(kind)]: [...list, ...d[collKey(kind)]] }));
    const tipo = kind === "contact" ? "contacto.creado" : kind === "company" ? "empresa.creada" : "negocio.creado";
    list.forEach((r) => emitir({ tipo, kind, recId: r.id, rec: r }));
  };
  /* Una propiedad que cambia puede ser dos noticias a la vez: que cambió una
     propiedad y, si era la etapa de un negocio, que el negocio se movió. Se
     avisan las dos, porque una regla puede estar escrita de cualquiera de las
     dos maneras. El estado anterior se lee antes de escribir: sin eso, guardar
     la misma etapa dos veces dispararía el mismo aviso dos veces. */
  const updateRecord = (kind, id, props) => {
    const antes = buscarFicha(dbRef.current || {}, kind, id);
    setDb((d) => ({
      ...d, [collKey(kind)]: d[collKey(kind)].map((r) => (r.id === id ? { ...r, props: { ...r.props, ...props } } : r)),
    }));
    if (!antes) return;
    const rec = { ...antes, props: { ...antes.props, ...props } };
    const campos = Object.keys(props).filter((k) => String(antes.props[k] == null ? "" : antes.props[k]) !== String(props[k] == null ? "" : props[k]));
    if (!campos.length) return;
    emitir({ tipo: "propiedad.cambiada", kind, recId: id, rec, campos });
    if (kind === "deal" && campos.includes("stage")) emitir({ tipo: "negocio.etapa", kind, recId: id, rec, etapa: props.stage });
  };
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

  const logActivity = (act) => {
    registrarActividad(act);
    emitirActividad({ ...act, at: act.at || nowISO() });
  };

  const registrarActividad = (act) => setDb((d) => {
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
    const vistos = clavesExternas(actuales);
    const conId = list
      .filter((a) => a.ext && !vistos.has(a.ext))
      .map((a) => ({ id: uid(), ...a }));
    if (!conId.length) return 0;

    setDb((d) => {
      /* Se vuelve a filtrar contra el estado real por si entró algo entre
         medias —otra pestaña, dos sincronizaciones seguidas—. */
      const yaEstan = clavesExternas(d.activities);
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
    /* Un barrido puede traer cien correos viejos de golpe. Sólo se avisa de los
       que entraron —los que salieron ya se anotaron cuando salieron— y de los
       que llegaron hoy: una regla de "cuando me contesten" no debe despertar
       por una respuesta de hace tres meses que el CRM apenas está leyendo. */
    const frescos = Date.now() - 36 * 3600 * 1000;
    conId.forEach((a) => { if (a.dir === "in" && Date.parse(a.at) >= frescos) emitirActividad(a); });
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

  /* ── Lo que te escribieron por WhatsApp ──
     Cada mensaje se pega a la ficha con ese teléfono, buscada entre contactos
     y empresas con el número ya normalizado. Si nadie lo tiene, se crea un
     contacto: alguien que te escribe a tu número de empresa es un lead, y un
     mensaje sin ficha no aparecería en ningún hilo. El identificador de Meta
     viaja en `ext`, y con eso importActivities descarta lo que ya entró. */
  const importarWhatsApp = (mensajes) => {
    const actual = dbRef.current || db;
    const vistos = new Set((actual.activities || []).map((a) => a.ext).filter(Boolean));
    const entran = (mensajes || []).filter((m) => m && m.ext && m.de && !vistos.has(m.ext));
    if (!entran.length) return { mensajes: 0, fichas: 0 };

    const cc = actual.integrations.whatsapp.countryCode;
    const porTel = new Map();
    for (const kind of ["contact", "company"]) {
      (actual[collKey(kind)] || []).forEach((r) => {
        const t = toE164(r.props.phone, cc);
        if (t && !porTel.has(t)) porTel.set(t, { kind, id: r.id });
      });
    }

    const fichas = [], acts = [];
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
        ext: m.ext, type: "whatsapp", dir: "in", at: m.at,
        subject: "Mensaje de WhatsApp", body: m.texto || "",
        contactIds: f.kind === "contact" ? [f.id] : [],
        companyIds: f.kind === "company" ? [f.id] : [],
      });
    }
    if (fichas.length) {
      /* Por addRecords, para que despierte "entra un contacto nuevo". Y se
         adelanta al cuaderno en memoria: el mensaje que entra justo después
         dispara "contestan un mensaje", y esa regla busca la ficha ahí antes
         de que React haya terminado de guardarla. */
      addRecords("contact", fichas);
      const base = dbRef.current || db;
      dbRef.current = { ...base, contacts: [...fichas, ...(base.contacts || [])] };
    }
    return { mensajes: importActivities(acts), fichas: fichas.length };
  };

  /* ── Lo que anotó el medidor ──
     Los eventos llegan sueltos —"el envío ab12ef abrió a tal hora"— y aquí se
     pegan a la actividad que los espera. El identificador es lo único que los
     une: el medidor nunca supo de quién era ese correo, y ésa es justamente la
     idea. Un evento cuyo envío ya no exista en el cuaderno se descarta sin
     ruido; su actividad pudo borrarse hace meses. */
  const aplicarEventos = (eventos) => {
    const bajas = aplicarBajas(eventos);
    const porTrk = new Map();
    for (const e of eventos || []) {
      if (!e || !e.trk || !e.at) continue;
      if (!porTrk.has(e.trk)) porTrk.set(e.trk, []);
      porTrk.get(e.trk).push(e);
    }
    if (!porTrk.size) return bajas;

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
    if (!cambios.size) return bajas;

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
    /* Una apertura por ficha y por pasada: un correo reenviado dentro de un
       club puede sumar veinte aperturas del mismo envío, y eso es una noticia,
       no veinte. */
    const avisados = new Set();
    for (const a of actuales) {
      const evs = a.trk && porTrk.get(a.trk);
      if (!evs || !cambios.has(a.id)) continue;
      const tipos = new Set(evs.map((e) => (e.tipo === "clic" ? "correo.clic" : "correo.abierto")));
      for (const id of [...(a.contactIds || []), ...(a.companyIds || [])]) {
        const kind = (a.contactIds || []).includes(id) ? "contact" : "company";
        const rec = buscarFicha(dbRef.current || {}, kind, id);
        if (!rec) continue;
        tipos.forEach((tipo) => {
          if (avisados.has(`${tipo}:${id}`)) return;
          avisados.add(`${tipo}:${id}`);
          emitir({ tipo, kind, recId: id, rec });
        });
      }
    }
    return cambios.size + bajas;
  };

  /* ── Los que pidieron la baja ──
     El medidor anota la ficha y nada más; aquí se la marca para que ningún
     envío masivo ni automatización le vuelva a escribir. Se recorren las dos
     colecciones porque el identificador no dice si es contacto o empresa. */
  const aplicarBajas = (eventos) => {
    const ids = new Set((eventos || []).filter((e) => e && e.tipo === "baja" && e.rid).map((e) => String(e.rid)));
    if (!ids.size) return 0;
    const actual = dbRef.current || db || {};
    const nuevas = [...(actual.contacts || []), ...(actual.companies || [])]
      .filter((r) => ids.has(r.id) && r.props.emailStatus !== "Dado de baja").length;
    if (!nuevas) return 0;
    const sellar = (arr) => arr.map((r) => (
      ids.has(r.id) ? { ...r, props: { ...r.props, emailStatus: "Dado de baja" } } : r
    ));
    setDb((d) => ({ ...d, contacts: sellar(d.contacts), companies: sellar(d.companies) }));
    return nuevas;
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
    /* Sólo se avisa de los rebotes nuevos, por lo mismo: volver a marcar uno
       viejo es inofensivo, pero disparar una regla por él sería inventarse un
       rebote que ocurrió hace semanas. */
    const nuevos = lista.filter((r) => !yaEstaban.has(r.ext));
    const yaAvisado = new Set();
    nuevos.forEach((r) => {
      [...(r.contactIds || []), ...(r.companyIds || [])].forEach((id) => {
        if (yaAvisado.has(id)) return;
        yaAvisado.add(id);
        const kind = (r.contactIds || []).includes(id) ? "contact" : "company";
        const rec = buscarFicha(dbRef.current || {}, kind, id);
        if (rec) emitir({ tipo: "correo.rebotado", kind, recId: id, rec });
      });
    });
    return nuevos.length;
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
      const pw = t.meta ? plantillaWaPara(t.meta, rec, kindT) : null;
      if (pw && pw.err) return { ok: false, err: pw.err };
      const texto = pw ? pw.texto : cuerpo;
      const r = await mandarWhatsApp(integ, rec.props.phone, texto, pw);
      if (!r.ok) return r;
      logActivity({ type: "whatsapp", subject: asunto, body: texto, auto: p.autoId, ...enlaces });
      return { ok: true, texto: `${r.solo ? "WhatsApp enviado a" : "WhatsApp abierto para"} ${titleOf(ent, rec)}` };
    }

    if (noSeEscribe(rec)) {
      return { ok: false, err: `${titleOf(ent, rec)} está como «${rec.props.emailStatus}»: no se le vuelve a escribir por correo.` };
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
    /* Una automatización es envío masivo a cámara lenta: lleva la baja igual
       que una campaña. */
    const baja = puedeDarBaja(integ.medicion) ? await enlaceBaja(integ.medicion, p.recId) : "";
    const cuerpoEnvio = baja ? pieBajaTexto(cuerpo, baja) : cuerpo;
    if (baja) html = pieBajaHtml(html || textoAHtml(cuerpo), baja);
    /* Con el identificador de Gmail el barrido lo reconoce en Enviados y no
       lo mete dos veces. Va aparte de `ext`, que es la marca de lo traído de
       fuera: el resumen de envíos cuenta justo lo que no la tiene. */
    let gid = "";
    try {
      gid = await sendGmail({ to, subject: asunto, body: cuerpoEnvio, html, baja, clientId: integ.email.clientId });
    } catch (e) {
      return { ok: false, err: (e && e.message) || String(e) };
    }
    logActivity({ type: "email", subject: asunto, body: cuerpo, auto: p.autoId, ...(trk ? { trk } : {}), ...(gid ? { gmailId: gid } : {}), ...enlaces });
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
  /* Se espera a que el cuaderno esté cargado antes de empezar a mirar. Con el
     efecto atado al montaje el primer pase caía con `db` todavía en null y no
     hacía nada, así que un envío programado que ya venía vencido de la sesión
     anterior se quedaba media hora quieto en la pantalla —el tiempo hasta el
     siguiente latido— con la hora de salida ya pasada a la vista. */
  const datosListos = Boolean(db);
  const waPregunta = useRef(0);
  const correoPregunta = useRef(0);
  const revPregunta = useRef(0);
  useEffect(() => {
    if (!datosListos) return undefined;
    let vivo = true;
    const tic = async () => {
      const d = dbRef.current;
      if (!d || !vivo) return;
      const ahora = Date.now();

      /* 0. Lo que llegó por WhatsApp, cada minuto. Un mensaje que espera a que
            alguien pulse Actualizar es una respuesta que se enfría; y la regla
            de "cuando me contesten" tiene que despertar sola. */
      if (ahora - waPregunta.current >= 55000) {
        waPregunta.current = ahora;
        try { await recogerWhatsApp(d, importarWhatsApp, marcarBuzon); } catch (_) { /* se reintenta en el siguiente latido */ }
      }

      /* 0a. Las respuestas por correo, cada dos minutos. Antes sólo bajaban al
             pulsar "Correo", y un hilo con lo enviado y sin lo contestado se
             lee como si nadie hubiera respondido. */
      if (ahora - correoPregunta.current >= 115000) {
        correoPregunta.current = ahora;
        try { await recogerCorreo(d, importActivities, marcarBuzon); } catch (_) { /* se reintenta en el siguiente latido */ }
      }

      /* 0b. Las plantillas que esperan la revisión de Meta, cada cinco
             minutos. Meta suele decidir en minutos, pero no avisa a nadie que
             no tenga el webhook publicado: hay que ir a preguntar. */
      const pu = d.integrations.puente;
      if (pu.base && pu.clave && d.templates.whatsapp.some((t) => revisionAbierta(t.revision)) && ahora - revPregunta.current >= 290000) {
        revPregunta.current = ahora;
        try {
          const lista = (await traerPlantillasWa({ base: pu.base, clave: pu.clave })).plantillas || [];
          const avisos = aplicarRevisiones(dbRef.current, lista).avisos;
          setDb((db2) => aplicarRevisiones(db2, lista).d);
          if (avisos.length) say(avisos.join(" "));
        } catch (_) { /* se reintenta en cinco minutos */ }
      }

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
            if (necesitaMano(x.accion.tipo)) {
              quedan.push({ ...x, estado: "listo" });
              log.push(lineaLog(x, "espera", `Cumplió la espera · ${textoAccion(x.accion, n, entidadDeKind(x.kind))}`));
              continue;
            }
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

      /* 3. Los envíos de las reglas en modo automático. Un correo sólo sale
            solo con Gmail conectado, y un WhatsApp sólo por la API: por enlace
            alguien tiene que dar el último clic. */
      const solas = new Set((d.automations || []).filter((a) => a.modo === "auto").map((a) => a.id));
      const correoSolo = d.integrations.email.mode === EMAIL_MODES.gmailApi && gmailStatus().connected;
      const waSolo = d.integrations.whatsapp.modo === "api" && Boolean(d.integrations.puente.base && d.integrations.puente.clave);
      const auto = (d.autoCola || []).filter((x) => (
        x.estado === "listo" && solas.has(x.autoId) && !enviando.current.has(x.id) &&
        ((x.accion.tipo === "correo" && correoSolo) || (x.accion.tipo === "whatsapp" && waSolo))
      ));
      if (auto.length) {
        for (const x of auto.slice(0, 10)) {
          if (!vivo) break;
          await atenderPendiente(x);
        }
      }
    };
    tic();
    const h = setInterval(tic, 30000);
    return () => { vivo = false; clearInterval(h); };
  }, [datosListos]);

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
  const porAtender = (db.autoCola || []).filter((x) => x.estado === "listo").length;
  const plantillasNuevas = db.templates.whatsapp.filter((t) => t.revision && t.revision.nueva).length;

  const NAV = [
    { key: "dashboard", label: "Panel", Icon: LayoutDashboard },
    { key: "messages", label: "Mensajes", Icon: Inbox },
    { key: "contact", label: "Contactos", Icon: Users },
    { key: "company", label: "Empresas", Icon: Building2 },
    { key: "deal", label: "Negocios", Icon: Briefcase },
    { key: "drafts", label: "Drafts", Icon: Trophy },
    { key: "activities", label: "Actividades", Icon: Activity },
    { key: "templates", label: "Plantillas", Icon: MessageSquare },
    { key: "studio", label: "Estudio", Icon: Palette },
    { key: "automations", label: "Automatizaciones", Icon: Zap },
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
            const nuevos = key === "messages" ? sinLeer : key === "automations" ? porAtender : key === "templates" ? plantillasNuevas : 0;
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
            <MessagesView db={db} setDb={setDb} say={say} setDetail={setDetail} setView={setView}
              onLog={logActivity} onImport={importActivities} onBuzon={marcarBuzon} onVisto={marcarVisto}
              onEventos={aplicarEventos} onRebotes={aplicarRebotes}
              onLeerBandeja={activarLectura} onLeads={importarLeads} onWhatsApp={importarWhatsApp} />
          )}
          {(view === "contact" || view === "company") && (
            <RecordList key={view} kind={view} db={db} setDb={setDb} say={say} setModal={setModal} setDetail={setDetail} onDelete={(ids) => { deleteRecords(view, ids); say(`${ids.length} registro(s) eliminados`); }} />
          )}
          {view === "deal" && <DealsView db={db} setModal={setModal} setDetail={setDetail} onStage={(id, stage) => { updateRecord("deal", id, { stage, lastActivityAt: nowISO() }); say(`Negocio movido a ${stage}`); }} />}
          {view === "drafts" && <DraftsView db={db} setDb={setDb} say={say} />}
          {view === "activities" && (
            <ActivitiesView db={db} setModal={setModal} setDetail={setDetail} say={say}
              onImport={importActivities} onBuzon={marcarBuzon} onEventos={aplicarEventos} onRebotes={aplicarRebotes}
              onLeerBandeja={activarLectura} onLeads={importarLeads} onWhatsApp={importarWhatsApp} />
          )}
          {view === "studio" && <EstudioView db={db} setDb={setDb} say={say} onListo={() => setView("templates")} />}
          {view === "templates" && <TemplatesView db={db} setDb={setDb} say={say}
            onEnviar={(plantillaId) => setModal({ kind: "send", channel: "whatsapp", objKind: "contact", ids: db.contacts.map((c) => c.id), plantillaId })} />}
          {view === "automations" && (
            <AutomationsView db={db} setDb={setDb} say={say} setDetail={setDetail}
              onAtender={atenderPendiente} onCerrar={cerrarPendiente} />
          )}
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
        <SendModal db={db} channel={modal.channel} kind={modal.objKind} ids={modal.ids} listaId={modal.listaId} plantillaId={modal.plantillaId}
          onClose={() => setModal(null)}
          onLogOne={(id, payload) => logActivity({
            type: modal.channel, subject: payload.subject, body: payload.body,
            /* Sólo si lo hay: un campo vacío en cada actividad ocuparía sitio en
               el almacenamiento y haría creer que el envío se midió. */
            ...(payload.trk ? { trk: payload.trk } : {}),
            /* La tanda a la que pertenece y cuántos se habían marcado: con eso
               Actividades junta el envío y sabe a cuántos se le quiso escribir,
               no sólo a cuántos salió. */
            ...(payload.lote ? { lote: payload.lote, loteSel: payload.sel } : {}),
            ...(modal.objKind === "contact" ? { contactIds: [id] } : { companyIds: [id] }),
          })}
          onSend={(payload) => {
            /* Se registra sólo en los que quedaron marcados en el modal. */
            const dest = payload.ids || modal.ids;
            dest.forEach((id) => logActivity({ type: modal.channel, subject: payload.subject, body: payload.body, ...(payload.lote ? { lote: payload.lote, loteSel: payload.sel } : {}), ...(modal.objKind === "contact" ? { contactIds: [id] } : { companyIds: [id] }) }));
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
/* Una pestaña sobre la tabla: "Todos", cada vista y cada lista. */
const Pestana = ({ on, onClick, Icon, children, extra }) => (
  <button type="button" onClick={onClick} className="crm-btn"
    style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "none", borderBottom: `2px solid ${on ? C.jade : "transparent"}`, background: "transparent", padding: "10px 12px 8px", fontFamily: "var(--ui)", fontSize: 13, fontWeight: on ? 600 : 500, color: on ? C.ink : C.mute, cursor: "pointer", whiteSpace: "nowrap" }}>
    {Icon && <Icon size={13} />}{children}
    {extra != null && <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: C.faint }}>{extra}</span>}
  </button>
);

function RecordList({ kind, db, setDb, say, setModal, setDetail, onDelete }) {
  const schema = db.schema[kind];
  const rows = kind === "contact" ? db.contacts : db.companies;
  const vistas = useMemo(() => (db.vistas || []).filter((v) => v.kind === kind), [db.vistas, kind]);
  const listas = useMemo(() => (db.listas || []).filter((l) => l.kind === kind), [db.listas, kind]);
  /* Cuántos hay hoy en cada lista, para la pestaña y para el menú de envío. */
  const miembros = useMemo(() => Object.fromEntries(listas.map((l) => [l.id, miembrosDeLista(db, l)])),
    [listas, db.contacts, db.companies, db.schema]);
  /* Qué pestaña está abierta: null es "Todos". */
  const [activa, setActiva] = useState(null);
  const vistaActiva = activa?.tipo === "vista" ? vistas.find((v) => v.id === activa.id) || null : null;
  const listaActiva = activa?.tipo === "lista" ? listas.find((l) => l.id === activa.id) || null : null;
  const [dialogo, setDialogo] = useState(null);
  const [aBorrar, setABorrar] = useState(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [filtros, setFiltros] = useState([]);
  const [sel, setSel] = useState([]);
  /* El orden de las columnas es el orden de esta lista, y se recuerda en este
     navegador para no volver a acomodarlas cada vez que se entra. */
  const colsKey = `crm.cols.${kind}`;
  const [cols, setCols] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(colsKey) || "null");
      if (Array.isArray(saved)) return saved.filter((k) => schema.some((f) => f.key === k));
    } catch {}
    return schema.filter((f) => f.col).map((f) => f.key);
  });
  /* Las columnas de "Todos" son las de este navegador; las de una vista viajan
     con la vista. */
  useEffect(() => {
    if (activa) return;
    try { localStorage.setItem(colsKey, JSON.stringify(cols)); } catch {}
  }, [colsKey, cols, activa]);
  const [showCols, setShowCols] = useState(false);
  const [arrastrada, setArrastrada] = useState(null);
  const [sobre, setSobre] = useState(null);
  const moverColumna = (desde, hacia) => {
    if (!desde || desde === hacia) return;
    // Hacia la derecha cae después de la columna destino; hacia la izquierda, antes.
    setCols((c) => {
      const sin = c.filter((k) => k !== desde);
      const i = sin.indexOf(hacia);
      if (i < 0) return c;
      const en = c.indexOf(desde) < c.indexOf(hacia) ? i + 1 : i;
      return [...sin.slice(0, en), desde, ...sin.slice(en)];
    });
  };

  /* Clic en el título: el texto va de la A a la Z y los números y fechas de
     mayor a menor; otro clic invierte y un tercero quita el orden. */
  const [orden, setOrden] = useState(null);
  const ordenarPor = (f) => {
    const primero = f.type === "number" || f.type === "datetime" ? "desc" : "asc";
    setOrden((o) => !o || o.key !== f.key ? { key: f.key, dir: primero }
      : o.dir === primero ? { key: f.key, dir: primero === "asc" ? "desc" : "asc" } : null);
  };

  useEffect(() => { setSel([]); setQ(""); setOrden(null); setFiltros([]); }, [kind]);
  // Las propiedades creadas al importar aparecen de inmediato en la tabla,
  // sin volver a mostrar las columnas que el usuario ocultó.
  const known = useRef(new Set(schema.map((f) => f.key)));
  useEffect(() => {
    const fresh = schema.filter((f) => f.col && !known.current.has(f.key)).map((f) => f.key);
    schema.forEach((f) => known.current.add(f.key));
    if (fresh.length) setCols((c) => [...c, ...fresh.filter((k) => !c.includes(k))]);
  }, [schema]);

  /* El texto en que se busca se arma una vez por cambio en los registros, no
     una vez por tecla: quitar tildes y símbolos a miles de fichas en cada
     letra es lo que trababa la búsqueda. */
  const base = useMemo(() => {
    if (listaActiva?.tipo !== "fija") return rows;
    const ids = new Set(listaActiva.ids);
    return rows.filter((r) => ids.has(r.id));
  }, [rows, listaActiva]);
  const indice = useMemo(() => base.map((r) => ({ r, hay: norm(Object.values(r.props).join(" ")) })), [base]);

  /* La casilla responde al instante y el filtro va un paso detrás: si la
     lista tarda, React la deja para después en vez de congelar el teclado. */
  const qDiferida = React.useDeferredValue(q);
  const filtered = useMemo(() => {
    const nq = norm(qDiferida);
    const lista = indice.filter(({ r, hay }) => (!nq || hay.includes(nq)) && (!status || r.props.leadStatus === status)
      && (!filtros.length || cumpleFiltros(r, filtros, schema))).map((x) => x.r);
    const f = orden && schema.find((x) => x.key === orden.key);
    if (!f) return lista;
    // Los vacíos quedan siempre al final, en cualquier sentido.
    const signo = orden.dir === "asc" ? 1 : -1;
    const valor = f.type === "number" ? (v) => Number(v)
      : f.type === "datetime" ? (v) => new Date(v).getTime()
      : null;
    const col = new Intl.Collator("es", { numeric: true, sensitivity: "base" });
    return lista.map((r) => ({ r, v: r.props[f.key] })).sort((a, b) => {
      const va = a.v === undefined || a.v === null || a.v === "", vb = b.v === undefined || b.v === null || b.v === "";
      if (va || vb) return va === vb ? 0 : va ? 1 : -1;
      if (valor) {
        const x = valor(a.v), y = valor(b.v);
        if (!isNaN(x) && !isNaN(y)) return (x - y) * signo;
      }
      return col.compare(String(a.v), String(b.v)) * signo;
    }).map((x) => x.r);
  }, [indice, qDiferida, status, filtros, orden, schema]);

  /* Se pintan de a 100 filas: dibujar miles de una vez es lo que más pesa, y
     una lista larga no se recorre a ojo, se filtra. Seleccionar todos sigue
     marcando la lista completa, no sólo lo pintado. */
  const [limite, setLimite] = useState(100);
  useEffect(() => { setLimite(100); }, [kind, qDiferida, status, filtros, orden]);
  const pintados = filtered.length > limite ? filtered.slice(0, limite) : filtered;
  const marcados = useMemo(() => new Set(sel), [sel]);

  const shown = cols.map((k) => schema.find((f) => f.key === k)).filter(Boolean);
  const claveTitulo = kind === "contact" ? "firstName" : "name";
  /* La selección vive dentro de lo que se ve: al filtrar o buscar, quien
     queda fuera deja de estar marcado. Así "Enviar correo" nunca se lleva a
     alguien que ya no aparece en pantalla. */
  useEffect(() => {
    setSel((s) => {
      if (!s.length) return s;
      const visibles = new Set(filtered.map((r) => r.id));
      const quedan = s.filter((id) => visibles.has(id));
      return quedan.length === s.length ? s : quedan;
    });
  }, [filtered]);
  const allSel = filtered.length > 0 && filtered.every((r) => marcados.has(r.id));
  const algunos = sel.length > 0 && !allSel;
  const casillaTodos = useRef(null);
  useEffect(() => { if (casillaTodos.current) casillaTodos.current.indeterminate = algunos; }, [algunos]);
  const seleccionarTodos = () => setSel(filtered.map((r) => r.id));
  const quitarSeleccion = () => setSel([]);

  /* ── Vistas y listas ── */
  const columnasDeTodos = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(colsKey) || "null");
      if (Array.isArray(saved)) return saved.filter((k) => schema.some((f) => f.key === k));
    } catch {}
    return schema.filter((f) => f.col).map((f) => f.key);
  };
  const aplicar = (c, conColumnas) => {
    setQ(c.q || ""); setStatus(c.status || ""); setFiltros(c.filtros || []); setOrden(c.orden || null);
    if (conColumnas) setCols(conColumnas);
  };
  const abrirTodos = () => { setActiva(null); aplicar({}, columnasDeTodos()); };
  const abrirVista = (v) => {
    setActiva({ tipo: "vista", id: v.id });
    aplicar(v, Array.isArray(v.cols) ? v.cols.filter((k) => schema.some((f) => f.key === k)) : null);
  };
  /* Una lista activa muestra sus condiciones, que se pueden ajustar y guardar.
     Una fija abre sin filtros: lo que se filtre ahí sólo acota lo que se ve. */
  const abrirLista = (l) => {
    setActiva({ tipo: "lista", id: l.id });
    aplicar(l.tipo === "activa" ? l : {});
  };

  /* Si la vista o la lista abierta se borró —aquí o desde otra pestaña—, se
     vuelve a "Todos" en vez de quedar en una pestaña que ya no existe. */
  useEffect(() => { if (activa && !vistaActiva && !listaActiva) abrirTodos(); }, [activa, vistaActiva, listaActiva]);

  const criterio = { q, status, filtros };
  const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const vistaCambiada = vistaActiva && !igual({ ...criterio, cols, orden },
    { q: vistaActiva.q || "", status: vistaActiva.status || "", filtros: vistaActiva.filtros || [], cols: vistaActiva.cols, orden: vistaActiva.orden || null });
  const listaCambiada = listaActiva?.tipo === "activa" && !igual(criterio,
    { q: listaActiva.q || "", status: listaActiva.status || "", filtros: listaActiva.filtros || [] });
  const hayCriterio = Boolean(q.trim() || status || filtros.length);

  const plural = OBJ[kind].plural.toLowerCase();
  const pedirNombre = (titulo, subtitulo, onOk, inicial = "") => setDialogo({ titulo, subtitulo, inicial, onOk });

  const crearVista = (nombre) => {
    const v = { id: uid(), kind, nombre, ...criterio, cols, orden, creadaEn: nowISO() };
    setDb((d) => ({ ...d, vistas: [...(d.vistas || []), v] }));
    setActiva({ tipo: "vista", id: v.id });
    say(`Vista “${nombre}” guardada`);
  };
  const guardarVista = () => {
    setDb((d) => ({ ...d, vistas: d.vistas.map((v) => (v.id === vistaActiva.id ? { ...v, ...criterio, cols, orden } : v)) }));
    say("Vista actualizada");
  };
  /* La activa se lleva las condiciones; la fija, a las personas que se ven
     ahora mismo en la tabla. */
  const crearLista = (nombre, tipo, ids = []) => {
    const l = tipo === "activa"
      ? { id: uid(), kind, nombre, tipo, ...criterio, ids: [], creadaEn: nowISO() }
      : { id: uid(), kind, nombre, tipo, q: "", status: "", filtros: [], ids, creadaEn: nowISO() };
    setDb((d) => ({ ...d, listas: [...(d.listas || []), l] }));
    abrirLista(l);
    say(`Lista “${nombre}” creada${tipo === "fija" ? ` con ${ids.length}` : ""}`);
  };
  const guardarCondiciones = () => {
    setDb((d) => ({ ...d, listas: d.listas.map((l) => (l.id === listaActiva.id ? { ...l, ...criterio } : l)) }));
    say("Condiciones de la lista guardadas");
  };
  const renombrar = (tipo, id, nombre) => {
    const col = tipo === "vista" ? "vistas" : "listas";
    setDb((d) => ({ ...d, [col]: d[col].map((x) => (x.id === id ? { ...x, nombre } : x)) }));
  };
  const eliminar = ({ tipo, id }) => {
    const col = tipo === "vista" ? "vistas" : "listas";
    setDb((d) => ({ ...d, [col]: d[col].filter((x) => x.id !== id) }));
    setABorrar(null);
    abrirTodos();
  };
  const anadirALista = (id, ids) => {
    setDb((d) => ({ ...d, listas: d.listas.map((l) => (l.id === id ? { ...l, ids: [...new Set([...(l.ids || []), ...ids])] } : l)) }));
    const l = listas.find((x) => x.id === id);
    say(`${ids.length} añadido(s) a “${l ? l.nombre : "la lista"}”`);
  };
  const quitarDeLista = (ids) => {
    const fuera = new Set(ids);
    setDb((d) => ({ ...d, listas: d.listas.map((l) => (l.id === listaActiva.id ? { ...l, ids: l.ids.filter((x) => !fuera.has(x)) } : l)) }));
    say(`${ids.length} quitado(s) de la lista`);
  };
  const enviarALista = (l, channel) =>
    setModal({ kind: "send", channel, objKind: kind, ids: (miembros[l.id] || []).map((r) => r.id), listaId: l.id });

  const opcionesComoLista = (nombreBase) => [
    { titulo: "Usar como lista" },
    { label: "Crear lista activa con estos filtros", Icon: Zap, disabled: !hayCriterio,
      onClick: () => pedirNombre("Nueva lista activa", "Se actualiza sola: entra quien cumpla las condiciones y sale quien deje de cumplirlas.", (n) => crearLista(n, "activa"), nombreBase) },
    { label: `Crear lista fija con los ${filtered.length} que se ven`, Icon: ListChecks, disabled: !filtered.length,
      onClick: () => pedirNombre("Nueva lista fija", `Guarda a estos ${filtered.length} ${plural}. No cambia aunque cambien sus datos.`, (n) => crearLista(n, "fija", filtered.map((r) => r.id)), nombreBase) },
  ];

  /* Borrar no se deshace desde la app, así que se pregunta antes. Con pocos
     registros basta confirmar; desde 10 hay que escribir ELIMINAR, porque un
     "seleccionar todos" con un filtro equivocado se lleva la base entera de
     un clic. */
  const [confirmar, setConfirmar] = useState(false);
  const [palabra, setPalabra] = useState("");
  const pideEscribir = sel.length >= 10;
  const puedeBorrar = !pideEscribir || palabra.trim().toUpperCase() === "ELIMINAR";
  const nombreLista = sel.length === 1 ? OBJ[kind].singular.toLowerCase() : OBJ[kind].plural.toLowerCase();
  const borrar = () => {
    if (!puedeBorrar) return;
    onDelete(sel);
    setSel([]);
    setConfirmar(false);
  };

  return (
    <div>
      <Header eyebrow={`${rows.length} registros`} title={OBJ[kind].plural}
        right={<>
          <Btn variant="outline" Icon={Upload} onClick={() => setModal({ kind: "import", objKind: kind })}>Cargar archivo</Btn>
          <Btn variant="solid" Icon={Plus} onClick={() => setModal({ kind: "record", objKind: kind })}>Crear {OBJ[kind].singular.toLowerCase()}</Btn>
        </>} />

      <div style={{ padding: "0 28px", display: "flex", alignItems: "flex-end", gap: 2, borderBottom: `1px solid ${C.line}`, overflowX: "auto" }}>
        <Pestana on={!activa} onClick={abrirTodos} extra={rows.length}>Todos</Pestana>
        {vistas.map((v) => (
          <Pestana key={v.id} on={vistaActiva?.id === v.id} onClick={() => abrirVista(v)} Icon={Eye}>{v.nombre}</Pestana>
        ))}
        {listas.length > 0 && <div style={{ width: 1, alignSelf: "stretch", background: C.line, margin: "8px 6px" }} />}
        {listas.map((l) => (
          <Pestana key={l.id} on={listaActiva?.id === l.id} onClick={() => abrirLista(l)}
            Icon={l.tipo === "activa" ? Zap : ListChecks} extra={(miembros[l.id] || []).length}>{l.nombre}</Pestana>
        ))}
      </div>

      {listaActiva && (
        <div style={{ padding: "10px 28px", background: "#F4F6F1", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Pill color={listaActiva.tipo === "activa" ? C.blue : C.plum} soft={listaActiva.tipo === "activa" ? C.blueSoft : C.plumSoft}>
            Lista {listaActiva.tipo}
          </Pill>
          <span style={{ fontFamily: "var(--ui)", fontSize: 12.5, color: C.mute, flex: "1 1 260px" }}>
            <b style={{ color: C.ink }}>{(miembros[listaActiva.id] || []).length}</b> {(miembros[listaActiva.id] || []).length === 1 ? OBJ[kind].singular.toLowerCase() : plural} ·{" "}
            {listaActiva.tipo === "activa"
              ? (listaCambiada ? "Cambiaste las condiciones: guárdalas para que la lista las use." : "Se actualiza sola con quien cumpla las condiciones de abajo.")
              : "Las personas guardadas no cambian. Filtrar aquí sólo acota lo que ves."}
          </span>
          {listaCambiada && <>
            <Btn size="sm" onClick={() => abrirLista(listaActiva)}>Descartar</Btn>
            <Btn size="sm" variant="solid" Icon={Check} onClick={guardarCondiciones}>Guardar condiciones</Btn>
          </>}
          <Btn size="sm" variant="outline" Icon={MessageSquare} disabled={!(miembros[listaActiva.id] || []).length} onClick={() => enviarALista(listaActiva, "whatsapp")}>WhatsApp a la lista</Btn>
          <Btn size="sm" variant="outline" Icon={Mail} disabled={!(miembros[listaActiva.id] || []).length} onClick={() => enviarALista(listaActiva, "email")}>Correo a la lista</Btn>
        </div>
      )}

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
        {vistaCambiada && <>
          <Btn variant="outline" onClick={() => abrirVista(vistaActiva)}>Descartar</Btn>
          <Btn variant="solid" Icon={Check} onClick={guardarVista}>Guardar cambios</Btn>
        </>}
        {!activa && (
          <Menu size="md" label="Guardar" items={[
            { label: "Guardar como vista", Icon: Eye, onClick: () => pedirNombre("Guardar vista", "Guarda la búsqueda, los filtros, las columnas y el orden en una pestaña.", crearVista) },
            ...opcionesComoLista(""),
          ]} />
        )}
        {vistaActiva && (
          <Menu size="md" label="Vista" items={[
            { label: "Guardar como vista nueva", Icon: Eye, onClick: () => pedirNombre("Guardar como vista nueva", "", crearVista, `${vistaActiva.nombre} (copia)`) },
            { label: "Cambiar nombre", Icon: Pencil, onClick: () => pedirNombre("Cambiar nombre de la vista", "", (n) => { renombrar("vista", vistaActiva.id, n); setDialogo(null); }, vistaActiva.nombre) },
            ...opcionesComoLista(vistaActiva.nombre),
            { titulo: " " },
            { label: "Eliminar vista", Icon: Trash2, danger: true, onClick: () => setABorrar({ tipo: "vista", id: vistaActiva.id, nombre: vistaActiva.nombre }) },
          ]} />
        )}
        {listaActiva && (
          <Menu size="md" label="Lista" items={[
            { label: "Cambiar nombre", Icon: Pencil, onClick: () => pedirNombre("Cambiar nombre de la lista", "", (n) => { renombrar("lista", listaActiva.id, n); setDialogo(null); }, listaActiva.nombre) },
            { titulo: "Duplicar" },
            listaActiva.tipo === "activa" && { label: "Duplicar como lista activa", Icon: Zap, onClick: () => pedirNombre("Nueva lista activa", "Copia estas condiciones en otra lista que se actualiza sola.", (n) => crearLista(n, "activa"), `${listaActiva.nombre} (copia)`) },
            { label: `Duplicar como lista fija (${filtered.length})`, Icon: ListChecks, disabled: !filtered.length, onClick: () => pedirNombre("Nueva lista fija", `Guarda a los ${filtered.length} ${plural} que se ven ahora.`, (n) => crearLista(n, "fija", filtered.map((r) => r.id)), `${listaActiva.nombre} (fija)`) },
            { label: "Guardar como vista", Icon: Eye, onClick: () => pedirNombre("Guardar vista", "", crearVista, listaActiva.nombre) },
            { titulo: " " },
            { label: "Eliminar lista", Icon: Trash2, danger: true, onClick: () => setABorrar({ tipo: "lista", id: listaActiva.id, nombre: listaActiva.nombre }) },
          ]} />
        )}
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" Icon={Plus} size="sm" onClick={() => setModal({ kind: "prop", objKind: kind })}>Nueva propiedad</Btn>
      </div>

      <div style={{ padding: "10px 28px", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <FiltrosPropiedad schema={schema} rows={rows} filtros={filtros} setFiltros={setFiltros} enLinea />
        </div>
        {filtros.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--ui)", fontSize: 12, color: C.mute, paddingTop: 5 }}>
            {filtered.length} de {rows.length} cumplen
            {filtered.length > 0 && !allSel && <Btn size="sm" variant="outline" Icon={Check} onClick={seleccionarTodos}>Seleccionar los {filtered.length}</Btn>}
            <Btn size="sm" onClick={() => setFiltros([])}>Quitar filtros</Btn>
          </div>
        )}
      </div>

      {sel.length > 0 && (
        <div style={{ padding: "10px 28px", background: C.jadeSoft, borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--ui)", fontSize: 13, fontWeight: 600, color: C.jade }}>{sel.length} de {filtered.length} seleccionados</span>
          {!allSel && <Btn size="sm" onClick={seleccionarTodos}>Seleccionar los {filtered.length}</Btn>}
          <Btn size="sm" onClick={quitarSeleccion}>Quitar selección</Btn>
          <Btn size="sm" variant="outline" Icon={MessageSquare} onClick={() => setModal({ kind: "send", channel: "whatsapp", objKind: kind, ids: sel })}>Enviar WhatsApp</Btn>
          <Btn size="sm" variant="outline" Icon={Mail} onClick={() => setModal({ kind: "send", channel: "email", objKind: kind, ids: sel })}>Enviar correo</Btn>
          <Btn size="sm" variant="outline" Icon={Briefcase} onClick={() => setModal({ kind: "deal", contactIds: kind === "contact" ? sel : [], companyId: kind === "company" ? sel[0] : undefined, presets: { source: "Manual" } })}>Crear negocio</Btn>
          <Btn size="sm" variant="outline" Icon={Pencil} onClick={() => setModal({ kind: "bulk", objKind: kind, ids: sel })}>Editar propiedad</Btn>
          <Menu label="Añadir a lista" Icon={ListChecks} items={[
            { label: `Nueva lista fija con estos ${sel.length}`, Icon: Plus, onClick: () => pedirNombre("Nueva lista fija", `Guarda a estos ${sel.length} ${plural}.`, (n) => crearLista(n, "fija", sel)) },
            ...(listas.some((l) => l.tipo === "fija" && l.id !== listaActiva?.id) ? [{ titulo: "Listas fijas" }] : []),
            ...listas.filter((l) => l.tipo === "fija" && l.id !== listaActiva?.id)
              .map((l) => ({ label: l.nombre, extra: (miembros[l.id] || []).length, onClick: () => anadirALista(l.id, sel) })),
          ]} />
          {listaActiva?.tipo === "fija" && <Btn size="sm" variant="outline" Icon={X} onClick={() => { quitarDeLista(sel); setSel([]); }}>Quitar de la lista</Btn>}
          <div style={{ flex: 1 }} />
          <Btn size="sm" variant="danger" Icon={Trash2} onClick={() => { setPalabra(""); setConfirmar(true); }}>Eliminar</Btn>
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
                  <input ref={casillaTodos} type="checkbox" checked={allSel} onChange={() => (allSel ? quitarSeleccion() : seleccionarTodos())}
                    title={allSel ? "Quitar la selección" : `Seleccionar los ${filtered.length}`} />
                </th>
                {shown.map((f) => {
                  const activo = orden?.key === f.key;
                  return (
                    <th key={f.key} draggable title="Clic para ordenar · arrastra para mover"
                      onClick={() => ordenarPor(f)}
                      onDragStart={(e) => { setArrastrada(f.key); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", f.key); }}
                      onDragOver={(e) => { if (!arrastrada) return; e.preventDefault(); if (sobre !== f.key) setSobre(f.key); }}
                      onDragLeave={() => setSobre((s) => s === f.key ? null : s)}
                      onDrop={(e) => { e.preventDefault(); moverColumna(arrastrada, f.key); setArrastrada(null); setSobre(null); }}
                      onDragEnd={() => { setArrastrada(null); setSobre(null); }}
                      style={{ padding: "9px 12px", textAlign: "left", fontFamily: "var(--mono)", fontSize: 10.5, fontWeight: 500, color: activo ? C.ink : C.mute, letterSpacing: ".07em", textTransform: "uppercase", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none",
                        opacity: arrastrada === f.key ? 0.4 : 1,
                        boxShadow: sobre === f.key && arrastrada !== f.key ? `inset ${cols.indexOf(arrastrada) < cols.indexOf(f.key) ? "-2px" : "2px"} 0 0 ${C.jade}` : "none" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {f.label}
                        {activo && (orden.dir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                      </span>
                    </th>
                  );
                })}
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {pintados.map((r) => (
                <tr key={r.id} className="crm-row" style={{ borderBottom: `1px solid #EEF1EC` }}>
                  <td style={{ padding: "9px 12px 9px 28px" }}>
                    <input type="checkbox" checked={marcados.has(r.id)} onChange={() => setSel((s) => s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id])} />
                  </td>
                  {shown.map((f) => (
                    <td key={f.key} style={{ padding: "9px 12px", fontFamily: "var(--ui)", fontSize: 13, color: C.ink, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {f.key === claveTitulo ? (
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
        {dialogo && (
          <NombreModal titulo={dialogo.titulo} subtitulo={dialogo.subtitulo} inicial={dialogo.inicial}
            onClose={() => setDialogo(null)} onOk={(n) => { dialogo.onOk(n); setDialogo(null); }} />
        )}
        {aBorrar && (
          <Modal title={`¿Eliminar la ${aBorrar.tipo} “${aBorrar.nombre}”?`}
            subtitle={`Sólo se borra la ${aBorrar.tipo}: los ${plural} siguen intactos en el CRM.`}
            onClose={() => setABorrar(null)}
            footer={<><Btn variant="outline" onClick={() => setABorrar(null)}>Cancelar</Btn>
              <Btn variant="danger" Icon={Trash2} onClick={() => eliminar(aBorrar)}>Eliminar {aBorrar.tipo}</Btn></>} />
        )}
        {confirmar && (
          <Modal title={`¿Eliminar ${sel.length} ${nombreLista}?`}
            subtitle="Esta acción no se puede deshacer desde el CRM."
            onClose={() => setConfirmar(false)}
            footer={<>
              <Btn variant="outline" onClick={() => setConfirmar(false)}>Cancelar</Btn>
              <Btn variant="danger" Icon={Trash2} disabled={!puedeBorrar} onClick={borrar}
                style={puedeBorrar ? { background: C.clay, color: "#fff", borderColor: C.clay } : { opacity: 0.5, cursor: "not-allowed" }}>
                Eliminar {sel.length} {nombreLista}
              </Btn>
            </>}>
            <div style={{ fontFamily: "var(--ui)", fontSize: 13, color: C.ink, lineHeight: 1.6 }}>
              Se borrarán estos registros con todas sus propiedades:
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: C.mute }}>
                {rows.filter((r) => marcados.has(r.id)).slice(0, 5).map((r) => <li key={r.id}>{titleOf(kind, r)}</li>)}
                {sel.length > 5 && <li>y {sel.length - 5} más…</li>}
              </ul>
            </div>
            {pideEscribir && (
              <label style={{ display: "block", marginTop: 16 }}>
                <div style={{ fontFamily: "var(--ui)", fontSize: 12.5, color: C.ink, marginBottom: 6 }}>
                  Para confirmar, escribe <b>ELIMINAR</b>:
                </div>
                <input className="crm-in" autoFocus value={palabra} onChange={(e) => setPalabra(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") borrar(); }} style={inputStyle} />
              </label>
            )}
          </Modal>
        )}
        {filtered.length > pintados.length && (
          <div style={{ padding: "14px 28px", display: "flex", alignItems: "center", gap: 12, fontFamily: "var(--ui)", fontSize: 12.5, color: C.mute }}>
            Mostrando {pintados.length} de {filtered.length}. Escribe en el buscador para llegar a alguien puntual.
            <Btn size="sm" variant="outline" onClick={() => setLimite((n) => n + 100)}>Mostrar 100 más</Btn>
          </div>
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

/* ── Envíos masivos ──
   Un masivo deja una actividad por persona, y en la lista eso se lee como
   doscientas filas iguales. Aquí se vuelven a juntar en lo que fueron: un
   envío, con sus cifras arriba y la gente debajo.

   Lo que sale desde ahora lleva `lote`, que lo dice sin adivinar. Lo de antes
   no lo tiene, y se junta por parecido: mismo canal, mismo asunto y sin más de
   seis horas de silencio entre uno y el siguiente. Sólo cuentan los que anotó
   el CRM al enviar —sin `ext`—: las copias que el barrido trae de "Enviados"
   en Gmail son el mismo correo visto otra vez y lo contarían doble. */
const HUECO_LOTE = 6 * 3600 * 1000;
const VENTANA_WA = 7 * 24 * 3600 * 1000;
const sinPrefijo = (s) => String(s || "").replace(/^(\s*(re|rv|res|fw|fwd|reenviado)\s*:\s*)+/i, "");

function agruparEnvios(db) {
  const salidas = db.activities
    .filter((a) => a.dir === "out" && !a.ext && (a.type === "email" || a.type === "whatsapp"))
    .sort((a, b) => (a.at < b.at ? -1 : 1));

  const grupos = new Map();
  const abiertos = new Map();
  for (const a of salidas) {
    let clave = a.lote ? `lote:${a.lote}` : "";
    if (!clave) {
      const tema = `${a.type}:${norm(a.subject)}`;
      const g = abiertos.get(tema);
      if (g && Date.parse(a.at) - Date.parse(g.ultimo) <= HUECO_LOTE) clave = g.clave;
      else { clave = `viejo:${tema}:${a.at}`; abiertos.set(tema, { clave, ultimo: a.at }); }
      abiertos.get(tema).ultimo = a.at;
    }
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(a);
  }

  /* Las respuestas, por ficha: lo que llegó por el mismo canal. Los avisos de
     rebote también entran como recibidos y no son una respuesta de nadie. */
  const recibidos = new Map();
  for (const a of db.activities) {
    if (a.dir !== "in" || (a.type !== "email" && a.type !== "whatsapp")) continue;
    if (String(a.ext || "").startsWith("rebote:")) continue;
    [...(a.contactIds || []), ...(a.companyIds || [])].forEach((id) => {
      if (!recibidos.has(id)) recibidos.set(id, []);
      recibidos.get(id).push(a);
    });
  }
  /* Una respuesta por correo se reconoce por el asunto —"Re: " más el que
     salió—: así una conversación aparte con la misma persona no se apunta a
     esta campaña. Por WhatsApp no hay asunto, y vale lo que conteste en la
     semana siguiente. */
  const respuestaA = (a) => {
    const ids = [...(a.contactIds || []), ...(a.companyIds || [])];
    const tema = norm(a.subject);
    let mejor = null;
    for (const id of ids) for (const r of recibidos.get(id) || []) {
      if (r.type !== a.type || r.at <= a.at) continue;
      if (a.type === "email" ? norm(sinPrefijo(r.subject)) !== tema : Date.parse(r.at) - Date.parse(a.at) > VENTANA_WA) continue;
      if (!mejor || r.at < mejor.at) mejor = r;
    }
    return mejor;
  };

  const porId = { contact: new Map(db.contacts.map((r) => [r.id, r])), company: new Map(db.companies.map((r) => [r.id, r])) };
  const envios = [];
  for (const [id, acts] of grupos) {
    const ultimoSel = [...acts].reverse().find((a) => a.loteSel);
    /* Uno solo no es un masivo: es el correo que se le mandó a alguien desde
       su ficha, y ya se ve en la lista de siempre. */
    if (acts.length < 2 && !(ultimoSel && ultimoSel.loteSel > 1)) continue;

    const filas = acts.map((a) => {
      const kind = (a.contactIds || []).length ? "contact" : "company";
      const recId = (kind === "contact" ? a.contactIds : a.companyIds || [])[0];
      const rec = porId[kind].get(recId);
      const e = estadoDe(a);
      return {
        a, kind, recId, rec,
        nombre: rec ? titleOf(kind, rec) : "Registro borrado",
        dest: rec ? (a.type === "email" ? rec.props.email : rec.props.phone) || "" : "",
        e,
        rebote: Boolean(e.rebote && e.rebote.permanente),
        respuesta: respuestaA(a),
      };
    });
    const enviados = filas.length;
    const rebotes = filas.filter((f) => f.rebote).length;
    envios.push({
      id, type: acts[0].type,
      subject: acts[0].subject,
      at: acts[0].at, hasta: acts[acts.length - 1].at,
      filas,
      sel: ultimoSel ? Math.max(ultimoSel.loteSel, enviados) : null,
      enviados,
      recibieron: enviados - rebotes,
      rebotes,
      medidos: filas.filter((f) => f.e.medido).length,
      abiertos: filas.filter((f) => f.e.abiertoAt).length,
      clics: filas.filter((f) => f.e.clics).length,
      respuestas: filas.filter((f) => f.respuesta).length,
    });
  }
  return envios.sort((a, b) => (a.at < b.at ? 1 : -1));
}

const Cifra = ({ label, valor, sub, color, Icon, compacta }) => (
  <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, padding: compacta ? "8px 12px" : "10px 14px", flex: "1 1 130px", minWidth: compacta ? 110 : 140 }}>
    <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, color: C.mute, fontWeight: 500, display: "flex", alignItems: "center", gap: 5 }}>
      {Icon && <Icon size={12} color={color || C.mute} />}{label}
    </div>
    <div style={{ fontFamily: "var(--display)", fontSize: compacta ? 20 : 24, fontWeight: 600, letterSpacing: "-.02em", marginTop: 2, color: color || C.ink }}>{valor}</div>
    <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: C.faint, marginTop: 2, letterSpacing: ".04em" }}>{sub || " "}</div>
  </div>
);

/* Las cinco cifras de un envío, en el mismo orden en la lista y en el detalle.
   Clic y rebote sólo existen en el correo: en WhatsApp se dice que no se mide
   en vez de poner un cero que parecería un resultado. */
const CifrasEnvio = ({ v, compacta }) => {
  const correo = v.type === "email";
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <Cifra compacta={compacta} Icon={Users} label="Seleccionados" valor={v.sel ?? v.enviados}
        sub={v.sel == null ? "envío anterior al registro" : v.sel > v.enviados ? `${v.enviados} enviados` : "todos enviados"} />
      <Cifra compacta={compacta} Icon={MailCheck} label="Recibieron" valor={correo ? v.recibieron : v.enviados} color={C.jade}
        sub={correo ? porcentaje(v.recibieron, v.enviados) : "enviados"} />
      <Cifra compacta={compacta} Icon={MailX} label="Rebotaron" valor={correo ? v.rebotes : "—"} color={correo && v.rebotes ? C.clay : C.ink}
        sub={correo ? porcentaje(v.rebotes, v.enviados) : "no aplica"} />
      <Cifra compacta={compacta} Icon={MousePointerClick} label="Dieron clic" valor={correo && v.medidos ? v.clics : "—"} color={C.plum}
        sub={!correo ? "no aplica" : v.medidos ? porcentaje(v.clics, v.medidos) : "sin medición"} />
      <Cifra compacta={compacta} Icon={Reply} label="Respondieron" valor={v.respuestas} color={C.blue}
        sub={porcentaje(v.respuestas, correo ? v.recibieron : v.enviados)} />
    </div>
  );
};

function EnviosLista({ envios, onAbrir }) {
  if (!envios.length) {
    return <Empty title="Todavía no hay envíos masivos"
      hint="Cuando mandes un correo o un WhatsApp masivo aparecerá aquí, con quién lo recibió, quién pinchó y quién contestó." />;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {envios.map((v) => {
        const ch = CHANNEL[v.type];
        return (
          <button key={v.id} onClick={() => onAbrir(v.id)} className="crm-btn"
            style={{ textAlign: "left", background: "#F6F8F4", border: `1px solid ${C.line}`, borderRadius: 10, padding: "14px 16px", cursor: "pointer", display: "block", width: "100%" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
              <div style={{ width: 30, height: 30, borderRadius: 7, background: ch.soft, display: "grid", placeItems: "center", flexShrink: 0 }}><ch.Icon size={14} color={ch.color} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "var(--ui)", fontSize: 14, fontWeight: 600, color: C.ink }}>{v.subject}</span>
                  <Pill color={ch.color} soft={ch.soft}>{ch.label} masivo</Pill>
                </div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: C.faint, marginTop: 2 }}>{fmt(v.at)}</div>
              </div>
              <span style={{ fontFamily: "var(--ui)", fontSize: 12.5, color: C.jade, fontWeight: 600, display: "flex", alignItems: "center", gap: 2, whiteSpace: "nowrap" }}>
                Ver uno a uno <ChevronRight size={14} />
              </span>
            </div>
            <CifrasEnvio v={v} compacta />
          </button>
        );
      })}
    </div>
  );
}

function EnvioDetalle({ v, onVolver, setDetail }) {
  const [f, setF] = useState("todos");
  const correo = v.type === "email";
  const FILTROS = [
    ["todos", `Todos · ${v.enviados}`],
    ...(correo ? [["recibieron", `Recibieron · ${v.recibieron}`], ["rebote", `Rebotaron · ${v.rebotes}`], ["clic", `Con clic · ${v.clics}`]] : []),
    ["respuesta", `Respondieron · ${v.respuestas}`],
    ["sin", `Sin respuesta · ${v.enviados - v.respuestas}`],
  ];
  const pasa = (x) => f === "todos" ? true
    : f === "recibieron" ? !x.rebote
    : f === "rebote" ? x.rebote
    : f === "clic" ? x.e.clics > 0
    : f === "respuesta" ? Boolean(x.respuesta)
    : !x.respuesta;
  const filas = [...v.filas].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")).filter(pasa);
  const th = { textAlign: "left", fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase", color: C.faint, fontWeight: 500, padding: "8px 10px", borderBottom: `1px solid ${C.line}`, whiteSpace: "nowrap" };
  const td = { fontFamily: "var(--ui)", fontSize: 12.5, color: C.mute, padding: "10px", borderBottom: "1px solid #EEF1EC", verticalAlign: "top" };

  const estado = (x) => {
    if (x.e.rebote) return <Pill color={C.clay} soft={C.claySoft}>{x.rebote ? "Rebotó" : "Demorado"}</Pill>;
    return <Pill color={C.jade} soft={C.jadeSoft}>{correo ? "Recibido" : "Enviado"}</Pill>;
  };

  return (
    <div>
      <button onClick={onVolver} className="crm-btn"
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: C.jade, fontFamily: "var(--ui)", fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 4, marginBottom: 12 }}>
        <ArrowLeft size={14} /> Todos los envíos
      </button>
      <div style={{ fontFamily: "var(--display)", fontSize: 20, fontWeight: 600, color: C.ink, letterSpacing: "-.01em" }}>{v.subject}</div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: C.faint, margin: "4px 0 14px" }}>
        {CHANNEL[v.type].label} masivo · {fmt(v.at)}{v.hasta.slice(0, 10) !== v.at.slice(0, 10) ? ` → ${fmt(v.hasta)}` : ""}
      </div>
      <CifrasEnvio v={v} />
      {correo && (
        <div style={{ marginTop: 8, fontFamily: "var(--ui)", fontSize: 11.5, color: C.faint, lineHeight: 1.6, maxWidth: 900 }}>
          <b>Recibieron</b> son los que salieron y no rebotaron: el servidor del otro lado no lo devolvió. <b>Respondieron</b> cuenta
          los correos que llegaron con el mismo asunto después del envío; aparecen al pulsar <b>Actualizar estados</b>.
        </div>
      )}

      <div style={{ padding: "16px 0 10px", display: "flex", gap: 7, flexWrap: "wrap" }}>
        {FILTROS.map(([k, l]) => (
          <button key={k} onClick={() => setF(k)} className="crm-btn"
            style={{ border: `1px solid ${f === k ? C.jade : C.line}`, background: f === k ? C.jade : C.panel, color: f === k ? "#fff" : C.mute, borderRadius: 999, padding: "5px 13px", fontFamily: "var(--ui)", fontSize: 12.5, cursor: "pointer" }}>{l}</button>
        ))}
      </div>

      <div style={{ overflowX: "auto", background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
          <thead>
            <tr>
              <th style={th}>Contacto</th>
              <th style={th}>{correo ? "Correo" : "Teléfono"}</th>
              <th style={th}>Entrega</th>
              {correo && <th style={th}>Apertura</th>}
              {correo && <th style={th}>Clics</th>}
              <th style={th}>Respuesta</th>
              <th style={th}>Enviado</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((x) => (
              <tr key={x.a.id}>
                <td style={td}>
                  {x.rec
                    ? <button onClick={() => setDetail({ kind: x.kind, id: x.recId })} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: C.jade, fontFamily: "var(--ui)", fontSize: 13, fontWeight: 600, textAlign: "left" }}>{x.nombre}</button>
                    : <span style={{ color: C.faint }}>{x.nombre}</span>}
                </td>
                <td style={{ ...td, overflowWrap: "anywhere" }}>{x.dest || "—"}</td>
                <td style={td}>
                  {estado(x)}
                  {x.e.rebote && <div style={{ fontSize: 11, color: C.clay, marginTop: 4, maxWidth: 220 }}>{String(x.e.rebote.motivo || "").split("\n")[0]}</div>}
                </td>
                {correo && (
                  <td style={td}>
                    {x.e.abiertoAt ? fmt(x.e.abiertoAt) : x.e.soloPrecarga ? "Dudosa" : x.e.medido ? "Sin abrir" : "—"}
                  </td>
                )}
                {correo && (
                  <td style={td}>
                    {x.e.clics ? <span style={{ color: C.plum, fontWeight: 600 }}>{x.e.clics}</span> : x.e.medido ? "0" : "—"}
                    {x.e.enlaces.slice(0, 2).map((u) => <div key={u} style={{ fontSize: 11, color: C.plum, overflowWrap: "anywhere", maxWidth: 220 }}>{u}</div>)}
                  </td>
                )}
                <td style={td}>
                  {x.respuesta
                    ? <>
                        <div style={{ color: C.blue, fontWeight: 600 }}>{fmt(x.respuesta.at)}</div>
                        {x.respuesta.body && <div style={{ fontSize: 11.5, marginTop: 3, maxWidth: 280, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{x.respuesta.body}</div>}
                      </>
                    : "—"}
                </td>
                <td style={{ ...td, fontFamily: "var(--mono)", fontSize: 11, whiteSpace: "nowrap" }}>{fmt(x.a.at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filas.length === 0 && <Empty title="Nadie en este filtro" hint="Prueba con otro, o pulsa “Actualizar estados” para traer lo último." />}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Actividades
   ──────────────────────────────────────────────────────────── */
function ActivitiesView({ db, setModal, setDetail, say, onImport, onBuzon, onEventos, onRebotes, onLeerBandeja, onLeads, onWhatsApp }) {
  const [f, setF] = useState("all");
  /* Se abre en los envíos: lo primero que se quiere saber de un masivo es cómo
     le fue, no repasar doscientas filas iguales. */
  const [modo, setModo] = useState("envios");
  const [envioAbierto, setEnvioAbierto] = useState(null);
  const envios = useMemo(() => agruparEnvios(db), [db.activities, db.contacts, db.companies]);
  const envio = envioAbierto ? envios.find((v) => v.id === envioAbierto) : null;
  const [sync, setSync] = useState({ busy: false, nota: "", err: "" });
  const mide = midiendo(db.integrations.medicion);

  const actualizar = async () => {
    setSync({ busy: true, nota: "Pidiendo permiso…", err: "" });
    try {
      const r = await correrBarrido({
        db,
        progreso: (nota) => setSync({ busy: true, nota, err: "" }),
        onImport, onBuzon, onLeerBandeja, onEventos, onRebotes, onLeads, onWhatsApp,
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

      <div style={{ padding: "12px 28px 0", display: "flex", gap: 22, borderBottom: `1px solid ${C.line}` }}>
        {[["envios", `Envíos masivos · ${envios.length}`], ["todas", "Todas las actividades"]].map(([k, l]) => (
          <button key={k} onClick={() => { setModo(k); setEnvioAbierto(null); }} className="crm-btn"
            style={{ background: "none", border: "none", borderBottom: `2px solid ${modo === k ? C.jade : "transparent"}`, padding: "6px 0 9px", marginBottom: -1, cursor: "pointer", fontFamily: "var(--ui)", fontSize: 13, fontWeight: modo === k ? 600 : 500, color: modo === k ? C.ink : C.mute }}>{l}</button>
        ))}
      </div>

      {modo === "envios" && (
        <div style={{ padding: "18px 28px 40px" }}>
          {envio
            ? <EnvioDetalle key={envio.id} v={envio} onVolver={() => setEnvioAbierto(null)} setDetail={setDetail} />
            : <EnviosLista envios={envios} onAbrir={setEnvioAbierto} />}
        </div>
      )}

      {modo === "todas" && <>
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
      </>}
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

/* Lo ya guardado, por su identificador de fuera. Un correo que el CRM mandó
   por la API guarda su identificador de Gmail, y el barrido lo vuelve a ver en
   Enviados como `gmail:<id>`: es el mismo, no hay que meterlo otra vez. */
const clavesExternas = (acts) => {
  const s = new Set();
  for (const a of acts) {
    if (a.ext) s.add(a.ext);
    if (a.gmailId) s.add(`gmail:${a.gmailId}`);
  }
  return s;
};

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
/* ────────────────────────────────────────────────────────────
   Mandar un WhatsApp

   Dos caminos y una sola puerta, para que los tres sitios desde donde el CRM
   manda WhatsApp —el hilo de Mensajes, el envío masivo y las automatizaciones—
   no tengan que saber cuál está encendido.

     · "enlace": se abre WhatsApp con el texto ya escrito y tú das el último
       clic. Funciona hoy, sin configurar nada, con tu WhatsApp de siempre.

     · "api": lo manda el puente por la WhatsApp Cloud API y no se abre nada.
       Pide cuenta de empresa en Meta y un token, que vive allá.

   La diferencia que importa no es la comodidad: por enlace, "enviar" siempre
   necesita una persona delante, así que una automatización de WhatsApp deja el
   mensaje preparado y espera. Por API sale sola.

   `plantilla` es lo que arma plantillaWaPara cuando la plantilla del CRM está
   enlazada a una aprobada en Meta. Por la API sale esa plantilla, que es lo
   que deja escribirle a alguien fuera de la ventana de 24 horas; por enlace no
   hay plantillas que valgan y se abre el chat con su texto ya armado.

   Devuelve qué pasó en vez de avisar por su cuenta, porque quien llama sabe si
   toca pintar un error o anotarlo en el historial.
   ──────────────────────────────────────────────────────────── */
async function mandarWhatsApp(integ, telefono, texto, plantilla) {
  const cc = integ.whatsapp.countryCode;
  const numero = toE164(telefono, cc);
  if (!numero) return { ok: false, err: "No tiene un teléfono que WhatsApp pueda marcar." };

  if (integ.whatsapp.modo !== "api") {
    if (!window.open(waLink(telefono, texto, cc), "_blank", "noopener,noreferrer")) {
      return { ok: false, err: "El navegador bloqueó la ventana. Permite las ventanas emergentes para este sitio." };
    }
    return { ok: true, solo: false };
  }

  if (!integ.puente.base || !integ.puente.clave) {
    return { ok: false, err: "WhatsApp está puesto en “envía solo”, pero falta el puente. Configúralo en Conexiones." };
  }
  try {
    const r = await enviarWhatsApp({
      base: integ.puente.base, clave: integ.puente.clave, a: numero, texto,
      ...(plantilla ? { plantilla: plantilla.plantilla, idioma: plantilla.idioma, variables: plantilla.variables, ...(plantilla.imagen ? { imagen: plantilla.imagen } : {}) } : {}),
    });
    return { ok: true, solo: true, id: (r && r.id) || "" };
  } catch (e) {
    return { ok: false, err: (e && e.message) || String(e) };
  }
}

/* Pregunta al puente por lo recibido desde la última marca y lo entrega a
   `onWhatsApp`. Si el puente tenía más de lo que cabe en una respuesta,
   vuelve a pedir desde el último: son pocos viajes, y dejar mensajes
   esperando al siguiente minuto los mostraría desordenados en el hilo. */
let waEnCurso = null;
function recogerWhatsApp(db, onWhatsApp, onBuzon) {
  /* El latido de cada minuto y el botón Actualizar pueden coincidir. Dos
     pasadas a la vez crearían dos fichas para el mismo número desconocido,
     así que la segunda espera a la primera en vez de repetirla. */
  if (!waEnCurso) waEnCurso = recogerWhatsAppYa(db, onWhatsApp, onBuzon).finally(() => { waEnCurso = null; });
  return waEnCurso;
}

async function recogerWhatsAppYa(db, onWhatsApp, onBuzon) {
  const integ = db.integrations;
  if (integ.whatsapp.modo !== "api" || !integ.puente.base || !integ.puente.clave) return null;
  let desde = Number(db.buzon.whatsappAl) || 0;
  let mensajes = 0, fichas = 0;
  for (let vuelta = 0; vuelta < 5; vuelta++) {
    const r = await traerWhatsApp({ base: integ.puente.base, clave: integ.puente.clave, desde });
    const lote = r.mensajes || [];
    if (!lote.length) break;
    const hecho = onWhatsApp(lote);
    mensajes += hecho.mensajes; fichas += hecho.fichas;
    desde = Math.max(desde, ...lote.map((m) => Number(m.recibido) || 0));
    onBuzon({ whatsappAl: String(desde) });
    if (!r.truncado) break;
  }
  return { mensajes, fichas };
}

/* Índice dirección → fichas. Dos personas pueden compartir el correo de la
   empresa, así que una dirección puede apuntar a varias. */
function indiceDirecciones(db) {
  const porDireccion = new Map();
  const anotar = (correo, kind, id) => {
    const d = String(correo || "").trim().toLowerCase();
    if (!d) return;
    if (!porDireccion.has(d)) porDireccion.set(d, []);
    porDireccion.get(d).push({ kind, id });
  };
  db.contacts.forEach((r) => anotar(r.props.email, "contact", r.id));
  db.companies.forEach((r) => anotar(r.props.email, "company", r.id));
  return porDireccion;
}

/* Los correos cruzados con la gente del CRM, ya como actividades. Lo usan el
   botón "Correo" y la revisión sola del latido: dos copias de esto se habrían
   separado a la primera corrección. */
async function bajarCorreos(db, porDireccion, progreso = () => {}) {
  const { mensajes, revisados, truncado } = await traerCorreos({
    clientId: db.integrations.email.clientId,
    direcciones: [...porDireccion.keys()],
    desde: db.buzon.correoAl,
    alAvanzar: (hechos, total) => progreso(`Revisando ${hechos} de ${total}…`),
  });
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
  return { acts, revisados, truncado };
}

/* Las respuestas por correo, solas y sin ventanas. Sólo corre si la pestaña ya
   tiene el permiso de lectura vigente: pedirlo abriría la ventana de Google
   sin que nadie haya pulsado nada, y el navegador la bloquearía igual. Cuando
   el permiso vence —Google lo da por una hora— se renueva al pulsar "Correo". */
let correoEnCurso = null;
function recogerCorreo(db, onImport, onBuzon) {
  if (!db.integrations.email.clientId || !gmailStatus().puedeLeer) return null;
  if (!correoEnCurso) {
    correoEnCurso = (async () => {
      const porDireccion = indiceDirecciones(db);
      if (!porDireccion.size) return 0;
      const { acts } = await bajarCorreos(db, porDireccion);
      const n = onImport(acts);
      onBuzon({ correoAl: nowISO() });
      return n;
    })().finally(() => { correoEnCurso = null; });
  }
  return correoEnCurso;
}

async function correrBarrido({ db, progreso = () => {}, onImport, onBuzon, onLeerBandeja, onEventos, onRebotes, onLeads, onWhatsApp }) {
  const integ = db.integrations;
  const mide = midiendo(integ.medicion);
  /* Los anuncios sólo entran si hay puente y alguna plataforma encendida.
     Media configuración no se intenta: daría un error por cada barrido. */
  const anun = integ.anuncios;
  const trayendoLeads = Boolean(onLeads && integ.puente.base && integ.puente.clave && (anun.meta || anun.google));
  const conWa = Boolean(onWhatsApp && integ.whatsapp.modo === "api" && integ.puente.base && integ.puente.clave);

  const porDireccion = indiceDirecciones(db);

  const fichasDe = (correo) => {
    const contactIds = [], companyIds = [];
    (porDireccion.get(String(correo || "").toLowerCase()) || [])
      .forEach(({ kind, id }) => (kind === "contact" ? contactIds : companyIds).push(id));
    return { contactIds: [...new Set(contactIds)], companyIds: [...new Set(companyIds)] };
  };

  const conGmail = Boolean(integ.email.clientId) && porDireccion.size > 0;

  /* Si no hay nada que barrer por ningún lado, se dice cuál es el estorbo en
     vez de devolver un "0 correos nuevos" que parecería una respuesta. */
  if (!conGmail && !mide && !trayendoLeads && !conWa) {
    if (!integ.email.clientId) throw new Error("Falta el ID de cliente de Google. Pégalo en Conexiones.");
    throw new Error("Ningún contacto ni empresa tiene correo guardado: no hay con quién cruzar la bandeja.");
  }

  const notas = [];
  const marca = {};
  let nuevos = 0, revisados = 0, rebotados = 0, movidos = 0, leads = 0, fichas = 0, wa = 0;

  /* Lo mismo cuando sí hay otras fuentes: el barrido seguiría con ellas y el
     aviso hablaría de WhatsApp o de leads sin mencionar el correo, como si la
     bandeja se hubiera revisado y no hubiera respuestas. */
  if (!conGmail) {
    notas.push(integ.email.clientId
      ? "Correo: ningún contacto ni empresa tiene correo guardado, no hay con quién cruzar la bandeja."
      : "Correo sin revisar: falta el ID de cliente de Google en Conexiones.");
  }

  if (conWa) {
    progreso("Preguntando por WhatsApp…");
    try {
      const r = await recogerWhatsApp(db, onWhatsApp, onBuzon);
      if (r) { wa = r.mensajes; fichas += r.fichas; }
    } catch (e) {
      notas.push(`WhatsApp: ${(e && e.message) || String(e)}`);
    }
  }

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
    const { acts, revisados: rev, truncado } = await bajarCorreos(db, porDireccion, progreso);
    revisados = rev;

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
      fichas += hecho.fichas;
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
  return { nuevos, revisados, rebotados, movidos, leads, fichas, wa, notas, mide, conGmail, trayendoLeads, conWa };
}

/* Resumen de una pasada, en una línea. */
function resumenBarrido({ nuevos, revisados, rebotados, movidos, leads, fichas, wa, conGmail, trayendoLeads, conWa }) {
  const trozos = [];
  if (conWa) trozos.push(wa ? `${wa} WhatsApp nuevo(s)` : "Sin WhatsApp nuevos");
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

function MessagesView({ db, setDb, say, setDetail, setView, onLog, onImport, onBuzon, onVisto, onLeerBandeja, onEventos, onRebotes, onLeads, onWhatsApp }) {
  const integ = db.integrations;
  const conversaciones = useMemo(() => construirConversaciones(db), [db]);

  const [sel, setSel] = useState("");
  const [buscar, setBuscar] = useState("");
  const [filtro, setFiltro] = useState("all");
  const [sync, setSync] = useState({ busy: false, nota: "", err: "" });
  const [seccion, setSeccion] = useState("chats");

  /* Igual que en Contactos: la casilla responde al instante y la lista se
     filtra un paso detrás, y se pintan de a 100. */
  const buscarDiferido = React.useDeferredValue(buscar);
  const [limite, setLimite] = useState(100);
  useEffect(() => { setLimite(100); }, [buscarDiferido, filtro]);
  const filtradas = useMemo(() => {
    const q = norm(buscarDiferido);
    return conversaciones.filter((c) => {
      if (filtro === "nuevos" && !c.nuevos) return false;
      if ((filtro === "whatsapp" || filtro === "email") && !c.canales.includes(filtro)) return false;
      if (!q) return true;
      return norm(`${c.nombre} ${c.rec.props.email || ""} ${c.rec.props.phone || ""} ${resumen(c.ultimo)}`).includes(q);
    });
  }, [conversaciones, buscarDiferido, filtro]);

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
        onImport, onBuzon, onLeerBandeja, onEventos, onRebotes, onLeads, onWhatsApp,
      });
      setSync({ busy: false, nota: r.notas.join(" · "), err: "" });
      say(resumenBarrido(r));
    } catch (e) {
      setSync({ busy: false, nota: "", err: (e && e.message) || String(e) });
    }
  };

  const sinNada = conversaciones.length === 0;

  if (seccion === "agentes") return <AgentesView db={db} setDb={setDb} say={say} seccion={seccion} setSeccion={setSeccion} />;

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

          <SeccionMensajes seccion={seccion} setSeccion={setSeccion} agentes={db.agentes || []} />

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
          {filtradas.slice(0, limite).map((c) => {
            const on = c.clave === sel;
            const ch = CHANNEL[c.ultimo.type];
            const quien = agenteDe(db, c.kind, c.rec);
            return (
              <button key={c.clave} onClick={() => setSel(c.clave)} className={on ? "" : "crm-row"}
                style={{ display: "flex", gap: 10, width: "100%", textAlign: "left", padding: "11px 14px", borderTop: "none", borderRight: "none", borderBottom: "1px solid #F2F4F0", borderLeft: `3px solid ${on ? C.jade : "transparent"}`, background: on ? C.jadeSoft : "transparent", cursor: "pointer" }}>
                <div style={{ width: 32, height: 32, borderRadius: 99, flexShrink: 0, background: tonoDe(c.nombre), color: "#fff", display: "grid", placeItems: "center", fontFamily: "var(--ui)", fontSize: 11.5, fontWeight: 600 }}>
                  {iniciales(c.nombre)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ flex: 1, minWidth: 0, fontFamily: "var(--ui)", fontSize: 13, fontWeight: c.nuevos ? 700 : 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nombre}</span>
                    {quien.humano && <Headset size={11} color={C.clay} style={{ flexShrink: 0, alignSelf: "center" }}><title>Atiende una persona</title></Headset>}
                    {quien.agente && <Bot size={11} color={C.jade} style={{ flexShrink: 0, alignSelf: "center" }}><title>{nombreAgente(quien.agente)}</title></Bot>}
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
          {filtradas.length > limite && (
            <div style={{ padding: "12px 14px", textAlign: "center" }}>
              <Btn size="sm" variant="outline" onClick={() => setLimite((n) => n + 100)}>Mostrar 100 más ({filtradas.length - limite} restantes)</Btn>
            </div>
          )}
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
        ? <Conversacion key={activa.clave} conv={activa} db={db} setDb={setDb} say={say} setDetail={setDetail} onLog={onLog} />
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

/* ────────────────────────────────────────────────────────────
   Agentes en Mensajes
   Cada conversación tiene a lo sumo un agente: el que se le fijó a mano o, si
   no, el primero de la lista que esté encendido y cuyas condiciones cumpla la
   ficha. "Atiende una persona" apaga a todos para ese hilo.

   Hoy el agente propone y una persona envía: corre en esta pestaña, como todo
   lo demás. Que conteste solo, con el CRM cerrado, es trabajo del Worker.
   ──────────────────────────────────────────────────────────── */
const claveConv = (kind, id) => `${kind}:${id}`;

/* Las condiciones se escriben sobre las propiedades de un contacto: una
   empresa no tiene etapa de persona y queda sin agente salvo que se le fije. */
function agentePorEtapa(db, kind, rec) {
  if (kind !== "contact") return null;
  return (db.agentes || []).find((a) => a.activo
    && cumpleFiltros(rec, a.filtros.filter((c) => c.key), db.schema.contact)) || null;
}

function agenteDe(db, kind, rec) {
  const fijo = (db.agentesChat || {})[claveConv(kind, rec.id)];
  if (fijo === HUMANO) return { humano: true, fijo: true };
  const a = fijo && (db.agentes || []).find((x) => x.id === fijo);
  if (a) return { agente: a, fijo: true };
  const porEtapa = agentePorEtapa(db, kind, rec);
  return porEtapa ? { agente: porEtapa } : {};
}

const nombreAgente = (a) => a.nombre.trim() || "Agente sin nombre";

/* Pide al agente el próximo mensaje para esta ficha. Usa el agente tal como
   se le pasa —también uno a medio editar—, que es lo que deja probarlo antes
   de guardarlo. */
async function pedirAlAgente(db, agente, kind, rec, indicaciones = "") {
  const tiene = (a) => (a.contactIds || []).includes(rec.id) || (a.companyIds || []).includes(rec.id);
  const acts = db.activities.filter(tiene).sort((a, b) => (a.at < b.at ? 1 : -1));
  const deals = db.deals.filter((d) => (d.contactIds || []).includes(rec.id) || d.companyId === rec.id);
  const { nombre, etapa, objetivo, instrucciones, traspaso } = agente;
  const r = await fetch("/api/claude", {
    method: "POST",
    redirect: "manual",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-Origen": "agente" },
    body: JSON.stringify({
      tarea: "agente", pregunta: indicaciones,
      agente: { nombre, etapa, objetivo, instrucciones, traspaso },
      ficha: fichaParaClaude(db, kind, rec, acts, deals),
    }),
  });
  if (r.type === "opaqueredirect" || r.status === 401) throw new Error("La sesión del CRM venció. Recarga la página para volver a entrar.");
  if (!(r.headers.get("Content-Type") || "").includes("application/json")) throw new Error("Los agentes sólo funcionan en la versión publicada del CRM.");
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
  return { texto: data.texto || "", traspaso: data.traspaso || "" };
}

const fijarAgenteChat = (setDb, clave, valor) => setDb((d) => {
  const m = { ...(d.agentesChat || {}) };
  if (valor) m[clave] = valor; else delete m[clave];
  return { ...d, agentesChat: m };
});

/* Conversaciones | Agentes, arriba de la columna izquierda en las dos vistas. */
function SeccionMensajes({ seccion, setSeccion, agentes }) {
  const encendidos = agentes.filter((a) => a.activo).length;
  return (
    <div style={{ display: "flex", background: "#EEF1EB", borderRadius: 8, padding: 3, marginTop: 12 }}>
      {[["chats", "Conversaciones", Inbox], ["agentes", "Agentes", Bot]].map(([k, l, I]) => {
        const on = seccion === k;
        return (
          <button key={k} onClick={() => setSeccion(k)} className="crm-btn"
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, border: "none", borderRadius: 6, padding: "5px 8px", background: on ? C.panel : "transparent", boxShadow: on ? "0 1px 2px rgba(19,28,26,.12)" : "none", color: on ? C.ink : C.mute, fontFamily: "var(--ui)", fontSize: 12, fontWeight: on ? 600 : 500, cursor: "pointer" }}>
            <I size={12} /> {l}
            {k === "agentes" && agentes.length > 0 && (
              <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: C.faint }}>{encendidos}/{agentes.length}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* En el encabezado del hilo: quién atiende y, para cambiarlo, el mismo menú. */
function SelectorAgente({ db, setDb, kind, rec }) {
  const clave = claveConv(kind, rec.id);
  const fijo = (db.agentesChat || {})[clave] || "";
  const quien = agenteDe(db, kind, rec);
  const porEtapa = agentePorEtapa(db, kind, rec);
  const color = quien.humano ? C.clay : quien.agente ? C.jade : C.faint;
  return (
    <label title="Qué agente atiende esta conversación"
      style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${C.line}`, borderRadius: 999, padding: "2px 4px 2px 10px", background: C.panel, maxWidth: 260 }}>
      {quien.humano ? <Headset size={13} color={color} /> : <Bot size={13} color={color} />}
      <select className="crm-in" value={fijo} onChange={(e) => fijarAgenteChat(setDb, clave, e.target.value)}
        style={{ border: "none", background: "transparent", fontFamily: "var(--ui)", fontSize: 12, color: C.ink, padding: "3px 4px", outline: "none", minWidth: 0, maxWidth: 220, cursor: "pointer" }}>
        <option value="">{porEtapa ? `Según la etapa: ${nombreAgente(porEtapa)}` : "Según la etapa: ninguno"}</option>
        {(db.agentes || []).map((a) => (
          <option key={a.id} value={a.id}>{nombreAgente(a)}{a.etapa ? ` · ${a.etapa}` : ""}{a.activo ? "" : " (apagado)"}</option>
        ))}
        <option value={HUMANO}>Atiende una persona</option>
      </select>
    </label>
  );
}

function AgentesView({ db, setDb, say, seccion, setSeccion }) {
  const agentes = db.agentes || [];
  const [sel, setSel] = useState(() => (agentes[0] || {}).id || "");
  const actual = agentes.find((a) => a.id === sel) || null;

  useEffect(() => {
    if (!actual && agentes.length) setSel(agentes[0].id);
  }, [actual, agentes.length]);

  const conversaciones = useMemo(() => construirConversaciones(db), [db]);
  /* Cuántas conversaciones atiende hoy cada agente, contando lo fijado a mano. */
  const carga = useMemo(() => {
    const n = {};
    let personas = 0;
    for (const c of conversaciones) {
      const q = agenteDe(db, c.kind, c.rec);
      if (q.humano) personas++;
      else if (q.agente) n[q.agente.id] = (n[q.agente.id] || 0) + 1;
    }
    return { n, personas };
  }, [conversaciones, db.agentes, db.agentesChat]);

  const guardar = (a) => setDb((d) => ({ ...d, agentes: (d.agentes || []).map((x) => (x.id === a.id ? normalizaAgente(a) : x)) }));
  const crear = (a) => {
    setDb((d) => ({ ...d, agentes: [...(d.agentes || []), a] }));
    setSel(a.id);
  };
  const crearBase = () => {
    const nuevos = agentesDeBase();
    setDb((d) => ({ ...d, agentes: [...(d.agentes || []), ...nuevos] }));
    setSel(nuevos[0].id);
    say("Cuatro agentes creados, apagados. Revísalos y enciende los que quieras.");
  };
  const borrar = (id) => {
    setDb((d) => {
      const resto = (d.agentes || []).filter((x) => x.id !== id);
      return { ...d, agentes: resto, agentesChat: normalizeAgentesChat(d.agentesChat, resto) };
    });
    say("Agente eliminado");
  };
  const mover = (i, paso) => setDb((d) => {
    const l = [...(d.agentes || [])];
    const j = i + paso;
    if (j < 0 || j >= l.length) return d;
    [l[i], l[j]] = [l[j], l[i]];
    return { ...d, agentes: l };
  });
  const alternar = (a) => {
    guardar({ ...a, activo: !a.activo });
    say(a.activo ? `${nombreAgente(a)} apagado` : `${nombreAgente(a)} encendido`);
  };

  return (
    <div style={{ display: "flex", height: "100vh", minWidth: 0 }}>
      <div style={{ width: 316, flexShrink: 0, borderRight: `1px solid ${C.line}`, background: C.panel, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "18px 16px 12px", borderBottom: `1px solid ${C.line}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: C.faint, letterSpacing: ".1em", textTransform: "uppercase" }}>
                {agentes.length} agente{agentes.length === 1 ? "" : "s"}
              </div>
              <h1 style={{ fontFamily: "var(--display)", fontSize: 21, fontWeight: 600, letterSpacing: "-.02em", margin: "3px 0 0" }}>Mensajes</h1>
            </div>
            <Btn size="sm" variant="outline" Icon={Plus} onClick={() => crear(agenteVacio())}>Nuevo</Btn>
          </div>
          <SeccionMensajes seccion={seccion} setSeccion={setSeccion} agentes={agentes} />
        </div>

        <div style={{ padding: "9px 16px", borderBottom: `1px solid ${C.line}`, background: "#F6F8F4", fontFamily: "var(--ui)", fontSize: 11.5, color: C.mute, lineHeight: 1.5 }}>
          A cada conversación la atiende el primero de arriba hacia abajo que esté encendido y cuyas condiciones cumpla.
          {carga.personas > 0 && <> {carga.personas} conversación(es) las atiende una persona.</>}
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {agentes.map((a, i) => {
            const on = a.id === sel;
            return (
              <div key={a.id} onClick={() => setSel(a.id)} className={on ? "" : "crm-row"}
                style={{ display: "flex", gap: 10, alignItems: "center", padding: "11px 10px 11px 14px", borderBottom: "1px solid #F2F4F0", borderLeft: `3px solid ${on ? C.jade : "transparent"}`, background: on ? C.jadeSoft : "transparent", cursor: "pointer" }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: C.faint, width: 14, textAlign: "right", flexShrink: 0 }}>{i + 1}</span>
                <div style={{ width: 30, height: 30, borderRadius: 99, flexShrink: 0, background: a.activo ? tonoDe(a.id) : "#D9DED5", color: "#fff", display: "grid", placeItems: "center" }}>
                  <Bot size={15} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--ui)", fontSize: 13, fontWeight: 600, color: a.activo ? C.ink : C.mute, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nombreAgente(a)}</div>
                  <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, color: C.mute, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {[a.etapa || "Sin etapa", a.activo ? `${carga.n[a.id] || 0} conversación(es)` : "Apagado"].join(" · ")}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="crm-btn" disabled={i === 0} onClick={() => mover(i, -1)} title="Subir: gana si cumple a la vez que otro"
                    style={{ border: "none", background: "transparent", color: C.faint, cursor: i === 0 ? "default" : "pointer", padding: 1, opacity: i === 0 ? 0.3 : 1, display: "inline-flex" }}><ArrowUp size={12} /></button>
                  <button type="button" className="crm-btn" disabled={i === agentes.length - 1} onClick={() => mover(i, 1)} title="Bajar"
                    style={{ border: "none", background: "transparent", color: C.faint, cursor: i === agentes.length - 1 ? "default" : "pointer", padding: 1, opacity: i === agentes.length - 1 ? 0.3 : 1, display: "inline-flex" }}><ArrowDown size={12} /></button>
                </div>
              </div>
            );
          })}
          {agentes.length === 0 && (
            <div style={{ padding: "30px 18px", textAlign: "center", fontFamily: "var(--ui)", fontSize: 12.5, color: C.faint, lineHeight: 1.6 }}>
              Todavía no hay agentes.
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0, overflowY: "auto", background: C.canvas }}>
        {actual
          ? <EditorAgente key={actual.id} db={db} agente={actual} indice={agentes.indexOf(actual)} conversaciones={conversaciones}
              onGuardar={(a) => { guardar(a); say("Agente guardado"); }}
              onAlternar={() => alternar(actual)}
              onBorrar={() => borrar(actual.id)} />
          : (
            <div style={{ height: "100%", display: "grid", placeItems: "center", padding: 24 }}>
              <div style={{ textAlign: "center", maxWidth: 440 }}>
                <Bot size={30} color={C.faint} />
                <div style={{ fontFamily: "var(--display)", fontSize: 16, fontWeight: 600, marginTop: 12 }}>Un agente para cada momento</div>
                <div style={{ fontFamily: "var(--ui)", fontSize: 13, color: C.mute, marginTop: 6, lineHeight: 1.6 }}>
                  Cada agente atiende a las personas de una etapa —prospecto, lead en curso, cliente, post venta— con su propio objetivo y su forma de hablar, y pasa la conversación a una persona cuando no le corresponde.
                </div>
                <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                  <Btn variant="outline" Icon={Plus} onClick={() => crear(agenteVacio())}>En blanco</Btn>
                  <Btn variant="solid" Icon={Sparkles} onClick={crearBase}>Crear los de las 4 etapas</Btn>
                </div>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}

function EditorAgente({ db, agente, indice, conversaciones, onGuardar, onAlternar, onBorrar }) {
  const [draft, setDraft] = useState(agente);
  /* Encender o apagar desde arriba no debe borrar lo que se está editando. */
  useEffect(() => { setDraft((d) => ({ ...d, activo: agente.activo })); }, [agente.activo]);
  const cambiado = JSON.stringify({ ...draft, activo: agente.activo }) !== JSON.stringify(agente);
  const set = (parche) => setDraft((d) => ({ ...d, ...parche }));
  const setFiltros = (fn) => setDraft((d) => ({ ...d, filtros: typeof fn === "function" ? fn(d.filtros) : fn }));

  const schema = db.schema.contact;
  const condiciones = draft.filtros.filter((c) => c.key);
  const cumplen = useMemo(
    () => db.contacts.filter((r) => cumpleFiltros(r, condiciones, schema)).length,
    [db.contacts, draft.filtros, schema]);

  /* Para probar: las conversaciones de contactos, primero las que le tocan. */
  const deContactos = conversaciones.filter((c) => c.kind === "contact");
  const suyas = deContactos.filter((c) => cumpleFiltros(c.rec, condiciones, schema));
  const opciones = [...suyas, ...deContactos.filter((c) => !suyas.includes(c))].slice(0, 200);
  const [prueba, setPrueba] = useState({ clave: "", indicaciones: "", busy: false, texto: "", traspaso: "", err: "" });
  const conv = opciones.find((c) => c.clave === prueba.clave) || opciones[0] || null;

  const probar = async () => {
    if (!conv) return;
    setPrueba((p) => ({ ...p, busy: true, texto: "", traspaso: "", err: "" }));
    try {
      const r = await pedirAlAgente(db, draft, conv.kind, conv.rec, prueba.indicaciones);
      setPrueba((p) => ({ ...p, busy: false, ...r }));
    } catch (e) {
      setPrueba((p) => ({ ...p, busy: false, err: (e && e.message) || String(e) }));
    }
  };

  const etiqueta = (t) => <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, fontWeight: 600, color: C.mute, marginBottom: 5, letterSpacing: ".02em" }}>{t}</div>;
  const ayuda = (t) => <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, color: C.faint, marginTop: 4, lineHeight: 1.5 }}>{t}</div>;
  const area = (k, filas, ph) => (
    <textarea className="crm-in" rows={filas} value={draft[k]} placeholder={ph} onChange={(e) => set({ [k]: e.target.value })}
      style={{ ...inputStyle, resize: "vertical", lineHeight: 1.55 }} />
  );
  const tarjeta = { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 9, padding: 18 };

  return (
    <div style={{ padding: "22px 28px 40px", maxWidth: 860, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: C.faint, letterSpacing: ".1em", textTransform: "uppercase" }}>
            Prioridad {indice + 1} · {agente.activo ? "Encendido" : "Apagado"}
          </div>
          <div style={{ fontFamily: "var(--display)", fontSize: 20, fontWeight: 600, letterSpacing: "-.02em", marginTop: 3 }}>{nombreAgente(draft)}</div>
        </div>
        <Btn variant="outline" Icon={agente.activo ? Pause : Play} onClick={onAlternar}>{agente.activo ? "Apagar" : "Encender"}</Btn>
        <Btn variant="danger" Icon={Trash2} onClick={onBorrar}>Eliminar</Btn>
        <Btn variant="solid" Icon={Check} disabled={!cambiado} onClick={() => onGuardar({ ...draft, activo: agente.activo })}>Guardar</Btn>
      </div>

      <div style={tarjeta}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label>{etiqueta("Nombre")}
            <input className="crm-in" value={draft.nombre} placeholder="Luna" onChange={(e) => set({ nombre: e.target.value })} style={inputStyle} />
          </label>
          <label>{etiqueta("Etapa que atiende")}
            <input className="crm-in" value={draft.etapa} list="etapas-agente" placeholder="Prospecto" onChange={(e) => set({ etapa: e.target.value })} style={inputStyle} />
            <datalist id="etapas-agente">{ETAPAS_AGENTE.map((x) => <option key={x} value={x} />)}</datalist>
          </label>
        </div>
        <div style={{ marginTop: 12 }}>{etiqueta("Objetivo")}{area("objetivo", 2, "Qué tiene que lograr con cada persona.")}</div>
        <div style={{ marginTop: 12 }}>
          {etiqueta("Instrucciones")}
          {area("instrucciones", 7, "Tono, cómo se presenta, qué puede ofrecer, precios, enlaces, qué nunca debe decir…")}
          {ayuda("Lo que no esté aquí ni en la ficha, el agente no lo sabe: no inventa precios, fechas ni enlaces.")}
        </div>
        <div style={{ marginTop: 12 }}>{etiqueta("Cuándo pasa la conversación a una persona")}{area("traspaso", 2, "")}</div>
      </div>

      <div style={tarjeta}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontFamily: "var(--display)", fontSize: 14, fontWeight: 600 }}>Cuándo le toca</div>
          <span style={{ fontFamily: "var(--ui)", fontSize: 12, color: C.mute }}>
            <strong style={{ color: C.ink }}>{cumplen}</strong> de {db.contacts.length} contactos cumplen hoy
          </span>
        </div>
        {ayuda(condiciones.length
          ? "Atiende a los contactos que cumplan todas estas condiciones, salvo que un agente de más arriba también las cumpla."
          : "Sin condiciones atiende a todos los contactos que no haya tomado un agente de más arriba. Ponlo al final de la lista o agrégale condiciones.")}
        <FiltrosPropiedad schema={schema} rows={db.contacts} filtros={draft.filtros} setFiltros={setFiltros} />
      </div>

      <div style={tarjeta}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--display)", fontSize: 14, fontWeight: 600 }}>
          <Sparkles size={14} color={C.plum} /> Probar
        </div>
        {ayuda("Escribe lo que este agente le contestaría a una conversación real, con lo que tengas aquí aunque no esté guardado. No se envía nada.")}
        {!conv ? (
          <div style={{ fontFamily: "var(--ui)", fontSize: 12.5, color: C.faint, marginTop: 10 }}>Todavía no hay conversaciones con contactos para probar.</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <select className="crm-in" value={conv.clave} onChange={(e) => setPrueba((p) => ({ ...p, clave: e.target.value, texto: "", traspaso: "", err: "" }))}
                style={{ ...inputStyle, flex: "1 1 220px", width: "auto" }}>
                {opciones.map((c) => <option key={c.clave} value={c.clave}>{c.nombre}{suyas.includes(c) ? "" : " (no le toca)"}</option>)}
              </select>
              <input className="crm-in" value={prueba.indicaciones} placeholder="Indicaciones para esta prueba (opcional)"
                onChange={(e) => setPrueba((p) => ({ ...p, indicaciones: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter" && !prueba.busy) probar(); }}
                style={{ ...inputStyle, flex: "2 1 260px", width: "auto" }} />
              <Btn variant="solid" Icon={Bot} disabled={prueba.busy} onClick={probar}>{prueba.busy ? "Pensando…" : "Probar"}</Btn>
            </div>
            {conv.ultimo && (
              <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, color: C.faint, marginTop: 8 }}>
                Último mensaje ({conv.ultimo.dir === "in" ? "recibido" : "enviado"}): {resumen(conv.ultimo).slice(0, 160)}
              </div>
            )}
            {prueba.texto && (
              <div style={{ marginTop: 12, background: CHANNEL.whatsapp.soft, borderRadius: "10px 10px 3px 10px", padding: "10px 13px", fontFamily: "var(--ui)", fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap", color: C.ink }}>
                {prueba.texto}
              </div>
            )}
            {prueba.traspaso && (
              <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "flex-start", background: C.claySoft, borderRadius: 8, padding: "10px 13px", fontFamily: "var(--ui)", fontSize: 12.5, color: C.clay, lineHeight: 1.5 }}>
                <Headset size={14} style={{ flexShrink: 0, marginTop: 2 }} /> Pasaría la conversación a una persona: {prueba.traspaso}
              </div>
            )}
            {prueba.err && <div style={{ marginTop: 10, fontFamily: "var(--ui)", fontSize: 12, color: C.clay }}>{prueba.err}</div>}
          </>
        )}
      </div>

      <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, color: C.faint, lineHeight: 1.6 }}>
        Por ahora el agente propone el mensaje dentro de cada conversación y una persona lo revisa y lo envía. Que conteste solo por WhatsApp, también con el CRM cerrado, es el siguiente paso.
      </div>
    </div>
  );
}

/* ── Un hilo abierto ──
   Lo recibido a la izquierda y lo enviado a la derecha, como en cualquier
   chat, con el color del canal por el que fue. Las llamadas y las notas
   aparecen en el medio y en pequeño: son parte de la relación pero no del
   intercambio de mensajes, y mezclarlas como globos haría creer que se le
   escribió algo a la persona. */
function Conversacion({ conv, db, setDb, say, setDetail, onLog }) {
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

  /* El agente que atiende este hilo propone la respuesta; se escribe en la
     caja para que una persona la lea, la corrija y la envíe. */
  const quien = agenteDe(db, kind, rec);
  const [sugerencia, setSugerencia] = useState({ busy: false, traspaso: "" });
  const sugerir = async () => {
    if (!quien.agente) return;
    setErr("");
    setSugerencia({ busy: true, traspaso: "" });
    try {
      const r = await pedirAlAgente(db, quien.agente, kind, rec);
      setSugerencia({ busy: false, traspaso: r.traspaso });
      if (r.texto) { setTexto(r.texto); setTid(""); setHtml(""); }
    } catch (e) {
      setSugerencia({ busy: false, traspaso: "" });
      setErr((e && e.message) || String(e));
    }
  };

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

  const registrarSalida = (cuerpo, asuntoFinal, trk, gid) => onLog({
    type: canalReal, dir: "out",
    subject: asuntoFinal || (esCorreo ? "Correo" : "Mensaje de WhatsApp"),
    body: cuerpo,
    ...(trk ? { trk } : {}),
    /* Con el identificador de Gmail el barrido lo reconoce en Enviados y no
       lo duplica en el hilo. */
    ...(gid ? { gmailId: gid } : {}),
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
      setBusy(true);
      const r = await mandarWhatsApp(integ, rec.props.phone, cuerpo);
      setBusy(false);
      if (!r.ok) { setErr(r.err); return; }
      registrarSalida(cuerpo);
      limpiar();
      say(r.solo ? "WhatsApp enviado" : "WhatsApp abierto y registrado");
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
        const gid = await sendGmail({ to: correo, subject: asu, body: cuerpo, html, clientId: integ.email.clientId });
        registrarSalida(cuerpo, asu, trk, gid);
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
        <SelectorAgente db={db} setDb={setDb} kind={kind} rec={rec} />
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
              {modo === "responder" && quien.agente && (
                <Btn size="sm" variant="outline" Icon={Bot} disabled={sugerencia.busy} onClick={sugerir}
                  style={{ borderRadius: 999, marginLeft: "auto" }}>
                  {sugerencia.busy ? "Pensando…" : `Sugerir con ${nombreAgente(quien.agente)}`}
                </Btn>
              )}
            </div>

            {sugerencia.traspaso && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", background: C.claySoft, borderRadius: 8, padding: "8px 11px", marginBottom: 8, fontFamily: "var(--ui)", fontSize: 12, color: C.clay, lineHeight: 1.5 }}>
                <Headset size={13} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 180 }}>{quien.agente ? nombreAgente(quien.agente) : "El agente"} prefiere que conteste una persona: {sugerencia.traspaso}</span>
                <Btn size="sm" variant="outline" onClick={() => { fijarAgenteChat(setDb, conv.clave, HUMANO); setSugerencia({ busy: false, traspaso: "" }); say("La conversación queda en manos de una persona"); }}>Tomarla yo</Btn>
              </div>
            )}

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
  const [nota, setNota] = useState("");
  const html = value || "";
  const kb = pesoKb(html);

  /* Qué hay dentro, para poder avisar con números en vez de con un "conviene
     aligerarlo" a secas: cuánto es peso muerto, cuánto son imágenes pegadas
     dentro del propio archivo y si la pieza necesita JavaScript para verse. */
  const info = useMemo(() => analizarHtml(html), [html]);
  const kbMuerto = Math.round(info.muerto / 1024);
  const kbImagenes = Math.round(info.imagenes / 1024);
  /* Lo que Gmail mira para decidir si recorta es el cuerpo del mensaje, y las
     fotos incrustadas ya no viajan en el cuerpo: salen como partes aparte (ver
     buildMime). Así que el aviso de "mensaje recortado" se mide sobre lo que
     de verdad va a ir en el cuerpo, no sobre lo que pesa el archivo. */
  const kbCuerpo = Math.max(0, Math.round((info.total - info.muerto - info.imagenes) / 1024));
  /* ¿Este archivo es en realidad una página web que trae el correo escondido
     dentro? Si lo es, se puede abrir y quedarse con la pieza buena. */
  const empaquetado = useMemo(() => desempaquetarHtml(html) !== html, [html]);

  /* Abrir el envoltorio: cambia una página que llegaría en blanco por el correo
     que traía dentro. Se dice qué pasó, porque lo que queda anexado ya no es el
     archivo que la persona tiene en el disco. */
  const desempaquetar = (crudo) => {
    const dentro = aligerarHtml(desempaquetarHtml(crudo));
    onChange(dentro);
    setErr("");
    setNota("Este archivo era una página que se dibujaba con JavaScript: llegaría en blanco. Dentro traía el correo de verdad —tablas y estilos, sin scripts— y es el que quedó anexado, con sus imágenes.");
    setTab("diseno");
  };

  /* Aligerar es quitar lo que ningún lector de correo iba a ejecutar, así que
     no cambia lo que llega: cambia lo que pesa. Se dice cuánto se fue, para que
     nadie tenga que descubrir por su cuenta que lo anexado no es byte a byte
     el archivo que tiene en el disco. */
  const aligerar = (crudo) => {
    const limpio = aligerarHtml(crudo);
    const menos = pesoKb(crudo) - pesoKb(limpio);
    onChange(limpio);
    setNota(menos >= 1
      ? `Se quitaron ${menos} KB de scripts y comentarios: ningún lector de correo los ejecuta, sólo hacían pesar el correo.`
      : "");
  };

  const cargar = (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = ""; // permite volver a cargar el mismo archivo tras editarlo
    if (!f) return;
    setErr(""); setNota("");
    /* El tope ya no es el que aguanta el cuerpo del correo —las fotos salen
       como partes aparte y no cuentan para el recorte—, sino el que aguanta el
       envío: la API de Gmail recibe el mensaje entero en una sola petición y lo
       codificado pesa un tercio más, así que 3 MB de archivo es el límite
       cómodo. El peso del cuerpo se avisa aparte, más abajo. */
    if (f.size > 3_000_000) {
      setErr("El archivo pesa más de 3 MB y Gmail no acepta un envío así. Casi siempre es una sola foto sin comprimir: exporta la pieza con la imagen más liviana y vuelve a anexarla.");
      return;
    }
    const fr = new FileReader();
    fr.onload = () => {
      const crudo = String(fr.result || "");
      /* Un archivo exportado de una herramienta web trae el correo escondido
         dentro: se saca al vuelo, para que nadie anexe una página en blanco
         sin enterarse. */
      if (desempaquetarHtml(crudo) !== crudo) { desempaquetar(crudo); return; }
      aligerar(crudo); setTab("diseno");
    };
    fr.onerror = () => setErr("No se pudo leer el archivo.");
    fr.readAsText(f, "UTF-8");
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, fontWeight: 600, color: C.mute, letterSpacing: ".02em", flex: 1 }}>
          DISEÑO HTML (OPCIONAL)
        </div>
        {html && <Pill color={kb > 100 ? C.amber : C.blue} soft={kb > 100 ? C.amberSoft : C.blueSoft}>{kb} KB</Pill>}
        <input ref={input} type="file" accept=".html,.htm,text/html" onChange={cargar} style={{ display: "none" }} />
        <Btn size="sm" variant="outline" Icon={Paperclip} onClick={() => input.current && input.current.click()}>
          {html ? "Reemplazar archivo" : "Anexar archivo .html"}
        </Btn>
        {html && <Btn size="sm" variant="ghost" Icon={Trash2} onClick={() => { setErr(""); setNota(""); onChange(""); }}>Quitar</Btn>}
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
            : <textarea className="crm-in" rows={10} value={html}
                onChange={(e) => {
                  const v = e.target.value;
                  if (desempaquetarHtml(v) !== v) { desempaquetar(v); return; }
                  setNota(""); onChange(v);
                }} spellCheck={false}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "var(--mono)", fontSize: 12, lineHeight: 1.5 }} />}

          {nota && (
            <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, color: C.jade, marginTop: 6, lineHeight: 1.5 }}>{nota}</div>
          )}

          {/* Lo primero que hay que decir, porque no se arregla aligerando: una
              pieza que se dibuja con JavaScript llega en blanco. La vista previa
              de arriba lo muestra tal cual —el iframe tampoco ejecuta scripts—,
              pero conviene decirlo con todas las letras antes de que salga. */}
          {info.enBlanco && (
            <div style={{ background: C.claySoft, borderRadius: 6, padding: "9px 11px", marginTop: 7, fontFamily: "var(--ui)", fontSize: 12, color: C.clay, lineHeight: 1.55 }}>
              Este diseño se dibuja con JavaScript y ningún lector de correo lo ejecuta: llegaría en blanco, o con el
              aviso de “esta página necesita JavaScript”. Tal como está, lo único que se leería es el mensaje en texto.
              {empaquetado ? (
                <>
                  <div style={{ marginTop: 6 }}>
                    Pero este archivo trae el correo de verdad guardado dentro —tablas e imágenes, sin scripts—.
                    Se puede sacar y anexar ése.
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Btn size="sm" variant="outline" onClick={() => desempaquetar(html)}>Usar el correo que trae dentro</Btn>
                  </div>
                </>
              ) : (
                <div style={{ marginTop: 6 }}>
                  Exporta la pieza como <b>HTML de correo</b> —tablas e imágenes, sin scripts— o pega aquí la versión
                  que tu herramienta llame “para email”.
                </div>
              )}
            </div>
          )}

          {/* Aligerar sólo se ofrece cuando quitar los scripts no cambia lo que se
              ve. En una página que se dibuja con JavaScript, esos scripts son el
              diseño entero: aligerarla la deja vacía, y ese botón sería una
              trampa. Ahí el camino es el de arriba, sacar el correo de dentro. */}
          {kbMuerto >= 1 && !empaquetado && (
            <div style={{ background: C.amberSoft, borderRadius: 6, padding: "9px 11px", marginTop: 7, fontFamily: "var(--ui)", fontSize: 12, color: C.amber, lineHeight: 1.55 }}>
              {kbMuerto} KB de este diseño son scripts y comentarios que ningún correo ejecuta. Quitarlos no cambia
              lo que se ve.
              <div style={{ marginTop: 8 }}>
                <Btn size="sm" variant="outline" onClick={() => aligerar(html)}>Aligerar</Btn>
              </div>
            </div>
          )}

          {kbCuerpo > 100 && (
            <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, color: C.amber, marginTop: 6, lineHeight: 1.5 }}>
              El cuerpo del correo pesa {kbCuerpo} KB. Gmail recorta los que pasan de ~100 KB y muestra
              “Mensaje recortado”. Conviene aligerarlo.
            </div>
          )}

          {/* Las fotos incrustadas ya no son un problema de peso: salen como
              partes del mensaje, que es además la única forma en que Gmail las
              muestra. Se dice, porque el número de KB de arriba asusta y no
              debería. */}
          {kbImagenes >= 20 && (
            <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, color: C.faint, marginTop: 6, lineHeight: 1.5 }}>
              {kbImagenes} KB de este diseño son imágenes incrustadas. Al enviar por Gmail conectado viajan como
              parte del correo y se ven dentro del mensaje, sin contar para los ~100 KB del recorte.
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
/* El texto de una plantilla de Meta con lo que va en cada variable, para
   verla en el CRM como la leería alguien: "Hola {{nombre}}" en vez de
   "Hola {{1}}". Lo que no tenga dato se deja como estaba. */
const cuerpoConVars = (meta) => meta.cuerpo.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (m, k) => {
  const v = meta.vars.find((x) => x.clave === k);
  return v && v.valor ? v.valor : m;
});

const DATOS_PLANTILLA = ["{{nombre}}", "{{apellido}}", "{{institucion}}", "{{empresa}}", "{{correo}}", "{{telefono}}"];

/* El enlace de una plantilla del CRM con una aprobada en Meta. Las de Meta se
   piden al puente cuando se abre esto, no antes: cambian poco y pedirlas en
   cada visita a Plantillas sería preguntar por nada. */
function EnlaceMetaWa({ db, draft, setDraft }) {
  const pu = db.integrations.puente;
  const [lista, setLista] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const meta = draft.meta;

  const traer = async () => {
    setBusy(true); setErr("");
    try { setLista((await traerPlantillasWa({ base: pu.base, clave: pu.clave })).plantillas || []); }
    catch (e) { setErr((e && e.message) || String(e)); }
    setBusy(false);
  };

  const poner = (m) => setDraft({ ...draft, meta: m, body: m ? cuerpoConVars(m) : draft.body });

  const elegir = (clave) => {
    const p = (lista || []).find((x) => `${x.nombre}|${x.idioma}` === clave);
    if (!p) return;
    /* La primera variable casi siempre es el nombre de quien recibe; las
       demás se dejan para que se elijan a conciencia. */
    poner(metaWa({
      nombre: p.nombre, idioma: p.idioma, formato: p.formato, cuerpo: p.cuerpo,
      vars: p.vars.map((k, i) => ({ clave: k, valor: VARS_META.includes(k) ? `{{${k}}}` : i === 0 ? "{{nombre}}" : "" })),
      cabecera: p.cabecera, encabezado: p.encabezado, pie: p.pie, botones: p.botones,
    }));
    if (!draft.name.trim()) setDraft((d) => ({ ...d, name: p.nombre }));
  };

  const cajita = { background: "#F4F7F2", border: `1px solid ${C.line}`, borderRadius: 7, padding: "11px 12px" };
  const titulo = { fontFamily: "var(--ui)", fontSize: 11.5, fontWeight: 600, color: C.mute, letterSpacing: ".02em", marginBottom: 6 };

  if (meta) {
    return (
      <div style={cajita}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <div style={{ ...titulo, marginBottom: 0, flex: 1 }}>PLANTILLA APROBADA · {meta.nombre} · {meta.idioma}</div>
          <Btn size="sm" variant="ghost" Icon={X} onClick={() => poner(null)}>Quitar enlace</Btn>
        </div>
        {meta.cabecera === "IMAGE" && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ ...titulo, marginBottom: 4 }}>IMAGEN DEL ENCABEZADO (SALE EN CADA ENVÍO)</div>
            <SubirImagenWa pu={pu} valor={meta.imagen} onCambio={(img) => poner({ ...meta, imagen: img.url })} />
          </div>
        )}
        <VistaWa imagen={meta.imagen} encabezado={meta.encabezado} cuerpo={cuerpoConVars(meta)} pie={meta.pie} botones={meta.botones} />
        {meta.vars.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "7px 10px", alignItems: "center", marginTop: 10 }}>
            {meta.vars.map((v, i) => (
              <React.Fragment key={v.clave}>
                <Mono>{`{{${v.clave}}}`}</Mono>
                <input className="crm-in" list="datos-plantilla" value={v.valor} placeholder="Qué dato va aquí, p. ej. {{nombre}}"
                  onChange={(e) => poner({ ...meta, vars: meta.vars.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)) })}
                  style={{ ...inputStyle, padding: "6px 9px", fontSize: 12.5 }} />
              </React.Fragment>
            ))}
            <datalist id="datos-plantilla">{DATOS_PLANTILLA.map((d) => <option key={d} value={d} />)}</datalist>
          </div>
        )}
        <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, color: C.faint, marginTop: 8, lineHeight: 1.5 }}>
          Cada variable puede ser un dato de la ficha o un texto fijo. Si a alguien le falta el dato, el envío se detiene en esa persona en vez de mandarle un hueco.
        </div>
      </div>
    );
  }

  return (
    <div style={cajita}>
      <div style={titulo}>PLANTILLA APROBADA DE WHATSAPP</div>
      <div style={{ fontFamily: "var(--ui)", fontSize: 12, color: C.mute, lineHeight: 1.55, marginBottom: 8 }}>
        Con WhatsApp conectado, el texto libre sólo le llega a quien te escribió en las últimas 24 horas. Para el
        primer mensaje, enlaza esta plantilla a una que WhatsApp ya aprobó.
      </div>
      {!pu.base || !pu.clave ? (
        <div style={{ fontFamily: "var(--ui)", fontSize: 12, color: C.faint }}>Falta configurar el puente en Conexiones.</div>
      ) : lista === null ? (
        <Btn size="sm" variant="outline" Icon={RefreshCw} disabled={busy} onClick={traer}>{busy ? "Preguntando al puente…" : "Ver mis plantillas aprobadas"}</Btn>
      ) : (
        <select className="crm-in" value="" onChange={(e) => elegir(e.target.value)} style={{ ...inputStyle, padding: "6px 9px", fontSize: 12.5 }}>
          <option value="">{lista.length ? "Elige una plantilla…" : "No tienes plantillas aprobadas todavía"}</option>
          {lista.map((p) => {
            const lista_ = p.estado === "APPROVED" && !p.motivo;
            const porque = p.estado !== "APPROVED" ? ` — ${p.estado === "PENDING" ? "en revisión" : p.estado.toLowerCase()}` : p.motivo ? ` — ${p.motivo}` : "";
            return <option key={`${p.nombre}|${p.idioma}`} value={`${p.nombre}|${p.idioma}`} disabled={!lista_}>{p.nombre} · {p.idioma}{porque}</option>;
          })}
        </select>
      )}
      {err && <div style={{ fontFamily: "var(--ui)", fontSize: 12, color: C.clay, marginTop: 7, lineHeight: 1.5 }}>{err}</div>}
    </div>
  );
}

/* Cómo le va a llegar: la burbuja de WhatsApp con su imagen, el texto y los
   botones debajo. Lo que va en las variables se ve como {{nombre}}. */
function VistaWa({ imagen, encabezado, cuerpo, pie, botones = [] }) {
  const llenos = botones.filter((b) => b.texto.trim());
  return (
    <div style={{ background: "#E5DDD5", borderRadius: 8, padding: 10 }}>
      <div style={{ background: "#fff", borderRadius: 8, overflow: "hidden", maxWidth: 320, boxShadow: "0 1px 1px rgba(0,0,0,.12)" }}>
        {imagen && <img src={imagen} alt="" style={{ display: "block", width: "100%", maxHeight: 220, objectFit: "cover" }} />}
        <div style={{ padding: "8px 10px 6px", fontFamily: "var(--ui)", fontSize: 12.5, lineHeight: 1.5, color: "#111" }}>
          {encabezado && <div style={{ fontWeight: 700, marginBottom: 4 }}>{encabezado}</div>}
          <div style={{ whiteSpace: "pre-wrap" }}>{cuerpo || "…"}</div>
          {pie && <div style={{ fontSize: 11, color: "#8696A0", marginTop: 4 }}>{pie}</div>}
        </div>
        {llenos.map((b, i) => (
          <div key={i} style={{ borderTop: "1px solid #E9EDEF", padding: "8px 10px", textAlign: "center", fontFamily: "var(--ui)", fontSize: 12.5, color: "#027EB5", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {b.tipo === "URL" ? <ExternalLink size={13} /> : <MessageSquare size={13} />}{b.texto}
          </div>
        ))}
      </div>
    </div>
  );
}

/* Sube la imagen del encabezado al puente y devuelve {id, url}. Se sube al
   elegirla, no al mandar: así la vista previa ya es la que va a ver Meta. */
function SubirImagenWa({ pu, valor, onCambio }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const elegir = async (e) => {
    const archivo = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!archivo) return;
    if (!["image/jpeg", "image/png"].includes(archivo.type)) { setErr("Tiene que ser JPG o PNG."); return; }
    if (archivo.size > 5 * 1024 * 1024) { setErr("Meta acepta imágenes de hasta 5 MB."); return; }
    setBusy(true); setErr("");
    try { onCambio(await subirImagenWa({ base: pu.base, clave: pu.clave, archivo })); }
    catch (x) { setErr((x && x.message) || String(x)); }
    setBusy(false);
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <label className="crm-btn" style={{ border: `1px solid ${C.line}`, background: C.panel, borderRadius: 6, padding: "5px 11px", fontFamily: "var(--ui)", fontSize: 12.5, cursor: busy ? "default" : "pointer" }}>
        {busy ? "Subiendo…" : valor ? "Cambiar imagen" : "Subir imagen (JPG o PNG)"}
        <input type="file" accept="image/jpeg,image/png" onChange={elegir} disabled={busy} style={{ display: "none" }} />
      </label>
      {valor && <span style={{ fontFamily: "var(--ui)", fontSize: 11.5, color: C.faint }}>Lista. Recomendado: 1200×628 px.</span>}
      {err && <span style={{ fontFamily: "var(--ui)", fontSize: 12, color: C.clay }}>{err}</span>}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Estudio de contenido
   ────────────────────────────────────────────────────────────
   De la idea a la plantilla sin salir del CRM: Claude propone el mensaje
   —a partir de lo que escribas o de noticias que busca—, diseña la imagen
   del encabezado con la identidad de Catch, y la pieza pasa al mismo
   "Enviar a Meta" de Plantillas. Nada sale sin que lo elijas.

   La imagen la escribe Claude como SVG y aquí se convierte en JPG. Un SVG
   que se pinta dentro de <img> no ejecuta nada ni carga nada de fuera, así
   que el logo, la foto y las tipografías se le incrustan antes de pintarlo.
   ──────────────────────────────────────────────────────────── */

const ESTUDIO_LOGO = "/catch-logo.png";

const aDataUrl = (blob) => new Promise((ok, mal) => {
  const r = new FileReader();
  r.onload = () => ok(r.result);
  r.onerror = () => mal(new Error("No se pudo leer el archivo."));
  r.readAsDataURL(blob);
});

/* Las dos familias que se le permiten a Claude, bajadas una vez por sesión.
   Sólo el subconjunto latino: es el que trae tildes y eñes. */
let fuentesSvg = null;
const cargarFuentesSvg = () => {
  if (!fuentesSvg) {
    fuentesSvg = (async () => {
      const css = await (await fetch("https://fonts.googleapis.com/css2?family=Anton&family=Montserrat:wght@600;800&display=swap")).text();
      const bloques = css.split("/* ").filter((b) => b.startsWith("latin */"));
      const caras = await Promise.all(bloques.map(async (b) => {
        const fam = (b.match(/font-family:\s*'([^']+)'/) || [])[1];
        const peso = (b.match(/font-weight:\s*(\d+)/) || [])[1] || "400";
        const url = (b.match(/url\(([^)]+)\)/) || [])[1];
        if (!fam || !url) return "";
        const datos = await aDataUrl(await (await fetch(url)).blob());
        return `@font-face{font-family:'${fam}';font-weight:${peso};src:url(${datos}) format('woff2');}`;
      }));
      return caras.join("");
    })().catch((e) => { fuentesSvg = null; throw e; });
  }
  return fuentesSvg;
};

let logoSvg = null;
const cargarLogoSvg = () => {
  if (!logoSvg) logoSvg = fetch(ESTUDIO_LOGO).then((r) => r.blob()).then(aDataUrl).catch((e) => { logoSvg = null; throw e; });
  return logoSvg;
};

/* SVG de Claude → JPG listo para subir: 1200×628 para el encabezado, o el
   tamaño que se pida (1080×1350 para Instagram). */
async function svgAJpg(svg, foto, ancho = 1200, alto = 628) {
  const [fuentes, logo] = await Promise.all([cargarFuentesSvg().catch(() => ""), cargarLogoSvg()]);
  let doc = String(svg)
    .replace(/(xlink:)?href="LOGO"/g, `href="${logo}"`)
    .replace(/(xlink:)?href="FOTO"/g, foto ? `href="${foto}"` : 'href=""');
  doc = doc.replace(/<svg\b[^>]*>/, (m) => `${m}<style>${fuentes}</style>`);
  const url = URL.createObjectURL(new Blob([doc], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const lienzo = document.createElement("canvas");
    lienzo.width = ancho; lienzo.height = alto;
    const ctx = lienzo.getContext("2d");
    ctx.fillStyle = "#002B3D";
    ctx.fillRect(0, 0, ancho, alto);
    ctx.drawImage(img, 0, 0, ancho, alto);
    const blob = await new Promise((ok) => lienzo.toBlob(ok, "image/jpeg", 0.9));
    if (!blob) throw new Error("No se pudo convertir el diseño en imagen.");
    return new File([blob], ancho === 1200 ? "encabezado.jpg" : "instagram.jpg", { type: "image/jpeg" });
  } catch (e) {
    throw new Error("El diseño que devolvió Claude no se pudo pintar. Pide otro.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function pedirEstudio(cuerpo) {
  const r = await fetch("/api/estudio", {
    method: "POST", redirect: "manual", credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-Origen": "estudio" },
    body: JSON.stringify(cuerpo),
  });
  if (r.type === "opaqueredirect" || r.status === 401) throw new Error("La sesión del CRM venció. Recarga la página para volver a entrar.");
  if (!(r.headers.get("Content-Type") || "").includes("application/json")) throw new Error("El estudio sólo funciona en la versión publicada del CRM.");
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
  return data;
}

/* El correo de marketing con la identidad de Catch. Diseño fijo de tablas,
   que es lo que respetan Gmail, Outlook y los celulares; Claude pone los
   textos. Las variables ({{nombre}}) quedan tal cual para que el envío las
   llene, y todo lo demás se escapa. */
const correoHtml = ({ imagen, preheader, titulo, parrafos, cta, url }) => {
  const e = (t) => escapeHtml(t);
  const fuente = "font-family:Arial,Helvetica,sans-serif;";
  const cabeza = imagen
    ? `<tr><td><img src="${e(imagen)}" width="600" alt="${e(titulo)}" style="display:block;width:100%;height:auto;border:0"></td></tr>`
    : `<tr><td style="background:#002B3D;padding:26px 36px;${fuente}color:#ffffff;font-size:28px;font-weight:800;letter-spacing:1px">CATCH <span style="color:#00A3AD;font-size:13px;font-weight:700;letter-spacing:0">by Raad Sports</span></td></tr>`;
  const cuerpo = parrafos.filter((x) => x.trim())
    .map((x) => `<p style="margin:0 0 14px;${fuente}font-size:16px;line-height:1.6;color:#33475B">${e(x.trim()).replace(/\n/g, "<br>")}</p>`).join("");
  const boton = cta && url
    ? `<tr><td style="padding:6px 36px 34px"><a href="${e(url)}" style="display:inline-block;background:#00A3AD;color:#ffffff;${fuente}font-size:16px;font-weight:700;padding:14px 28px;border-radius:6px;text-decoration:none">${e(cta)}</a></td></tr>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#EEF2F4">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${e(preheader)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF2F4"><tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden">` +
    cabeza +
    `<tr><td style="padding:32px 36px 10px"><h1 style="margin:0 0 16px;${fuente}font-size:26px;line-height:1.25;color:#002B3D">${e(titulo)}</h1>${cuerpo}</td></tr>` +
    boton +
    `<tr><td style="background:#002B3D;padding:18px 36px;${fuente}font-size:12px;line-height:1.5;color:#9FB6C1">Catch by Raad Sports · Si no quieres recibir más correos, responde a este mensaje con la palabra BAJA.</td></tr>` +
    `</table></td></tr></table></body></html>`;
};

const correoTexto = ({ titulo, parrafos, cta, url }) =>
  [titulo, ...parrafos.filter((x) => x.trim()), cta && url ? `${cta}: ${url}` : ""].filter(Boolean).join("\n\n");

/* Lo que llevas armado sobrevive a cambiar de pestaña; al recargar se pierde,
   y está bien: lo que importa queda en Plantillas al mandarlo. */
let memoriaEstudio = null;

/* Los borradores van en IndexedDB y no con el resto del CRM: llevan la foto
   de fondo y los diseños ya pintados, y con un par de piezas el localStorage
   se llenaría. Quedan en este navegador, como todo lo demás. Se guardan los
   últimos BORRADORES_MAX; al pasarse, se va el más viejo. */
const BORRADORES_MAX = 15;
let baseBorradores = null;
const abrirBorradores = () => {
  if (!baseBorradores) {
    baseBorradores = new Promise((ok, mal) => {
      const r = indexedDB.open("crm-estudio", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("borradores", { keyPath: "id" });
      r.onsuccess = () => ok(r.result);
      r.onerror = () => mal(r.error);
    }).catch((e) => { baseBorradores = null; throw e; });
  }
  return baseBorradores;
};
const enBorradores = async (modo, hacer) => {
  const bd = await abrirBorradores();
  return new Promise((ok, mal) => {
    const tx = bd.transaction("borradores", modo);
    const r = hacer(tx.objectStore("borradores"));
    tx.oncomplete = () => ok(r && r.result);
    tx.onerror = () => mal(tx.error);
    tx.onabort = () => mal(tx.error || new Error("El navegador canceló la escritura."));
  });
};
const listarBorradores = async () =>
  ((await enBorradores("readonly", (s) => s.getAll())) || []).sort((a, b) => b.actualizado.localeCompare(a.actualizado));
const guardarBorrador = async (b) => {
  await enBorradores("readwrite", (s) => s.put(b));
  const todos = await listarBorradores();
  const sobran = todos.slice(BORRADORES_MAX);
  if (sobran.length) await enBorradores("readwrite", (s) => sobran.forEach((x) => s.delete(x.id)));
  return todos.slice(0, BORRADORES_MAX);
};
const borrarBorrador = (id) => enBorradores("readwrite", (s) => s.delete(id));

function EstudioView({ db, setDb, say, onListo }) {
  const pu = db.integrations.puente;
  const marca = (db.estudio && db.estudio.marca) || "";
  const m = memoriaEstudio || {};
  const [fuente, setFuente] = useState(m.fuente || "idea");
  const [brief, setBrief] = useState(m.brief || "");
  /* Cada "Proponer" suma una tanda en vez de pisar la anterior, y cada diseño
     —también los ajustados— se queda en la lista: así se puede volver a lo
     que no se eligió en su momento. La elegida se recuerda por tanda, porque
     se puede mirar una tanda sin cambiar de mensaje. */
  const [tandas, setTandas] = useState(m.tandas || []);
  const [vista, setVista] = useState(m.vista ?? -1);
  const [tandaElegida, setTandaElegida] = useState(m.tandaElegida ?? -1);
  const [elegida, setElegida] = useState(m.elegida ?? -1);
  const [foto, setFoto] = useState(m.foto || "");
  const [disenos, setDisenos] = useState(m.disenos || []);
  const [diseno, setDiseno] = useState(m.diseno ?? -1);
  const [ajuste, setAjuste] = useState("");
  const [draft, setDraft] = useState(m.draft || null);
  const [subida, setSubida] = useState(m.subida || null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [verMarca, setVerMarca] = useState(!marca);
  const [ajusteMsg, setAjusteMsg] = useState("");
  const [textosImg, setTextosImg] = useState(m.textosImg || { titular: "", apoyo: "", etiqueta: "" });
  const [canales, setCanales] = useState(m.canales || { wa: true, correo: false, ig: false });
  const [correo, setCorreo] = useState(m.correo || null);
  const [ctaUrl, setCtaUrl] = useState(m.ctaUrl ?? ((marca.match(/https:\/\/\S+/) || [])[0] || ""));
  const [ajusteCorreo, setAjusteCorreo] = useState("");
  const [hecho, setHecho] = useState(m.hecho || { wa: false, correo: false, ig: false });
  /* La publicación de Instagram: su imagen vertical (sacada del diseño
     marcado, `de`), su texto, la subida al puente y, ya publicada, el enlace. */
  const [ig, setIg] = useState(m.ig || null);
  const [ajusteIg, setAjusteIg] = useState("");
  const [borradorId, setBorradorId] = useState(m.borradorId || null);
  const [historial, setHistorial] = useState([]);
  const [verHistorial, setVerHistorial] = useState(false);

  useEffect(() => {
    memoriaEstudio = { fuente, brief, tandas, vista, tandaElegida, elegida, foto, disenos, diseno, draft, subida, textosImg, canales, correo, ctaUrl, hecho, ig, borradorId };
  }, [fuente, brief, tandas, vista, tandaElegida, elegida, foto, disenos, diseno, draft, subida, textosImg, canales, correo, ctaUrl, hecho, ig, borradorId]);

  useEffect(() => { listarBorradores().then(setHistorial).catch(() => {}); }, []);

  /* Los diseños se guardan con su JPG ya pintado: al abrir el borrador sólo
     hay que volver a sacarles la vista previa, sin pasar otra vez por Claude. */
  const guardar = async (callado) => {
    const id = borradorId || uid();
    try {
      setHistorial(await guardarBorrador({
        id, actualizado: nowISO(),
        titulo: (draft && draft.name.trim()) || brief.trim().slice(0, 70) || "Sin título",
        fuente, brief, tandas, vista, tandaElegida, elegida, foto, diseno, draft, subida, textosImg, canales, correo, ctaUrl, hecho,
        ig: ig && { ...ig, vista: undefined },
        disenos: disenos.map(({ svg, archivo, textos, variante, ronda, para }) => ({ svg, archivo, textos, variante, ronda, para })),
      }));
      setBorradorId(id);
      if (!callado) say("Borrador guardado");
    } catch (e) { setErr(`No se pudo guardar el borrador: ${(e && e.message) || e}`); }
  };

  /* Lo que se manda a Meta o se aprueba como correo entra solo al historial,
     para encontrarlo después aunque nadie haya pulsado "Guardar borrador". */
  const hechoAntes = useRef(hecho);
  useEffect(() => {
    const a = hechoAntes.current;
    hechoAntes.current = hecho;
    if ((hecho.wa && !a.wa) || (hecho.correo && !a.correo) || (hecho.ig && !a.ig)) guardar(true);
  }, [hecho]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Lo mismo con cada respuesta de Claude: una tanda o un diseño nuevo se
     guarda solo, para que el historial no dependa de acordarse de guardar
     ni se pierda al recargar. */
  const cuentas = useRef(`${tandas.length}/${disenos.length}`);
  useEffect(() => {
    const c = `${tandas.length}/${disenos.length}`;
    if (c === cuentas.current) return;
    cuentas.current = c;
    if (tandas.length) guardar(true);
  }, [tandas.length, disenos.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const abrir = (b) => {
    const h = { wa: false, correo: false, ig: false, ...b.hecho };
    hechoAntes.current = h;
    /* Los borradores de antes del historial traen una sola tanda suelta. */
    const ts = b.tandas || (b.propuestas && b.propuestas.length ? [{ at: b.actualizado, fuente: b.fuente, brief: b.brief, propuestas: b.propuestas }] : []);
    const te = b.tandas ? (b.tandaElegida ?? -1) : ((b.elegida ?? -1) >= 0 ? 0 : -1);
    const ds = (b.disenos || []).map((d, i) => ({ variante: i % 2, ronda: 0, para: `${te}:${b.elegida}`, ...d, vista: URL.createObjectURL(d.archivo) }));
    cuentas.current = `${ts.length}/${ds.length}`;
    setBorradorId(b.id); setFuente(b.fuente || "idea"); setBrief(b.brief || "");
    setTandas(ts); setVista(b.vista ?? ts.length - 1); setTandaElegida(te); setElegida(b.elegida ?? -1); setFoto(b.foto || "");
    setDisenos(ds);
    setDiseno(b.diseno ?? -1); setDraft(b.draft || null); setSubida(b.subida || null);
    setTextosImg(b.textosImg || { titular: "", apoyo: "", etiqueta: "" }); setCanales({ wa: true, correo: false, ig: false, ...b.canales });
    setCorreo(b.correo || null); setCtaUrl(b.ctaUrl || ""); setHecho(h);
    setIg(b.ig ? { ...b.ig, vista: b.ig.archivo ? URL.createObjectURL(b.ig.archivo) : "" } : null);
    setAjuste(""); setAjusteMsg(""); setAjusteCorreo(""); setAjusteIg(""); setErr(""); setVerHistorial(false);
  };

  const quitar = async (b) => {
    try {
      await borrarBorrador(b.id);
      setHistorial((hs) => hs.filter((x) => x.id !== b.id));
      if (b.id === borradorId) setBorradorId(null);
    } catch (e) { setErr(`No se pudo borrar: ${(e && e.message) || e}`); }
  };

  const empezarOtra = () => {
    memoriaEstudio = null;
    setTandas([]); setVista(-1); setTandaElegida(-1); setElegida(-1); setDisenos([]); setDiseno(-1); setDraft(null); setSubida(null);
    setCorreo(null); setIg(null); setHecho({ wa: false, correo: false, ig: false }); setBrief(""); setFoto(""); setBorradorId(null);
    hechoAntes.current = { wa: false, correo: false, ig: false };
    cuentas.current = "0/0";
  };

  const propuestas = (tandas[vista] && tandas[vista].propuestas) || [];
  const p = tandaElegida >= 0 && elegida >= 0 && tandas[tandaElegida] ? tandas[tandaElegida].propuestas[elegida] : null;
  /* Los diseños se cuelgan del mensaje para el que se hicieron: al volver a
     un mensaje anterior vuelven también sus imágenes. */
  const clave = p ? `${tandaElegida}:${elegida}` : "";
  const deEste = disenos.map((d, i) => ({ d, i })).filter(({ d }) => d.para === clave);
  const sigRonda = deEste.reduce((mx, { d }) => Math.max(mx, d.ronda + 1), 0);
  /* En grande la última ronda y la marcada; lo demás, en miniatura debajo. */
  const grandes = deEste.filter(({ d, i }) => d.ronda === sigRonda - 1 || i === diseno);
  const anteriores = deEste.filter(({ d, i }) => d.ronda !== sigRonda - 1 && i !== diseno).reverse();
  const ponerMarca = (v) => setDb((d) => ({ ...d, estudio: { ...(d.estudio || {}), marca: v } }));

  const proponer = async () => {
    setBusy("proponer"); setErr("");
    try {
      const r = await pedirEstudio({ accion: "proponer", fuente, brief, marca });
      setVista(tandas.length);
      setTandas([...tandas, { at: nowISO(), fuente, brief, propuestas: r.propuestas }]);
    } catch (e) { setErr((e && e.message) || String(e)); }
    setBusy("");
  };

  const elegir = (i) => {
    const ultimo = disenos.reduce((u, d, j) => (d.para === `${vista}:${i}` ? j : u), -1);
    setTandaElegida(vista); setElegida(i); setDiseno(ultimo); setSubida(null); setCorreo(null); setIg(null); setHecho({ wa: false, correo: false, ig: false });
    const im = propuestas[i].imagen || {};
    setTextosImg({ titular: im.titular || "", apoyo: im.apoyo || "", etiqueta: im.etiqueta || "" });
    setDraft({ id: uid(), name: propuestas[i].titulo, subject: "", body: propuestas[i].mensaje, html: "", meta: null });
  };

  const ajustarMensaje = async () => {
    setBusy("ajustarMsg"); setErr("");
    try {
      const r = await pedirEstudio({ accion: "ajustarMensaje", mensaje: draft.body, instruccion: ajusteMsg, marca });
      setDraft((d) => ({ ...d, body: r.mensaje }));
      setAjusteMsg("");
    } catch (e) { setErr((e && e.message) || String(e)); }
    setBusy("");
  };

  const crearCorreo = async (instruccion) => {
    setBusy("correo"); setErr("");
    try {
      const r = await pedirEstudio({
        accion: "correo", marca,
        propuesta: { ...p, mensaje: draft.body, imagen: { ...(p.imagen || {}), ...textosImg } },
        ...(instruccion && correo ? { anterior: correo, instruccion } : {}),
      });
      setCorreo({ ...r.correo, parrafos: Array.isArray(r.correo.parrafos) ? r.correo.parrafos : [] });
      setAjusteCorreo(""); setHecho((h) => ({ ...h, correo: false }));
    } catch (e) { setErr((e && e.message) || String(e)); }
    setBusy("");
  };

  const datosCorreo = correo ? { imagen: subida ? subida.url : "", preheader: correo.preheader, titulo: correo.titulo, parrafos: correo.parrafos, cta: correo.cta, url: ctaUrl.trim() } : null;

  const guardarCorreo = () => {
    const t = { id: uid(), name: `${(draft.name || correo.titulo).trim()} (correo)`, subject: correo.asunto, body: correoTexto(datosCorreo), html: correoHtml(datosCorreo) };
    setDb((d) => ({ ...d, templates: { ...d.templates, email: [...d.templates.email, t] } }));
    setHecho((h) => ({ ...h, correo: true }));
    say("Plantilla de correo guardada en Plantillas → Correo de marketing.");
  };

  const disenar = async (variante, previo) => {
    const r = await pedirEstudio({
      accion: "imagen", propuesta: { ...p, mensaje: draft ? draft.body : p.mensaje, imagen: { ...(p.imagen || {}), ...textosImg } }, marca, conFoto: Boolean(foto), variante,
      ...(previo ? { ajuste: ajuste.trim() || "Pon los textos indicados en lugar de los actuales.", anterior: previo.svg } : {}),
    });
    const archivo = await svgAJpg(r.svg, foto);
    return { svg: r.svg, archivo, vista: URL.createObjectURL(archivo), textos: { ...textosImg }, variante, para: clave, ronda: sigRonda };
  };

  const disenarDos = async () => {
    setBusy("disenar"); setErr(""); setSubida(null);
    try {
      const hechos = await Promise.allSettled([disenar(0), disenar(1)]);
      const buenos = hechos.filter((h) => h.status === "fulfilled").map((h) => h.value);
      if (!buenos.length) throw hechos[0].reason;
      setDiseno(disenos.length);
      setDisenos([...disenos, ...buenos]);
    } catch (e) { setErr((e && e.message) || String(e)); }
    setBusy("");
  };

  const ajustar = async () => {
    setBusy("ajustar"); setErr(""); setSubida(null);
    try {
      /* El ajustado entra como uno más y el original se queda en Anteriores. */
      const previo = disenos[diseno];
      const nuevo = await disenar(previo.variante ?? 0, previo);
      setDiseno(disenos.length);
      setDisenos([...disenos, nuevo]);
      setAjuste("");
    } catch (e) { setErr((e && e.message) || String(e)); }
    setBusy("");
  };

  const usarDiseno = async () => {
    setBusy("subir"); setErr("");
    try { setSubida(await subirImagenWa({ base: pu.base, clave: pu.clave, archivo: disenos[diseno].archivo })); }
    catch (e) { setErr((e && e.message) || String(e)); }
    setBusy("");
  };

  /* ── Instagram ──
     La imagen sale del diseño marcado en el paso 3, recompuesta en vertical;
     el texto, del mensaje elegido. Las dos cosas se piden a la vez y lo que
     llegue se queda, aunque la otra falle. */
  const propuestaActual = () => ({ ...p, mensaje: draft.body, imagen: { ...(p.imagen || {}), ...textosImg } });
  const imagenIg = async (r) => {
    const archivo = await svgAJpg(r.svg, foto, 1080, 1350);
    return { svg: r.svg, archivo, vista: URL.createObjectURL(archivo), subida: null };
  };

  const prepararIg = async (soloImagen) => {
    setBusy("ig"); setErr("");
    try {
      const [im, tx] = await Promise.allSettled([
        pedirEstudio({ accion: "adaptarInstagram", svg: disenos[diseno].svg, conFoto: Boolean(foto), marca }).then(imagenIg),
        soloImagen ? Promise.resolve(null) : pedirEstudio({ accion: "instagram", propuesta: propuestaActual(), marca }),
      ]);
      setIg((x) => ({
        texto: "", ...x,
        ...(im.status === "fulfilled" ? { ...im.value, de: diseno } : {}),
        ...(tx.status === "fulfilled" && tx.value ? { texto: tx.value.texto } : {}),
      }));
      const fallo = [im, tx].find((h) => h.status === "rejected");
      if (fallo) throw fallo.reason;
    } catch (e) { setErr((e && e.message) || String(e)); }
    setBusy("");
  };

  const ajustarIgImagen = async () => {
    setBusy("igImagen"); setErr("");
    try {
      const r = await pedirEstudio({ accion: "imagen", propuesta: propuestaActual(), marca, conFoto: Boolean(foto), ajuste: ajusteIg.trim(), anterior: ig.svg });
      const nueva = await imagenIg(r);
      setIg((x) => ({ ...x, ...nueva }));
      setAjusteIg("");
    } catch (e) { setErr((e && e.message) || String(e)); }
    setBusy("");
  };

  const ajustarIgTexto = async () => {
    setBusy("igTexto"); setErr("");
    try {
      const r = await pedirEstudio({ accion: "instagram", propuesta: propuestaActual(), marca, anterior: ig.texto, instruccion: ajusteIg.trim() });
      setIg((x) => ({ ...x, texto: r.texto }));
      setAjusteIg("");
    } catch (e) { setErr((e && e.message) || String(e)); }
    setBusy("");
  };

  /* Esto sí sale en el momento y a la vista de todos, así que se pregunta. */
  const publicarIg = async () => {
    if (!window.confirm("Se publica ahora mismo en el Instagram de la marca, a la vista de todos. ¿Seguir?")) return;
    setBusy("igPublicar"); setErr("");
    try {
      const sub = ig.subida || await subirImagenWa({ base: pu.base, clave: pu.clave, archivo: ig.archivo });
      setIg((x) => ({ ...x, subida: sub }));
      const r = await publicarInstagram({ base: pu.base, clave: pu.clave, imagen: sub.id, texto: ig.texto.trim() });
      setIg((x) => ({ ...x, subida: sub, publicada: { id: r.id, permalink: r.permalink, en: nowISO() } }));
      setHecho((h) => ({ ...h, ig: true }));
      say("Publicada en Instagram.");
    } catch (e) { setErr((e && e.message) || String(e)); }
    setBusy("");
  };

  const elegirFoto = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) { setErr("Tiene que ser una imagen."); return; }
    setFoto(await aDataUrl(f));
  };

  const paso = { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 9, padding: 18, marginBottom: 16 };
  const tituloPaso = (n, t) => (
    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
      <span style={{ background: C.jade, color: "#fff", borderRadius: 99, width: 22, height: 22, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--mono)", fontSize: 11.5, fontWeight: 600 }}>{n}</span>
      <span style={{ fontFamily: "var(--display)", fontSize: 15, fontWeight: 600 }}>{t}</span>
    </div>
  );
  const nota = { fontFamily: "var(--ui)", fontSize: 12, color: C.faint, lineHeight: 1.5 };
  const espera = (t) => <div style={{ ...nota, marginTop: 8 }}>{t}</div>;

  return (
    <div>
      <Header eyebrow="Mensajería" title="Estudio de contenido" right={<>
        <Btn variant="ghost" Icon={History} onClick={() => setVerHistorial((v) => !v)}>Recientes{historial.length ? ` (${historial.length})` : ""}</Btn>
        {borradorId && <Btn variant="ghost" Icon={Plus} disabled={Boolean(busy)} onClick={empezarOtra}>Nueva pieza</Btn>}
        <Btn variant="outline" Icon={Save} disabled={Boolean(busy) || (!brief.trim() && !tandas.length)} onClick={() => guardar(false)}>
          {borradorId ? "Guardar cambios" : "Guardar borrador"}
        </Btn>
      </>} />
      <div style={{ padding: 28, maxWidth: 1080 }}>

        {verHistorial && (
          <div style={paso}>
            <div style={{ fontFamily: "var(--display)", fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Piezas recientes</div>
            {!historial.length ? (
              <div style={nota}>Todavía no hay nada. Cada propuesta y cada diseño que te da Claude se guarda aquí solo, con lo que no elegiste; también puedes pulsar "Guardar borrador" en cualquier momento.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {historial.map((b) => {
                  const h = b.hecho || {};
                  const estado = [h.wa && "Enviada a Meta", h.correo && "Correo guardado", h.ig && "Publicada en Instagram"].filter(Boolean).join(" · ") || "Borrador";
                  const nT = b.tandas ? b.tandas.length : (b.propuestas && b.propuestas.length ? 1 : 0);
                  const nD = (b.disenos || []).length;
                  const cuanto = [nT && `${nT} ${nT === 1 ? "tanda" : "tandas"}`, nD && `${nD} ${nD === 1 ? "diseño" : "diseños"}`].filter(Boolean).join(", ");
                  const vista = b.disenos && b.disenos[b.diseno >= 0 ? b.diseno : 0];
                  return (
                    <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderTop: `1px solid ${C.line}` }}>
                      {vista ? <MiniaturaBorrador archivo={vista.archivo} /> : <div style={{ width: 64, height: 34, borderRadius: 4, background: "#EEF2F4", flexShrink: 0 }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: "var(--ui)", fontSize: 13, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {b.titulo}{b.id === borradorId && <span style={{ color: C.jade, fontWeight: 500 }}> · abierta</span>}
                        </div>
                        <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, color: C.faint }}>
                          {estado}{cuanto ? ` · ${cuanto}` : ""} · {new Date(b.actualizado).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}
                        </div>
                      </div>
                      <Btn size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => abrir(b)}>Abrir</Btn>
                      <Btn size="sm" variant="ghost" Icon={Trash2} onClick={() => quitar(b)} />
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ ...nota, marginTop: 8 }}>Se guardan en este navegador las últimas {BORRADORES_MAX} piezas.</div>
          </div>
        )}

        <div style={paso}>
          {tituloPaso(1, "La idea")}
          <div style={{ display: "flex", gap: 7, marginBottom: 10 }}>
            {[["idea", "Mi idea", Lightbulb], ["noticias", "Noticias", Newspaper]].map(([k, l, I]) => (
              <button key={k} onClick={() => setFuente(k)} className="crm-btn" style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${fuente === k ? C.jade : C.line}`, background: fuente === k ? C.jade : C.panel, color: fuente === k ? "#fff" : C.mute, borderRadius: 999, padding: "5px 13px", fontFamily: "var(--ui)", fontSize: 12.5, cursor: "pointer" }}>
                <I size={13} />{l}
              </button>
            ))}
          </div>
          <textarea className="crm-in" value={brief} onChange={(e) => setBrief(e.target.value)} rows={3}
            placeholder={fuente === "noticias"
              ? "Sobre qué buscar, p. ej. becas deportivas universitarias en EE. UU. para fútbol, esta semana"
              : "Qué quieres comunicar, p. ej. abrimos inscripciones para el showcase de diciembre, cupos limitados"}
            style={{ ...inputStyle, width: "100%", boxSizing: "border-box", fontSize: 13, resize: "vertical" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            <Btn variant="solid" Icon={Sparkles} disabled={Boolean(busy) || !brief.trim()} onClick={proponer}>
              {busy === "proponer" ? (fuente === "noticias" ? "Buscando noticias…" : "Pensando…") : "Proponer 3 mensajes"}
            </Btn>
            <Btn size="sm" variant="ghost" onClick={() => setVerMarca((v) => !v)}>{verMarca ? "Ocultar" : "Editar"} lo que Claude sabe de la marca</Btn>
          </div>
          {busy === "proponer" && espera(fuente === "noticias" ? "Claude está buscando y leyendo noticias; suele tardar entre 30 segundos y un par de minutos." : "Suele tardar unos segundos.")}
          {verMarca && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, fontWeight: 600, color: C.mute, marginBottom: 5 }}>SOBRE LA MARCA</div>
              <textarea className="crm-in" value={marca} onChange={(e) => ponerMarca(e.target.value)} rows={5}
                placeholder="Qué es Catch, para quién es, qué ofrece la app, el enlace de registro, cómo hablamos, qué nunca decimos…"
                style={{ ...inputStyle, width: "100%", boxSizing: "border-box", fontSize: 12.5, resize: "vertical" }} />
              <div style={nota}>Se guarda solo y Claude lo lee en cada pieza. Colores y logo ya los conoce.</div>
            </div>
          )}
        </div>

        {propuestas.length > 0 && (
          <div style={paso}>
            {tituloPaso(2, "Elige un mensaje")}
            {tandas.length > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                <span style={{ fontFamily: "var(--ui)", fontSize: 11.5, fontWeight: 600, color: C.mute, marginRight: 2 }}>TANDAS</span>
                {tandas.map((t, k) => (
                  <button key={k} onClick={() => setVista(k)} title={t.brief} className="crm-btn"
                    style={{ border: `1px solid ${vista === k ? C.jade : C.line}`, background: vista === k ? C.jade : C.panel, color: vista === k ? "#fff" : C.mute, borderRadius: 999, padding: "3px 11px", fontFamily: "var(--ui)", fontSize: 12, cursor: "pointer" }}>
                    {k + 1} · {new Date(t.at).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" })}{tandaElegida === k ? " ✓" : ""}
                  </button>
                ))}
              </div>
            )}
            {tandas.length > 1 && tandas[vista] && tandas[vista].brief !== brief && (
              <div style={{ ...nota, marginBottom: 10 }}>Pedida con: «{tandas[vista].brief}»</div>
            )}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {propuestas.map((x, i) => (
                <div key={i} style={{ flex: "1 1 280px", border: `1.5px solid ${tandaElegida === vista && elegida === i ? C.jade : C.line}`, borderRadius: 8, padding: 13, background: tandaElegida === vista && elegida === i ? "#F7FAF8" : C.panel, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontFamily: "var(--display)", fontSize: 13.5, fontWeight: 600 }}>{x.titulo}</div>
                  {x.imagen && x.imagen.titular && <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: C.blue }}>IMAGEN: {x.imagen.titular}</div>}
                  <div style={{ fontFamily: "var(--ui)", fontSize: 12.5, color: C.mute, whiteSpace: "pre-wrap", lineHeight: 1.55, flex: 1 }}>{x.mensaje}</div>
                  {Array.isArray(x.fuentes) && x.fuentes.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      {x.fuentes.map((f, j) => (
                        <a key={j} href={f.url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "var(--ui)", fontSize: 11.5, color: C.blue, textDecoration: "none" }}>↗ {f.titulo || f.url}</a>
                      ))}
                    </div>
                  )}
                  <Btn size="sm" variant={tandaElegida === vista && elegida === i ? "solid" : "outline"} Icon={Check} disabled={Boolean(busy)} onClick={() => elegir(i)}>{tandaElegida === vista && elegida === i ? "Elegido" : "Usar este"}</Btn>
                </div>
              ))}
            </div>
            {propuestas.some((x) => x.fuentes && x.fuentes.length) && <div style={{ ...nota, marginTop: 10 }}>Abre las fuentes y confirma los datos antes de mandarlo: Claude resume, pero el que publica eres tú.</div>}
            {draft && (
              <div style={{ marginTop: 16, borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
                {tandaElegida !== vista && tandaElegida >= 0 && <div style={{ ...nota, marginBottom: 8 }}>El mensaje elegido es de la tanda {tandaElegida + 1}.</div>}
                <Field def={{ label: "Mensaje elegido (puedes editarlo aquí mismo)", type: "textarea" }} value={draft.body} onChange={(v) => setDraft({ ...draft, body: v })} />
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <input className="crm-in" value={ajusteMsg} onChange={(e) => setAjusteMsg(e.target.value)} placeholder="O pídele un cambio puntual, p. ej. más corto, quita el emoji, menciona que los cupos son limitados"
                    style={{ ...inputStyle, flex: 1, minWidth: 240, padding: "6px 9px", fontSize: 12.5 }} />
                  <Btn variant="outline" Icon={Sparkles} disabled={Boolean(busy) || !ajusteMsg.trim()} onClick={ajustarMensaje}>{busy === "ajustarMsg" ? "Ajustando…" : "Ajustar con Claude"}</Btn>
                </div>
              </div>
            )}
          </div>
        )}

        {p && draft && (
          <div style={paso}>
            {tituloPaso(3, "La imagen")}
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.4fr 1fr", gap: 8, marginBottom: 12 }}>
              {[["titular", "Titular de la imagen"], ["apoyo", "Frase de apoyo (opcional)"], ["etiqueta", "Etiqueta (opcional)"]].map(([k, l]) => (
                <input key={k} className="crm-in" value={textosImg[k]} placeholder={l} title={l}
                  onChange={(e) => setTextosImg((t) => ({ ...t, [k]: e.target.value }))} style={{ ...inputStyle, padding: "6px 9px", fontSize: 12.5 }} />
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              <label className="crm-btn" style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${C.line}`, background: C.panel, borderRadius: 6, padding: "5px 11px", fontFamily: "var(--ui)", fontSize: 12.5, cursor: "pointer" }}>
                <ImagePlus size={13} />{foto ? "Cambiar foto de fondo" : "Usar una foto de fondo (opcional)"}
                <input type="file" accept="image/*" onChange={elegirFoto} style={{ display: "none" }} />
              </label>
              {foto && <><img src={foto} alt="" style={{ height: 34, borderRadius: 4 }} /><Btn size="sm" variant="ghost" Icon={X} onClick={() => setFoto("")}>Quitar</Btn></>}
              <Btn variant="solid" Icon={Palette} disabled={Boolean(busy)} onClick={disenarDos}>
                {busy === "disenar" ? "Diseñando…" : deEste.length ? "Diseñar otras 2" : "Diseñar 2 opciones"}
              </Btn>
            </div>
            {busy === "disenar" && espera("Claude está diseñando dos composiciones; tarda alrededor de un minuto.")}
            {deEste.length > 0 && (
              <>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {grandes.map(({ d, i }) => (
                    <button key={i} onClick={() => { setDiseno(i); setSubida(null); }} style={{ padding: 0, border: `3px solid ${diseno === i ? C.jade : "transparent"}`, borderRadius: 8, background: "none", cursor: "pointer", flex: "1 1 320px", maxWidth: 500 }}>
                      <img src={d.vista} alt={`Opción ${i + 1}`} style={{ display: "block", width: "100%", borderRadius: 5 }} />
                    </button>
                  ))}
                </div>
                {anteriores.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, fontWeight: 600, color: C.mute, marginBottom: 6 }}>ANTERIORES · toca una para recuperarla</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {anteriores.map(({ d, i }) => (
                        <button key={i} onClick={() => { setDiseno(i); setSubida(null); }} title="Recuperar este diseño" style={{ padding: 0, border: `2px solid ${C.line}`, borderRadius: 6, background: "none", cursor: "pointer" }}>
                          <img src={d.vista} alt="Diseño anterior" style={{ display: "block", width: 150, borderRadius: 4 }} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {diseno >= 0 && (
                  <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                    <input className="crm-in" value={ajuste} onChange={(e) => setAjuste(e.target.value)} placeholder="Ajustar esta opción, p. ej. titular más grande, sin la etiqueta, fondo más claro"
                      style={{ ...inputStyle, flex: 1, minWidth: 240, padding: "6px 9px", fontSize: 12.5 }} />
                    <Btn variant="outline" Icon={RefreshCw}
                      disabled={Boolean(busy) || (!ajuste.trim() && JSON.stringify(textosImg) === JSON.stringify(disenos[diseno].textos || {}))}
                      onClick={ajustar}>{busy === "ajustar" ? "Ajustando…" : "Ajustar este diseño"}</Btn>
                    <Btn variant="solid" Icon={Check} disabled={Boolean(busy) || !pu.base || !pu.clave || Boolean(subida)} onClick={usarDiseno}>
                      {busy === "subir" ? "Preparando…" : subida ? "Imagen lista" : "Usar esta imagen"}
                    </Btn>
                  </div>
                )}
                <div style={{ ...nota, marginTop: 6 }}>Ajustar toca sólo lo que pidas (o los textos que cambies arriba) sobre la opción marcada; el resto del diseño se queda igual y la versión anterior queda en Anteriores.</div>
                {(!pu.base || !pu.clave) && <div style={{ ...nota, marginTop: 6 }}>Falta configurar el puente en Conexiones para poder usar la imagen.</div>}
              </>
            )}
          </div>
        )}

        {p && draft && (
          <div style={paso}>
            {tituloPaso(4, "Las plantillas")}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Field def={{ label: "Nombre de la pieza", type: "text" }} value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontFamily: "var(--ui)", fontSize: 13 }}>
                {[["wa", "WhatsApp (aprobación de Meta)"], ["correo", "Correo de marketing"], ["ig", "Instagram (publicación)"]].map(([k, l]) => (
                  <label key={k} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                    <input type="checkbox" checked={canales[k]} onChange={(e) => setCanales((c) => ({ ...c, [k]: e.target.checked }))} style={{ accentColor: C.jade }} />{l}
                  </label>
                ))}
              </div>

              {canales.wa && (hecho.wa ? (
                <div style={{ fontFamily: "var(--ui)", fontSize: 12.5, color: C.jade }}>✓ WhatsApp enviada a Meta. Te aviso en Plantillas cuando la aprueben.</div>
              ) : (
                <RevisionMetaWa key={subida ? subida.id : "sin-imagen"} db={db} draft={draft} setDraft={setDraft} sinRedactar
                  imagenInicial={subida}
                  onEnviada={(revision) => {
                    setDb((d) => ({ ...d, templates: { ...d.templates, whatsapp: [...d.templates.whatsapp, { ...draft, name: draft.name.trim() || revision.nombre, revision }] } }));
                    setHecho((h) => ({ ...h, wa: true }));
                    say("Enviada a Meta. Te aviso en Plantillas cuando la aprueben.");
                  }} />
              ))}

              {canales.correo && (
                <div style={{ background: "#F4F7F2", border: `1px solid ${C.line}`, borderRadius: 7, padding: "11px 12px", display: "flex", flexDirection: "column", gap: 9 }}>
                  <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, fontWeight: 600, color: C.mute, letterSpacing: ".02em" }}>VERSIÓN PARA CORREO</div>
                  {!correo ? (
                    <div>
                      <Btn size="sm" variant="solid" Icon={Mail} disabled={Boolean(busy)} onClick={() => crearCorreo()}>{busy === "correo" ? "Escribiendo…" : "Crear la versión para correo"}</Btn>
                      <div style={{ ...nota, marginTop: 6 }}>Mismo contenido, con asunto y un poco más de desarrollo.{subida ? " Lleva la misma imagen arriba." : " Si eliges la imagen en el paso 3, la lleva arriba."}</div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <input className="crm-in" value={correo.asunto} placeholder="Asunto" title="Asunto" onChange={(e) => setCorreo({ ...correo, asunto: e.target.value })} style={{ ...inputStyle, padding: "6px 9px", fontSize: 12.5 }} />
                        <input className="crm-in" value={correo.preheader} placeholder="Texto de vista previa" title="Texto de vista previa" onChange={(e) => setCorreo({ ...correo, preheader: e.target.value })} style={{ ...inputStyle, padding: "6px 9px", fontSize: 12.5 }} />
                        <input className="crm-in" value={correo.titulo} placeholder="Titular" title="Titular" onChange={(e) => setCorreo({ ...correo, titulo: e.target.value })} style={{ ...inputStyle, padding: "6px 9px", fontSize: 12.5, gridColumn: "1 / -1" }} />
                      </div>
                      <textarea className="crm-in" rows={6} value={correo.parrafos.join("\n\n")} title="Párrafos (sepáralos con una línea en blanco)"
                        onChange={(e) => setCorreo({ ...correo, parrafos: e.target.value.split(/\n\s*\n/) })}
                        style={{ ...inputStyle, width: "100%", boxSizing: "border-box", fontSize: 12.5, resize: "vertical" }} />
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 8 }}>
                        <input className="crm-in" value={correo.cta} placeholder="Texto del botón" onChange={(e) => setCorreo({ ...correo, cta: e.target.value })} style={{ ...inputStyle, padding: "6px 9px", fontSize: 12.5 }} />
                        <input className="crm-in" value={ctaUrl} placeholder="Enlace del botón (https://…)" onChange={(e) => setCtaUrl(e.target.value)} style={{ ...inputStyle, padding: "6px 9px", fontSize: 12.5 }} />
                      </div>
                      {!/^https?:\/\/\S+$/.test(ctaUrl.trim()) && <div style={{ ...nota, color: C.clay }}>Sin un enlace válido el correo sale sin botón.</div>}
                      <iframe title="Vista previa del correo" sandbox="" srcDoc={correoHtml(datosCorreo)} style={{ width: "100%", height: 520, border: `1px solid ${C.line}`, borderRadius: 6, background: "#fff" }} />
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <input className="crm-in" value={ajusteCorreo} onChange={(e) => setAjusteCorreo(e.target.value)} placeholder="Pídele un cambio puntual, p. ej. asunto más directo, un párrafo menos"
                          style={{ ...inputStyle, flex: 1, minWidth: 240, padding: "6px 9px", fontSize: 12.5 }} />
                        <Btn variant="outline" Icon={Sparkles} disabled={Boolean(busy) || !ajusteCorreo.trim()} onClick={() => crearCorreo(ajusteCorreo)}>{busy === "correo" ? "Ajustando…" : "Ajustar con Claude"}</Btn>
                      </div>
                      {hecho.correo
                        ? <div style={{ fontFamily: "var(--ui)", fontSize: 12.5, color: C.jade }}>✓ Guardada en Plantillas → Correo de marketing. Lista para tus envíos masivos.</div>
                        : <div><Btn variant="solid" Icon={Check} disabled={Boolean(busy) || !correo.asunto.trim()} onClick={guardarCorreo}>Aprobar y guardar plantilla de correo</Btn></div>}
                    </>
                  )}
                </div>
              )}

              {canales.ig && (
                <div style={{ background: "#F4F7F2", border: `1px solid ${C.line}`, borderRadius: 7, padding: "11px 12px", display: "flex", flexDirection: "column", gap: 9 }}>
                  <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, fontWeight: 600, color: C.mute, letterSpacing: ".02em" }}>VERSIÓN PARA INSTAGRAM</div>
                  {hecho.ig && ig && ig.publicada ? (
                    <div style={{ fontFamily: "var(--ui)", fontSize: 12.5, color: C.jade }}>
                      ✓ Publicada en Instagram{ig.publicada.en ? ` el ${new Date(ig.publicada.en).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}` : ""}.
                      {ig.publicada.permalink && <> <a href={ig.publicada.permalink} target="_blank" rel="noopener noreferrer" style={{ color: C.blue, textDecoration: "none" }}>Ver publicación ↗</a></>}
                    </div>
                  ) : diseno < 0 ? (
                    <div style={nota}>Marca primero un diseño en el paso 3: la publicación sale de esa imagen, recompuesta en vertical (1080×1350).</div>
                  ) : !ig || !ig.archivo ? (
                    <div>
                      <Btn size="sm" variant="solid" Icon={Instagram} disabled={Boolean(busy)} onClick={() => prepararIg(Boolean(ig && ig.texto))}>
                        {busy === "ig" ? "Preparando…" : "Preparar la versión para Instagram"}
                      </Btn>
                      <div style={{ ...nota, marginTop: 6 }}>Claude pasa el diseño marcado a formato vertical y escribe el texto con hashtags. Tarda alrededor de un minuto.</div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                        <img src={ig.vista} alt="Imagen para Instagram" style={{ width: 240, maxWidth: "100%", borderRadius: 5, border: `1px solid ${C.line}` }} />
                        <div style={{ flex: "1 1 280px", display: "flex", flexDirection: "column", gap: 4 }}>
                          <textarea className="crm-in" rows={12} value={ig.texto} title="Texto de la publicación" placeholder="Texto de la publicación"
                            onChange={(e) => setIg({ ...ig, texto: e.target.value })}
                            style={{ ...inputStyle, width: "100%", boxSizing: "border-box", fontSize: 12.5, resize: "vertical" }} />
                          <div style={{ ...nota, color: ig.texto.length > 2200 ? C.clay : C.faint }}>{ig.texto.length} / 2.200 caracteres · los enlaces no se pueden pulsar en Instagram</div>
                        </div>
                      </div>
                      {ig.de !== diseno && (
                        <div style={{ ...nota, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          Esta imagen salió de otro diseño del paso 3.
                          <Btn size="sm" variant="outline" Icon={RefreshCw} disabled={Boolean(busy)} onClick={() => prepararIg(true)}>{busy === "ig" ? "Rehaciendo…" : "Rehacerla con el marcado"}</Btn>
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <input className="crm-in" value={ajusteIg} onChange={(e) => setAjusteIg(e.target.value)} placeholder="Pídele un cambio, p. ej. logo más grande, menos hashtags, primera línea más directa"
                          style={{ ...inputStyle, flex: 1, minWidth: 240, padding: "6px 9px", fontSize: 12.5 }} />
                        <Btn variant="outline" Icon={RefreshCw} disabled={Boolean(busy) || !ajusteIg.trim()} onClick={ajustarIgImagen}>{busy === "igImagen" ? "Ajustando…" : "Ajustar imagen"}</Btn>
                        <Btn variant="outline" Icon={Sparkles} disabled={Boolean(busy) || !ajusteIg.trim()} onClick={ajustarIgTexto}>{busy === "igTexto" ? "Ajustando…" : "Ajustar texto"}</Btn>
                      </div>
                      <div>
                        <Btn variant="solid" Icon={Instagram} disabled={Boolean(busy) || !pu.base || !pu.clave || !ig.texto.trim() || ig.texto.length > 2200} onClick={publicarIg}>
                          {busy === "igPublicar" ? "Publicando…" : "Publicar en Instagram"}
                        </Btn>
                        <div style={{ ...nota, marginTop: 6 }}>
                          {!pu.base || !pu.clave ? "Falta configurar el puente en Conexiones para poder publicar." : "Sale publicada al instante en el perfil de Instagram vinculado a la página de Facebook."}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {(hecho.wa || hecho.correo || hecho.ig) && (
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn variant="outline" onClick={onListo}>Ver en Plantillas</Btn>
                  <Btn variant="ghost" Icon={Plus} onClick={empezarOtra}>Empezar otra pieza</Btn>
                </div>
              )}
            </div>
          </div>
        )}

        {err && <div style={{ fontFamily: "var(--ui)", fontSize: 12.5, color: C.clay, lineHeight: 1.5 }}>{err}</div>}
      </div>
    </div>
  );
}

/* La miniatura saca su propia vista del JPG guardado y la suelta al irse. */
function MiniaturaBorrador({ archivo }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!archivo) return undefined;
    const u = URL.createObjectURL(archivo);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [archivo]);
  return url ? <img src={url} alt="" style={{ width: 64, height: 34, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} /> : null;
}

/* Crear la plantilla en Meta sin salir del CRM: Claude la redacta si se le
   pide, se revisa aquí contra las reglas que Meta aplica de entrada, y se
   manda. La aprobación llega sola —el CRM pregunta cada cinco minutos— y el
   envío lo das tú cuando te avise. */
function RevisionMetaWa({ db, draft, setDraft, onEnviada, imagenInicial = null, sinRedactar = false }) {
  const pu = db.integrations.puente;
  const rv = draft.revision;
  const sufijo = rv && rv.estado === "REJECTED" ? "_v2" : "";
  const [nombreMeta, setNombreMeta] = useState(() => (rv && rv.estado === "REJECTED" ? `${rv.nombre}${sufijo}` : ""));
  const [categoria, setCategoria] = useState("MARKETING");
  const [cabecera, setCabecera] = useState("IMAGE");
  const [encabezado, setEncabezado] = useState("");
  const [imagen, setImagen] = useState(imagenInicial);
  const [pie, setPie] = useState("");
  const [botones, setBotones] = useState([{ tipo: "URL", texto: "", url: "" }]);
  const [idea, setIdea] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const nombreFinal = nombreMeta || nombreParaMeta(draft.name);
  const problemas = [
    ...problemasParaMeta({ nombreMeta: nombreFinal, cuerpo: draft.body, encabezado: cabecera === "TEXT" ? encabezado.trim() : "", pie: pie.trim(), botones }),
    ...(cabecera === "IMAGE" && !imagen ? ["Sube la imagen del encabezado, o elige otro tipo de encabezado."] : []),
  ];
  const ponerBoton = (i, cambio) => setBotones((bs) => bs.map((b, j) => (j === i ? { ...b, ...cambio } : b)));

  const redactar = async () => {
    setBusy("redactar"); setErr("");
    try {
      const r = await fetch("/api/claude", {
        method: "POST", redirect: "manual", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Origen": "plantillas" },
        body: JSON.stringify({ tarea: "plantilla", pregunta: idea }),
      });
      if (r.type === "opaqueredirect" || r.status === 401) throw new Error("La sesión del CRM venció. Recarga la página para volver a entrar.");
      if (!(r.headers.get("Content-Type") || "").includes("application/json")) throw new Error("Redactar con Claude sólo funciona en la versión publicada del CRM.");
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
      setDraft((d) => ({ ...d, body: data.texto }));
    } catch (e) { setErr((e && e.message) || String(e)); }
    setBusy("");
  };

  const mandar = async () => {
    setBusy("mandar"); setErr("");
    const cuerpo = draft.body.trim();
    const vars = [...new Set([...cuerpo.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/g)].map((m) => m[1]))];
    try {
      const r = await crearPlantillaWa({
        base: pu.base, clave: pu.clave,
        plantilla: {
          nombre: nombreFinal, idioma: "es", categoria, cuerpo,
          encabezado: cabecera === "TEXT" ? encabezado.trim() : "",
          imagen: cabecera === "IMAGE" && imagen ? imagen.id : "",
          pie: pie.trim(),
          botones: botones.filter((b) => b.texto.trim()).map((b) => ({ tipo: b.tipo, texto: b.texto.trim(), url: b.url.trim() })),
          ejemplos: Object.fromEntries(vars.map((k) => [k, EJEMPLOS_META[k]])),
        },
      });
      onEnviada({
        id: r.id, nombre: r.nombre, idioma: r.idioma, categoria: r.categoria, estado: r.estado, rechazo: "", enviadaEn: nowISO(), nueva: false,
        imagen: cabecera === "IMAGE" && imagen ? imagen.url : "",
      });
    } catch (e) { setErr((e && e.message) || String(e)); }
    setBusy("");
  };

  const cajita = { background: "#F4F7F2", border: `1px solid ${C.line}`, borderRadius: 7, padding: "11px 12px" };
  const titulo = { fontFamily: "var(--ui)", fontSize: 11.5, fontWeight: 600, color: C.mute, letterSpacing: ".02em", marginBottom: 6 };
  const nota = { fontFamily: "var(--ui)", fontSize: 11.5, color: C.faint, lineHeight: 1.5 };

  if (revisionAbierta(rv)) {
    return (
      <div style={cajita}>
        <div style={titulo}>EN REVISIÓN EN META · {rv.nombre}</div>
        <div style={{ fontFamily: "var(--ui)", fontSize: 12.5, color: C.mute, lineHeight: 1.55 }}>
          Se mandó {rv.enviadaEn ? `el ${new Date(rv.enviadaEn).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}` : ""}.
          Mientras Meta la revisa no se puede cambiar. El CRM pregunta cada cinco minutos y te avisa cuando la decidan.
        </div>
      </div>
    );
  }

  return (
    <div style={cajita}>
      <div style={titulo}>{rv && rv.estado === "REJECTED" ? "VOLVER A MANDAR A META" : "CREAR LA PLANTILLA EN META"}</div>
      {rv && rv.estado === "REJECTED" && (
        <div style={{ fontFamily: "var(--ui)", fontSize: 12, color: C.clay, lineHeight: 1.5, marginBottom: 8 }}>
          Meta rechazó «{rv.nombre}»{rv.rechazo ? `: ${MOTIVO_RECHAZO[rv.rechazo] || rv.rechazo}` : ""}. Corrige el texto y mándala con otro nombre.
        </div>
      )}
      {!pu.base || !pu.clave ? (
        <div style={nota}>Falta configurar el puente en Conexiones.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {!sinRedactar && <div style={{ display: "flex", gap: 7 }}>
            <input className="crm-in" value={idea} placeholder="De qué se trata, p. ej. 20% en inscripciones hasta el viernes"
              onChange={(e) => setIdea(e.target.value)} style={{ ...inputStyle, padding: "6px 9px", fontSize: 12.5, flex: 1 }} />
            <Btn size="sm" variant="outline" Icon={Sparkles} disabled={Boolean(busy) || !idea.trim()} onClick={redactar}>
              {busy === "redactar" ? "Redactando…" : "Redactar con Claude"}
            </Btn>
          </div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input className="crm-in" value={nombreFinal} placeholder="nombre_para_meta" onChange={(e) => setNombreMeta(nombreParaMeta(e.target.value) || "")}
              style={{ ...inputStyle, padding: "6px 9px", fontSize: 12.5, fontFamily: "var(--mono)" }} title="Nombre con el que queda en Meta" />
            <select className="crm-in" value={categoria} onChange={(e) => setCategoria(e.target.value)} style={{ ...inputStyle, padding: "6px 9px", fontSize: 12.5 }}>
              <option value="MARKETING">Marketing (promociones, novedades)</option>
              <option value="UTILITY">Utilidad (avisos de algo ya en curso)</option>
            </select>
            <select className="crm-in" value={cabecera} onChange={(e) => setCabecera(e.target.value)} style={{ ...inputStyle, padding: "6px 9px", fontSize: 12.5 }}>
              <option value="IMAGE">Encabezado: imagen</option>
              <option value="TEXT">Encabezado: texto</option>
              <option value="">Sin encabezado</option>
            </select>
            <input className="crm-in" value={pie} placeholder="Pie (opcional), p. ej. Responde SALIR para no recibir más" maxLength={60}
              onChange={(e) => setPie(e.target.value)} style={{ ...inputStyle, padding: "6px 9px", fontSize: 12.5 }} />
          </div>
          {cabecera === "IMAGE" && <SubirImagenWa pu={pu} valor={imagen} onCambio={setImagen} />}
          {cabecera === "TEXT" && (
            <input className="crm-in" value={encabezado} placeholder="Texto del encabezado (una línea)" maxLength={60}
              onChange={(e) => setEncabezado(e.target.value)} style={{ ...inputStyle, padding: "6px 9px", fontSize: 12.5 }} />
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {botones.map((b, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "130px 1fr 1.4fr auto", gap: 6, alignItems: "center" }}>
                <select className="crm-in" value={b.tipo} onChange={(e) => ponerBoton(i, { tipo: e.target.value })} style={{ ...inputStyle, padding: "6px 9px", fontSize: 12.5 }}>
                  <option value="URL">Botón con enlace</option>
                  <option value="RESPUESTA">Respuesta rápida</option>
                </select>
                <input className="crm-in" value={b.texto} maxLength={25} placeholder="Texto, p. ej. Registrarme"
                  onChange={(e) => ponerBoton(i, { texto: e.target.value })} style={{ ...inputStyle, padding: "6px 9px", fontSize: 12.5 }} />
                {b.tipo === "URL"
                  ? <input className="crm-in" value={b.url} placeholder="https://…" onChange={(e) => ponerBoton(i, { url: e.target.value })} style={{ ...inputStyle, padding: "6px 9px", fontSize: 12.5 }} />
                  : <span style={nota}>Abre la conversación con ese texto.</span>}
                <Btn size="sm" variant="ghost" Icon={X} onClick={() => setBotones((bs) => bs.filter((_, j) => j !== i))} />
              </div>
            ))}
            {botones.length < 3 && (
              <div><Btn size="sm" variant="ghost" Icon={Plus} onClick={() => setBotones((bs) => [...bs, { tipo: bs.filter((x) => x.tipo === "URL").length >= 2 ? "RESPUESTA" : "URL", texto: "", url: "" }])}>Agregar botón</Btn></div>
            )}
          </div>
          <VistaWa imagen={cabecera === "IMAGE" && imagen ? imagen.url : ""} encabezado={cabecera === "TEXT" ? encabezado : ""}
            cuerpo={draft.body} pie={pie} botones={botones} />
          {problemas.length > 0 && draft.body.trim() && (
            <ul style={{ margin: 0, paddingLeft: 18, fontFamily: "var(--ui)", fontSize: 12, color: C.clay, lineHeight: 1.5 }}>
              {problemas.map((x) => <li key={x}>{x}</li>)}
            </ul>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Btn size="sm" variant="solid" Icon={Send} disabled={Boolean(busy) || problemas.length > 0} onClick={mandar}>
              {busy === "mandar" ? "Mandando…" : "Enviar a Meta para aprobación"}
            </Btn>
            <span style={nota}>Usa {"{{nombre}}"}, {"{{apellido}}"}, {"{{institucion}}"} o {"{{empresa}}"} en el mensaje de abajo.</span>
          </div>
        </div>
      )}
      {err && <div style={{ fontFamily: "var(--ui)", fontSize: 12, color: C.clay, marginTop: 7, lineHeight: 1.5 }}>{err}</div>}
    </div>
  );
}

function TemplatesView({ db, setDb, say, onEnviar }) {
  const [tab, setTab] = useState("whatsapp");
  const [draft, setDraft] = useState(null);
  const list = db.templates[tab];

  const guardar = (t) => setDb((d) => {
    const arr = d.templates[tab];
    const exists = arr.some((x) => x.id === t.id);
    return { ...d, templates: { ...d.templates, [tab]: exists ? arr.map((x) => x.id === t.id ? t : x) : [...arr, t] } };
  });

  const save = () => {
    if (!draft.name.trim()) return;
    guardar(draft);
    setDraft(null); say("Plantilla guardada");
  };

  /* Lo que Meta decidió ya se vio al entrar aquí: se apaga el aviso del menú. */
  const nuevas = db.templates.whatsapp.filter((t) => t.revision && t.revision.nueva).length;
  useEffect(() => {
    if (!nuevas) return;
    setDb((d) => ({ ...d, templates: { ...d.templates, whatsapp: d.templates.whatsapp.map((t) => (t.revision && t.revision.nueva ? { ...t, revision: { ...t.revision, nueva: false } } : t)) } }));
  }, [nuevas]);

  const [revisando, setRevisando] = useState(false);
  const revisarAhora = async () => {
    const pu = db.integrations.puente;
    setRevisando(true);
    try {
      const lista = (await traerPlantillasWa({ base: pu.base, clave: pu.clave })).plantillas || [];
      const { avisos } = aplicarRevisiones(db, lista);
      setDb((d) => aplicarRevisiones(d, lista).d);
      say(avisos.length ? avisos.join(" ") : "Meta todavía no la ha revisado.");
    } catch (e) { say((e && e.message) || String(e)); }
    setRevisando(false);
  };

  return (
    <div>
      <Header eyebrow="Mensajería" title="Plantillas"
        right={<Btn variant="solid" Icon={Plus} onClick={() => setDraft({ id: uid(), name: "", subject: "", body: "", html: "", ...(tab === "whatsapp" ? { meta: null } : {}) })}>Nueva plantilla</Btn>} />
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
            {t.meta && t.meta.imagen && <img src={t.meta.imagen} alt="" style={{ display: "block", width: "100%", maxHeight: 140, objectFit: "cover", borderRadius: 6, marginTop: 8 }} />}
            {t.meta && (
              <div style={{ marginTop: 7, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Pill color={C.jade} soft={C.jadeSoft}>Aprobada en Meta · {t.meta.nombre}</Pill>
                {tab === "whatsapp" && onEnviar && <Btn size="sm" variant="outline" Icon={Send} onClick={() => onEnviar(t.id)}>Enviar</Btn>}
              </div>
            )}
            {!t.meta && revisionAbierta(t.revision) && (
              <div style={{ marginTop: 7, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Pill color={C.amber} soft={C.amberSoft}>En revisión en Meta · {t.revision.nombre}</Pill>
                <Btn size="sm" variant="ghost" Icon={RefreshCw} disabled={revisando} onClick={revisarAhora}>{revisando ? "Preguntando…" : "Revisar ahora"}</Btn>
              </div>
            )}
            {!t.meta && t.revision && t.revision.estado === "REJECTED" && (
              <div style={{ marginTop: 7 }}>
                <Pill color={C.clay} soft={C.claySoft}>Rechazada en Meta{t.revision.rechazo ? ` · ${MOTIVO_RECHAZO[t.revision.rechazo] || t.revision.rechazo}` : ""}</Pill>
              </div>
            )}
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
            {tab === "whatsapp" && <EnlaceMetaWa db={db} draft={draft} setDraft={setDraft} />}
            {!(tab === "whatsapp" && draft.meta) && (
              <Field def={{ label: tab === "email" && draft.html ? "Mensaje en texto (respaldo del diseño)" : "Mensaje", type: "textarea" }}
                value={draft.body} onChange={(v) => setDraft({ ...draft, body: v })} />
            )}
            {tab === "whatsapp" && !draft.meta && (
              <RevisionMetaWa db={db} draft={draft} setDraft={setDraft}
                onEnviada={(revision) => {
                  guardar({ ...draft, name: draft.name.trim() || revision.nombre, revision });
                  setDraft(null);
                  say("Enviada a Meta. Te aviso aquí cuando la aprueben.");
                }} />
            )}
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
   Automatizaciones
   ────────────────────────────────────────────────────────────
   Tres maneras de escribir la misma regla y una sola regla debajo. Se dicta en
   español, se arma con menús o se escribe línea a línea, y en cualquier momento
   se puede saltar de una forma a otra: lo que se dictó mal se corrige con un
   menú sin volver a redactar la frase.

   Lo que se dicta nunca se activa solo. Sale primero como reglas legibles —con
   lo que se entendió y lo que no— y activarla es un gesto aparte, porque una
   frase ambigua no puede acabar escribiéndole a doscientos contactos.
   ──────────────────────────────────────────────────────────── */

const ORIGEN = {
  vibe: { label: "Dictada", color: C.plum, soft: C.plumSoft },
  visual: { label: "Armada", color: C.blue, soft: C.blueSoft },
  codigo: { label: "Escrita", color: C.amber, soft: C.amberSoft },
};

const areaStyle = { ...inputStyle, minHeight: 92, resize: "vertical", lineHeight: 1.55, fontFamily: "var(--ui)" };
const codigoStyle = { ...inputStyle, minHeight: 190, resize: "vertical", fontFamily: "var(--mono)", fontSize: 12.5, lineHeight: 1.8 };

const Interruptor = ({ on, onClick, titulo }) => (
  <button className="crm-btn" onClick={onClick} title={titulo} aria-pressed={on}
    style={{ width: 38, height: 21, borderRadius: 999, border: "none", cursor: "pointer", padding: 2, background: on ? C.jade : "#C8CFC6", display: "flex", justifyContent: on ? "flex-end" : "flex-start", transition: "background .15s" }}>
    <span style={{ width: 17, height: 17, borderRadius: 999, background: "#fff", display: "block" }} />
  </button>
);

const Etiqueta = ({ children }) => (
  <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: C.faint, letterSpacing: ".09em", textTransform: "uppercase", marginBottom: 5 }}>{children}</div>
);

const Renglon = ({ children, onQuitar }) => (
  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", background: "#F7F9F5", border: `1px solid ${C.line}`, borderRadius: 7, padding: "7px 8px" }}>
    {children}
    {onQuitar && <button className="crm-btn" onClick={onQuitar} title="Quitar" style={{ marginLeft: "auto", background: "transparent", border: "none", cursor: "pointer", color: C.faint, padding: 3, borderRadius: 5 }}><X size={14} /></button>}
  </div>
);

const sel = { ...inputStyle, width: "auto", padding: "5px 7px", fontSize: 12.5 };

/* La espera se guarda en minutos y se muestra en la unidad más grande que dé
   redonda: 1440 se lee "1 día" y no "1440 minutos". */
const UNI = [["m", 1, "minutos"], ["h", 60, "horas"], ["d", 1440, "días"]];
/* Sin espera no se pinta nada: casi ninguna acción la lleva, y tres renglones
   diciendo "tras 0 minutos" hacen creer que hay una demora donde no la hay. */
const EsperaCtl = ({ min, onChange }) => {
  if (!min) {
    return (
      <button className="crm-btn" onClick={() => onChange(10)} title="Esperar antes de hacerlo"
        style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "transparent", border: "none", cursor: "pointer", color: C.faint, fontFamily: "var(--ui)", fontSize: 11.5, padding: "3px 5px", borderRadius: 5 }}>
        <Clock size={12} /> al instante
      </button>
    );
  }
  const u = [...UNI].reverse().find(([, f]) => min % f === 0) || UNI[0];
  const n = min / u[1];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <Clock size={12} color={C.faint} />
      <span style={{ fontFamily: "var(--ui)", fontSize: 12, color: C.faint }}>tras</span>
      <input className="crm-in" type="number" min="0" value={n} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0) * u[1])}
        style={{ ...sel, width: 58 }} />
      <select className="crm-in" value={u[0]} onChange={(e) => onChange(n * (UNI.find(([k]) => k === e.target.value) || UNI[0])[1])} style={sel}>
        {UNI.map(([k, , l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    </span>
  );
};

/* Un valor de una propiedad de lista se elige; uno libre se escribe. */
const ValorCtl = ({ db, entidad, campo, value, onChange, ancho = 168 }) => {
  const f = campoDe(db, entidad, campo);
  if (f && (f.options || []).length) {
    return (
      <select className="crm-in" value={value} onChange={(e) => onChange(e.target.value)} style={{ ...sel, maxWidth: ancho + 40 }}>
        <option value="">— elige —</option>
        {f.options.map((o) => <option key={o}>{o}</option>)}
      </select>
    );
  }
  return <input className="crm-in" value={value} onChange={(e) => onChange(e.target.value)} placeholder="valor" style={{ ...sel, width: ancho }} />;
};

function AutomationsView({ db, setDb, say, setDetail, onAtender, onCerrar }) {
  const [tab, setTab] = useState("reglas");
  const [editando, setEditando] = useState(null);
  const [prueba, setPrueba] = useState(null);

  const cola = db.autoCola || [];
  const porAtender = cola.filter((x) => x.estado === "listo");
  const programados = cola.filter((x) => x.estado === "espera");
  const cerrados = cola.filter((x) => ["hecho", "fallo", "descartado"].includes(x.estado));
  const activas = db.automations.filter((a) => a.activa).length;

  const guardar = (a) => {
    setDb((d) => {
      const existe = d.automations.some((x) => x.id === a.id);
      return { ...d, automations: existe ? d.automations.map((x) => (x.id === a.id ? a : x)) : [...d.automations, a] };
    });
    setEditando(null);
    say("Automatización guardada");
  };

  const cambiar = (id, parche) => setDb((d) => ({ ...d, automations: d.automations.map((a) => (a.id === id ? normalizaAutomatizacion({ ...a, ...parche }) : a)) }));
  const borrar = (id) => setDb((d) => ({ ...d, automations: d.automations.filter((a) => a.id !== id) }));

  /* Prender una regla rota no falla en silencio: se dice qué le falta y se
     queda apagada. El día que le toque disparar ya no habrá nadie mirando. */
  const alternar = (a) => {
    const faltas = avisosDe(a, db);
    if (!a.activa && faltas.length) { say(faltas[0]); return; }
    cambiar(a.id, { activa: !a.activa });
    say(a.activa ? `«${a.nombre}» pausada` : `«${a.nombre}» activada`);
  };

  /* Probar no ejecuta nada: cuenta a cuántas fichas de las que ya hay
     alcanzarían las condiciones. Contesta la pregunta que da miedo antes de
     encender —"¿a cuántos les va a escribir esto?"— sin escribirle a nadie. */
  const probar = (a) => {
    const ent = eventoDe(a.cuando.evento).entidad;
    const lista = db[coleccionDe(ent)] || [];
    setPrueba({ auto: a, ent, total: lista.length, pasan: lista.filter((r) => a.si.every((c) => cumple(c, r))) });
  };

  const TABS = [["reglas", "Reglas", db.automations.length], ["pendientes", "Pendientes", porAtender.length + programados.length], ["historial", "Historial", 0]];

  return (
    <div>
      <Header eyebrow={db.automations.length ? `${activas} activa${activas === 1 ? "" : "s"} de ${db.automations.length}` : "Nada corriendo todavía"}
        title="Automatizaciones"
        right={<>
          <Btn variant="outline" Icon={Plus} onClick={() => setEditando({ ...automatizacionVacia(), origen: "visual" })}>En blanco</Btn>
          <Btn variant="solid" Icon={Sparkles} onClick={() => setEditando({ ...automatizacionVacia(), origen: "vibe", dictar: true })}>Dictar una</Btn>
        </>} />

      <div style={{ padding: "14px 28px", display: "flex", gap: 7, borderBottom: `1px solid ${C.line}`, flexWrap: "wrap" }}>
        {TABS.map(([k, l, n]) => (
          <button key={k} onClick={() => setTab(k)} className="crm-btn"
            style={{ border: `1px solid ${tab === k ? C.jade : C.line}`, background: tab === k ? C.jade : C.panel, color: tab === k ? "#fff" : C.mute, borderRadius: 999, padding: "5px 13px", fontFamily: "var(--ui)", fontSize: 12.5, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            {l}{n > 0 && <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, opacity: tab === k ? 0.85 : 0.7 }}>{n}</span>}
          </button>
        ))}
      </div>

      {tab === "reglas" && (
        <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 12 }}>
          {db.automations.length === 0 && (
            <Empty title="Todavía no hay automatizaciones"
              hint="Dicta lo que quieres que pase —«cuando entre un contacto nuevo de Meta Lead Ads, mándale el WhatsApp de bienvenida»— y el CRM lo convierte en reglas que puedes revisar antes de encender."
              action={<Btn variant="solid" Icon={Sparkles} onClick={() => setEditando({ ...automatizacionVacia(), origen: "vibe", dictar: true })}>Dictar la primera</Btn>} />
          )}
          {db.automations.map((a) => (
            <TarjetaRegla key={a.id} a={a} db={db}
              onAlternar={() => alternar(a)}
              onEditar={() => setEditando(a)}
              onDuplicar={() => { const c = normalizaAutomatizacion({ ...a, id: undefined, nombre: `${a.nombre} (copia)`, activa: false, corridas: 0, ultimaEn: "" }); guardar(c); }}
              onBorrar={() => { borrar(a.id); say("Automatización eliminada"); }}
              onProbar={() => probar(a)} />
          ))}
        </div>
      )}

      {tab === "pendientes" && (
        <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 18 }}>
          {porAtender.length === 0 && programados.length === 0 && cerrados.length === 0 && (
            <Empty title="Nada esperando" hint="Aquí caen los envíos que una automatización preparó y los avisos que dejó, para que los apruebes uno por uno." />
          )}
          {porAtender.length > 0 && (
            <Grupo titulo="Esperan tu visto bueno" n={porAtender.length}>
              {porAtender.map((p) => <FilaPendiente key={p.id} p={p} db={db} setDetail={setDetail} onAtender={onAtender} onCerrar={onCerrar} say={say} />)}
            </Grupo>
          )}
          {programados.length > 0 && (
            <Grupo titulo="Programados" n={programados.length}>
              {programados.map((p) => <FilaPendiente key={p.id} p={p} db={db} setDetail={setDetail} onAtender={onAtender} onCerrar={onCerrar} say={say} />)}
            </Grupo>
          )}
          {cerrados.length > 0 && (
            <Grupo titulo="Ya atendidos" n={cerrados.length}
              extra={<Btn size="sm" variant="ghost" Icon={Trash2} onClick={() => { setDb((d) => ({ ...d, autoCola: d.autoCola.filter((x) => !["hecho", "fallo", "descartado"].includes(x.estado)) })); say("Lista limpia"); }}>Limpiar</Btn>}>
              {cerrados.slice(0, 40).map((p) => <FilaPendiente key={p.id} p={p} db={db} setDetail={setDetail} onAtender={onAtender} onCerrar={onCerrar} say={say} />)}
            </Grupo>
          )}
        </div>
      )}

      {tab === "historial" && (
        <div style={{ padding: 28 }}>
          {(db.autoLog || []).length === 0 && <Empty title="Sin historial" hint="Cada vez que una automatización haga algo, quedará anotado aquí." />}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {(db.autoLog || []).map((l) => {
              const col = l.nivel === "fallo" ? C.clay : l.nivel === "ok" ? C.jade : l.nivel === "espera" ? C.amber : C.faint;
              return (
                <div key={l.id} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "8px 0", borderBottom: "1px solid #EEF1EC" }}>
                  <span style={{ width: 7, height: 7, borderRadius: 99, background: col, flexShrink: 0, transform: "translateY(-1px)" }} />
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: C.faint, whiteSpace: "nowrap" }}>{fmt(l.at)}</span>
                  <span style={{ fontFamily: "var(--ui)", fontSize: 12.5, color: C.mute, whiteSpace: "nowrap", maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis" }}>{l.auto}</span>
                  <span style={{ fontFamily: "var(--ui)", fontSize: 13, color: C.ink }}>{l.texto}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {editando && (
        <EditorAutomatizacion db={db} inicial={editando} onClose={() => setEditando(null)} onSave={guardar} />
      )}

      {prueba && (
        <Modal title="Prueba en seco" subtitle={`«${prueba.auto.nombre || "Sin nombre"}» · no se envió ni se cambió nada`} onClose={() => setPrueba(null)}
          footer={<Btn variant="outline" onClick={() => setPrueba(null)}>Cerrar</Btn>}>
          <Prose>
            De {prueba.total} {prueba.ent === "deal" ? "negocios" : prueba.ent === "company" ? "empresas" : "contactos"} que hay hoy,{" "}
            <strong style={{ color: C.ink }}>{prueba.pasan.length}</strong> cumplen las condiciones.
            {prueba.auto.si.length === 0 && " Sin condiciones, la regla alcanza a todos los que disparen el evento."}
          </Prose>
          {prueba.pasan.length > 0 && (
            <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {prueba.pasan.slice(0, 12).map((r) => <Pill key={r.id}>{titleOf(prueba.ent, r)}</Pill>)}
              {prueba.pasan.length > 12 && <Pill soft="transparent" color={C.faint}>y {prueba.pasan.length - 12} más</Pill>}
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <Etiqueta>Lo que haría con cada uno</Etiqueta>
            <Prose>
              {prueba.auto.entonces.map((x, i) => <div key={i}>· {textoAccion(x, db, prueba.ent)}</div>)}
              {prueba.auto.entonces.length === 0 && "Nada: no tiene acciones."}
            </Prose>
          </div>
          <div style={{ marginTop: 14, fontFamily: "var(--ui)", fontSize: 12, color: C.faint, lineHeight: 1.6 }}>
            Esto sólo mide las condiciones contra lo que ya está guardado. La regla dispara con «{eventoDe(prueba.auto.cuando.evento).label.toLowerCase()}», que es algo que pasa de aquí en adelante: no actúa sobre las fichas viejas.
          </div>
        </Modal>
      )}
    </div>
  );
}

const Grupo = ({ titulo, n, extra, children }) => (
  <div>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
      <Etiqueta>{titulo}</Etiqueta>
      <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: C.faint, marginTop: -5 }}>{n}</span>
      <span style={{ marginLeft: "auto", marginTop: -5 }}>{extra}</span>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
  </div>
);

function TarjetaRegla({ a, db, onAlternar, onEditar, onDuplicar, onBorrar, onProbar }) {
  const r = resumenDe(a, db);
  const faltas = avisosDe(a, db);
  const org = ORIGEN[a.origen] || ORIGEN.visual;
  return (
    <div style={{ background: C.panel, border: `1px solid ${a.activa ? C.jadeSoft : C.line}`, borderRadius: 9, padding: 16, opacity: a.activa ? 1 : 0.82 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Interruptor on={a.activa} onClick={onAlternar} titulo={a.activa ? "Pausar" : "Activar"} />
        <div style={{ fontFamily: "var(--display)", fontSize: 15, fontWeight: 600 }}>{a.nombre || "Sin nombre"}</div>
        <Pill color={org.color} soft={org.soft}>{org.label}</Pill>
        {a.modo === "auto" && <Pill color={C.amber} soft={C.amberSoft}>Sin preguntar</Pill>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          <Btn size="sm" variant="ghost" Icon={Gauge} onClick={onProbar}>Probar</Btn>
          <Btn size="sm" variant="ghost" Icon={Pencil} onClick={onEditar}>Editar</Btn>
          <Btn size="sm" variant="ghost" Icon={Copy} onClick={onDuplicar} />
          <Btn size="sm" variant="ghost" Icon={Trash2} onClick={onBorrar} />
        </div>
      </div>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "76px 1fr", gap: "6px 12px", alignItems: "baseline" }}>
        <Etiqueta>Cuando</Etiqueta>
        <div style={{ fontFamily: "var(--ui)", fontSize: 13, color: C.ink }}>{r.cuando}</div>
        {r.si.length > 0 && <><Etiqueta>Sólo si</Etiqueta>
          <div style={{ fontFamily: "var(--ui)", fontSize: 13, color: C.ink }}>{r.si.join(" · ")}</div></>}
        <Etiqueta>Entonces</Etiqueta>
        <div style={{ fontFamily: "var(--ui)", fontSize: 13, color: C.ink, display: "flex", flexDirection: "column", gap: 2 }}>
          {r.haz.map((h, i) => <div key={i}>{h}</div>)}
          {r.haz.length === 0 && <span style={{ color: C.faint }}>nada todavía</span>}
        </div>
      </div>

      {faltas.length > 0 && (
        <div style={{ marginTop: 11, background: C.claySoft, border: `1px solid ${C.claySoft}`, borderRadius: 7, padding: "8px 10px", display: "flex", gap: 8 }}>
          <AlertTriangle size={14} color={C.clay} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontFamily: "var(--ui)", fontSize: 12.5, color: C.clay, lineHeight: 1.55 }}>
            {faltas.map((f, i) => <div key={i}>{f}</div>)}
          </div>
        </div>
      )}

      <div style={{ marginTop: 11, fontFamily: "var(--mono)", fontSize: 11, color: C.faint }}>
        {a.corridas > 0 ? `${a.corridas} disparo${a.corridas === 1 ? "" : "s"} · último ${fmt(a.ultimaEn)}` : "Nunca ha disparado"}
      </div>
    </div>
  );
}

function FilaPendiente({ p, db, setDetail, onAtender, onCerrar, say }) {
  const ent = p.kind === "company" ? "company" : p.kind === "deal" ? "deal" : "contact";
  const rec = buscarFicha(db, p.kind, p.recId);
  const abierto = p.estado === "listo" || p.estado === "espera";
  const col = p.estado === "fallo" ? C.clay : p.estado === "hecho" ? C.jade : p.estado === "descartado" ? C.faint : p.estado === "espera" ? C.amber : C.blue;
  const esAviso = p.accion.tipo === "aviso";

  const descartar = () => { onCerrar(p.id, "descartado", "", null); say("Descartado"); };
  const marcarVisto = () => { onCerrar(p.id, "hecho", "", null); };

  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderLeft: `3px solid ${col}`, borderRadius: 7, padding: "10px 12px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ minWidth: 200, flex: "1 1 320px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          {rec ? (
            <button onClick={() => setDetail({ kind: ent, id: p.recId })} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "var(--ui)", fontSize: 13.5, fontWeight: 600, color: C.jade }}>{titleOf(ent, rec)}</button>
          ) : <span style={{ fontFamily: "var(--ui)", fontSize: 13.5, color: C.faint }}>Ficha eliminada</span>}
          <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: C.faint }}>· {p.auto}</span>
        </div>
        <div style={{ fontFamily: "var(--ui)", fontSize: 12.5, color: C.mute, marginTop: 3 }}>
          {esAviso ? p.accion.texto : textoAccion(p.accion, db, ent)}
        </div>
        {p.estado === "espera" && <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: C.amber, marginTop: 3 }}>Sale {fmt(p.listaEn)}</div>}
        {p.nota && <div style={{ fontFamily: "var(--ui)", fontSize: 12, color: C.clay, marginTop: 3 }}>{p.nota}</div>}
      </div>
      <div style={{ display: "flex", gap: 5, marginLeft: "auto" }}>
        {abierto && esAviso && <Btn size="sm" variant="outline" Icon={Check} onClick={marcarVisto}>Visto</Btn>}
        {abierto && !esAviso && p.estado === "listo" && rec && (
          <Btn size="sm" variant="solid" Icon={Send} onClick={() => onAtender(p)}>
            {p.accion.tipo === "whatsapp" ? "Abrir WhatsApp" : "Enviar"}
          </Btn>
        )}
        {p.estado === "fallo" && rec && <Btn size="sm" variant="outline" Icon={RefreshCw} onClick={() => onAtender(p)}>Reintentar</Btn>}
        {p.estado !== "descartado" && p.estado !== "hecho" && <Btn size="sm" variant="ghost" Icon={X} onClick={descartar} />}
        {(p.estado === "hecho" || p.estado === "descartado") && <Pill color={col} soft="#F1F3EE">{p.estado === "hecho" ? "Hecho" : "Descartado"}</Pill>}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   El editor: tres pestañas sobre la misma regla
   ──────────────────────────────────────────────────────────── */
function EditorAutomatizacion({ db, inicial, onClose, onSave }) {
  const [draft, setDraft] = useState(() => normalizaAutomatizacion(inicial));
  const [tab, setTab] = useState(inicial.dictar || inicial.origen === "vibe" ? "dictar" : "reglas");
  const [dictado, setDictado] = useState(inicial.dictado || "");
  const [vibe, setVibe] = useState(null);

  const faltas = avisosDe(draft, db);
  const nuevo = !db.automations.some((a) => a.id === draft.id);

  const interpretar = () => {
    const r = compilarVibe(dictado, db);
    setVibe(r);
    /* Se conserva la identidad y si estaba encendida: volver a dictar es
       corregir la misma regla, no crear otra que deje huérfano su historial. */
    setDraft(normalizaAutomatizacion({ ...r.auto, id: draft.id, activa: draft.activa, corridas: draft.corridas, ultimaEn: draft.ultimaEn, creadaEn: draft.creadaEn }));
  };

  const TABS = [["dictar", "Dictar", Sparkles], ["reglas", "Reglas", ListChecks], ["codigo", "Código", Braces]];

  return (
    <Modal wide title={nuevo ? "Nueva automatización" : "Automatización"}
      subtitle="Dícta­la, ármala con menús o escríbela. Son la misma regla vista de tres maneras."
      onClose={onClose}
      footer={<>
        <div style={{ marginRight: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <Interruptor on={draft.activa} onClick={() => {
            if (!draft.activa && faltas.length) return;
            setDraft({ ...draft, activa: !draft.activa });
          }} titulo="Activa" />
          <span style={{ fontFamily: "var(--ui)", fontSize: 12.5, color: faltas.length && !draft.activa ? C.faint : C.mute }}>
            {draft.activa ? "Activa al guardar" : faltas.length ? "No se puede activar todavía" : "Guardar pausada"}
          </span>
        </div>
        <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
        <Btn variant="solid" Icon={Check} onClick={() => onSave(normalizaAutomatizacion(draft))}>Guardar</Btn>
      </>}>

      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {TABS.map(([k, l, Icon]) => (
          <button key={k} onClick={() => setTab(k)} className="crm-btn"
            style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${tab === k ? C.jade : C.line}`, background: tab === k ? C.jadeSoft : C.panel, color: tab === k ? C.jade : C.mute, borderRadius: 999, padding: "5px 13px", fontFamily: "var(--ui)", fontSize: 12.5, fontWeight: tab === k ? 600 : 400, cursor: "pointer" }}>
            <Icon size={13} /> {l}
          </button>
        ))}
      </div>

      {tab === "dictar" && (
        <PanelDictado db={db} dictado={dictado} setDictado={setDictado} vibe={vibe} interpretar={interpretar} draft={draft} irAReglas={() => setTab("reglas")} />
      )}
      {tab === "reglas" && <PanelReglas db={db} draft={draft} setDraft={setDraft} />}
      {tab === "codigo" && <PanelCodigo db={db} draft={draft} setDraft={setDraft} />}

      {faltas.length > 0 && (
        <div style={{ marginTop: 16, background: C.claySoft, borderRadius: 7, padding: "9px 11px", display: "flex", gap: 8 }}>
          <AlertTriangle size={14} color={C.clay} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontFamily: "var(--ui)", fontSize: 12.5, color: C.clay, lineHeight: 1.55 }}>
            {faltas.map((f, i) => <div key={i}>{f}</div>)}
          </div>
        </div>
      )}
    </Modal>
  );
}

function PanelDictado({ db, dictado, setDictado, vibe, interpretar, draft, irAReglas }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <Etiqueta>Dilo como se lo dirías a alguien</Etiqueta>
        <textarea className="crm-in" value={dictado} onChange={(e) => setDictado(e.target.value)} style={areaStyle}
          placeholder="Cuando entre un contacto nuevo de Meta Lead Ads, mándale el WhatsApp de bienvenida a los 10 minutos y márcalo como Abierto." />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {EJEMPLOS.slice(0, 4).map((e) => (
          <button key={e} className="crm-btn" onClick={() => setDictado(e)}
            style={{ border: `1px dashed ${C.line}`, background: "transparent", color: C.mute, borderRadius: 999, padding: "4px 10px", fontFamily: "var(--ui)", fontSize: 11.5, cursor: "pointer", textAlign: "left" }}>
            {e.length > 62 ? `${e.slice(0, 62)}…` : e}
          </button>
        ))}
      </div>

      <div><Btn variant="solid" Icon={Sparkles} onClick={interpretar} disabled={!dictado.trim()}>Convertir en reglas</Btn></div>

      {vibe && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
          {vibe.entendido.length > 0 && (
            <div>
              <Etiqueta>Lo que entendí</Etiqueta>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {vibe.entendido.map((e, i) => (
                  <div key={i} style={{ display: "flex", gap: 7, fontFamily: "var(--ui)", fontSize: 13, color: C.ink, lineHeight: 1.5 }}>
                    <Check size={14} color={C.jade} style={{ flexShrink: 0, marginTop: 3 }} />{e}
                  </div>
                ))}
              </div>
            </div>
          )}

          {vibe.dudas.length > 0 && (
            <div>
              <Etiqueta>Lo que no pude resolver</Etiqueta>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {vibe.dudas.map((e, i) => (
                  <div key={i} style={{ display: "flex", gap: 7, fontFamily: "var(--ui)", fontSize: 13, color: C.clay, lineHeight: 1.5 }}>
                    <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 3 }} />{e}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 7 }}><Btn size="sm" variant="outline" Icon={ListChecks} onClick={irAReglas}>Terminarla en Reglas</Btn></div>
            </div>
          )}

          <div>
            <Etiqueta>La regla, escrita</Etiqueta>
            <pre style={{ margin: 0, background: "#F4F6F1", border: `1px solid ${C.line}`, borderRadius: 7, padding: "10px 12px", fontFamily: "var(--mono)", fontSize: 12, lineHeight: 1.75, color: C.ink, overflowX: "auto" }}>{aDsl(draft)}</pre>
          </div>
        </div>
      )}

      {!vibe && (
        <div style={{ fontFamily: "var(--ui)", fontSize: 12.5, color: C.faint, lineHeight: 1.6, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
          Nada se activa por dictarlo. Al convertir verás la regla en limpio, con lo que entendí y lo que no; encenderla es un paso aparte.
          Conoce tus plantillas, tus etapas y las propiedades que hayas creado, así que puedes nombrarlas tal cual.
        </div>
      )}
    </div>
  );
}

function PanelReglas({ db, draft, setDraft }) {
  const ev = eventoDe(draft.cuando.evento);
  const ent = ev.entidad;
  const campos = camposDe(db, ent);
  const etapas = etapasDe(db);
  const set = (parche) => setDraft(normalizaAutomatizacion({ ...draft, ...parche }));
  const setAccion = (i, parche) => set({ entonces: draft.entonces.map((x, j) => (j === i ? { ...x, ...parche } : x)) });
  const grupos = [...new Set(EVENTOS.map((e) => e.grupo))];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <Etiqueta>Nombre</Etiqueta>
        <input className="crm-in" value={draft.nombre} onChange={(e) => set({ nombre: e.target.value })} placeholder="Bienvenida a los leads de Meta" style={inputStyle} />
      </div>

      <div>
        <Etiqueta>Cuando</Etiqueta>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <select className="crm-in" value={draft.cuando.evento} onChange={(e) => set({ cuando: { evento: e.target.value, arg: "" } })} style={{ ...sel, minWidth: 260 }}>
            {grupos.map((g) => (
              <optgroup key={g} label={g}>
                {EVENTOS.filter((e) => e.grupo === g).map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
              </optgroup>
            ))}
          </select>
          {ev.arg && (
            <>
              <span style={{ fontFamily: "var(--ui)", fontSize: 12, color: C.faint }}>{ev.arg.label}</span>
              {ev.arg.tipo === "etapa" && (
                <select className="crm-in" value={draft.cuando.arg} onChange={(e) => set({ cuando: { ...draft.cuando, arg: e.target.value } })} style={sel}>
                  <option value="">{ev.arg.vacio}</option>
                  {etapas.map((x) => <option key={x}>{x}</option>)}
                </select>
              )}
              {ev.arg.tipo === "campo" && (
                <select className="crm-in" value={draft.cuando.arg} onChange={(e) => set({ cuando: { ...draft.cuando, arg: e.target.value } })} style={sel}>
                  <option value="">{ev.arg.vacio}</option>
                  {campos.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
              )}
              {ev.arg.tipo === "canal" && (
                <select className="crm-in" value={draft.cuando.arg} onChange={(e) => set({ cuando: { ...draft.cuando, arg: e.target.value } })} style={sel}>
                  <option value="">{ev.arg.vacio}</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">Correo</option>
                </select>
              )}
              {ev.arg.tipo === "dias" && (
                <input className="crm-in" type="number" min="1" value={draft.cuando.arg || ev.arg.vacio}
                  onChange={(e) => set({ cuando: { ...draft.cuando, arg: String(Math.max(1, Number(e.target.value) || 1)) } })} style={{ ...sel, width: 70 }} />
              )}
            </>
          )}
        </div>
        <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, color: C.faint, marginTop: 5 }}>
          Actúa sobre {ent === "deal" ? "el negocio" : ent === "company" ? "la empresa" : "el contacto"} que provocó el evento.
        </div>
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Etiqueta>Sólo si</Etiqueta>
          <Btn size="sm" variant="ghost" Icon={Plus} style={{ marginTop: -5 }}
            onClick={() => set({ si: [...draft.si, { campo: (campos[0] || {}).key || "", op: "es", valor: "" }] })}>Condición</Btn>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {draft.si.length === 0 && <Prose>Sin condiciones: dispara siempre que ocurra el evento.</Prose>}
          {draft.si.map((c, i) => {
            const op = OPERADORES.find((o) => o.key === c.op) || OPERADORES[0];
            return (
              <Renglon key={i} onQuitar={() => set({ si: draft.si.filter((_, j) => j !== i) })}>
                <select className="crm-in" value={c.campo} onChange={(e) => set({ si: draft.si.map((x, j) => (j === i ? { ...x, campo: e.target.value, valor: "" } : x)) })} style={sel}>
                  {!campos.some((f) => f.key === c.campo) && <option value={c.campo}>{c.campo || "—"}</option>}
                  {campos.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
                <select className="crm-in" value={c.op} onChange={(e) => set({ si: draft.si.map((x, j) => (j === i ? { ...x, op: e.target.value } : x)) })} style={sel}>
                  {OPERADORES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
                {op.valor && <ValorCtl db={db} entidad={ent} campo={c.campo} value={c.valor} onChange={(v) => set({ si: draft.si.map((x, j) => (j === i ? { ...x, valor: v } : x)) })} />}
              </Renglon>
            );
          })}
        </div>
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Etiqueta>Entonces</Etiqueta>
          <Btn size="sm" variant="ghost" Icon={Plus} style={{ marginTop: -5 }}
            onClick={() => set({ entonces: [...draft.entonces, { tipo: "aviso", texto: "", tras: 0 }] })}>Acción</Btn>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {draft.entonces.length === 0 && <Prose>Todavía no hace nada.</Prose>}
          {draft.entonces.map((x, i) => (
            <Renglon key={i} onQuitar={() => set({ entonces: draft.entonces.filter((_, j) => j !== i) })}>
              <select className="crm-in" value={x.tipo} onChange={(e) => set({ entonces: draft.entonces.map((y, j) => (j === i ? { tipo: e.target.value, tras: y.tras } : y)) })} style={sel}>
                {ACCIONES.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
              </select>

              {(x.tipo === "whatsapp" || x.tipo === "correo") && (() => {
                const lista = (db.templates[x.tipo === "correo" ? "email" : "whatsapp"]) || [];
                return (
                  <select className="crm-in" value={x.plantilla} onChange={(e) => setAccion(i, { plantilla: e.target.value })} style={{ ...sel, maxWidth: 230 }}>
                    <option value="">— elige plantilla —</option>
                    {!lista.some((t) => t.name === x.plantilla) && x.plantilla && <option value={x.plantilla}>{x.plantilla} (no existe)</option>}
                    {lista.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                  </select>
                );
              })()}

              {x.tipo === "propiedad" && (<>
                <select className="crm-in" value={x.campo} onChange={(e) => setAccion(i, { campo: e.target.value, valor: "" })} style={sel}>
                  <option value="">— propiedad —</option>
                  {campos.filter((f) => !f.readOnly).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
                <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: C.faint }}>=</span>
                <ValorCtl db={db} entidad={ent} campo={x.campo} value={x.valor} onChange={(v) => setAccion(i, { valor: v })} />
              </>)}

              {x.tipo === "etapa" && (
                <select className="crm-in" value={x.etapa} onChange={(e) => setAccion(i, { etapa: e.target.value })} style={sel}>
                  <option value="">— etapa —</option>
                  {etapas.map((e2) => <option key={e2}>{e2}</option>)}
                </select>
              )}

              {x.tipo === "negocio" && (<>
                <input className="crm-in" value={x.nombre} onChange={(e) => setAccion(i, { nombre: e.target.value })} placeholder="nombre (vacío = el de la ficha)" style={{ ...sel, width: 200 }} />
                <select className="crm-in" value={x.etapa} onChange={(e) => setAccion(i, { etapa: e.target.value })} style={sel}>
                  {etapas.map((e2) => <option key={e2}>{e2}</option>)}
                </select>
                <input className="crm-in" type="number" value={x.valor} onChange={(e) => setAccion(i, { valor: e.target.value })} placeholder="valor" style={{ ...sel, width: 96 }} />
              </>)}

              {(x.tipo === "nota" || x.tipo === "aviso") && (
                <input className="crm-in" value={x.texto} onChange={(e) => setAccion(i, { texto: e.target.value })}
                  placeholder={x.tipo === "nota" ? "qué anotar en la ficha" : "qué avisarte"} style={{ ...sel, flex: "1 1 220px", minWidth: 160 }} />
              )}

              <EsperaCtl min={x.tras} onChange={(v) => setAccion(i, { tras: v })} />
            </Renglon>
          ))}
        </div>
      </div>

      <div>
        <Etiqueta>Con los envíos y los avisos</Etiqueta>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[["sugerir", "Déjalos en Pendientes y los apruebo yo", "Lo más seguro: nada sale sin que alguien lo lea."],
            ["auto", "Que salgan solos", "Los correos salen sin preguntar si Gmail está conectado. Un WhatsApp siempre pide un clic, porque lo abre el navegador."]].map(([k, l, sub]) => (
            <label key={k} style={{ display: "flex", gap: 9, alignItems: "flex-start", cursor: "pointer", background: draft.modo === k ? "#F4F6F1" : "transparent", border: `1px solid ${draft.modo === k ? C.line : "transparent"}`, borderRadius: 7, padding: "8px 10px" }}>
              <input type="radio" name={`modo-${draft.id}`} checked={draft.modo === k} onChange={() => set({ modo: k })} style={{ marginTop: 3 }} />
              <span>
                <span style={{ fontFamily: "var(--ui)", fontSize: 13, color: C.ink, display: "block" }}>{l}</span>
                <span style={{ fontFamily: "var(--ui)", fontSize: 12, color: C.faint, lineHeight: 1.5 }}>{sub}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function PanelCodigo({ db, draft, setDraft }) {
  const [texto, setTexto] = useState(() => aDsl(draft));
  const [errores, setErrores] = useState([]);

  /* Se escribe libre y sólo se adopta lo que compila: mientras haya una línea a
     medio escribir, la regla de al lado sigue siendo la última buena. */
  const cambiar = (v) => {
    setTexto(v);
    const { auto, errores: errs } = deDsl(v, draft);
    setErrores(errs);
    if (!errs.length) setDraft(auto);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <Etiqueta>La regla, línea a línea</Etiqueta>
        <textarea className="crm-in" value={texto} onChange={(e) => cambiar(e.target.value)} spellCheck={false} style={codigoStyle} />
      </div>
      {errores.length > 0 ? (
        <div style={{ background: C.claySoft, borderRadius: 7, padding: "9px 11px", fontFamily: "var(--ui)", fontSize: 12.5, color: C.clay, lineHeight: 1.6 }}>
          {errores.map((e, i) => <div key={i}>{e}</div>)}
        </div>
      ) : (
        <div style={{ fontFamily: "var(--ui)", fontSize: 12, color: C.jade }}>Compila. Los cambios ya están en las otras dos pestañas.</div>
      )}
      <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
        <Etiqueta>La gramática entera</Etiqueta>
        <pre style={{ margin: 0, fontFamily: "var(--mono)", fontSize: 11.5, lineHeight: 1.8, color: C.mute, overflowX: "auto" }}>{`nombre  "Bienvenida a los leads de Meta"
cuando  ${EVENTOS.map((e) => e.key).join(" | ")}
si      <propiedad> ${OPERADORES.map((o) => (o.key === "noEs" ? "no-es" : o.key)).join(" | ")} "valor"
haz     whatsapp "Plantilla"        tras 10 minutos
haz     correo "Plantilla"          tras 2 horas
haz     propiedad leadStatus = "Abierto"
haz     etapa "Ganado"
haz     negocio "Nombre" etapa "Nuevo" valor 1200000
haz     nota "texto"   ·   haz aviso "texto"
modo    sugerir | auto`}</pre>
      </div>
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

/* Una línea de "esto sí, esto todavía no". El punto de color hace el trabajo
   de un párrafo: se ve de un vistazo qué falta y no hay que leer nada. */
const Estado = ({ ok, children, falta }) => (
  <div style={{ display: "flex", gap: 8, alignItems: "baseline", fontFamily: "var(--ui)", fontSize: 12.5, color: ok ? C.ink : C.mute, lineHeight: 1.6 }}>
    <span style={{ width: 7, height: 7, borderRadius: 99, flexShrink: 0, background: ok ? C.jade : C.faint, transform: "translateY(-1px)" }} />
    <span>{children}{!ok && falta ? <span style={{ color: C.faint }}> — falta {falta}</span> : null}</span>
  </div>
);

const Mono = ({ children }) => (
  <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, background: "#F1F3EE", padding: "1px 5px", borderRadius: 4, color: C.ink, overflowWrap: "anywhere" }}>{children}</span>
);

function ConnectionsView({ db, setDb, say, onLeads, onBuzon }) {
  const integ = db.integrations;
  const gmail = useGmail();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [probe, setProbe] = useState("");
  const [guide, setGuide] = useState(false);
  const [guiaMed, setGuiaMed] = useState(false);
  const [medProbe, setMedProbe] = useState({ tipo: "", texto: "" });
  /* Lo que contestó el puente cuando se le preguntó qué tiene enchufado. Nulo
     mientras no se le haya preguntado: la pantalla no supone nada del otro
     lado, porque la mitad de los problemas de esto son un secreto sin poner y
     adivinarlo desde aquí sería inventar. */
  const [salud, setSalud] = useState(null);
  const [guiaMeta, setGuiaMeta] = useState(false);
  const [guiaGads, setGuiaGads] = useState(false);
  const [leadProbe, setLeadProbe] = useState({ tipo: "", texto: "" });
  const [campanas, setCampanas] = useState(null);
  const [campProbe, setCampProbe] = useState({ tipo: "", texto: "" });

  const patch = (canal, p) => setDb((d) => ({
    ...d,
    integrations: normalizeIntegrations({ ...d.integrations, [canal]: { ...d.integrations[canal], ...p } }),
  }));

  const gente = [...db.contacts, ...db.companies];
  const conTel = gente.filter((r) => r.props.phone).length;
  const conMail = gente.filter((r) => r.props.email).length;

  const cc = integ.whatsapp.countryCode;
  const waModo = integ.whatsapp.modo;
  const ejemplo = probe || (gente.find((r) => r.props.phone) || {}).props?.phone || "";
  const resuelto = toE164(ejemplo, cc);

  const modo = integ.email.mode;
  const med = integ.medicion;
  const pu = integ.puente;
  const anun = integ.anuncios;
  const hayPuente = Boolean(pu.base && pu.clave);
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

  /* Preguntarle al puente qué tiene puesto. Es lo primero que hay que hacer
     cuando algo no funciona, y por eso su resultado se guarda y se enseña
     debajo de cada conexión: dice cuál secreto falta, con su nombre. */
  const revisarPuente = async () => {
    setBusy(true); setMedProbe({ tipo: "", texto: "" });
    try {
      const st = await probarPuente({ base: pu.base, clave: pu.clave });
      setSalud(st);
      setMedProbe({ tipo: "ok", texto: "El puente responde y la clave es la correcta." });
    } catch (e) {
      setSalud(null);
      setMedProbe({ tipo: "err", texto: (e && e.message) || String(e) });
    }
    setBusy(false);
  };

  const verCampanas = async () => {
    setBusy(true); setCampProbe({ tipo: "", texto: "" });
    try {
      const r = await traerCampanas({ base: pu.base, clave: pu.clave, meta: anun.meta, google: anun.google, dias: anun.dias });
      setCampanas(r.campanas);
      if (r.notas.length) setCampProbe({ tipo: "aviso", texto: r.notas.join(" · ") });
      else if (!r.campanas.length) setCampProbe({ tipo: "aviso", texto: "Ninguna campaña tuvo actividad en este periodo." });
    } catch (e) {
      setCampanas(null);
      setCampProbe({ tipo: "err", texto: (e && e.message) || String(e) });
    }
    setBusy(false);
  };

  /* Traer los leads desde aquí, sin esperar al barrido de Actividades. Sirve
     para lo de siempre: acabas de configurarlo y quieres ver si funciona. */
  const traerAhora = async () => {
    setBusy(true); setLeadProbe({ tipo: "", texto: "" });
    try {
      const r = await traerLeads({
        base: pu.base, clave: pu.clave,
        meta: anun.meta, google: anun.google,
        desde: db.buzon.leadsAl, dias: anun.dias,
      });
      const hecho = onLeads(r.leads, anun.destino);
      onBuzon({ leadsAl: nowISO() });
      const cuenta = hecho.leads
        ? `Entraron ${hecho.leads} lead(s)` + (hecho.fichas ? ` y ${hecho.fichas} ficha(s) nueva(s).` : ", todos de gente que ya estaba.")
        : r.leads.length
          ? "No entró ninguno: todos estaban ya traídos."
          : "Las plataformas no tienen leads nuevos.";
      /* Las notas son los fallos de una plataforma cuando la otra sí respondió.
         Van pegadas al resultado y no en lugar de él: callarlas convertiría un
         "Google está caído" en un "no llegó nadie". */
      setLeadProbe({ tipo: r.notas.length ? "aviso" : "ok", texto: [cuenta, ...r.notas].join(" · ") });
      if (hecho.leads) say(`${hecho.leads} lead(s) traídos`);
    } catch (e) {
      setLeadProbe({ tipo: "err", texto: (e && e.message) || String(e) });
    }
    setBusy(false);
  };

  /* El puente dice por quién sale WhatsApp; lo que falta configurar cambia. */
  const waTwilio = salud?.whatsapp?.proveedor === "twilio";

  return (
    <div>
      <Header eyebrow="Ajustes" title="Conexiones" />
      <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 20, maxWidth: 880 }}>

        {/* ── WhatsApp ── */}
        <Card title="WhatsApp"
          badge={waModo === "api"
            ? (salud
                ? (salud.whatsapp?.enviar
                    ? <Pill color={C.jade} soft={C.jadeSoft}>Conectado</Pill>
                    : <Pill color={C.clay} soft={C.claySoft}>{waTwilio ? "Falta configurar Twilio" : "Falta el token"}</Pill>)
                : <Pill color={C.amber} soft={C.amberSoft}>Sin probar</Pill>)
            : <Pill color={C.jade} soft={C.jadeSoft}>Listo para usar</Pill>}>
          <Prose>El CRM personaliza el mensaje con los datos de cada registro. Lo que cambia es quién lo manda.</Prose>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "14px 0" }}>
            {Object.entries(WHATSAPP_MODES).map(([key, label]) => (
              <label key={key} style={{ display: "flex", gap: 10, alignItems: "flex-start", border: "1px solid " + (waModo === key ? C.jade : C.line), background: waModo === key ? "#F7FAF8" : C.panel, borderRadius: 7, padding: "10px 12px", cursor: "pointer" }}>
                <input type="radio" name="modo-whatsapp" checked={waModo === key} onChange={() => patch("whatsapp", { modo: key })} style={{ marginTop: 2, accentColor: C.jade }} />
                <div>
                  <div style={{ fontFamily: "var(--ui)", fontSize: 13, fontWeight: 600 }}>{label}</div>
                  <div style={{ fontFamily: "var(--ui)", fontSize: 12, color: C.mute, marginTop: 2, lineHeight: 1.55 }}>
                    {key === "enlace" && "Se abre WhatsApp con el texto ya escrito en el chat correcto y tú das el último clic. Tu WhatsApp de siempre —el del celular o WhatsApp Web—, sin cuenta de empresa ni permisos de Meta. Funciona hoy, sin configurar nada."}
                    {key === "api" && (waTwilio
                      ? "El CRM lo manda por Twilio, desde tu número virtual, y no se abre ninguna ventana. Necesita el puente publicado y el número aprobado para WhatsApp en Twilio."
                      : "El CRM lo manda por la WhatsApp Cloud API y no se abre ninguna ventana. Necesita el puente publicado y una cuenta de empresa en Meta, o un número de Twilio.")}
                  </div>
                </div>
              </label>
            ))}
          </div>

          {waModo === "api" && (
            <div style={{ background: C.amberSoft, color: C.amber, borderRadius: 6, padding: "10px 12px", fontFamily: "var(--ui)", fontSize: 12.5, lineHeight: 1.6, marginBottom: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Dos reglas de Meta que conviene saber antes</div>
              <div style={{ color: C.ink }}>
                <b>La ventana de 24 horas.</b> Escribir texto libre sólo se puede si esa persona te escribió
                a ti en las últimas 24 horas. Fuera de esa ventana Meta rechaza el mensaje, y el CRM te lo
                dirá con esas palabras en vez de con un número de error.
                <br /><br />
                <b>Las plantillas.</b> Para <i>iniciar</i> una conversación hay que usar una plantilla que Meta
                aprobó antes, una por una, con un par de días de revisión. Es lo que impide que esto se use
                para escribirle en frío a una lista comprada.
                <br /><br />
                Por eso el modo de enlace no es el hermano pobre: para el primer mensaje a alguien que acaba
                de llegar por un anuncio, muchas veces es el único que funciona hoy.
              </div>
            </div>
          )}

          {waModo === "api" && salud && !salud.whatsapp?.enviar && (
            <div style={{ background: C.claySoft, color: C.clay, borderRadius: 6, padding: "10px 12px", fontFamily: "var(--ui)", fontSize: 12.5, lineHeight: 1.6 }}>
              {waTwilio ? <>
                El puente no puede mandar nada todavía. Falta <Mono>TWILIO_AUTH_TOKEN</Mono> como secreto,
                o <Mono>TWILIO_WA_FROM</Mono> —tu número de Twilio— en <Mono>tracker/wrangler.toml</Mono>.
                Los pasos están en <Mono>tracker/README.md</Mono>.
              </> : <>
                El puente no puede mandar nada todavía. Falta <Mono>WA_TOKEN</Mono> como secreto,
                o <Mono>WA_PHONE_ID</Mono> en <Mono>tracker/wrangler.toml</Mono> —que es el identificador del
                número remitente, no el número—. Cómo sacarlos está en la guía de la tarjeta de Meta.
              </>}
            </div>
          )}

          {waModo === "api" && hayPuente && (
            <div style={{ border: "1px solid " + C.line, borderRadius: 7, padding: "11px 12px", marginTop: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                <div style={{ fontFamily: "var(--ui)", fontSize: 13, fontWeight: 600 }}>Lo que te escriben</div>
                {salud && (salud.whatsapp?.ultimoRecibido
                  ? <Pill color={C.jade} soft={C.jadeSoft}>Último mensaje: {fmt(new Date(salud.whatsapp.ultimoRecibido).toISOString())}</Pill>
                  : salud.whatsapp?.recibir
                    ? <Pill color={C.amber} soft={C.amberSoft}>Aún no llega nada</Pill>
                    : <Pill color={C.clay} soft={C.claySoft}>Sin configurar</Pill>)}
              </div>
              <Prose>
                Las respuestas entran solas a Mensajes, en el hilo de cada persona, y el CRM las recoge cada minuto
                mientras esté abierto. Si quien escribe no está en el CRM, se crea su contacto con fuente WhatsApp.
                {waTwilio ? (
                <ol style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                  <li>En console.twilio.com → Messaging → Senders → WhatsApp senders, abre tu número.</li>
                  <li>En <b>Webhook URL for incoming messages</b> pon <Mono>{pu.base}/wa/twilio</Mono>, método <Mono>POST</Mono>.</li>
                  <li>Nada más: el puente comprueba la firma de Twilio con el mismo <Mono>TWILIO_AUTH_TOKEN</Mono>.</li>
                </ol>
                ) : (
                <ol style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                  <li>En el puente, guarda <Mono>WA_APP_SECRET</Mono> (la clave secreta de la app, en Configuración de la app → Básica) y <Mono>WA_VERIFY_TOKEN</Mono> (una palabra que inventes), con <Mono>wrangler secret put</Mono>.</li>
                  <li>En developers.facebook.com → tu app → WhatsApp → Configuración, en Webhook pon la URL <Mono>{pu.base}/wa/webhook</Mono> y esa misma palabra como token de verificación.</li>
                  <li>En los campos del webhook, suscríbete a <Mono>messages</Mono>.</li>
                </ol>
                )}
              </Prose>
            </div>
          )}

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

          <div style={{ borderTop: "1px solid " + C.line, paddingTop: 14, marginTop: 14 }}>
            <Field def={{ label: "Tope de correos por día", type: "number" }} value={integ.email.topeDiario}
              onChange={(v) => patch("email", { topeDiario: v })} />
            <Prose><div style={{ marginTop: 6, fontSize: 11.5, color: C.faint }}>Cuenta todo lo que sale de la cuenta en el día. Gmail deja unos 500 (Workspace, 2.000), pero mandar cerca de ese tope a diario es lo que lleva al bloqueo. Con una cuenta nueva, empieza por 20 o 30 y súbelo poco a poco.</div></Prose>
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

        {/* ── El puente ── */}
        <Card title="El puente"
          badge={!hayPuente
            ? <Pill color={C.mute} soft="#E6E9E3">Sin publicar</Pill>
            : salud
              ? <Pill color={C.jade} soft={C.jadeSoft}>Responde</Pill>
              : <Pill color={C.amber} soft={C.amberSoft}>Sin probar</Pill>}>
          <Prose>
            Casi todo el CRM vive en este navegador y con eso basta. Tres cosas no caben aquí, y las
            tres por el mismo motivo:
            <ul style={{ margin: "8px 0 0", paddingLeft: 17 }}>
              <li><b>Saber si abrieron un correo.</b> Eso pasa en la máquina de otra persona, horas
                después, con esta pestaña cerrada. Alguien tiene que estar despierto para recibir el aviso.</li>
              <li><b>Traer los leads de Meta y de Google.</b> Hablar con ellas exige un token que vale por
                tu cuenta entera —leer tus leads, gastar tu presupuesto—, y guardarlo aquí lo dejaría
                legible para cualquiera que abra este navegador. Google además ni lo permite: su API no
                acepta llamadas desde una página web.</li>
              <li><b>Mandar un WhatsApp de verdad.</b> Mismo token, mismo problema.</li>
            </ul>
            <br />
            Por eso hay un servicio diminuto que hay que publicar una vez. Está en la carpeta
            <Mono>tracker/</Mono> y corre gratis en Cloudflare. Los tokens viven allá, cifrados, y nunca
            bajan a este navegador: el CRM le pide las cosas y él es el único que habla con Meta y Google.
          </Prose>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
            <Field def={{ label: "Dirección del puente" }} value={pu.base}
              onChange={(v) => { setMedProbe({ tipo: "", texto: "" }); setSalud(null); patch("puente", { base: v }); }} />
            <Field def={{ label: "Clave" }} value={pu.clave}
              onChange={(v) => { setMedProbe({ tipo: "", texto: "" }); setSalud(null); patch("puente", { clave: v }); }} />
          </div>
          <Prose><div style={{ marginTop: 6, fontSize: 11.5, color: C.faint }}>
            La dirección es la que imprime <Mono>wrangler deploy</Mono>, algo como
            <Mono>https://crm-medidor.tu-cuenta.workers.dev</Mono>. La clave es la misma que guardaste
            con <Mono>wrangler secret put CLAVE</Mono>.
          </div></Prose>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <Btn variant="outline" Icon={Gauge} disabled={busy || !hayPuente} onClick={revisarPuente}>
              {busy ? "Preguntando…" : "Probar el puente"}
            </Btn>
            {medProbe.texto && (
              <Prose><span style={{ fontSize: 12, color: medProbe.tipo === "ok" ? C.jade : C.clay, fontWeight: 500 }}>{medProbe.texto}</span></Prose>
            )}
          </div>

          {salud && (
            <div style={{ marginTop: 14, background: "#F6F8F4", border: "1px solid " + C.line, borderRadius: 7, padding: "11px 13px", display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ fontFamily: "var(--ui)", fontSize: 12.5, fontWeight: 600, marginBottom: 3 }}>Qué tiene enchufado</div>
              <Estado ok>Medición de correos</Estado>
              <Estado ok={salud.meta?.leads} falta={<Mono>META_TOKEN</Mono>}>Leads de Meta</Estado>
              <Estado ok={salud.meta?.metricas} falta={<Mono>META_AD_ACCOUNT</Mono>}>Métricas de campaña de Meta</Estado>
              {salud.meta && "instagram" in salud.meta && <Estado ok={salud.meta.instagram} falta={<><Mono>META_TOKEN</Mono> y <Mono>META_PAGE_ID</Mono></>}>Publicar en Instagram desde el Estudio</Estado>}
              {salud.whatsapp?.proveedor === "twilio" ? <>
                <Estado ok={salud.whatsapp?.enviar} falta={<><Mono>TWILIO_AUTH_TOKEN</Mono> y <Mono>TWILIO_WA_FROM</Mono></>}>Envío de WhatsApp por Twilio</Estado>
                <Estado ok={salud.whatsapp?.plantillas} falta={<Mono>TWILIO_AUTH_TOKEN</Mono>}>Plantillas aprobadas de WhatsApp (Twilio)</Estado>
                <Estado ok={salud.whatsapp?.recibir} falta={<Mono>TWILIO_AUTH_TOKEN</Mono>}>Recibir WhatsApp (webhook de Twilio)</Estado>
              </> : <>
                <Estado ok={salud.whatsapp?.enviar} falta={<Mono>WA_TOKEN</Mono>}>Envío por WhatsApp Cloud API</Estado>
                <Estado ok={salud.whatsapp?.plantillas} falta={<Mono>WA_WABA_ID</Mono>}>Plantillas aprobadas de WhatsApp</Estado>
                <Estado ok={salud.whatsapp?.recibir} falta={<><Mono>WA_APP_SECRET</Mono> y <Mono>WA_VERIFY_TOKEN</Mono></>}>Recibir WhatsApp (webhook)</Estado>
              </>}
              <Estado ok={salud.google?.credenciales} falta={<Mono>GADS_CLIENT_SECRET</Mono>}>Credenciales de Google Ads</Estado>
              <Estado ok={salud.google?.developerToken} falta={<Mono>GADS_DEV_TOKEN</Mono>}>Developer token de Google Ads</Estado>
              <Estado ok={salud.google?.autorizado} falta="dar el permiso una vez">Permiso de Google Ads</Estado>
              <Prose><div style={{ marginTop: 6, fontSize: 11.5, color: C.faint }}>
                El puente contesta con síes y noes, nunca con el valor: un token no sale de allá ni
                recortado. Lo que falte se pone con <Mono>npx wrangler secret put NOMBRE</Mono>, dentro
                de la carpeta <Mono>tracker/</Mono>, y se vuelve a publicar.
              </div></Prose>
            </div>
          )}

          <button onClick={() => setGuiaMed(!guiaMed)} className="crm-btn"
            style={{ marginTop: 12, background: "none", border: "none", padding: 0, cursor: "pointer", color: C.jade, fontFamily: "var(--ui)", fontSize: 12.5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <ChevronDown size={14} style={{ transform: guiaMed ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
            Cómo publicar el puente
          </button>
          {guiaMed && (
            <ol style={{ margin: "10px 0 0", paddingLeft: 20, fontFamily: "var(--ui)", fontSize: 12.5, color: C.mute, lineHeight: 1.85 }}>
              <li>Crea una cuenta gratuita en <a href="https://dash.cloudflare.com/sign-up" target="_blank" rel="noreferrer" style={{ color: C.jade }}>Cloudflare</a>.</li>
              <li>En una terminal, dentro de la carpeta del proyecto: <Mono>cd tracker</Mono> y luego <Mono>npx wrangler login</Mono>.</li>
              <li><Mono>npx wrangler kv namespace create EVENTOS</Mono> — imprime un id; pégalo en <Mono>tracker/wrangler.toml</Mono>, donde dice <Mono>PEGA_AQUI_EL_ID</Mono>.</li>
              <li><Mono>npx wrangler secret put CLAVE</Mono> — inventa una clave larga y apúntala: es la misma que va aquí arriba.</li>
              <li>Si vas a usar Meta o Google Ads, pon también sus secretos ahora. Cuáles y de dónde se
                sacan está en <Mono>tracker/.dev.vars.ejemplo</Mono> y en las dos tarjetas de abajo.</li>
              <li><Mono>npx wrangler deploy</Mono>. Copia la dirección que imprime y pégala aquí arriba.</li>
              <li>Pulsa <b>Probar el puente</b>: dirá exactamente qué quedó enchufado y qué falta.</li>
            </ol>
          )}
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
            Lo recibe el puente de arriba, así que hace falta tenerlo publicado. No guarda ni el correo
            ni el nombre de nadie: sólo el identificador aleatorio del envío, que únicamente significa
            algo dentro de este CRM.
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

          {!hayPuente && (
            <div style={{ marginTop: 12, background: C.amberSoft, color: C.amber, borderRadius: 6, padding: "10px 12px", fontFamily: "var(--ui)", fontSize: 12.5, lineHeight: 1.6 }}>
              Falta publicar el puente, arriba. Sin él las casillas se pueden marcar pero no miden nada.
            </div>
          )}

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

          <Prose><div style={{ marginTop: 12, fontSize: 11.5, color: C.faint }}>
            {db.buzon.eventosAl
              ? <>Lo anotado se recoge con <b>Actualizar estados</b>, en Actividades. Última vez: {fmt(db.buzon.eventosAl)}.</>
              : <>Lo anotado se recoge con <b>Actualizar estados</b>, en Actividades. Todavía sin recoger nada.</>}
          </div></Prose>

        </Card>

        {/* ── Meta ── */}
        <Card title="Meta · Facebook e Instagram"
          badge={!anun.meta
            ? <Pill color={C.mute} soft="#E6E9E3">Apagado</Pill>
            : salud
              ? (salud.meta?.leads
                  ? <Pill color={C.jade} soft={C.jadeSoft}>Trayendo leads</Pill>
                  : <Pill color={C.clay} soft={C.claySoft}>Falta el token</Pill>)
              : <Pill color={C.amber} soft={C.amberSoft}>Sin probar</Pill>}>
          <Prose>
            Un anuncio con formulario recoge gente mientras duermes, y esa gente se queda dentro de Meta
            hasta que alguien la saca. Esto la saca: cada lead entra como ficha, con lo que escribió en el
            formulario, de qué campaña vino y si llegó por Facebook o por Instagram.
            <br /><br />
            <b>Meta borra los leads a los 90 días.</b> No es un detalle: con las demás conexiones, no
            sincronizar significa enterarse tarde; con ésta significa no enterarse nunca. Si el CRM pasa
            tres meses sin recoger, lo de antes no se recupera de ninguna manera.
          </Prose>

          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", border: "1px solid " + (anun.meta ? C.jade : C.line), background: anun.meta ? "#F7FAF8" : C.panel, borderRadius: 7, padding: "11px 12px", cursor: "pointer", margin: "14px 0 0" }}>
            <input type="checkbox" checked={anun.meta} style={{ marginTop: 2, accentColor: C.jade }}
              onChange={(e) => { setLeadProbe({ tipo: "", texto: "" }); patch("anuncios", { meta: e.target.checked }); }} />
            <div>
              <div style={{ fontFamily: "var(--ui)", fontSize: 13, fontWeight: 600 }}>Traer los leads de Lead Ads</div>
              <div style={{ fontFamily: "var(--ui)", fontSize: 12, color: C.mute, marginTop: 2, lineHeight: 1.55 }}>
                Se leen los formularios de la página que configuraste en el puente, todos, también los de
                campañas apagadas: una que paraste ayer puede tener leads de anteayer sin recoger.
              </div>
            </div>
          </label>

          {anun.meta && salud && !salud.meta?.leads && (
            <div style={{ marginTop: 12, background: C.claySoft, color: C.clay, borderRadius: 6, padding: "10px 12px", fontFamily: "var(--ui)", fontSize: 12.5, lineHeight: 1.6 }}>
              El puente no tiene con qué pedirlos. Falta <Mono>META_TOKEN</Mono> como secreto,
              o <Mono>META_PAGE_ID</Mono> en <Mono>tracker/wrangler.toml</Mono>. Mira la guía de aquí abajo.
            </div>
          )}

          <button onClick={() => setGuiaMeta(!guiaMeta)} className="crm-btn"
            style={{ marginTop: 12, background: "none", border: "none", padding: 0, cursor: "pointer", color: C.jade, fontFamily: "var(--ui)", fontSize: 12.5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <ChevronDown size={14} style={{ transform: guiaMeta ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
            Cómo conectar Meta
          </button>
          {guiaMeta && (
            <ol style={{ margin: "10px 0 0", paddingLeft: 20, fontFamily: "var(--ui)", fontSize: 12.5, color: C.mute, lineHeight: 1.85 }}>
              <li>Necesitas <a href="https://business.facebook.com/" target="_blank" rel="noreferrer" style={{ color: C.jade }}>business.facebook.com</a> con la página y la cuenta publicitaria en el mismo portafolio.</li>
              <li><b>Enciende el acceso a los leads.</b> En Meta Business Suite, el <b>engranaje</b> junto al portafolio → <b>Integraciones → Acceso a clientes potenciales → Personalizar acceso → Confirmar</b>. Sólo puede hacerlo quien tenga control total del portafolio. Éste es el paso que se salta todo el mundo: sin él la API contesta cero leads y no dice por qué.</li>
              <li><b>Configuración del negocio → Usuarios → Usuarios de sistema → Agregar.</b> Créalo con rol <b>Employee</b> —el token no caduca nunca, así que conviene que sólo alcance a lo asignado— y dale <i>dos</i> activos por separado: la <b>página</b> y la <b>cuenta publicitaria</b>.</li>
              <li><b>Crea una app y instálala en ese usuario.</b> Un token de usuario de sistema siempre se emite en nombre de una app, y sin ninguna el botón de generar aparece en gris. En <a href="https://developers.facebook.com/apps/creation/" target="_blank" rel="noreferrer" style={{ color: C.jade }}>developers.facebook.com</a>: caso de uso <b>Otro</b>, tipo <b>Empresa</b>, y elige tu portafolio. Luego, en el usuario de sistema, pestaña <b>Apps instaladas</b>, añádela. No hace falta publicarla ni pasarla por revisión.</li>
              <li><b>Dale al usuario un rol dentro de esa app.</b> Instalarla no basta y son dos cosas distintas: en <b>Asignar activos</b>, tipo <b>Apps</b>, marca la tuya y concédele <b>Administrar app</b>. Sin esto, al generar el token la lista de permisos sale vacía —“no hay permisos disponibles”— y el botón se queda apagado.</li>
              <li>Pulsa <b>Generar token</b> y marca los cinco permisos que pide Meta para esto: <Mono>leads_retrieval</Mono>, <Mono>pages_show_list</Mono>, <Mono>pages_read_engagement</Mono>, <Mono>pages_manage_ads</Mono> y <Mono>ads_management</Mono>. Si dejas fuera los dos últimos los leads entran igual, pero sin saber de qué campaña vienen.</li>
              <li>Vuelve a <b>Acceso a clientes potenciales</b> y comprueba que el usuario de sistema aparece en la lista con acceso concedido.</li>
              <li>Guarda el token en el puente: <Mono>cd tracker</Mono> y <Mono>npx wrangler secret put META_TOKEN</Mono>.</li>
              <li>En <Mono>tracker/wrangler.toml</Mono> pon <Mono>META_PAGE_ID</Mono> —el identificador de la página, en su Configuración → Información— y <Mono>META_AD_ACCOUNT</Mono>, que es el <Mono>act_…</Mono> del Administrador de anuncios.</li>
              <li><Mono>npx wrangler deploy</Mono> y vuelve a <b>Probar el puente</b>, arriba.</li>
            </ol>
          )}
        </Card>

        {/* ── Google Ads ── */}
        <Card title="Google Ads"
          badge={!anun.google
            ? <Pill color={C.mute} soft="#E6E9E3">Apagado</Pill>
            : salud
              ? (salud.google?.autorizado && salud.google?.credenciales
                  ? <Pill color={C.jade} soft={C.jadeSoft}>Trayendo leads</Pill>
                  : <Pill color={C.clay} soft={C.claySoft}>Falta autorizar</Pill>)
              : <Pill color={C.amber} soft={C.amberSoft}>Sin probar</Pill>}>
          <Prose>
            Lo mismo que Meta, para los formularios de Google. Cada envío entra como ficha con la campaña
            de la que vino. <b>Google los guarda 30 días</b>, la mitad que Meta.
            <br /><br />
            Hay que decir una cosa antes de que pierdas la tarde: Google exige un <b>developer token</b>
            para dejar entrar a su API, se solicita aparte y <b>tarda días en aprobarse</b>. No es un campo
            que se rellene y ya. Existe un programa para no necesitarlo, pero sigue siendo un piloto
            cerrado al que hay que postularse, así que hoy no es una salida.
          </Prose>

          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", border: "1px solid " + (anun.google ? C.jade : C.line), background: anun.google ? "#F7FAF8" : C.panel, borderRadius: 7, padding: "11px 12px", cursor: "pointer", margin: "14px 0 0" }}>
            <input type="checkbox" checked={anun.google} style={{ marginTop: 2, accentColor: C.jade }}
              onChange={(e) => { setLeadProbe({ tipo: "", texto: "" }); patch("anuncios", { google: e.target.checked }); }} />
            <div>
              <div style={{ fontFamily: "var(--ui)", fontSize: 13, fontWeight: 600 }}>Traer los leads de los formularios</div>
              <div style={{ fontFamily: "var(--ui)", fontSize: 12, color: C.mute, marginTop: 2, lineHeight: 1.55 }}>
                Los de las extensiones de formulario de tus campañas, con el nombre de la campaña de cada uno.
              </div>
            </div>
          </label>

          {anun.google && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <Btn variant={salud?.google?.autorizado ? "outline" : "solid"} Icon={ShieldCheck} disabled={!hayPuente}
                onClick={() => window.open(`${pu.base}/gads/entrar?clave=${encodeURIComponent(pu.clave)}`, "_blank", "noopener")}>
                {salud?.google?.autorizado ? "Volver a autorizar" : "Autorizar Google Ads"}
              </Btn>
              <Prose><span style={{ fontSize: 11.5, color: C.faint }}>
                {hayPuente
                  ? "Se abre Google en otra pestaña. El permiso se queda guardado en el puente, no aquí, y se renueva solo."
                  : "Publica antes el puente, arriba."}
              </span></Prose>
            </div>
          )}

          <button onClick={() => setGuiaGads(!guiaGads)} className="crm-btn"
            style={{ marginTop: 12, background: "none", border: "none", padding: 0, cursor: "pointer", color: C.jade, fontFamily: "var(--ui)", fontSize: 12.5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <ChevronDown size={14} style={{ transform: guiaGads ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
            Cómo conectar Google Ads
          </button>
          {guiaGads && (
            <ol style={{ margin: "10px 0 0", paddingLeft: 20, fontFamily: "var(--ui)", fontSize: 12.5, color: C.mute, lineHeight: 1.85 }}>
              <li><b>Pide el developer token primero</b>, porque es lo que tarda: en Google Ads, <b>Herramientas → Configuración → Centro de API</b>. Hace falta una cuenta administradora (MCC).</li>
              <li>En <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" style={{ color: C.jade }}>console.cloud.google.com</a>, con el mismo proyecto de Gmail o con otro: activa <b>Google Ads API</b> en la Biblioteca.</li>
              <li><b>Credenciales → Crear credenciales → ID de cliente de OAuth</b>, tipo <b>Aplicación web</b>. Es uno distinto del de Gmail: éste vive en el puente, no en el navegador.</li>
              <li>En <b>URIs de redireccionamiento autorizados</b> —ojo, ése, no el de orígenes— pega la dirección del puente seguida de <Mono>/gads/vuelta</Mono>.</li>
              <li>Guarda los secretos: <Mono>npx wrangler secret put GADS_CLIENT_SECRET</Mono> y <Mono>npx wrangler secret put GADS_DEV_TOKEN</Mono>.</li>
              <li>En <Mono>tracker/wrangler.toml</Mono> pon <Mono>GADS_CLIENT_ID</Mono> y <Mono>GADS_CUSTOMER_ID</Mono>. El <Mono>GADS_LOGIN_CUSTOMER_ID</Mono> sólo si la cuenta cuelga de un MCC: ponerlo cuando no toca hace que Google conteste que la cuenta no existe.</li>
              <li><Mono>npx wrangler deploy</Mono>, y pulsa <b>Autorizar Google Ads</b> aquí arriba. Es una sola vez.</li>
            </ol>
          )}
        </Card>

        {/* ── Rendimiento ── */}
        <Card title="Rendimiento de las campañas"
          badge={anun.meta || anun.google
            ? <Pill color={C.blue} soft={C.blueSoft}>Últimos {anun.dias} días</Pill>
            : <Pill color={C.mute} soft="#E6E9E3">Nada encendido</Pill>}>
          <Prose>
            Lo que hay que preguntarle a un anuncio es una sola cosa: <b>cuánto costó cada persona que
            llegó</b>. Eso se saca de aquí, sin abrir el administrador de anuncios de cada plataforma y sin
            tener que sumar dos monedas mentalmente.
            <br /><br />
            No se guarda nada: se pide en el momento y se muestra. Los leads sí quedan en el CRM porque
            son tuyos y las plataformas los borran; una cifra de gasto, en cambio, siempre va a estar allá.
          </Prose>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <Btn variant="outline" Icon={Megaphone} disabled={busy || !hayPuente || (!anun.meta && !anun.google)} onClick={verCampanas}>
              {busy ? "Pidiendo…" : "Ver campañas"}
            </Btn>
            {campProbe.texto && (
              <Prose><span style={{ fontSize: 12, fontWeight: 500, color: campProbe.tipo === "aviso" ? C.amber : C.clay }}>{campProbe.texto}</span></Prose>
            )}
          </div>

          {campanas && campanas.length > 0 && (
            <div style={{ marginTop: 14, border: "1px solid " + C.line, borderRadius: 7, overflowX: "auto" }}>
              <table style={{ fontFamily: "var(--ui)", fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: "#F6F8F4" }}>
                    {["Campaña", "Dónde", "Gasto", "Leads", "Por lead"].map((h, i) => (
                      <th key={h} style={{ textAlign: i > 1 ? "right" : "left", padding: "8px 11px", fontWeight: 600, color: C.mute, borderBottom: "1px solid " + C.line, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {campanas.map((c) => {
                    /* Sin leads no hay coste por lead: escribir un "0" o un
                       infinito daría una cifra donde no hay ninguna. */
                    const porLead = c.leads > 0 ? (c.gasto / c.leads) : null;
                    return (
                      <tr key={`${c.plataforma}:${c.id}`} className="crm-row">
                        <td style={{ padding: "8px 11px", borderBottom: "1px solid " + C.line }}>{c.nombre || "Sin nombre"}</td>
                        <td style={{ padding: "8px 11px", borderBottom: "1px solid " + C.line, color: C.mute }}>{nombrePlataforma(c.plataforma)}</td>
                        <td style={{ padding: "8px 11px", borderBottom: "1px solid " + C.line, textAlign: "right", fontFamily: "var(--mono)" }}>{c.gasto.toLocaleString("es-CO", { maximumFractionDigits: 0 })}</td>
                        <td style={{ padding: "8px 11px", borderBottom: "1px solid " + C.line, textAlign: "right", fontFamily: "var(--mono)" }}>{c.leads}</td>
                        <td style={{ padding: "8px 11px", borderBottom: "1px solid " + C.line, textAlign: "right", fontFamily: "var(--mono)", fontWeight: 600, color: porLead == null ? C.faint : C.ink }}>
                          {porLead == null ? "—" : porLead.toLocaleString("es-CO", { maximumFractionDigits: 0 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {campanas && campanas.length > 0 && (
            <Prose><div style={{ marginTop: 8, fontSize: 11.5, color: C.faint }}>
              Las cifras van en la moneda de cada cuenta, y si tienes una en pesos y otra en dólares no se
              pueden sumar entre sí: mira cada fila por su lado.
              {anun.google && <> En Google, la columna de leads cuenta <b>todas</b> las conversiones que tengas
                configuradas, no sólo los formularios; si también mides llamadas o compras, ese número es
                mayor que el de leads y el coste por lead sale más barato de lo que es.</>}
            </div></Prose>
          )}
        </Card>

        {/* ── Qué se hace con los leads ── */}
        <Card title="Los leads que entran"
          badge={anun.meta || anun.google
            ? <Pill color={C.blue} soft={C.blueSoft}>{anun.meta && anun.google ? "Meta y Google" : anun.meta ? "Sólo Meta" : "Sólo Google"}</Pill>
            : <Pill color={C.mute} soft="#E6E9E3">Nada encendido</Pill>}>
          <Prose>
            Cada lead se guarda partido en dos, a propósito: <b>la persona</b> se vuelve una ficha, y
            <b> lo que escribió</b> queda como una actividad recibida con el formulario entero dentro. Va así
            porque cada campaña pregunta otra cosa; convertir cada pregunta en una columna llenaría el CRM
            de columnas vacías en un mes, y en cambio la respuesta a “¿qué deporte practica tu hijo?” —que
            suele ser la única frase útil de todo el lead— se lee en la ficha, en su fecha.
            <br /><br />
            Antes de crear una ficha se busca si esa persona ya está, por correo y, si no hay, por
            teléfono. Quien vuelve a llenar un formulario no se parte en dos fichas con la mitad del
            historial cada una.
          </Prose>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "14px 0" }}>
            {[["contact", "Como contactos", "Lo normal: un formulario de anuncio lo llena una persona."],
              ["company", "Como empresas", "Para quien le vende a instituciones y prefiere la ficha a nombre del colegio o el club."]].map(([key, label, detalle]) => (
              <label key={key} style={{ display: "flex", gap: 10, alignItems: "flex-start", border: "1px solid " + (anun.destino === key ? C.jade : C.line), background: anun.destino === key ? "#F7FAF8" : C.panel, borderRadius: 7, padding: "10px 12px", cursor: "pointer" }}>
                <input type="radio" name="destino-leads" checked={anun.destino === key} onChange={() => patch("anuncios", { destino: key })} style={{ marginTop: 2, accentColor: C.jade }} />
                <div>
                  <div style={{ fontFamily: "var(--ui)", fontSize: 13, fontWeight: 600 }}>{label}</div>
                  <div style={{ fontFamily: "var(--ui)", fontSize: 12, color: C.mute, marginTop: 2, lineHeight: 1.55 }}>{detalle}</div>
                </div>
              </label>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Btn variant="solid" Icon={UserPlus} disabled={busy || !hayPuente || (!anun.meta && !anun.google)} onClick={traerAhora}>
              {busy ? "Trayendo…" : "Traer leads ahora"}
            </Btn>
            {leadProbe.texto && (
              <Prose><span style={{ fontSize: 12, fontWeight: 500, color: leadProbe.tipo === "ok" ? C.jade : leadProbe.tipo === "aviso" ? C.amber : C.clay }}>{leadProbe.texto}</span></Prose>
            )}
          </div>
          <Prose><div style={{ marginTop: 8, fontSize: 11.5, color: C.faint }}>
            No hace falta pulsarlo cada día: <b>Actualizar estados</b>, en Actividades, también los trae.
            Este botón es para comprobar ahora que quedó bien configurado.
            {db.buzon.leadsAl ? <> Última vez: {fmt(db.buzon.leadsAl)}.</> : <> Todavía sin traer nada.</>}
          </div></Prose>
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

  /* Borrar pide confirmación y no destruye nada: la propiedad pasa a la
     papelera con sus datos intactos, y se puede devolver a su lugar durante
     PAPELERA_DIAS días. */
  const [borrando, setBorrando] = useState(null);
  const conDatos = useMemo(() => {
    if (!borrando) return 0;
    return db[COLECCION[borrando.objKind]].filter((r) => String(r.props?.[borrando.f.key] ?? "").trim()).length;
  }, [borrando, db]);
  const removeProp = () => {
    const { objKind, f } = borrando;
    setBorrando(null);
    setDb((d) => {
      const pos = d.schema[objKind].findIndex((x) => x.key === f.key);
      if (pos < 0) return d;
      return {
        ...d,
        schema: { ...d.schema, [objKind]: d.schema[objKind].filter((x) => x.key !== f.key) },
        papelera: { ...d.papelera, [objKind]: [...d.papelera[objKind], { ...f, pos, borradaEn: nowISO() }] },
      };
    });
    say(`"${f.label}" se movió a la papelera`);
  };
  const restaurar = (objKind, f) => {
    const { pos, borradaEn, ...def } = f;
    setDb((d) => {
      const sch = d.schema[objKind].filter((x) => x.key !== def.key);
      const en = Math.min(pos ?? sch.length, sch.length);
      return {
        ...d,
        schema: { ...d.schema, [objKind]: [...sch.slice(0, en), def, ...sch.slice(en)] },
        papelera: { ...d.papelera, [objKind]: d.papelera[objKind].filter((x) => x.key !== def.key) },
      };
    });
    say(`"${def.label}" restaurada`);
  };
  const enPapelera = Object.keys(OBJ).flatMap((k) => (db.papelera[k] || []).map((f) => ({ k, f })));
  const diasRestantes = (f) => Math.max(0, Math.ceil((Date.parse(f.borradaEn) + PAPELERA_DIAS * 864e5 - Date.now()) / 864e5));
  /* Renombrar sólo cambia el nombre que se ve: la clave interna sigue igual,
     así que los datos ya guardados en esa propiedad no se tocan. */
  const [editando, setEditando] = useState(null);
  const [nombre, setNombre] = useState("");
  const renombrar = () => {
    if (!editando) return;
    const nuevo = nombre.trim();
    const { objKind, key } = editando;
    setEditando(null);
    const antes = db.schema[objKind].find((f) => f.key === key);
    if (!nuevo || !antes || nuevo === antes.label) return;
    setDb((d) => ({ ...d, schema: { ...d.schema, [objKind]: d.schema[objKind].map((f) => f.key === key ? { ...f, label: nuevo } : f) } }));
    say("Propiedad renombrada");
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
                    {editando?.objKind === k && editando.key === f.key ? (
                      <input className="crm-in" autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)}
                        onBlur={renombrar}
                        onKeyDown={(e) => { if (e.key === "Enter") renombrar(); if (e.key === "Escape") setEditando(null); }}
                        style={{ ...inputStyle, padding: "3px 6px", fontSize: 12.5, fontWeight: 600, minWidth: 180 }} />
                    ) : (
                      <div style={{ fontFamily: "var(--ui)", fontSize: 12.5, fontWeight: 600 }}>{f.label}</div>
                    )}
                    <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: C.faint }}>{f.key} · {f.type}{f.system ? " · sistema" : ""}</div>
                  </div>
                  <button title="Cambiar nombre" onMouseDown={(e) => e.preventDefault()} onClick={() => { setEditando({ objKind: k, key: f.key }); setNombre(f.label); }} className="crm-btn" style={{ border: "none", background: "none", cursor: "pointer", color: C.mute, padding: 2 }}><Pencil size={13} /></button>
                  {!f.system && <button title="Eliminar" onClick={() => setBorrando({ objKind: k, f })} className="crm-btn" style={{ border: "none", background: "none", cursor: "pointer", color: C.clay, padding: 2 }}><Trash2 size={13} /></button>}
                </div>
              ))}
            </div>
          </div>
        ))}

        {enPapelera.length > 0 && (
          <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 9, padding: 18 }}>
            <div style={{ fontFamily: "var(--display)", fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Papelera de propiedades</div>
            <div style={{ fontFamily: "var(--ui)", fontSize: 12.5, color: C.mute, marginBottom: 12 }}>
              Sus datos siguen guardados. Pasados {PAPELERA_DIAS} días desde que se eliminaron, se borran para siempre junto con lo que tenían los registros.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {enPapelera.map(({ k, f }) => (
                <div key={k + f.key} style={{ border: `1px dashed ${C.line}`, borderRadius: 7, padding: "8px 11px", display: "flex", alignItems: "center", gap: 12 }}>
                  <div>
                    <div style={{ fontFamily: "var(--ui)", fontSize: 12.5, fontWeight: 600, color: C.mute, textDecoration: "line-through" }}>{f.label}</div>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: C.faint }}>{OBJ[k].plural} · se borra en {diasRestantes(f)} día(s)</div>
                  </div>
                  <Btn size="sm" variant="outline" Icon={RotateCcw} onClick={() => restaurar(k, f)}>Restaurar</Btn>
                </div>
              ))}
            </div>
          </div>
        )}

        {borrando && (
          <Modal title={`¿Eliminar la propiedad "${borrando.f.label}"?`}
            subtitle={`Propiedad de ${OBJ[borrando.objKind].plural.toLowerCase()}`}
            onClose={() => setBorrando(null)}
            footer={<>
              <Btn variant="outline" onClick={() => setBorrando(null)}>Cancelar</Btn>
              <Btn variant="danger" Icon={Trash2} onClick={removeProp}
                style={{ background: C.clay, color: "#fff", borderColor: C.clay }}>Sí, eliminar</Btn>
            </>}>
            <div style={{ fontFamily: "var(--ui)", fontSize: 13, color: C.ink, lineHeight: 1.6 }}>
              {conDatos > 0
                ? <>{conDatos} {conDatos === 1 ? "registro tiene" : "registros tienen"} información en esta propiedad.</>
                : <>Ningún registro tiene información en esta propiedad.</>}
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: C.mute }}>
                <li>Deja de verse en la tabla, las fichas y los formularios desde ya.</li>
                <li>Los datos se conservan {PAPELERA_DIAS} días en la papelera y puedes restaurarla en ese tiempo.</li>
                <li>Pasados los {PAPELERA_DIAS} días se borra para siempre, con todo lo que guardaba.</li>
              </ul>
            </div>
          </Modal>
        )}

        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 9, padding: 18 }}>
          <div style={{ fontFamily: "var(--display)", fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Datos y respaldo</div>
          <div style={{ fontFamily: "var(--ui)", fontSize: 12.5, color: C.mute, marginBottom: 12, lineHeight: 1.6 }}>
            {db.contacts.length} contactos · {db.companies.length} empresas · {db.deals.length} negocios · {db.activities.length} actividades.
            <br />{import.meta.env.VITE_NUBE === "1"
              ? "Todo queda guardado en el servidor del CRM apenas lo escribes, y aparece al instante en tus otros equipos. El respaldo es un archivo con la copia completa: sirve para conservarla fuera de la nube o para traer los datos de otro navegador."
              : "Todo queda guardado en este navegador apenas lo escribes. El respaldo es un archivo con la copia completa: sirve para conservarla fuera del equipo o para pasarla a otro navegador."}
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
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
/* Entre un correo y otro, entre 20 y 60 segundos al azar. Gmail no castiga el
   volumen sino la forma: cien correos en un minuto, siempre al mismo ritmo, es
   la huella de un programa, y una persona no escribe así. */
const PAUSA_MIN = 20_000;
const PAUSA_MAX = 60_000;
const pausaAlAzar = () => PAUSA_MIN + Math.random() * (PAUSA_MAX - PAUSA_MIN);

/* ── Filtros por propiedad ──
   A quién le llega un masivo se decide por lo que dice la ficha: "Tipo es
   Acudiente", "Institución contiene San José", "creados en los últimos 30
   días". Todas las condiciones deben cumplirse a la vez; para decir "esto o
   aquello" en una lista se marcan varios valores en la misma condición. Una
   condición a medio llenar no filtra: mientras se escribe, la lista no se
   vacía de golpe. */
const VACIO_OPS = [["lleno", "tiene valor"], ["vacio", "está vacío"]];
const OPS_FILTRO = {
  select: [["en", "es"], ["noen", "no es"], ...VACIO_OPS],
  numero: [["igual", "es igual a"], ["min", "es al menos"], ["max", "es como máximo"], ...VACIO_OPS],
  fecha: [["ultimos", "en los últimos… días"], ["desde", "desde el día"], ["hasta", "hasta el día"], ...VACIO_OPS],
  texto: [["contiene", "contiene"], ["nocontiene", "no contiene"], ["igual", "es exactamente"], ...VACIO_OPS],
};
const grupoFiltro = (f) => (f.type === "select" ? "select" : f.type === "number" ? "numero"
  : f.type === "date" || f.type === "datetime" ? "fecha" : "texto");
const estaVacio = (v) => v === undefined || v === null || String(v).trim() === "";

/* Una fecha se compara por día en la hora local: una ficha creada a las 9 de
   la noche del 5 sigue siendo del 5 aunque en UTC ya sea el 6. */
const diaLocal = (v) => {
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d)) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function cumpleFiltro(r, c, f) {
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

const cumpleFiltros = (r, filtros, schema) =>
  filtros.every((c) => cumpleFiltro(r, c, schema.find((f) => f.key === c.key)));

/* El criterio completo de una tabla: buscador, estado de lead y filtros. Es
   lo que guarda una vista y lo que define a una lista activa. */
const cumpleCriterio = (r, { q, status, filtros }, schema) => {
  const nq = norm(q);
  if (nq && !norm(Object.values(r.props).join(" ")).includes(nq)) return false;
  if (status && r.props.leadStatus !== status) return false;
  return !(filtros || []).length || cumpleFiltros(r, filtros, schema);
};

/* Quién está hoy en una lista. La activa se recalcula con cada cambio en las
   fichas; la fija sólo pierde a quien se haya borrado del CRM. */
function miembrosDeLista(db, lista) {
  const coll = lista.kind === "contact" ? db.contacts : db.companies;
  if (lista.tipo === "fija") {
    const ids = new Set(lista.ids || []);
    return coll.filter((r) => ids.has(r.id));
  }
  const schema = db.schema[lista.kind];
  return coll.filter((r) => cumpleCriterio(r, lista, schema));
}

/* Un botón que abre opciones debajo. Se cierra al elegir o al pinchar fuera. */
function Menu({ label, Icon = ChevronDown, items, variant = "outline", size = "sm" }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e) => { if (caja.current && !caja.current.contains(e.target)) setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);
  const visibles = items.filter(Boolean);
  return (
    <div ref={caja} style={{ position: "relative" }}>
      <Btn size={size} variant={variant} Icon={Icon} onClick={() => setAbierto((v) => !v)}>{label}</Btn>
      {abierto && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, padding: 4, zIndex: 30, minWidth: 240, boxShadow: "0 12px 30px rgba(19,28,26,.14)" }}>
          {visibles.map((it, i) => it.titulo ? (
            <div key={i} style={{ padding: "6px 9px 3px", fontFamily: "var(--ui)", fontSize: 10.5, fontWeight: 600, color: C.faint, letterSpacing: ".05em", textTransform: "uppercase" }}>{it.titulo}</div>
          ) : (
            <button key={i} type="button" className="crm-btn" disabled={it.disabled}
              onClick={() => { setAbierto(false); it.onClick(); }}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", border: "none", background: "transparent", borderRadius: 5, padding: "7px 9px", fontFamily: "var(--ui)", fontSize: 12.5, color: it.danger ? C.clay : C.ink, cursor: it.disabled ? "not-allowed" : "pointer", opacity: it.disabled ? 0.45 : 1 }}>
              {it.Icon && <it.Icon size={13} />}<span style={{ flex: 1 }}>{it.label}</span>
              {it.extra && <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: C.faint }}>{it.extra}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* Pide un nombre antes de guardar algo: una vista, una lista. */
function NombreModal({ titulo, subtitulo, inicial = "", accion = "Guardar", onClose, onOk }) {
  const [nombre, setNombre] = useState(inicial);
  const ok = () => { if (nombre.trim()) onOk(nombre.trim()); };
  return (
    <Modal title={titulo} subtitle={subtitulo} onClose={onClose}
      footer={<><Btn variant="outline" onClick={onClose}>Cancelar</Btn>
        <Btn variant="solid" Icon={Check} disabled={!nombre.trim()} onClick={ok}>{accion}</Btn></>}>
      <label style={{ display: "block" }}>
        <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, fontWeight: 600, color: C.mute, marginBottom: 5 }}>Nombre</div>
        <input className="crm-in" autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") ok(); }} style={inputStyle} />
      </label>
    </Modal>
  );
}

/* `enLinea` los acomoda uno al lado del otro, para la barra de una tabla
   ancha; si no, van apilados, como en la columna del envío. */
function FiltrosPropiedad({ schema, rows, filtros, setFiltros, enLinea }) {
  /* Los valores que de verdad hay en las fichas, para elegir en vez de
     adivinar cómo se escribió: en una lista, además de sus opciones, los que
     llegaron por importación con otra grafía. */
  const valoresDe = (key) => {
    const vistos = new Set();
    for (const r of rows) if (!estaVacio(r.props[key])) vistos.add(String(r.props[key]).trim());
    return [...vistos].sort((a, b) => a.localeCompare(b, "es"));
  };
  const cambiar = (i, parche) => setFiltros((fs) => fs.map((c, j) => (j === i ? { ...c, ...parche } : c)));
  const quitar = (i) => setFiltros((fs) => fs.filter((_, j) => j !== i));
  const elegirPropiedad = (i, key) => {
    const f = schema.find((x) => x.key === key);
    cambiar(i, { key, op: f ? OPS_FILTRO[grupoFiltro(f)][0][0] : "", value: "", values: [] });
  };
  const chico = { ...inputStyle, padding: "5px 8px", fontSize: 12 };

  return (
    <div style={enLinea
      ? { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-start" }
      : { display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
      {filtros.map((c, i) => {
        const f = schema.find((x) => x.key === c.key);
        const grupo = f && grupoFiltro(f);
        const pideValor = f && c.op !== "lleno" && c.op !== "vacio";
        const opciones = grupo === "select" ? [...new Set([...(f.options || []), ...valoresDe(f.key)])] : [];
        const sugerencias = grupo === "texto" && pideValor ? valoresDe(f.key) : [];
        const listId = `filtro-${i}-${c.key}`;
        return (
          <div key={i} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 8, background: "#F8FAF6", display: "flex", flexDirection: "column", gap: 6, ...(enLinea ? { width: 300, maxWidth: "100%" } : {}) }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <select className="crm-in" value={c.key} onChange={(e) => elegirPropiedad(i, e.target.value)} style={{ ...chico, flex: 1 }}>
                <option value="">Elige una propiedad…</option>
                {schema.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
              </select>
              <button type="button" className="crm-btn" onClick={() => quitar(i)} title="Quitar filtro"
                style={{ border: "none", background: "transparent", color: C.mute, cursor: "pointer", padding: 4, display: "inline-flex" }}>
                <X size={14} />
              </button>
            </div>
            {f && (
              <div style={{ display: "flex", gap: 6 }}>
                <select className="crm-in" value={c.op} onChange={(e) => cambiar(i, { op: e.target.value })} style={{ ...chico, flex: pideValor && grupo !== "select" ? "0 0 46%" : 1 }}>
                  {OPS_FILTRO[grupo].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                {pideValor && grupo !== "select" && (
                  <>
                    <input className="crm-in" value={c.value || ""} onChange={(e) => cambiar(i, { value: e.target.value })}
                      type={grupo === "numero" || c.op === "ultimos" ? "number" : grupo === "fecha" ? "date" : "text"}
                      placeholder={c.op === "ultimos" ? "Días" : "Valor"} list={sugerencias.length && sugerencias.length <= 80 ? listId : undefined}
                      style={{ ...chico, flex: 1, minWidth: 0 }} />
                    {sugerencias.length > 0 && sugerencias.length <= 80 && (
                      <datalist id={listId}>{sugerencias.map((s) => <option key={s} value={s} />)}</datalist>
                    )}
                  </>
                )}
              </div>
            )}
            {pideValor && grupo === "select" && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {opciones.map((o) => {
                  const on = (c.values || []).includes(o);
                  return (
                    <button key={o} type="button" className="crm-btn"
                      onClick={() => cambiar(i, { values: on ? c.values.filter((x) => x !== o) : [...(c.values || []), o] })}
                      style={{ border: `1px solid ${on ? C.jade : C.line}`, background: on ? C.jadeSoft : C.panel, color: on ? C.jade : C.mute, borderRadius: 999, padding: "2px 9px", fontFamily: "var(--ui)", fontSize: 11.5, cursor: "pointer" }}>
                      {o}
                    </button>
                  );
                })}
                {opciones.length === 0 && <span style={{ fontFamily: "var(--ui)", fontSize: 11.5, color: C.faint }}>Nadie tiene un valor en esta propiedad.</span>}
              </div>
            )}
          </div>
        );
      })}
      <div>
        <Btn size="sm" variant="outline" Icon={ListFilter}
          onClick={() => setFiltros((fs) => [...fs, { key: "", op: "", value: "", values: [] }])}>
          {filtros.length ? "Añadir otra condición" : "Filtrar por propiedad"}
        </Btn>
      </div>
    </div>
  );
}

function SendModal({ db, channel, kind, ids, listaId, plantillaId, onClose, onSend, onLogOne }) {
  const integ = db.integrations;
  const gmail = useGmail();
  const templates = db.templates[channel];
  const [tid, setTid] = useState(() => (plantillaId && templates.some((x) => x.id === plantillaId) ? plantillaId : templates[0]?.id || ""));
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
  /* Cómo va una tanda larga: con 20 a 60 segundos entre correos, cien tardan
     casi una hora y hay que poder verlo y pararlo. */
  const [marcha, setMarcha] = useState(null);
  const parar = useRef(false);
  /* Cerrar la ventana corta la tanda: seguir mandando sin nada a la vista
     sería un envío que nadie puede ver ni parar. */
  useEffect(() => () => { parar.current = true; }, []);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState("");
  const [copiedHtml, setCopiedHtml] = useState("");
  const [vista, setVista] = useState("diseno");

  /* Quien recibe. La lista llega marcada entera —lo normal es escribirle a
     todos los que se traian seleccionados— y quitar a alguien es un clic. */
  const [chosen, setChosen] = useState(() => {
    const l = listaId && (db.listas || []).find((x) => x.id === listaId);
    return new Set(l ? miembrosDeLista(db, l).map((r) => r.id) : ids);
  });
  /* Un identificador por apertura del modal: todo lo que salga desde aquí es
     el mismo envío, aunque se mande en dos tandas o uno por uno. */
  const [lote] = useState(() => uid());
  const [buscar, setBuscar] = useState("");
  const [filtros, setFiltros] = useState([]);

  const coll = kind === "contact" ? db.contacts : db.companies;
  const schema = db.schema[kind];
  /* A quién se le escribe: lo que se traía marcado o una lista guardada. La
     lista se lee al momento: una activa trae a quien la cumpla hoy. */
  const listas = (db.listas || []).filter((l) => l.kind === kind);
  const [origen, setOrigen] = useState(() => (listaId && listas.some((l) => l.id === listaId) ? listaId : ""));
  const listaOrigen = origen ? listas.find((l) => l.id === origen) || null : null;
  const candidatos = useMemo(() => {
    if (listaOrigen) return miembrosDeLista(db, listaOrigen);
    const marcados = new Set(ids);
    return coll.filter((r) => marcados.has(r.id));
  }, [coll, ids, listaOrigen, db.schema]);
  /* Al cambiar de origen se marca a todos los del nuevo grupo. */
  const primerOrigen = useRef(true);
  useEffect(() => {
    if (primerOrigen.current) { primerOrigen.current = false; return; }
    setChosen(new Set(candidatos.map((r) => r.id)));
  }, [origen]);
  /* Los filtros acotan; las casillas afinan dentro de lo que queda. Quien no
     cumple no recibe aunque siga marcado, y vuelve a contar en cuanto se
     quita el filtro que lo dejaba fuera. */
  const coinciden = useMemo(
    () => (filtros.length ? candidatos.filter((r) => cumpleFiltros(r, filtros, schema)) : candidatos),
    [candidatos, filtros, schema]);
  const recipients = coinciden.filter((r) => chosen.has(r.id));
  const first = recipients[0];
  const ch = CHANNEL[channel];
  const cc = integ.whatsapp.countryCode;
  const modo = integ.email.mode;
  const esCorreo = channel === "email";
  /* "Enviar directo" desde aquí mismo: usa la vía de Gmail conectado para esta
     tanda sin tener que ir a Conexiones a cambiar el modo de toda la cuenta. */
  const [directo, setDirecto] = useState(false);
  const porApi = esCorreo && (modo === "gmailApi" || directo);
  const porWa = !esCorreo && integ.whatsapp.modo === "api";

  const destOf = (r) => (esCorreo ? String(r.props.email || "").trim() : toE164(r.props.phone, cc));
  const conDestino = recipients.filter((r) => destOf(r));
  const missingChannel = recipients.length - conDestino.length;
  /* Los que rebotaron o pidieron la baja se quedan fuera aunque sigan
     marcados: escribirles otra vez es lo que más castiga Gmail. */
  const vetados = esCorreo ? conDestino.filter(noSeEscribe) : [];
  const sendable = esCorreo ? conDestino.filter((r) => !noSeEscribe(r)) : conDestino;
  const pending = sendable.filter((r) => !done.has(r.id));

  const conDato = coinciden.filter((r) => destOf(r));
  const filtro = buscar.trim().toLowerCase();
  const visibles = filtro
    ? coinciden.filter((r) => `${titleOf(kind, r)} ${destOf(r)}`.toLowerCase().includes(filtro))
    : coinciden;
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
  /* Enlazada a Meta, por WhatsApp sale la plantilla aprobada y no lo escrito
     aquí: Meta no deja cambiarle ni una coma. */
  const metaT = !esCorreo && t && t.meta ? t.meta : null;
  const plantillaDe = (r) => (metaT ? plantillaWaPara(metaT, r, kind) : null);

  const cuerpoDe = (r) => {
    if (metaT) { const pw = plantillaDe(r); return pw.err ? metaT.cuerpo : pw.texto; }
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
    onLogOne(r.id, { subject: asuntoLog(r), body: cuerpoDe(r), trk, lote, sel: recipients.length });
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
  /* Lo que ya salió hoy desde la cuenta, mande quien lo mande: lo traído de
     Enviados cuenta igual, porque el tope de Gmail es por cuenta. */
  const tope = integ.email.topeDiario;
  const hoy = (db.activities || []).filter((a) => a.type === "email" && a.dir !== "in" && isToday(a.at)).length;
  const quedanHoy = Math.max(0, tope - hoy);

  const enviarTodo = async () => {
    const cola = pending.slice(0, quedanHoy);
    if (!cola.length) {
      setErr(`Hoy ya salieron ${hoy} correos y el tope es ${tope}. Sigue mañana, o sube el tope en Conexiones si sabes lo que haces.`);
      return;
    }
    setErr(""); setBusy(true);
    parar.current = false;
    const baja = puedeDarBaja(medicion);
    let ok = 0;
    for (let i = 0; i < cola.length; i++) {
      const r = cola[i];
      try {
        /* La espera va antes de cada correo menos el primero, y se puede
           cortar en medio: nadie debería esperar un minuto a que "Detener"
           haga caso. Si aun así Gmail frena, sendGmail espera y reintenta. */
        if (i) {
          const fin = Date.now() + pausaAlAzar();
          while (Date.now() < fin && !parar.current) {
            setMarcha({ ok, total: cola.length, siguienteEn: Math.ceil((fin - Date.now()) / 1000) });
            await pausa(Math.min(1000, fin - Date.now()));
          }
        }
        if (parar.current) {
          setErr(`Detenido: se enviaron ${ok} de ${cola.length}. Los demás siguen pendientes.`);
          break;
        }
        setMarcha({ ok, total: cola.length, siguienteEn: 0 });
        const { trk, html: cuerpoHtml } = await prepararEnvio(r);
        const enlace = baja ? await enlaceBaja(medicion, r.id) : "";
        const texto = enlace ? pieBajaTexto(cuerpoDe(r), enlace) : cuerpoDe(r);
        const conPie = enlace ? pieBajaHtml(cuerpoHtml || textoAHtml(cuerpoDe(r)), enlace) : cuerpoHtml;
        await sendGmail({ to: destOf(r), subject: asuntoDe(r), body: texto, html: conPie, baja: enlace, clientId: integ.email.clientId });
        marcar(r, trk);
        ok++;
      } catch (e) {
        setErr(`Se enviaron ${ok} de ${cola.length}. Se detuvo en ${titleOf(kind, r)}: ${(e && e.message) || e}`);
        break;
      }
    }
    if (ok === cola.length && cola.length < pending.length) {
      setErr(`Se enviaron ${ok} y se llegó al tope de ${tope} correos por día. Los ${pending.length - ok} que faltan quedan pendientes para mañana.`);
    }
    setMarcha(null);
    setBusy(false);
  };

  /* Lo mismo por WhatsApp: uno tras otro, y si uno falla se detiene ahí. Aquí
     parar importa todavía más que en el correo, porque Meta cobra por
     conversación y rechaza el texto libre fuera de la ventana de 24 horas: un
     fallo suele ser el primero de muchos, y seguir a ciegas cuesta dinero. */
  const enviarTodoWa = async () => {
    const cola = pending;
    setErr(""); setBusy(true);
    let ok = 0;
    for (const r of cola) {
      const pw = plantillaDe(r);
      const res = pw && pw.err ? { ok: false, err: pw.err } : await mandarWhatsApp(integ, r.props.phone, cuerpoDe(r), pw);
      if (!res.ok) {
        setErr(`Se enviaron ${ok} de ${cola.length}. Se detuvo en ${titleOf(kind, r)}: ${res.err}`);
        break;
      }
      marcar(r);
      ok++;
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
    ? (porWa
        ? "El CRM los manda por WhatsApp uno tras otro, sin abrir nada."
        : "Se abre WhatsApp con el mensaje escrito; tú das el último clic.")
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
    if (porApi && busy && marcha) {
      return <Btn variant="outline" Icon={Pause} onClick={() => { parar.current = true; }}>Detener</Btn>;
    }
    if (porApi) {
      const van = Math.min(pending.length, quedanHoy);
      return <Btn variant="solid" Icon={Send} disabled={sinTexto || busy || !pending.length}
        onClick={enviarTodo}>{busy ? "Enviando…" : `Enviar ${van} por Gmail`}</Btn>;
    }
    if (porWa) {
      return <Btn variant="solid" Icon={Send} disabled={sinTexto || busy || !pending.length}
        onClick={enviarTodoWa}>{busy ? "Enviando…" : `Enviar ${pending.length} por WhatsApp`}</Btn>;
    }
    return <>
      {esCorreo && (
        <Btn variant="outline" Icon={Send} disabled={sinTexto || !pending.length}
          onClick={() => { setErr(""); setDirecto(true); }}>Enviar directo</Btn>
      )}
      <Btn variant="solid" Icon={ExternalLink} disabled={sinTexto || !pending.length} onClick={abrirSiguiente}>
        {esCorreo ? "Abrir borrador" : "Abrir WhatsApp"} · {pending.length} sin enviar
      </Btn>
    </>;
  };

  return (
    <Modal wide title={esCorreo ? "Enviar correo" : "Enviar por WhatsApp"}
      subtitle={`${recipients.length} de ${coinciden.length} destinatario(s) · ${comoSale}`} onClose={onClose}
      footer={<><Btn variant="outline" onClick={onClose}>{done.size ? "Cerrar" : "Cancelar"}</Btn>
        <Btn variant="outline" Icon={Copy} disabled={sinTexto} onClick={copyAll}>{copied || "Copiar textos"}</Btn>
        <Btn variant="outline" Icon={Check} disabled={sinTexto}
          onClick={() => onSend({ subject: t ? `Plantilla: ${t.name}` : esCorreo ? subject || "Correo de marketing" : "Mensaje de WhatsApp", body: body.trim() || (conHtml ? htmlToText(html) : body), ids: recipients.map((r) => r.id), lote, sel: recipients.length })}>
          Registrar sin enviar</Btn>
        {principal()}</>}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field def={{ label: "Plantilla", type: "select", options: templates.map((x) => x.name) }}
            value={t?.name || ""} onChange={(name) => setTid((templates.find((x) => x.name === name) || {}).id || "")} />
          {esCorreo && <Field def={{ label: "Asunto", type: "text" }} value={subject} onChange={setSubject} />}
          {metaT ? (
            <div style={{ background: C.jadeSoft, borderRadius: 6, padding: "9px 11px", fontFamily: "var(--ui)", fontSize: 12, color: C.ink, lineHeight: 1.55 }}>
              <div style={{ fontWeight: 600, color: C.jade, marginBottom: 3 }}>Plantilla aprobada en Meta · {metaT.nombre}</div>
              {porWa
                ? "Sale tal cual Meta la aprobó, con los datos de cada persona en sus variables. Sirve aunque no te hayan escrito en las últimas 24 horas."
                : "En el modo de enlace se abre el chat con este mismo texto. Para que salga como plantilla de Meta, cambia a “WhatsApp conectado” en Conexiones."}
              {" "}El texto se cambia en el Administrador de WhatsApp, no aquí.
            </div>
          ) : (
            <>
              <Field def={{ label: conHtml ? "Mensaje en texto (respaldo del diseño)" : "Mensaje", type: "textarea" }} value={body} onChange={setBody} />
              <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, color: C.faint }}>Variables: {"{{nombre}}"}, {"{{apellido}}"}, {"{{institucion}}"}, {"{{empresa}}"}</div>
              {porWa && (
                <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, color: C.amber, lineHeight: 1.5 }}>
                  Texto libre: sólo le llega a quien te escribió en las últimas 24 horas. Para los demás, enlaza esta plantilla a una aprobada en Meta, en Plantillas.
                </div>
              )}
            </>
          )}

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

          {vetados.length > 0 && (
            <div style={{ background: C.claySoft, borderRadius: 6, padding: "8px 10px", fontFamily: "var(--ui)", fontSize: 12, color: C.clay }}>
              {vetados.length} destinatario(s) rebotaron o pidieron la baja. Se omiten: escribirles otra vez es lo que más castiga Gmail.
            </div>
          )}

          {porApi && gmail.connected && !marcha && pending.length > 0 && (
            <div style={{ background: pending.length > quedanHoy ? C.amberSoft : C.blueSoft, borderRadius: 6, padding: "8px 10px", fontFamily: "var(--ui)", fontSize: 12, color: pending.length > quedanHoy ? C.amber : C.blue, lineHeight: 1.55 }}>
              Sale uno cada 20 a 60 segundos, para que Gmail no lo tome por un robot: {Math.min(pending.length, quedanHoy)} tardan unos {Math.max(1, Math.round(Math.min(pending.length, quedanHoy) * 40 / 60))} min. Deja esta ventana abierta.
              {pending.length > quedanHoy && ` Hoy ya salieron ${hoy} de ${tope}: los ${pending.length - quedanHoy} que no caben quedan para mañana.`}
              {!puedeDarBaja(medicion) && " Sin medidor configurado los correos salen sin enlace de baja."}
            </div>
          )}

          {marcha && (
            <div style={{ background: C.blueSoft, borderRadius: 6, padding: "8px 10px", fontFamily: "var(--ui)", fontSize: 12, color: C.blue, lineHeight: 1.55 }}>
              Enviados {marcha.ok} de {marcha.total}{marcha.siguienteEn ? ` · el siguiente sale en ${marcha.siguienteEn} s` : " · enviando…"}. No cierres esta ventana.
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
          {(listas.length > 0 || listaOrigen) && (
            <label style={{ display: "block", marginTop: 12 }}>
              <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, fontWeight: 600, color: C.mute, marginBottom: 5 }}>ENVIAR A</div>
              <select className="crm-in" value={origen} disabled={busy} onChange={(e) => setOrigen(e.target.value)} style={{ ...inputStyle, padding: "6px 9px", fontSize: 12.5 }}>
                <option value="">
                  {ids.length === coll.length ? `Todos los ${OBJ[kind].plural.toLowerCase()} (${ids.length})` : `Los ${ids.length} que traías seleccionados`}
                </option>
                {listas.map((l) => (
                  <option key={l.id} value={l.id}>Lista {l.tipo}: {l.nombre} ({miembrosDeLista(db, l).length})</option>
                ))}
              </select>
            </label>
          )}
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, fontWeight: 600, color: C.mute }}>
              DESTINATARIOS · {recipients.length} de {coinciden.length}
              {filtros.length > 0 && <span style={{ fontWeight: 400, color: C.faint }}> · {coinciden.length} de {candidatos.length} cumplen los filtros</span>}
            </div>
            <div style={{ display: "flex", gap: 2 }}>
              <Btn size="sm" onClick={() => setChosen(new Set(candidatos.map((r) => r.id)))}>Todos</Btn>
              <Btn size="sm" onClick={() => setChosen(new Set(conDato.map((r) => r.id)))}>{esCorreo ? "Con correo" : "Con teléfono"}</Btn>
              <Btn size="sm" onClick={() => setChosen(new Set())}>Ninguno</Btn>
            </div>
          </div>
          <FiltrosPropiedad schema={schema} rows={candidatos} filtros={filtros} setFiltros={setFiltros} />
          {coinciden.length > 8 && (
            <input className="crm-in" placeholder="Buscar por nombre o dato…" value={buscar} onChange={(e) => setBuscar(e.target.value)}
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
                {!candidatos.length ? "No hay registros para enviar."
                  : !coinciden.length ? "Nadie cumple los filtros. Quita o ajusta alguna condición." : "Nadie coincide con la búsqueda."}
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
   Drafts
   Lee el roster público de un programa de fútbol masculino (NCAA, NAIA o
   NJCAA) y muestra cuántos jugadores hay por año y por posición, y qué
   posiciones va a necesitar en las próximas temporadas. Claude sólo extrae
   la lista (/api/drafts); los conteos y el pronóstico salen de src/drafts.js.
   Cada análisis se guarda con sus jugadores, que se pueden corregir a mano.
   ──────────────────────────────────────────────────────────── */
const PRIORIDAD = {
  alta: { label: "Alta", color: C.clay, soft: C.claySoft },
  media: { label: "Media", color: C.amber, soft: C.amberSoft },
  baja: { label: "Baja", color: C.jade, soft: C.jadeSoft },
};

const thStyle = { fontFamily: "var(--mono)", fontSize: 10.5, fontWeight: 500, color: C.faint, letterSpacing: ".06em", textTransform: "uppercase", textAlign: "left", padding: "7px 10px", borderBottom: `1px solid ${C.line}` };
const tdStyle = { fontFamily: "var(--ui)", fontSize: 13, color: C.ink, padding: "8px 10px", borderBottom: `1px solid ${C.line}` };
const num = { fontFamily: "var(--mono)", textAlign: "center" };

function DraftsView({ db, setDb, say }) {
  const [selId, setSelId] = useState(db.drafts[0] ? db.drafts[0].id : null);
  const [nuevo, setNuevo] = useState(false);
  const sel = db.drafts.find((d) => d.id === selId) || db.drafts[0] || null;

  const cambiar = (id, patch) => setDb((d) => ({ ...d, drafts: d.drafts.map((x) => x.id === id ? { ...x, ...patch } : x) }));
  const borrar = (id) => {
    if (!window.confirm("¿Borrar este análisis? No se puede deshacer.")) return;
    setDb((d) => ({ ...d, drafts: d.drafts.filter((x) => x.id !== id) }));
    say("Análisis borrado");
  };
  const guardar = (draft) => {
    setDb((d) => ({ ...d, drafts: [draft, ...d.drafts] }));
    setSelId(draft.id);
    setNuevo(false);
    say(`${draft.jugadores.length} jugadores leídos`);
  };

  return (
    <div>
      <Header eyebrow="Reclutamiento" title="Drafts"
        right={<Btn variant="solid" Icon={Plus} onClick={() => setNuevo(true)}>Analizar un roster</Btn>} />
      {!db.drafts.length ? (
        <Empty title="Todavía no hay análisis"
          hint="Pega el enlace del roster de un equipo de fútbol masculino (NCAA, NAIA o NJCAA) y te muestro qué posiciones va a necesitar."
          action={<Btn variant="solid" Icon={Plus} onClick={() => setNuevo(true)}>Analizar un roster</Btn>} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "250px minmax(0,1fr)", gap: 18, padding: "20px 28px", alignItems: "start" }}>
          <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 9, overflow: "hidden" }}>
            {db.drafts.map((d) => {
              const on = sel && sel.id === d.id;
              return (
                <button key={d.id} onClick={() => setSelId(d.id)} className={on ? "" : "crm-row"}
                  style={{ display: "block", width: "100%", textAlign: "left", border: "none", borderBottom: `1px solid ${C.line}`, borderLeft: `3px solid ${on ? C.jade : "transparent"}`, background: on ? C.jadeSoft : C.panel, padding: "10px 12px", cursor: "pointer" }}>
                  <div style={{ fontFamily: "var(--ui)", fontSize: 13, fontWeight: 600, color: C.ink }}>{d.programa || "Sin nombre"}</div>
                  <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, color: C.mute, marginTop: 2 }}>
                    {[d.division, d.temporada, `${d.jugadores.length} jugadores`].filter(Boolean).join(" · ")}
                  </div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: C.faint, marginTop: 2 }}>{fmt(d.creadoEn)}</div>
                </button>
              );
            })}
          </div>
          {sel && <DraftDetalle key={sel.id} draft={sel} onCambiar={(patch) => cambiar(sel.id, patch)} onBorrar={() => borrar(sel.id)} />}
        </div>
      )}
      {nuevo && <NuevoDraft onClose={() => setNuevo(false)} onListo={guardar} />}
    </div>
  );
}

function NuevoDraft({ onClose, onListo }) {
  const [url, setUrl] = useState("");
  const [division, setDivision] = useState("");
  const [texto, setTexto] = useState("");
  const [conTexto, setConTexto] = useState(false);
  const [estado, setEstado] = useState({ cargando: false, error: "" });

  const listo = conTexto ? texto.trim() : /^https?:\/\/\S+\.\S+/.test(url.trim());
  const analizar = async () => {
    setEstado({ cargando: true, error: "" });
    try {
      const r = await fetch("/api/drafts", {
        method: "POST",
        redirect: "manual",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Origen": "drafts" },
        body: JSON.stringify({ url: url.trim() || null, division, texto: conTexto ? texto : "" }),
      });
      if (r.type === "opaqueredirect" || r.status === 401) throw new Error("La sesión del CRM venció. Recarga la página para volver a entrar.");
      if (!(r.headers.get("Content-Type") || "").includes("application/json")) throw new Error("Drafts sólo funciona en la versión publicada del CRM.");
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
      onListo({
        id: uid(),
        url: url.trim(),
        programa: data.programa || "",
        division: division || (DIVISIONES.includes(data.division) ? data.division : ""),
        temporada: data.temporada || "",
        notas: data.notas || "",
        fuente: data.fuente,
        creadoEn: nowISO(),
        jugadores: data.jugadores.map((j) => ({ ...j, id: uid() })),
      });
    } catch (e) {
      setEstado({ cargando: false, error: (e && e.message) || String(e) });
    }
  };

  return (
    <Modal title="Analizar un roster" subtitle="Claude lee la plantilla y saca el año y la posición de cada jugador. Tarda entre 20 segundos y un minuto."
      onClose={estado.cargando ? () => {} : onClose}
      footer={<>
        <Btn variant="ghost" disabled={estado.cargando} onClick={onClose}>Cancelar</Btn>
        <Btn variant="solid" Icon={Sparkles} disabled={!listo || estado.cargando} onClick={analizar}>{estado.cargando ? "Leyendo el roster…" : "Analizar"}</Btn>
      </>}>
      <div style={{ display: "grid", gap: 14 }}>
        <Field def={{ label: "Enlace del roster", type: "text" }} value={url} onChange={setUrl} />
        <Field def={{ label: "División (si la dejas vacía, la deduce de la página)", type: "select", options: DIVISIONES }} value={division} onChange={setDivision} />
        <label style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: "var(--ui)", fontSize: 12.5, color: C.mute, cursor: "pointer" }}>
          <input type="checkbox" checked={conTexto} onChange={(e) => setConTexto(e.target.checked)} />
          La página no se deja leer: pegaré el texto del roster
        </label>
        {conTexto && (
          <label style={{ display: "block" }}>
            <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, fontWeight: 600, color: C.mute, marginBottom: 5 }}>Texto del roster (selecciona la tabla en la página, cópiala y pégala aquí)</div>
            <textarea className="crm-in" rows={9} value={texto} onChange={(e) => setTexto(e.target.value)} style={{ ...inputStyle, resize: "vertical", fontFamily: "var(--mono)", fontSize: 12 }} />
          </label>
        )}
        {estado.error && <div style={{ fontFamily: "var(--ui)", fontSize: 12.5, color: C.clay }}>{estado.error}</div>}
      </div>
    </Modal>
  );
}

function DraftDetalle({ draft, onCambiar, onBorrar }) {
  const a = useMemo(() => analizarRoster(draft), [draft]);
  const [verJugadores, setVerJugadores] = useState(false);
  const T = a.forecast.TOTAL;
  const columnasAno = [...a.anos, ...(a.porAno.SD ? [{ key: "SD", label: "Sin año" }] : [])];
  const filasGrupo = [...GRUPOS, ...(Object.values(a.matriz.SD).some(Boolean) ? [{ key: "SD", label: "Sin posición" }] : [])];
  const cambiarJugador = (id, patch) => onCambiar({ jugadores: draft.jugadores.map((j) => j.id === id ? { ...j, ...patch } : j) });

  const Kpi = ({ label, value, hint }) => (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 9, padding: "12px 14px" }}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: C.faint, letterSpacing: ".06em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: "var(--display)", fontSize: 26, fontWeight: 600, marginTop: 2 }}>{value}</div>
      {hint && <div style={{ fontFamily: "var(--ui)", fontSize: 11.5, color: C.mute }}>{hint}</div>}
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 14, minWidth: 0 }}>
      <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 9, padding: 16, display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 220px" }}>
          <Field def={{ label: "Programa", type: "text" }} value={draft.programa} onChange={(v) => onCambiar({ programa: v })} />
        </div>
        <div style={{ width: 150 }}>
          <Field def={{ label: "División", type: "select", options: DIVISIONES }} value={draft.division} onChange={(v) => onCambiar({ division: v })} />
        </div>
        <div style={{ width: 110 }}>
          <Field def={{ label: "Temporada", type: "text" }} value={draft.temporada} onChange={(v) => onCambiar({ temporada: v })} />
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {draft.url && <a href={draft.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}><Btn variant="outline" Icon={ExternalLink}>Roster</Btn></a>}
          <Btn variant="danger" Icon={Trash2} onClick={onBorrar}>Borrar</Btn>
        </div>
      </div>

      {draft.notas && (
        <div style={{ background: C.amberSoft, color: C.amber, borderRadius: 8, padding: "9px 12px", fontFamily: "var(--ui)", fontSize: 12.5, display: "flex", gap: 7, alignItems: "flex-start" }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} /> {draft.notas}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        <Kpi label="Plantilla" value={a.total} hint={`Temporada ${a.base}`} />
        <Kpi label="Último año" value={T.salen[0]} hint={draft.division === "NJCAA" ? "SO" : "GS + SR"} />
        <Kpi label={`Quedan en ${a.temporadas[0]}`} value={T.quedan[0]} hint="sin reclutar a nadie" />
        <Kpi label={`A reclutar ${a.temporadas[0]}`} value={T.faltan[0]} hint="para mantener el tamaño" />
      </div>

      <Card title="Conclusiones">
        <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
          {a.conclusiones.map((c, i) => <li key={i} style={{ fontFamily: "var(--ui)", fontSize: 13, color: C.ink, lineHeight: 1.5 }}>{c}</li>)}
        </ul>
      </Card>

      <Card title="Pronóstico por posición" badge={<span style={{ fontFamily: "var(--ui)", fontSize: 11.5, color: C.mute }}>
        Jugadores que quedan al empezar cada temporada si no reclutan. En rojo, los que hay que traer para tener los mismos de hoy.
        {draft.division === "NJCAA" ? " En NJCAA el SO está en su último año y al FR le queda 1." : " GS y SR se van; al JR le queda 1 año, al SO 2 y al FR 3."}
      </span>}>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr>
              <th style={thStyle}>Posición</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Hoy ({a.base})</th>
              {a.temporadas.map((t) => <th key={t} style={{ ...thStyle, textAlign: "center" }}>{t}</th>)}
              <th style={thStyle}>Prioridad {a.temporadas[0]}</th>
            </tr></thead>
            <tbody>
              {[...GRUPOS, { key: "TOTAL", label: "Total" }].map((g) => {
                const f = a.forecast[g.key];
                const p = PRIORIDAD[f.prioridad];
                const tot = g.key === "TOTAL";
                return (
                  <tr key={g.key} style={tot ? { background: "#F7F9F6" } : undefined}>
                    <td style={{ ...tdStyle, fontWeight: tot ? 600 : 500 }}>{g.label}</td>
                    <td style={{ ...tdStyle, ...num, fontWeight: 600 }}>{f.actual}</td>
                    {a.temporadas.map((t, i) => (
                      <td key={t} style={{ ...tdStyle, ...num }}>
                        {f.quedan[i]}
                        {f.faltan[i] > 0 && <span style={{ color: C.clay, fontSize: 11.5, marginLeft: 6 }}>−{f.faltan[i]}</span>}
                      </td>
                    ))}
                    <td style={tdStyle}>{!tot && <Pill color={p.color} soft={p.soft}>{p.label}</Pill>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
        <Card title="Jugadores por año">
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${columnasAno.length}, 1fr)`, gap: 8 }}>
            {columnasAno.map((y) => (
              <div key={y.key} style={{ background: "#F7F9F6", borderRadius: 7, padding: "10px 6px", textAlign: "center" }}>
                <div style={{ fontFamily: "var(--display)", fontSize: 22, fontWeight: 600 }}>{a.porAno[y.key]}</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: C.ink, fontWeight: 500 }}>{y.key}</div>
                <div style={{ fontFamily: "var(--ui)", fontSize: 10.5, color: C.faint }}>{y.label}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Por posición y año">
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr>
                <th style={thStyle}>Posición</th>
                {columnasAno.map((y) => <th key={y.key} style={{ ...thStyle, textAlign: "center" }}>{y.key}</th>)}
                <th style={{ ...thStyle, textAlign: "center" }}>Total</th>
              </tr></thead>
              <tbody>
                {filasGrupo.map((g) => {
                  const fila = a.matriz[g.key];
                  return (
                    <tr key={g.key}>
                      <td style={{ ...tdStyle, fontWeight: 500 }}>{g.label}</td>
                      {columnasAno.map((y) => <td key={y.key} style={{ ...tdStyle, ...num, color: fila[y.key] ? C.ink : C.faint }}>{fila[y.key]}</td>)}
                      <td style={{ ...tdStyle, ...num, fontWeight: 600 }}>{Object.values(fila).reduce((s, n) => s + n, 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card title={`Jugadores (${draft.jugadores.length})`} badge={
        <Btn size="sm" variant="ghost" Icon={verJugadores ? ChevronDown : ChevronRight} onClick={() => setVerJugadores(!verJugadores)}>{verJugadores ? "Ocultar" : "Ver y corregir"}</Btn>
      }>
        {verJugadores ? (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr>
                <th style={thStyle}>#</th><th style={thStyle}>Nombre</th><th style={thStyle}>Posición en la página</th><th style={thStyle}>Grupo</th><th style={thStyle}>Año</th>
              </tr></thead>
              <tbody>
                {draft.jugadores.map((j) => (
                  <tr key={j.id}>
                    <td style={{ ...tdStyle, fontFamily: "var(--mono)", color: C.mute }}>{j.numero}</td>
                    <td style={tdStyle}>{j.nombre}</td>
                    <td style={{ ...tdStyle, color: C.mute }}>{j.posicion}{j.redshirt ? " · RS" : ""}</td>
                    <td style={tdStyle}>
                      <select className="crm-in" value={j.grupo} onChange={(e) => cambiarJugador(j.id, { grupo: e.target.value })} style={{ ...inputStyle, padding: "4px 6px", width: "auto", color: GRUPOS.some((g) => g.key === j.grupo) ? C.ink : C.clay }}>
                        {GRUPOS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
                        <option value="SD">Sin posición</option>
                      </select>
                    </td>
                    <td style={tdStyle}>
                      <select className="crm-in" value={j.ano} onChange={(e) => cambiarJugador(j.id, { ano: e.target.value })} style={{ ...inputStyle, padding: "4px 6px", width: "auto", color: ANOS.some((y) => y.key === j.ano) ? C.ink : C.clay }}>
                        {ANOS.map((y) => <option key={y.key} value={y.key}>{y.key} · {y.label}</option>)}
                        <option value="SD">Sin año</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Prose>Si Claude leyó mal el año o la posición de alguien, corrígelo aquí y los números se recalculan.</Prose>
        )}
      </Card>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Detalle de registro
   ──────────────────────────────────────────────────────────── */
/* ────────────────────────────────────────────────────────────
   Asistente de Claude en la ficha
   Manda la ficha abierta —propiedades con su etiqueta, empresa, negocios e
   historial reciente— al Worker (/api/claude), que es quien guarda la clave
   de la API. Lo que vuelve es un borrador para leer y copiar; nada se envía
   ni se guarda solo. Sólo funciona en la versión publicada (`npm run deploy`
   o `npm run nube:local`), porque `npm run dev` no tiene Worker detrás.
   ──────────────────────────────────────────────────────────── */
const TAREAS_CLAUDE = [
  { key: "resumir", label: "Resumir" },
  { key: "siguiente", label: "Siguiente paso" },
  { key: "whatsapp", label: "Redactar WhatsApp" },
  { key: "correo", label: "Redactar correo" },
];

function fichaParaClaude(db, kind, rec, acts, relatedDeals) {
  const conEtiquetas = (k, r) => Object.fromEntries((db.schema[k] || [])
    .filter((f) => r.props[f.key] != null && r.props[f.key] !== "")
    .map((f) => [f.label, r.props[f.key]]));
  const empresa = rec.companyId && db.companies.find((c) => c.id === rec.companyId);
  const contactos = (rec.contactIds || []).map((cid) => db.contacts.find((c) => c.id === cid)).filter(Boolean);
  return {
    tipo: OBJ[kind].singular,
    nombre: titleOf(kind, rec),
    propiedades: conEtiquetas(kind, rec),
    ...(empresa ? { empresa: { nombre: titleOf("company", empresa), ...conEtiquetas("company", empresa) } } : {}),
    ...(contactos.length ? { contactos: contactos.map((c) => ({ nombre: titleOf("contact", c), ...conEtiquetas("contact", c) })) } : {}),
    ...(relatedDeals.length ? { negocios: relatedDeals.map((d) => ({ nombre: d.props.name, etapa: d.props.stage, valor: d.props.amount })) } : {}),
    /* Las 40 más recientes y cada cuerpo recortado: una conversación larga
       de correos con citas y firmas no cabe entera ni hace falta. */
    historial: acts.slice(0, 40).map((a) => ({
      canal: (CHANNEL[a.type] || {}).label || a.type,
      sentido: a.dir === "in" ? "recibido" : "enviado",
      fecha: a.at,
      ...(a.subject ? { asunto: a.subject } : {}),
      ...(a.body ? { texto: htmlToText(String(a.body)).slice(0, 3000) } : {}),
    })),
  };
}

function AsistenteClaude({ db, kind, rec, acts, relatedDeals }) {
  const [pregunta, setPregunta] = useState("");
  const [estado, setEstado] = useState({ cargando: null, texto: "", error: "" });
  const [copiado, setCopiado] = useState(false);

  /* Al cambiar de ficha se borra lo anterior: un borrador para otra persona
     a la vista es justo el que termina enviado a quien no era. */
  useEffect(() => { setEstado({ cargando: null, texto: "", error: "" }); setPregunta(""); }, [rec.id]);

  const pedir = async (tarea) => {
    setEstado({ cargando: tarea, texto: "", error: "" });
    setCopiado(false);
    try {
      const r = await fetch("/api/claude", {
        method: "POST",
        redirect: "manual",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Origen": "asistente" },
        body: JSON.stringify({ tarea, pregunta, ficha: fichaParaClaude(db, kind, rec, acts, relatedDeals) }),
      });
      if (r.type === "opaqueredirect" || r.status === 401) throw new Error("La sesión del CRM venció. Recarga la página para volver a entrar.");
      const tipo = r.headers.get("Content-Type") || "";
      if (!tipo.includes("application/json")) throw new Error("El asistente sólo funciona en la versión publicada del CRM.");
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
      setEstado({ cargando: null, texto: data.texto, error: "" });
    } catch (e) {
      setEstado({ cargando: null, texto: "", error: (e && e.message) || String(e) });
    }
  };

  const copiar = async () => {
    try { await navigator.clipboard.writeText(estado.texto); setCopiado(true); setTimeout(() => setCopiado(false), 1800); } catch (_) {}
  };

  const ocupado = Boolean(estado.cargando);
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 9, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--display)", fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
        <Sparkles size={14} color={C.plum} /> Asistente
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {TAREAS_CLAUDE.map((t) => (
          <Btn key={t.key} size="sm" variant="outline" disabled={ocupado} onClick={() => pedir(t.key)}>
            {estado.cargando === t.key ? "Pensando…" : t.label}
          </Btn>
        ))}
      </div>
      <div style={{ display: "flex", gap: 7 }}>
        <input className="crm-in" placeholder="Pregúntale algo sobre esta ficha, o da indicaciones para el borrador…" value={pregunta}
          onChange={(e) => setPregunta(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && pregunta.trim() && !ocupado) pedir("pregunta"); }}
          style={inputStyle} />
        <Btn variant="outline" disabled={!pregunta.trim() || ocupado} onClick={() => pedir("pregunta")}>
          {estado.cargando === "pregunta" ? "Pensando…" : "Preguntar"}
        </Btn>
      </div>
      {estado.error && <div style={{ marginTop: 10, fontFamily: "var(--ui)", fontSize: 12.5, color: C.clay }}>{estado.error}</div>}
      {estado.texto && (
        <div style={{ marginTop: 12, background: C.plumSoft, borderRadius: 7, padding: 12 }}>
          <div style={{ fontFamily: "var(--ui)", fontSize: 13, color: C.ink, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{estado.texto}</div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
            <Btn size="sm" variant="outline" Icon={copiado ? Check : Copy} onClick={copiar}>{copiado ? "Copiado" : "Copiar"}</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

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

          <AsistenteClaude db={db} kind={kind} rec={rec} acts={acts} relatedDeals={relatedDeals} />

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
