/* ────────────────────────────────────────────────────────────
   Automatizaciones
   ────────────────────────────────────────────────────────────
   Una automatización es una frase con tres partes: cuándo pasa algo, qué debe
   cumplirse y qué hacer. Aquí vive esa gramática y nada más: este archivo no
   toca el cuaderno ni la red. Recibe el estado, devuelve qué habría que hacer,
   y CRM.jsx decide si lo hace o lo deja esperando el visto bueno.

   Se guarda como objeto, se escribe como texto y se dicta en español. Las tres
   formas son la misma cosa —el objeto manda— así que lo que se dicta se puede
   revisar como texto y lo que se escribe como texto se puede corregir con los
   menús. Nada de lo que dicta el usuario se ejecuta sin que antes se vea
   convertido en reglas legibles.
   ──────────────────────────────────────────────────────────── */

const uid = () => Math.random().toString(36).slice(2, 10);
const nowISO = () => new Date().toISOString();

/* Baja tildes sin cambiar el largo del texto: los índices que devuelva una
   búsqueda sobre la versión plana siguen sirviendo para cortar el original,
   que es lo que permite recuperar un nombre escrito con acentos. Un
   normalize("NFD") corriente no sirve aquí: parte cada letra acentuada en dos
   y desplaza todo lo que venga después. */
const TILDES = { "à": "a", "á": "a", "ä": "a", "â": "a", "è": "e", "é": "e", "ë": "e", "ê": "e", "ì": "i", "í": "i", "ï": "i", "î": "i", "ò": "o", "ó": "o", "ö": "o", "ô": "o", "ù": "u", "ú": "u", "ü": "u", "û": "u", "ñ": "n", "ç": "c" };
export const plano = (t) => String(t == null ? "" : t).toLowerCase().replace(/[àáäâèéëêìíïîòóöôùúüûñç]/g, (c) => TILDES[c] || c);
/* Para comparar dos nombres sin que estorben espacios ni signos. */
const clave = (t) => plano(t).replace(/[^a-z0-9]/g, "");

/* ────────────────────────────────────────────────────────────
   Vocabulario
   ──────────────────────────────────────────────────────────── */

/* `entidad` dice sobre qué ficha actúa la automatización: de ahí salen las
   propiedades que se pueden leer en las condiciones y escribir en las acciones. */
export const EVENTOS = [
  { key: "contacto.creado", label: "Entra un contacto nuevo", entidad: "contact", grupo: "Fichas" },
  { key: "empresa.creada", label: "Entra una empresa nueva", entidad: "company", grupo: "Fichas" },
  { key: "negocio.creado", label: "Se crea un negocio", entidad: "deal", grupo: "Fichas" },
  { key: "negocio.etapa", label: "Un negocio cambia de etapa", entidad: "deal", grupo: "Fichas", arg: { tipo: "etapa", label: "Etapa de destino", vacio: "cualquier etapa" } },
  { key: "propiedad.cambiada", label: "Cambia una propiedad", entidad: "contact", grupo: "Fichas", arg: { tipo: "campo", label: "Propiedad", vacio: "cualquiera" } },
  { key: "mensaje.recibido", label: "Contestan un mensaje", entidad: "contact", grupo: "Mensajes", arg: { tipo: "canal", label: "Canal", vacio: "cualquier canal" } },
  { key: "mensaje.enviado", label: "Sale un mensaje del CRM", entidad: "contact", grupo: "Mensajes", arg: { tipo: "canal", label: "Canal", vacio: "cualquier canal" } },
  { key: "correo.abierto", label: "Abren un correo enviado", entidad: "contact", grupo: "Mensajes" },
  { key: "correo.clic", label: "Pinchan un enlace del correo", entidad: "contact", grupo: "Mensajes" },
  { key: "correo.rebotado", label: "Un correo rebota", entidad: "contact", grupo: "Mensajes" },
  { key: "sin.actividad", label: "Un contacto se enfría", entidad: "contact", grupo: "Tiempo", arg: { tipo: "dias", label: "Días sin actividad", vacio: "7" } },
  { key: "negocio.frio", label: "Un negocio se enfría", entidad: "deal", grupo: "Tiempo", arg: { tipo: "dias", label: "Días sin actividad", vacio: "7" } },
];
/* Los disparadores que no avisa nadie: hay que ir a mirar cada tanto. */
export const ENFRIAMIENTO = ["sin.actividad", "negocio.frio"];
export const eventoDe = (k) => EVENTOS.find((e) => e.key === k) || EVENTOS[0];

export const ACCIONES = [
  { key: "whatsapp", label: "Enviar WhatsApp", saliente: true, Iconkey: "whatsapp" },
  { key: "correo", label: "Enviar correo", saliente: true, Iconkey: "correo" },
  { key: "propiedad", label: "Cambiar una propiedad", saliente: false },
  { key: "etapa", label: "Mover el negocio de etapa", saliente: false },
  { key: "negocio", label: "Crear un negocio", saliente: false },
  { key: "nota", label: "Dejar una nota", saliente: false },
  { key: "aviso", label: "Avisarme en el CRM", saliente: false },
];
export const accionDe = (k) => ACCIONES.find((a) => a.key === k) || ACCIONES[0];
/* Las acciones salientes le hablan a una persona de verdad. Nunca se disparan
   solas mientras la automatización esté en modo sugerir, y el modo sugerir es
   el de fábrica: una regla mal dictada debe costar un clic de descarte, no una
   disculpa a doscientos contactos. */
export const esSaliente = (tipo) => Boolean(accionDe(tipo).saliente);
/* Lo que no se hace solo. Los envíos porque hablan con una persona; los avisos
   porque un aviso que nadie lee no es un aviso: se queda en Pendientes hasta
   que alguien lo da por visto. Todo lo demás —propiedades, etapas, notas— se
   aplica en el acto, que es lo que se le pide a una automatización. */
export const necesitaMano = (tipo) => esSaliente(tipo) || tipo === "aviso";

export const OPERADORES = [
  { key: "es", label: "es igual a", valor: true },
  { key: "noEs", label: "no es", valor: true },
  { key: "contiene", label: "contiene", valor: true },
  { key: "existe", label: "tiene algún valor", valor: false },
  { key: "vacio", label: "está vacío", valor: false },
  { key: "mayor", label: "es mayor que", valor: true },
  { key: "menor", label: "es menor que", valor: true },
];

