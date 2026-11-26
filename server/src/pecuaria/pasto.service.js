// Pasto de los potreros (docs/superpowers/plans/2026-11-26-pasto.md).
//
// Se anota de dos maneras, siempre opcional:
//   - al mover (`pastoOrigen` y `pastoDestino` del movimiento): una lectura
//     SALIDA en el potrero de origen y una ENTRADA en el de destino, colgadas
//     del movimiento. Si se revierte el movimiento, se anulan con él;
//   - en una recorrida, sin mover ganado: varios potreros de una estancia de
//     una vez (comparten `grupoId`). Se anulan de a una.
// Los corrales y los feedlots no llevan pasto.
import { randomUUID } from 'node:crypto';
import { prisma } from '../db.js';
import { Prisma } from '../generated/prisma/client.ts';
import { badRequest, conflict, notFound, parseId } from '../errors.js';
import { aFecha, fechaISO, hoyISO } from './importaciones.service.js';
import { descanso, llevaPasto, nombreAltura, ultimaLectura } from './pasto.js';

const potreroSelect = { id: true, nombre: true, campoId: true, tipo: true, activo: true, campo: { select: { tipo: true } } };

const aLectura = (l) => ({
  id: l.id,
  potreroId: l.potreroId,
  fecha: fechaISO(l.fecha),
  altura: l.altura,
  momento: l.momento,
  movimientoId: l.movimientoId,
  grupoId: l.grupoId,
  nota: l.nota,
  anulada: l.anulada,
  usuario: l.usuario?.nombre ?? null,
  creadoEn: l.creadoEn,
});

const sinCorrales = (potrero) => {
  if (!llevaPasto(potrero)) throw badRequest(`${potrero.nombre} es un corral: no lleva pasto`);
};

// --- Al mover ---

// Controla el pasto de un movimiento antes de guardarlo (también en la vista
// previa). plan: el de planificar() (origen, destino, mismoPotrero, modo).
// Devuelve { origen, destino } con lo que se va a anotar, o null.
export async function pastoDelMovimiento(db, plan, body) {
  const { pastoOrigen = null, pastoDestino = null } = body;
  if (!pastoOrigen && !pastoDestino) return null;
  // En el mismo potrero (cambio de categoría) no hay entrada ni salida.
  if (plan.mismoPotrero || plan.modo === 'CATEGORIA') return null;
  const potreros = await db.potrero.findMany({ where: { id: { in: [plan.origen.id, plan.destino.id] } }, select: potreroSelect });
  const de = (id) => potreros.find((p) => p.id === id);
  if (pastoOrigen) sinCorrales(de(plan.origen.id));
  if (pastoDestino) sinCorrales(de(plan.destino.id));
  return {
    origen: pastoOrigen ? { potreroId: plan.origen.id, potrero: plan.origen.nombre, campoId: plan.origen.campoId, altura: pastoOrigen } : null,
    destino: pastoDestino ? { potreroId: plan.destino.id, potrero: plan.destino.nombre, campoId: plan.destino.campoId, altura: pastoDestino } : null,
  };
}

// Guarda las lecturas de un movimiento ya creado (dentro de su transacción).
export async function guardarPastoMovimiento(tx, pasto, movimiento, usuarioId) {
  if (!pasto) return;
  const lados = [
    [pasto.origen, 'SALIDA'],
    [pasto.destino, 'ENTRADA'],
  ];
  for (const [lado, momento] of lados) {
    if (!lado) continue;
    await tx.lecturaPasto.create({
      data: {
        potreroId: lado.potreroId,
        campoId: lado.campoId,
        fecha: movimiento.fecha,
        altura: lado.altura,
        momento,
        movimientoId: movimiento.id,
        usuarioId,
      },
    });
  }
}

