/* ────────────────────────────────────────────────────────────
   Drafts: conteos y pronóstico de un roster
   Claude sólo extrae a los jugadores (nube/drafts.js); todo lo que se cuenta
   y se proyecta sale de aquí, con reglas fijas:

   - GS y SR están en su último año: no juegan la temporada siguiente.
   - A un JR le queda 1 temporada más, a un SO 2 y a un FR 3.
   - En NJCAA (dos años) el SO es el último año y al FR le queda 1.

   "Faltan" es cuántos hay que reclutar en esa posición para llegar a esa
   temporada con los mismos jugadores que tiene hoy.
   ──────────────────────────────────────────────────────────── */

export const ANOS = [
  { key: "GS", label: "Graduate" },
  { key: "SR", label: "Senior" },
  { key: "JR", label: "Junior" },
  { key: "SO", label: "Sophomore" },
  { key: "FR", label: "Freshman" },
];

export const GRUPOS = [
  { key: "POR", label: "Porteros", singular: "portero" },
  { key: "DEF", label: "Defensas", singular: "defensa" },
  { key: "MED", label: "Medios", singular: "medio" },
  { key: "DEL", label: "Delanteros", singular: "delantero" },
];

export const DIVISIONES = ["NCAA D1", "NCAA D2", "NCAA D3", "NAIA", "NJCAA"];

/* Cuántas temporadas le quedan después de la actual. null si falta el año. */
export function temporadasRestantes(ano, division) {
  if (division === "NJCAA") return { SO: 0, FR: 1, GS: 0, SR: 0, JR: 0 }[ano] ?? null;
  return { GS: 0, SR: 0, JR: 1, SO: 2, FR: 3 }[ano] ?? null;
}

/* El fútbol universitario se juega en otoño: "2025-26" es la de 2025. Sin
   año en la página, antes de julio todavía cuenta la del otoño pasado. */
export function anoDeTemporada(temporada, hoy = new Date()) {
  const m = String(temporada || "").match(/\b(20\d{2})\b/);
  if (m) return Number(m[1]);
  return hoy.getMonth() >= 6 ? hoy.getFullYear() : hoy.getFullYear() - 1;
}

const HORIZONTE = 3;

export function analizarRoster(draft) {
  const jugadores = draft.jugadores || [];
  const division = draft.division;
  const base = anoDeTemporada(draft.temporada, draft.creadoEn ? new Date(draft.creadoEn) : new Date());
  const temporadas = Array.from({ length: HORIZONTE }, (_, i) => base + i + 1);
  const anos = division === "NJCAA" ? ANOS.filter((a) => a.key === "SO" || a.key === "FR") : ANOS;

  const porAno = Object.fromEntries([...ANOS.map((a) => [a.key, 0]), ["SD", 0]]);
  const matriz = Object.fromEntries([...GRUPOS.map((g) => g.key), "SD"].map((g) => [g, Object.fromEntries([...ANOS.map((a) => [a.key, 0]), ["SD", 0]])]));
  for (const j of jugadores) {
    const a = porAno[j.ano] != null ? j.ano : "SD";
    const g = matriz[j.grupo] ? j.grupo : "SD";
    porAno[a] += 1;
    matriz[g][a] += 1;
  }

  /* Por posición: cuántos hay, cuántos se van al cerrar cada temporada y
     cuántos quedan al arrancar cada una de las siguientes. */
  const forecast = {};
  for (const g of [...GRUPOS.map((x) => x.key), "TOTAL"]) {
    const suyos = jugadores.filter((j) => g === "TOTAL" || j.grupo === g);
    const restantes = suyos.map((j) => temporadasRestantes(j.ano, division)).filter((n) => n != null);
    /* Sin año no se sabe cuándo se va: queda fuera del pronóstico. */
    const actual = restantes.length;
    const quedan = temporadas.map((_, i) => restantes.filter((n) => n >= i + 1).length);
    const salen = temporadas.map((_, i) => restantes.filter((n) => n === i).length);
    const faltan = quedan.map((q) => Math.max(0, actual - q));
    forecast[g] = { actual, quedan, salen, faltan, prioridad: prioridadDe(g, actual, quedan[0]) };
  }

  return { base, temporadas, anos, porAno, matriz, forecast, total: jugadores.length, conclusiones: conclusionesDe({ base, temporadas, porAno, matriz, forecast, jugadores, division }) };
}

/* Alta: se va 40% o más de la posición, o quedan menos de 2 porteros.
   Media: se va entre 25% y 40%. */
