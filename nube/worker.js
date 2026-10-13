/* ────────────────────────────────────────────────────────────
   La nube del CRM
   Sirve la app y guarda el cuaderno fuera del navegador, para que el mismo
   CRM abra igual en el computador y en el celular y un cambio hecho en uno
   aparezca en el otro sin recargar.

   Dos piezas:
   · El Worker atiende las peticiones. La app (lo que sale de `vite build`)
     la sirve Cloudflare directo; aquí sólo pasa lo que empieza por /api/.
   · El Durable Object «Cuaderno» es el almacén. Hay uno solo, porque hay un
     solo dueño: él guarda los datos en SQLite y mantiene abiertas las
     conexiones en vivo de cada equipo para avisarles cuando algo cambia.

   La puerta la cuida Cloudflare Access: nadie llega aquí sin haber entrado
   con un correo autorizado. Aun así el Worker revisa la credencial que Access
   firma, porque si alguna vez el dominio queda fuera de Access por error, lo
   que se expondría es la libreta de contactos entera. Sin esa configuración
   el Worker no responde nada: cerrado por defecto.
   ──────────────────────────────────────────────────────────── */

import { DurableObject } from "cloudflare:workers";
import { atenderMcp } from "./mcp.js";
import { atenderClaude } from "./claude.js";
import { atenderEstudio } from "./estudio.js";
import { atenderDrafts } from "./drafts.js";

/* Las claves que guarda la app empiezan todas así; cualquier otra cosa se
   rechaza para que el almacén no sirva de depósito de lo que sea. */
const PREFIJO = "crm:";
const CLAVE_PRINCIPAL = "crm:data";

/* Una fila de SQLite en un Durable Object admite hasta 2 MB. El texto se
   parte en trozos de medio millón de caracteres: aun si todos fueran de tres
   bytes en UTF-8, cada trozo queda en 1,5 MB. */
const TROZO = 500_000;

/* Copias anteriores del cuaderno, para deshacer un desastre. No se guarda
   una por cada tecla: como mucho una cada diez minutos, y las 60 últimas. */
const COPIAS = 60;
const ENTRE_COPIAS_MS = 10 * 60 * 1000;

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra },
  });

/* ── Cloudflare Access ── */

