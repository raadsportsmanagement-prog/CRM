/* ────────────────────────────────────────────────────────────
   Medidor de correo — Cloudflare Worker

   El CRM vive entero en el navegador y eso alcanza para casi todo, pero no
   para esto: una apertura ocurre en el computador de otra persona, horas
   después, con esta pestaña cerrada. Alguien tiene que estar despierto para
   recibir el aviso. Ése es este archivo, y es todo lo que corre fuera de tu
   máquina.

   Hace dos cosas y nada más:

   · /a/<id>.gif   una imagen de 1×1 que va escondida al final del correo.
                   Cuando el programa de correo la pide, es que alguien abrió
                   el mensaje. Devuelve la imagen y anota la apertura.

   · /c/<id>?u=…   el enlace por el que pasan los enlaces del correo. Anota el
                   clic y redirige de inmediato al destino real.

   Y una tercera para el CRM: /eventos, que entrega lo anotado desde una fecha.
   Ésa sí pide clave.

   Lo que NO guarda: ni el correo, ni el nombre, ni el texto del mensaje. Sólo
   el identificador aleatorio del envío, qué pasó, cuándo, el navegador que lo
   pidió y el país. El identificador sólo significa algo dentro de tu CRM: para
   quien mire este servicio es una cadena sin dueño.
   ──────────────────────────────────────────────────────────── */

/* GIF transparente de 1×1, 43 bytes. Se arma una sola vez al arrancar. */
const GIF = Uint8Array.from(
  atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"),
  (c) => c.charCodeAt(0),
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  /* El puente recibe el mensaje de WhatsApp como JSON, y un POST con
     Content-Type: application/json obliga al navegador a preguntar antes.
     Sin esta línea la pregunta se responde que no y el envío ni sale. */
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS },
});

/* Ninguna respuesta de aquí debe quedar en caché. La del pixel sobre todo: si
   el programa de correo se guarda la imagen, la segunda apertura no llega. */
const SIN_CACHE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
};

const enc = new TextEncoder();

/* ── Firma de los enlaces ──
   Sin esto, cualquiera que descubra la dirección de este servicio podría armar
   /c/loquesea?u=<sitio-de-phishing> y repartir un enlace que empieza con tu
   dominio y termina donde él quiera. La firma ata cada enlace a la clave que
   sólo tienen el CRM y este Worker: un destino que no venga de tu CRM no se
   redirige. */
