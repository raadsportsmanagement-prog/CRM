/* ────────────────────────────────────────────────────────────
   Conexiones: WhatsApp y Gmail

   El CRM vive entero en el navegador y no tiene servidor propio. Eso decide
   qué conexión es honesta para cada canal:

   · Gmail sí se conecta de verdad. Google permite pedir permiso desde el
     navegador (OAuth con Google Identity Services) y llamar a la API de Gmail
     con ese permiso, así que "Enviar" manda el correo de verdad, desde tu
     cuenta, y queda en tus Enviados. El permiso dura una hora y no se guarda
     en el disco: se renueva solo mientras la pestaña esté abierta.

   · WhatsApp se conecta por enlace. La API oficial (WhatsApp Cloud API) exige
     un token permanente de Meta, y guardarlo aquí lo dejaría a la vista de
     cualquiera que abra este navegador; además Meta sólo deja iniciar
     conversaciones con plantillas aprobadas por ellos. Así que el CRM arma el
     mensaje ya personalizado y abre WhatsApp con el texto puesto: tú das el
     último clic. Sin token, sin cuenta de empresa, y funciona hoy.
   ──────────────────────────────────────────────────────────── */

export const WHATSAPP_MODES = {
  enlace: "Abrir el chat con el texto puesto",
  api: "WhatsApp conectado (envía solo)",
};

export const EMAIL_MODES = {
  gmailApi: "Gmail conectado (envía solo)",
  gmailCompose: "Abrir borrador en Gmail",
  mailto: "Abrir mi programa de correo",
};

/* El ID de cliente puede venir de .env.local, para no tener que pegarlo a mano
   ni perderlo si algún día se limpia el almacenamiento del navegador. Lo que
   escribas en Conexiones manda sobre esto. */
const CLIENT_ID_SEMILLA = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_GOOGLE_CLIENT_ID) || "";

export const DEFAULT_INTEGRATIONS = {
  /* "enlace" abre WhatsApp con el texto puesto y tú das el último clic;
     "api" lo manda solo, por el puente. Ver WHATSAPP_MODES, más abajo. */
  whatsapp: { countryCode: "57", modo: "enlace" },
  email: { mode: "gmailCompose", clientId: CLIENT_ID_SEMILLA, account: "", signature: "", leerBandeja: false },
  /* La dirección del puente y su clave. Están aquí arriba y no dentro de una
     conexión concreta porque es un solo servicio para todo lo que no cabe en
     el navegador: medir correos, traer leads y mandar WhatsApp. */
  puente: { base: "", clave: "" },
  /* El medidor de aperturas y clics. Apagado mientras falte el puente. */
  medicion: { base: "", clave: "", aperturas: false, clics: false },
  /* Los leads que llegan de los anuncios. Cada plataforma se enciende por su
     cuenta: se puede tener Meta y no Google, o al revés. */
  anuncios: { meta: false, google: false, destino: "contact", dias: 30 },
};

/* Igual que normalizeDb: completa lo que falte sin descartar lo guardado. */
export function normalizeIntegrations(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  const w = d.whatsapp && typeof d.whatsapp === "object" ? d.whatsapp : {};
  const e = d.email && typeof d.email === "object" ? d.email : {};
  const m = d.medicion && typeof d.medicion === "object" ? d.medicion : {};
  const p = d.puente && typeof d.puente === "object" ? d.puente : {};
  const an = d.anuncios && typeof d.anuncios === "object" ? d.anuncios : {};
  const mode = EMAIL_MODES[e.mode] ? e.mode : DEFAULT_INTEGRATIONS.email.mode;

  /* Hasta ahora la dirección del servicio y su clave vivían dentro de
     `medicion`, porque medir correos era lo único que había del otro lado.
     Ahora el mismo Worker también trae los leads y manda los WhatsApp, así que
     suben un nivel. Lo ya guardado se adopta tal cual: quien tenía el medidor
     andando no tiene que volver a escribir nada. Sin barra al final, porque
     todo lo que se arma con esto la pone y dos barras seguidas hacen un enlace
     roto que nadie descubre hasta que el destinatario lo pincha. */
  const base = String(p.base || m.base || "").trim().replace(/\/+$/, "");
  const clave = String(p.clave || m.clave || "");

  return {
    whatsapp: {
      countryCode: String(w.countryCode ?? DEFAULT_INTEGRATIONS.whatsapp.countryCode),
      modo: WHATSAPP_MODES[w.modo] ? w.modo : DEFAULT_INTEGRATIONS.whatsapp.modo,
    },
    puente: { base, clave },
    anuncios: {
      meta: Boolean(an.meta),
      google: Boolean(an.google),
      /* Un formulario de anuncio lo llena una persona, no una institución, así
         que por defecto el lead entra como contacto. Quien venda a colegios
         puede querer lo contrario y lo cambia. */
      destino: an.destino === "company" ? "company" : "contact",
      /* Ni Meta ni Google guardan los leads para siempre —90 días uno, 30 el
         otro—, así que pedir más atrás no trae nada. */
      dias: Math.min(30, Math.max(1, Number(an.dias) || 30)),
    },
    email: {
      mode,
      clientId: String(e.clientId || CLIENT_ID_SEMILLA),
      account: String(e.account || ""),
      signature: String(e.signature || ""),
      /* Leer la bandeja es un permiso aparte y se pide sólo si se activa: sin
         esto el CRM nunca ve nada de lo que llega, únicamente lo que manda. */
      leerBandeja: Boolean(e.leerBandeja),
    },
    medicion: {
      /* Espejo de `puente`, no un segundo sitio donde escribirlos. Todo lo que
         marca y lee un correo medido pide la dirección por aquí; copiarla en
         vez de mudar esas llamadas deja que sigan funcionando sin enterarse de
         que se mudó. Se escribe en `puente`; esto se calcula. */
      base, clave,
      aperturas: Boolean(m.aperturas),
      clics: Boolean(m.clics),
    },
  };
}

