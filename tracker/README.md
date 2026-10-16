# El puente

Servicio mínimo, y lo único de todo el proyecto que corre fuera de tu
computador. Hace dos trabajos que parecen distintos y no lo son:

1. **Mide los correos** — anota **aperturas** y **clics** de lo que manda el
   CRM. La apertura ocurre en la máquina de otra persona, con tu pestaña
   cerrada, y alguien tiene que estar despierto para recibir el aviso.

2. **Guarda las llaves de Meta y de Google Ads** — trae los leads de los
   anuncios, las métricas de campaña, y manda los WhatsApp. Estas APIs se
   abren con un token que vale por la cuenta entera: leer tus leads, gastar tu
   presupuesto, escribirle a quien sea. Un token así no puede vivir en una
   página web, donde cualquiera que abra ese navegador lo puede sacar y usar
   desde el otro lado del mundo. Google además ni lo permite: su API no
   habilita CORS, así que la llamada ni siquiera sale del navegador.

Los tokens viven aquí, cifrados por Cloudflare, y nunca bajan al CRM. El CRM
pide las cosas con una clave y el puente es el único que habla con Meta y con
Google.

> **Lo que hay que saber para decidir si te sirve.** Esa clave sí está guardada
> en el navegador, junto al resto del cuaderno. Quien se siente frente a tu CRM
> abierto puede pedirle cosas al puente. La diferencia con guardar el token es
> que sólo puede pedir lo que este archivo ofrece —leer leads, leer métricas,
> mandar un WhatsApp—, nunca el token en sí, y que le cortas el paso cambiando
> una clave en vez de rotando credenciales en tres consolas.

Corre en Cloudflare Workers. En el plan gratuito entran 100.000 peticiones
diarias y 1.000 escrituras al día en el almacén — muy por encima de lo que
gasta un envío de unos cientos de correos.

## Qué guarda

Por cada apertura o clic, una línea:

| campo   | qué es                                                            |
|---------|-------------------------------------------------------------------|
| `trk`   | identificador aleatorio del envío, generado por el CRM             |
| `tipo`  | `apertura` o `clic`                                               |
| `at`    | fecha y hora                                                       |
| `u`     | el enlace pinchado (sólo en los clics)                             |
| `ua`    | el programa que hizo la petición                                   |
| `pais`  | país que reporta Cloudflare                                        |

No guarda el correo del destinatario, ni su nombre, ni el texto del mensaje. El
`trk` sólo significa algo dentro de tu CRM: aquí es una cadena sin dueño. Los
eventos se borran solos al año.

## Instalación

Una vez, unos cinco minutos. Hace falta una cuenta de Cloudflare (gratuita) y
Node instalado.

```sh
cd tracker

# 1. Entrar a tu cuenta de Cloudflare (abre el navegador)
npx wrangler login

# 2. Crear el almacén de eventos. Imprime un id: pégalo en wrangler.toml,
#    en la línea que dice PEGA_AQUI_EL_ID.
npx wrangler kv namespace create EVENTOS
#    (en versiones anteriores de wrangler el comando es: kv:namespace create EVENTOS)

# 3. Inventar una clave larga y guardarla cifrada en Cloudflare.
#    Apúntala: la misma va en el CRM, en Conexiones → El puente.
npx wrangler secret put CLAVE

# 4. Publicar
npx wrangler deploy
```

Al terminar, wrangler imprime la dirección, algo como
`https://crm-medidor.TU-CUENTA.workers.dev`. Esa dirección y la clave del paso 3
se pegan en el CRM, en **Conexiones → El puente**, y ahí mismo hay un botón que
dice exactamente qué quedó enchufado y qué falta.

Con eso ya mide correos. Meta y Google Ads son opcionales y se añaden encima,
cada uno por su cuenta; lo que no configures se queda apagado sin estorbar.

## Conectar Meta (leads y WhatsApp)

Antes del token hay que encender una cosa que no está encendida por defecto y
que no avisa cuando falta: el **acceso a los leads**. En Meta Business Suite, el
engranaje junto al portafolio → **Integraciones → Acceso a clientes potenciales
→ Personalizar acceso → Confirmar** ("clientes potenciales" es como Meta
traduce *leads* al español). Sólo puede hacerlo quien tenga control total del
portafolio. Sin esto la API contesta cero leads sin dar ninguna explicación, y
es donde se atasca casi todo el mundo.

Luego, en **Configuración del negocio → Usuarios → Usuarios de sistema**, crea
uno con rol **Employee** —su token no caduca nunca, así que más vale que sólo
alcance a lo que le asignes— y dale por separado la **página** y la **cuenta
publicitaria**.