async function firmar(clave, mensaje) {
  const k = await crypto.subtle.importKey("raw", enc.encode(clave), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = await crypto.subtle.sign("HMAC", k, enc.encode(mensaje));
  return [...new Uint8Array(s)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

/* Comparación de tiempo constante: salir en la primera letra distinta le diría
   a quien pruebe firmas cuántas acertó, y con eso se adivina el resto letra a
   letra. Recorrer siempre todo cuesta lo mismo acierte o no. */
function igual(a, b) {
  const x = String(a || ""), y = String(b || "");
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
}

/* ── Anotar un evento ──
   La llave lleva la fecha en milisegundos rellenada a 13 dígitos y por eso el
   orden alfabético de las llaves es el orden del tiempo: pedir "lo posterior a
   tal fecha" es recorrer desde un punto, sin tener que abrir nada.

   El evento entero viaja en la metadata de la llave, no en su valor, y ésa es
   la decisión que hace barato el /eventos: listar devuelve la metadata de una,
   mientras que leer mil valores serían mil peticiones internas —más de las que
   el plan gratuito permite dentro de una sola respuesta. */
function anotar(env, ev) {
  const ms = Date.now();
  const azar = crypto.randomUUID().slice(0, 8);
  const meta = {
    ...ev,
    at: new Date(ms).toISOString(),
    /* La metadata tiene un tope de 1024 bytes: una dirección larga o un
       navegador con media biografía en el nombre lo reventarían y el evento
       se perdería entero. Se recortan aquí, que es donde se sabe. */
    u: ev.u ? String(ev.u).slice(0, 400) : undefined,
    ua: ev.ua ? String(ev.ua).slice(0, 160) : undefined,
  };
  return env.EVENTOS.put(`e:${String(ms).padStart(13, "0")}:${azar}`, "", {
    metadata: meta,
    expirationTtl: 60 * 60 * 24 * 365,
  });
}

const contexto = (req) => ({
  ua: req.headers.get("user-agent") || "",
  pais: (req.cf && req.cf.country) || "",
});

/* ────────────────────────────────────────────────────────────
   El puente: Meta, WhatsApp y Google Ads

   Hasta aquí este Worker sólo medía correos. Lo que sigue es otra cosa, y
   está aquí por una razón concreta: las tres conexiones tienen el mismo
   problema y sólo hay una forma de resolverlo.

   Meta y Google Ads no se dejan llamar desde una página web. No es un
   capricho: para hablar con ellas hace falta un token que vale por tu cuenta
   entera —puede leer tus leads, gastar tu presupuesto, mandar WhatsApp a
   quien sea—, y guardarlo en el navegador es dejarlo escrito en una pared.
   Cualquiera que abra el CRM en ese computador puede sacarlo, y un token
   robado sirve desde cualquier parte del mundo. Google además ni lo permite:
   googleads.googleapis.com no habilita CORS, así que una llamada desde el
   navegador ni siquiera sale.

   Aquí los tokens están en Cloudflare, cifrados, y nunca bajan al navegador.
   El CRM le pide las cosas a este Worker con la misma clave del medidor, y el
   Worker es el único que habla con Meta y con Google.

   Lo que hay que ser honesto en decir: esa clave sí está en el navegador, así
   que quien se siente frente a tu CRM abierto puede pedirle cosas a este
   puente. La diferencia es que sólo puede pedir lo que este archivo ofrece
   —leer leads, leer métricas, mandar un WhatsApp—, sólo desde tu CRM, y le
   puedes cortar el paso cambiando una clave. Con el token suelto no habría
   nada de eso.
   ──────────────────────────────────────────────────────────── */

/* Las versiones se fijan a propósito. Meta retira una versión de la Graph API
   cada dos años y Google Ads cada pocos meses; con "la última" el puente se
   rompería solo un martes cualquiera, sin que nadie hubiera tocado nada. */
const META_V = "v25.0";
const GADS_V = "v25";

/* Un error que el CRM pueda mostrar tal cual, sin que quien lo lea tenga que
   saber qué es un HTTP 400. */
class Aviso extends Error {
  constructor(mensaje, status = 400) { super(mensaje); this.status = status; }
}

/* Los secretos y los identificadores no se ponen en el mismo sitio, y decirlo
   mal manda a la gente a pelearse con el sitio equivocado: un token va cifrado
   con `wrangler secret put`, y un número de cuenta va escrito en wrangler.toml,
   que entra al repositorio porque no es un secreto. */
const falta = (que, { secretos = [], vars = [] }) => {
  const partes = [];
  if (secretos.length) partes.push(`ejecuta ${secretos.map((x) => `wrangler secret put ${x}`).join(" y ")}`);
  if (vars.length) partes.push(`pon ${vars.join(" y ")} en tracker/wrangler.toml`);
  return new Aviso(`Falta configurar ${que} en el puente: ${partes.join("; y ")}.`, 503);
};

/* ── Hablar con una API ajena ──
   Los tres servicios contestan JSON y explican sus errores dentro del JSON, no
   en el código HTTP. Un 400 de Meta con "el token caducó" adentro no sirve de
   nada si sólo se propaga el 400. */
async function pedirJson(url, opciones, quien) {
  let r;
  try {
    r = await fetch(url, opciones);
  } catch (e) {
    throw new Aviso(`No se pudo hablar con ${quien}. Puede ser un corte de red momentáneo.`, 502);
  }
  const texto = await r.text();
  let data = null;
  try { data = texto ? JSON.parse(texto) : null; } catch (_) {}
  if (!r.ok) {
    const e = data && data.error;
    /* Meta guarda la explicación para personas en error_user_msg; message
       suele ser un "Invalid parameter" que no dice cuál. */
    const detalle = (e && (e.error_user_msg || e.message || e.error_description || e.status)) ||
      (data && data.error_description) || `HTTP ${r.status}`;
    throw new Aviso(`${quien}: ${detalle}`, r.status === 401 || r.status === 403 ? 502 : 502);
  }
  return data || {};
}

/* ════════════════════════════════════════════════════════════
   Meta — leads de Facebook e Instagram, y métricas de campaña
   ════════════════════════════════════════════════════════════ */

const graph = (ruta, params, token) => pedirJson(
  `https://graph.facebook.com/${META_V}${ruta}?${new URLSearchParams({ ...params, access_token: token })}`,
  { method: "GET" },
  "Meta",
);

/* Meta entrega cada respuesta del formulario como una lista de pares sueltos
   —"full_name" → ["Ana Ruiz"]— porque los formularios los arma cada anunciante
   y no hay dos iguales. Aquí se traducen los nombres que Meta sí estandariza;
   lo demás no se tira, se manda aparte para que el CRM lo deje escrito en la
   ficha en vez de perderlo. */
/* Los nombres de la izquierda no son sólo los estándar de Meta: cada anunciante
   arma su formulario y el mismo dato llega escrito de varias maneras. El
   teléfono es el caso claro —Meta documenta `phone_number`, pero muchos
   formularios lo mandan como `phone`—, y quedarse con uno solo hace que el
   número se guarde como respuesta suelta en vez de en la ficha: contactos sin
   teléfono, sin WhatsApp posible, y sin forma de reconocer a quien vuelve. */
const META_CAMPOS = {
  full_name: "nombre_completo", nombre_completo: "nombre_completo",
  first_name: "nombre", nombre: "nombre",
  last_name: "apellido", apellido: "apellido", apellidos: "apellido",
  email: "correo", correo: "correo", correo_electronico: "correo", e_mail: "correo",
  phone_number: "telefono", phone: "telefono", telefono: "telefono",
  numero_de_telefono: "telefono", celular: "telefono", whatsapp: "telefono",
  city: "ciudad", ciudad: "ciudad",
  company_name: "empresa", empresa: "empresa", compania: "empresa",
  job_title: "cargo", cargo: "cargo",
  country: "pais", pais: "pais",
  state: "region", province: "region",
  post_code: "codigo_postal", zip_code: "codigo_postal",
};

/* Campos que Meta añade por su cuenta y que no son respuestas de nadie.
   `inbox_url` es un enlace interno al chat, y aparecería en la ficha como una
   pregunta más que el contacto nunca contestó. */
const META_IGNORAR = new Set(["inbox_url", "lead_status", "is_organic"]);

function leerCamposMeta(fieldData) {
  const campos = {}, extra = {};
  for (const f of Array.isArray(fieldData) ? fieldData : []) {
    const valor = String((f.values || [])[0] || "").trim();
    if (!valor) continue;
    const nombre = String(f.name || "").toLowerCase();
    if (META_IGNORAR.has(nombre)) continue;
    const clave = META_CAMPOS[nombre];
    if (clave) campos[clave] = valor;
    else extra[String(f.name || "")] = valor;
  }
  return { campos, extra };
}

/* ── El token de la página ──
   Los formularios y sus leads cuelgan de la página, y para eso Meta exige un
   token de página: el del usuario de sistema, tal cual, responde
   "(#190) This method must be called with a Page Access Token".

   Ese token de página se saca del propio token del usuario, así que no hay que
   guardar un segundo secreto ni volver a pasar por ninguna consola: se pide, se
   guarda un rato y se reusa. Doce horas, no para siempre — no caduca, porque
   viene de uno que tampoco caduca, pero cachearlo eternamente dejaría uno viejo
   en pie si algún día se revoca el de arriba. */
const PAGE_TOKEN = "meta:token-pagina";

async function tokenDePagina(env) {
  /* Si alguien lo puso a mano, manda el suyo. */
  if (env.META_PAGE_TOKEN) return env.META_PAGE_TOKEN;

  const guardado = await env.EVENTOS.get(PAGE_TOKEN);
  if (guardado) return guardado;

  const r = await graph("/me/accounts", { fields: "id,access_token", limit: "100" }, env.META_TOKEN);
  const p = (Array.isArray(r.data) ? r.data : []).find((x) => String(x.id) === String(env.META_PAGE_ID));
  if (!p || !p.access_token) {
    throw new Aviso(
      `El token de Meta no alcanza la página ${env.META_PAGE_ID}. Asígnasela al usuario de sistema en ` +
      "Configuración del negocio → Usuarios del sistema → Asignar activos → Páginas.",
      502,
    );
  }
  await env.EVENTOS.put(PAGE_TOKEN, p.access_token, { expirationTtl: 43200 });
  return p.access_token;
}

async function metaLeads(env, desdeMs) {
  if (!env.META_TOKEN) throw falta("el token de Meta", { secretos: ["META_TOKEN"] });
  if (!env.META_PAGE_ID) throw falta("el id de la página de Facebook", { vars: ["META_PAGE_ID"] });
  const token = await tokenDePagina(env);

  /* Los leads cuelgan de cada formulario, no de la página, así que primero hay
     que saber qué formularios existen. Se piden todos y no sólo los activos:
     una campaña apagada ayer puede tener leads de anteayer sin recoger. */
  const forms = await graph(`/${env.META_PAGE_ID}/leadgen_forms`, { fields: "id,name", limit: "100" }, token);
  const formularios = Array.isArray(forms.data) ? forms.data : [];
  if (!formularios.length) return { leads: [], formularios: 0, aviso: "La página no tiene formularios de Lead Ads." };

  /* Meta borra los leads a los 90 días. No es un detalle menor: si el CRM deja
     de recoger tres meses, lo de antes no se recupera de ninguna manera. */
  const piso = Number.isFinite(desdeMs) && desdeMs > 0
    ? Math.floor(desdeMs / 1000)
    : Math.floor((Date.now() - 90 * 86400000) / 1000);

  /* Los campos del anuncio —de qué campaña vino el lead— sólo los devuelve Meta
     si quien pidió el token puede anunciar en la cuenta publicitaria, además de
     leer la página. Es una autorización aparte, y la mitad de la gente la
     descubre el día que la necesita.

     Meta no contesta a medias: si falta ese permiso tumba la petición entera, y
     te quedarías sin los leads por culpa de una etiqueta. Así que se pide lo
     bueno primero y, si Meta dice que no, se vuelve a pedir lo imprescindible.
     Un lead sin nombre de campaña sirve; una campaña sin leads, no. */
  const CAMPOS_CON_ANUNCIO = "id,created_time,field_data,ad_id,ad_name,campaign_id,campaign_name,platform,is_organic";
  const CAMPOS_ESENCIALES = "id,created_time,field_data";
  let campos = CAMPOS_CON_ANUNCIO;
  let sinCampana = false;

  const leads = [];
  let cortado = false;
  for (const form of formularios) {
    let despues = null, paginas = 0;
    do {
      const pedirLote = (queCampos) => graph(`/${form.id}/leads`, {
        fields: queCampos,
        /* El filtro se lo hace Meta: pedir los 90 días enteros para descartar
           aquí lo viejo gastaría el presupuesto de peticiones en cada barrido. */
        filtering: JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: piso }]),
        limit: "100",
        ...(despues ? { after: despues } : {}),
      }, token);

      let r;
      try {
        r = await pedirLote(campos);
      } catch (e) {
        if (campos === CAMPOS_ESENCIALES) throw e;
        /* Se baja de campos una sola vez y para todo lo que quede: si el token
           no puede leer anuncios, tampoco va a poder en el formulario siguiente. */
        campos = CAMPOS_ESENCIALES;
        sinCampana = true;
        r = await pedirLote(campos);
      }

      for (const l of Array.isArray(r.data) ? r.data : []) {
        const { campos, extra } = leerCamposMeta(l.field_data);
        leads.push({
          ext: `meta:${l.id}`,
          fuente: "Meta Lead Ads",
          at: l.created_time || new Date().toISOString(),
          campana: l.campaign_name || "",
          anuncio: l.ad_name || "",
          plataforma: l.platform || "",
          formulario: form.name || "",
          organico: Boolean(l.is_organic),
          campos, extra,
        });
      }

      despues = (r.paging && r.paging.cursors && r.paging.next) ? r.paging.cursors.after : null;
      paginas++;
      /* Diez páginas por formulario son mil leads. Más que eso en un solo
         barrido revienta el tiempo del Worker; se avisa y el siguiente barrido
         sigue donde quedó, porque el CRM guarda hasta dónde llegó. */
      if (paginas >= 10 && despues) { cortado = true; break; }
    } while (despues);
  }

  leads.sort((a, b) => (a.at < b.at ? -1 : 1));
  return {
    leads,
    formularios: formularios.length,
    truncado: cortado,
    ...(sinCampana ? {
      aviso: "Los leads entraron, pero sin saber de qué campaña vienen: el token no tiene permiso para leer anuncios. " +
        "Dale al usuario de sistema acceso a la cuenta publicitaria y vuelve a generar el token.",
    } : {}),
  };
}

async function metaCampanas(env, dias) {
  const token = env.META_TOKEN;
  if (!token) throw falta("el token de Meta", { secretos: ["META_TOKEN"] });
  if (!env.META_AD_ACCOUNT) throw falta("la cuenta publicitaria de Meta", { vars: ["META_AD_ACCOUNT"] });
  const cuenta = String(env.META_AD_ACCOUNT).startsWith("act_") ? env.META_AD_ACCOUNT : `act_${env.META_AD_ACCOUNT}`;

  const r = await graph(`/${cuenta}/insights`, {
    level: "campaign",
    fields: "campaign_id,campaign_name,impressions,clicks,spend,actions,cost_per_action_type",
    date_preset: dias <= 7 ? "last_7d" : dias <= 14 ? "last_14d" : "last_30d",
    limit: "200",
  }, token);

  /* De todo lo que Meta llama "acción" sólo interesa una: el lead. El resto
     —reproducciones de vídeo, "me gusta", clics en el perfil— infla los
     números sin decir nada del negocio. */
  const leadsDe = (acciones) => {
    const a = (Array.isArray(acciones) ? acciones : []).find((x) => /lead/i.test(String(x.action_type || "")));
    return a ? Number(a.value) || 0 : 0;
  };

  return {
    campanas: (Array.isArray(r.data) ? r.data : []).map((c) => ({
      id: c.campaign_id || "",
      nombre: c.campaign_name || "",
      impresiones: Number(c.impressions) || 0,
      clics: Number(c.clicks) || 0,
      gasto: Number(c.spend) || 0,
      leads: leadsDe(c.actions),
    })),
  };
}

/* ════════════════════════════════════════════════════════════
   WhatsApp Cloud API — enviar de verdad, sin dar el último clic
   ════════════════════════════════════════════════════════════ */

