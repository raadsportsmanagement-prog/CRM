/* ────────────────────────────────────────────────────────────
   Anuncios: los leads de Meta y de Google Ads

   Un anuncio con formulario recoge gente mientras tú duermes, y esa gente se
   queda dentro de Meta o de Google hasta que alguien la saca. Los dos borran
   lo que nadie recogió —Meta a los 90 días, Google a los 30—, así que un CRM
   que no los consulte no es que muestre los leads tarde: es que los pierde.

   Esta es la mitad que vive en el navegador. La otra está en `tracker/`, el
   mismo Worker que ya medía los correos, y la razón de que exista es la única
   que importa aquí: el token con el que se le habla a Meta o a Google vale por
   la cuenta entera —leer tus leads, gastar tu presupuesto, escribirle a quien
   sea— y no puede estar en una página web. Google además ni lo permite: su API
   no habilita CORS y la llamada ni siquiera sale del navegador.

   Así que el CRM nunca ve un token. Le pide las cosas al puente con la misma
   clave del medidor, y el puente es el único que habla con Meta y con Google.

   Lo que sí conviene saber: esa clave está guardada en este navegador, junto
   al resto del cuaderno. Quien se siente frente a tu CRM abierto puede pedirle
   cosas al puente. La diferencia con guardar el token es que sólo puede pedir
   lo que el puente ofrece, y que se le corta el paso cambiando una clave.
   ──────────────────────────────────────────────────────────── */

/* Cómo se llaman estas fuentes dentro del CRM. Tienen que ser exactamente los
   textos de LEAD_SOURCE: si no, la ficha guardaría una fuente que el
   desplegable no ofrece y el campo se vería vacío al abrirlo. */
export const FUENTE_META = "Meta Lead Ads";
export const FUENTE_GOOGLE = "Google Lead Form";

/* ────────────────────────────────────────────────────────────
   Hablar con el puente
   ──────────────────────────────────────────────────────────── */

async function pedir(base, clave, ruta, params = {}, opciones = {}) {
  const raiz = String(base || "").trim().replace(/\/+$/, "");
  if (!raiz) throw new Error("Falta la dirección del puente. Pégala en Conexiones.");
  if (!clave) throw new Error("Falta la clave del puente. Es la misma que guardaste con `wrangler secret put CLAVE`.");

  const url = `${raiz}${ruta}?${new URLSearchParams({ ...params, clave })}`;
  let r;
  try {
    r = await fetch(url, { cache: "no-store", ...opciones });
  } catch (_) {
    /* fetch sólo falla así cuando no hubo respuesta: dirección mal escrita, sin
       internet, o el Worker sin publicar. El mensaje del navegador para esto es
       "Failed to fetch", que no le dice nada a nadie. */
    throw new Error("No se pudo hablar con el puente. Revisa la dirección, o si el servicio está publicado.");
  }

  if (r.status === 401) throw new Error("El puente rechazó la clave. Tiene que ser la misma que guardaste con `wrangler secret put CLAVE`.");

  let data = null;
  try { data = await r.json(); } catch (_) {}
  if (!r.ok) throw new Error((data && data.error) || `El puente respondió con un error: HTTP ${r.status}`);
  return data || {};
}

/* Qué hay enchufado del otro lado. Se pregunta en vez de suponerlo: la mitad
   de los problemas de esto son un secreto que se quedó sin poner, y adivinarlo
   desde aquí sería inventar. */
export const probarPuente = ({ base, clave }) => pedir(base, clave, "/puente/salud");

/* ── Enviar un WhatsApp de verdad ──
   Va por POST porque el mensaje lleva texto de por medio y eso no cabe con
   dignidad en una dirección. */
export const enviarWhatsApp = ({ base, clave, a, texto, plantilla, idioma, variables, imagen }) =>
  pedir(base, clave, "/wa/enviar", {}, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ a, texto, plantilla, idioma, variables, imagen }),
  });

/* La imagen del encabezado de una plantilla. Queda guardada en el puente, que
   la entrega a Meta al revisarla y en cada envío. Devuelve {id, url}. */
export const subirImagenWa = ({ base, clave, archivo }) =>
  pedir(base, clave, "/wa/imagen", {}, {
    method: "POST",
    headers: { "Content-Type": archivo.type },
    body: archivo,
  });

/* Las plantillas que Meta ya aprobó, para enlazarlas a una del CRM. */
export const traerPlantillasWa = ({ base, clave }) => pedir(base, clave, "/wa/plantillas");

/* Crea una plantilla en Meta y la deja en revisión. Lo que contesta es su
   estado de salida —casi siempre PENDING—; la aprobación llega después y se
   lee con traerPlantillasWa. */
export const crearPlantillaWa = ({ base, clave, plantilla }) =>
  pedir(base, clave, "/wa/plantillas/crear", {}, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(plantilla),
  });

