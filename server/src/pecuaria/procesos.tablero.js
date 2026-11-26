// El tablero de Procesos (24/11, dibujo de Diego): 4 secciones que siguen el
// ciclo de la vaca. Una tarjeta es un grupo de un proceso en un estado, no el
// proceso entero: la misma IATF puede tener sus preñadas en "Preñadas" y sus
// vacías en "Entore".
//   iatf      Inseminación: los vientres de las IATF, hasta su ecografía.
//   entore    Entore: los vientres de los entores con toros. Con deIatf, lo
//             que viene de una IATF y pasó al toro (Diego, 24/11: la IATF es
//             la primera oportunidad y el toro la segunda; al revés no).
//   prenadas  Preñadas: hasta el parto.
//   cria      Con cría al pie: las paridas con sus terneros, hasta el destete.
// La ecografía no es una sección: reparte en el momento.
// Todo puro: los datos vienen de procesos.service.js (listar).

export const SECCIONES = ['iatf', 'entore', 'prenadas', 'cria'];

const ABIERTOS = new Set(['PENDIENTE', 'PROXIMA', 'HOY', 'ATRASADA']);

import { normalizarModalidad, porTandas } from './procesos.modalidad.js';

// La IATF y la transferencia de embriones (26/11) van juntas en la sección 1:
// son la primera oportunidad, por tandas. IA: los procesos de antes de los
// ajustes del 20/11 (ahora es IATF).
export const esIatf = porTandas;

// Lo próximo de esas etapas (lo abierto más temprano), del cronograma del proceso.
const proximaDe = (items, etapas) =>
  items.filter((i) => etapas.includes(i.etapa) && ABIERTOS.has(i.estado)).sort((a, b) => (a.fecha ?? '9999').localeCompare(b.fecha ?? '9999'))[0] ?? null;

// La última fecha real de esas etapas (para saber desde cuándo corre la barra).
const ultimaReal = (items, etapas) =>
  items
    .filter((i) => etapas.includes(i.etapa) && i.real)
    .map((i) => i.real)
    .sort()
    .at(-1) ?? null;

const ordenNatural = (a, b) => a.localeCompare(b, 'es', { numeric: true });

// ¿El proceso es un reentore? Se marca al crearlo con vacías de otro
// (datos.reentore). Los de antes se deducen: vienen de otro proceso y no son
// el nuevo entore de unas paridas con cría al pie.
export const esReentore = (p) => p.datos?.reentore ?? (p.procesoAnteriorId != null && !(p.datos?.conCria?.length > 0));

// Lo que pasó al toro dentro de una IATF: los lotes que en el fin de la
// inseminación fueron "al repaso con toro" y, si hubo un repaso con toros,
// todo el proceso. De las anclas que no están anuladas.
export function alToroEnIatf(anclas = []) {
  const vivas = anclas.filter((a) => !a.anulado);
  return {
    repasoTodo: vivas.some((a) => a.etapa === 'REPASO'),
    loteIds: new Set(vivas.filter((a) => a.etapa === 'FIN_INSEMINACION' && a.datos?.destino === 'REPASO').map((a) => a.loteId)),
  };
}

