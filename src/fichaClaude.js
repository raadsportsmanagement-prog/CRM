/* ────────────────────────────────────────────────────────────
   La ficha que se le pasa a Claude
   Lo mismo para el asistente de la ficha y los agentes, desde la app o desde
   el servidor (nube/operacion.js): propiedades con su etiqueta, la empresa,
   los contactos, los negocios, las alianzas y el historial reciente. Que salga de un solo
   sitio es lo que hace que un agente conteste igual con el CRM abierto que
   cerrado. No toca la red ni el navegador.
   ──────────────────────────────────────────────────────────── */

import { htmlToText } from "./integrations.js";

const SINGULAR = { contact: "Contacto", company: "Empresa", deal: "Negocio", alliance: "Alianza" };
const CANAL = { whatsapp: "WhatsApp", email: "Correo", call: "Llamada", note: "Nota", app: "App Catch" };

export const titulo = (kind, rec) => {
  const p = (rec && rec.props) || {};
  if (kind === "contact") return [p.firstName, p.lastName].filter(Boolean).join(" ") || "Sin nombre";
  return p.name || "Sin nombre";
};

export function fichaParaClaude(db, kind, rec, acts, relatedDeals, relatedAlliances = []) {
  const conEtiquetas = (k, r) => Object.fromEntries((db.schema[k] || [])
    .filter((f) => r.props[f.key] != null && r.props[f.key] !== "")
    .map((f) => [f.label, r.props[f.key]]));
  const empresa = rec.companyId && db.companies.find((c) => c.id === rec.companyId);
  const contactos = (rec.contactIds || []).map((cid) => db.contacts.find((c) => c.id === cid)).filter(Boolean);
  return {
    tipo: SINGULAR[kind],
    nombre: titulo(kind, rec),
    propiedades: conEtiquetas(kind, rec),
    ...(empresa ? { empresa: { nombre: titulo("company", empresa), ...conEtiquetas("company", empresa) } } : {}),
    ...(contactos.length ? { contactos: contactos.map((c) => ({ nombre: titulo("contact", c), ...conEtiquetas("contact", c) })) } : {}),
    ...(relatedDeals.length ? { negocios: relatedDeals.map((d) => ({ nombre: d.props.name, etapa: d.props.stage, valor: d.props.amount })) } : {}),
    ...(relatedAlliances.length ? { alianzas: relatedAlliances.map((d) => ({ nombre: d.props.name, etapa: d.props.stage })) } : {}),
    /* Las 40 más recientes y cada cuerpo recortado: una conversación larga
       de correos con citas y firmas no cabe entera ni hace falta. */
    historial: acts.slice(0, 40).map((a) => ({
      canal: CANAL[a.type] || a.type,
      sentido: a.dir === "in" ? "recibido" : "enviado",
      fecha: a.at,
      ...(a.subject ? { asunto: a.subject } : {}),
      ...(a.body ? { texto: htmlToText(String(a.body)).slice(0, 3000) } : {}),
    })),
  };
}

/* La ficha de un contacto o empresa con su historial, sus negocios y sus
   alianzas, como la
   piden los agentes. */
export function fichaDe(db, kind, rec) {
  const tiene = (a) => (a.contactIds || []).includes(rec.id) || (a.companyIds || []).includes(rec.id);
  const acts = (db.activities || []).filter(tiene).sort((a, b) => (a.at < b.at ? 1 : -1));
  const suyas = (lista) => (lista || []).filter((d) => (d.contactIds || []).includes(rec.id) || d.companyId === rec.id);
  return fichaParaClaude(db, kind, rec, acts, suyas(db.deals), suyas(db.alliances));
}