/* ────────────────────────────────────────────────────────────
   Teléfonos
   WhatsApp necesita el número en formato internacional y sin signos. La regla
   es la que se puede explicar en una línea, para que nadie tenga que adivinar
   qué le pasó a su número:
     · empieza con "+" o con "00" → ya viene internacional, se respeta;
     · ya empieza con el indicativo y es largo → se respeta;
     · en cualquier otro caso → se le antepone el indicativo configurado.
   La app muestra siempre el número resuelto para poder verificarlo antes de
   abrir el chat.
   ──────────────────────────────────────────────────────────── */
export function toE164(phone, countryCode) {
  const raw = String(phone || "").trim();
  if (!raw) return "";
  const cc = String(countryCode || "").replace(/\D/g, "");
  let digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (raw.startsWith("+")) return digits;
  if (digits.startsWith("00")) return digits.slice(2);
  if (!cc) return digits;
  if (digits.startsWith(cc) && digits.length >= cc.length + 8) return digits;
  return cc + digits;
}

export function waLink(phone, text, countryCode) {
  const num = toE164(phone, countryCode);
  if (!num) return "";
  return `https://wa.me/${num}?text=${encodeURIComponent(text || "")}`;
}

/* ────────────────────────────────────────────────────────────
   Correo sin conexión: enlaces que abren un borrador ya escrito
   ──────────────────────────────────────────────────────────── */
/* Se codifica a mano y no con URLSearchParams: ese convierte los espacios en
   "+", y los programas de correo no lo traducen de vuelta en un enlace
   mailto:, así que el mensaje llegaría con un "+" entre cada palabra.
   encodeURIComponent usa %20, que ambos entienden igual. */
const q = (o) => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v ?? "")}`).join("&");

export function gmailComposeLink({ to, subject, body }) {
  return `https://mail.google.com/mail/?${q({ view: "cm", fs: "1", to, su: subject, body })}`;
}

export function mailtoLink({ to, subject, body }) {
  return `mailto:${String(to || "").trim()}?${q({ subject, body })}`;
}

/* ────────────────────────────────────────────────────────────
   Gmail conectado (OAuth + API de Gmail)
   ──────────────────────────────────────────────────────────── */

/* gmail.send es el permiso más estrecho que existe para esto: deja enviar y
   nada más. No da acceso a leer la bandeja ni a borrar nada. userinfo.email
   sólo sirve para mostrar con qué cuenta quedaste conectado. */
export const GMAIL_SCOPES =
  "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email";

/* Para que Mensajes muestre también lo que llega hace falta leer el correo, y
   eso es un permiso mayor: se pide aparte y sólo si lo activas. readonly es el
   más estrecho de los de lectura —deja mirar, nunca borrar ni marcar—, y el
   CRM lo usa para una sola cosa: traer los correos cruzados con la gente que
   ya está en tu base. Nada se sube a ningún lado: se guardan en este
   navegador, igual que el resto del CRM. */
export const GMAIL_READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

const GIS_SRC = "https://accounts.google.com/gsi/client";
let gisPromise = null;

function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => (window.google?.accounts?.oauth2 ? resolve() : reject(new Error("El script de Google cargó incompleto.")));
    s.onerror = () => {
      gisPromise = null;
      reject(new Error("No se pudo cargar el conector de Google. Revisa la conexión a internet o si alguna extensión bloquea accounts.google.com."));
    };
    document.head.appendChild(s);
  });
  return gisPromise;
}

/* El permiso vive sólo en memoria, a propósito: si se guardara en el
   navegador quedaría escrito en disco y cualquiera que abriera este perfil
   podría enviar correos como tú. Al recargar se vuelve a pedir, y como
   Google ya recuerda el consentimiento, se renueva sin preguntar nada. */
let session = { token: "", expiresAt: 0, account: "", clientId: "", scope: "" };
/* Se recuerda fuera de la sesión: cuando el permiso caduca y se renueva solo,
   hay que volver a pedir el mismo conjunto, o la renovación silenciosa
   devolvería un token sin lectura y la sincronización se caería sola. */
let quiereLeer = false;
const listeners = new Set();

const emit = () => listeners.forEach((fn) => fn(gmailStatus()));

export function onGmailChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function gmailStatus() {
  const connected = Boolean(session.token) && Date.now() < session.expiresAt;
  return {
    connected,
    account: connected ? session.account : "",
    expiresAt: session.expiresAt,
    /* Google dice en la respuesta qué concedió de verdad: puede haberse
       otorgado el envío y negado la lectura en la misma ventana. */
    puedeLeer: connected && session.scope.split(/\s+/).includes(GMAIL_READ_SCOPE),
  };
}