const CANALES = { whatsapp: "WhatsApp", email: "Correo", call: "Llamada", note: "Nota" };

/* Nombres con que se habla de cada propiedad al dictar. La lista no reemplaza
   al esquema —las propiedades que crea el usuario se leen de ahí y se buscan
   por su propia etiqueta—; sólo cubre las maneras de nombrar las de siempre. */
const APODOS = {
  firstName: ["nombre", "primer nombre"],
  lastName: ["apellido", "apellidos"],
  phone: ["telefono", "celular", "movil", "numero", "whatsapp del contacto"],
  email: ["correo", "email", "mail", "direccion de correo"],
  emailStatus: ["estado del correo", "estado de correo"],
  leadStatus: ["estado de lead", "estado del lead", "estado", "status"],
  leadSource: ["fuente de lead", "fuente del lead", "fuente", "origen", "de donde viene", "procedencia"],
  institution: ["institucion", "colegio", "club", "academia", "escuela"],
  type: ["tipo"],
  name: ["nombre", "razon social"],
  url: ["sitio", "sitio web", "pagina", "url", "web"],
  stage: ["etapa", "fase", "columna"],
  source: ["fuente del negocio", "fuente", "origen"],
  amount: ["valor", "monto", "importe", "precio", "cuanto vale"],
  wonReason: ["motivo de ganado", "motivo de cierre ganado"],
  lostReason: ["motivo de perdido", "motivo de cierre perdido"],
};

export const camposDe = (db, entidad) => {
  const ent = entidad === "company" || entidad === "deal" ? entidad : "contact";
  return ((db && db.schema && db.schema[ent]) || []).filter((f) => !f.readOnly || f.key === "lastActivityAt");
};
export const campoDe = (db, entidad, key) => camposDe(db, entidad).find((f) => f.key === key) || null;
export const etiquetaCampo = (db, entidad, key) => (campoDe(db, entidad, key) || {}).label || key;

/* Las etapas viven en las opciones de la propiedad `stage`, así que si alguien
   agrega una etapa nueva desde Configuración, las automatizaciones la conocen
   sin tocar este archivo. */
export const etapasDe = (db) => ((campoDe(db, "deal", "stage") || {}).options || []);

/* ────────────────────────────────────────────────────────────
   Forma guardada
   ──────────────────────────────────────────────────────────── */

export const automatizacionVacia = () => ({
  id: uid(),
  nombre: "",
  activa: false,
  modo: "sugerir",
  origen: "visual",
  dictado: "",
  cuando: { evento: "contacto.creado", arg: "" },
  si: [],
  entonces: [],
  creadaEn: nowISO(),
  ultimaEn: "",
  corridas: 0,
});

const arr = (x) => (Array.isArray(x) ? x : []);
const txt = (x) => String(x == null ? "" : x);

const normalizaCondicion = (c) => {
  const op = (OPERADORES.find((o) => o.key === (c && c.op)) || OPERADORES[0]).key;
  return { campo: txt(c && c.campo), op, valor: txt(c && c.valor) };
};

const normalizaAccion = (a) => {
  const tipo = accionDe(a && a.tipo).key;
  const base = { tipo, tras: Math.max(0, Number((a && a.tras) || 0)) || 0 };
  if (tipo === "whatsapp" || tipo === "correo") return { ...base, plantilla: txt(a && a.plantilla) };
  if (tipo === "propiedad") return { ...base, campo: txt(a && a.campo), valor: txt(a && a.valor) };
  if (tipo === "etapa") return { ...base, etapa: txt(a && a.etapa) };
  if (tipo === "negocio") return { ...base, nombre: txt(a && a.nombre), etapa: txt(a && a.etapa), valor: txt(a && a.valor) };
  return { ...base, texto: txt(a && a.texto) };
};

export function normalizaAutomatizacion(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  const evento = eventoDe(d.cuando && d.cuando.evento).key;
  return {
    ...automatizacionVacia(),
    ...d,
    id: txt(d.id) || uid(),
    nombre: txt(d.nombre),
    activa: Boolean(d.activa),
    modo: d.modo === "auto" ? "auto" : "sugerir",
    origen: ["vibe", "visual", "codigo"].includes(d.origen) ? d.origen : "visual",
    dictado: txt(d.dictado),
    cuando: { evento, arg: txt(d.cuando && d.cuando.arg) },
    si: arr(d.si).map(normalizaCondicion).filter((c) => c.campo),
    entonces: arr(d.entonces).map(normalizaAccion),
    creadaEn: txt(d.creadaEn) || nowISO(),
    ultimaEn: txt(d.ultimaEn),
    corridas: Number(d.corridas) || 0,
  };
}

export const normalizeAutomations = (raw) => arr(raw).map(normalizaAutomatizacion);

/* La cola son las acciones que esperan: unas la hora convenida, otras el visto
   bueno de quien manda. Cada una guarda a quién iba dirigida por identificador,
   no una copia de la ficha: si el contacto cambia de correo entre que se
   programó y se envía, sale al correo bueno. */
export function normalizaPendiente(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  return {
    id: txt(d.id) || uid(),
    autoId: txt(d.autoId),
    auto: txt(d.auto),
    accion: normalizaAccion(d.accion),
    kind: ["contact", "company", "deal"].includes(d.kind) ? d.kind : "contact",
    recId: txt(d.recId),
    creadaEn: txt(d.creadaEn) || nowISO(),
    listaEn: txt(d.listaEn) || txt(d.creadaEn) || nowISO(),
    estado: ["espera", "listo", "hecho", "fallo", "descartado"].includes(d.estado) ? d.estado : "listo",
    nota: txt(d.nota),
  };
}
export const normalizeCola = (raw) => arr(raw).map(normalizaPendiente).slice(0, 500);

/* El historial es corto a propósito: sirve para entender qué hizo la regla
   ayer, no para auditar el año. Guardarlo entero llenaría el almacenamiento del
   navegador, que es el mismo donde viven los contactos. */
