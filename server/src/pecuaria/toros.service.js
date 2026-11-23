// Los toros, uno por uno (docs/PECUARIA.md §9): cada toro se identifica por su
// caravana o nombre corto y su genética. Cuenta como una cabeza del lote de
// toros donde está (`loteId`, el último conocido): al asignarlo a un proceso
// (fase 6) se mueve con el mecanismo de siempre y se actualiza el lote.
import { prisma } from '../db.js';
import { Prisma } from '../generated/prisma/client.ts';
import { badRequest, conflict, notFound, parseId } from '../errors.js';

const esP2002 = (error) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

const incluir = {
  lote: { select: { id: true, nombre: true, activo: true, potrero: { select: { id: true, nombre: true } } } },
  asignaciones: {
    where: { hasta: null },
    select: { id: true, desde: true, proceso: { select: { id: true, nombre: true } }, potrero: { select: { id: true, nombre: true } } },
  },
};

const aToro = (t) => ({
  id: t.id,
  campoId: t.campoId,
  identificacion: t.identificacion,
  raza: t.raza,
  genetica: t.genetica,
  activo: t.activo,
  nota: t.nota,
  lote: t.lote ? { id: t.lote.id, nombre: t.lote.nombre, activo: t.lote.activo, potrero: t.lote.potrero } : null,
  // El proceso donde está ahora (si está en uno).
  enProceso: t.asignaciones[0] ? { proceso: t.asignaciones[0].proceso, potrero: t.asignaciones[0].potrero, desde: t.asignaciones[0].desde.toISOString().slice(0, 10) } : null,
});

export async function campoDeToro(id) {
  return (await prisma.toro.findUnique({ where: { id }, select: { campoId: true } }))?.campoId;
}

// El lote tiene que ser de la misma estancia y estar activo.
async function controlarLote(campoId, loteId) {
  if (loteId == null) return;
  const lote = await prisma.lote.findUnique({ where: { id: loteId }, select: { campoId: true, activo: true, nombre: true } });
  if (!lote || lote.campoId !== campoId) throw badRequest('El lote no es de esta estancia');
  if (!lote.activo) throw badRequest(`El lote ${lote.nombre} está cerrado`);
}

const repetido = (identificacion) => conflict(`Ya hay un toro "${identificacion}" en esta estancia`);

export async function listar(campoIdTexto, { todos = false } = {}) {
  const campoId = parseId(campoIdTexto);
  if (!campoId) throw notFound('Campo no encontrado');
  const filas = await prisma.toro.findMany({
    where: { campoId, ...(todos ? {} : { activo: true }) },
    include: incluir,
    orderBy: [{ activo: 'desc' }, { identificacion: 'asc' }],
  });
  return filas.map(aToro);
}

export async function crear(campoIdTexto, body) {
  const campoId = parseId(campoIdTexto);
  const campo = campoId && (await prisma.campo.findUnique({ where: { id: campoId }, select: { id: true } }));
  if (!campo) throw notFound('Campo no encontrado');
  await controlarLote(campoId, body.loteId ?? null);
  try {
    const toro = await prisma.toro.create({
      data: { campoId, identificacion: body.identificacion, raza: body.raza ?? null, genetica: body.genetica ?? null, loteId: body.loteId ?? null, nota: body.nota ?? null },
      include: incluir,
    });
    return aToro(toro);
  } catch (error) {
    if (esP2002(error)) throw repetido(body.identificacion);
    throw error;
  }
}

// Devuelve { antes, despues } (el toro como queda) para la auditoría.
export async function editar(idTexto, body) {
  const id = parseId(idTexto);
  const antes = id && (await prisma.toro.findUnique({ where: { id }, include: incluir }));
  if (!antes) throw notFound('Toro no encontrado');
  if (body.loteId !== undefined) await controlarLote(antes.campoId, body.loteId);
  if (body.activo === false && antes.asignaciones.length) {
    throw badRequest(`El toro ${antes.identificacion} está en el proceso "${antes.asignaciones[0].proceso.nombre}": sacalo del proceso antes de darlo de baja`);
  }
  try {
    const despues = await prisma.toro.update({ where: { id }, data: body, include: incluir });
    return { antes: aToro(antes), despues: aToro(despues) };
  } catch (error) {
    if (esP2002(error)) throw repetido(body.identificacion);
    throw error;
  }
}