/* Cuando el origen no está registrado, Google no avisa por aquí: pinta el
   error dentro de su propia ventana ("no registered origin" / invalid_client)
   y al cerrarla sólo llega un popup_closed. Por eso el mensaje no afirma que
   fuiste tú quien canceló: apunta a las dos causas posibles. */
function gisError(err) {
  const type = err?.type || err?.error || "";
  if (type === "popup_closed") return "La ventana de Google se cerró sin conceder el permiso. Si dentro de esa ventana viste un error de Google, revisa lo que aparece abajo.";
  if (type === "popup_failed_to_open") return "El navegador bloqueó la ventana de Google. Permite las ventanas emergentes para este sitio y vuelve a intentar.";
  if (type === "invalid_client" || /invalid_client|registered origin/i.test(err?.error_description || "")) {
    return "Google no reconoce este ID de cliente para esta dirección.";
  }
  return err?.error_description || err?.message || type || "Google no concedió el permiso.";
}

/* silent: renovar sin molestar al usuario. Sólo funciona si ya dio el permiso
   alguna vez en este navegador; si no, Google responde con error y hay que
   volver a pedirlo con la ventana. */
export async function connectGmail(clientId, { silent = false, leer } = {}) {
  const id = String(clientId || "").trim();
  if (!id) throw new Error("Falta el ID de cliente de Google. Pégalo en Conexiones antes de conectar.");
  if (leer !== undefined) quiereLeer = Boolean(leer);
  await loadGis();

  const scope = quiereLeer ? `${GMAIL_SCOPES} ${GMAIL_READ_SCOPE}` : GMAIL_SCOPES;
  const resp = await new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: id,
      scope,
      callback: (r) => (r?.access_token ? resolve(r) : reject(new Error(gisError(r)))),
      error_callback: (e) => reject(new Error(gisError(e))),
    });
    client.requestAccessToken({ prompt: silent ? "" : "consent" });
  });

  const expiresAt = Date.now() + (Number(resp.expires_in) || 3600) * 1000 - 60_000;
  session = { token: resp.access_token, expiresAt, account: "", clientId: id, scope: String(resp.scope || scope) };

  try {
    const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${resp.access_token}` },
    });
    if (r.ok) session.account = (await r.json()).email || "";
  } catch (_) {
    /* Saber el correo es sólo para mostrarlo; sin eso la conexión sirve igual. */
  }

  emit();
  return gmailStatus();
}

export function disconnectGmail() {
  const t = session.token;
  session = { token: "", expiresAt: 0, account: "", clientId: "", scope: "" };
  emit();
  if (t) { try { window.google?.accounts?.oauth2?.revoke(t, () => {}); } catch (_) {} }
}

async function validToken(clientId) {
  if (session.token && Date.now() < session.expiresAt) return session.token;
  await connectGmail(clientId || session.clientId, { silent: true });
  return session.token;
}

/* ── Armado del mensaje (RFC 5322) ──
   Todo va en UTF-8: los acentos y las eñes se rompen si el asunto viaja en
   crudo, así que se codifica según RFC 2047, y el cuerpo en base64. */
const b64 = (bytes) => {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
};
const b64utf8 = (str) => b64(new TextEncoder().encode(String(str ?? "")));
const b64url = (str) => b64utf8(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const header = (v) => (/^[\x20-\x7E]*$/.test(String(v ?? "")) ? String(v ?? "") : `=?UTF-8?B?${b64utf8(v)}?=`);

/* Una parte del mensaje: cabeceras propias + contenido en base64, cortado a
   76 caracteres por línea como pide el correo. */
const mimePart = (type, content) => [
  `Content-Type: ${type}; charset="UTF-8"`,
  "Content-Transfer-Encoding: base64",
  "",
  b64utf8(content).replace(/(.{76})/g, "$1\r\n"),
].join("\r\n");

/* La frontera separa las partes del mensaje. Tiene que ser un texto que no
   aparezca dentro del contenido; por eso lleva una parte al azar. */
const boundary = () => `----crm-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;

export function buildMime({ to, subject, body, html }) {
  const cabeceras = [`To: ${header(to)}`, `Subject: ${header(subject)}`, "MIME-Version: 1.0"];
  const dis = String(html || "").trim();

  if (!dis) return [...cabeceras, mimePart("text/plain", body)].join("\r\n");

  /* multipart/alternative: van las dos versiones del mismo mensaje y el
     programa de correo elige. El orden importa: el texto plano primero y el
     HTML de último, porque el lector muestra la última parte que sepa
     interpretar. Así, quien tenga HTML ve el diseño y quien no —o quien lo
     tenga bloqueado— lee el texto igual. */
  const b = boundary();
  return [
    ...cabeceras,
    `Content-Type: multipart/alternative; boundary="${b}"`,
    "",
    `--${b}`,
    mimePart("text/plain", body),
    "",
    `--${b}`,
    mimePart("text/html", dis),
    "",
    `--${b}--`,
    "",
  ].join("\r\n");
}

/* Envía de verdad. Devuelve el id del mensaje en Gmail. No se pone cabecera
   From: Gmail usa la cuenta que dio el permiso, que es justo lo que se quiere.
   El correo queda en Enviados como cualquier otro. */
export async function sendGmail({ to, subject, body, html, clientId }) {
  const dest = String(to || "").trim();
  if (!dest) throw new Error("El destinatario no tiene correo.");
  const token = await validToken(clientId);

  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: b64url(buildMime({ to: dest, subject, body, html })) }),
  });

  if (!r.ok) {
    let detail = `HTTP ${r.status}`;
    try { detail = (await r.json())?.error?.message || detail; } catch (_) {}
    if (r.status === 401 || r.status === 403) {
      session = { ...session, token: "", expiresAt: 0, scope: "" };
      emit();
      throw new Error(`Gmail rechazó el permiso (${detail}). Vuelve a conectar la cuenta en Conexiones.`);
    }
    throw new Error(`Gmail no aceptó el envío: ${detail}`);
  }
  return (await r.json()).id;
}

