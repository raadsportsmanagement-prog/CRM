/* ────────────────────────────────────────────────────────────
   Almacenamiento en la nube
   La misma forma que `window.storage` en main.jsx —get, set, delete— pero
   contra el servidor del CRM en vez del navegador. El CRM no se entera del
   cambio: sigue llamando a las mismas tres funciones.

   Lo que sí cambia es que ahora otro equipo puede escribir. Para eso hay una
   conexión en vivo: cuando el celular guarda, el servidor le avisa al
   computador, éste pide la versión nueva y se la entrega al CRM como si
   viniera de otra pestaña (el evento "storage" que el CRM ya escucha). Si en
   ese momento hay algo sin guardar en este equipo, el CRM no adopta lo de
   afuera, y al guardar gana lo último que se escribió. El servidor guarda
   copias anteriores por si eso alguna vez pisa algo que importaba.
   ──────────────────────────────────────────────────────────── */

import { fusionarTextos } from "./fusion.js";

const CLAVE_PRINCIPAL = "crm:data";

/* Identifica a esta pestaña ante el servidor, para que el aviso de un cambio
   le llegue a las demás y no a la que lo hizo. */
const ORIGEN = (crypto.randomUUID && crypto.randomUUID()) || `o${Date.now()}${Math.random().toString(36).slice(2)}`;

/* La última versión que esta pestaña conoce de cada clave. */
const revs = new Map();

/* La versión de la que desciende lo que la pestaña tiene en memoria: la que
   leyó al abrir, la última que guardó o la última que adoptó de afuera. Se
   guarda "sobre" ella; si el servidor ya va en otra (escribió un agente,
   Catch, Claude por /mcp, otro equipo), se juntan las dos en vez de pisar.
   `candidatas` es lo que llegó de afuera y el CRM todavía no adoptó: sólo
   pasa a ser base cuando el CRM avisa cuál de ellas tomó (`adoptado`): puede
   haber llegado otra más nueva entre medias, y la base tiene que ser
   exactamente la que el CRM tiene en memoria. */
const bases = new Map();
const candidatas = new Map();
const proponer = (clave, texto, rev) => {
  const l = (candidatas.get(clave) || []).filter((c) => c.rev !== rev);
  candidatas.set(clave, [...l, { texto, rev }].slice(-6));
};

const SESION_VENCIDA =
  "La sesión del CRM venció. Recarga la página para volver a entrar; lo que no se guardó sigue en esta pestaña mientras no la cierres.";

/* Cuando la sesión de Cloudflare Access vence, la respuesta ya no es del CRM
   sino una redirección a la página de inicio de sesión. Con `manual` esa
   redirección no se sigue y se reconoce aquí, en vez de intentar leer HTML
   ajeno como si fueran los datos. */
async function pedir(ruta, init = {}) {
  let r;
  try {
    r = await fetch(ruta, { ...init, redirect: "manual", credentials: "same-origin" });
  } catch (e) {
    throw new Error(`no hay conexión con el servidor (${(e && e.message) || e})`);
  }
  if (r.type === "opaqueredirect" || r.status === 401 || r.status === 403) throw new Error(SESION_VENCIDA);
  return r;
}

const ruta = (clave) => `/api/kv/${encodeURIComponent(clave)}`;

async function leer(clave) {
  const r = await pedir(ruta(clave));
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`el servidor no entregó los datos (${r.status})`);
  const value = await r.text();
  const rev = Number(r.headers.get("X-Rev")) || 0;
  revs.set(clave, Math.max(rev, revs.get(clave) || 0));
  return { value, rev };
}

const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));

/* Un corte de red de un segundo no debería terminar en "no se pudo guardar":
   se reintenta tres veces antes de rendirse. La sesión vencida no se
   reintenta, porque no se arregla sola. Al cerrar la pestaña se pide
   `keepalive` para que el envío sobreviva al cierre; el navegador sólo lo
   permite con cuerpos pequeños, así que con un cuaderno grande no se pide. */
