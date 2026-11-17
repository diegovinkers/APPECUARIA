// Movimientos de animales entre lotes (DECISIONES §10):
//   SUMAR  una parte (o todo) de un lote se suma a otro lote: toman su categoría;
//   NUEVO  una parte (o todo) forma un lote nuevo, con nombre y categoría;
//   ENTERO el lote entero cambia de potrero (mantiene su nombre; puede
//          cambiar de categoría);
//   CATEGORIA el lote entero cambia de categoría, en el mismo potrero;
//   REVERSION deshace un movimiento (ver `revertir`).
// Las entradas y salidas (ENTRADA, SALIDA) están en entradas-salidas.service.js;
// la lista, la reversión y el historial de este archivo las incluyen.
// `planificar` arma el resultado sin guardar: lo usan la vista previa y el
// registro (dentro de la transacción), así lo que se ve es lo que se guarda.
import { prisma } from '../db.js';
import { badRequest, conflict, notFound, parseId } from '../errors.js';
import { calcularPotrero } from './calculos.js';
import { aFecha, fechaISO, hoyISO } from './importaciones.service.js';
import { crearLote, crearVersion, fotoActual, nombreLibre, nombreOcupado } from './lotes.js';
import { detallePotrero, fechaUY, kgPorUg } from './stock.service.js';
import { tipoDeModo } from './tipos.repository.js';

const r2 = (n) => Math.round(n * 100) / 100;
const potreroSelect = { id: true, nombre: true, campoId: true, hectareas: true, hectareasAConfirmar: true };

async function categoriaActiva(db, id) {
  const c = await db.categoria.findUnique({ where: { id } });
  if (!c) throw badRequest('La categoría elegida no existe');
  if (!c.activo) throw badRequest(`La categoría ${c.nombre} está desactivada`);
  return c;
}