function prioridadDe(g, actual, quedanSiguiente) {
  if (g === "TOTAL" || !actual) return g === "POR" && !actual ? "alta" : "baja";
  if (g === "POR" && quedanSiguiente < 2) return "alta";
  const sale = (actual - quedanSiguiente) / actual;
  return sale >= 0.4 ? "alta" : sale >= 0.25 ? "media" : "baja";
}

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const lista = (xs) => xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;

function conclusionesDe({ base, temporadas, porAno, matriz, forecast, jugadores, division }) {
  const out = [];
  const T = forecast.TOTAL;
  const [t1, t2, t3] = temporadas;

  const ultimos = division === "NJCAA" ? porAno.SO + porAno.SR + porAno.GS + porAno.JR : porAno.GS + porAno.SR;
  const detalleUltimos = division === "NJCAA" ? `${porAno.SO} SO` : `${porAno.GS} GS y ${porAno.SR} SR`;
  out.push(`Al cerrar ${base} terminan su elegibilidad ${ultimos} de ${T.actual} jugadores (${pct(ultimos, T.actual)}%): ${detalleUltimos}.`);

  const orden = GRUPOS.map((g) => ({ ...g, f: forecast[g.key] }))
    .filter((g) => g.f.faltan[0] > 0)
    .sort((a, b) => b.f.faltan[0] / (b.f.actual || 1) - a.f.faltan[0] / (a.f.actual || 1) || b.f.faltan[0] - a.f.faltan[0]);
  if (orden.length) {
    out.push(`Necesidad inmediata para ${t1}: ${lista(orden.map((g) => `${g.label.toLowerCase()} (se van ${g.f.faltan[0]} de ${g.f.actual})`))}.`);
  } else {
    out.push(`Para ${t1} no se va nadie con año conocido: el programa no tiene necesidades inmediatas por graduación.`);
  }

  const criticas = GRUPOS.filter((g) => forecast[g.key].prioridad === "alta");
  if (criticas.length) out.push(`Prioridad alta de reclutamiento: ${lista(criticas.map((g) => g.label.toLowerCase()))}.`);

  const por = forecast.POR;
  if (por.actual && por.quedan[0] < 2) out.push(`Porteros: si no reclutan, empezarían ${t1} con ${por.quedan[0]}. Lo normal es tener al menos 2 o 3.`);

  if (division !== "NJCAA") {
    const medio = GRUPOS.map((g) => ({ ...g, f: forecast[g.key] }))
      .filter((g) => g.f.faltan[1] - g.f.faltan[0] > 0)
      .sort((a, b) => (b.f.faltan[1] - b.f.faltan[0]) - (a.f.faltan[1] - a.f.faltan[0]));
    if (medio.length) out.push(`Para ${t2} se suman más salidas (los JR de hoy): ${lista(medio.map((g) => `${g.label.toLowerCase()} +${g.f.faltan[1] - g.f.faltan[0]}`))}. Es la clase a reclutar con un año de anticipación.`);
    const fr = porAno.FR;
    if (T.actual) out.push(`Sin reclutar a nadie, la plantilla pasaría de ${T.actual} a ${T.quedan[0]} en ${t1}, ${T.quedan[1]} en ${t2} y ${T.quedan[2]} en ${t3}. Hoy tiene ${fr} freshmen (${pct(fr, T.actual)}%).`);
  } else if (T.actual) {
    out.push(`En NJCAA la plantilla se renueva casi por mitades: sin reclutar, pasaría de ${T.actual} a ${T.quedan[0]} en ${t1} y a ${T.quedan[1]} en ${t2}.`);
  }

  const veteranos = GRUPOS.filter((g) => {
    const fila = matriz[g.key];
    const tot = Object.values(fila).reduce((a, b) => a + b, 0);
    return tot >= 3 && (fila.GS + fila.SR) / tot >= 0.5;
  });
  if (veteranos.length) out.push(`Posiciones con la mitad o más en su último año: ${lista(veteranos.map((g) => g.label.toLowerCase()))}. Ahí se pierde experiencia de golpe.`);

  const sinAno = porAno.SD;
  const sinPos = jugadores.filter((j) => !GRUPOS.some((g) => g.key === j.grupo)).length;
  if (sinAno || sinPos) out.push(`Revisa ${[sinAno && `${sinAno} sin año`, sinPos && `${sinPos} sin posición`].filter(Boolean).join(" y ")} en la lista de jugadores: no entran en el pronóstico hasta que los completes.`);

  return out;
}
