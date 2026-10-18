/* Lo que comparten la vista Tendencias (CRM.jsx) y el Worker que busca y
   califica (nube/tendencias.js): el perfil de investigación de base, los
   criterios de JEV con sus pesos y la regla que convierte la nota en una
   decisión. Cambiar un peso aquí cambia el ranking en los dos lados. */

/* El perfil de investigación con que arranca un cuaderno que nunca lo
   editó. Se cambia desde la vista Tendencias. */
export const PERFIL_BASE = `## Propósito
Encontrar lo que está pasando este mes en becas deportivas universitarias (NCAA, NAIA, JUCO), reclutamiento de atletas latinoamericanos y la vida del estudiante-atleta en EE. UU., para convertirlo en mensajes de WhatsApp y correo que lleven a registrarse en la app Catch.

## Audiencia
Atletas de 14 a 25 años en Latinoamérica (NSE 4-6, deporte competitivo), hombres y mujeres, que sienten que el sistema local los encasilló y quieren estudiar y jugar en el exterior; y sus padres (40 a 50 años), que quieren que sigan estudiando y buscan a alguien serio que los acompañe.

## Ángulos a priorizar
- Cambios de reglas NCAA, NIL y elegibilidad que afectan a internacionales
- Fechas, showcases, cupos y plazos concretos
- Historias reales de latinos becados y lo que hicieron para lograrlo
- Errores comunes en el proceso de reclutamiento
- Datos verificables (cifras, montos de becas, número de cupos)
- Atletas que rompieron un "no puedes" (estatura, edad, físico, género) y lo que hicieron
- Fútbol y deporte femenino: oportunidades y becas para mujeres
- Costo de la educación superior en Colombia frente a estudiar con beca en EE. UU.
- Tecnología y datos en la evaluación de atletas (IA, análisis de rendimiento)

## Ignorar
- Apuestas deportivas
- Chismes de fichajes profesionales sin relación con becas
- Promesas de "beca garantizada"
- Contenido que refuerce estereotipos o se burle de atletas

## Ajustes
- idioma: español
- días: 14`;

/* Cada criterio va de 0 a 5. El peso dice cuánto pesa en el total (0-100). */
export const CRITERIOS_JEV = {
  audiencia: { peso: 30, nombre: "Le importa a la audiencia" },
  registro: { peso: 25, nombre: "Lleva a registrarse en Catch" },
  actualidad: { peso: 15, nombre: "Es de ahora" },
  confianza: { peso: 15, nombre: "Fuente confiable" },
  marca: { peso: 15, nombre: "Encaja con la marca" },
};

/* Producir: vale la pena hacer la pieza ya. Guardar: buena, pero no urge.
   Un riesgo alto la descarta sin importar la nota. */
export const decisionDe = (total, riesgo) =>
  riesgo === "alto" ? "descartar" : total >= 70 ? "producir" : total >= 50 ? "guardar" : "descartar";