async function planificar(db, body) {
  const { loteOrigenId, cabezas: m, destinoPotreroId, modo } = body;

  const lote = await db.lote.findUnique({
    where: { id: loteOrigenId },
    include: { categoria: true, potrero: { select: potreroSelect } },
  });
  if (!lote) throw badRequest('El lote de origen no existe');
  if (!lote.activo) throw badRequest(`El lote ${lote.nombre} está cerrado: no tiene animales`);
  const origen = lote.potrero;
  const fotoOrigen = await fotoActual(db, origen.id);
  const lineaO = fotoOrigen.lineas.find((l) => l.loteId === lote.id);
  if (!lineaO) throw badRequest(`El lote ${lote.nombre} no tiene animales cargados`);
  const n = lineaO.cabezas;
  if (m > n) throw badRequest(`El lote ${lote.nombre} solo tiene ${n} cabezas`);

  const destino = await db.potrero.findUnique({ where: { id: destinoPotreroId }, select: potreroSelect });
  if (!destino) throw badRequest('El potrero de destino no existe');
  if (destino.campoId !== origen.campoId) throw badRequest('Por ahora los movimientos son dentro del mismo campo');
  const mismoPotrero = destino.id === origen.id;
  const fotoDestino = mismoPotrero ? fotoOrigen : await fotoActual(db, destino.id);

  const dia = body.fecha ?? hoyISO();
  for (const [p, foto] of [[origen, fotoOrigen], [destino, fotoDestino]]) {
    const ultima = fechaISO(foto.version?.fecha);
    if (ultima && dia < ultima) {
      throw badRequest(`La fecha no puede ser anterior al último dato de ${p.nombre} (${fechaUY(ultima)})`);
    }
  }

  // Peso: el de los que salen (si se cargó) o el promedio del lote.
  const p = lineaO.pesoPromedioKg;
  const pm = body.pesoPromedioKg ?? p;
  let pesoQuedan = p;
  if (m < n && p != null && pm != null) {
    pesoQuedan = r2((n * p - m * pm) / (n - m));
    if (!(pesoQuedan > 0)) {
      throw badRequest('Con ese peso de los que salen, el promedio de los que quedan da imposible: revisá el peso de los que salen');
    }
  }

  if (modo === 'CATEGORIA') {
    if (!mismoPotrero) throw badRequest('Para cambiar la categoría, el lote se queda en su potrero');
    if (m !== n) throw badRequest(`Para cambiar la categoría tienen que ser todas sus cabezas (${n})`);
    if (!body.categoriaId) throw badRequest('Elegí la categoría nueva');
    if (body.categoriaId === lote.categoriaId) throw badRequest(`El lote ya es ${lote.categoria.nombre}`);
    const c = await categoriaActiva(db, body.categoriaId);
    const lineas = fotoOrigen.lineas.map((l) => (l.loteId === lote.id ? { ...l, categoriaId: c.id, categoria: c.nombre } : { ...l }));
    return {
      dia,
      modo,
      cabezas: m,
      pesoPromedioKg: null,
      nota: body.nota ?? null,
      lote,
      origen,
      destino,
      mismoPotrero,
      categoriaOrigen: { id: lote.categoriaId, nombre: lote.categoria.nombre },
      categoriaDestino: { id: c.id, nombre: c.nombre },
      loteDestino: { id: lote.id, nombre: lote.nombre },
      fotoOrigen,
      fotoDestino,
      lineasOrigen: lineas,
      lineasDestino: lineas,
    };
  }

  // Las fotos nuevas de los potreros (copias de las actuales, con el cambio).
  const lineasOrigen = fotoOrigen.lineas.map((l) => ({ ...l }));
  const lineasDestino = mismoPotrero ? lineasOrigen : fotoDestino.lineas.map((l) => ({ ...l }));
  const enOrigen = lineasOrigen.find((l) => l.loteId === lote.id);
  enOrigen.cabezas = n - m;
  enOrigen.pesoPromedioKg = pesoQuedan;

  let categoriaDestino;
  let loteDestino; // { id?, nombre }
  if (modo === 'SUMAR') {
    if (!body.loteDestinoId) throw badRequest('Elegí el lote al que se suman los animales');
    if (body.loteDestinoId === lote.id) throw badRequest('No se puede sumar un lote a sí mismo');
    const d = lineasDestino.find((l) => l.loteId === body.loteDestinoId);
    if (!d) throw badRequest('El lote elegido no está en el potrero de destino');
    categoriaDestino = { id: d.categoriaId, nombre: d.categoria };
    loteDestino = { id: d.loteId, nombre: d.lote };
    d.pesoPromedioKg = d.pesoPromedioKg != null && pm != null ? r2((d.cabezas * d.pesoPromedioKg + m * pm) / (d.cabezas + m)) : null;
    d.cabezas += m;
  } else if (modo === 'NUEVO') {
    if (!body.nuevoLote?.categoriaId) throw badRequest('Elegí la categoría del lote nuevo');
    const c = await categoriaActiva(db, body.nuevoLote.categoriaId);
    categoriaDestino = { id: c.id, nombre: c.nombre };
    const nombre = body.nuevoLote.nombre?.trim();
    if (nombre && (await nombreOcupado(db, lote.campoId, nombre))) throw badRequest(`Ya existe un lote "${nombre}" en este campo`);
    loteDestino = { id: null, nombre: nombre || (await nombreLibre(db, lote.campoId, `${destino.nombre} · ${c.nombre}`)), nombreElegido: nombre };
    lineasDestino.push({ loteId: null, lote: loteDestino.nombre, categoriaId: c.id, categoria: c.nombre, cabezas: m, pesoPromedioKg: pm });
  } else {
    if (m !== n) throw badRequest(`Para mover el lote entero tienen que ser todas sus cabezas (${n})`);
    if (mismoPotrero) throw badRequest(`El lote ${lote.nombre} ya está en ${destino.nombre}`);
    const c = body.categoriaId && body.categoriaId !== lote.categoriaId ? await categoriaActiva(db, body.categoriaId) : lote.categoria;
    categoriaDestino = { id: c.id, nombre: c.nombre };
    loteDestino = { id: lote.id, nombre: lote.nombre };
    lineasDestino.push({ loteId: lote.id, lote: lote.nombre, categoriaId: c.id, categoria: c.nombre, cabezas: m, pesoPromedioKg: pm });
  }

  return {
    dia,
    modo,
    cabezas: m,
    pesoPromedioKg: body.pesoPromedioKg ?? null,
    nota: body.nota ?? null,
    lote,
    origen,
    destino,
    mismoPotrero,
    categoriaOrigen: { id: lote.categoriaId, nombre: lote.categoria.nombre },
    categoriaDestino,
    loteDestino,
    fotoOrigen,
    fotoDestino,
    lineasOrigen: lineasOrigen.filter((l) => l.cabezas > 0),
    lineasDestino: lineasDestino.filter((l) => l.cabezas > 0),
  };
}