// Los grupos de un proceso abierto.
//   modalidad: la del proceso (TOROS | IATF | IA)
//   deIatf: el proceso es un entore con las vacías de una IATF (o de una transferencia)
//   modalidadAnterior: la del proceso de donde vienen (para vieneDe)
//   alToro: lo de la IATF que pasó al toro (alToroEnIatf)
//   lotes: los que están hoy en el proceso, { loteId, rol, destino, cabezas, potrero }
//   items: el cronograma (procesos.sugerencias.js)
//   aMedias: el texto del diagnóstico a medias ("Diagnóstico a medias: faltan 23",
//     reglas del campo): va en los grupos en servicio, que son las sin ecografiar.
// Las vacías sin destino (VACIAS_A_DECIDIR) solo pueden ser de antes de las
// reglas del campo: desde el 25/11 la ecografía les da destino en el momento.
export function gruposDelProceso({ modalidad, deIatf = false, modalidadAnterior = null, alToro = { repasoTodo: false, loteIds: new Set() }, fechaInicio, lotes, items = [], aMedias = null }) {
  const iatf = esIatf(modalidad);
  const propia = iatf ? 'iatf' : 'entore';
  // De dónde viene lo que va con el color (IATF | TE): la etiqueta "viene de…".
  const propiaDe = normalizarModalidad(modalidad);
  const anteriorDe = modalidadAnterior ? normalizarModalidad(modalidadAnterior) : 'IATF';
  const grupos = [];
  const armar = (seccion, tipo, delGrupo, extra = {}) => {
    const conAnimales = delGrupo.filter((l) => l.cabezas > 0);
    if (!conAnimales.length) return;
    grupos.push({
      seccion,
      tipo,
      cabezas: conAnimales.reduce((s, l) => s + l.cabezas, 0),
      loteIds: conAnimales.map((l) => l.loteId),
      potreros: [...new Set(conAnimales.map((l) => l.potrero).filter(Boolean))].sort(ordenNatural),
      deIatf: false,
      ...extra,
      ...(extra.deIatf && { vieneDe: extra.vieneDe ?? anteriorDe }),
    });
  };
  const de = (...roles) => lotes.filter((l) => roles.includes(l.rol));
  const servicio = { desde: fechaInicio, proxima: proximaDe(items, ['INSEMINACION', 'FIN_SERVICIO', 'DIAGNOSTICO']), ...(aMedias && { aMedias }) };

  // Los vientres: en una IATF, los que pasaron al toro van a Entore (con el
  // color); el resto, a Inseminación. En un entore, a Entore.
  const vientres = de('SIN_SERVIR', 'VIENTRES');
  if (iatf) {
    const pasaron = (l) => l.rol === 'VIENTRES' && (alToro.repasoTodo || alToro.loteIds.has(l.loteId));
    armar('iatf', 'VIENTRES', vientres.filter((l) => !pasaron(l)), servicio);
    armar('entore', 'VIENTRES', vientres.filter(pasaron), { ...servicio, deIatf: true, vieneDe: propiaDe });
  } else {
    armar('entore', 'VIENTRES', vientres, { ...servicio, deIatf });
  }
  // Las vacías para volver a servir van a Entore (las de una IATF, con el
  // color). Las que todavía no se decidió, en la sección de su proceso. Las
  // que se movieron afuera (LIBRES) ya no están.
  const vacias = de('VACIAS');
  const desdeEco = ultimaReal(items, ['DIAGNOSTICO']);
  // En una transferencia, también las no aptas (van al toro desde el día de la transferencia).
  armar('entore', 'VACIAS_REENTORE', vacias.filter((l) => l.destino === 'REENTORE'), { desde: desdeEco ?? fechaInicio, deIatf: iatf || deIatf, ...(iatf && { vieneDe: propiaDe }) });
  armar(propia, 'VACIAS_A_DECIDIR', vacias.filter((l) => l.destino == null || l.destino === 'DESPUES'), { desde: desdeEco, deIatf: !iatf && deIatf });
  // Preñadas: hasta la parición (la ventana del mes que viene primero).
  armar('prenadas', 'PRENADAS', de('PRENADAS'), {
    desde: desdeEco ?? fechaInicio,
    proxima: proximaDe(items, ['PARICION']),
  });
  // Con cría al pie: las paridas, con cuántos terneros tienen, hasta el destete.
  const terneros = de('CRIAS').reduce((s, l) => s + l.cabezas, 0);
  armar('cria', 'PARIDAS', de('PARIDAS'), {
    terneros,
    desde: ultimaReal(items, ['PARICION']) ?? fechaInicio,
    proxima: proximaDe(items, ['DESTETE']),
  });
  return grupos;
}