/* Las dos reglas de Meta que hay que conocer antes de usar esto, porque no son
   un detalle técnico sino la forma del canal:

   · La ventana de 24 horas. Escribir texto libre sólo se puede si esa persona
     te escribió a ti en las últimas 24 horas. Fuera de esa ventana Meta
     rechaza el mensaje con el error 131047.

   · Las plantillas. Para iniciar una conversación hay que usar una plantilla
     que Meta aprobó antes, una por una, con un par de días de revisión. Es lo
     que impide que esto se use para escribirle en frío a una lista comprada.

   El CRM intenta texto libre y, si Meta cierra la puerta por la ventana de 24
   horas, lo dice con esas palabras en vez de con un número de error. */
async function whatsappEnviar(env, cuerpo) {
  if (!env.WA_TOKEN) throw falta("el token de WhatsApp", { secretos: ["WA_TOKEN"] });
  if (!env.WA_PHONE_ID) throw falta("el número de WhatsApp", { vars: ["WA_PHONE_ID"] });

  const a = String(cuerpo.a || "").replace(/\D/g, "");
  if (!a) throw new Aviso("Falta el número de destino.");

  /* Las variables llegan de dos formas, según cómo se escribió la plantilla en
     Meta: una lista para las de {{1}}, {{2}}…, y un objeto nombre → valor para
     las de {{nombre}}. Meta no acepta mezclar, así que se respeta lo que venga. */
  const vars = cuerpo.variables;
  const parametros = Array.isArray(vars)
    ? vars.map((v) => ({ type: "text", text: String(v) }))
    : vars && typeof vars === "object"
      ? Object.entries(vars).map(([k, v]) => ({ type: "text", parameter_name: k, text: String(v) }))
      : [];

  /* Una plantilla con imagen en el encabezado la pide en cada envío: lo que
     se mostró al aprobarla era sólo un ejemplo. */
  const componentes = [
    ...(cuerpo.imagen ? [{ type: "header", parameters: [{ type: "image", image: { link: String(cuerpo.imagen) } }] }] : []),
    ...(parametros.length ? [{ type: "body", parameters: parametros }] : []),
  ];
  const mensaje = cuerpo.plantilla
    ? {
        messaging_product: "whatsapp", to: a, type: "template",
        template: {
          name: String(cuerpo.plantilla),
          language: { code: String(cuerpo.idioma || "es") },
          ...(componentes.length ? { components: componentes } : {}),
        },
      }
    : {
        messaging_product: "whatsapp", to: a, type: "text",
        text: { body: String(cuerpo.texto || ""), preview_url: true },
      };

  if (!cuerpo.plantilla && !mensaje.text.body.trim()) throw new Aviso("El mensaje está vacío.");

  try {
    const r = await pedirJson(
      `https://graph.facebook.com/${META_V}/${env.WA_PHONE_ID}/messages`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${env.WA_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify(mensaje),
      },
      "WhatsApp",
    );
    return { id: ((r.messages || [])[0] || {}).id || "", a };
  } catch (e) {
    /* 131047 y 131026 son los dos que le van a pasar a cualquiera, y el texto
       de Meta no explica qué hacer. Aquí sí. */
    const m = String((e && e.message) || "");
    if (/131047|24 hours|24 horas/i.test(m)) {
      throw new Aviso(
        "Esta persona no te ha escrito en las últimas 24 horas, así que Meta no deja mandarle texto libre. " +
        "Usa una plantilla aprobada, o abre el chat con el botón de enlace.",
        409,
      );
    }
    if (/131026|not.*capable|no.*existe/i.test(m)) {
      throw new Aviso("Ese número no tiene WhatsApp, o no puede recibir mensajes de empresas.", 409);
    }
    if (/132001|template.*(does not exist|name)/i.test(m)) {
      throw new Aviso(`Meta no encuentra la plantilla «${cuerpo.plantilla}» en ese idioma. Revisa que esté aprobada y que el idioma coincida.`, 409);
    }
    if (/132000|number of parameters/i.test(m)) {
      throw new Aviso("La plantilla de Meta pide otro número de variables. Vuelve a enlazarla en Plantillas.", 409);
    }
    throw e;
  }
}

/* ── Las plantillas que Meta ya aprobó ──
   El CRM no las puede inventar: cada una se crea y se aprueba en el
   Administrador de WhatsApp. Aquí sólo se leen, con lo justo para enlazarlas
   a una plantilla del CRM: su texto y qué variables pide.

   Sólo se pueden usar desde el CRM las que llevan variables en el cuerpo y
   nada más. Un encabezado con foto o un botón con enlace variable piden datos
   que el CRM no tiene, y mandarlas a medias haría que Meta las rechace una por
   una. Se listan igual, con el motivo, para que no parezca que desaparecieron. */
async function whatsappPlantillas(env) {
  if (!env.WA_TOKEN) throw falta("el token de WhatsApp", { secretos: ["WA_TOKEN"] });
  if (!env.WA_WABA_ID) throw falta("la cuenta de WhatsApp Business", { vars: ["WA_WABA_ID"] });

  const plantillas = [];
  let despues = "";
  for (let paginas = 0; paginas < 5; paginas++) {
    const r = await graph(`/${env.WA_WABA_ID}/message_templates`, {
      fields: "id,name,language,status,category,components,parameter_format,rejected_reason",
      limit: "100",
      ...(despues ? { after: despues } : {}),
    }, env.WA_TOKEN);
    for (const t of r.data || []) plantillas.push(resumirPlantilla(t));
    despues = (r.paging && r.paging.next && r.paging.cursors && r.paging.cursors.after) || "";
    if (!despues) break;
  }
  return { plantillas };
}