const ha = (p) => (p.hectareas == null ? null : Number(p.hectareas));
const calc = (potrero, lineas, kg) => calcularPotrero({ hectareas: ha(potrero), hectareasAConfirmar: potrero.hectareasAConfirmar, lineas }, kg);
const sinOrden = (lineas) => lineas.map(({ orden, ...l }) => l);

export async function vistaPrevia(body) {
  const plan = await planificar(prisma, body);
  const kg = await kgPorUg();
  const lado = (potrero, foto, lineas) => ({
    potreroId: potrero.id,
    potrero: potrero.nombre,
    antes: calc(potrero, foto.lineas, kg),
    despues: calc(potrero, lineas, kg),
    lineas: sinOrden(lineas),
  });
  return {
    fecha: plan.dia,
    mismoPotrero: plan.mismoPotrero,
    loteDestino: plan.loteDestino.nombre,
    categoriaDestino: plan.categoriaDestino.nombre,
    origen: lado(plan.origen, plan.fotoOrigen, plan.lineasOrigen),
    destino: plan.mismoPotrero ? null : lado(plan.destino, plan.fotoDestino, plan.lineasDestino),
  };
}

export async function registrar(body, usuarioId) {
  const plan = await prisma.$transaction(
    async (tx) => {
      const plan = await planificar(tx, body);
      const { lote, origen, destino, dia } = plan;
      const fecha = aFecha(dia);

      if (plan.modo === 'NUEVO') {
        const nuevo = await crearLote(tx, {
          campoId: lote.campoId,
          potrero: destino,
          categoria: plan.categoriaDestino,
          nombre: plan.loteDestino.nombreElegido || plan.loteDestino.nombre,
        });
        plan.loteDestino.id = nuevo.id;
        for (const l of plan.lineasDestino) if (l.loteId === null) l.loteId = nuevo.id;
      }
      if (plan.modo === 'ENTERO' || plan.modo === 'CATEGORIA') {
        await tx.lote.update({ where: { id: lote.id }, data: { potreroId: destino.id, categoriaId: plan.categoriaDestino.id } });
      } else if (!plan.lineasOrigen.some((l) => l.loteId === lote.id)) {
        // Se movió todo: el lote de origen queda cerrado.
        await tx.lote.update({ where: { id: lote.id }, data: { activo: false } });
      }

      const comun = { fecha, origen: 'MOVIMIENTO', usuarioId, nota: plan.nota };
      const vOrigen = await crearVersion(tx, { ...comun, potreroId: origen.id, lineas: plan.lineasOrigen });
      const vDestino = plan.mismoPotrero ? vOrigen : await crearVersion(tx, { ...comun, potreroId: destino.id, lineas: plan.lineasDestino });

      const tipo = await tipoDeModo(tx, plan.modo);
      plan.movimiento = await tx.movimiento.create({
        data: {
          campoId: lote.campoId,
          tipoId: tipo.id,
          fecha,
          loteOrigenId: lote.id,
          loteDestinoId: plan.loteDestino.id,
          potreroOrigenId: origen.id,
          potreroDestinoId: destino.id,
          cabezas: plan.cabezas,
          pesoPromedioKg: plan.pesoPromedioKg,
          categoriaOrigenId: plan.categoriaOrigen.id,
          categoriaDestinoId: plan.categoriaDestino.id,
          modo: plan.modo,
          nota: plan.nota,
          versionOrigenId: vOrigen.id,
          versionDestinoId: vDestino.id,
          usuarioId,
        },
      });
      return plan;
    },
    { timeout: 30_000, maxWait: 10_000 },
  );

  const movimiento = {
    id: plan.movimiento.id,
    fecha: plan.dia,
    cabezas: plan.cabezas,
    pesoPromedioKg: plan.pesoPromedioKg,
    modo: plan.modo,
    loteOrigen: plan.lote.nombre,
    loteDestino: plan.loteDestino.nombre,
    potreroOrigen: plan.origen.nombre,
    potreroDestino: plan.destino.nombre,
    categoriaOrigen: plan.categoriaOrigen.nombre,
    categoriaDestino: plan.categoriaDestino.nombre,
  };
  return {
    movimiento,
    origen: await detallePotrero(plan.origen.id),
    destino: plan.mismoPotrero ? null : await detallePotrero(plan.destino.id),
    auditoria: {
      fecha: plan.dia,
      cabezas: plan.cabezas,
      pesoPromedioKg: plan.pesoPromedioKg,
      modo: plan.modo,
      origen: { lote: plan.lote.nombre, potrero: plan.origen.nombre },
      destino: { lote: plan.loteDestino.nombre, potrero: plan.destino.nombre },
      categoriaOrigen: plan.categoriaOrigen.nombre,
      categoriaDestino: plan.categoriaDestino.nombre,
      ...(plan.nota && { nota: plan.nota }),
    },
  };
}

