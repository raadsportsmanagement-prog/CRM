# Medidor de correo

Servicio mínimo que anota **aperturas** y **clics** de los correos que manda el
CRM. Es lo único de todo el proyecto que corre fuera de tu computador, y existe
por una razón sola: la apertura ocurre en la máquina de otra persona, con esta
pestaña cerrada, y alguien tiene que estar despierto para recibir el aviso.

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
#    Apúntala: la misma va en el CRM, en Conexiones → Medición.
npx wrangler secret put CLAVE

# 4. Publicar
npx wrangler deploy
```

Al terminar, wrangler imprime la dirección, algo como
`https://crm-medidor.TU-CUENTA.workers.dev`. Esa dirección y la clave del paso 3
se pegan en el CRM, en **Conexiones → Medición de correos**, y ahí mismo hay un
botón para comprobar que responde.

## Comprobar a mano

```sh
curl "https://crm-medidor.TU-CUENTA.workers.dev/salud?clave=TU-CLAVE"
# {"ok":true,"servicio":"medidor-crm"}
```

## Direcciones que atiende

- `GET /a/<id>.gif` — devuelve la imagen de 1×1 y anota una apertura. Pública.
- `GET /c/<id>?u=<destino>&s=<firma>` — anota el clic y redirige. Pública, pero
  **firmada**: sin la firma que sólo el CRM sabe calcular no redirige a ningún
  lado. Sin eso, cualquiera que descubriera la dirección podría repartir enlaces
  de phishing que empiezan con tu dominio.
- `GET /eventos?clave=…&desde=<ms>` — lo anotado desde una fecha. Pide clave.
- `GET /salud?clave=…` — comprobación. Pide clave.

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