export const normalizeLog = (raw) => arr(raw).map((l) => ({
  id: txt(l && l.id) || uid(),
  at: txt(l && l.at) || nowISO(),
  autoId: txt(l && l.autoId),
  auto: txt(l && l.auto),
  texto: txt(l && l.texto),
  nivel: ["ok", "espera", "fallo", "info"].includes(l && l.nivel) ? l.nivel : "info",
})).slice(0, 300);

/* ────────────────────────────────────────────────────────────
   Texto: la misma regla escrita como código
   ────────────────────────────────────────────────────────────
   Se lee de arriba abajo y cada línea empieza por su palabra clave. Es la
   pantalla donde se corrige lo que la dictada entendió mal sin tener que
   volver a redactar la frase entera.
   ──────────────────────────────────────────────────────────── */

const cita = (v) => `"${String(v == null ? "" : v).replace(/"/g, "'")}"`;

const UNIDADES = [
  { min: 1440, uno: "día", varios: "días" },
  { min: 60, uno: "hora", varios: "horas" },
  { min: 1, uno: "minuto", varios: "minutos" },
];
export function esperaEnTexto(min) {
  const n = Number(min) || 0;
  if (n <= 0) return "";
  const u = UNIDADES.find((x) => n % x.min === 0 && n >= x.min) || UNIDADES[2];
  const c = n / u.min;
  return `${c} ${c === 1 ? u.uno : u.varios}`;
}

export function aDsl(a) {
  const A = normalizaAutomatizacion(a);
  const l = [];
  if (A.nombre) l.push(`nombre ${cita(A.nombre)}`);
  l.push(`cuando ${A.cuando.evento}${A.cuando.arg ? ` ${cita(A.cuando.arg)}` : ""}`);
  A.si.forEach((c) => {
    const conValor = (OPERADORES.find((o) => o.key === c.op) || {}).valor;
    l.push(`si ${c.campo} ${c.op === "noEs" ? "no-es" : c.op}${conValor ? ` ${cita(c.valor)}` : ""}`);
  });
  A.entonces.forEach((x) => {
    const tras = x.tras ? ` tras ${esperaEnTexto(x.tras)}` : "";
    if (x.tipo === "whatsapp" || x.tipo === "correo") l.push(`haz ${x.tipo} ${cita(x.plantilla)}${tras}`);
    else if (x.tipo === "propiedad") l.push(`haz propiedad ${x.campo} = ${cita(x.valor)}${tras}`);
    else if (x.tipo === "etapa") l.push(`haz etapa ${cita(x.etapa)}${tras}`);
    else if (x.tipo === "negocio") l.push(`haz negocio ${cita(x.nombre)} etapa ${cita(x.etapa)}${x.valor ? ` valor ${x.valor}` : ""}${tras}`);
    else l.push(`haz ${x.tipo} ${cita(x.texto)}${tras}`);
  });
  l.push(`modo ${A.modo}`);
  return l.join("\n");
}

const trocear = (linea) => {
  const out = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(linea))) out.push(m[1] !== undefined ? m[1] : m[2]);
  return out;
};

/* "tras 3 días" al final de un `haz`: se corta de los argumentos y se devuelve
   en minutos, que es como lo guarda la acción. */
const cortarEspera = (tokens) => {
  const i = tokens.findIndex((t) => plano(t) === "tras");
  if (i < 0) return { tokens, tras: 0 };
  const n = Number(tokens[i + 1]) || 0;
  const u = plano(tokens[i + 2] || "minutos");
  const mult = u.startsWith("dia") ? 1440 : u.startsWith("hora") ? 60 : u.startsWith("seman") ? 10080 : 1;
  return { tokens: tokens.slice(0, i), tras: Math.round(n * mult) };
};

export function deDsl(texto, base) {
  const A = normalizaAutomatizacion({ ...(base || {}), si: [], entonces: [] });
  const errores = [];
  String(texto || "").split("\n").forEach((crudo, i) => {
    const linea = crudo.trim();
    if (!linea || linea.startsWith("#")) return;
    const t = trocear(linea);
    const kw = plano(t[0]);
    const num = i + 1;
    if (kw === "nombre") A.nombre = t.slice(1).join(" ");
    else if (kw === "cuando") {
      if (!EVENTOS.some((e) => e.key === t[1])) { errores.push(`Línea ${num}: no conozco el disparador «${t[1] || ""}».`); return; }
      A.cuando = { evento: t[1], arg: t[2] || "" };
    } else if (kw === "si") {
      const op = plano(t[2]) === "no-es" ? "noEs" : t[2];
      if (!t[1]) { errores.push(`Línea ${num}: falta la propiedad de la condición.`); return; }
      if (!OPERADORES.some((o) => o.key === op)) { errores.push(`Línea ${num}: no conozco la comparación «${t[2] || ""}».`); return; }
      A.si.push({ campo: t[1], op, valor: t[3] || "" });
    } else if (kw === "haz") {
      const { tokens, tras } = cortarEspera(t);
      const tipo = plano(tokens[1]);
      if (!ACCIONES.some((x) => x.key === tipo)) { errores.push(`Línea ${num}: no conozco la acción «${tokens[1] || ""}».`); return; }
      const resto = tokens.slice(2);
      if (tipo === "whatsapp" || tipo === "correo") A.entonces.push({ tipo, plantilla: resto[0] || "", tras });
      else if (tipo === "propiedad") A.entonces.push({ tipo, campo: resto[0] || "", valor: resto[resto.length - 1] || "", tras });
      else if (tipo === "etapa") A.entonces.push({ tipo, etapa: resto[0] || "", tras });
      else if (tipo === "negocio") {
        const iE = resto.findIndex((x) => plano(x) === "etapa");
        const iV = resto.findIndex((x) => plano(x) === "valor");
        A.entonces.push({ tipo, nombre: resto[0] || "", etapa: iE >= 0 ? resto[iE + 1] || "" : "", valor: iV >= 0 ? resto[iV + 1] || "" : "", tras });
      } else A.entonces.push({ tipo, texto: resto.join(" "), tras });
    } else if (kw === "modo") A.modo = plano(t[1]) === "auto" ? "auto" : "sugerir";
    else errores.push(`Línea ${num}: no entiendo «${t[0]}». Las líneas empiezan por nombre, cuando, si, haz o modo.`);
  });
  return { auto: normalizaAutomatizacion(A), errores };
}

