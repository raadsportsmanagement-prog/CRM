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

Los dos de anuncios no son imprescindibles: sin ellos los leads entran igual,
pero sin nombre de campaña, y el puente lo dice en un aviso en vez de fallar.

```sh
npx wrangler secret put META_TOKEN      # el token de arriba
npx wrangler secret put WA_TOKEN        # sólo para WhatsApp; suele ser el mismo
```

Y en `wrangler.toml`, que no lleva secretos sino identificadores:
`META_PAGE_ID`, `META_AD_ACCOUNT` y, para WhatsApp, `WA_PHONE_ID` — que es el
**identificador** del número remitente, no el número.

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

Con clave, todas:

- `GET /eventos?desde=<ms>` — aperturas y clics desde una fecha.
- `GET /salud` y `GET /puente/salud` — comprobación.
- `GET /meta/leads?desde=<ms>` — leads de Lead Ads de la página configurada.
- `GET /meta/campanas?dias=30` — gasto, clics y leads por campaña.
- `GET /gads/leads?dias=30` — leads de los formularios de Google.
- `GET /gads/campanas?dias=30` — lo mismo, en Google.
- `GET /gads/entrar` — empieza la autorización de Google.
- `POST /wa/enviar` — manda un WhatsApp. Cuerpo JSON: `{a, texto}`, o
  `{a, plantilla, idioma, variables}` para una plantilla aprobada.

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
