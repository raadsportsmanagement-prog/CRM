# El CRM en la nube

La versión publicada del CRM. Es la misma app que corre con `npm run dev`,
con una diferencia: guarda en un servidor y no en el navegador. Abres tu
dirección en el computador o en el celular y ves el mismo cuaderno; lo que
cambias en uno aparece en el otro al instante, sin recargar.

Corre en Cloudflare, en la misma cuenta que el puente (`tracker/`):

- **La app** la sirve Cloudflare tal como sale de `vite build`.
- **El almacén** es un Durable Object (`Cuaderno`, en `worker.js`) con su
  base SQLite. También mantiene abierta una conexión con cada pestaña para
  avisarle cuando algo cambia.
- **La puerta** es Cloudflare Access: antes de ver el CRM, pide tu correo y
  te manda un código. Sólo entran los correos de tu lista.

Todo entra en el plan gratuito.

## Qué pasa si escribo en dos equipos a la vez

Gana lo último que se guardó. Si un equipo no tiene cambios pendientes,
adopta en el acto lo que escribió el otro, así que en el uso normal (un
equipo a la vez) no se pierde nada. Para el caso raro, el servidor aparta
una copia del cuaderno cada diez minutos de trabajo y conserva las 60
últimas. Se pueden ver en `/api/copias`.

## Publicar por primera vez

Hace falta un dominio que ya esté administrado en Cloudflare. El CRM vive en
un subdominio de ese dominio, por ejemplo `crm.raadsports.com`.

### 1. Entrar a Cloudflare

```sh
npx wrangler login
```

### 2. Poner la dirección

En `wrangler.jsonc`, cambia `CRM_DOMINIO` por tu dirección:

```jsonc
"routes": [{ "pattern": "crm.raadsports.com", "custom_domain": true }],
```

### 3. Cerrar la puerta con Cloudflare Access (antes de publicar)

En el panel de Cloudflare → **Zero Trust**. La primera vez pide elegir un
nombre de equipo y el plan Free.

1. **Access → Applications → Add an application → Self-hosted**.
2. Nombre: `CRM`. Dominio de la aplicación: la misma dirección del paso 2.
3. Política: **Allow** · *Include* → *Emails* → tu correo (y cualquier otro
   que quieras autorizar).
4. Al guardar, abre la aplicación y copia el **Application Audience (AUD) Tag**.
5. El nombre de equipo está en **Settings → Custom Pages** (o en la barra
   del navegador): `https://TU-EQUIPO.cloudflareaccess.com`.

Pon los dos valores en `wrangler.jsonc`:

```jsonc
"vars": {
  "ACCESS_EQUIPO": "https://TU-EQUIPO.cloudflareaccess.com",
  "ACCESS_AUD": "el AUD Tag"
}
```

Mientras estén vacíos, el servidor no le entrega los datos a nadie.

### 4. Publicar

```sh
npm run deploy
```

Compila la app en modo nube y la sube. Cada vez que cambies el CRM, repites
este paso. Los datos no se tocan.

### 5. Autorizar la dirección nueva en Google

Gmail sólo atiende al CRM desde direcciones que conoce. En Google Cloud →
**APIs y servicios → Credenciales** → tu ID de cliente de OAuth →
**Orígenes autorizados de JavaScript**, agrega `https://crm.raadsports.com`.

### 6. Traer los datos que tienes hoy

Tu cuaderno actual está en el navegador, en `localhost:5173`. Para pasarlo:

1. Abre el CRM local (`npm run dev`) → **Configuración → Datos →
   Descargar respaldo**.
2. Abre la dirección nueva → **Configuración → Datos → Restaurar respaldo**
   y elige el archivo.

Las conexiones (Gmail, el puente, WhatsApp) viajan dentro del respaldo. Si
Gmail aparece desconectado, conéctalo una vez desde la dirección nueva.

## Probar en local

```sh
npm run nube:local
```

Levanta la versión de nube en `http://localhost:8787` con un almacén de
prueba, sin Access (`.dev.vars` lo desactiva sólo en local). No toca ni
tus datos del navegador ni los de la nube.

## Claude

El CRM se conecta con Claude de dos maneras, y las dos pasan por la misma
puerta de Cloudflare Access.

### Claude lee y edita el CRM (`/mcp`)

`nube/mcp.js` es un servidor MCP en `https://crm.raadsports.com/mcp`. Desde
claude.ai, Claude Desktop o Claude Code se le puede pedir «¿qué contactos
nuevos no he llamado esta semana?» o «crea el negocio de Laura y déjale una
nota». Sus herramientas: `resumen_crm`, `ver_esquema`, `buscar_registros`,
`ver_registro`, `listar_actividades`, `crear_registro`,
`actualizar_registro` y `agregar_nota`.

- No borra nada, y las conexiones (la clave del puente, Gmail) no salen.
- Lo que escribe aparece en las pestañas abiertas al instante y queda en
  las copias, firmado como «tu-correo vía Claude».
- Lo que crea Claude no dispara las automatizaciones: ésas corren en la
  app cuando la cambia una persona.

Para encenderlo:

1. En Cloudflare → **Zero Trust → Access controls → Applications** → la
   aplicación `CRM` → **Edit → Advanced settings** → activa
   **Managed OAuth** y guarda. Con eso Access le hace a Claude el mismo
   inicio de sesión por correo que a ti.
2. `npm run deploy`.
3. En claude.ai → **Settings → Connectors → Add custom connector**, con la
   dirección `https://crm.raadsports.com/mcp`. Al conectar se abre la
   página de Access para entrar con tu correo.
   En Claude Code: `claude mcp add --transport http crm https://crm.raadsports.com/mcp`.