/* ────────────────────────────────────────────────────────────
   Leer el correo: traer a Mensajes lo que se cruzó de verdad

   El envío ya deja constancia solo, pero la mitad de una conversación son las
   respuestas, y ésas llegan a Gmail sin pasar por el CRM. Aquí se van a
   buscar. Dos decisiones que conviene tener a la vista:

   · Sólo se traen los correos cruzados con direcciones que ya están en tu
     base. Lo demás —boletines, facturas, lo personal— ni se guarda ni se
     mira: se descarta al leer la cabecera y nunca toca el almacenamiento.

   · Se pide únicamente lo necesario para pintar la conversación (de, para,
     asunto, fecha y el texto). No se descargan adjuntos.
   ──────────────────────────────────────────────────────────── */

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

async function gapi(path, token) {
  const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) {
    let detail = `HTTP ${r.status}`;
    try { detail = (await r.json())?.error?.message || detail; } catch (_) {}
    if (r.status === 401 || r.status === 403) {
      session = { ...session, token: "", expiresAt: 0, scope: "" };
      emit();
      throw new Error(`Gmail rechazó el permiso de lectura (${detail}). Vuelve a autorizar la cuenta en Conexiones.`);
    }
    throw new Error(`Gmail no respondió: ${detail}`);
  }
  return r.json();
}

/* Base64 de Gmail: alfabeto de URL y sin relleno. Se decodifica a bytes y de
   ahí a texto en UTF-8, porque atob solo devuelve bytes y un acento ocupa dos:
   pasarlo directo a string parte las tildes. */