/* ────────────────────────────────────────────────────────────
   Dictado (vibe): del español a la regla
   ────────────────────────────────────────────────────────────
   No adivina en silencio. Devuelve la regla junto con dos listas: lo que
   entendió y lo que no pudo resolver. Lo segundo es lo que decide si la regla
   se puede activar o hay que terminarla a mano; una automatización a medias
   que se guarda como si estuviera lista es peor que no tenerla.
   ──────────────────────────────────────────────────────────── */

export const EJEMPLOS = [
  "Cuando entre un contacto nuevo de Meta Lead Ads, mándale el WhatsApp de bienvenida y márcalo como Abierto.",
  "Cuando un negocio pase a Ganado, deja una nota y avísame.",
  "Si un contacto abre el correo, márcalo como Conectado y créale un negocio.",
  "Cuando alguien conteste por WhatsApp, avísame y pon el estado en Conectado.",
  "Si un contacto lleva 7 días sin actividad, avísame para volver a escribirle.",
  "Cuando un negocio lleve 15 días sin moverse, avísame y déjale una nota.",
  "Cuando rebote un correo, marca el estado de lead como Descalificado.",
];

const DISPARADORES = [
  { evento: "sin.actividad", re: /(sin actividad|sin responder|se enfri|no (ha |haya )?respond|lleve? \d+ d|pasen? \d+ d|lleva \d+ d)/ },
  { evento: "correo.rebotado", re: /(rebot|no lleg[oó]|direccion mala|correo malo)/ },
  { evento: "correo.clic", re: /(clic|click|pinch|pulse el enlace|toque el enlace)/ },
  { evento: "correo.abierto", re: /(abra el correo|abre el correo|abran el correo|abra el email|abertura|apertura|lea el correo)/ },
  { evento: "mensaje.recibido", re: /(respond|contest|escrib[ae]n?|me escriba|llegue un mensaje|entre un mensaje|reciba un|nos escriba|conteste)/ },
  { evento: "mensaje.enviado", re: /(se env[ií]e|salga un|env[ií]e un (correo|whatsapp|mensaje) desde|despu[eé]s de enviar)/ },
  { evento: "negocio.etapa", re: /(pase a|pasa a|llegue a|se mueva a|mueva a|cambie de etapa|cambia de etapa|se gane|se pierda|se cierre|gane un negocio)/ },
  { evento: "negocio.creado", re: /(negocio nuevo|nuevo negocio|se cree un negocio|crea un negocio|nueva oportunidad|oportunidad nueva)/ },
  { evento: "empresa.creada", re: /(empresa nueva|nueva empresa|entre una empresa|se cree una empresa|nuevo club|club nuevo)/ },
  { evento: "propiedad.cambiada", re: /(cambie (la|el) (propiedad|campo)|se actualice|cambie de estado|cambie el estado)/ },
  { evento: "contacto.creado", re: /(contacto nuevo|nuevo contacto|entre un contacto|llegue un contacto|se cree un contacto|lead nuevo|nuevo lead|llegue un lead|entre un lead|se registre|alguien nuevo)/ },
];

/* Los verbos con que se pide cada cosa. La posición de cada uno en la frase es
   lo que corta las acciones: "mándale el whatsapp y créale un negocio" son dos
   porque hay dos verbos, no porque haya una "y". */
const VERBOS = [
  { fam: "mensaje", re: /\b(mandale|mandales|manda|mandar|enviale|enviales|envia|enviar|env[ií]ale|escribele|escribeles|escribe|escribir|responde|responder|contesta|contestar|saluda|saludar)\b/g },
  { fam: "crear", re: /\b(creale|creales|crea|crear|abrele|abre|abrir|genera|generar|levanta|levantar)\b/g },
  { fam: "propiedad", re: /\b(marcalo|marcala|marcalos|marca|marcar|ponle|ponlo|ponla|pon|poner|cambiale|cambia|cambiar|actualiza|actualizar|asignale|asigna|asignar|establece|establecer|fija|fijar|deja(?=l[oa]s? (en|como)))\b/g },
  { fam: "etapa", re: /\b(muevelo|muevela|muevelos|mueve|mover|pasalo|pasala|pasa|pasar|llevalo|llevala|lleva|llevar)\b/g },
  { fam: "nota", re: /\b(anota|anotar|apunta|apuntar|registra|registrar|documenta|documentar|(?:deja|dejale|dejales|dejar|dejarle|dejarles|pon)\s+(?:una\s+|la\s+)?nota)\b/g },
  { fam: "aviso", re: /\b(avisame|avisenme|avisa|avisar|notificame|notifica|notificar|alertame|alerta|alertar|recuerdame|recuerda|recordar|dime|avisame)\b/g },
];

const buscarEspera = (t) => {
  const m = plano(t).match(/\b(?:tras|despues de|pasad[oa]s?|a los?|a las?|en|al cabo de)\s+(un[ao]?|\d+)\s*(minuto|hora|dia|d[ií]a|semana)/);
  if (!m) {
    if (/\b(al d[ií]a siguiente|manana)\b/.test(plano(t))) return 1440;
    return 0;
  }
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : 1;
  const u = plano(m[2]);
  return Math.round(n * (u.startsWith("seman") ? 10080 : u.startsWith("d") ? 1440 : u.startsWith("hora") ? 60 : 1));
};

/* Índice de valores conocidos: cada opción de cada propiedad de lista apunta a
   su campo. Es lo que permite entender "márcalo como conectado" sin que la
   frase diga qué propiedad es, y lo que hace que una propiedad creada por el
   usuario funcione en el dictado el mismo día que la crea. */
const indiceOpciones = (db, entidad) => {
  const idx = [];
  camposDe(db, entidad).forEach((f) => {
    (f.options || []).forEach((o) => idx.push({ campo: f.key, valor: o, k: plano(o) }));
  });
  return idx.sort((a, b) => b.k.length - a.k.length);
};

