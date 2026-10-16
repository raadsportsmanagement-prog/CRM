/* ────────────────────────────────────────────────────────────
   Medición: aperturas y clics

   Enviar un correo deja constancia de que salió, y hasta ahí llegaba el CRM.
   Lo que pasa después —si lo abrieron, si pincharon el enlace— ocurre en la
   máquina de otra persona y no vuelve solo. Este archivo es la mitad que vive
   aquí; la otra está en `tracker/`, un servicio diminuto que hay que publicar
   una vez.

   Cómo funciona, en dos frases: a cada correo enviado se le pega un
   identificador aleatorio, y con él se marcan dos cosas dentro del HTML —una
   imagen de 1×1 al final, y los enlaces, que pasan a ir por el medidor antes
   de llegar a su destino—. Cuando el programa de correo pide la imagen, o
   alguien pincha, el medidor lo anota; el CRM se lo pregunta después.

   Lo que conviene saber antes de creerle a los números:

   · La apertura es una señal floja. Quien lee con las imágenes bloqueadas no
     aparece nunca, y Apple Mail descarga las imágenes al recibir el correo, sin
     que nadie lo abra, así que inventa aperturas. El CRM marca aparte las que
     llegan en los primeros segundos, que son casi siempre ésas.

   · El clic es firme. Nadie pincha un enlace por accidente de sistema.

   · Sin medidor publicado, nada de esto se enciende y el CRM funciona igual
     que antes: se envía y se registra el envío.
   ──────────────────────────────────────────────────────────── */

import { escapeHtml } from "./integrations.js";

export const DEFAULT_MEDICION = { base: "", clave: "", aperturas: false, clics: false };

export function normalizeMedicion(raw) {
  const m = raw && typeof raw === "object" ? raw : {};
  return {
    /* Sin barra al final: todo lo que se arma aquí la pone, y dos barras
       seguidas en una URL de correo son un enlace roto que nadie ve hasta que
       el destinatario lo pincha. */
    base: String(m.base || "").trim().replace(/\/+$/, ""),
    clave: String(m.clave || ""),
    aperturas: Boolean(m.aperturas),
    clics: Boolean(m.clics),
  };
}

/* Hace falta la dirección, la clave y al menos una de las dos cosas activadas.
   Con una sola faltando, medir no se intenta: media medición daría números que
   parecen ciertos. */
export const midiendo = (m) => Boolean(m && m.base && m.clave && (m.aperturas || m.clics));

/* Identificador de un envío: 64 bits de azar del generador criptográfico del
   navegador, no de Math.random. Va escrito en un correo que puede reenviarse a
   cualquier parte, y con un identificador adivinable un curioso podría inventar
   aperturas de correos que nunca leyó. */