async function escribir(clave, value) {
  let cuerpo = value;
  let fusionado = false;
  let baseRev = (bases.get(clave) || {}).rev;
  let ultimo;
  for (let intento = 0; intento < 5; intento += 1) {
    try {
      const r = await pedir(ruta(clave), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json", "X-Origen": ORIGEN,
          ...(baseRev != null ? { "X-Rev-Base": String(baseRev) } : {}),
        },
        body: cuerpo,
        keepalive: cuerpo.length < 60_000,
      });
      /* Alguien escribió desde que esta pestaña leyó: se trae lo de ahora y
         se junta con lo propio. La base no cambia hasta que el CRM adopte el
         resultado: si mientras tanto la persona siguió escribiendo, el
         próximo guardado vuelve a chocar y se junta otra vez desde la base
         correcta, en vez de borrar lo ajeno creyendo que lo quitó ella. */
      if (r.status === 409) {
        const actual = await leer(clave);
        if (!actual) { baseRev = 0; continue; }
        cuerpo = fusionarTextos((bases.get(clave) || {}).texto, cuerpo, actual.value);
        baseRev = actual.rev;
        fusionado = true;
        continue;
      }
      if (!r.ok) throw new Error(`el servidor no aceptó el guardado (${r.status})`);
      const { rev } = await r.json();
      revs.set(clave, rev);
      if (fusionado) {
        proponer(clave, cuerpo, rev);
        return { fusionado: cuerpo };
      }
      bases.set(clave, { texto: cuerpo, rev });
      return {};
    } catch (e) {
      ultimo = e;
      if (e.message === SESION_VENCIDA) break;
      await pausa(600 * (intento + 1));
    }
  }
  throw ultimo || new Error("el cuaderno cambió varias veces seguidas mientras se guardaba");
}

/* Las escrituras de una misma clave salen en fila: si dos guardados viajaran
   a la vez, el más viejo podría llegar último y quedarse como versión final. */
const filas = new Map();
function enFila(clave, tarea) {
  const antes = filas.get(clave) || Promise.resolve();
  const p = antes.catch(() => {}).then(tarea);
  filas.set(clave, p);
  return p;
}

/* Le entrega al CRM la versión que escribió otro equipo, por el mismo camino
   por el que ya recibe lo que escribe otra pestaña. */
async function traerCambio(clave, rev) {
  if (rev && rev <= (revs.get(clave) || 0)) return;
  try {
    const r = await leer(clave);
    if (!r) return;
    proponer(clave, r.value, r.rev);
    window.dispatchEvent(new StorageEvent("storage", { key: clave, newValue: r.value }));
  } catch (_) {
    /* Si no se pudo traer ahora, la próxima conexión vuelve a comparar
       versiones y lo intenta de nuevo. */
  }
}

/* ── La conexión en vivo ── */

function conectarEnVivo() {
  let ws = null;
  let latido = null;
  let reintento = null;
  let espera = 1000;

  const abrir = () => {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const este = new WebSocket(`${proto}//${location.host}/api/vivo?origen=${encodeURIComponent(ORIGEN)}`);
    ws = este;
    este.onopen = () => {
      espera = 1000;
      clearInterval(latido);
      latido = setInterval(() => { try { este.send("ping"); } catch (_) {} }, 30_000);
    };
    este.onmessage = (e) => {
      if (e.data === "pong") return;
      let msg;
      try { msg = JSON.parse(e.data); } catch (_) { return; }
      if (msg.clave !== CLAVE_PRINCIPAL) return;
      if (msg.tipo === "hola" || msg.tipo === "cambio") traerCambio(msg.clave, msg.rev);
    };
    /* Se reconecta solo, cada vez esperando un poco más (hasta 30 s), para
       no martillar al servidor si está caído o si la sesión venció. */
    este.onclose = () => {
      if (ws !== este) return; // ya la reemplazó otra al volver a la pestaña
      clearInterval(latido);
      clearTimeout(reintento);
      reintento = setTimeout(abrir, espera);
      espera = Math.min(espera * 2, 30_000);
    };
  };

  /* El celular congela las pestañas de fondo y la conexión muere sin aviso.
     Al volver a la pestaña se revisa y, si hace falta, se abre de nuevo; al
     abrir, el servidor dice en qué versión va y se trae lo que faltó. */
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
      clearTimeout(reintento);
      espera = 1000;
      abrir();
    }
  });

  abrir();
}

export function almacenNube() {
  conectarEnVivo();
  return {
    get: async (clave) => {
      const r = await leer(clave);
      bases.set(clave, r ? { texto: r.value, rev: r.rev } : { texto: null, rev: 0 });
      return r && { value: r.value };
    },
    /* Devuelve { fusionado } cuando tuvo que juntar lo propio con lo que había
       escrito otro: el CRM lo adopta si no hubo cambios nuevos entre medias. */
    set: (clave, value) => enFila(clave, () => escribir(clave, value)),
    /* El CRM avisa que tomó lo último que llegó de afuera (o lo fusionado):
       desde ahí, lo que tiene en memoria desciende de esa versión. */
    adoptado: (clave, texto) => {
      const l = candidatas.get(clave) || [];
      const c = l.find((x) => x.texto === texto);
      if (!c) return;
      bases.set(clave, c);
      candidatas.set(clave, l.filter((x) => x.rev > c.rev));
    },
    delete: (clave) => enFila(clave, async () => {
      const r = await pedir(ruta(clave), { method: "DELETE", headers: { "X-Origen": ORIGEN } });
      if (!r.ok && r.status !== 404) throw new Error(`el servidor no borró (${r.status})`);
      revs.delete(clave);
    }),
  };
}