const buscarCampo = (frase, db, entidad) => {
  const p = plano(frase);
  let mejor = null;
  camposDe(db, entidad).forEach((f) => {
    const nombres = [plano(f.label), ...(APODOS[f.key] || [])];
    nombres.forEach((n) => {
      if (n && p.includes(n) && (!mejor || n.length > mejor.largo)) mejor = { campo: f.key, largo: n.length };
    });
  });
  return mejor ? mejor.campo : "";
};

/* La plantilla se busca por lo que suena, no por coincidencia exacta: "el
   whatsapp de bienvenida" tiene que dar con "Bienvenida deportistas". Se puntúa
   por palabras compartidas y se exige al menos una de peso, para que una frase
   que no nombra ninguna plantilla no termine eligiendo la primera de la lista. */
const buscarPlantilla = (frase, lista) => {
  const p = plano(frase);
  const entre = p.match(/"([^"]+)"|«([^»]+)»/);
  const pedido = entre ? (entre[1] || entre[2]) : p;
  const palabras = new Set(plano(pedido).split(/[^a-z0-9]+/).filter((w) => w.length > 3));
  let mejor = null;
  (lista || []).forEach((t) => {
    const kn = clave(t.name);
    if (!kn) return;
    let pts = 0;
    if (clave(pedido).includes(kn)) pts += 10;
    plano(t.name).split(/[^a-z0-9]+/).forEach((w) => { if (w.length > 3 && palabras.has(w)) pts += 3; });
    if (pts > 0 && (!mejor || pts > mejor.pts)) mejor = { t, pts };
  });
  return mejor ? mejor.t : null;
};

