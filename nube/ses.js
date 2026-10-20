/* ────────────────────────────────────────────────────────────
   Correo de campañas por Amazon SES
   Las campañas de los agentes salen de aquí, con el CRM cerrado. No por
   Gmail (pide la pestaña abierta y castiga el volumen) ni por Cloudflare
   Email (sólo admite correo transaccional): SES sí admite marketing.

   Configuración, una vez:
     · vars en wrangler.jsonc: SES_REGION (p. ej. "us-east-1") y SES_FROM
       ("Catch <hola@catchrsm.com>"), con el dominio verificado en SES.
     · secretos: AWS_ACCESS_KEY_ID y AWS_SECRET_ACCESS_KEY, de un usuario de
       IAM que sólo pueda ses:SendEmail.
   Sin eso, `sesListo` dice que no y las campañas salen sólo por WhatsApp.

   Cada correo lleva la baja con un clic (List-Unsubscribe), que Gmail y
   Yahoo exigen a quien manda en volumen. La baja la recibe el puente.
   ──────────────────────────────────────────────────────────── */

import { AwsClient } from "aws4fetch";

export const sesListo = (env) => Boolean(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY && env.SES_REGION && env.SES_FROM);

export async function enviarCorreoSes(env, { para, asunto, html, texto, baja }) {
  if (!sesListo(env)) throw new Error("Falta configurar Amazon SES (SES_REGION, SES_FROM y las llaves de AWS).");
  const aws = new AwsClient({
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    region: env.SES_REGION,
    service: "ses",
  });
  const cuerpo = {
    FromEmailAddress: env.SES_FROM,
    Destination: { ToAddresses: [para] },
    Content: {
      Simple: {
        Subject: { Data: asunto, Charset: "UTF-8" },
        Body: { Html: { Data: html, Charset: "UTF-8" }, Text: { Data: texto, Charset: "UTF-8" } },
        ...(baja ? {
          Headers: [
            { Name: "List-Unsubscribe", Value: `<${baja}>` },
            { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
          ],
        } : {}),
      },
    },
    ...(env.SES_CONFIG_SET ? { ConfigurationSetName: env.SES_CONFIG_SET } : {}),
  };
  const r = await aws.fetch(`https://email.${env.SES_REGION}.amazonaws.com/v2/email/outbound-emails`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  let data = {};
  try { data = await r.json(); } catch (_) {}
  if (!r.ok) {
    const msg = data.message || data.Message || `HTTP ${r.status}`;
    if (/not verified/i.test(msg)) throw new Error(`SES no tiene verificada esa dirección o dominio (${msg}). En modo de prueba sólo se puede escribir a direcciones verificadas.`);
    throw new Error(`Amazon SES no envió el correo: ${msg}`);
  }
  return { id: data.MessageId || "" };
}