const desdeB64url = (str) => {
  const t = String(str || "").replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t + "=".repeat((4 - (t.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
};

/* Una cabecera con acentos no viaja en crudo: el correo la manda codificada
   —`=?UTF-8?B?...?=`— y sin deshacer eso un asunto en español llega a la
   pantalla como un galimatías. Se admiten las dos formas que existen, la de
   base64 (B) y la de signos de igual (Q). Lo que no se sepa decodificar se
   devuelve tal cual: mejor un asunto feo que uno vacío. */
const decodificarCabecera = (valor) => String(valor || "")
  /* Dos trozos codificados seguidos van separados por un espacio que no forma
     parte del texto: pegarlos primero evita que aparezca en mitad de la palabra
     que quedó partida entre los dos. */
  .replace(/\?=\s+=\?/g, "?==?")
  .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (todo, juego, forma, dato) => {
    try {
      let bin;
      if (forma.toUpperCase() === "B") bin = atob(dato.replace(/-/g, "+").replace(/_/g, "/"));
      else bin = dato.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return new TextDecoder(/utf-?8/i.test(juego) ? "utf-8" : "iso-8859-1").decode(bytes);
    } catch (_) { return todo; }
  });

const cabecera = (payload, nombre) => {
  const h = (payload?.headers || []).find((x) => String(x.name).toLowerCase() === nombre);
  return h ? decodificarCabecera(h.value) : "";
};

/* Las direcciones se sacan con una expresión, no separando por comas: un
   remitente puede venir como  "Rojas, Laura" <l@x.com>  y esa coma partiría el
   nombre en dos destinatarios inventados. Buscar el patrón de correo evita
   tener que entender el resto de la cabecera. */
export const direccionesDe = (texto) =>
  (String(texto || "").match(/[^\s<>,;:"()[\]]+@[^\s<>,;:"()[\]]+\.[A-Za-z]{2,}/g) || [])
    .map((d) => d.toLowerCase());

/* Recorre el árbol MIME y se queda con la mejor versión legible: el texto
   plano si viene, y si el correo es sólo HTML, el HTML convertido. */
function cuerpoDelPayload(payload) {
  let plano = "";
  let html = "";
  const ver = (n) => {
    if (!n) return;
    const tipo = String(n.mimeType || "").toLowerCase();
    const datos = n.body && n.body.data;
    if (datos && !n.filename) {
      if (tipo === "text/plain" && !plano) { try { plano = desdeB64url(datos); } catch (_) {} }
      else if (tipo === "text/html" && !html) { try { html = desdeB64url(datos); } catch (_) {} }
    }
    (n.parts || []).forEach(ver);
  };
  ver(payload);
  return plano.trim() || (html ? htmlToText(html) : "");
}

/* Un correo de respuesta arrastra abajo toda la conversación citada. En una
   ficha de CRM eso es ruido: lo nuevo son las primeras líneas. Se corta en la
   marca de cita que ponen los programas de correo, y si no aparece ninguna se
   deja el texto entero antes que arriesgar recortar algo escrito de verdad. */
const CITA = [
  /^\s*-{2,}\s*(mensaje original|original message|forwarded message)\s*-{2,}/im,
  /^\s*el .{4,90}escribi[oó]:\s*$/im,
  /^\s*on .{4,90}wrote:\s*$/im,
  /^\s*de:\s.+\n\s*enviado el:/im,
  /^\s*_{10,}\s*$/m,
];
export function sinCita(texto) {
  let t = String(texto || "").replace(/\r\n/g, "\n");
  let corte = t.length;
  for (const re of CITA) {
    const m = re.exec(t);
    if (m && m.index < corte) corte = m.index;
  }
  t = t.slice(0, corte);
  /* Las líneas con ">" son cita en cualquier programa de correo. */
  const lineas = t.split("\n");
  while (lineas.length && /^\s*>/.test(lineas[lineas.length - 1])) lineas.pop();
  return lineas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/* Le pregunta a Gmail directamente por las direcciones conocidas en vez de
   bajar la bandeja entera y filtrar después: así el primer barrido alcanza
   conversaciones de hace meses sin descargar —ni mirar— un solo correo ajeno
   al CRM. Entre llaves, Gmail entiende la lista como "cualquiera de éstas".

   `desde` es la fecha del último barrido: en las sincronizaciones siguientes
   se pide sólo lo posterior, que suelen ser un puñado de mensajes.

   `alAvanzar` va informando cuántos lleva, porque el primer barrido tarda unos
   segundos y una pantalla quieta parece colgada. */
export async function traerCorreos({ clientId, direcciones, desde, tope = 400, porLote = 100, alAvanzar } = {}) {
  const conocidas = [...new Set((direcciones || []).map((d) => String(d || "").trim().toLowerCase()).filter(Boolean))];
  if (!conocidas.length) return { mensajes: [], revisados: 0, truncado: false };

  const token = await validToken(clientId);
  if (!gmailStatus().puedeLeer) {
    throw new Error("La cuenta está conectada sólo para enviar. Activa la lectura del correo en Conexiones para traer las respuestas.");
  }

  /* -in:chats deja fuera los mensajes de Hangouts, que no son correo y llegan
     sin cabeceras útiles; los borradores tampoco son parte del intercambio. */
  const base = ["-in:chats", "-in:drafts"];
  if (desde) {
    const t = Math.floor(new Date(desde).getTime() / 1000);
    /* Un día de solape: un correo puede aparecer en la bandeja con unos
       minutos de retraso respecto a su fecha, y el duplicado lo ataja después
       la comparación por identificador. Perderlo, en cambio, no se recupera. */
    if (Number.isFinite(t)) base.push(`after:${t - 86400}`);
  }

  /* De a veinte direcciones por consulta: la cadena de búsqueda tiene un
     límite y con la libreta entera en una sola Gmail la rechazaría. */
  const lotes = [];
  for (let i = 0; i < conocidas.length; i += 20) {
    const grupo = conocidas.slice(i, i + 20);
    lotes.push(`${base.join(" ")} {${grupo.map((d) => `from:${d} to:${d}`).join(" ")}}`);
  }

  /* El tope se reparte por lote y no de corrido. Gmail devuelve lo más nuevo
     primero, así que un solo tope global se lo gastaría entero en el primer
     grupo de direcciones y los contactos del final se quedarían sin historia.
     Si algo se recorta, se recorta parejo y hacia atrás en el tiempo. */
  const ids = new Set();
  let truncado = false;
  for (const q of lotes) {
    if (ids.size >= tope) { truncado = true; break; }
    let page = "";
    let delLote = 0;
    do {
      const data = await gapi(`/messages?q=${encodeURIComponent(q)}&maxResults=100${page ? `&pageToken=${page}` : ""}`, token);
      const msgs = data.messages || [];
      msgs.forEach((m) => ids.add(m.id));
      delLote += msgs.length;
      page = data.nextPageToken || "";
      if (page && delLote >= porLote) { truncado = true; break; }
    } while (page);
  }

  const conocidasSet = new Set(conocidas);
  const lista = [...ids];
  const mensajes = [];
  let hechos = 0;
  /* De a seis a la vez: en serie son demasiados viajes seguidos y de golpe
     Gmail responde con límite excedido. */
  for (let i = 0; i < lista.length; i += 6) {
    const grupo = await Promise.all(lista.slice(i, i + 6).map(async (id) => {
      try { return await gapi(`/messages/${id}?format=full`, token); }
      catch (_) { return null; }
    }));
    for (const m of grupo) {
      hechos++;
      if (!m) continue;
      const p = m.payload || {};
      const saliente = (m.labelIds || []).includes("SENT");
      const de = direccionesDe(cabecera(p, "from"));
      const para = direccionesDe(`${cabecera(p, "to")} , ${cabecera(p, "cc")}`);

      /* El correo se apunta a toda la gente del CRM que aparece en él, del
         lado que sea: si escribes a alguien con otro contacto en copia, los
         dos estuvieron en esa conversación y en las dos fichas debe constar.
         Tu propia dirección se descarta, por si te tienes de contacto.

         Se vuelve a comprobar aquí y no se confía en la búsqueda: Gmail
         también acierta por copia oculta o por reenvíos, y entonces en el
         mensaje no queda ninguna dirección conocida a la vista. */
      const yo = String(session.account || "").toLowerCase();
      const coincide = [...new Set([...de, ...para])]
        .filter((d) => d !== yo && conocidasSet.has(d));
      if (!coincide.length) continue;

      const cuerpo = cuerpoDelPayload(p);
      mensajes.push({
        ext: `gmail:${m.id}`,
        hilo: m.threadId || "",
        dir: saliente ? "out" : "in",
        at: new Date(Number(m.internalDate) || Date.now()).toISOString(),
        subject: cabecera(p, "subject") || "(sin asunto)",
        body: saliente ? cuerpo.trim() : sinCita(cuerpo),
        de: de[0] || "",
        para,
        contrapartes: coincide,
      });
    }
    if (alAvanzar) alAvanzar(hechos, lista.length);
  }

  mensajes.sort((a, b) => (a.at < b.at ? -1 : 1));
  return { mensajes, revisados: lista.length, truncado };
}

/* ────────────────────────────────────────────────────────────
   Rebotes: los correos que nunca llegaron

   Enviar y que Gmail lo acepte no es entregar. Entre las dos cosas está el
   servidor del destinatario, que puede rechazarlo horas después porque la
   dirección no existe, porque el buzón está lleno o porque su filtro decidió
   que no. Cuando eso pasa vuelve un aviso —un DSN— a tu propia bandeja, y ése
   es el único acuse de recibo que existe de verdad en el correo: no hay
   "entregado", hay "no rebotó".

   Ese aviso no lo trae `traerCorreos`, y no es un descuido: aquel sólo baja lo
   cruzado con gente del CRM, y un rebote llega de mailer-daemon, que no es
   contacto de nadie. Por eso se va a buscar aparte, con su propia consulta, y
   sólo se conservan los rebotes de direcciones que ya están en tu base.
   ──────────────────────────────────────────────────────────── */

/* Google avisa desde mailer-daemon; los demás servidores usan postmaster o
   ninguno de los dos y sólo se les reconoce por el asunto. Se pregunta por
   todas las formas a la vez porque una lista de correos mezcla dominios y no
   se sabe de antemano quién va a rechazar. */
const CONSULTA_REBOTES =
  '(from:mailer-daemon OR from:postmaster OR from:"Mail Delivery Subsystem" OR ' +
  'subject:"Delivery Status Notification" OR subject:"Undelivered Mail Returned to Sender" OR ' +
  'subject:"Undeliverable" OR subject:"Mail delivery failed" OR subject:"Delivery has failed" OR ' +
  'subject:"Address not found" OR subject:"Returned mail")';

/* El código de estado dice en tres números qué pasó. Vale la pena traducirlo:
   "5.2.2" no significa nada para quien mira la ficha, y "el buzón está lleno"
   decide si vuelves a escribir mañana o si borras la dirección. */
const RAZONES = {
  "5.1.1": "La dirección no existe en ese servidor.",
  "5.1.10": "La dirección no existe en ese servidor.",
  "5.1.2": "El dominio del correo no existe.",
  "5.1.3": "La dirección está mal escrita.",
  "5.2.1": "El buzón está desactivado o bloqueado.",
  "5.2.2": "El buzón está lleno.",
  "5.4.1": "El servidor del destinatario no acepta correo de fuera.",
  "5.7.1": "El servidor del destinatario lo rechazó; casi siempre es su filtro de spam.",
  "5.7.26": "El servidor del destinatario lo rechazó por autenticación (SPF, DKIM o DMARC).",
  "4.2.2": "El buzón está lleno; el servidor lo volverá a intentar.",
  "4.4.1": "El servidor del destinatario no respondió; se seguirá intentando.",
  "4.7.0": "El servidor del destinatario lo está frenando; se seguirá intentando.",
};

/* Un aviso de rebote trae, escondida entre las partes del mensaje, una ficha
   técnica (message/delivery-status) con una entrada por destinatario fallido, y
   a menudo una copia de las cabeceras del correo original. Esto recorre el
   árbol y saca las tres piezas que sirven: la ficha, el asunto de lo que no
   llegó, y el texto por si no hubiera ficha. */
function piezasDeRebote(payload) {
  let ficha = "", cabecerasOriginales = "", asunto = "", texto = "";
  const ver = (n) => {
    if (!n) return;
    const tipo = String(n.mimeType || "").toLowerCase();
    const datos = n.body && n.body.data;
    if (datos) {
      let t = "";
      try { t = desdeB64url(datos); } catch (_) {}
      if (tipo === "message/delivery-status") ficha += (ficha ? "\n\n" : "") + t;
      else if (tipo === "text/rfc822-headers") cabecerasOriginales += t;
      else if (tipo === "text/plain" && !n.filename) texto += (texto ? "\n" : "") + t;
    }
    /* El correo original viene adjunto entero. Según el servidor, sus cabeceras
       cuelgan del nodo o de su primer hijo: se miran las dos. */
    if (tipo === "message/rfc822" && !asunto) {
      asunto = cabecera(n, "subject") || (n.parts || []).map((h) => cabecera(h, "subject")).find(Boolean) || "";
    }
    (n.parts || []).forEach(ver);
  };
  ver(payload);
  if (!asunto && cabecerasOriginales) {
    const m = /^subject:\s*(.+)$/im.exec(cabecerasOriginales);
    if (m) asunto = decodificarCabecera(m[1].trim());
  }
  return { ficha, asunto, texto };
}

/* Dentro de la ficha, un valor puede seguir en las líneas de abajo: las de
   continuación empiezan con espacio. Recogerlas no es un detalle —el
   diagnóstico del servidor casi siempre se parte en dos, y justo en la segunda
   línea es donde explica el porqué—. Se lee así, línea a línea, y no con una
   expresión regular: la que hacía falta para esto se leía peor de lo que
   funcionaba, y de hecho no funcionaba. */
function valorDeCabecera(bloque, nombre) {
  const lineas = String(bloque || "").split("\n");
  const i = lineas.findIndex((l) => l.toLowerCase().startsWith(`${nombre}:`));
  if (i < 0) return "";
  let v = lineas[i].slice(nombre.length + 1);
  for (let j = i + 1; j < lineas.length && /^[ \t]/.test(lineas[j]); j++) v += ` ${lineas[j].trim()}`;
  return v.replace(/\s+/g, " ").trim();
}

/* Frases con las que un servidor dice, sin código de por medio, que esa
   dirección no existe. Sólo con una de éstas se da por muerta una dirección
   cuando falta el código: en la duda se marca como temporal, porque decirle a
   alguien que borre un correo bueno es peor que pedirle que lo revise. */
const NO_EXISTE = /(address not found|no such (user|address|mailbox)|user unknown|unknown user|recipient (address )?rejected|does ?n[o']?t exist|mailbox unavailable|dirección no (existe|encontrada)|usuario desconocido)/i;

/* La ficha lleva un bloque por destinatario, separados por una línea en blanco.
   Se lee bloque a bloque y no de corrido: un envío a varias direcciones puede
   rebotar en una sola, y leerlo todo junto le colgaría el motivo de la que
   falló a la que sí llegó. */
function entradasDeFicha(ficha) {
  const out = [];
  for (const b of String(ficha || "").replace(/\r\n/g, "\n").split(/\n\s*\n/)) {
    const linea = valorDeCabecera(b, "final-recipient") || valorDeCabecera(b, "original-recipient");
    if (!linea) continue;
    const addr = direccionesDe(linea)[0] || "";
    if (!addr) continue;
    const accion = valorDeCabecera(b, "action").toLowerCase();
    /* Un DSN también sirve para avisar de una entrega exitosa o de un reenvío.
       Confundir eso con un fallo marcaría como muerta una dirección que
       funciona, que es el peor error posible aquí. */
    if (accion === "delivered" || accion === "relayed" || accion === "expanded") continue;
    const codigo = ((/^(\d\.\d{1,3}\.\d{1,3})/.exec(valorDeCabecera(b, "status")) || [])[1] || "");
    /* "smtp; 550 ..." — se descarta la etiqueta del protocolo y se deja lo que
       de verdad respondió el otro servidor. */
    const diag = valorDeCabecera(b, "diagnostic-code").replace(/^[^;]{0,12};\s*/, "");
    if (!codigo && accion !== "failed" && accion !== "delayed") continue;
    out.push({ addr, accion, codigo, diagnostico: diag.slice(0, 300) });
  }
  return out;
}

const motivoDe = ({ codigo, diagnostico, permanente }) => {
  const base = RAZONES[codigo]
    || (permanente ? "El servidor del destinatario rechazó el correo." : "La entrega se está demorando; el servidor sigue intentando.");
  return diagnostico ? `${base}\n\nLo que respondió el servidor: ${diagnostico}` : base;
};

/* Devuelve un rebote por dirección fallida que esté en el CRM. `desde` es la
   fecha del último barrido, igual que en traerCorreos. */
export async function traerRebotes({ clientId, direcciones, desde, tope = 200 } = {}) {
  const conocidas = new Set((direcciones || []).map((d) => String(d || "").trim().toLowerCase()).filter(Boolean));
  if (!conocidas.size) return { rebotes: [], revisados: 0, truncado: false };

  const token = await validToken(clientId);
  if (!gmailStatus().puedeLeer) {
    throw new Error("La cuenta está conectada sólo para enviar. Activa la lectura del correo en Conexiones para ver los rebotes.");
  }

  const partes = ["-in:chats", "-in:drafts", CONSULTA_REBOTES];
  if (desde) {
    const t = Math.floor(new Date(desde).getTime() / 1000);
    /* Un día de solape, por lo mismo que en traerCorreos: un aviso puede
       aparecer con retraso y perderlo no se recupera nunca. */
    if (Number.isFinite(t)) partes.push(`after:${t - 86400}`);
  }
  const consulta = partes.join(" ");

  const ids = [];
  let page = "", truncado = false;
  do {
    const data = await gapi(`/messages?q=${encodeURIComponent(consulta)}&maxResults=100${page ? `&pageToken=${page}` : ""}`, token);
    (data.messages || []).forEach((m) => ids.push(m.id));
    page = data.nextPageToken || "";
    if (ids.length >= tope) { truncado = Boolean(page); break; }
  } while (page);

  const rebotes = [];
  for (let i = 0; i < ids.length; i += 6) {
    const grupo = await Promise.all(ids.slice(i, i + 6).map(async (id) => {
      try { return await gapi(`/messages/${id}?format=full`, token); }
      catch (_) { return null; }
    }));

    for (const m of grupo) {
      if (!m) continue;
      const p = m.payload || {};
      const { ficha, asunto, texto } = piezasDeRebote(p);
      const at = new Date(Number(m.internalDate) || Date.now()).toISOString();

      let entradas = entradasDeFicha(ficha);

      /* Sin ficha técnica no hay nada que leer con precisión, y todavía hay
         servidores que mandan el aviso como texto corriente. Se rescata lo poco
         que queda: una dirección del CRM nombrada en el texto.

         Pero sólo si algo más confirma que esto es un fallo —quién lo manda, o
         el asunto—, porque el aviso puede citar a varios contactos y no todos
         fallaron. La consulta ya filtró bastante; esto es la segunda vuelta,
         que es la que impide marcar como muerta una dirección que funciona. */
      if (!entradas.length) {
        const de = cabecera(p, "from").toLowerCase();
        const asuntoAviso = cabecera(p, "subject");
        const esDaemon = /mailer-daemon|postmaster|mail delivery (subsystem|system)/i.test(de);
        const asuntoDeFallo = /(undeliverable|undelivered|delivery (status notification|has failed)|mail delivery failed|address not found|returned mail|failure notice|no entregado|devuelto)/i.test(asuntoAviso);
        if (esDaemon || asuntoDeFallo) {
          const codigo = ((/\b([45]\.\d{1,3}\.\d{1,3})\b/.exec(texto) || [])[1] || "");
          /* Sin código no se puede saber si es definitivo, y suponer que sí
             haría borrar direcciones buenas por un buzón lleno de un día. Se
             da por definitivo únicamente cuando el texto lo dice con todas las
             letras. */
          const definitivo = codigo ? codigo.startsWith("5") : NO_EXISTE.test(texto) || NO_EXISTE.test(asuntoAviso);
          entradas = direccionesDe(texto)
            .filter((d) => conocidas.has(d))
            .map((addr) => ({ addr, accion: definitivo ? "failed" : "delayed", codigo, diagnostico: "" }));
        }
      }

      const yaEnEste = new Set();
      for (const e of entradas) {
        if (!conocidas.has(e.addr) || yaEnEste.has(e.addr)) continue;
        yaEnEste.add(e.addr);
        const permanente = e.codigo ? e.codigo.startsWith("5") : e.accion === "failed";
        rebotes.push({
          /* Un mismo aviso puede traer varias direcciones fallidas y cada una es
             un rebote distinto: la dirección entra en el identificador para que
             no se pisen al guardarse. */
          ext: `rebote:${m.id}:${e.addr}`,
          at,
          addr: e.addr,
          permanente,
          codigo: e.codigo,
          asunto: asunto || "",
          motivo: motivoDe({ codigo: e.codigo, diagnostico: e.diagnostico, permanente }),
        });
      }
    }
  }

  rebotes.sort((a, b) => (a.at < b.at ? -1 : 1));
  return { rebotes, revisados: ids.length, truncado };
}

/* Firma al pie, separada como se acostumbra en correo. */
export const withSignature = (body, signature) => {
  const s = String(signature || "").trim();
  return s ? `${body}\n\n--\n${s}` : body;
};

/* ────────────────────────────────────────────────────────────
   Diseño HTML del correo
   Una plantilla de correo puede llevar, además del texto, una versión en
   HTML: la pieza diseñada que se pega o se carga desde un archivo .html.
   Las dos viajan juntas en el mismo correo (multipart/alternative), así que
   nadie se queda sin leerlo.
   ──────────────────────────────────────────────────────────── */

/* Escapa lo que se mete dentro del HTML. Un apellido con "&" o unas comillas
   en el nombre de una institución romperían la marcación si entraran en
   crudo, así que las variables se escapan antes de reemplazarlas. */
export const escapeHtml = (v) => String(v ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/* La firma se agrega dentro del <body> cuando lo hay: pegarla después de
   </html> la dejaría fuera del documento y algunos lectores la esconderían. */
export const withSignatureHtml = (html, signature) => {
  const src = String(html || "");
  const s = String(signature || "").trim();
  if (!s) return src;
  const bloque =
    `\n<div style="margin-top:24px;padding-top:12px;border-top:1px solid #D9DDD4;` +
    `font:13px/1.6 Arial,Helvetica,sans-serif;color:#5D6A66">` +
    `${escapeHtml(s).replace(/\n/g, "<br>")}</div>\n`;
  return /<\/body\s*>/i.test(src) ? src.replace(/<\/body\s*>/i, `${bloque}</body>`) : src + bloque;
};

/* Versión en texto del diseño, para la parte text/plain cuando la plantilla
   sólo trae HTML. No pretende ser una conversión perfecta: pretende que el
   correo se pueda leer si el HTML no se muestra. */
export const htmlToText = (html) => String(html || "")
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
  .replace(/<br\s*\/?>/gi, "\n")
  .replace(/<\/(p|div|tr|li|h[1-6]|table|blockquote)\s*>/gi, "\n")
  .replace(/<li[^>]*>/gi, "· ")
  .replace(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (m, href, txt) => `${txt.replace(/<[^>]+>/g, "").trim()} (${href})`)
  .replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
  .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
  .split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).join("\n")
  .replace(/\n{3,}/g, "\n\n")
  .trim();
