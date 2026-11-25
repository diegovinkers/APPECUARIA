// Claude de respaldo para los precios de INAC (docs/PRECIOS_INAC.md): cuando
// el Excel no se puede leer, se le manda el PDF del informe (o el Excel en CSV)
// y devuelve la semana y los precios en JSON, que se validan con zod.
// Lo que lee Claude nunca se publica solo: la importación queda en revisión.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { CLAVES, INDICADORES, NOMBRE_UNIDAD } from './precios.indicadores.js';

export const MODELO_CLAUDE = 'claude-haiku-5-5';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const respuestaClaudeSchema = z.object({
  semanaDesde: z.string().regex(ISO),
  semanaHasta: z.string().regex(ISO),
  precios: z.array(z.object({
    indicador: z.enum(CLAVES),
    valor: z.number(),
  })),
});

// El cliente de Anthropic, o null si no hay ANTHROPIC_API_KEY (el paso se salta).
export function crearClienteClaude(env = process.env) {
  return env.ANTHROPIC_API_KEY?.trim() ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY.trim(), timeout: 120_000, maxRetries: 1 }) : null;
}

const LISTA = INDICADORES
  .map((i) => `- ${i.clave}: "${i.pdf}" (${NOMBRE_UNIDAD[i.unidad]})`)
  .join('\n');

const INSTRUCCIONES = `Sos un extractor de datos. Te paso el informe semanal de precios de hacienda de INAC (Uruguay).
Devolvé la semana más reciente que trae ("Semana actual: del dd/mm/aaaa al dd/mm/aaaa"), con las fechas en formato AAAA-MM-DD, y los precios de esa semana (no los de la semana anterior) para estos indicadores:
${LISTA}

Reglas:
- Solo los valores de la semana actual, en USD/kg, como número (6,135 → 6.135).
- Si un indicador no aparece, no lo incluyas. No inventes ni calcules nada.
- En la tabla de bovinos, la fila "Novillo" (o "Vaca", "Vaquillona") sola es el precio en pie.`;

// Lo que devolvió Claude, como una semana del lector del Excel.
export function semanaDeClaude(respuesta) {
  const valores = {};
  for (const { indicador, valor } of respuesta.precios) {
    if (valores[indicador] == null) valores[indicador] = Math.round(valor * 1000) / 1000;
  }
  return { desde: respuesta.semanaDesde, hasta: respuesta.semanaHasta, valores };
}

/**
 * @param {{ cliente, pdf?: Buffer, csv?: string }} p uno de los dos.
 * @returns {Promise<{ desde, hasta, valores }>} la semana leída.
 * Lanza un Error con un mensaje claro si Claude no contesta algo válido.
 */
export async function extraerConClaude({ cliente, pdf, csv }) {
  const contenido = pdf
    ? [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') } },
      { type: 'text', text: INSTRUCCIONES },
    ]
    : [{ type: 'text', text: `${INSTRUCCIONES}\n\nEl informe viene en CSV (cada hoja del Excel de INAC, con sus títulos y las últimas semanas; la semana más reciente es la última fila con fecha):\n\n${csv}` }];

  let respuesta;
  try {
    respuesta = await cliente.messages.parse({
      model: MODELO_CLAUDE,
      max_tokens: 16000,
      output_config: { effort: 'low', format: zodOutputFormat(respuestaClaudeSchema) },
      messages: [{ role: 'user', content: contenido }],
    });
  } catch (error) {
    const estado = error instanceof Anthropic.APIError && error.status ? ` (${error.status})` : '';
    throw new Error(`Claude no contestó${estado}: ${error.message}`);
  }

  if (respuesta.stop_reason === 'refusal') throw new Error('Claude no quiso leer el informe.');
  if (respuesta.stop_reason === 'max_tokens') throw new Error('La respuesta de Claude quedó cortada.');
  const leido = respuestaClaudeSchema.safeParse(respuesta.parsed_output);
  if (!leido.success) throw new Error('La respuesta de Claude no tiene la forma esperada.');
  return semanaDeClaude(leido.data);
}
