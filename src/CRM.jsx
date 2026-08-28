import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  LayoutDashboard, Users, Building2, Briefcase, Activity, MessageSquare, Mail,
  Phone, Settings, Plus, Upload, Search, X, Check, ChevronDown, Trash2, Copy,
  FileText, Clock, Eye, Download, Plug, Send, ExternalLink, ShieldCheck, LogOut,
  Code2, Paperclip
} from "lucide-react";
import {
  EMAIL_MODES, normalizeIntegrations, toE164, waLink,
  gmailComposeLink, mailtoLink, gmailStatus, onGmailChange, connectGmail,
  disconnectGmail, sendGmail, withSignature, withSignatureHtml, htmlToText, escapeHtml,
} from "./integrations.js";

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
const LEAD_SOURCE = ["Meta Lead Ads", "Facebook", "Instagram", "WhatsApp", "Sitio web", "Referido", "Evento", "Carga masiva", "Manual", "Llamada entrante"];

const BASE_SCHEMA = {
  contact: [
    { key: "firstName", label: "Nombre", type: "text", system: true, col: true, required: true },
    { key: "lastName", label: "Apellido", type: "text", system: true, col: true },
    { key: "phone", label: "Teléfono", type: "phone", system: true, col: true },
    { key: "email", label: "Correo", type: "email", system: true, col: true },
    { key: "leadStatus", label: "Estado de lead", type: "select", options: LEAD_STATUS, system: true, col: true },
    { key: "leadSource", label: "Fuente de lead", type: "select", options: LEAD_SOURCE, system: true, col: true },
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
    { key: "leadStatus", label: "Estado de lead", type: "select", options: LEAD_STATUS, system: true, col: true },
    { key: "leadSource", label: "Fuente de lead", type: "select", options: LEAD_SOURCE, system: true, col: true },
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
});

/* Completa las claves que falten sin descartar nada de lo guardado: si el
   archivo llega incompleto se rellena, en vez de arrancar de cero encima. */