const b64url = (s) => {
  const base = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(base + "=".repeat((4 - (base.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const b64urlTexto = (s) => new TextDecoder().decode(b64url(s));

/* Las llaves públicas de Access cambian rara vez; se piden una vez por hora
   y no en cada petición. */
let llaves = { at: 0, keys: [] };
async function llavesAccess(equipo) {
  if (Date.now() - llaves.at < 60 * 60 * 1000 && llaves.keys.length) return llaves.keys;
  const r = await fetch(`${equipo}/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error(`Access no entregó sus llaves (${r.status})`);
  const { keys } = await r.json();
  llaves = { at: Date.now(), keys: keys || [] };
  return llaves.keys;
}

/* Devuelve el correo de quien entró, o null si la credencial no sirve. */
async function quienEs(req, env) {
  if (env.SIN_ACCESS === "1") return "local@desarrollo"; // sólo en `wrangler dev`, vía .dev.vars
  const equipo = String(env.ACCESS_EQUIPO || "").replace(/\/+$/, "");
  const aud = String(env.ACCESS_AUD || "");
  if (!equipo || !aud) return null;

  const token = req.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return null;
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  try {
    const cabecera = JSON.parse(b64urlTexto(partes[0]));
    const datos = JSON.parse(b64urlTexto(partes[1]));
    if (cabecera.alg !== "RS256") return null;

    let jwk = (await llavesAccess(equipo)).find((k) => k.kid === cabecera.kid);
    if (!jwk) { llaves.at = 0; jwk = (await llavesAccess(equipo)).find((k) => k.kid === cabecera.kid); }
    if (!jwk) return null;

    const llave = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const firmado = new TextEncoder().encode(`${partes[0]}.${partes[1]}`);
    const valido = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", llave, b64url(partes[2]), firmado);
    if (!valido) return null;

    const ahora = Math.floor(Date.now() / 1000);
    const auds = Array.isArray(datos.aud) ? datos.aud : [datos.aud];
    if (!auds.includes(aud)) return null;
    if (datos.iss !== equipo) return null;
    if (typeof datos.exp !== "number" || datos.exp < ahora) return null;
    return datos.email || datos.sub || "desconocido";
  } catch (_) {
    return null;
  }
}

/* ── El almacén ── */

export class Cuaderno extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS trozos (
          clave TEXT NOT NULL, parte INTEGER NOT NULL, texto TEXT NOT NULL,
          PRIMARY KEY (clave, parte)
        );
        CREATE TABLE IF NOT EXISTS claves (
          clave TEXT PRIMARY KEY, rev INTEGER NOT NULL, partes INTEGER NOT NULL,
          tam INTEGER NOT NULL, at TEXT NOT NULL, quien TEXT NOT NULL
        );
      `);
    });
    /* Los equipos mandan "ping" para saber que la conexión sigue viva. Se
       contesta sin despertar al objeto, que puede seguir hibernando. */
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  #meta(clave) {
    return this.ctx.storage.sql.exec("SELECT * FROM claves WHERE clave = ?", clave).toArray()[0] || null;
  }

  #leerCrudo(clave) {
    const m = this.#meta(clave);
    if (!m) return null;
    const filas = this.ctx.storage.sql
      .exec("SELECT texto FROM trozos WHERE clave = ? ORDER BY parte", clave).toArray();
    return { texto: filas.map((f) => f.texto).join(""), rev: m.rev, at: m.at };
  }

  /* Borrar y escribir van juntos: si algo falla a la mitad no queda un
     cuaderno con trozos de dos versiones. */
  #escribirCrudo(clave, texto, rev, quien) {
    const sql = this.ctx.storage.sql;
    const at = new Date().toISOString();
    let partes = 0;
    sql.exec("DELETE FROM trozos WHERE clave = ?", clave);
    for (let i = 0; i < texto.length || i === 0; i += TROZO) {
      sql.exec("INSERT INTO trozos (clave, parte, texto) VALUES (?, ?, ?)", clave, partes, texto.slice(i, i + TROZO));
      partes += 1;
    }
    sql.exec(
      `INSERT INTO claves (clave, rev, partes, tam, at, quien) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(clave) DO UPDATE SET rev = excluded.rev, partes = excluded.partes,
         tam = excluded.tam, at = excluded.at, quien = excluded.quien`,
      clave, rev, partes, texto.length, at, quien,
    );
    return at;
  }

  #borrarCrudo(clave) {
    this.ctx.storage.sql.exec("DELETE FROM trozos WHERE clave = ?", clave);
    this.ctx.storage.sql.exec("DELETE FROM claves WHERE clave = ?", clave);
  }

  /* Antes de pisar el cuaderno se aparta la versión que había, si la última
     copia ya tiene sus diez minutos. Las más viejas se van descartando. */
  #copiar(clave) {
    if (clave !== CLAVE_PRINCIPAL) return;
    const actual = this.#meta(clave);
    if (!actual) return;
    const sql = this.ctx.storage.sql;
    const ultima = sql.exec(
      "SELECT at FROM claves WHERE clave LIKE ? ORDER BY at DESC LIMIT 1", `${clave}@%`,
    ).toArray()[0];
    if (ultima && Date.now() - Date.parse(ultima.at) < ENTRE_COPIAS_MS) return;

    const viejo = this.#leerCrudo(clave);
    this.#escribirCrudo(`${clave}@${actual.rev}`, viejo.texto, actual.rev, actual.quien);
    const sobran = sql.exec(
      "SELECT clave FROM claves WHERE clave LIKE ? ORDER BY at DESC LIMIT -1 OFFSET ?", `${clave}@%`, COPIAS,
    ).toArray();
    for (const s of sobran) this.#borrarCrudo(s.clave);
  }

  leer(clave) {
    return this.#leerCrudo(clave);
  }

  /* `origen` identifica a la pestaña que escribe, para avisarle a todas las
     demás y no a ella misma, que ya tiene el cambio. */
  escribir(clave, texto, quien, origen) {
    let rev = 0;
    let at = "";
    this.ctx.storage.transactionSync(() => {
      this.#copiar(clave);
      rev = ((this.#meta(clave) || {}).rev || 0) + 1;
      at = this.#escribirCrudo(clave, texto, rev, quien);
    });
    this.#avisar({ tipo: "cambio", clave, rev, at }, origen);
    return { rev, at };
  }

  /* Para quien lee, cambia y vuelve a guardar desde el servidor (Claude, por
     /mcp): sólo escribe si nadie guardó entre medias. Si alguien lo hizo,
     devuelve ok: false y el que llama vuelve a leer y reintenta, en vez de
     pisar lo que la app acababa de escribir. */
  escribirSi(clave, texto, quien, revLeida) {
    const actual = (this.#meta(clave) || {}).rev || 0;
    if (actual !== revLeida) return { ok: false, rev: actual };
    return { ok: true, ...this.escribir(clave, texto, quien, "") };
  }

  borrar(clave, origen) {
    this.ctx.storage.transactionSync(() => this.#borrarCrudo(clave));
    this.#avisar({ tipo: "borrado", clave }, origen);
    return { ok: true };
  }

  copias() {
    return this.ctx.storage.sql.exec(
      "SELECT clave, rev, tam, at, quien FROM claves WHERE clave LIKE ? ORDER BY at DESC", `${CLAVE_PRINCIPAL}@%`,
    ).toArray();
  }

  #avisar(msg, origen) {
    const texto = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (origen && this.ctx.getTags(ws).includes(origen)) continue;
      try { ws.send(texto); } catch (_) {}
    }
  }

  /* La conexión en vivo. Se usa la API de hibernación: el objeto puede
     dormirse con las conexiones abiertas y no cobra mientras duerme. Al
     abrir se le dice a la pestaña en qué versión va el cuaderno, por si
     cambió mientras estaba desconectada. */
  async fetch(req) {
    if (req.headers.get("Upgrade") !== "websocket") return new Response("Se esperaba WebSocket", { status: 426 });
    const origen = new URL(req.url).searchParams.get("origen") || "";
    const { 0: cliente, 1: servidor } = new WebSocketPair();
    this.ctx.acceptWebSocket(servidor, origen ? [origen.slice(0, 64)] : []);
    const m = this.#meta(CLAVE_PRINCIPAL);
    servidor.send(JSON.stringify({ tipo: "hola", clave: CLAVE_PRINCIPAL, rev: m ? m.rev : 0 }));
    return new Response(null, { status: 101, webSocket: cliente });
  }

  webSocketMessage() {}
  webSocketClose(ws, code) {
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, "adiós"); } catch (_) {}
  }
}