// --- Lista, reversión e historial de lote ---

export const incluir = {
  loteOrigen: { select: { id: true, nombre: true } },
  loteDestino: { select: { id: true, nombre: true } },
  potreroOrigen: { select: { id: true, nombre: true } },
  potreroDestino: { select: { id: true, nombre: true } },
  usuario: { select: { nombre: true } },
  revertidoPor: { select: { id: true } },
  tipo: { select: { id: true, clave: true, nombre: true, efecto: true } },
  causa: { select: { id: true, codigo: true, nombre: true } },
  campoOtro: { select: { id: true, sigla: true, nombre: true } },
  loteMadres: { select: { id: true, nombre: true } },
};

// Los potreros que toca un movimiento, con su versión. Las entradas no tienen
// origen y las salidas no tienen destino.
const lados = (m) =>
  [
    [m.potreroOrigenId, m.versionOrigenId],
    [m.potreroDestinoId, m.versionDestinoId],
  ].filter(([potreroId]) => potreroId != null);

// La última versión de cada potrero (para saber qué se puede revertir).
async function ultimasVersiones(db, potreroIds) {
  const ultimas = new Map();
  for (const id of new Set(potreroIds.filter((p) => p != null))) {
    const v = await db.versionStock.findFirst({ where: { potreroId: id }, orderBy: [{ fecha: 'desc' }, { id: 'desc' }], select: { id: true } });
    ultimas.set(id, v?.id ?? null);
  }
  return ultimas;
}

const sePuedeRevertir = (m, ultimas) =>
  m.modo !== 'REVERSION' && !m.revertidoPor && lados(m).every(([potreroId, versionId]) => ultimas.get(potreroId) === versionId);

export async function aItems(db, movimientos) {
  const ids = [...new Set(movimientos.flatMap((m) => [m.categoriaOrigenId, m.categoriaDestinoId]).filter((c) => c != null))];
  const categorias = new Map((await db.categoria.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true } })).map((c) => [c.id, c.nombre]));
  const ultimas = await ultimasVersiones(db, movimientos.flatMap((m) => [m.potreroOrigenId, m.potreroDestinoId]));
  return movimientos.map((m) => ({
    id: m.id,
    fecha: fechaISO(m.fecha),
    modo: m.modo,
    tipo: m.tipo,
    cabezas: m.cabezas,
    pesoPromedioKg: m.pesoPromedioKg == null ? null : Number(m.pesoPromedioKg),
    loteOrigen: m.loteOrigen,
    loteDestino: m.loteDestino,
    potreroOrigen: m.potreroOrigen,
    potreroDestino: m.potreroDestino,
    categoriaOrigen: categorias.get(m.categoriaOrigenId) ?? null,
    categoriaDestino: categorias.get(m.categoriaDestinoId) ?? null,
    causa: m.causa ?? null,
    guia: m.guia ?? null,
    campoOtro: m.campoOtro ?? null,
    loteMadres: m.loteMadres ?? null,
    nota: m.nota,
    usuario: m.usuario?.nombre ?? null,
    creadoEn: m.creadoEn,
    revierteA: m.revierteAId,
    revertido: Boolean(m.revertidoPor),
    puedeRevertir: sePuedeRevertir(m, ultimas),
  }));
}

const ORDEN = [{ fecha: 'desc' }, { id: 'desc' }];

