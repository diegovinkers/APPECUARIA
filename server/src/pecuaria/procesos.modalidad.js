// Las formas de servicio de un proceso reproductivo (proceso.datos.modalidad).
// Todo puro.
//   TOROS  entore con toros
//   IATF   inseminación a tiempo fijo (IA: los procesos de antes de los ajustes del 20/11)
//   TE     transferencia de embriones (26/11, docs/superpowers/prompts/2026-11-26-embriones.md):
//          embriones Wagyu comprados, en receptoras Angus. Funciona como la
//          IATF (por tandas, una ecografía por tanda, las vacías al toro una
//          sola vez), con tres cosas propias: las no aptas van al toro el
//          mismo día, el parto se cuenta con su propio plazo (PARICION_TE) y
//          los terneros van a un lote Wagyu.

export const MODALIDAD = { TOROS: 'Entore con toros', IA: 'IATF', IATF: 'IATF', TE: 'Transferencia de embriones' };

// La IATF y la transferencia: la primera oportunidad, por tandas (al revés
// que el entore con toros, que es la segunda).
export const porTandas = (modalidad) => modalidad === 'IATF' || modalidad === 'IA' || modalidad === 'TE';
export const esEmbriones = (modalidad) => modalidad === 'TE';

// TOROS | IATF | TE (IA cuenta como IATF; sin dato, entore).
export const normalizarModalidad = (modalidad) => (modalidad === 'TE' ? 'TE' : porTandas(modalidad) ? 'IATF' : 'TOROS');

// El tipo de evento del día de servicio (el ancla del inicio y de cada tanda).
export const tipoDelServicio = (modalidad) => ({ TOROS: 'ENTORE', IATF: 'INSEMINACION', TE: 'TRANSFERENCIA_EMBRIONES' })[normalizarModalidad(modalidad)];

// El sufijo de la parte que se servió ese día: "<lote> · IATF 10/11", "<lote> · TE 10/11".
export const sufijoTanda = (modalidad) => (esEmbriones(modalidad) ? 'TE' : 'IATF');

// "la IATF", "la transferencia", "el entore" (para los textos).
export const elServicio = (modalidad) => (esEmbriones(modalidad) ? 'la transferencia' : porTandas(modalidad) ? 'la IATF' : 'el entore');

// La etapa de Configuración con el plazo del parto: la transferencia cuenta
// desde el embrión de 7 días.
export const etapaParicion = (modalidad) => (esEmbriones(modalidad) ? 'PARICION_TE' : 'PARICION');

// Los embriones usados en una carga de una transferencia: por defecto, uno por
// transferida; nunca menos. { embriones: { usados, detalle? } } o { error }.
export function embrionesDeLaCarga(embriones, transferidas) {
  const usados = embriones?.usados ?? transferidas;
  if (!Number.isInteger(usados) || usados < 0) return { error: 'Los embriones usados tienen que ser un número entero' };
  if (usados < transferidas) return { error: `Se transfirieron ${transferidas.toLocaleString('es-UY')}: los embriones usados no pueden ser menos` };
  const detalle = embriones?.detalle?.trim() || null;
  return { embriones: { usados, ...(detalle && { detalle }) } };
}