function normalizeDb(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  const base = emptyDb();
  const arr = (x) => (Array.isArray(x) ? x : []);
  const sch = (k) => (arr(d.schema && d.schema[k]).length ? d.schema[k] : base.schema[k]);
  return {
    ...d,
    v: DATA_VERSION,
    schema: { contact: sch("contact"), company: sch("company"), deal: sch("deal") },
    contacts: arr(d.contacts),
    companies: arr(d.companies),
    deals: arr(d.deals),
    activities: arr(d.activities),
    /* Las plantillas guardadas antes del diseño HTML no traen ese campo: se
       completa vacío para que la pantalla no tenga que adivinarlo. */
    templates: {
      whatsapp: arr(d.templates && d.templates.whatsapp).map((t) => ({ ...t, html: "" })),
      email: arr(d.templates && d.templates.email).map((t) => ({ ...t, html: String((t && t.html) || "") })),
    },
    integrations: normalizeIntegrations(d.integrations),
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
  const base = { display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 6, fontFamily: "var(--ui)", fontWeight: 500, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1, border: "1px solid transparent", transition: "background .12s, border-color .12s", whiteSpace: "nowrap" };
  const sizes = { sm: { fontSize: 12, padding: "5px 9px" }, md: { fontSize: 13, padding: "7px 12px" } };
  const variants = {
    solid: { background: C.jade, color: "#fff" },
    outline: { background: C.panel, color: C.ink, borderColor: C.line },
    ghost: { background: "transparent", color: C.mute },
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

  const say = (m) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  /* Escritura real en el almacenamiento. Se dispara al vencer el rebote y
     también al cerrar o esconder la pestaña, para que nada quede a medias. */
  const persist = React.useCallback(() => {
    if (!pending.current || !dbRef.current) return;
    const payload = JSON.stringify(dbRef.current);
    const failed = (e) => setSave({ state: "error", at: null, error: (e && e.message) || String(e) });
    try {
      Promise.resolve(window.storage.set(STORE_KEY, payload))
        .then(() => { pending.current = false; setSave({ state: "saved", at: new Date(), error: null }); })
        .catch(failed);
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

  /* Cerrar la pestaña, recargar o pasar a otra app vacía lo que esté pendiente. */
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") persist(); };
    window.addEventListener("beforeunload", persist);
    window.addEventListener("pagehide", persist);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", persist);
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
    if (!emailCfg || emailCfg.mode !== "gmailApi" || !emailCfg.clientId) return;
    triedGmail.current = true;
    connectGmail(emailCfg.clientId, { silent: true }).catch(() => {});
  }, [emailCfg && emailCfg.mode, emailCfg && emailCfg.clientId]);

  /* ── mutaciones ── */
  const collKey = (kind) => (kind === "contact" ? "contacts" : kind === "company" ? "companies" : "deals");

  const addRecords = (kind, list) => setDb((d) => ({ ...d, [collKey(kind)]: [...list, ...d[collKey(kind)]] }));
  const updateRecord = (kind, id, props) => setDb((d) => ({
    ...d, [collKey(kind)]: d[collKey(kind)].map((r) => (r.id === id ? { ...r, props: { ...r.props, ...props } } : r)),
  }));
  const deleteRecords = (kind, ids) => setDb((d) => ({ ...d, [collKey(kind)]: d[collKey(kind)].filter((r) => !ids.includes(r.id)) }));

  const logActivity = (act) => setDb((d) => {
    const at = act.at || nowISO();
    const stamp = (arr) => arr.map((r) => ((act.contactIds || []).includes(r.id) || (act.companyIds || []).includes(r.id)) ? { ...r, props: { ...r.props, lastActivityAt: at } } : r);
    return {
      ...d,
      activities: [{ id: uid(), at, ...act }, ...d.activities],
      contacts: stamp(d.contacts),
      companies: stamp(d.companies),
      deals: act.dealId ? d.deals.map((x) => x.id === act.dealId ? { ...x, props: { ...x.props, lastActivityAt: at } } : x) : d.deals,
    };
  });

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

  const NAV = [
    { key: "dashboard", label: "Panel", Icon: LayoutDashboard },
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
            return (
              <button key={key} className={on ? "" : "crm-nav"} onClick={() => { setView(key); setDetail(null); }}
                style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: on ? C.jade : "transparent", color: on ? "#fff" : C.ink, fontFamily: "var(--ui)", fontSize: 13.5, fontWeight: on ? 600 : 400, textAlign: "left" }}>
                <Icon size={15} strokeWidth={2} /> {label}
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
          {(view === "contact" || view === "company") && (
            <RecordList key={view} kind={view} db={db} setModal={setModal} setDetail={setDetail} onDelete={(ids) => { deleteRecords(view, ids); say(`${ids.length} registro(s) eliminados`); }} />
          )}
          {view === "deal" && <DealsView db={db} setModal={setModal} setDetail={setDetail} onStage={(id, stage) => { updateRecord("deal", id, { stage, lastActivityAt: nowISO() }); say(`Negocio movido a ${stage}`); }} />}
          {view === "activities" && <ActivitiesView db={db} setModal={setModal} />}
          {view === "templates" && <TemplatesView db={db} setDb={setDb} say={say} />}
          {view === "connections" && <ConnectionsView db={db} setDb={setDb} say={say} />}
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
          onSave={(props, id) => {
            if (id) { updateRecord(modal.objKind, id, props); say("Cambios guardados"); }
            else { addRecords(modal.objKind, [{ id: uid(), props: { createdAt: nowISO(), ...props }, ...(modal.links || {}) }]); say(`${OBJ[modal.objKind].singular} creado`); }
            setModal(null);
          }} />
      )}
      {modal?.kind === "import" && (
        <ImportModal db={db} objKind={modal.objKind} onClose={() => setModal(null)}
          onImport={({ records, newFields, optionAdds }) => {
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
            say(`${records.length} registros importados${newFields.length ? ` · ${newFields.length} propiedades creadas` : ""}`);
          }} />
      )}
      {modal?.kind === "prop" && (
        <PropertyModal objKind={modal.objKind} onClose={() => setModal(null)}
          onCreate={(def) => {
            setDb((d) => ({ ...d, schema: { ...d.schema, [modal.objKind]: [...d.schema[modal.objKind], def] } }));
            setModal(null); say(`Propiedad "${def.label}" creada`);
          }} />
      )}
      {modal?.kind === "send" && (
        <SendModal db={db} channel={modal.channel} kind={modal.objKind} ids={modal.ids}
          onClose={() => setModal(null)}
          onLogOne={(id, payload) => logActivity({ type: modal.channel, subject: payload.subject, body: payload.body, ...(modal.objKind === "contact" ? { contactIds: [id] } : { companyIds: [id] }) })}
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
function ActivitiesView({ db, setModal }) {
  const [f, setF] = useState("all");
  const list = db.activities.filter((a) => f === "all" || a.type === f);
  return (
    <div>
      <Header eyebrow={`${db.activities.length} registradas`} title="Actividades"
        right={<>
          <Btn variant="outline" Icon={MessageSquare} onClick={() => setModal({ kind: "send", channel: "whatsapp", objKind: "contact", ids: db.contacts.map((c) => c.id) })}>WhatsApp masivo</Btn>
          <Btn variant="solid" Icon={Mail} onClick={() => setModal({ kind: "send", channel: "email", objKind: "contact", ids: db.contacts.map((c) => c.id) })}>Correo masivo</Btn>
        </>} />
      <div style={{ padding: "14px 28px", display: "flex", gap: 7, borderBottom: `1px solid ${C.line}`, flexWrap: "wrap" }}>
        {[["all", "Todas"], ["whatsapp", "WhatsApp"], ["email", "Correos"], ["call", "Llamadas"], ["note", "Notas"]].map(([k, l]) => (
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
                </div>
                <div style={{ fontFamily: "var(--ui)", fontSize: 12.5, color: C.mute, marginTop: 2 }}>{resolveNames(db, a)}</div>
                {a.body && <div style={{ fontFamily: "var(--ui)", fontSize: 12.5, color: C.mute, marginTop: 6, background: "#F6F8F4", padding: "8px 10px", borderRadius: 6, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{a.body}</div>}
              </div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: C.faint, whiteSpace: "nowrap" }}>{fmt(a.at)}</div>
            </div>
          );
        })}
        {list.length === 0 && <Empty title="Sin actividades en este filtro" hint="Envía una plantilla o registra una llamada desde un contacto." />}
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
                  El CRM sólo pide el permiso <Mono>gmail.send</Mono>: alcanza para enviar y para nada más —no puede
                  leer, buscar ni borrar tu correo. El permiso dura una hora, se queda en memoria y nunca se guarda
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
function RecordForm({ db, objKind, id, presets, onClose, onSave }) {
  const schema = db.schema[objKind];
  const coll = objKind === "contact" ? db.contacts : objKind === "company" ? db.companies : db.deals;
  const existing = id ? coll.find((r) => r.id === id) : null;
  const [v, setV] = useState(existing ? { ...existing.props } : { ...(presets || {}) });

  const visible = schema.filter((f) => !f.readOnly && (!f.showIf || v[f.showIf.key] === f.showIf.value));
  const missing = schema.filter((f) => f.required && !String(v[f.key] || "").trim()).map((f) => f.label);

  return (
    <Modal wide title={existing ? `Editar ${OBJ[objKind].singular.toLowerCase()}` : `Crear ${OBJ[objKind].singular.toLowerCase()}`}
      subtitle={existing ? "Los cambios se guardan en el registro y quedan visibles para el equipo." : "Los campos con * son obligatorios."}
      onClose={onClose}
      footer={<><Btn variant="outline" onClick={onClose}>Cancelar</Btn>
        <Btn variant="solid" Icon={Check} disabled={missing.length > 0} onClick={() => onSave({ ...v, lastActivityAt: v.lastActivityAt || nowISO() }, id)}>
          {existing ? "Guardar cambios" : "Crear"}</Btn></>}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 13 }}>
        {visible.map((f) => <Field key={f.key} def={f} value={v[f.key]} onChange={(val) => setV({ ...v, [f.key]: val })} />)}
      </div>
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

    const records = body.map((r) => {
      const props = { createdAt: nowISO(), lastActivityAt: nowISO(), leadSource: "Carga masiva" };
      r.forEach((cell, i) => {
        const val = String(cell ?? "").trim();
        if (!val) return;
        const key = map[i] === NEW_PROP ? keyByCol[i] : map[i];
        if (key) props[key] = val;
      });
      if (!props.leadStatus) props.leadStatus = "Nuevo";
      return { id: uid(), props };
    });

    return { records, newFields, optionAdds };
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
        <Btn variant="solid" Icon={Upload} disabled={!body.length} onClick={() => onImport(build())}>Importar {body.length || ""} registros</Btn></>}>
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
            Se importarán <b>{body.length}</b> registros con fuente “Carga masiva”.
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

  const marcar = (r) => {
    onLogOne(r.id, { subject: asuntoLog(r), body: cuerpoDe(r) });
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
        await sendGmail({ to: destOf(r), subject: asuntoDe(r), body: cuerpoDe(r), html: htmlDe(r), clientId: integ.email.clientId });
        marcar(r);
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
      ? (gmail.connected ? `El CRM envía desde ${gmail.account || "tu cuenta de Gmail"}${conHtml ? ", con el diseño HTML" : ""}.` : "Falta autorizar la cuenta de Gmail.")
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
                    <div style={{ fontFamily: "var(--ui)", fontSize: 12.5, fontWeight: 500 }}>{a.subject}</div>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: C.faint, marginTop: 2 }}><Clock size={9} style={{ display: "inline", marginRight: 4 }} />{fmt(a.at)}</div>
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