// Lo que se audita y se muestra en la vista previa: { salida: 'Bajo en P1', ... }.
export const textoPastoMovimiento = (pasto) =>
  pasto && {
    ...(pasto.origen && { salida: `${nombreAltura(pasto.origen.altura)} en ${pasto.origen.potrero}` }),
    ...(pasto.destino && { entrada: `${nombreAltura(pasto.destino.altura)} en ${pasto.destino.potrero}` }),
  };

// Al revertir: las lecturas de esos movimientos quedan anuladas.
export async function anularPastoDeMovimientos(tx, movimientoIds, usuarioId) {
  if (!movimientoIds.length) return 0;
  const r = await tx.lecturaPasto.updateMany({
    where: { movimientoId: { in: movimientoIds }, anulada: false },
    data: { anulada: true, anuladaEn: new Date(), anuladaPorId: usuarioId },
  });
  return r.count;
}

// --- Recorrida ---

// body: { fecha?, lecturas: [{ potreroId, altura }], nota? }
export async function registrarRecorrida(body, usuarioId) {
  const ids = body.lecturas.map((l) => l.potreroId);
  if (new Set(ids).size !== ids.length) throw badRequest('Hay un potrero elegido dos veces');
  const potreros = await prisma.potrero.findMany({ where: { id: { in: ids } }, select: potreroSelect });
  if (potreros.length !== ids.length) throw badRequest('Hay potreros elegidos que no existen');
  const campoId = potreros[0].campoId;
  if (potreros.some((p) => p.campoId !== campoId)) throw badRequest('Los potreros tienen que ser de la misma estancia');
  for (const p of potreros) {
    if (!p.activo) throw badRequest(`${p.nombre} está dado de baja`);
    sinCorrales(p);
  }
  const fecha = body.fecha ?? hoyISO();
  const grupoId = randomUUID();
  const nombre = new Map(potreros.map((p) => [p.id, p.nombre]));
  const creadas = await prisma.$transaction(
    body.lecturas.map((l) =>
      prisma.lecturaPasto.create({
        data: { potreroId: l.potreroId, campoId, fecha: aFecha(fecha), altura: l.altura, momento: 'RECORRIDA', grupoId, nota: body.nota ?? null, usuarioId },
      }),
    ),
  );
  return {
    grupoId,
    fecha,
    lecturas: creadas.map(aLectura),
    auditoria: {
      grupoId,
      fecha,
      campoId,
      lecturas: body.lecturas.map((l) => ({ potrero: nombre.get(l.potreroId), altura: l.altura })),
      ...(body.nota && { nota: body.nota }),
    },
  };
}

// La estancia de una lectura (para el alcance de la ruta). null si no existe.
export async function campoDeLectura(id) {
  const lid = parseId(id);
  return lid ? ((await prisma.lecturaPasto.findUnique({ where: { id: lid }, select: { campoId: true } }))?.campoId ?? null) : null;
}

// Anula una lectura de una recorrida. Las de un movimiento se anulan
// revirtiendo el movimiento.
export async function anularLectura(id, usuarioId) {
  const lid = parseId(id);
  const l = lid && (await prisma.lecturaPasto.findUnique({ where: { id: lid }, include: { potrero: { select: { nombre: true } } } }));
  if (!l) throw notFound('Lectura de pasto no encontrada');
  if (l.anulada) throw conflict('Esta lectura ya está anulada');
  if (l.movimientoId != null) throw badRequest('Esta lectura se anotó con un movimiento: se anula revirtiendo el movimiento');
  const anulada = await prisma.lecturaPasto.update({
    where: { id: l.id },
    data: { anulada: true, anuladaEn: new Date(), anuladaPorId: usuarioId },
    include: { usuario: { select: { nombre: true } } },
  });
  return {
    lectura: aLectura(anulada),
    auditoria: { id: l.id, potrero: l.potrero.nombre, fecha: fechaISO(l.fecha), altura: l.altura, momento: l.momento, grupoId: l.grupoId },
  };
}

// --- Para las listas y las fichas ---

