/* ────────────────────────────────────────────────────────────
   Hablar con el puente desde el servidor
   Los agentes mandan WhatsApp, crean plantillas y leen eventos por el mismo
   puente que usa la app (tracker/, crm-medidor), con la misma clave que se
   puso en Conexiones. Por el service binding PUENTE si está, sin salir a
   internet; si no, por la dirección guardada.
   ──────────────────────────────────────────────────────────── */

import { normalizeIntegrations } from "../src/integrations.js";

export async function pedirPuente(env, integraciones, ruta, { metodo = "GET", cuerpo, params = {} } = {}) {
  const pu = normalizeIntegrations(integraciones).puente;
  if (!pu.clave) throw new Error("Falta el puente en Conexiones: sin su clave los agentes no pueden enviar nada.");
  const q = `${ruta}?${new URLSearchParams({ ...params, clave: pu.clave })}`;
  const init = {
    method: metodo,
    ...(cuerpo !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) } : {}),
  };
  let r;
  if (env.PUENTE) r = await env.PUENTE.fetch(new Request(`https://puente${q}`, init));
  else if (pu.base) r = await fetch(`${pu.base}${q}`, init);
  else throw new Error("Falta la dirección del puente en Conexiones.");
  let data = {};
  try { data = await r.json(); } catch (_) {}
  if (r.status === 401) throw new Error("El puente rechazó la clave guardada en Conexiones.");
  if (!r.ok) throw new Error(data.error || `El puente respondió ${r.status}.`);
  return data;
}