function resumirPlantilla(t) {
  const comps = Array.isArray(t.components) ? t.components : [];
  const cuerpo = String((comps.find((c) => c.type === "BODY") || {}).text || "");
  const nombradas = String(t.parameter_format || "").toUpperCase() === "NAMED";
  const marcas = [...cuerpo.matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)].map((m) => m[1]);
  const vars = nombradas
    ? [...new Set(marcas)]
    : [...new Set(marcas)].sort((x, y) => Number(x) - Number(y));

  let motivo = "";
  const cabeza = comps.find((c) => c.type === "HEADER");
  /* Una imagen sí se puede: el CRM guarda cuál va y la manda en cada envío.
     Video y documento no, porque no hay dónde elegirlos. */
  if (cabeza && cabeza.format && cabeza.format !== "TEXT" && cabeza.format !== "IMAGE") motivo = "lleva un encabezado con video o documento";
  else if (cabeza && /\{\{/.test(String(cabeza.text || ""))) motivo = "lleva una variable en el encabezado";
  const botones = (comps.find((c) => c.type === "BUTTONS") || {}).buttons || [];
  if (!motivo && botones.some((b) => /\{\{/.test(String(b.url || "")))) motivo = "lleva un botón con enlace variable";

  return {
    id: t.id,
    nombre: t.name,
    idioma: t.language,
    estado: t.status,
    rechazo: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : "",
    categoria: t.category,
    cuerpo,
    vars,
    formato: nombradas ? "nombrado" : "posicional",
    cabecera: cabeza ? String(cabeza.format || "TEXT") : "",
    encabezado: cabeza && cabeza.format === "TEXT" ? String(cabeza.text || "") : "",
    pie: String((comps.find((c) => c.type === "FOOTER") || {}).text || ""),
    botones: botones.map((b) => ({ tipo: b.type === "URL" ? "URL" : "RESPUESTA", texto: String(b.text || ""), url: String(b.url || "") })),
    motivo,
  };
}

/* ── Crear una plantilla y mandarla a revisión ──
   Meta la revisa por su cuenta —minutos, a veces un día— y el CRM se entera
   preguntando por /wa/plantillas, igual que con las que se crean a mano en
   WhatsApp Manager. Aquí sólo se arma lo que Meta exige y se le entrega.

   Las variables van con nombre ({{nombre}}, {{institucion}}) y no numeradas:
   así son las mismas palabras que usa el CRM y el enlace sale hecho. Meta pide
   un ejemplo por variable para revisarla; los pone el CRM, que sabe qué dato
   va en cada una. */
/* ── Imágenes para el encabezado ──
   Meta pide la imagen dos veces y de dos formas: al revisar la plantilla,
   subida a la app (un "handle"); y en cada envío, como un enlace que pueda
   descargar. Aquí se guarda una vez y sirve para las dos: el CRM la sube,
   queda en el KV, y /wa/imagen/<id> la entrega sin clave porque quien la pide
   es Meta. El id es aleatorio y lo que hay detrás es publicidad. */
const IMG = "img:";
const TIPOS_IMAGEN = ["image/jpeg", "image/png"];

async function guardarImagen(req, env, url) {
  const tipo = (req.headers.get("Content-Type") || "").split(";")[0].trim();
  if (!TIPOS_IMAGEN.includes(tipo)) throw new Aviso("La imagen tiene que ser JPG o PNG.");
  const bytes = await req.arrayBuffer();
  if (!bytes.byteLength) throw new Aviso("La imagen llegó vacía.");
  if (bytes.byteLength > 5 * 1024 * 1024) throw new Aviso("Meta acepta imágenes de hasta 5 MB.");
  const id = crypto.randomUUID().replace(/-/g, "");
  await env.EVENTOS.put(IMG + id, bytes, { metadata: { tipo } });
  return { id, url: `${url.origin}/wa/imagen/${id}` };
}

async function servirImagen(env, id) {
  if (!/^[a-f0-9]{32}$/.test(id)) return new Response("", { status: 404 });
  const r = await env.EVENTOS.getWithMetadata(IMG + id, { type: "arrayBuffer" });
  if (!r.value) return new Response("", { status: 404 });
  return new Response(r.value, {
    headers: { "Content-Type": (r.metadata && r.metadata.tipo) || "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable" },
  });
}

/* La subida "reanudable" de Meta: se abre una sesión en la app y se le
   entrega el archivo entero de una vez. Devuelve el handle que pide la
   plantilla como ejemplo. */
async function subirEjemploMeta(env, id) {
  const r = await env.EVENTOS.getWithMetadata(IMG + id, { type: "arrayBuffer" });
  if (!r.value) throw new Aviso("No encuentro la imagen en el puente. Vuelve a subirla.");
  const tipo = (r.metadata && r.metadata.tipo) || "image/jpeg";
  /* La sesión tiene que abrirse en la app que emitió el token: si es otra,
     Meta la rechaza. Se le pregunta al token de cuál es; META_APP_ID queda
     de respaldo. */
  const app = await pedirJson(`https://graph.facebook.com/${META_V}/app?access_token=${encodeURIComponent(env.WA_TOKEN)}`, {}, "Meta")
    .then((a) => a && a.id, () => null) || env.META_APP_ID;
  if (!app) throw falta("el identificador de la app de Meta", { vars: ["META_APP_ID"] });
  const sesion = await pedirJson(
    `https://graph.facebook.com/${META_V}/${app}/uploads?${new URLSearchParams({
      file_name: `encabezado.${tipo === "image/png" ? "png" : "jpg"}`, file_length: String(r.value.byteLength), file_type: tipo, access_token: env.WA_TOKEN,
    })}`,
    { method: "POST" },
    "Meta (al subir la imagen)",
  );
  const subida = await pedirJson(
    `https://graph.facebook.com/${META_V}/${sesion.id}`,
    { method: "POST", headers: { Authorization: `OAuth ${env.WA_TOKEN}`, file_offset: "0" }, body: r.value },
    "Meta (al subir la imagen)",
  );
  if (!subida.h) throw new Aviso("Meta no devolvió la imagen subida. Prueba otra vez.");
  return subida.h;
}

const NOMBRE_PLANTILLA = /^[a-z0-9_]{1,512}$/;
const VAR_NOMBRADA = /\{\{\s*([a-z0-9_]+)\s*\}\}/g;

async function whatsappCrearPlantilla(env, c) {
  if (conTwilio(env)) {
    throw new Aviso("Con Twilio las plantillas se crean en su Content Template Builder; desde el CRM sólo se pueden crear yendo directo por Meta.", 400);
  }
  if (!env.WA_TOKEN) throw falta("el token de WhatsApp", { secretos: ["WA_TOKEN"] });
  if (!env.WA_WABA_ID) throw falta("la cuenta de WhatsApp Business", { vars: ["WA_WABA_ID"] });

  const nombre = String(c.nombre || "").trim();
  if (!NOMBRE_PLANTILLA.test(nombre)) throw new Aviso("El nombre para Meta sólo admite minúsculas, números y guion bajo.");
  const categoria = c.categoria === "UTILITY" ? "UTILITY" : "MARKETING";
  const idioma = String(c.idioma || "es");
  const cuerpo = String(c.cuerpo || "").trim().replace(VAR_NOMBRADA, (m, k) => `{{${k}}}`);
  if (!cuerpo) throw new Aviso("El mensaje está vacío.");
  if (cuerpo.length > 1024) throw new Aviso("Meta acepta hasta 1.024 caracteres en el mensaje.");

  const ejemplos = c.ejemplos && typeof c.ejemplos === "object" ? c.ejemplos : {};
  const vars = [...new Set([...cuerpo.matchAll(VAR_NOMBRADA)].map((m) => m[1]))];
  const sinEjemplo = vars.find((k) => !String(ejemplos[k] || "").trim());
  if (sinEjemplo) throw new Aviso(`Falta un ejemplo para {{${sinEjemplo}}}: Meta lo pide para revisar la plantilla.`);

  const botones = (Array.isArray(c.botones) ? c.botones : []).map((b) => ({
    tipo: b && b.tipo === "URL" ? "URL" : "RESPUESTA",
    texto: String((b && b.texto) || "").trim(),
    url: String((b && b.url) || "").trim(),
  })).filter((b) => b.texto);
  if (botones.length > 3) throw new Aviso("Como mucho tres botones.");
  if (botones.filter((b) => b.tipo === "URL").length > 2) throw new Aviso("Meta acepta como mucho dos botones con enlace.");
  const largo = botones.find((b) => b.texto.length > 25);
  if (largo) throw new Aviso(`El botón «${largo.texto}» pasa de 25 caracteres.`);
  const sinUrl = botones.find((b) => b.tipo === "URL" && !/^https:\/\/\S+$/.test(b.url));
  if (sinUrl) throw new Aviso(`El botón «${sinUrl.texto}» necesita un enlace que empiece por https://.`);

  const componentes = [];
  const encabezado = String(c.encabezado || "").trim();
  if (c.imagen) {
    componentes.push({ type: "HEADER", format: "IMAGE", example: { header_handle: [await subirEjemploMeta(env, String(c.imagen))] } });
  } else if (encabezado) componentes.push({ type: "HEADER", format: "TEXT", text: encabezado });
  componentes.push({
    type: "BODY",
    text: cuerpo,
    ...(vars.length ? { example: { body_text_named_params: vars.map((k) => ({ param_name: k, example: String(ejemplos[k]) })) } } : {}),
  });
  const pie = String(c.pie || "").trim();
  if (pie) componentes.push({ type: "FOOTER", text: pie });
  if (botones.length) {
    componentes.push({
      type: "BUTTONS",
      buttons: botones.map((b) => (b.tipo === "URL" ? { type: "URL", text: b.texto, url: b.url } : { type: "QUICK_REPLY", text: b.texto })),
    });
  }

  const r = await pedirJson(
    `https://graph.facebook.com/${META_V}/${env.WA_WABA_ID}/message_templates`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${env.WA_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: nombre, language: idioma, category: categoria, parameter_format: "NAMED", components: componentes }),
    },
    "Meta",
  );
  return { id: r.id || "", nombre, idioma, estado: r.status || "PENDING", categoria: r.category || categoria };
}

/* ════════════════════════════════════════════════════════════
   WhatsApp — lo que te escriben

   Meta avisa de cada mensaje llamando a /wa/webhook. Ese aviso no puede
   esperar al CRM, que vive en un navegador que a esa hora puede estar
   cerrado: se guarda aquí y el CRM lo recoge con /wa/mensajes cuando abre.

   La puerta de entrada no lleva la clave del CRM —Meta no la tiene—, así que
   se cuida de otra forma: cada aviso viene firmado con el secreto de la app
   (X-Hub-Signature-256), y lo que no venga firmado por Meta no se anota.

   De cada mensaje se guarda lo que hace falta para ponerlo en el hilo: quién,
   cuándo y qué dijo. Las fotos y audios no se descargan —Meta los entrega
   aparte y caducan—; se anota que llegó uno y su pie de foto, si trae.
   ════════════════════════════════════════════════════════════ */

const WA_ULTIMO = "wa:ultimo";

/* La firma de Meta es un HMAC-SHA256 del cuerpo tal como llegó, en hex. */
async function firmaMeta(secreto, cuerpo) {
  const k = await crypto.subtle.importKey("raw", enc.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = await crypto.subtle.sign("HMAC", k, enc.encode(cuerpo));
  return "sha256=" + [...new Uint8Array(s)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function textoDeMensaje(m) {
  const pie = (x) => (x && x.caption ? ` ${x.caption}` : "");
  switch (m.type) {
    case "text": return String((m.text && m.text.body) || "");
    case "button": return String((m.button && m.button.text) || "");
    case "interactive": {
      const i = m.interactive || {};
      return String((i.button_reply && i.button_reply.title) || (i.list_reply && i.list_reply.title) || "[Respuesta]");
    }
    case "image": return `[Foto]${pie(m.image)}`;
    case "video": return `[Video]${pie(m.video)}`;
    case "document": return `[Documento] ${(m.document && (m.document.filename || m.document.caption)) || ""}`.trim();
    case "audio": return "[Audio]";
    case "sticker": return "[Sticker]";
    case "location": {
      const l = m.location || {};
      return `[Ubicación] ${[l.name, l.address].filter(Boolean).join(", ")} ${l.latitude},${l.longitude}`.trim();
    }
    case "contacts": return "[Contacto compartido]";
    default: return `[${m.type || "Mensaje"}]`;
  }
}

async function whatsappWebhook(req, env, ctx) {
  if (req.method === "GET") {
    /* La verificación de Meta: al guardar la dirección del webhook, Meta la
       llama con el token que escribiste allá y espera que le devuelvan el
       desafío tal cual. */
    const u = new URL(req.url);
    if (!env.WA_VERIFY_TOKEN) return new Response("Falta WA_VERIFY_TOKEN en el puente.", { status: 503 });
    if (u.searchParams.get("hub.mode") === "subscribe" && igual(u.searchParams.get("hub.verify_token") || "", env.WA_VERIFY_TOKEN)) {
      return new Response(u.searchParams.get("hub.challenge") || "", { headers: { "Content-Type": "text/plain", ...SIN_CACHE } });
    }
    return new Response("Token de verificación incorrecto.", { status: 403 });
  }

  if (!env.WA_APP_SECRET) return new Response("Falta WA_APP_SECRET en el puente.", { status: 503 });
  const crudo = await req.text();
  if (!igual(req.headers.get("x-hub-signature-256") || "", await firmaMeta(env.WA_APP_SECRET, crudo))) {
    return new Response("Firma inválida.", { status: 401 });
  }

  let aviso = null;
  try { aviso = JSON.parse(crudo); } catch (_) { return new Response("", { status: 400 }); }

  const mensajes = [];
  for (const entrada of aviso.entry || []) {
    for (const cambio of entrada.changes || []) {
      const v = cambio.value || {};
      /* Sólo lo que llega a nuestro número. Los avisos de entregado y leído
         también pasan por aquí, pero guardarlos gastaría tres escrituras por
         cada mensaje que sale, y el plan gratuito da mil al día. */
      if (env.WA_PHONE_ID && v.metadata && v.metadata.phone_number_id && v.metadata.phone_number_id !== env.WA_PHONE_ID) continue;
      const nombres = new Map((v.contacts || []).map((c) => [c.wa_id, (c.profile && c.profile.name) || ""]));
      for (const m of v.messages || []) {
        if (m.type === "reaction" || !m.id || !m.from) continue;
        mensajes.push({
          ext: m.id,
          de: m.from,
          nombre: nombres.get(m.from) || "",
          at: new Date(Number(m.timestamp) * 1000 || Date.now()).toISOString(),
          tipo: m.type,
          texto: textoDeMensaje(m).slice(0, 4000),
        });
      }
    }
  }

  guardarRecibidos(env, ctx, mensajes);
  return new Response("", { status: 200 });
}

/* Se contesta al aviso ya y se escribe después: si tarda, quien avisa (Meta o
   Twilio) lo da por fallido y lo repite, y un mismo mensaje entraría varias
   veces. */
function guardarRecibidos(env, ctx, mensajes) {
  if (!mensajes.length) return;
  ctx.waitUntil((async () => {
    const ms = Date.now();
    await Promise.all(mensajes.map((m, i) => env.EVENTOS.put(
      `wm:${String(ms).padStart(13, "0")}:${i}:${crypto.randomUUID().slice(0, 6)}`,
      JSON.stringify(m),
      { expirationTtl: 60 * 60 * 24 * 60 },
    )));
    await env.EVENTOS.put(WA_ULTIMO, String(ms));
  })());
}

/* Lo recibido desde una fecha, para el CRM. Antes de listar se mira la marca
   de lo último que entró: el CRM pregunta cada minuto, y casi siempre la
   respuesta es "nada nuevo". Leer una llave cuesta poco; listar, en el plan
   gratuito, sólo se puede mil veces al día. */
async function whatsappRecibidos(env, desde) {
  const ultimo = Number(await env.EVENTOS.get(WA_ULTIMO)) || 0;
  if (!ultimo || ultimo <= desde) return { mensajes: [], truncado: false };

  /* El "~" va después de cualquier letra o número: así lo que entró en el
     mismo milisegundo de la marca, que ya se entregó, queda fuera del corte. */
  const corte = `wm:${String(desde > 0 ? desde : 0).padStart(13, "0")}:~`;
  const llaves = [];
  let cursor = null, paginas = 0;
  do {
    const r = await env.EVENTOS.list({ prefix: "wm:", limit: 1000, ...(cursor ? { cursor } : {}) });
    for (const k of r.keys) if (k.name > corte) llaves.push(k.name);
    cursor = r.list_complete ? null : r.cursor;
    paginas++;
  } while (cursor && paginas < 5);

  /* Cada mensaje es una lectura aparte. Se entregan de a 200, los más
     viejos primero: el CRM vuelve a pedir desde el último y termina. */
  llaves.sort();
  const tanda = llaves.slice(0, 200);
  const valores = await Promise.all(tanda.map((k) => env.EVENTOS.get(k)));
  const mensajes = [];
  tanda.forEach((k, i) => {
    try { if (valores[i]) mensajes.push({ ...JSON.parse(valores[i]), recibido: Number(k.split(":")[1]) }); } catch (_) {}
  });
  return { mensajes, truncado: llaves.length > tanda.length };
}

/* ════════════════════════════════════════════════════════════
   WhatsApp por Twilio — el mismo canal, otro intermediario

   Twilio no es otro WhatsApp: por debajo sigue siendo la API de Meta, con sus
   mismas dos reglas (la ventana de 24 horas y las plantillas aprobadas). Lo
   que cambia es quién pone el número —uno virtual de Twilio, sin chip— y por
   dónde pasa todo. Por eso aquí se contesta exactamente lo mismo que en la
   parte de Meta, y el CRM no sabe ni le importa por cuál de los dos salió.

   Basta con escribir TWILIO_ACCOUNT_SID en wrangler.toml para que WhatsApp
   salga por Twilio. Sin él, sigue saliendo por Meta como antes.
   ════════════════════════════════════════════════════════════ */

const conTwilio = (env) => Boolean(env.TWILIO_ACCOUNT_SID);

/* El número de Twilio se escribe como en el teléfono, con o sin "+", y aquí
   se le pone el prefijo que Twilio exige para saber que es WhatsApp y no SMS. */
const twNumero = (v) => `whatsapp:+${String(v || "").replace(/\D/g, "")}`;

/* Twilio, a diferencia de Meta, no explica sus errores bajo "error": los pone
   en la raíz, con un número propio. Se conserva el número porque es lo único
   estable para traducirlo; el texto en inglés cambia cuando Twilio quiere. */
async function twilio(env, url, { method = "GET", form } = {}) {
  if (!env.TWILIO_AUTH_TOKEN) throw falta("el token de Twilio", { secretos: ["TWILIO_AUTH_TOKEN"] });
  let r;
  try {
    r = await fetch(url, {
      method,
      headers: {
        Authorization: `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`,
        ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      ...(form ? { body: new URLSearchParams(form) } : {}),
    });
  } catch (_) {
    throw new Aviso("No se pudo hablar con Twilio. Puede ser un corte de red momentáneo.", 502);
  }
  let data = null;
  try { data = await r.json(); } catch (_) {}
  if (!r.ok) {
    if (r.status === 401 || (data && data.code === 20003)) {
      throw new Aviso("Twilio no acepta las credenciales. Revisa TWILIO_ACCOUNT_SID y TWILIO_AUTH_TOKEN.", 502);
    }
    const e = new Aviso(`Twilio: ${(data && data.message) || `HTTP ${r.status}`}`, 502);
    e.codigo = data && data.code;
    throw e;
  }
  return data || {};
}

const twApi = (env, resto) => `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}${resto}`;

/* Los errores que le van a pasar a cualquiera, dichos con palabras. Twilio
   los entrega de dos formas: algunos al pedir el envío, y la mayoría —los que
   dependen de Meta— un segundo después, en el estado del mensaje. */
function twTraducir(codigo, plantilla) {
  switch (Number(codigo)) {
    case 63016:
      return new Aviso(
        "Esta persona no te ha escrito en las últimas 24 horas, así que WhatsApp no deja mandarle texto libre. " +
        "Usa una plantilla aprobada, o abre el chat con el botón de enlace.", 409);
    case 63003: case 63024: case 21211: case 21614:
      return new Aviso("Ese número no tiene WhatsApp, o no puede recibir mensajes de empresas.", 409);
    case 63027: case 21655:
      return new Aviso(`Twilio no encuentra la plantilla «${plantilla}» en ese idioma, o Meta todavía no la aprueba.`, 409);
    case 63028: case 21656:
      return new Aviso("La plantilla de Twilio pide otro número de variables. Vuelve a enlazarla en Plantillas.", 409);
    case 63049:
      return new Aviso(
        "Meta decidió no entregarle este mensaje de marketing. Lo hace cuando esa persona ya recibió muchos " +
        "de distintas empresas hace poco; no es un error tuyo y no conviene reintentar enseguida.", 409);
    case 63007:
      return new Aviso("Twilio no tiene WhatsApp activado en el número de TWILIO_WA_FROM. Revisa que sea el remitente aprobado.", 503);
    case 63018:
      return new Aviso("Se superó el límite de envíos por segundo de WhatsApp. Espera un momento y sigue.", 429);
    default:
      return null;
  }
}

/* El CRM conoce las plantillas por nombre e idioma, como en Meta; Twilio las
   envía por su identificador (HX…). La traducción se guarda unos minutos en
   memoria para que un envío masivo no le pregunte a Twilio por la lista entera
   antes de cada mensaje. */
let twCache = { at: 0, lista: [] };

async function twContenidos(env, fresco = false) {
  if (!fresco && Date.now() - twCache.at < 10 * 60 * 1000) return twCache.lista;
  const lista = [];
  let url = "https://content.twilio.com/v1/ContentAndApprovals?PageSize=500";
  for (let paginas = 0; url && paginas < 5; paginas++) {
    const r = await twilio(env, url);
    lista.push(...(r.contents || []));
    url = (r.meta && r.meta.next_page_url) || "";
  }
  twCache = { at: Date.now(), lista };
  return lista;
}

async function twilioEnviar(env, cuerpo) {
  if (!env.TWILIO_WA_FROM) throw falta("el número remitente de Twilio", { vars: ["TWILIO_WA_FROM"] });

  const a = String(cuerpo.a || "").replace(/\D/g, "");
  if (!a) throw new Aviso("Falta el número de destino.");

  const form = { From: twNumero(env.TWILIO_WA_FROM), To: twNumero(a) };

  if (cuerpo.plantilla) {
    const nombre = String(cuerpo.plantilla);
    const idioma = String(cuerpo.idioma || "es");
    let sid = /^HX[0-9a-f]{32}$/i.test(nombre) ? nombre : "";
    if (!sid) {
      const buscar = (l) => l.find((c) => c.friendly_name === nombre && (c.language || "es") === idioma);
      /* Si no está, puede que la plantilla sea de hace un minuto: se vuelve a
         preguntar una vez antes de decir que no existe. */
      const c = buscar(await twContenidos(env)) || buscar(await twContenidos(env, true));
      if (!c) throw twTraducir(63027, nombre);
      sid = c.sid;
    }
    form.ContentSid = sid;

    /* Twilio numera las variables {{1}}, {{2}}… y las recibe como un objeto
       con esos números de llave. La lista del CRM viene en ese mismo orden. */
    const vars = cuerpo.variables;
    const valores = Array.isArray(vars)
      ? Object.fromEntries(vars.map((v, i) => [String(i + 1), String(v)]))
      : vars && typeof vars === "object"
        ? Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, String(v)]))
        : {};
    if (Object.keys(valores).length) form.ContentVariables = JSON.stringify(valores);
  } else {
    form.Body = String(cuerpo.texto || "");
    if (!form.Body.trim()) throw new Aviso("El mensaje está vacío.");
  }

  let m;
  try {
    m = await twilio(env, twApi(env, "/Messages.json"), { method: "POST", form });
  } catch (e) {
    throw twTraducir(e && e.codigo, cuerpo.plantilla) || e;
  }

  /* Twilio acepta el mensaje al instante y lo entrega después. Los rechazos
     de Meta —la ventana de 24 horas, el número sin WhatsApp— llegan en ese
     después, casi siempre antes de dos segundos. Se espera ese rato para que
     el CRM marque el envío como fallido con la razón, en vez de como enviado. */
  for (let i = 0; i < 4 && /^(accepted|queued|sending)$/.test(m.status || ""); i++) {
    await new Promise((r) => setTimeout(r, 600));
    try { m = await twilio(env, twApi(env, `/Messages/${m.sid}.json`)); } catch (_) { break; }
  }
  if (m.status === "failed" || m.status === "undelivered") {
    throw twTraducir(m.error_code, cuerpo.plantilla) ||
      new Aviso(`Twilio no pudo entregarlo (error ${m.error_code || "sin número"}): ${m.error_message || "sin detalle"}.`, 409);
  }
  return { id: m.sid || "", a };
}

/* Las plantillas en Twilio se llaman "contenidos" y se aprueban con Meta desde
   la consola de Twilio. Se devuelven con la misma forma que las de Meta para
   que el CRM las enlace igual. */
async function twilioPlantillas(env) {
  const estados = { approved: "APPROVED", pending: "PENDING", received: "PENDING", rejected: "REJECTED", paused: "PAUSED", disabled: "DISABLED" };
  return {
    plantillas: (await twContenidos(env, true)).map((c) => {
      const tipos = c.types || {};
      const principal = Object.values(tipos)[0] || {};
      const cuerpo = String(principal.body || principal.title || "");
      const marcas = (texto) => [...String(texto).matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)].map((m) => m[1]);
      const vars = [...new Set(marcas(cuerpo))];
      const numeradas = vars.every((v) => /^\d+$/.test(v));
      if (numeradas) vars.sort((x, y) => Number(x) - Number(y));

      /* Igual que en Meta: una variable fuera del texto —en la dirección de
         una foto o de un botón— pide un dato que el CRM no tiene. */
      const ap = c.approval_requests || {};
      const estado = String(ap.status || "unsubmitted").toLowerCase();
      let motivo = "";
      if (marcas(JSON.stringify(tipos)).some((v) => !vars.includes(v))) motivo = "lleva una variable fuera del texto";
      else if (!cuerpo) motivo = "no tiene texto";
      else if (estado === "rejected" && ap.rejection_reason) motivo = `Meta la rechazó: ${ap.rejection_reason}`;

      return {
        nombre: c.friendly_name || c.sid,
        idioma: c.language || "es",
        estado: estados[estado] || "SIN ENVIAR A APROBACIÓN",
        categoria: String(ap.category || "").toUpperCase(),
        cuerpo,
        vars,
        formato: numeradas ? "posicional" : "nombrado",
        motivo,
      };
    }),
  };
}

/* ── Lo que te escriben, por Twilio ──
   Twilio avisa de cada mensaje con un POST de formulario a /wa/twilio, firmado
   con el token de la cuenta (X-Twilio-Signature): un HMAC-SHA1, en base64, de
   la dirección exacta seguida de cada campo y su valor, ordenados por nombre.
   Lo que no venga firmado así no se anota. */
async function firmaTwilio(token, url, campos) {
  const texto = url + [...campos].sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)).map(([k, v]) => k + v).join("");
  const k = await crypto.subtle.importKey("raw", enc.encode(token), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const s = await crypto.subtle.sign("HMAC", k, enc.encode(texto));
  return btoa(String.fromCharCode(...new Uint8Array(s)));
}