### Claude dentro del CRM (`/api/claude`)

En cada ficha hay un panel **Asistente**: resumir, proponer el siguiente
paso, redactar el WhatsApp o el correo, o responder una pregunta. Lo que
escribe es un borrador para copiar; no envía ni guarda nada solo.

Usa la API de Claude (se paga por uso, con el modelo Claude Opus 5.5).
Para encenderlo, crea una clave en https://platform.claude.com y guárdala
como secreto del Worker:

```sh
npx wrangler secret put ANTHROPIC_API_KEY
```

Para probarlo en local con `npm run nube:local`, agrega
`ANTHROPIC_API_KEY=...` a `.dev.vars`.

## Los agentes trabajando solos (`nube/operacion.js`)

Los agentes de **Agentes → Atención** contestan los WhatsApp en el servidor,
también con el CRM cerrado:

1. Meta (o Twilio) avisa al puente de un WhatsApp entrante. El puente lo
   guarda en KV, como siempre, y además se lo pasa al CRM por el service
   binding (`Puerta.mensajesWhatsApp`).
2. El mensaje entra al cuaderno: se pega a la ficha con ese teléfono o se
   crea el contacto.
3. La conversación espera 8 segundos en la fila del `Operador` (un Durable
   Object con alarma), por si llegan más mensajes seguidos.
4. El agente que le toca redacta. Según su modo:
   - **Sugerir** (el de fábrica): queda en **Agentes → Supervisión** para
     aprobar, corregir o descartar.
   - **Automático**: sale solo por el puente. Al llegar al tope de mensajes
     automáticos con la misma persona en 24 horas, vuelve a pedir aprobación.
   - Si el agente pide una persona, la conversación queda en manos de una
     persona y deja de contestar ahí.

Arriba de la sección **Agentes** está el botón **Pausar todos**: siguen entrando los
mensajes, pero nadie redacta ni envía.

Lo que hace un agente queda en `supervision` y cada escritura va firmada con
su nombre (se ve en `/api/copias`).

### Guardar sin pisar a los agentes

La pestaña guarda indicando sobre qué versión escribe (`X-Rev-Base`). Si un
agente, Catch o Claude escribieron entre medias, el servidor contesta 409 y
la pestaña junta las dos versiones ficha por ficha (`src/fusion.js`). Si las
dos cambian el mismo valor, gana la pestaña.

### Para encenderlo

- En el puente: `WA_APP_SECRET` y el webhook de WhatsApp apuntando a
  `https://go.raadsports.com/wa/webhook` (ver `tracker/README.md`). Sin eso,
  Meta no entrega los mensajes entrantes.
- Publicar primero el CRM (`npm run deploy`, crea el `Operador`) y después
  el puente (`npx wrangler deploy --config wrangler.toml` en `tracker/`).
- En Conexiones, la clave del puente: es con la que salen los mensajes.

## Los agentes de operación (`nube/marketing.js`)

La cadena de una noticia a un lead que se suscribe en Catch, sola en el
servidor. Se configura en **Agentes → Equipo**.

| Agente | Cuándo | Qué hace |
|---|---|---|
| Contenido | 6:00 de Bogotá, después de Tendencias | Toma la tendencia con mejor nota de JEV (mínimo configurable), escribe el WhatsApp y el correo con `{{registro}}` y manda la plantilla a Meta |
| Campañas | Cada 10 minutos | Cuando Meta aprueba, envía en tandas de 20 a los leads sin registro, dentro del horario y del tope semanal por persona |
| Seguimiento | Cada 10 minutos | A los N días de una campaña, a quien no se registró ni contestó, la plantilla fija `catch_seguimiento_v1`; si contesta, lo atiende el agente de texto |
| Conversión (`nube/catch.js`) | Cuando Catch avisa | Registro → `leadStatus` Conectado. Pago → Cliente, y su negocio pasa a Ganado (o se crea ganado) |

Nadie recibe campañas si ya se registró, es cliente, está descalificado,
lo atiende una persona o llegó al tope. El enlace de cada envío lleva
`ref` (el id del contacto) y `utm_medium` / `utm_campaign`, que Catch
devuelve al registrarse.

### Correo por Amazon SES

Cloudflare Email no admite marketing, así que las campañas salen por SES:

1. En SES, verifica el dominio del remitente (SPF/DKIM) y pide salir del
   modo de prueba (sandbox).
2. Crea un usuario de IAM que sólo pueda `ses:SendEmail` y guarda sus
   llaves: `npx wrangler secret put AWS_ACCESS_KEY_ID` y
   `npx wrangler secret put AWS_SECRET_ACCESS_KEY`.
3. En `wrangler.jsonc`, `SES_REGION` y `SES_FROM` (p. ej.
   `"Catch <hola@catchrsm.com>"`).

Sin SES, las campañas salen sólo por WhatsApp. Las bajas las recibe el
puente (`/b/<id>`) y el agente las aplica antes de cada tanda.

### Dónde se ve cada cosa

La sección **Agentes** del menú reúne todo lo de los agentes, aparte de
Mensajes:

- **Supervisión**: lo que esperan aprobación, lo que enviaron, campañas y
  conversiones.
- **Atención**: los agentes que conversan con los usuarios (Luna y los de
  cada etapa), con su modo y sus condiciones.
- **Equipo**: los de operación interna (Investigador y JEV, Contenido,
  Campañas, Seguimiento), cada uno con su ficha, su configuración y lo último
  que hizo.

En Mensajes quedan las conversaciones; dentro de cada una se ve la propuesta
del agente que espera aprobación y quién la atiende.