/* Lo que te escribieron por WhatsApp desde una marca. La marca es la hora del
   puente, no la de este computador: así un reloj atrasado aquí no hace perder
   ni repetir nada. */
export const traerWhatsApp = ({ base, clave, desde }) =>
  pedir(base, clave, "/wa/mensajes", { desde: String(Number(desde) || 0) });

/* ────────────────────────────────────────────────────────────
   Traer los leads
   ──────────────────────────────────────────────────────────── */

/* Las dos plataformas se piden por separado y fallan por separado. Que a
   Google se le haya caducado el permiso no puede dejar sin traer los leads de
   Meta: cada uno que falle se cuenta como una nota, y lo que sí llegó entra. */
export async function traerLeads({ base, clave, meta, google, desde, dias = 30 }) {
  const leads = [], notas = [];
  if (!meta && !google) return { leads, notas: ["No hay ninguna plataforma de anuncios encendida."] };

  if (meta) {
    try {
      const r = await pedir(base, clave, "/meta/leads", { desde: String(marcaMs(desde)) });
      leads.push(...(Array.isArray(r.leads) ? r.leads : []));
      if (r.aviso) notas.push(`Meta: ${r.aviso}`);
      /* Callar un tope sería lo peor que puede hacer esto: "0 leads nuevos"
         sobre una lectura incompleta se lee como "no llegó nadie". */
      if (r.truncado) notas.push("Meta tenía más leads de los que caben en una pasada; vuelve a traerlos para terminar.");
    } catch (e) {
      notas.push(`Meta: ${(e && e.message) || String(e)}`);
    }
  }

  if (google) {
    try {
      const r = await pedir(base, clave, "/gads/leads", { dias: String(dias) });
      leads.push(...(Array.isArray(r.leads) ? r.leads : []));
    } catch (e) {
      notas.push(`Google Ads: ${(e && e.message) || String(e)}`);
    }
  }

  const limpias = leads.map((l) => ({ ...l, at: aIso(l.at) }));
  limpias.sort((a, b) => (a.at < b.at ? -1 : 1));
  return { leads: limpias, notas };
}

/* Métricas de campaña. Sirven para una sola pregunta —cuánto costó cada lead—
   y por eso se pide el gasto junto al número de leads y no por separado. */
export async function traerCampanas({ base, clave, meta, google, dias = 30 }) {
  const campanas = [], notas = [];
  const pedirDe = async (ruta, plataforma, nombre) => {
    try {
      const r = await pedir(base, clave, ruta, { dias: String(dias) });
      campanas.push(...(Array.isArray(r.campanas) ? r.campanas : []).map((c) => ({ ...c, plataforma })));
    } catch (e) {
      notas.push(`${nombre}: ${(e && e.message) || String(e)}`);
    }
  };
  if (meta) await pedirDe("/meta/campanas", "meta", "Meta");
  if (google) await pedirDe("/gads/campanas", "google", "Google Ads");
  campanas.sort((a, b) => (b.gasto || 0) - (a.gasto || 0));
  return { campanas, notas };
}

/* Las tres fuentes fechan distinto: Meta manda "2026-08-25T14:02:00+0000",
   Google manda "2026-08-26 09:14:00" sin decir en qué zona, y el resto del CRM
   escribe ISO con Z. Se unifica aquí, y no en cada pantalla, porque el CRM
   compara fechas como texto en varios sitios —ordenar el historial, decidir si
   una actividad es más nueva que la última conocida— y ahí dos formatos del
   mismo instante no se comparan bien.

   Con lo de Google se acepta un desfase: al no venir la zona, se lee como la
   de este computador. Fingir una exacta sería inventarse una hora que no se
   sabe, y para lo que sirve la fecha de un lead —ordenarlo y saber de qué día
   es— unas horas no cambian nada. */
function aIso(v) {
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString();
}

/* El puente filtra por fecha en milisegundos. Se pide con un minuto de solape
   porque el reloj de Meta y el de este computador no son el mismo, y un lead
   entrado justo en el borde se perdería para siempre; el duplicado, en cambio,
   lo ataja después la comparación por identificador. */
function marcaMs(desde) {
  const t = desde ? new Date(desde).getTime() : 0;
  return Number.isFinite(t) && t > 0 ? Math.max(0, t - 60_000) : 0;
}

/* ────────────────────────────────────────────────────────────
   De lead a ficha del CRM
   ──────────────────────────────────────────────────────────── */

const limpio = (v) => String(v ?? "").trim();