function textoDeTwilio(f) {
  const n = Number(f.get("NumMedia")) || 0;
  const cuerpo = String(f.get("Body") || "");
  if (f.get("Latitude")) {
    return `[Ubicación] ${[f.get("Label"), f.get("Address")].filter(Boolean).join(", ")} ${f.get("Latitude")},${f.get("Longitude")}`.trim();
  }
  if (f.get("ButtonText")) return String(f.get("ButtonText"));
  if (!n) return cuerpo;
  const tipo = String(f.get("MediaContentType0") || "");
  const que = /^image\//.test(tipo) ? "[Foto]" : /^video\//.test(tipo) ? "[Video]" : /^audio\//.test(tipo) ? "[Audio]" : "[Documento]";
  return `${que} ${cuerpo}`.trim();
}

async function twilioWebhook(req, env, ctx) {
  if (!env.TWILIO_AUTH_TOKEN) return new Response("Falta TWILIO_AUTH_TOKEN en el puente.", { status: 503 });
  let f;
  try { f = await req.formData(); } catch (_) { return new Response("", { status: 400 }); }
  if (!igual(req.headers.get("x-twilio-signature") || "", await firmaTwilio(env.TWILIO_AUTH_TOKEN, req.url, [...f.entries()]))) {
    return new Response("Firma inválida.", { status: 401 });
  }

  /* Twilio responde con un TwiML vacío: "recibido, no contestes nada". Sin
     esto deja una advertencia en la consola por cada mensaje. */
  const listo = new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });

  /* Por esta misma puerta pueden pasar los avisos de entregado y leído si
     alguien los configura en Twilio. No se guardan, por lo mismo que en Meta. */
  const estado = String(f.get("MessageStatus") || f.get("SmsStatus") || "received");
  if (estado !== "received" || !f.get("MessageSid")) return listo;
  if (env.TWILIO_WA_FROM && twNumero(f.get("To")) !== twNumero(env.TWILIO_WA_FROM)) return listo;

  const de = String(f.get("WaId") || f.get("From") || "").replace(/\D/g, "");
  if (!de) return listo;
  guardarRecibidos(env, ctx, [{
    ext: String(f.get("MessageSid")),
    de,
    nombre: String(f.get("ProfileName") || ""),
    at: new Date().toISOString(),
    tipo: String(f.get("MessageType") || (Number(f.get("NumMedia")) ? "media" : "text")),
    texto: textoDeTwilio(f).slice(0, 4000),
  }]);
  return listo;
}