export function compilarVibe(texto, db) {
  const original = String(texto || "").trim();
  const p = plano(original);
  const entendido = [];
  const dudas = [];
  const auto = automatizacionVacia();
  auto.origen = "vibe";
  auto.dictado = original;

  if (!original) return { auto, entendido, dudas: ["Escribe lo que quieres que pase y con qué."], dsl: "" };

  /* ── 1. Dónde empiezan las acciones ──
     Todo lo que va antes del primer verbo es el disparador y sus condiciones;
     lo de después, lo que hay que hacer. */
  const todas = [];
  VERBOS.forEach(({ fam, re }) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(p))) todas.push({ i: m.index, fin: m.index + m[0].length, fam, palabra: m[0] });
  });
  todas.sort((a, b) => a.i - b.i);

  /* El disparador también trae verbos —"si un contacto **abre** el correo"— y
     tomarlos por acciones inventaría cosas que nadie pidió. Lo que separa las
     dos mitades de la frase es la coma, o el final de la frase que nombró el
     disparador; sólo cuentan como acciones los verbos que vengan después. */
  const hit = DISPARADORES.find((d) => d.re.test(p));
  if (hit) auto.cuando.evento = hit.evento;
  else dudas.push("No reconocí cuándo debe dispararse; quedó en «entra un contacto nuevo». Cámbialo en Reglas si no era eso.");

  const finDisparador = hit ? (p.match(hit.re) || { index: 0, 0: "" }).index + (p.match(hit.re) || [""])[0].length : 0;
  const coma = p.search(/[,;]|\bentonces\b|→/);
  const corteBase = Math.max(finDisparador, coma >= 0 ? coma + 1 : 0);
  const marcas = todas.filter((m) => m.i >= corteBase);
  const zonaCuando = original.slice(0, marcas.length ? marcas[0].i : original.length);
  const pc = plano(zonaCuando);

  let ev = eventoDe(auto.cuando.evento);

  if (auto.cuando.evento === "negocio.etapa") {
    const etapas = etapasDe(db);
    const dicha = etapas.find((e) => pc.includes(plano(e)));
    if (dicha) auto.cuando.arg = dicha;
    else if (/\bse gane\b|\bgane\b|\bganado\b/.test(pc)) auto.cuando.arg = etapas.find((e) => plano(e).startsWith("gana")) || "";
    else if (/\bse pierda\b|\bperdid/.test(pc)) auto.cuando.arg = etapas.find((e) => plano(e).startsWith("perdi")) || "";
  }
  if (auto.cuando.evento === "sin.actividad" && /\b(negocio|oportunidad|trato|deal)\b/.test(pc)) auto.cuando.evento = "negocio.frio";
  if (ENFRIAMIENTO.includes(auto.cuando.evento)) {
    const m = pc.match(/(\d+)\s*(d[ií]a|semana|mes)/);
    const n = m ? Number(m[1]) * (plano(m[2]).startsWith("seman") ? 7 : plano(m[2]).startsWith("mes") ? 30 : 1) : 7;
    auto.cuando.arg = String(n);
  }
  if (auto.cuando.evento === "mensaje.recibido" || auto.cuando.evento === "mensaje.enviado") {
    if (/\bwhats?app|wasap|wa\b/.test(pc)) auto.cuando.arg = "whatsapp";
    else if (/\bcorreo|email|mail\b/.test(pc)) auto.cuando.arg = "email";
  }
  /* La entidad se fija aquí y no antes: hasta ahora el disparador pudo cambiar
     —un "negocio sin actividad" pasa de contacto a negocio— y con él cambian
     las propiedades que se pueden leer y escribir. */
  ev = eventoDe(auto.cuando.evento);
  const entidad = ev.entidad;
  if (auto.cuando.evento === "propiedad.cambiada") auto.cuando.arg = buscarCampo(zonaCuando, db, entidad);

  entendido.push(`Se dispara cuando ${ev.label.charAt(0).toLowerCase()}${ev.label.slice(1)}${auto.cuando.arg ? ` · ${auto.cuando.arg}` : ""}.`);

  /* ── 3. Las condiciones ──
     Cualquier valor de lista nombrado antes del primer verbo es un filtro: "un
     contacto nuevo de Meta Lead Ads" filtra por fuente sin decir "fuente". */
  const idx = indiceOpciones(db, entidad);
  const yaCampo = new Set();
  idx.forEach((o) => {
    if (yaCampo.has(o.campo)) return;
    if (o.campo === "stage" && auto.cuando.evento === "negocio.etapa") return; // ya es el disparador
    if (!o.k || o.k.length < 4) return;
    const en = pc.indexOf(o.k);
    if (en < 0) return;
    /* Que la palabra aparezca no basta: "un contacto **nuevo**" no pide filtrar
       por estado Nuevo, y "conteste por **WhatsApp**" no pide filtrar por
       fuente WhatsApp. Un valor sólo se lee como filtro si lo presenta algo que
       introduce un filtro —"de", "con estado", "que sea"— o si es un nombre de
       varias palabras, que nadie escribe por casualidad. */
    const antes = pc.slice(Math.max(0, en - 22), en);
    const presentado = /\b(de|del|desde|con|en|sea|este|esta|estado|fuente|origen|tipo|etapa|como|cuyo|cuya)\s+(estado\s+|fuente\s+|tipo\s+|etapa\s+)?$/.test(antes);
    if (!presentado && plano(o.valor).trim().split(/\s+/).length < 2) return;
    yaCampo.add(o.campo);
    auto.si.push({ campo: o.campo, op: "es", valor: o.valor });
    entendido.push(`Sólo si ${etiquetaCampo(db, entidad, o.campo)} es «${o.valor}».`);
  });
  if (/\b(que tenga|con) (correo|email)\b/.test(pc)) auto.si.push({ campo: "email", op: "existe", valor: "" });
  if (/\b(que tenga|con) (telefono|celular|whatsapp)\b/.test(pc)) auto.si.push({ campo: "phone", op: "existe", valor: "" });
  if (/\bsin (correo|email)\b/.test(pc)) auto.si.push({ campo: "email", op: "vacio", valor: "" });
  const mMayor = pc.match(/\b(?:mayor a|mas de|supere|por encima de|arriba de)\s*\$?\s*([\d.]+)/);
  if (mMayor) {
    const campo = entidad === "deal" ? "amount" : "";
    if (campo) { auto.si.push({ campo, op: "mayor", valor: mMayor[1].replace(/\./g, "") }); entendido.push(`Sólo si el valor supera ${mMayor[1]}.`); }
  }

  /* ── 4. Las acciones ── */
  const trozos = marcas.map((m, i) => ({ ...m, texto: original.slice(m.i, i + 1 < marcas.length ? marcas[i + 1].i : original.length) }));
  /* Dos verbos pegados ("ve y mándale") describen una sola acción: si el trozo
     no tiene con qué completarse, se funde con el siguiente. */
  const esperaGlobal = buscarEspera(original);

  trozos.forEach((tr) => {
    const tp = plano(tr.texto);
    const tras = buscarEspera(tr.texto) || 0;

    if (tr.fam === "mensaje") {
      const esCorreo = /\b(correo|email|mail)\b/.test(tp);
      const lista = esCorreo ? (db.templates || {}).email : (db.templates || {}).whatsapp;
      const t = buscarPlantilla(tr.texto, lista);
      const tipo = esCorreo ? "correo" : "whatsapp";
      auto.entonces.push({ tipo, plantilla: t ? t.name : "", tras: tras || esperaGlobal });
      if (t) entendido.push(`Le manda ${esCorreo ? "el correo" : "el WhatsApp"} «${t.name}»${tras ? ` tras ${esperaEnTexto(tras)}` : ""}.`);
      else dudas.push(`No encontré una plantilla de ${esCorreo ? "correo" : "WhatsApp"} que encaje con «${tr.texto.trim()}». Elígela en Reglas o créala en Plantillas.`);
      return;
    }

    if (tr.fam === "crear") {
      if (/\bnota\b/.test(tp)) { auto.entonces.push({ tipo: "nota", texto: limpiarTexto(tr.texto, tr.palabra), tras }); entendido.push("Deja una nota en la ficha."); return; }
      if (/\b(negocio|oportunidad|trato|deal)\b/.test(tp)) {
        const etapas = etapasDe(db);
        const etapa = etapas.find((e) => tp.includes(plano(e))) || etapas[0] || "";
        const nombreM = tr.texto.match(/"([^"]+)"|«([^»]+)»|llamad[oa] ([^,.;]+)/i);
        auto.entonces.push({ tipo: "negocio", nombre: nombreM ? (nombreM[1] || nombreM[2] || nombreM[3]).trim() : "", etapa, valor: "", tras });
        entendido.push(`Crea un negocio${etapa ? ` en etapa «${etapa}»` : ""}.`);
        return;
      }
      if (/\b(tarea|recordatorio|seguimiento)\b/.test(tp)) { auto.entonces.push({ tipo: "aviso", texto: limpiarTexto(tr.texto, tr.palabra), tras }); entendido.push("Te avisa en el CRM."); return; }
      dudas.push(`No sé qué crear en «${tr.texto.trim()}». Puedo crear un negocio, una nota o un aviso.`);
      return;
    }

    if (tr.fam === "etapa" || (tr.fam === "propiedad" && /\betapa\b/.test(tp))) {
      const etapas = etapasDe(db);
      const etapa = etapas.find((e) => tp.includes(plano(e)));
      if (etapa && entidad === "deal") { auto.entonces.push({ tipo: "etapa", etapa, tras }); entendido.push(`Mueve el negocio a «${etapa}».`); return; }
      if (etapa) { auto.entonces.push({ tipo: "propiedad", campo: "stage", valor: etapa, tras }); entendido.push(`Pone la etapa en «${etapa}».`); return; }
      dudas.push(`No vi a qué etapa mover en «${tr.texto.trim()}».`);
      return;
    }

    if (tr.fam === "propiedad") {
      /* Primero por el valor: casi nadie dice la propiedad al dictar —"márcalo
         como conectado"—, y el valor la señala sin ambigüedad. */
      const val = idx.find((o) => o.k.length >= 4 && tp.includes(o.k));
      const campoDicho = buscarCampo(tr.texto, db, entidad);
      if (val && (!campoDicho || campoDicho === val.campo)) {
        auto.entonces.push({ tipo: "propiedad", campo: val.campo, valor: val.valor, tras });
        entendido.push(`Pone ${etiquetaCampo(db, entidad, val.campo)} en «${val.valor}».`);
        return;
      }
      const libre = tr.texto.match(/(?:como|en|a|=)\s+"?([^",.;]+)"?\s*$/i);
      if (campoDicho && libre) {
        auto.entonces.push({ tipo: "propiedad", campo: campoDicho, valor: libre[1].trim(), tras });
        entendido.push(`Pone ${etiquetaCampo(db, entidad, campoDicho)} en «${libre[1].trim()}».`);
        return;
      }
      dudas.push(`No entendí qué propiedad cambiar en «${tr.texto.trim()}». Dilo como «márcalo como Conectado».`);
      return;
    }

    if (tr.fam === "nota") { auto.entonces.push({ tipo: "nota", texto: limpiarTexto(tr.texto, tr.palabra), tras }); entendido.push("Deja una nota en la ficha."); return; }
    if (tr.fam === "aviso") { auto.entonces.push({ tipo: "aviso", texto: limpiarTexto(tr.texto, tr.palabra), tras }); entendido.push("Te avisa en el CRM."); return; }
  });

  if (!auto.entonces.length) dudas.push("No reconocí ninguna acción. Prueba con «mándale el WhatsApp de bienvenida» o «márcalo como Conectado».");

  /* Una nota o un aviso sin texto quedan con el nombre del disparador, que es
     lo que de todas formas se querría leer meses después al abrir la ficha. */
  auto.entonces.forEach((x) => {
    if ((x.tipo === "nota" || x.tipo === "aviso") && !x.texto) x.texto = ev.label;
  });

  /* ── 5. Nombre y modo ── */
  auto.nombre = nombrarDesde(original);
  /* El modo automático hay que pedirlo con todas las letras, y aun pidiéndolo
     sólo alcanza a lo que no le habla a nadie: un WhatsApp necesita que alguien
     pulse enviar de todos modos. */
  if (/\b(sin preguntar|sin pedir permiso|automaticamente|de una|solo hazlo|sin avisarme|no me preguntes)\b/.test(p)) {
    auto.modo = "auto";
    entendido.push("Corre sola, sin pedirte permiso.");
  } else if (auto.entonces.some((x) => esSaliente(x.tipo))) {
    entendido.push("Los envíos quedan en Pendientes esperando tu visto bueno.");
  }

  return { auto: normalizaAutomatizacion(auto), entendido, dudas, dsl: aDsl(auto) };
}

