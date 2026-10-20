/* ────────────────────────────────────────────────────────────
   Fusión de tres vías del cuaderno
   Ahora escriben en el cuaderno más manos que la pestaña: los agentes, Catch,
   Claude por /mcp. Si una pestaña guardara su versión entera encima, borraría
   lo que el servidor acababa de anotar. Por eso la pestaña guarda "sobre" la
   versión que conoce, y si el servidor ya va en otra, se juntan las dos:

     base  — la versión de la que partió la pestaña
     mia   — lo que la pestaña quiere guardar
     suya  — lo que hay hoy en el servidor

   La regla es la de siempre en estos casos: lo que sólo cambió un lado se
   toma de ese lado; lo que cambiaron los dos se baja un nivel (ficha por
   ficha, propiedad por propiedad); y si chocan en el mismo valor, gana la
   pestaña, que es la persona que está mirando.

   Las listas de fichas (todo lo que tiene `id`) se juntan por id: lo creado
   en un lado se suma, lo borrado en un lado se quita. Este archivo no toca
   la red ni el navegador: lo usan src/nube.js y las pruebas.
   ──────────────────────────────────────────────────────────── */

const igual = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
const esObjeto = (x) => x != null && typeof x === "object" && !Array.isArray(x);
const esFicha = (x) => esObjeto(x) && typeof x.id === "string" && x.id !== "";
const listaDeFichas = (...ls) => ls.every((l) => l === undefined || Array.isArray(l))
  && ls.some((l) => Array.isArray(l) && l.length)
  && ls.every((l) => !l || l.every(esFicha));
const porId = (l) => new Map((l || []).map((x) => [x.id, x]));
/* El orden de lo que ya estaba en la base: lo que un lado agregó o quitó no
   cuenta como haberlo reordenado. */
const orden = (l, enBase) => (l || []).filter((x) => enBase.has(x.id)).map((x) => x.id).join("\u0000");

function fusionarLista(base, mia, suya) {
  const b = porId(base), m = porId(mia), s = porId(suya);
  const elegir = (id) => {
    const enB = b.has(id), enM = m.has(id), enS = s.has(id);
    if (!enB) return enM && enS ? fusionar(undefined, m.get(id), s.get(id)) : enM ? m.get(id) : s.get(id);
    /* Borrado en un lado: se borra, aunque el otro lo haya cambiado. Lo que
       se borra en la app pasa antes por la papelera, así que no se pierde. */
    if (!enM || !enS) return undefined;
    return fusionar(b.get(id), m.get(id), s.get(id));
  };

  /* El orden importa en algunas listas (la prioridad de los agentes). Si
     sólo la pestaña lo cambió, manda el suyo; si no, el del servidor. Lo
     nuevo de un lado va adelante, que es donde viven las fichas recientes. */
  const ordenMio = orden(mia, b) !== orden(base, b) && orden(suya, b) === orden(base, b);
  const principal = ordenMio ? mia : suya;
  const otro = ordenMio ? suya : mia;
  const enPrincipal = new Set((principal || []).map((x) => x.id));
  const nuevosOtro = (otro || []).filter((x) => !enPrincipal.has(x.id) && !b.has(x.id)).map((x) => x.id);
  const ids = [...nuevosOtro, ...(principal || []).map((x) => x.id)];

  const out = [];
  const vistosExt = new Set();
  for (const id of ids) {
    const x = elegir(id);
    if (x === undefined) continue;
    /* Un mismo mensaje pudo entrar por los dos lados a la vez (la pestaña lo
       trajo del puente y el servidor lo recibió del webhook) con ids
       distintos. El identificador externo lo delata. */
    if (x.ext) { if (vistosExt.has(x.ext)) continue; vistosExt.add(x.ext); }
    out.push(x);
  }
  return out;
}

export function fusionar(base, mia, suya) {
  if (igual(mia, base)) return suya;
  if (igual(suya, base)) return mia;
  if (igual(mia, suya)) return mia;
  if (listaDeFichas(base, mia, suya)) return fusionarLista(base, mia, suya);
  if (esObjeto(mia) && esObjeto(suya)) {
    const b = esObjeto(base) ? base : {};
    const out = {};
    for (const k of new Set([...Object.keys(mia), ...Object.keys(suya), ...Object.keys(b)])) {
      const v = fusionar(b[k], mia[k], suya[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  return mia;
}

/* Lo mismo, con los textos tal como viajan. Si la base no se puede leer,
   no hay de dónde saber qué cambió cada lado: se junta como si todo fuera
   nuevo en los dos, que conserva las fichas de ambos. */
export function fusionarTextos(baseTxt, miaTxt, suyaTxt) {
  let base;
  try { base = baseTxt ? JSON.parse(baseTxt) : undefined; } catch (_) { base = undefined; }
  return JSON.stringify(fusionar(base, JSON.parse(miaTxt), JSON.parse(suyaTxt)));
}