/* ── Las rutas ── */

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const esMcp = url.pathname === "/mcp";
    if (!esMcp && !url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);

    const quien = await quienEs(req, env);
    if (!quien) return json({ error: "Sin acceso. Entra por la dirección del CRM para iniciar sesión." }, 401);

    const cuaderno = env.CUADERNO.getByName("principal");
    const origen = (req.headers.get("X-Origen") || url.searchParams.get("origen") || "").slice(0, 64);

    if (esMcp) return atenderMcp(req, cuaderno, quien);

    if (url.pathname === "/api/yo") return json({ email: quien });

    if (url.pathname === "/api/vivo") return cuaderno.fetch(req);

    if (url.pathname === "/api/copias") return json(await cuaderno.copias());

    /* Cada llamada a Claude cuesta: como al escribir, se exige X-Origen para
       que otro sitio no pueda gastarla aprovechando la sesión. */
    if (url.pathname === "/api/claude") {
      if (!req.headers.get("X-Origen")) return json({ error: "Falta X-Origen" }, 400);
      return atenderClaude(req, env);
    }
    if (url.pathname === "/api/estudio") {
      if (!req.headers.get("X-Origen")) return json({ error: "Falta X-Origen" }, 400);
      return atenderEstudio(req, env);
    }
    if (url.pathname === "/api/drafts") {
      if (!req.headers.get("X-Origen")) return json({ error: "Falta X-Origen" }, 400);
      return atenderDrafts(req, env);
    }

    const m = url.pathname.match(/^\/api\/kv\/(.+)$/);
    if (m) {
      const clave = decodeURIComponent(m[1]);
      if (!clave.startsWith(PREFIJO) || clave.length > 200) return json({ error: "Clave no permitida" }, 400);

      if (req.method === "GET") {
        const r = await cuaderno.leer(clave);
        if (!r) return json({ error: "No existe" }, 404);
        return new Response(r.texto, {
          headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Rev": String(r.rev) },
        });
      }

      /* Escribir y borrar exigen la cabecera X-Origen: un sitio ajeno no
         puede ponerla sin una verificación previa que este Worker nunca
         aprueba, así que no puede escribir aquí aprovechando la sesión. */
      if (!req.headers.get("X-Origen")) return json({ error: "Falta X-Origen" }, 400);

      if (req.method === "PUT") {
        const texto = await req.text();
        return json(await cuaderno.escribir(clave, texto, quien, origen));
      }
      if (req.method === "DELETE") return json(await cuaderno.borrar(clave, origen));
      return json({ error: "Método no permitido" }, 405);
    }

    return json({ error: "No existe" }, 404);
  },
};