/* Meta y Google devuelven a veces el nombre entero en un solo campo y a veces
   partido en dos. Si viene entero se parte por el primer espacio: la primera
   palabra al nombre y el resto al apellido. Es una regla tonta y falla con los
   nombres compuestos —"María José Ruiz" queda como María / José Ruiz—, pero
   falla de una forma que se ve y se corrige en la ficha en dos segundos.
   Adivinar apellidos compuestos falla de una forma que nadie nota. */
export function partirNombre(campos) {
  const nombre = limpio(campos.nombre), apellido = limpio(campos.apellido);
  if (nombre || apellido) return { nombre, apellido };
  const entero = limpio(campos.nombre_completo);
  if (!entero) return { nombre: "", apellido: "" };
  const i = entero.indexOf(" ");
  return i < 0 ? { nombre: entero, apellido: "" } : { nombre: entero.slice(0, i), apellido: entero.slice(i + 1).trim() };
}

/* Lo que el CRM guarda de cada lead en la ficha. Los campos que la ficha no
   tiene no se tiran: van al texto de la actividad, más abajo, porque un
   formulario puede preguntar "¿qué deporte practica tu hijo?" y ésa suele ser
   la única frase útil de todo el lead. */
export function leadAProps(lead, destino) {
  const c = lead.campos || {};
  const { nombre, apellido } = partirNombre(c);
  const comun = {
    phone: limpio(c.telefono),
    email: limpio(c.correo),
    leadSource: lead.fuente || "",
    leadStatus: "Nuevo",
    campaign: limpio(lead.campana),
    createdAt: lead.at || new Date().toISOString(),
    lastActivityAt: lead.at || new Date().toISOString(),
  };
  if (destino === "company") {
    return {
      ...comun,
      /* Una empresa sin nombre no se puede listar. Si el formulario no lo
         preguntó, se usa el de la persona antes que dejar la ficha muda. */
      name: limpio(c.empresa) || [nombre, apellido].filter(Boolean).join(" ") || "Sin nombre",
      lastName: apellido,
    };
  }
  return {
    ...comun,
    firstName: nombre || limpio(c.correo) || "Sin nombre",
    lastName: apellido,
    institution: limpio(c.empresa),
  };
}

const ETIQUETAS = {
  nombre_completo: "Nombre", nombre: "Nombre", apellido: "Apellido",
  correo: "Correo", telefono: "Teléfono", ciudad: "Ciudad",
  empresa: "Empresa", cargo: "Cargo", region: "Región", pais: "País",
  codigo_postal: "Código postal",
};

/* El formulario entero, tal como lo llenó la persona, escrito para leerse. Va
   como actividad y no como propiedades sueltas porque un formulario de
   anuncios cambia de una campaña a otra: convertir cada pregunta en una
   columna llenaría el CRM de columnas vacías en un mes. Aquí queda todo, en el
   hilo de esa persona, en su fecha. */
export function leadATexto(lead) {
  const c = lead.campos || {}, extra = lead.extra || {};
  const lineas = [];
  for (const [clave, valor] of Object.entries(c)) {
    if (limpio(valor)) lineas.push(`${ETIQUETAS[clave] || clave}: ${limpio(valor)}`);
  }
  for (const [clave, valor] of Object.entries(extra)) {
    /* Meta entrega las preguntas propias con el nombre técnico que les puso
       quien armó el formulario —"cual_es_tu_deporte"—. Se le quitan los guiones
       bajos y se le sube la primera letra: no es el texto que vio la persona,
       pero se lee. */
    const bonito = String(clave).replace(/[_-]+/g, " ").replace(/^./, (x) => x.toUpperCase());
    if (limpio(valor)) lineas.push(`${bonito}: ${limpio(valor)}`);
  }

  const pie = [];
  if (lead.campana) pie.push(`Campaña: ${lead.campana}`);
  if (lead.anuncio) pie.push(`Anuncio: ${lead.anuncio}`);
  if (lead.formulario) pie.push(`Formulario: ${lead.formulario}`);
  if (lead.plataforma) pie.push(`Plataforma: ${nombrePlataforma(lead.plataforma)}`);
  /* Un lead "orgánico" llegó por el formulario pero sin que nadie pagara por
     él. Distinguirlo importa: mezclarlos hace parecer que el anuncio rinde más
     de lo que rinde. */
  if (lead.organico) pie.push("Llegó sin pauta (orgánico)");

  return [lineas.join("\n"), pie.join(" · ")].filter(Boolean).join("\n\n");
}

export const nombrePlataforma = (p) => (
  { fb: "Facebook", ig: "Instagram", facebook: "Facebook", instagram: "Instagram", google: "Google" }[String(p || "").toLowerCase()] || p || ""
);

/* Un titular corto para el hilo de mensajes. */
export const leadAAsunto = (lead) => {
  const de = lead.formulario || lead.campana;
  return de ? `Lead de ${lead.fuente} · ${de}` : `Lead de ${lead.fuente}`;
};