/* ════════════════════════════════════════════════════════════
   Google Ads — leads de los formularios y métricas de campaña
   ════════════════════════════════════════════════════════════ */

/* Google Ads no acepta un token permanente como Meta: hay que canjear un
   "refresh token" por un permiso de una hora cada vez. Conseguir ese refresh
   token exige una vuelta por Google con una dirección de retorno registrada, y
   por eso el puente tiene sus dos rutas /gads/entrar y /gads/vuelta: se abren
   una sola vez, Google devuelve el refresh token aquí y aquí se queda. Nunca
   pasa por el navegador. */

const GADS_REFRESH = "gads:refresh";
const GADS_TOKEN = "gads:token";

const soloDigitos = (v) => String(v || "").replace(/\D/g, "");

function gadsRedirect(url) {
  return `${url.origin}/gads/vuelta`;
}

async function gadsAccessToken(env) {
  if (!env.GADS_CLIENT_ID || !env.GADS_CLIENT_SECRET) {
    throw falta("las credenciales de Google Ads", { secretos: ["GADS_CLIENT_SECRET"], vars: ["GADS_CLIENT_ID"] });
  }
  /* El permiso de una hora se guarda para no pedir uno nuevo en cada llamada:
     Google limita cuántos se pueden pedir al día, y un barrido que consulte
     leads y métricas haría dos por gusto. Se guarda con 5 minutos de margen
     para que nunca se use uno que caduca a mitad de la petición. */
  const guardado = await env.EVENTOS.get(GADS_TOKEN);
  if (guardado) return guardado;

  const refresh = await env.EVENTOS.get(GADS_REFRESH);
  if (!refresh) {
    throw new Aviso(
      "Google Ads todavía no está autorizado. Abre /gads/entrar en el puente para dar el permiso una vez.",
      412,
    );
  }

  const r = await pedirJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GADS_CLIENT_ID,
      client_secret: env.GADS_CLIENT_SECRET,
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  }, "Google");

  const token = r.access_token || "";
  if (!token) throw new Aviso("Google no devolvió el permiso. Vuelve a autorizar en /gads/entrar.", 502);
  const vive = Math.max(60, (Number(r.expires_in) || 3600) - 300);
  await env.EVENTOS.put(GADS_TOKEN, token, { expirationTtl: vive });
  return token;
}

/* GAQL, el idioma de consulta de Google Ads. Se usa `search` y no
   `searchStream` a propósito: el que va en flujo devuelve varios objetos JSON
   pegados que hay que ir armando a mano; éste devuelve una página normal con
   su cursor, que es todo lo que hace falta aquí. */
