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
  whatsapp: { countryCode: "57" },
  email: { mode: "gmailCompose", clientId: CLIENT_ID_SEMILLA, account: "", signature: "" },
};

/* Igual que normalizeDb: completa lo que falte sin descartar lo guardado. */
export function normalizeIntegrations(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  const w = d.whatsapp && typeof d.whatsapp === "object" ? d.whatsapp : {};
  const e = d.email && typeof d.email === "object" ? d.email : {};
  const mode = EMAIL_MODES[e.mode] ? e.mode : DEFAULT_INTEGRATIONS.email.mode;
  return {
    whatsapp: { countryCode: String(w.countryCode ?? DEFAULT_INTEGRATIONS.whatsapp.countryCode) },
    email: {
      mode,
      clientId: String(e.clientId || CLIENT_ID_SEMILLA),
      account: String(e.account || ""),
      signature: String(e.signature || ""),
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
let session = { token: "", expiresAt: 0, account: "", clientId: "" };
const listeners = new Set();

const emit = () => listeners.forEach((fn) => fn(gmailStatus()));

export function onGmailChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function gmailStatus() {
  const connected = Boolean(session.token) && Date.now() < session.expiresAt;
  return { connected, account: connected ? session.account : "", expiresAt: session.expiresAt };
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
export async function connectGmail(clientId, { silent = false } = {}) {
  const id = String(clientId || "").trim();
  if (!id) throw new Error("Falta el ID de cliente de Google. Pégalo en Conexiones antes de conectar.");
  await loadGis();

  const resp = await new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: id,
      scope: GMAIL_SCOPES,
      callback: (r) => (r?.access_token ? resolve(r) : reject(new Error(gisError(r)))),
      error_callback: (e) => reject(new Error(gisError(e))),
    });
    client.requestAccessToken({ prompt: silent ? "" : "consent" });
  });

  const expiresAt = Date.now() + (Number(resp.expires_in) || 3600) * 1000 - 60_000;
  session = { token: resp.access_token, expiresAt, account: "", clientId: id };

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
  session = { token: "", expiresAt: 0, account: "", clientId: "" };
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
      session = { ...session, token: "", expiresAt: 0 };
      emit();
      throw new Error(`Gmail rechazó el permiso (${detail}). Vuelve a conectar la cuenta en Conexiones.`);
    }
    throw new Error(`Gmail no aceptó el envío: ${detail}`);
  }
  return (await r.json()).id;
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
