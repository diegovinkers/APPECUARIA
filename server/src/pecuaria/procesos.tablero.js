// El tablero de Procesos (24/11, dibujo de Diego): 4 secciones que siguen el
// ciclo de la vaca. Una tarjeta es un grupo de un proceso en un estado, no el
// proceso entero: el mismo entore puede tener sus preñadas en "Preñadas" y
// sus vacías en "Reentore".
//   servicio  En servicio: los vientres de un entore o IATF, hasta su ecografía.
//   reentore  Reentore: los vientres de un proceso de reentore, y las vacías
//             que esperan volver a servirse (o que todavía no se decidió).
//   prenadas  Preñadas: hasta el parto.
//   cria      Con cría al pie: las paridas con sus terneros, hasta el destete.
// La ecografía no es una sección: reparte en el momento (preñadas a 3, vacías a 2).
// Todo puro: los datos vienen de procesos.service.js (listar).

export const SECCIONES = ['servicio', 'reentore', 'prenadas', 'cria'];

const ABIERTOS = new Set(['PENDIENTE', 'PROXIMA', 'HOY', 'ATRASADA']);

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

// Los grupos de un proceso abierto.
//   lotes: los que están hoy en el proceso, { loteId, rol, destino, cabezas, potrero }
//   items: el cronograma (procesos.sugerencias.js)
export function gruposDelProceso({ reentore = false, fechaInicio, lotes, items = [] }) {
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
      ...extra,
    });
  };
  const de = (...roles) => lotes.filter((l) => roles.includes(l.rol));

  // En servicio (o en el reentore): hasta el fin del servicio y la ecografía.
  armar(reentore ? 'reentore' : 'servicio', 'VIENTRES', de('SIN_SERVIR', 'VIENTRES'), {
    desde: fechaInicio,
    proxima: proximaDe(items, ['INSEMINACION', 'FIN_SERVICIO', 'DIAGNOSTICO']),
  });
  // Las vacías: para volver a servir, o todavía sin decidir. Las que se
  // movieron afuera (LIBRES) ya no están.
  const vacias = de('VACIAS');
  armar('reentore', 'VACIAS_REENTORE', vacias.filter((l) => l.destino === 'REENTORE'), { desde: ultimaReal(items, ['DIAGNOSTICO']) });
  armar('reentore', 'VACIAS_A_DECIDIR', vacias.filter((l) => l.destino == null || l.destino === 'DESPUES'), { desde: ultimaReal(items, ['DIAGNOSTICO']) });
  // Preñadas: hasta la parición (la ventana del mes que viene primero).
  armar('prenadas', 'PRENADAS', de('PRENADAS'), {
    desde: ultimaReal(items, ['DIAGNOSTICO']) ?? fechaInicio,
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
