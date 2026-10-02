/* ────────────────────────────────────────────────────────────
   El CRM como servidor MCP
   Para que Claude (claude.ai, Claude Desktop o Claude Code) pueda consultar
   el cuaderno y anotar en él: «¿qué negocios siguen en propuesta?», «crea el
   contacto de Laura y déjale una nota».

   Vive en /mcp, en la misma dirección del CRM y detrás de la misma puerta:
   Cloudflare Access, con «Managed OAuth» encendido, le hace al cliente de
   Claude el mismo inicio de sesión por correo que a una persona, y aquí llega
   la misma credencial firmada que revisa `quienEs`.

   Lo que Claude puede hacer está acotado a propósito:
   · Lee y escribe sólo contactos, empresas, negocios y notas. Las conexiones
     (la clave del puente, la cuenta de Gmail) no salen nunca de aquí.
   · No borra. Borrar no se deshace desde la app; eso se hace a mano.
   · Lo que escribe llega a las pestañas abiertas por la conexión en vivo,
     igual que un cambio hecho desde el celular, y queda en las copias.
   ──────────────────────────────────────────────────────────── */

import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { z } from "zod";

const CLAVE_PRINCIPAL = "crm:data";

const COLECCION = { contact: "contacts", company: "companies", deal: "deals" };
const TIPO = z.enum(["contact", "company", "deal"]).describe("contact = contacto, company = empresa, deal = negocio");

/* Mismas reglas que la app (CRM.jsx), copiadas porque aquella vive en el
   navegador. Si allá cambian, cambiarlas aquí también. */
const uid = () => Math.random().toString(36).slice(2, 10);
const nowISO = () => new Date().toISOString();
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const emailKey = (v) => String(v || "").trim().toLowerCase();
const titulo = (tipo, r) => {
  const p = (r && r.props) || {};
  if (tipo === "contact") return [p.firstName, p.lastName].filter(Boolean).join(" ") || "Sin nombre";
  return p.name || "Sin nombre";
};
const ETAPAS = ["Nuevo", "Contactado", "Calificado", "Propuesta", "Negociación", "Ganado", "Perdido"];
const ABIERTO = (d) => !["ganado", "perdido"].includes(norm(d.props && d.props.stage));

const texto = (data) => ({ content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] });
const fallo = (msg) => ({ content: [{ type: "text", text: msg }], isError: true });

/* Una ficha resumida: lo que hace falta para reconocerla en una lista. */
const enLista = (tipo, r) => ({ id: r.id, nombre: titulo(tipo, r), ...r.props, ...(r.companyId ? { companyId: r.companyId } : {}), ...(r.contactIds && r.contactIds.length ? { contactIds: r.contactIds } : {}) });

/* Las actividades guardan el texto completo de cada correo; en una lista se
   recorta para no llenarle el contexto a Claude con firmas y citas. */
const actividadCorta = (a, largo = 400) => ({
  id: a.id, tipo: a.type, sentido: a.dir === "in" ? "recibido" : "enviado", at: a.at,
  ...(a.subject ? { asunto: a.subject } : {}),
  cuerpo: String(a.body || "").slice(0, largo),
  ...(a.contactIds && a.contactIds.length ? { contactIds: a.contactIds } : {}),
  ...(a.companyIds && a.companyIds.length ? { companyIds: a.companyIds } : {}),
  ...(a.dealId ? { dealId: a.dealId } : {}),
});

const tocaA = (a, tipo, id) =>
  tipo === "deal" ? a.dealId === id : (tipo === "contact" ? a.contactIds || [] : a.companyIds || []).includes(id);

/* Leer, cambiar y guardar el cuaderno. Entre leer y guardar alguien pudo
   escribir desde la app; el almacén lo detecta por el número de versión y
   entonces se vuelve a leer y se aplica el cambio sobre lo nuevo. */
async function leerDb(cuaderno) {
  const r = await cuaderno.leer(CLAVE_PRINCIPAL);
  if (!r) return { db: null, rev: 0 };
  return { db: JSON.parse(r.texto), rev: r.rev };
}