async function gadsConsulta(env, query) {
  const cid = soloDigitos(env.GADS_CUSTOMER_ID);
  if (!cid) throw falta("el número de cuenta de Google Ads", { vars: ["GADS_CUSTOMER_ID"] });
  const token = await gadsAccessToken(env);

  const cabeceras = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  /* El developer token es la aprobación que Google le da a la aplicación, no a
     la cuenta. Existe un piloto para no necesitarlo, pero hay que solicitarlo
     aparte y no está abierto, así que aquí sigue haciendo falta. */
  if (env.GADS_DEV_TOKEN) cabeceras["developer-token"] = env.GADS_DEV_TOKEN;
  /* Sólo cuando la cuenta cuelga de una cuenta administradora (MCC). Mandarlo
     igual a una cuenta suelta hace que Google conteste que no existe. */
  const mcc = soloDigitos(env.GADS_LOGIN_CUSTOMER_ID);
  if (mcc) cabeceras["login-customer-id"] = mcc;

  const filas = [];
  let pagina = null, vueltas = 0;
  do {
    const r = await pedirJson(
      `https://googleads.googleapis.com/${GADS_V}/customers/${cid}/googleAds:search`,
      { method: "POST", headers: cabeceras, body: JSON.stringify({ query, pageSize: 1000, ...(pagina ? { pageToken: pagina } : {}) }) },
      "Google Ads",
    );
    filas.push(...(Array.isArray(r.results) ? r.results : []));
    pagina = r.nextPageToken || null;
    vueltas++;
  } while (pagina && vueltas < 10);

  return filas;
}

/* Google nombra los campos del formulario con una constante —FULL_NAME,
   PHONE_NUMBER— en vez de con el texto que vio la persona. La traducción es
   fija y está aquí. */
const GADS_CAMPOS = {
  FULL_NAME: "nombre_completo", FIRST_NAME: "nombre", LAST_NAME: "apellido",
  EMAIL: "correo", PHONE_NUMBER: "telefono",
  CITY: "ciudad", COMPANY_NAME: "empresa", JOB_TITLE: "cargo",
  POSTAL_CODE: "codigo_postal", REGION: "region", COUNTRY: "pais",
};

async function gadsLeads(env, dias) {
  /* Google guarda las respuestas de los formularios 30 días y ni un minuto
     más; pedir un rango mayor no devuelve nada más viejo, sólo un error. */
  const rango = dias <= 7 ? "LAST_7_DAYS" : dias <= 14 ? "LAST_14_DAYS" : "LAST_30_DAYS";

  /* Se piden exactamente los cuatro campos que la propia guía de Google enseña
     en su ejemplo, y ni uno más. GAQL rechaza la consulta entera si un campo no
     es seleccionable junto a este recurso —no la devuelve a medias—, así que
     añadir uno "que seguramente vale" es arriesgar los leads de verdad por un
     dato de adorno. El nombre de la campaña se busca aparte, abajo. */
  const filas = await gadsConsulta(env, `
    SELECT
      lead_form_submission_data.id,
      lead_form_submission_data.submission_date_time,
      lead_form_submission_data.lead_form_submission_fields,
      lead_form_submission_data.campaign
    FROM lead_form_submission_data
    WHERE lead_form_submission_data.submission_date_time DURING ${rango}
  `);
  if (!filas.length) return { leads: [] };

  /* El lead trae la campaña como "customers/123/campaigns/456", que no le dice
     nada a nadie. Se traducen los números a nombres con una segunda consulta,
     que es barata y no lleva métricas —así devuelve también las campañas
     apagadas, que igual pudieron dejar leads antes de pararse—. Si esta falla,
     los leads entran igual sin nombre de campaña: valen mucho más que la
     etiqueta. */
  const nombres = new Map();
  try {
    for (const f of await gadsConsulta(env, "SELECT campaign.id, campaign.name FROM campaign")) {
      const c = f.campaign || {};
      if (c.id) nombres.set(String(c.id), c.name || "");
    }
  } catch (_) {}

  const leads = filas.map((f) => {
    const d = f.leadFormSubmissionData || {};
    const campos = {}, extra = {};
    for (const c of Array.isArray(d.leadFormSubmissionFields) ? d.leadFormSubmissionFields : []) {
      const valor = String(c.fieldValue || "").trim();
      if (!valor) continue;
      const clave = GADS_CAMPOS[String(c.fieldType || "")];
      if (clave) campos[clave] = valor;
      else extra[String(c.fieldType || "campo")] = valor;
    }
    return {
      ext: `gads:${d.id || ""}`,
      fuente: "Google Lead Form",
      /* Google entrega "2026-08-20 14:03:11" en la zona de la cuenta, sin
         decir cuál. Se convierte a ISO tal cual y se acepta el desfase: fingir
         una zona horaria sería inventarse una hora exacta que no se sabe. */
      at: String(d.submissionDateTime || "").replace(" ", "T") || new Date().toISOString(),
      campana: nombres.get(String(d.campaign || "").split("/").pop()) || "",
      anuncio: "",
      plataforma: "google",
      formulario: "",
      campos, extra,
    };
  }).filter((l) => l.ext !== "gads:");

  leads.sort((a, b) => (a.at < b.at ? -1 : 1));
  return { leads };
}

async function gadsCampanas(env, dias) {
  const rango = dias <= 7 ? "LAST_7_DAYS" : dias <= 14 ? "LAST_14_DAYS" : "LAST_30_DAYS";
  const filas = await gadsConsulta(env, `
    SELECT campaign.id, campaign.name, campaign.status,
           metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
    FROM campaign
    WHERE segments.date DURING ${rango}
      AND campaign.status != 'REMOVED'
  `);

  /* Google Ads devuelve una fila por campaña y día. Se suman aquí: al CRM le
     interesa "cuánto costó esta campaña", no el desglose diario, y mandar 30
     filas por campaña para que las sume allá sería mover trabajo de sitio. */
  const total = new Map();
  for (const f of filas) {
    const c = f.campaign || {}, m = f.metrics || {};
    const id = String(c.id || "");
    if (!total.has(id)) total.set(id, { id, nombre: c.name || "", estado: c.status || "", impresiones: 0, clics: 0, gasto: 0, leads: 0 });
    const t = total.get(id);
    t.impresiones += Number(m.impressions) || 0;
    t.clics += Number(m.clicks) || 0;
    /* Google cuenta el dinero en millonésimas para no perder centavos en el
       camino. Aquí se vuelve a moneda normal una sola vez. */
    t.gasto += (Number(m.costMicros) || 0) / 1e6;
    t.leads += Number(m.conversions) || 0;
  }

  return { campanas: [...total.values()].map((c) => ({ ...c, gasto: Math.round(c.gasto * 100) / 100, leads: Math.round(c.leads) })) };
}

/* ── La vuelta por Google, una sola vez ──
   El nonce evita que la dirección de retorno quede abierta al mundo: sin él
   cualquiera podría llamar a /gads/vuelta con un código suyo y dejar su cuenta
   conectada a tu puente. Se crea al entrar —que sí pide clave—, dura diez
   minutos y se gasta al usarse. */
