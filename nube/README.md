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