async function cambiarDb(cuaderno, quien, cambio) {
  for (let intento = 0; intento < 4; intento += 1) {
    const { db, rev } = await leerDb(cuaderno);
    if (!db) throw new Error("El cuaderno está vacío: abre el CRM una vez antes de usarlo desde Claude.");
    const res = cambio(db);
    if (res.error) return res;
    const r = await cuaderno.escribirSi(CLAVE_PRINCIPAL, JSON.stringify(res.db), `${quien} vía Claude`, rev);
    if (r.ok) return res;
  }
  throw new Error("El cuaderno cambió varias veces seguidas mientras se guardaba. Inténtalo de nuevo.");
}

function crearServidor(cuaderno, quien) {
  const server = new McpServer({ name: "crm-raad-sports", version: "1.0.0" });

  server.registerTool("resumen_crm", {
    description: "Panorama del CRM de Raad Sports: cuántos contactos, empresas y negocios hay, negocios por etapa con su valor, y la actividad más reciente. Úsalo primero para orientarte.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => {
    const { db } = await leerDb(cuaderno);
    if (!db) return texto("El cuaderno está vacío.");
    const deals = db.deals || [];
    const porEtapa = ETAPAS.map((e) => {
      const lista = deals.filter((d) => norm(d.props && d.props.stage) === norm(e));
      return { etapa: e, negocios: lista.length, valor: lista.reduce((s, d) => s + (Number(d.props.amount) || 0), 0) };
    });
    return texto({
      contactos: (db.contacts || []).length,
      empresas: (db.companies || []).length,
      negocios: deals.length,
      negociosAbiertos: deals.filter(ABIERTO).length,
      porEtapa,
      actividadReciente: (db.activities || []).slice(0, 10).map((a) => actividadCorta(a, 200)),
    });
  });

  server.registerTool("ver_esquema", {
    description: "Las propiedades que tiene cada tipo de ficha (clave, etiqueta, tipo y opciones válidas). Consúltalo antes de crear o actualizar para usar las claves y opciones correctas.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => {
    const { db } = await leerDb(cuaderno);
    const sch = (db && db.schema) || {};
    const limpio = (lista) => (lista || []).map((f) => ({
      clave: f.key, etiqueta: f.label, tipo: f.type,
      ...(f.options ? { opciones: f.options } : {}),
      ...(f.readOnly ? { soloLectura: true } : {}),
      ...(f.required ? { obligatoria: true } : {}),
    }));
    return texto({ contact: limpio(sch.contact), company: limpio(sch.company), deal: limpio(sch.deal) });
  });

  server.registerTool("buscar_registros", {
    description: "Busca contactos, empresas o negocios. El texto se busca en todas las propiedades (nombre, correo, teléfono, institución…), sin importar tildes ni mayúsculas. Devuelve fichas resumidas con su id.",
    inputSchema: {
      tipo: TIPO,
      texto: z.string().optional().describe("Texto a buscar. Vacío = todos."),
      filtros: z.record(z.string(), z.string()).optional().describe("Propiedad → valor exacto, p. ej. {\"leadStatus\": \"Nuevo\"} o {\"stage\": \"Propuesta\"}"),
      sinActividadDesdeDias: z.number().int().min(1).optional().describe("Sólo las fichas sin actividad en este número de días (o que nunca la tuvieron)."),
      limite: z.number().int().min(1).max(200).default(25),
    },
    annotations: { readOnlyHint: true },
  }, async ({ tipo, texto: q, filtros, sinActividadDesdeDias, limite }) => {
    const { db } = await leerDb(cuaderno);
    const lista = (db && db[COLECCION[tipo]]) || [];
    const nq = norm(q);
    const corte = sinActividadDesdeDias ? Date.now() - sinActividadDesdeDias * 86400000 : null;
    const hallados = lista.filter((r) => {
      const p = r.props || {};
      if (nq && !norm(Object.values(p).join(" ")).includes(nq)) return false;
      for (const [k, v] of Object.entries(filtros || {})) if (norm(p[k]) !== norm(v)) return false;
      if (corte != null) {
        const t = Date.parse(p.lastActivityAt || "");
        if (!isNaN(t) && t >= corte) return false;
      }
      return true;
    });
    return texto({ total: hallados.length, mostrando: Math.min(limite, hallados.length), registros: hallados.slice(0, limite).map((r) => enLista(tipo, r)) });
  });

  server.registerTool("ver_registro", {
    description: "Una ficha completa: sus propiedades, la empresa y los contactos vinculados, sus negocios y su historial de actividad (correos, WhatsApp, llamadas, notas).",
    inputSchema: {
      tipo: TIPO,
      id: z.string(),
      actividades: z.number().int().min(0).max(100).default(20).describe("Cuántas actividades recientes traer."),
    },
    annotations: { readOnlyHint: true },
  }, async ({ tipo, id, actividades }) => {
    const { db } = await leerDb(cuaderno);
    const r = db && (db[COLECCION[tipo]] || []).find((x) => x.id === id);
    if (!r) return fallo(`No hay ningún ${tipo} con id ${id}.`);
    const empresa = r.companyId && (db.companies || []).find((c) => c.id === r.companyId);
    const contactos = (r.contactIds || []).map((cid) => (db.contacts || []).find((c) => c.id === cid)).filter(Boolean);
    const negocios = tipo === "deal" ? [] : (db.deals || []).filter((d) => (d.contactIds || []).includes(id) || d.companyId === id);
    return texto({
      ...enLista(tipo, r),
      ...(empresa ? { empresa: enLista("company", empresa) } : {}),
      ...(contactos.length ? { contactos: contactos.map((c) => enLista("contact", c)) } : {}),
      ...(negocios.length ? { negocios: negocios.map((d) => enLista("deal", d)) } : {}),
      actividades: (db.activities || []).filter((a) => tocaA(a, tipo, id)).slice(0, actividades).map((a) => actividadCorta(a, 2000)),
    });
  });

  server.registerTool("listar_actividades", {
    description: "La actividad del CRM en orden, de la más reciente a la más vieja: correos, WhatsApp, llamadas y notas, enviados y recibidos.",
    inputSchema: {
      desde: z.string().optional().describe("Fecha ISO; sólo lo posterior."),
      canal: z.enum(["email", "whatsapp", "call", "note"]).optional(),
      sentido: z.enum(["recibido", "enviado"]).optional(),
      limite: z.number().int().min(1).max(200).default(30),
    },
    annotations: { readOnlyHint: true },
  }, async ({ desde, canal, sentido, limite }) => {
    const { db } = await leerDb(cuaderno);
    const t0 = desde ? Date.parse(desde) : NaN;
    const lista = ((db && db.activities) || []).filter((a) =>
      (!canal || a.type === canal) &&
      (!sentido || (sentido === "recibido") === (a.dir === "in")) &&
      (isNaN(t0) || Date.parse(a.at) >= t0));
    return texto({ total: lista.length, actividades: lista.slice(0, limite).map((a) => actividadCorta(a)) });
  });

  server.registerTool("crear_registro", {
    description: "Crea un contacto, una empresa o un negocio. Usa las claves de `ver_esquema` (p. ej. firstName, lastName, email, phone, leadStatus para contactos; name, stage, amount para negocios). No crea un contacto o empresa si ya hay otra ficha con el mismo correo.",
    inputSchema: {
      tipo: TIPO,
      props: z.record(z.string(), z.union([z.string(), z.number()])).describe("Propiedades de la ficha."),
      companyId: z.string().optional().describe("Empresa a la que pertenece (contactos y negocios)."),
      contactIds: z.array(z.string()).optional().describe("Contactos del negocio (sólo negocios)."),
    },
  }, async ({ tipo, props, companyId, contactIds }) => {
    const col = COLECCION[tipo];
    const res = await cambiarDb(cuaderno, quien, (db) => {
      const lista = db[col] || [];
      if (tipo !== "deal" && emailKey(props.email)) {
        const igual = lista.find((r) => emailKey(r.props && r.props.email) === emailKey(props.email));
        if (igual) return { error: `Ya existe «${titulo(tipo, igual)}» (id ${igual.id}) con el correo ${props.email}. Actualiza esa ficha en vez de crear otra.` };
      }
      if (tipo === "contact" && !props.firstName) return { error: "Un contacto necesita al menos firstName." };
      if (tipo !== "contact" && !props.name) return { error: "Hace falta name." };
      const ahora = nowISO();
      const rec = {
        id: uid(),
        props: { createdAt: ahora, lastActivityAt: ahora, ...(tipo === "deal" ? { stage: "Nuevo", source: "Manual" } : { leadSource: "Manual" }), ...props },
        ...(companyId ? { companyId } : {}),
        ...(tipo === "deal" ? { contactIds: contactIds || [] } : {}),
      };
      return { db: { ...db, [col]: [rec, ...lista] }, rec };
    });
    if (res.error) return fallo(res.error);
    return texto({ creado: enLista(tipo, res.rec) });
  });

  server.registerTool("actualizar_registro", {
    description: "Cambia propiedades de una ficha existente (p. ej. mover un negocio de etapa con {\"stage\": \"Propuesta\"}, o cambiar el leadStatus de un contacto). Sólo toca las propiedades que se le pasan.",
    inputSchema: {
      tipo: TIPO,
      id: z.string(),
      props: z.record(z.string(), z.union([z.string(), z.number()])),
    },
    annotations: { idempotentHint: true },
  }, async ({ tipo, id, props }) => {
    const col = COLECCION[tipo];
    const res = await cambiarDb(cuaderno, quien, (db) => {
      const lista = db[col] || [];
      const antes = lista.find((r) => r.id === id);
      if (!antes) return { error: `No hay ningún ${tipo} con id ${id}.` };
      if (tipo !== "deal" && props.email && emailKey(props.email) !== emailKey(antes.props.email)) {
        const igual = lista.find((r) => r.id !== id && emailKey(r.props && r.props.email) === emailKey(props.email));
        if (igual) return { error: `El correo ${props.email} ya es de «${titulo(tipo, igual)}» (id ${igual.id}).` };
      }
      const rec = { ...antes, props: { ...antes.props, ...props } };
      return { db: { ...db, [col]: lista.map((r) => (r.id === id ? rec : r)) }, rec };
    });
    if (res.error) return fallo(res.error);
    return texto({ actualizado: enLista(tipo, res.rec) });
  });

  server.registerTool("agregar_nota", {
    description: "Deja una nota en el historial de un contacto, una empresa o un negocio (p. ej. el resumen de una llamada). Aparece en la ficha como cualquier otra actividad.",
    inputSchema: { tipo: TIPO, id: z.string(), texto: z.string().min(1) },
  }, async ({ tipo, id, texto: cuerpo }) => {
    const col = COLECCION[tipo];
    const res = await cambiarDb(cuaderno, quien, (db) => {
      const rec = (db[col] || []).find((r) => r.id === id);
      if (!rec) return { error: `No hay ningún ${tipo} con id ${id}.` };
      const at = nowISO();
      const enlaces = tipo === "deal" ? { dealId: id, contactIds: [], companyIds: [] } : { contactIds: tipo === "contact" ? [id] : [], companyIds: tipo === "company" ? [id] : [] };
      /* En la app el texto de una nota va en `subject`, que es lo que pinta
         el historial. */
      const act = { id: uid(), type: "note", subject: cuerpo, at, dir: "out", ...enlaces };
      return {
        db: { ...db, activities: [act, ...(db.activities || [])], [col]: db[col].map((r) => (r.id === id ? { ...r, props: { ...r.props, lastActivityAt: at } } : r)) },
        nombre: titulo(tipo, rec),
      };
    });
    if (res.error) return fallo(res.error);
    return texto(`Nota guardada en ${res.nombre}.`);
  });

  return server;
}

export function atenderMcp(req, cuaderno, quien) {
  return createMcpHandler(() => crearServidor(cuaderno, quien)).fetch(req);
}
