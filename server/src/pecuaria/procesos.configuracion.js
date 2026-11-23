// La configuración de los procesos (docs/PECUARIA.md §9): el plazo y el aviso
// de cada etapa y los nombres de los estados. Se edita en Configuración →
// Procesos; lo que falta en la base sale de los valores iniciales.
import { prisma } from '../db.js';
import { badRequest } from '../errors.js';
import { ESTADOS_INICIALES, LIMITES, TEXTO_DESDE, completarPlazos } from './procesos.plazos.js';

// { FIN_SERVICIO: { nombre, plazo, unidad, desde, avisoDias, orden }, ... }
export async function plazosProceso(db = prisma, tipoProceso = 'REPRODUCTIVO') {
  return completarPlazos(await db.etapaPlantilla.findMany({ where: { tipoProceso } }));
}

// { VIENTRES: 'Servida', PRENADAS: 'Preñada', ... }
export async function estadosProceso(db = prisma) {
  const filas = await db.estadoReproductivo.findMany();
  const nombres = Object.fromEntries(Object.entries(ESTADOS_INICIALES).map(([rol, e]) => [rol, e.nombre]));
  for (const f of filas) nombres[f.rol] = f.nombre;
  return nombres;
}

// Para la pantalla: las etapas en orden (con el texto de "desde" y los
// límites) y los estados en orden.
export async function leerConfiguracion(db = prisma) {
  const plazos = await plazosProceso(db);
  const nombres = await estadosProceso(db);
  return {
    etapas: Object.entries(plazos)
      .map(([clave, e]) => ({ clave, ...e, textoDesde: TEXTO_DESDE[e.desde] ?? e.desde }))
      .sort((a, b) => a.orden - b.orden),
    estados: Object.entries(ESTADOS_INICIALES)
      .sort(([, a], [, b]) => a.orden - b.orden)
      .map(([rol]) => ({ rol, nombre: nombres[rol] })),
    limites: LIMITES,
  };
}

// Guarda todo junto o nada. body: { etapas?: [{ clave, nombre?, plazo?, avisoDias? }],
// estados?: [{ rol, nombre }] }. La unidad y el "desde" no se editan.
// Devuelve { antes, despues } para la auditoría (solo lo que cambió).
export async function guardarConfiguracion(body) {
  return prisma.$transaction(async (tx) => {
    const plazos = await plazosProceso(tx);
    const nombres = await estadosProceso(tx);
    const antes = {};
    const despues = {};

    for (const e of body.etapas ?? []) {
      const actual = plazos[e.clave];
      if (!actual) throw badRequest(`No existe la etapa ${e.clave}`);
      const nuevo = { nombre: e.nombre ?? actual.nombre, plazo: e.plazo ?? actual.plazo, avisoDias: e.avisoDias ?? actual.avisoDias };
      const { min, max } = LIMITES[actual.unidad];
      const unidad = actual.unidad === 'MESES' ? 'meses' : 'días';
      if (nuevo.plazo < min || nuevo.plazo > max) throw badRequest(`${nuevo.nombre}: el plazo va de ${min} a ${max} ${unidad}`);
      if (nuevo.avisoDias < LIMITES.aviso.min || nuevo.avisoDias > LIMITES.aviso.max) {
        throw badRequest(`${nuevo.nombre}: el aviso va de ${LIMITES.aviso.min} a ${LIMITES.aviso.max} días antes`);
      }
      const cambio = ['nombre', 'plazo', 'avisoDias'].filter((k) => nuevo[k] !== actual[k]);
      if (!cambio.length) continue;
      antes[e.clave] = Object.fromEntries(cambio.map((k) => [k, actual[k]]));
      despues[e.clave] = Object.fromEntries(cambio.map((k) => [k, nuevo[k]]));
      await tx.etapaPlantilla.upsert({
        where: { tipoProceso_clave: { tipoProceso: 'REPRODUCTIVO', clave: e.clave } },
        update: nuevo,
        create: { tipoProceso: 'REPRODUCTIVO', clave: e.clave, unidad: actual.unidad, desde: actual.desde, orden: actual.orden, ...nuevo },
      });
    }

    for (const e of body.estados ?? []) {
      if (!(e.rol in ESTADOS_INICIALES)) throw badRequest(`No existe el estado ${e.rol}`);
      if (e.nombre === nombres[e.rol]) continue;
      antes[e.rol] = { nombre: nombres[e.rol] };
      despues[e.rol] = { nombre: e.nombre };
      await tx.estadoReproductivo.upsert({ where: { rol: e.rol }, update: { nombre: e.nombre }, create: { rol: e.rol, nombre: e.nombre, orden: ESTADOS_INICIALES[e.rol].orden } });
    }

    const nombresRepetidos = Object.values(await estadosProceso(tx)).map((n) => n.trim().toLowerCase());
    if (new Set(nombresRepetidos).size !== nombresRepetidos.length) throw badRequest('Dos estados no pueden tener el mismo nombre');

    return { antes, despues, cambio: Object.keys(despues).length > 0 };
  });
}