/* Quita el verbo y las muletillas para quedarse con el contenido de una nota o
   un aviso: "avísame de que llegó un lead caliente" → "llegó un lead caliente".
   Si no queda nada con sentido devuelve vacío en vez de un resto suelto: una
   nota que dijera "y" es peor que una nota con el texto de fábrica. */
function limpiarTexto(t, verbo) {
  const sinVerbo = verbo ? String(t || "").slice(verbo.length) : String(t || "").replace(/^\s*\S+/, "");
  const limpio = sinVerbo
    .replace(/^[\s,;.]+/, "")
    .replace(/^(me|le|les|nos)\s+/i, "")
    .replace(/^(una?\s+)?(nota|aviso|recordatorio|alerta)\s+/i, "")
    .replace(/^(que\s+diga\s+|diciendo\s+|con\s+el\s+texto\s+)/i, "")
    .replace(/^(de\s+|sobre\s+)?(que\s+)?/i, "")
    .replace(/^["«]|["»]$/g, "")
    .replace(/[\s,;.]*\b(y|e|tambien|además|ademas)\s*$/i, "")
    .replace(/[.,;\s]+$/, "")
    .trim();
  return limpio.length >= 3 ? limpio : "";
}

const nombrarDesde = (t) => {
  const limpio = String(t || "").replace(/^\s*(cuando|si|cada vez que|al|apenas|en cuanto)\s+/i, "").trim();
  const corto = limpio.split(/[,.;]/)[0].trim();
  const n = corto.length > 52 ? `${corto.slice(0, 52).trim()}…` : corto;
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : "Automatización";
};

/* ────────────────────────────────────────────────────────────
   Lectura humana y revisión
   ──────────────────────────────────────────────────────────── */

export function resumenDe(a, db) {
  const A = normalizaAutomatizacion(a);
  const ev = eventoDe(A.cuando.evento);
  const ent = ev.entidad;
  const cuando = `${ev.label}${A.cuando.arg ? ` (${A.cuando.arg})` : ""}`;
  const si = A.si.map((c) => {
    const op = OPERADORES.find((o) => o.key === c.op) || OPERADORES[0];
    return `${etiquetaCampo(db, ent, c.campo)} ${op.label}${op.valor ? ` «${c.valor}»` : ""}`;
  });
  const haz = A.entonces.map((x) => textoAccion(x, db, ent));
  return { cuando, si, haz };
}

export function textoAccion(x, db, entidad) {
  const tras = x.tras ? ` · tras ${esperaEnTexto(x.tras)}` : "";
  if (x.tipo === "whatsapp") return `Enviar el WhatsApp «${x.plantilla || "sin elegir"}»${tras}`;
  if (x.tipo === "correo") return `Enviar el correo «${x.plantilla || "sin elegir"}»${tras}`;
  if (x.tipo === "propiedad") return `Poner ${etiquetaCampo(db, entidad, x.campo)} en «${x.valor}»${tras}`;
  if (x.tipo === "etapa") return `Mover a la etapa «${x.etapa}»${tras}`;
  if (x.tipo === "negocio") return `Crear el negocio «${x.nombre || "sin nombre"}»${x.etapa ? ` en «${x.etapa}»` : ""}${tras}`;
  if (x.tipo === "nota") return `Dejar la nota «${x.texto}»${tras}`;
  return `Avisarte: «${x.texto}»${tras}`;
}

/* Lo que impide que una regla se active: se revisa contra el cuaderno de
   verdad, así que una plantilla borrada sale a la luz aquí y no el día que la
   automatización tenía que mandar el mensaje. */