// Las lecturas de un potrero, de la más nueva a la más vieja (con las anuladas).
export async function lecturasDePotrero(potreroId, { limite = 30 } = {}) {
  const rows = await prisma.lecturaPasto.findMany({
    where: { potreroId },
    orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
    take: limite,
    include: { usuario: { select: { nombre: true } } },
  });
  return rows.map(aLectura);
}

// Las lecturas (no anuladas) de unos movimientos en un potrero:
// Map movimientoId → { salida?, entrada? } (la altura).
export async function pastoDeMovimientos(potreroId, movimientoIds) {
  const mapa = new Map();
  if (!movimientoIds.length) return mapa;
  const rows = await prisma.lecturaPasto.findMany({
    where: { potreroId, movimientoId: { in: movimientoIds }, anulada: false },
    select: { movimientoId: true, momento: true, altura: true },
  });
  for (const r of rows) {
    const clave = r.momento === 'SALIDA' ? 'salida' : 'entrada';
    mapa.set(r.movimientoId, { ...mapa.get(r.movimientoId), [clave]: r.altura });
  }
  return mapa;
}

// El último pasto y el descanso de varios potreros, con dos consultas en total.
// Map potreroId → { pasto: { altura, fecha, momento } | null, descanso }
export async function pastoYDescanso(potreroIds, hoy = hoyISO()) {
  const resultado = new Map(potreroIds.map((id) => [id, { pasto: null, descanso: null }]));
  if (!potreroIds.length) return resultado;
  const [lecturas, versiones] = await Promise.all([
    // La última de cada potrero (no anulada).
    prisma.$queryRaw`
      SELECT DISTINCT ON (potrero_id) id, potrero_id AS "potreroId", to_char(fecha, 'YYYY-MM-DD') AS fecha, altura::text AS altura, momento::text AS momento
      FROM lectura_pasto
      WHERE anulada = false AND potrero_id IN (${Prisma.join(potreroIds)})
      ORDER BY potrero_id, fecha DESC, id DESC`,
    // Cada versión de stock con sus cabezas totales, en orden.
    prisma.$queryRaw`
      SELECT v.potrero_id AS "potreroId", to_char(v.fecha, 'YYYY-MM-DD') AS fecha, v.origen::text AS origen, COALESCE(SUM(l.cabezas), 0)::int AS cabezas
      FROM version_stock v
      LEFT JOIN version_stock_linea l ON l.version_id = v.id
      WHERE v.potrero_id IN (${Prisma.join(potreroIds)})
      GROUP BY v.id
      ORDER BY v.potrero_id, v.fecha, v.id`,
  ]);
  for (const l of lecturas) {
    resultado.get(l.potreroId).pasto = { altura: l.altura, fecha: l.fecha, momento: l.momento };
  }
  const porPotrero = new Map();
  for (const v of versiones) porPotrero.set(v.potreroId, [...(porPotrero.get(v.potreroId) ?? []), v]);
  for (const [id, lista] of porPotrero) resultado.get(id).descanso = descanso(lista, hoy);
  return resultado;
}

// Lo mismo para un solo potrero, con la última lectura de la lista completa.
export async function pastoDePotrero(potreroId) {
  const [lecturas, mapa] = await Promise.all([lecturasDePotrero(potreroId, { limite: 30 }), pastoYDescanso([potreroId])]);
  const ultima = ultimaLectura(lecturas);
  return {
    pasto: ultima && { altura: ultima.altura, fecha: ultima.fecha, momento: ultima.momento },
    descanso: mapa.get(potreroId).descanso,
    lecturas,
  };
}

// Para la ruta: 404 si el potrero no existe.
export async function pastoDePotreroPorId(id) {
  const potreroId = parseId(id);
  const existe = potreroId && (await prisma.potrero.findUnique({ where: { id: potreroId }, select: { id: true } }));
  if (!existe) throw notFound('Potrero no encontrado');
  return pastoDePotrero(potreroId);
}