// Todos los movimientos de un campo, del más nuevo al más viejo. Filtros:
// desde / hasta (fecha), potreroId, loteId y categoriaId (de origen o de
// destino) y tipoId.
export async function listar(campoId, { desde, hasta, potreroId, loteId, categoriaId, tipoId } = {}) {
  const id = parseId(campoId);
  const campo = id && (await prisma.campo.findUnique({ where: { id }, select: { id: true } }));
  if (!campo) throw notFound('Campo no encontrado');
  const y = [{ campoId: campo.id }];
  if (tipoId) y.push({ tipoId });
  if (desde) y.push({ fecha: { gte: aFecha(desde) } });
  if (hasta) y.push({ fecha: { lte: aFecha(hasta) } });
  if (potreroId) y.push({ OR: [{ potreroOrigenId: potreroId }, { potreroDestinoId: potreroId }] });
  if (loteId) y.push({ OR: [{ loteOrigenId: loteId }, { loteDestinoId: loteId }] });
  if (categoriaId) y.push({ OR: [{ categoriaOrigenId: categoriaId }, { categoriaDestinoId: categoriaId }] });
  const movimientos = await aItems(prisma, await prisma.movimiento.findMany({ where: { AND: y }, include: incluir, orderBy: ORDEN, take: 1000 }));
  // Sin contar las reversiones ni lo que se revirtió: las cabezas movidas
  // (dentro del campo), las que entraron y las que salieron.
  const vigentes = movimientos.filter((m) => m.modo !== 'REVERSION' && !m.revertido);
  const suma = (filtro) => vigentes.filter(filtro).reduce((s, m) => s + m.cabezas, 0);
  return {
    movimientos,
    resumen: {
      movimientos: movimientos.length,
      cabezas: suma((m) => m.modo !== 'ENTRADA' && m.modo !== 'SALIDA'),
      entradas: suma((m) => m.modo === 'ENTRADA'),
      salidas: suma((m) => m.modo === 'SALIDA'),
    },
  };
}

// La versión de un potrero justo antes de otra (null: estaba vacío).
async function versionAnterior(db, potreroId, version) {
  return db.versionStock.findFirst({
    where: {
      potreroId,
      OR: [{ fecha: { lt: version.fecha } }, { fecha: version.fecha, id: { lt: version.id } }],
    },
    orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
    include: { lineas: true },
  });
}