export function nuevoTrk() {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/* ── Firma de los enlaces ──
   El medidor sólo redirige a donde el CRM le diga, y lo comprueba con esta
   firma. Sin ella el servicio sería un trampolín abierto: cualquiera que
   descubriera la dirección podría repartir enlaces que empiezan con tu dominio
   y terminan en una página de phishing. */
async function firmar(clave, mensaje) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(clave), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = await crypto.subtle.sign("HMAC", k, enc.encode(mensaje));
  return [...new Uint8Array(s)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

/* Dentro del HTML un enlace viaja escapado —`&amp;` donde el navegador leerá
   `&`—, y un enlace de YouTube con lista de reproducción trae varios. Si se
   firmara y se redirigiera esa forma escapada, el destino tendría un "amp;"
   pegado en cada parámetro y YouTube abriría el vídeo equivocado, o ninguno. */
const desescapar = (s) => String(s || "")
  .replace(/&amp;/gi, "&").replace(/&#0*38;/g, "&")
  .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
  .replace(/&quot;/gi, '"').replace(/&#0*39;/g, "'").replace(/&#x27;/gi, "'");

export async function enlaceClic(base, clave, trk, destino) {
  const real = desescapar(destino);
  const s = await firmar(clave, `${trk}|${real}`);
  /* `&amp;` y no `&` porque esto entra como atributo de un documento HTML.
     El programa de correo lo desescapa antes de pedirlo. */
  return `${base}/c/${trk}?u=${encodeURIComponent(real)}&amp;s=${s}`;
}

export const pixelUrl = (base, trk) => `${base}/a/${trk}.gif`;

/* ── Darse de baja ──
   Basta con la dirección y la clave del medidor: no hace falta medir nada. El
   identificador es el de la ficha y no el del envío, porque lo que se da de
   baja es la persona, no un correo suelto. Firmado, para que nadie pueda dar de
   baja a otro cambiando un número en la dirección. */
export const puedeDarBaja = (m) => Boolean(m && m.base && m.clave);

export async function enlaceBaja({ base, clave }, recId) {
  const raiz = String(base || "").replace(/\/+$/, "");
  const s = await firmar(clave, `baja|${recId}`);
  return `${raiz}/b/${encodeURIComponent(recId)}?s=${s}`;
}

/* El pie con la baja, en las dos versiones del mensaje. El enlace empieza por
   la dirección del medidor, así que marcarHtml no lo envuelve como un clic. */
export const pieBajaTexto = (texto, url) =>
  `${texto}\n\n—\nSi prefieres no recibir más correos como éste, date de baja aquí: ${url}`;

export function pieBajaHtml(html, url) {
  const pie = `<p style="font:12px/1.5 Arial,Helvetica,sans-serif;color:#6B7471;margin:24px 0 0">` +
    `Si prefieres no recibir más correos como éste, <a href="${url}" style="color:#6B7471">date de baja aquí</a>.</p>`;
  return /<\/body\s*>/i.test(html) ? html.replace(/<\/body\s*>/i, `${pie}</body>`) : html + pie;
}

/* Se miden los enlaces normales y nada más. Un `mailto:` o un `tel:` no se
   abren en un navegador que pueda pasar por el medidor, y un ancla `#` vive
   dentro del propio correo. Los que ya apuntan al medidor se dejan quietos:
   marcarlos dos veces haría un enlace envuelto en sí mismo. */
const rastreable = (href, base) => {
  const h = desescapar(href).trim();
  return /^https?:\/\//i.test(h) && !h.toLowerCase().startsWith(base.toLowerCase());
};

async function marcarEnlaces(html, base, clave, trk) {
  /* Se buscan atributos href de etiquetas <a>, con comillas dobles o simples.
     Los `href` sin comillas no se tocan: son válidos en HTML pero nadie los
     escribe en una plantilla de correo, y adivinar dónde terminan es la clase
     de astucia que un día se come media etiqueta. */
  const re = /(<a\b[^>]*?\bhref\s*=\s*)(["'])([^"']*)\2/gi;

  /* Las firmas se calculan antes y no dentro del reemplazo: `replace` no sabe
     esperar una promesa y devolvería "[object Promise]" como dirección.
     Además se calcula una sola vez por enlace distinto, no por aparición: un
     botón y su texto suelen apuntar al mismo sitio. */
  const distintos = [...new Set([...html.matchAll(re)].map((m) => m[3]))].filter((h) => rastreable(h, base));
  if (!distintos.length) return html;

  const mapa = new Map();
  for (const href of distintos) mapa.set(href, await enlaceClic(base, clave, trk, href));

  return html.replace(re, (todo, pre, comilla, href) => (
    mapa.has(href) ? `${pre}${comilla}${mapa.get(href)}${comilla}` : todo
  ));
}

/* La imagen va al final del cuerpo, que es donde menos estorba si algún lector
   decide mostrarla igual. Con sus medidas puestas y sin `display:none` ni
   `opacity:0`: los filtros de spam puntúan mal lo que está escondido a
   propósito, y un píxel de 1×1 ya es invisible sin necesidad de disimularlo. */
function ponerPixel(html, base, trk) {
  const img = `<img src="${pixelUrl(base, trk)}" width="1" height="1" border="0" alt=""` +
    ` style="width:1px;height:1px;max-width:1px;max-height:1px;border:0;overflow:hidden" />`;
  return /<\/body\s*>/i.test(html) ? html.replace(/<\/body\s*>/i, `${img}</body>`) : html + img;
}

/* Marca el HTML de un envío. Devuelve el mismo HTML si falta configuración:
   quien llame no tiene que preguntar antes. */
export async function marcarHtml(html, { base, clave, trk, aperturas, clics }) {
  let out = String(html || "");
  const raiz = String(base || "").replace(/\/+$/, "");
  if (!raiz || !clave || !trk || !out.trim()) return out;
  if (clics) out = await marcarEnlaces(out, raiz, clave, trk);
  if (aperturas) out = ponerPixel(out, raiz, trk);
  return out;
}

/* ── Correos sin diseño ──
   La imagen y los enlaces marcados sólo caben en la parte HTML del mensaje: en
   texto plano no hay dónde ponerlos. Para no dejar sin medir los envíos
   escritos a secas, se arma con el texto una versión HTML sencilla —el mismo
   contenido, sin diseño— y el correo sale con las dos, como cualquier otro.
   Quien lo reciba lee lo mismo que habría leído. */
export const textoAHtml = (texto) => {
  const cuerpo = escapeHtml(texto)
    /* Las direcciones escritas sueltas se vuelven enlaces, porque un enlace en
       texto plano no se puede medir y así el clic también cuenta. El corte
       final evita tragarse el punto o el paréntesis que cierran la frase. */
    .replace(/(https?:\/\/[^\s<]*[^\s<.,;:!?)\]}"'])/g, '<a href="$1" style="color:#0E5C4F">$1</a>')
    .replace(/\n/g, "<br />");
  return `<!DOCTYPE html><html><head><meta charset="utf-8" /></head>` +
    `<body style="margin:0;padding:0;background:#ffffff">` +
    `<div style="font:15px/1.65 Arial,Helvetica,sans-serif;color:#131C1A;max-width:640px">${cuerpo}</div>` +
    `</body></html>`;
};

/* ────────────────────────────────────────────────────────────
   Preguntarle al medidor qué pasó
   ──────────────────────────────────────────────────────────── */

async function pedir(base, ruta) {
  let r;
  try {
    r = await fetch(`${String(base).replace(/\/+$/, "")}${ruta}`, { cache: "no-store" });
  } catch (e) {
    /* fetch sólo falla así cuando no hubo respuesta: dirección mal escrita, sin
       internet, o el Worker sin publicar. El mensaje del navegador para esto es
       "Failed to fetch", que no le dice nada a nadie. */
    throw new Error("No se pudo hablar con el medidor. Revisa la dirección, o si el servicio está publicado.");
  }
  if (r.status === 401) throw new Error("El medidor rechazó la clave. Tiene que ser la misma que guardaste con `wrangler secret put CLAVE`.");
  if (!r.ok) {
    let detalle = `HTTP ${r.status}`;
    try { detalle = (await r.json())?.error || detalle; } catch (_) {}
    throw new Error(`El medidor respondió con un error: ${detalle}`);
  }
  return r.json();
}

export const probarMedidor = ({ base, clave }) =>
  pedir(base, `/salud?clave=${encodeURIComponent(clave)}`);

/* `desde` es la fecha del último barrido. Se pide con un minuto de solape
   porque el reloj del medidor y el de este computador no son el mismo, y un
   evento anotado justo en el borde se perdería para siempre; el duplicado, en
   cambio, lo ataja después la comparación por fecha y tipo. */
export async function traerEventos({ base, clave, desde }) {
  const t = desde ? new Date(desde).getTime() : 0;
  const ms = Number.isFinite(t) && t > 0 ? Math.max(0, t - 60_000) : 0;
  const data = await pedir(base, `/eventos?clave=${encodeURIComponent(clave)}&desde=${ms}`);
  return {
    eventos: Array.isArray(data.eventos) ? data.eventos : [],
    truncado: Boolean(data.truncado),
  };
}

/* ────────────────────────────────────────────────────────────
   Leer los eventos ya guardados en una actividad
   ──────────────────────────────────────────────────────────── */

/* Apple Mail descarga las imágenes al recibir el correo, no al abrirlo: eso
   llega como una apertura a los pocos segundos del envío, y el destinatario
   puede estar durmiendo. No se puede saber con certeza cuál es cuál, así que no
   se descartan —se marcan—, y el número honesto queda a la vista al lado del
   optimista. Un minuto es holgado: una persona que de verdad estaba mirando el
   correo entrar también cae aquí, pero prefiero dudar de una apertura cierta a
   contar una falsa. */
const PRECARGA_MS = 60_000;

export function esPrecarga(envioAt, aperturaAt) {
  const a = new Date(envioAt).getTime(), b = new Date(aperturaAt).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return b - a >= 0 && b - a < PRECARGA_MS;
}

/* Resumen de una actividad para pintarla. Devuelve siempre la misma forma,
   haya o no medición, para que las pantallas no tengan que preguntar. */
export function estadoDe(a) {
  const aperturas = Array.isArray(a && a.aperturas) ? a.aperturas : [];
  const clics = Array.isArray(a && a.clics) ? a.clics : [];
  const ciertas = aperturas.filter((x) => !esPrecarga(a.at, x.at));
  /* Un clic prueba la lectura mejor que cualquier apertura, así que vale por
     una: si alguien pinchó, abrió —aunque el pixel no llegara nunca porque
     tenía las imágenes bloqueadas, que es justo el caso frecuente. */
  const primero = ciertas[0] || (clics.length ? (aperturas[0] || clics[0]) : null);
  return {
    medido: Boolean(a && a.trk),
    aperturas: aperturas.length,
    abiertoAt: (primero && primero.at) || "",
    soloPrecarga: aperturas.length > 0 && ciertas.length === 0 && clics.length === 0,
    clics: clics.length,
    enlaces: [...new Set(clics.map((c) => c.u).filter(Boolean))],
    ultimoClic: clics.length ? clics[clics.length - 1].at : "",
    rebote: (a && a.reboto) || null,
  };
}