async function gadsEntrar(env, url) {
  if (!env.GADS_CLIENT_ID) throw falta("las credenciales de Google Ads", { secretos: ["GADS_CLIENT_SECRET"], vars: ["GADS_CLIENT_ID"] });
  const nonce = crypto.randomUUID();
  await env.EVENTOS.put(`gads:nonce:${nonce}`, "1", { expirationTtl: 600 });
  const destino = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: env.GADS_CLIENT_ID,
    redirect_uri: gadsRedirect(url),
    response_type: "code",
    scope: "https://www.googleapis.com/auth/adwords",
    /* offline + consent es lo que hace que Google entregue un refresh token.
       Sin `prompt=consent` sólo lo manda la primera vez de todas, y quien ya
       hubiera autorizado antes se quedaría sin él sin entender por qué. */
    access_type: "offline",
    prompt: "consent",
    state: nonce,
  })}`;
  return Response.redirect(destino, 302);
}

const pagina = (titulo, cuerpo) => new Response(
  `<!doctype html><meta charset="utf-8"><title>${titulo}</title>` +
  `<div style="font:15px/1.6 system-ui;max-width:34em;margin:12vh auto;padding:0 1.5em;color:#131C1A">` +
  `<h1 style="font-size:1.25em">${titulo}</h1>${cuerpo}</div>`,
  { headers: { "Content-Type": "text/html; charset=utf-8", ...SIN_CACHE } },
);

async function gadsVuelta(env, url) {
  const error = url.searchParams.get("error");
  if (error) return pagina("Google no dio el permiso", `<p>Respondió <b>${error}</b>. Puedes cerrar esta pestaña y volver a intentarlo desde Conexiones.</p>`);

  const nonce = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  if (!code || !nonce) return pagina("Falta algo", "<p>Esta dirección sólo funciona cuando la abre Google al terminar la autorización.</p>");
  if (!(await env.EVENTOS.get(`gads:nonce:${nonce}`))) {
    return pagina("Ese permiso ya caducó", "<p>El enlace de autorización dura diez minutos. Vuelve a empezar desde Conexiones.</p>");
  }
  await env.EVENTOS.delete(`gads:nonce:${nonce}`);

  const r = await pedirJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GADS_CLIENT_ID,
      client_secret: env.GADS_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: gadsRedirect(url),
    }),
  }, "Google");

  if (!r.refresh_token) {
    return pagina("Google no mandó el permiso duradero", "<p>Suele pasar cuando ya habías autorizado antes. Quita el acceso en <b>myaccount.google.com/permissions</b> y vuelve a intentarlo.</p>");
  }
  /* Sin caducidad: un refresh token de Google vive hasta que se revoca. Si
     algún día se revoca, la primera llamada fallará diciendo justo eso. */
  await env.EVENTOS.put(GADS_REFRESH, r.refresh_token);
  await env.EVENTOS.delete(GADS_TOKEN);
  return pagina("Google Ads quedó conectado", "<p>Ya puedes cerrar esta pestaña. En el CRM, vuelve a <b>Conexiones</b> y pulsa <b>Probar</b>.</p>");
}

/* ── Qué hay enchufado ──
   Se responde con síes y noes, nunca con el valor: un token no debe salir de
   aquí ni siquiera recortado. */
async function estadoPuente(env) {
  return {
    ok: true,
    servicio: "puente-crm",
    medicion: true,
    meta: {
      leads: Boolean((env.META_PAGE_TOKEN || env.META_TOKEN) && env.META_PAGE_ID),
      metricas: Boolean(env.META_TOKEN && env.META_AD_ACCOUNT),
    },
    whatsapp: conTwilio(env) ? {
      proveedor: "twilio",
      enviar: Boolean(env.TWILIO_AUTH_TOKEN && env.TWILIO_WA_FROM),
      plantillas: Boolean(env.TWILIO_AUTH_TOKEN),
      recibir: Boolean(env.TWILIO_AUTH_TOKEN),
      ultimoRecibido: Number(await env.EVENTOS.get(WA_ULTIMO)) || 0,
    } : {
      proveedor: "meta",
      enviar: Boolean(env.WA_TOKEN && env.WA_PHONE_ID),
      plantillas: Boolean(env.WA_TOKEN && env.WA_WABA_ID),
      recibir: Boolean(env.WA_APP_SECRET && env.WA_VERIFY_TOKEN),
      /* Si alguna vez llegó algo por el webhook. Que esté configurado no
         prueba que Meta esté llamando: falta suscribir la app a la cuenta. */
      ultimoRecibido: Number(await env.EVENTOS.get(WA_ULTIMO)) || 0,
    },
    google: {
      credenciales: Boolean(env.GADS_CLIENT_ID && env.GADS_CLIENT_SECRET && env.GADS_CUSTOMER_ID),
      developerToken: Boolean(env.GADS_DEV_TOKEN),
      autorizado: Boolean(await env.EVENTOS.get(GADS_REFRESH)),
    },
  };
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const ruta = url.pathname;

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    /* El webhook de WhatsApp va antes que todo: lo llama Meta, no el CRM, así
       que ni lleva la clave ni le sirven las reglas de abajo. Se protege con
       la firma de Meta, dentro de whatsappWebhook. */
    if (ruta === "/wa/webhook") {
      if (req.method !== "GET" && req.method !== "POST") return new Response("", { status: 405 });
      return whatsappWebhook(req, env, ctx);
    }
    /* Las imágenes de los encabezados las descarga Meta en cada envío: van
       sin clave, como el webhook. */
    const img = ruta.match(/^\/wa\/imagen\/([a-f0-9]{32})$/);
    if (img && (req.method === "GET" || req.method === "HEAD")) return servirImagen(env, img[1]);

    /* Lo mismo para Twilio, que se protege con su propia firma. */
    if (ruta === "/wa/twilio") {
      if (req.method !== "POST") return new Response("", { status: 405 });
      return twilioWebhook(req, env, ctx);
    }

    /* Todo aquí se pide con GET menos una cosa: mandar un WhatsApp lleva
       texto de por medio y eso no cabe con dignidad en una dirección. */
    const esEnvio = ruta === "/wa/enviar" || ruta === "/wa/plantillas/crear" || ruta === "/wa/imagen";
    if (req.method === "POST" ? !esEnvio : req.method !== "GET" && req.method !== "HEAD") {
      return json({ error: "Método no permitido en esta dirección." }, 405);
    }

    if (!env.CLAVE) return json({ error: "Al Worker le falta la clave. Ejecuta: wrangler secret put CLAVE" }, 500);

    /* ── Apertura ── */
    const apertura = ruta.match(/^\/a\/([A-Za-z0-9_-]{6,64})\.gif$/);
    if (apertura) {
      /* waitUntil: la imagen sale ya y el apunte se termina de escribir
         después. Un programa de correo que espere la respuesta no debe quedarse
         mirando un hueco mientras se guarda un registro que a él no le importa. */
      ctx.waitUntil(anotar(env, { trk: apertura[1], tipo: "apertura", ...contexto(req) }));
      return new Response(GIF, { headers: { "Content-Type": "image/gif", "Content-Length": String(GIF.length), ...SIN_CACHE } });
    }

    /* ── Clic ── */
    const clic = ruta.match(/^\/c\/([A-Za-z0-9_-]{6,64})$/);
    if (clic) {
      const trk = clic[1];
      const destino = url.searchParams.get("u") || "";
      const s = url.searchParams.get("s") || "";
      if (!destino) return json({ error: "Falta el destino." }, 400);
      if (!/^https?:\/\//i.test(destino)) return json({ error: "Sólo se redirige a http o https." }, 400);
      if (!igual(s, await firmar(env.CLAVE, `${trk}|${destino}`))) {
        return json({ error: "Este enlace no salió de tu CRM." }, 403);
      }
      ctx.waitUntil(anotar(env, { trk, tipo: "clic", u: destino, ...contexto(req) }));
      return new Response(null, { status: 302, headers: { Location: destino, ...SIN_CACHE } });
    }

    /* ── Lo anotado, para el CRM ── */
    if (ruta === "/eventos" || ruta === "/salud") {
      if (!igual(url.searchParams.get("clave") || "", env.CLAVE)) return json({ error: "Clave incorrecta." }, 401);
      if (ruta === "/salud") return json({ ok: true, servicio: "medidor-crm" });

      const desde = Number(url.searchParams.get("desde") || 0);
      const corte = `e:${String(Number.isFinite(desde) && desde > 0 ? desde : 0).padStart(13, "0")}`;
      const eventos = [];
      let cursor = null, paginas = 0;
      do {
        const r = await env.EVENTOS.list({ prefix: "e:", limit: 1000, ...(cursor ? { cursor } : {}) });
        for (const k of r.keys) if (k.name > corte && k.metadata) eventos.push(k.metadata);
        cursor = r.list_complete ? null : r.cursor;
        paginas++;
        /* Veinte páginas son veinte mil eventos en una respuesta. Más que eso
           se corta y se avisa: el CRM vuelve a pedir con una fecha más nueva y
           termina de bajarlo, en vez de que la petición muera a medio camino y
           no llegue nada. */
      } while (cursor && paginas < 20);

      eventos.sort((a, b) => (a.at < b.at ? -1 : 1));
      return json({ eventos, truncado: Boolean(cursor) });
    }

    /* ── El puente: Meta, WhatsApp y Google Ads ──
       Todo lo de aquí abajo pide la misma clave del medidor, menos /gads/vuelta,
       que la abre Google y no puede llevarla: ésa se protege con el nonce de un
       solo uso que creó /gads/entrar. */
    if (ruta.startsWith("/meta/") || ruta.startsWith("/gads/") || ruta.startsWith("/wa/") || ruta === "/puente/salud") {
      if (ruta === "/gads/vuelta") {
        try { return await gadsVuelta(env, url); }
        catch (e) { return pagina("No se pudo terminar", `<p>${(e && e.message) || e}</p>`); }
      }

      if (!igual(url.searchParams.get("clave") || "", env.CLAVE)) return json({ error: "Clave incorrecta." }, 401);

      const dias = Math.min(30, Math.max(1, Number(url.searchParams.get("dias")) || 30));
      const desde = Number(url.searchParams.get("desde") || 0);

      try {
        if (ruta === "/puente/salud") return json(await estadoPuente(env));
        if (ruta === "/meta/leads") return json(await metaLeads(env, desde));
        if (ruta === "/meta/campanas") return json(await metaCampanas(env, dias));
        if (ruta === "/gads/leads") return json(await gadsLeads(env, dias));
        if (ruta === "/gads/campanas") return json(await gadsCampanas(env, dias));
        if (ruta === "/gads/entrar") return await gadsEntrar(env, url);
        if (ruta === "/wa/enviar") {
          let cuerpo = {};
          try { cuerpo = await req.json(); } catch (_) { return json({ error: "El cuerpo no es JSON." }, 400); }
          return json(await (conTwilio(env) ? twilioEnviar : whatsappEnviar)(env, cuerpo));
        }
        if (ruta === "/wa/plantillas") return json(await (conTwilio(env) ? twilioPlantillas : whatsappPlantillas)(env));
        if (ruta === "/wa/imagen") return json(await guardarImagen(req, env, url));
        if (ruta === "/wa/plantillas/crear") {
          let cuerpo = {};
          try { cuerpo = await req.json(); } catch (_) { return json({ error: "El cuerpo no es JSON." }, 400); }
          return json(await whatsappCrearPlantilla(env, cuerpo));
        }
        if (ruta === "/wa/mensajes") return json(await whatsappRecibidos(env, desde));
      } catch (e) {
        /* Un Aviso trae un mensaje pensado para que lo lea una persona y su
           propio código; cualquier otro error se enseña tal cual antes que
           esconderlo tras un "algo salió mal" que no deja arreglar nada. */
        return json({ error: (e && e.message) || String(e) }, (e && e.status) || 500);
      }
      return json({ error: "Esa dirección no existe en el puente." }, 404);
    }

    /* Cualquier otra dirección no dice qué es esto ni a quién pertenece. */
    return new Response("", { status: 404, headers: SIN_CACHE });
  },
};
