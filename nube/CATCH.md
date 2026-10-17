# Catch → CRM: el contrato de eventos

Catch le avisa al CRM qué pasa con cada persona en la app: si se registró, desde
qué envío, en qué etapa va y qué habla con el Companion. El CRM lo muestra en la
ficha del contacto (propiedades «Estado en la app», «Etapa en la app», etc.) y en
Mensajes, donde la conversación con el agente aparece junto a WhatsApp y correo.

## El camino

```
Catch (Azure)  ──POST firmado──▶  go.raadsports.com/catch/eventos   (puente, crm-medidor)
                                        │ revisa firma y tiempo
                                        ▼ service binding "CRM" → clase Puerta
                                  crm-raad  ──▶  cuaderno (nube/catch.js)
```

El CRM está detrás de Cloudflare Access, así que Catch no le habla directo: le
habla al puente, que es público y sólo deja pasar lo firmado.

## La firma

| Cabecera | Valor |
|---|---|
| `Content-Type` | `application/json` |
| `X-Catch-Tiempo` | segundos Unix de ahora (10 dígitos) |
| `X-Catch-Firma` | `sha256=` + hex(HMAC-SHA256(`CATCH_SECRETO`, `X-Catch-Tiempo` + `"."` + cuerpo)) |

Se rechaza si el tiempo se aleja más de 5 minutos. El cuerpo se firma tal cual
se manda, byte a byte.

## El cuerpo

```json
{ "eventos": [ { "id": "...", "tipo": "...", "at": "2026-10-17T15:04:05Z", "atletaId": "...", ... } ] }
```

Hasta 500 eventos por lote. Todo evento lleva:

- `id`: único y estable. El CRM lo usa para no aplicarlo dos veces, así que
  reintentar el mismo lote no duplica nada. Lo natural es el id del evento en el
  diario de Cosmos.
- `at`: ISO 8601 con zona.
- `atletaId`: el id del `AthleteProfile`.

| `tipo` | Campos extra | Cuándo (evento de dominio en Catch) |
|---|---|---|
| `registro` | `ref?`, `utm?{source,medium,campaign}`, `persona?`, `conversacional?` | `AthleteProfileCreated` |
| `perfil` | `completo` (bool), `persona?` | Termina el onboarding (pasos 2–4) |
| `etapa` | `etapa` (1–6) | `StageAdvanced` |
| `acceso` | `activo` (bool) | Se concede o cierra `PlatformAccess` |
| `turno` | `turnoId`, `quien` (`Atleta`·`Companion`·`Asesor`), `texto`, `canal` (`InApp`·`WhatsApp`), `deber?`, `persona?` | `ConversationTurnRecorded` |
| `traspaso` | `motivo`, `abierto` (bool) | `AdvisorHandoffRequested` (abierto) / `AdvisorHandoffConcluded` (cerrado) |

`persona` = `{ nombre?, apellido?, email?, telefono? }`. Sirve para encontrar al
contacto si todavía no está ligado, y para completar la ficha sin pisar lo que ya
tenía.

### Cómo encuentra el CRM a la persona

1. Ficha con ese `atletaId` (ya ligada).
2. `ref`: el id del contacto en el CRM.
3. El mismo correo.
4. El mismo teléfono (últimos 10 dígitos).
5. Si no aparece, crea el contacto con fuente «App Catch».

Una ficha ya ligada a otro atleta nunca se reasigna por correo o teléfono.

### Respuestas

- `200 {"ok":true,"aplicados":n,"repetidos":n,"invalidos":n,"fichasNuevas":n}`
- `400`: el cuerpo no tiene la forma `{eventos:[...]}`. No reintentar.
- `401`: firma o tiempo. No reintentar sin corregir.
- `503`: el CRM no pudo guardar. **Reintentar** con espera creciente.

Un evento que no cumple el esquema cuenta en `invalidos` y no frena el resto del
lote.

## El `ref` y las UTM: lo que Catch tiene que guardar al registrarse

Todo enlace a `https://app.catchrsm.com` que sale del CRM hacia un contacto lleva:

```
?ref=<id del contacto>&utm_source=crm&utm_medium=whatsapp|email&utm_campaign=<id del envío>
```

En las plantillas, `{{registro}}` pone el enlace de registro ya armado.

Del lado de Catch hace falta:

1. En `/register` (y en cualquier página de entrada), leer `ref` y `utm_*` de la
   URL y guardarlos en `sessionStorage` **antes** de redirigir a Entra External
   ID, porque la vuelta del inicio de sesión pierde la query.
2. Mandarlos en `POST /api/athlete-profiles` (create-profile) y guardarlos en el
   perfil (p. ej. `Attribution { Ref, UtmSource, UtmMedium, UtmCampaign }`).
3. Incluirlos en el evento `registro`.

## El relay en Catch

Hoy nadie consume `AthleteProfileCreated` ni `StageAdvanced`, y el bus está en
Basic (sin topics). Lo más simple:

- Una Azure Function nueva (`crm-relay`) con su propia cola `crm-outbox` en el
  mismo Service Bus.
- Cada servicio que emite uno de los eventos de la tabla manda además un mensaje
  a `crm-outbox`.
- La función agrupa, firma con `CATCH_SECRETO` (desde Key Vault) y hace el POST.
  Si recibe 503 o hay un error de red, el mensaje vuelve a la cola. Si recibe 4xx,
  lo manda a la cola de mensajes muertos.

## Probarlo a mano

```bash
SECRETO='...'; T=$(date +%s)
CUERPO='{"eventos":[{"id":"prueba-1","tipo":"registro","at":"2026-10-17T15:00:00Z","atletaId":"prueba","persona":{"nombre":"Prueba","email":"prueba@ejemplo.com"}}]}'
FIRMA="sha256=$(printf '%s' "$T.$CUERPO" | openssl dgst -sha256 -hmac "$SECRETO" | sed 's/^.* //')"
curl -s https://go.raadsports.com/catch/eventos -H 'Content-Type: application/json' \
  -H "X-Catch-Tiempo: $T" -H "X-Catch-Firma: $FIRMA" -d "$CUERPO"
```

## Publicar

1. `npm run deploy` en la raíz: publica `crm-raad` con la clase `Puerta` y el cron
   de tendencias. Va primero, porque el puente apunta a esa clase.
2. En `tracker/`: `npx wrangler secret put CATCH_SECRETO --config wrangler.toml`,
   y después `npx wrangler deploy --config wrangler.toml`.
3. Guardar el mismo secreto en el Key Vault de Catch.