export function avisosDe(a, db) {
  const A = normalizaAutomatizacion(a);
  const ent = eventoDe(A.cuando.evento).entidad;
  const out = [];
  if (!A.entonces.length) out.push("No hace nada todavía: agrégale al menos una acción.");
  A.entonces.forEach((x, i) => {
    const n = `Acción ${i + 1}`;
    if (x.tipo === "whatsapp" || x.tipo === "correo") {
      const lista = ((db.templates || {})[x.tipo === "correo" ? "email" : "whatsapp"]) || [];
      if (!x.plantilla) out.push(`${n}: falta elegir la plantilla.`);
      else if (!lista.some((t) => clave(t.name) === clave(x.plantilla))) out.push(`${n}: no existe la plantilla «${x.plantilla}» en ${x.tipo === "correo" ? "correo" : "WhatsApp"}.`);
    }
    if (x.tipo === "propiedad") {
      if (!x.campo) out.push(`${n}: falta la propiedad a cambiar.`);
      else if (!campoDe(db, ent, x.campo)) out.push(`${n}: la propiedad «${x.campo}» no existe en ${ent === "deal" ? "negocios" : ent === "company" ? "empresas" : "contactos"}.`);
    }
    if (x.tipo === "etapa" && ent !== "deal") out.push(`${n}: sólo un negocio tiene etapas, y este disparador no trae uno.`);
    if (x.tipo === "etapa" && !x.etapa) out.push(`${n}: falta la etapa de destino.`);
  });
  A.si.forEach((c, i) => { if (!campoDe(db, ent, c.campo)) out.push(`Condición ${i + 1}: la propiedad «${c.campo}» no existe.`); });
  return out;
}

/* ────────────────────────────────────────────────────────────
   Evaluación
   ──────────────────────────────────────────────────────────── */

const valorDe = (rec, campo) => (rec && rec.props ? rec.props[campo] : undefined);

export function cumple(cond, rec) {
  const v = valorDe(rec, cond.campo);
  const s = plano(v);
  const q = plano(cond.valor);
  switch (cond.op) {
    case "es": return s === q;
    case "noEs": return s !== q;
    case "contiene": return s.includes(q) && q !== "";
    case "existe": return v !== undefined && v !== null && String(v).trim() !== "";
    case "vacio": return v === undefined || v === null || String(v).trim() === "";
    case "mayor": return Number(v) > Number(cond.valor);
    case "menor": return Number(v) < Number(cond.valor);
    default: return false;
  }
}

/* ¿Este evento le toca a esta regla? El argumento vacío significa "cualquiera":
   "cuando un negocio cambie de etapa" sin decir cuál vale para todas. */
export function disparaCon(auto, evento) {
  if (!auto.activa) return false;
  if (auto.cuando.evento !== evento.tipo) return false;
  const arg = plano(auto.cuando.arg);
  if (!arg) return true;
  if (evento.tipo === "negocio.etapa") return plano(evento.etapa) === arg;
  if (evento.tipo === "propiedad.cambiada") return (evento.campos || []).includes(auto.cuando.arg);
  if (evento.tipo === "mensaje.recibido" || evento.tipo === "mensaje.enviado") return plano(evento.canal) === arg;
  if (ENFRIAMIENTO.includes(evento.tipo)) return true; // los días ya se filtraron al barrer
  return true;
}

/* El corazón: dado un evento, qué queda por hacer. Devuelve tareas sin
   ejecutar ninguna —este archivo no sabe enviar correos— y con la hora en que
   cada una toca, para que una espera de tres días sobreviva a cerrar la
   pestaña: queda escrita en el cuaderno, no en un temporizador. */
export function disparar(db, evento) {
  const salida = [];
  const autos = arr(db.automations);
  for (const auto of autos) {
    if (!disparaCon(auto, evento)) continue;
    const ent = eventoDe(auto.cuando.evento).entidad;
    const rec = evento.rec || buscarFicha(db, evento.kind || ent, evento.recId);
    if (!rec) continue;
    if (!auto.si.every((c) => cumple(c, rec))) continue;
    const at = evento.at || nowISO();
    auto.entonces.forEach((accion) => {
      salida.push({
        id: uid(),
        autoId: auto.id,
        auto: auto.nombre || "Sin nombre",
        modo: auto.modo,
        accion,
        kind: evento.kind || ent,
        recId: rec.id,
        creadaEn: at,
        listaEn: accion.tras ? new Date(Date.parse(at) + accion.tras * 60000).toISOString() : at,
        estado: accion.tras ? "espera" : "listo",
        nota: "",
      });
    });
  }
  return salida;
}

export const coleccionDe = (kind) => (kind === "contact" ? "contacts" : kind === "company" ? "companies" : "deals");
export const buscarFicha = (db, kind, id) => (arr(db[coleccionDe(kind)]).find((r) => r.id === id) || null);

/* ────────────────────────────────────────────────────────────
   El paso del tiempo
   ────────────────────────────────────────────────────────────
   "Lleva 7 días sin actividad" no lo avisa nadie: hay que ir a mirar. Se mira
   al abrir el CRM y cada tanto mientras está abierto, y se anota a quién ya se
   le disparó para que la misma ficha fría no genere un aviso por minuto.
   ──────────────────────────────────────────────────────────── */

export function barrerFrios(db, marcas) {
  const eventos = [];
  const ahora = Date.now();
  const vistas = marcas && typeof marcas === "object" ? marcas : {};
  arr(db.automations).forEach((auto) => {
    if (!auto.activa || !ENFRIAMIENTO.includes(auto.cuando.evento)) return;
    const dias = Math.max(1, Number(auto.cuando.arg) || 7);
    const limite = dias * 86400000;
    const ent = eventoDe(auto.cuando.evento).entidad;
    arr(db[coleccionDe(ent)]).forEach((rec) => {
      const ref = rec.props.lastActivityAt || rec.props.createdAt;
      if (!ref) return;
      const t = Date.parse(ref);
      if (!t || ahora - t < limite) return;
      /* La marca guarda la fecha de la actividad que se consideró la última. Si
         luego la persona escribe, la referencia cambia y la regla puede volver
         a dispararse; mientras no pase nada, no se repite. */
      if (vistas[`${auto.id}:${rec.id}`] === ref) return;
      eventos.push({ tipo: auto.cuando.evento, kind: ent, recId: rec.id, rec, at: nowISO(), marca: [`${auto.id}:${rec.id}`, ref] });
    });
  });
  return eventos;
}

/* Un tope para que el registro de fichas frías no crezca sin fin en el
   almacenamiento; se conservan las más recientes. */
export function podarMarcas(marcas, tope = 2000) {
  const e = Object.entries(marcas || {});
  if (e.length <= tope) return marcas || {};
  return Object.fromEntries(e.slice(e.length - tope));
}