// Deshace un movimiento: los potreros vuelven a su foto de antes y los lotes
// a su estado (potrero, categoría, activo). Se registra como un movimiento
// REVERSION; nada se borra. Solo si después no hubo otros cambios.
export async function revertir(id, usuarioId) {
  const movId = parseId(id);
  const resultado = await prisma.$transaction(
    async (tx) => {
      const m = movId && (await tx.movimiento.findUnique({ where: { id: movId }, include: { ...incluir, versionOrigen: true, versionDestino: true } }));
      if (!m) throw notFound('Movimiento no encontrado');
      if (m.modo === 'REVERSION') throw badRequest('No se puede revertir una reversión: hacé un movimiento nuevo');
      if (m.revertidoPor) throw conflict('Este movimiento ya fue revertido');
      const ultimas = await ultimasVersiones(tx, [m.potreroOrigenId, m.potreroDestinoId]);
      for (const [potrero, versionId] of [
        [m.potreroOrigen, m.versionOrigenId],
        [m.potreroDestino, m.versionDestinoId],
      ]) {
        if (potrero && ultimas.get(potrero.id) !== versionId) {
          throw conflict(`Después de este movimiento hubo otros cambios en ${potrero.nombre}: no se puede revertir solo. Corregilo con un movimiento nuevo.`);
        }
      }

      // Una entrada no tiene origen y una salida no tiene destino.
      const conOrigen = m.potreroOrigenId != null;
      const conDestino = m.potreroDestinoId != null;
      const mismo = conOrigen && m.potreroOrigenId === m.potreroDestinoId;
      const antesOrigen = conOrigen ? await versionAnterior(tx, m.potreroOrigenId, m.versionOrigen) : null;
      const antesDestino = mismo ? antesOrigen : conDestino ? await versionAnterior(tx, m.potreroDestinoId, m.versionDestino) : null;

      // Cada lote vuelve a como estaba en esas fotos (o queda cerrado si no estaba).
      for (const loteId of new Set([m.loteOrigenId, m.loteDestinoId].filter((l) => l != null))) {
        const enOrigen = antesOrigen?.lineas.find((l) => l.loteId === loteId);
        const enDestino = antesDestino?.lineas.find((l) => l.loteId === loteId);
        const linea = enOrigen ?? enDestino;
        await tx.lote.update({
          where: { id: loteId },
          data: linea
            ? { activo: true, categoriaId: linea.categoriaId, potreroId: enOrigen ? m.potreroOrigenId : m.potreroDestinoId }
            : { activo: false },
        });
      }

      const fecha = aFecha(hoyISO());
      const nota = `Reversión del movimiento del ${fechaUY(fechaISO(m.fecha))}`;
      const copiar = (v) => (v?.lineas ?? []).map((l) => ({ loteId: l.loteId, categoriaId: l.categoriaId, cabezas: l.cabezas, pesoPromedioKg: l.pesoPromedioKg }));
      const comun = { fecha, origen: 'MOVIMIENTO', usuarioId, nota };
      const vOrigen = conOrigen ? await crearVersion(tx, { ...comun, potreroId: m.potreroOrigenId, lineas: copiar(antesOrigen) }) : null;
      let vDestino = null;
      if (mismo) vDestino = vOrigen;
      else if (conDestino) vDestino = await crearVersion(tx, { ...comun, potreroId: m.potreroDestinoId, lineas: copiar(antesDestino) });

      const tipo = await tipoDeModo(tx, 'REVERSION');
      const reversion = await tx.movimiento.create({
        data: {
          campoId: m.campoId,
          tipoId: tipo.id,
          fecha,
          modo: 'REVERSION',
          revierteAId: m.id,
          loteOrigenId: m.loteDestinoId,
          loteDestinoId: m.loteOrigenId,
          potreroOrigenId: m.potreroDestinoId,
          potreroDestinoId: m.potreroOrigenId,
          cabezas: m.cabezas,
          categoriaOrigenId: m.categoriaDestinoId,
          categoriaDestinoId: m.categoriaOrigenId,
          nota,
          versionOrigenId: vDestino?.id ?? null,
          versionDestinoId: vOrigen?.id ?? null,
          usuarioId,
        },
        include: incluir,
      });
      return { m, reversion };
    },
    { timeout: 30_000, maxWait: 10_000 },
  );

  const [movimiento] = await aItems(prisma, [resultado.reversion]);
  const { m } = resultado;
  const lado = (lote, potrero) => (potrero ? { lote: lote?.nombre ?? null, potrero: potrero.nombre } : null);
  return {
    movimiento,
    origen: m.potreroOrigenId ? await detallePotrero(m.potreroOrigenId) : null,
    destino: m.potreroDestinoId && m.potreroDestinoId !== m.potreroOrigenId ? await detallePotrero(m.potreroDestinoId) : null,
    auditoria: {
      revierteA: m.id,
      fecha: movimiento.fecha,
      cabezas: m.cabezas,
      modoOriginal: m.modo,
      tipoOriginal: m.tipo.nombre,
      origen: lado(m.loteOrigen, m.potreroOrigen),
      destino: lado(m.loteDestino, m.potreroDestino),
    },
  };
}

// Un lote: dónde está, qué tiene hoy y por dónde pasó.
export async function historialLote(id) {
  const loteId = parseId(id);
  const lote =
    loteId &&
    (await prisma.lote.findUnique({
      where: { id: loteId },
      include: { categoria: { select: { nombre: true } }, potrero: { select: { id: true, nombre: true } } },
    }));
  if (!lote) throw notFound('Lote no encontrado');
  const foto = await fotoActual(prisma, lote.potreroId);
  const linea = foto.lineas.find((l) => l.loteId === lote.id);
  const movimientos = await aItems(
    prisma,
    await prisma.movimiento.findMany({ where: { OR: [{ loteOrigenId: lote.id }, { loteDestinoId: lote.id }] }, include: incluir, orderBy: ORDEN }),
  );
  return {
    lote: {
      id: lote.id,
      nombre: lote.nombre,
      activo: lote.activo,
      categoria: lote.categoria.nombre,
      potrero: lote.potrero,
      campoId: lote.campoId,
      creadoEn: lote.creadoEn,
    },
    actual: linea ? { cabezas: linea.cabezas, pesoPromedioKg: linea.pesoPromedioKg, fecha: fechaISO(foto.version.fecha) } : null,
    movimientos,
  };
}
