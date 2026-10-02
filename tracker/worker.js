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
    const detalle = (e && (e.message || e.error_description || e.status)) ||
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

  const mensaje = cuerpo.plantilla
    ? {
        messaging_product: "whatsapp", to: a, type: "template",
        template: {
          name: String(cuerpo.plantilla),
          language: { code: String(cuerpo.idioma || "es") },
          ...(Array.isArray(cuerpo.variables) && cuerpo.variables.length
            ? { components: [{ type: "body", parameters: cuerpo.variables.map((v) => ({ type: "text", text: String(v) })) }] }
            : {}),
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
    throw e;
  }
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
    whatsapp: { enviar: Boolean(env.WA_TOKEN && env.WA_PHONE_ID) },
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
    /* Todo aquí se pide con GET menos una cosa: mandar un WhatsApp lleva
       texto de por medio y eso no cabe con dignidad en una dirección. */
    const esEnvio = ruta === "/wa/enviar";
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
          return json(await whatsappEnviar(env, cuerpo));
        }
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