Antes de poder generar el token hace falta una **app**: Meta emite los tokens de
usuario de sistema en nombre de una, y sin ninguna en el portafolio el botón
sale en gris sin explicar por qué. Créala en
[developers.facebook.com/apps/creation](https://developers.facebook.com/apps/creation/)
con caso de uso **Otro** y tipo **Empresa**, elige tu portafolio, y luego
instálala en el usuario de sistema desde su pestaña **Apps instaladas**. No hay
que publicarla ni pasarla por revisión: en modo desarrollo lee tus propios
activos, que es todo lo que hace el puente.

Instalar la app tampoco basta: el usuario de sistema necesita además un **rol
dentro de ella**. En **Asignar activos**, tipo **Apps**, marca la tuya y dale
**Administrar app**. Si al generar el token Meta dice "no hay permisos
disponibles", es exactamente esto.

Ya con eso, **Generar token** y marca:

| permiso | para qué |
|---|---|
| `leads_retrieval` | leer los leads. Sin éste vuelven vacíos, sin decir por qué |
| `pages_show_list` | ver los formularios de la página |
| `pages_read_engagement` | leer los formularios |
| `pages_manage_ads` | leer los leads a nivel de anuncio |
| `ads_management` | de qué campaña vino cada lead, y las métricas |
| `whatsapp_business_messaging` | sólo si vas a mandar WhatsApp |
| `instagram_basic` | sólo para publicar desde el Estudio: encontrar la cuenta de Instagram |
| `instagram_content_publish` | sólo para publicar desde el Estudio: publicar |

Los dos de anuncios no son imprescindibles: sin ellos los leads entran igual,
pero sin nombre de campaña, y el puente lo dice en un aviso en vez de fallar.

```sh
npx wrangler secret put META_TOKEN      # el token de arriba
npx wrangler secret put WA_TOKEN        # sólo para WhatsApp; suele ser el mismo
```

Y en `wrangler.toml`, que no lleva secretos sino identificadores:
`META_PAGE_ID`, `META_AD_ACCOUNT` y, para WhatsApp, `WA_PHONE_ID` — que es el
**identificador** del número remitente, no el número— y `WA_WABA_ID`, el de la
cuenta de WhatsApp Business, para leer las plantillas aprobadas.

### Publicar en Instagram desde el Estudio

No lleva un token aparte: se publica con el de la página, que el puente ya
saca de `META_TOKEN`. Hacen falta tres cosas:

1. Que la cuenta de Instagram sea **profesional** (de empresa o de creador) y
   esté **vinculada a la página** de `META_PAGE_ID` (la página → Configuración →
   Cuentas vinculadas → Instagram).
2. Que el usuario de sistema la tenga asignada: **Asignar activos → Cuentas de
   Instagram**.
3. Que el token lleve `instagram_basic` e `instagram_content_publish`. Si el que
   tienes es de antes, genera otro con esos dos además de los de arriba y
   vuelve a guardarlo con `npx wrangler secret put META_TOKEN`.

El puente encuentra solo la cuenta de Instagram a partir de la página. Si
alguna vez hiciera falta forzarla, pon su identificador como `IG_USER_ID` en
`wrangler.toml`.

### Recibir lo que te escriben por WhatsApp

Meta avisa de cada mensaje llamando a `/wa/webhook`. El puente lo guarda y el
CRM lo recoge cada minuto mientras esté abierto. Hacen falta dos secretos más:

```sh
npx wrangler secret put WA_APP_SECRET    # Configuración de la app → Básica → Clave secreta
npx wrangler secret put WA_VERIFY_TOKEN  # una palabra que inventes
```

Luego, en developers.facebook.com → tu app → WhatsApp → Configuración:

1. **Webhook** → URL de devolución de llamada: `https://<tu-puente>/wa/webhook`,
   y como token de verificación la misma palabra de `WA_VERIFY_TOKEN`.
2. En los campos del webhook, suscríbete a `messages`.
3. Suscribe la app a la cuenta de WhatsApp Business, una sola vez:
   `POST /<WA_WABA_ID>/subscribed_apps` con el token de la app. Sin esto Meta
   no manda nada aunque el webhook esté verificado.

Sólo se guardan los mensajes que llegan, no los avisos de entregado y leído:
cada mensaje que sale generaría tres escrituras, y el plan gratuito de KV da
mil al día.

## WhatsApp por Twilio, con un número virtual

En vez de poner el número en Meta, lo pone Twilio: le compras uno virtual, lo
registra como remitente de WhatsApp y el puente habla con Twilio. Por debajo
sigue siendo la API de Meta, así que valen las mismas reglas: la ventana de 24
horas y las plantillas aprobadas para el primer mensaje. El CRM no cambia en
nada; sólo cambia por dónde sale.

1. **Cuenta y número.** En [console.twilio.com](https://console.twilio.com),
   sal del modo de prueba cargando saldo, y compra un número en
   **Phone Numbers → Buy a number**. Uno de EE. UU. es el más barato y el que
   menos papeles pide; sirve para escribirle a cualquier país.
2. **Registrarlo en WhatsApp.** En **Messaging → Senders → WhatsApp senders →
   Create new sender**, elige ese número y sigue el asistente: te pide entrar
   con Facebook, elegir (o crear) el portafolio de Meta, el nombre que verá la
   gente y verificar el número —Twilio recibe el código solo—. Meta lo revisa;
   suele tardar desde minutos hasta un par de días.
3. **Plantillas.** En **Messaging → Content Template Builder**, crea cada una
   con variables `{{1}}`, `{{2}}`… en el texto y mándala a aprobación de
   WhatsApp, categoría *Marketing* para las promociones. El CRM las lista con el
   nombre que les pongas.
4. **El puente.** En `wrangler.toml`, `TWILIO_ACCOUNT_SID` y `TWILIO_WA_FROM`
   (el número, con `+` e indicativo). Y el secreto:

   ```sh
   npx wrangler secret put TWILIO_AUTH_TOKEN
   npx wrangler deploy
   ```

5. **Lo que te escriben.** En el remitente de WhatsApp de Twilio, en
   **Webhook URL for incoming messages**, pon `https://<tu-puente>/wa/twilio`
   con método `POST`. No hace falta nada más: el puente comprueba la firma de
   Twilio con el mismo Auth Token.

Con `TWILIO_ACCOUNT_SID` puesto, todo WhatsApp va por Twilio y los `WA_*` de
Meta se ignoran. Bórralo y vuelve a salir por Meta.

Para probar antes de tener el número aprobado sirve el **Sandbox** de Twilio
(Messaging → Try it out → Send a WhatsApp message): pon su número en
`TWILIO_WA_FROM` y escríbele desde tu celular la palabra que te indica. Sólo
deja escribirle a quien se unió así, y no sirve con tus propias plantillas.

Lo que Twilio cobra va **encima** de lo que cobra Meta por cada plantilla: una
pequeña tarifa por mensaje, enviado o recibido, más el alquiler del número.
Míralo en twilio.com/whatsapp/pricing antes de un envío grande.

Un detalle de cómo se ve en el CRM: Twilio acepta el mensaje al instante y lo
entrega después, y los rechazos de Meta —la ventana de 24 horas, un número sin
WhatsApp— llegan en ese después. El puente espera hasta un par de segundos para
poder decir que falló y por qué; por eso cada envío tarda un poco más que por
Meta. Lo que falle más tarde que eso queda como enviado.

## Conectar Google Ads

Pide **primero** el developer token, porque es lo que tarda: en Google Ads,
**Herramientas → Configuración → Centro de API**. Necesita una cuenta
administradora (MCC) y Google se toma días en aprobarlo. Existe un programa
para no necesitarlo, pero sigue siendo un piloto cerrado al que hay que
postularse, así que hoy no es una salida.

Después, en Google Cloud: activa **Google Ads API** y crea un **ID de cliente
de OAuth** de tipo *Aplicación web*. En **URIs de redireccionamiento
autorizados** —ése, no el de orígenes— pon la dirección del puente seguida de
`/gads/vuelta`.

```sh
npx wrangler secret put GADS_CLIENT_SECRET
npx wrangler secret put GADS_DEV_TOKEN
```

En `wrangler.toml`: `GADS_CLIENT_ID`, `GADS_CUSTOMER_ID` y, sólo si la cuenta
cuelga de un MCC, `GADS_LOGIN_CUSTOMER_ID`. Ponerlo cuando no toca hace que
Google conteste que la cuenta no existe.

Publica y abre una vez `https://TU-PUENTE/gads/entrar?clave=TU-CLAVE`, o pulsa
**Autorizar Google Ads** en Conexiones. Google devuelve un permiso duradero que
se queda guardado aquí y se renueva solo; nunca pasa por el navegador.

## Comprobar a mano

```sh
curl "https://crm-medidor.TU-CUENTA.workers.dev/puente/salud?clave=TU-CLAVE"
```

Contesta con síes y noes —nunca con el valor de un token, ni recortado— para
que se vea de un vistazo qué secreto falta.

## Direcciones que atiende

Públicas, porque tienen que serlo:

- `GET /a/<id>.gif` — devuelve la imagen de 1×1 y anota una apertura.
- `GET /c/<id>?u=<destino>&s=<firma>` — anota el clic y redirige. **Firmada**:
  sin la firma que sólo el CRM sabe calcular no redirige a ningún lado. Sin eso,
  cualquiera que descubriera la dirección podría repartir enlaces de phishing
  que empiezan con tu dominio.
- `GET /gads/vuelta` — la vuelta de Google al autorizar. No puede llevar clave
  porque la abre Google, así que se protege con un vale de un solo uso que creó
  `/gads/entrar` y que caduca en diez minutos.
- `POST /wa/twilio` — los mensajes que llegan por Twilio. Se protege con la
  firma de Twilio (`X-Twilio-Signature`), hecha con `TWILIO_AUTH_TOKEN`.
- `GET|POST /wa/webhook` — los avisos de WhatsApp. No lleva clave porque la
  llama Meta: el GET se protege con `WA_VERIFY_TOKEN` y cada POST con la firma
  de la app (`WA_APP_SECRET`). Lo que no venga firmado por Meta no se anota.

Con clave, todas:

- `GET /eventos?desde=<ms>` — aperturas y clics desde una fecha.
- `GET /salud` y `GET /puente/salud` — comprobación.
- `GET /meta/leads?desde=<ms>` — leads de Lead Ads de la página configurada.
- `GET /meta/campanas?dias=30` — gasto, clics y leads por campaña.
- `GET /gads/leads?dias=30` — leads de los formularios de Google.
- `GET /gads/campanas?dias=30` — lo mismo, en Google.
- `GET /gads/entrar` — empieza la autorización de Google.
- `POST /wa/enviar` — manda un WhatsApp. Cuerpo JSON: `{a, texto}`, o
  `{a, plantilla, idioma, variables}` para una plantilla aprobada. `variables`
  es una lista para las plantillas de `{{1}}`, `{{2}}`… y un objeto
  nombre → valor para las de variables con nombre.
- `GET /wa/plantillas` — las plantillas de la cuenta, con su texto y variables.
- `POST /wa/plantillas/crear` — crea una plantilla en Meta y la deja en
  revisión. Cuerpo JSON: `{nombre, idioma, categoria, cuerpo, encabezado, pie,
  ejemplos}`, con variables con nombre (`{{nombre}}`) y un ejemplo por cada
  una. La aprobación se lee después con `/wa/plantillas`. Sólo por Meta, no
  por Twilio.
- `GET /wa/mensajes?desde=<ms>` — lo recibido por WhatsApp desde una marca.

## Lo que un medidor no puede prometer

- **La apertura es una señal floja.** Quien lee con las imágenes bloqueadas
  nunca aparece, aunque haya leído. Apple Mail, al revés, descarga las imágenes
  solo al recibir el correo, sin que nadie lo abra: eso cuenta una apertura que
  no ocurrió. El CRM marca como *posible precarga* las que llegan en los
  primeros segundos, que son casi siempre ésas.
- **Gmail guarda la imagen en su propio caché** la primera vez. Así que la
  primera apertura se registra bien y las siguientes suelen perderse: fíate del
  *sí abrió*, no del *cuántas veces*.
- **El clic sí es firme.** Ningún filtro pincha enlaces por su cuenta, salvo
  algunos antivirus corporativos. Si quieres una sola cifra en la que confiar,
  es ésa.

## Lo que las plataformas de anuncios no perdonan

- **Meta borra los leads a los 90 días. Google, a los 30.** Con lo demás, no
  sincronizar significa enterarse tarde; con esto significa no enterarse nunca.
  Si el CRM pasa tres meses sin recoger, lo de antes no se recupera de ninguna
  manera. Por eso los leads entran en el barrido de **Actualizar estados** y no
  en un botón aparte que haya que acordarse de pulsar.
- **WhatsApp tiene una ventana de 24 horas.** Texto libre sólo se puede mandar
  si esa persona te escribió en las últimas 24 horas. Para iniciar una
  conversación hace falta una plantilla que Meta aprobó antes, una por una.
  Para el primer mensaje a alguien que acaba de llegar por un anuncio, el modo
  de enlace del CRM sigue siendo muchas veces el único que funciona hoy.
- **Las versiones de las APIs están fijadas** en `worker.js` (`META_V`,
  `GADS_V`), no puestas en "la última". Meta retira una versión cada dos años y
  Google Ads cada pocos meses: con "la última" esto se rompería solo un martes
  cualquiera sin que nadie hubiera tocado nada. Cuando toque subirlas, son dos
  líneas y un `deploy`.
