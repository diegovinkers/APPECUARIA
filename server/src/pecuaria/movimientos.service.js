// Movimientos de animales entre lotes (DECISIONES §10):
//   SUMAR  una parte (o todo) de un lote se suma a otro lote: toman su categoría;
//   NUEVO  una parte (o todo) forma un lote nuevo, con nombre y categoría; con
//          mismoLote, la parte sigue siendo del mismo lote (familia de lotes,
//          docs/LOGISTICA_MOVIMIENTOS.md §2): misma categoría, nombre
//          "<lote raíz> · <potrero>" y la misma raíz;
//   ENTERO el lote entero cambia de potrero (mantiene su nombre; puede
//          cambiar de categoría);
//   CATEGORIA el lote entero cambia de categoría, en el mismo potrero;
//   REVERSION deshace un movimiento (ver `revertir`).
// Las entradas y salidas (ENTRADA, SALIDA) están en entradas-salidas.service.js;
// la lista, la reversión y el historial de este archivo las incluyen.
// `planificar` arma el resultado sin guardar: lo usan la vista previa y el
// registro (dentro de la transacción), así lo que se ve es lo que se guarda.
import { prisma } from '../db.js';
import { HttpError, badRequest, conflict, notFound, parseId } from '../errors.js';
import { calcularPotrero } from './calculos.js';
import { aFecha, fechaISO, hoyISO } from './importaciones.service.js';
import { crearLote, crearVersion, fotoActual, nombreLibre, nombreOcupado } from './lotes.js';
import { detallePotrero, fechaUY, parametrosCarga } from './stock.service.js';
import { tipoDeModo, tipoPorClave } from './tipos.repository.js';

const r2 = (n) => Math.round(n * 100) / 100;
const potreroSelect = { id: true, nombre: true, campoId: true, tipo: true, hectareas: true, hectareasAConfirmar: true, areaUtilizable: true };

async function categoriaActiva(db, id) {
  const c = await db.categoria.findUnique({ where: { id } });
  if (!c) throw badRequest('La categoría elegida no existe');
  if (!c.activo) throw badRequest(`La categoría ${c.nombre} está desactivada`);
  return c;
}

// entreCampos: el destino es de otra estancia (paso 5 del rediseño). Solo se
// puede formar un lote nuevo o llevar el lote entero: el que registra puede no
// ver la estancia de destino, así que no se suma a un lote de allá.
async function planificar(db, body, { entreCampos = false } = {}) {
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
  if (entreCampos) {
    if (destino.campoId === origen.campoId) {
      throw badRequest('El destino tiene que ser de otro campo: para moverlos dentro del mismo, usá "Mover entre potreros"');
    }
    if (modo !== 'NUEVO' && modo !== 'ENTERO') throw badRequest('Entre campos se forma un lote nuevo o se lleva el lote entero');
  } else if (destino.campoId !== origen.campoId) {
    throw badRequest('El potrero de destino es de otro campo: usá "Mover entre campos"');
  }
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
  } else if (modo === 'NUEVO' && body.mismoLote) {
    if (m === n) throw badRequest(`Van todas sus cabezas (${n}): mové el lote entero`);
    if (mismoPotrero) throw badRequest('Para que siga siendo el mismo lote, la parte tiene que ir a otro potrero');
    const raizId = lote.raizId ?? lote.id;
    const raiz = lote.raizId ? await db.lote.findUnique({ where: { id: raizId }, select: { nombre: true } }) : lote;
    categoriaDestino = { id: lote.categoriaId, nombre: lote.categoria.nombre };
    loteDestino = { id: null, nombre: await nombreLibre(db, destino.campoId, `${raiz.nombre} · ${destino.nombre}`), raizId };
    lineasDestino.push({ loteId: null, lote: loteDestino.nombre, categoriaId: lote.categoriaId, categoria: lote.categoria.nombre, cabezas: m, pesoPromedioKg: pm });
  } else if (modo === 'NUEVO') {
    if (!body.nuevoLote?.categoriaId) throw badRequest('Elegí la categoría del lote nuevo');
    const c = await categoriaActiva(db, body.nuevoLote.categoriaId);
    categoriaDestino = { id: c.id, nombre: c.nombre };
    const nombre = body.nuevoLote.nombre?.trim();
    // El lote nuevo es de la estancia del destino (la misma, salvo entre campos).
    if (nombre && (await nombreOcupado(db, destino.campoId, nombre))) throw badRequest(`Ya existe un lote "${nombre}" en ese campo`);
    loteDestino = { id: null, nombre: nombre || (await nombreLibre(db, destino.campoId, `${destino.nombre} · ${c.nombre}`)), nombreElegido: nombre };
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
    entreCampos,
    pesoMovidos: pm ?? null,
    guia: entreCampos ? (body.guia ?? null) : null,
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
const calc = (potrero, lineas, kg) =>
  calcularPotrero({ hectareas: ha(potrero), hectareasAConfirmar: potrero.hectareasAConfirmar, areaUtilizable: potrero.areaUtilizable, lineas }, kg);
const sinOrden = (lineas) => lineas.map(({ orden, ...l }) => l);

export async function vistaPrevia(body) {
  const plan = await planificar(prisma, body);
  const kg = await parametrosCarga();
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

// Planifica y guarda un movimiento dentro de una transacción ya abierta. Lo
// usan mover, mover entre campos y cada paso de un movimiento múltiple.
async function aplicar(tx, body, usuarioId, { entreCampos = false, eventoId = null } = {}) {
  const plan = await planificar(tx, body, { entreCampos });
  const { lote, origen, destino, dia } = plan;
  const fecha = aFecha(dia);

  if (plan.modo === 'NUEVO') {
    const nuevo = await crearLote(tx, {
      campoId: destino.campoId,
      potrero: destino,
      categoria: plan.categoriaDestino,
      nombre: plan.loteDestino.nombreElegido || plan.loteDestino.nombre,
      raizId: plan.loteDestino.raizId ?? null,
    });
    plan.loteDestino.id = nuevo.id;
    for (const l of plan.lineasDestino) if (l.loteId === null) l.loteId = nuevo.id;
  }
  await entradaAlCorral(tx, plan, { entreCampos });
  if (plan.modo === 'ENTERO' || plan.modo === 'CATEGORIA') {
    // Entre campos, el lote entero pasa a la otra estancia.
    await tx.lote.update({ where: { id: lote.id }, data: { potreroId: destino.id, campoId: destino.campoId, categoriaId: plan.categoriaDestino.id } });
  } else if (!plan.lineasOrigen.some((l) => l.loteId === lote.id)) {
    // Se movió todo: el lote de origen queda cerrado.
    await tx.lote.update({ where: { id: lote.id }, data: { activo: false } });
  }

  const comun = { fecha, origen: 'MOVIMIENTO', usuarioId, nota: plan.nota };
  const vOrigen = await crearVersion(tx, { ...comun, potreroId: origen.id, lineas: plan.lineasOrigen });
  const vDestino = plan.mismoPotrero ? vOrigen : await crearVersion(tx, { ...comun, potreroId: destino.id, lineas: plan.lineasDestino });

  const tipo = entreCampos ? await tipoPorClave(tx, 'ENTRE_CAMPOS') : await tipoDeModo(tx, plan.modo);
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
      // Entre campos: la otra estancia (así aparece también en su lista) y la guía.
      ...(entreCampos && { campoOtroId: destino.campoId, guia: plan.guia }),
      eventoId,
      versionOrigenId: vOrigen.id,
      versionDestinoId: vDestino.id,
      usuarioId,
    },
  });
  return plan;
}

// Feedlot: cuando un lote llega a un corral, su entrada (fecha y peso) queda
// cargada si estaba vacía. Entre campos (de la estancia al feedlot), con la
// fecha del movimiento y el peso de los que llegan. Dentro del mismo campo
// (de un corral a otro), una parte que forma un lote nuevo conserva la
// entrada del lote del que salió: los animales entraron al feedlot ese día.
async function entradaAlCorral(tx, plan, { entreCampos }) {
  if (plan.destino.tipo !== 'CORRAL' || plan.mismoPotrero) return;
  const lote = await tx.lote.findUnique({ where: { id: plan.loteDestino.id }, select: { fechaEntrada: true, pesoEntradaKg: true } });
  const nuevoDeOtro = !entreCampos && plan.modo === 'NUEVO';
  const fecha = entreCampos ? aFecha(plan.dia) : nuevoDeOtro ? plan.lote.fechaEntrada : null;
  const peso = entreCampos ? (plan.pesoMovidos ?? null) : nuevoDeOtro ? plan.lote.pesoEntradaKg : null;
  const data = {
    ...(lote.fechaEntrada == null && fecha != null && { fechaEntrada: fecha }),
    ...(lote.pesoEntradaKg == null && peso != null && { pesoEntradaKg: peso }),
  };
  if (Object.keys(data).length) await tx.lote.update({ where: { id: plan.loteDestino.id }, data });
}

// Lo que se audita de un paso.
const auditoriaPaso = (plan) => ({
  fecha: plan.dia,
  cabezas: plan.cabezas,
  pesoPromedioKg: plan.pesoPromedioKg,
  modo: plan.modo,
  origen: { lote: plan.lote.nombre, potrero: plan.origen.nombre },
  destino: { lote: plan.loteDestino.nombre, potrero: plan.destino.nombre },
  categoriaOrigen: plan.categoriaOrigen.nombre,
  categoriaDestino: plan.categoriaDestino.nombre,
  ...(plan.nota && { nota: plan.nota }),
});

export async function registrar(body, usuarioId) {
  const plan = await prisma.$transaction((tx) => aplicar(tx, body, usuarioId), { timeout: 30_000, maxWait: 10_000 });
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
    auditoria: auditoriaPaso(plan),
  };
}

// --- Mover entre campos (paso 5 del rediseño) ---

// A dónde se puede mandar desde una estancia: las demás estancias activas con
// los nombres de sus potreros (nada de su stock: el que registra puede no
// tener esas estancias).
export async function destinosEntreCampos(origenCampoId) {
  return prisma.campo.findMany({
    where: { activo: true, id: { not: origenCampoId } },
    select: {
      id: true,
      sigla: true,
      nombre: true,
      potreros: { where: { activo: true }, select: { id: true, nombre: true }, orderBy: [{ orden: 'asc' }, { nombre: 'asc' }] },
    },
    orderBy: [{ orden: 'asc' }, { sigla: 'asc' }],
  });
}

const campoDe = (db, id) => db.campo.findUnique({ where: { id }, select: { id: true, sigla: true, nombre: true } });

// Del origen, el antes y el después; del destino, solo lo que llega.
export async function vistaPreviaEntreCampos(body) {
  const plan = await planificar(prisma, body, { entreCampos: true });
  const kg = await parametrosCarga();
  return {
    fecha: plan.dia,
    origen: {
      campo: await campoDe(prisma, plan.origen.campoId),
      potreroId: plan.origen.id,
      potrero: plan.origen.nombre,
      antes: calc(plan.origen, plan.fotoOrigen.lineas, kg),
      despues: calc(plan.origen, plan.lineasOrigen, kg),
      lineas: sinOrden(plan.lineasOrigen),
    },
    destino: {
      campo: await campoDe(prisma, plan.destino.campoId),
      potreroId: plan.destino.id,
      potrero: plan.destino.nombre,
      lote: plan.loteDestino.nombre,
      categoria: plan.categoriaDestino.nombre,
      cabezas: plan.cabezas,
      loteEntero: plan.modo === 'ENTERO',
    },
  };
}

export async function registrarEntreCampos(body, usuarioId) {
  const { evento, plan } = await prisma.$transaction(
    async (tx) => {
      const lote = await tx.lote.findUnique({ where: { id: body.loteOrigenId }, select: { campoId: true } });
      if (!lote) throw badRequest('El lote de origen no existe');
      const evento = await tx.eventoMovimiento.create({
        data: { tipo: 'ENTRE_CAMPOS', campoId: lote.campoId, fecha: aFecha(body.fecha ?? hoyISO()), nota: body.nota ?? null, usuarioId },
      });
      const plan = await aplicar(tx, body, usuarioId, { entreCampos: true, eventoId: evento.id });
      return { evento, plan };
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
  const campoDestino = await campoDe(prisma, plan.destino.campoId);
  return {
    evento: { id: evento.id, tipo: evento.tipo },
    movimiento: {
      id: plan.movimiento.id,
      cabezas: plan.cabezas,
      loteOrigen: plan.lote.nombre,
      potreroOrigen: plan.origen.nombre,
      campoDestino: campoDestino.nombre,
      potreroDestino: plan.destino.nombre,
      loteDestino: plan.loteDestino.nombre,
    },
    origen: await detallePotrero(plan.origen.id),
    auditoria: { evento: evento.id, campoDestino: campoDestino.sigla, ...(plan.guia && { guia: plan.guia }), ...auditoriaPaso(plan) },
  };
}

// --- Movimiento múltiple (paso 5 del rediseño) ---
// Una cadena de movimientos simples dentro de una estancia (A → B, B → C...),
// que se guardan todos juntos o ninguno. Cada paso mueve lo que había antes de
// empezar: no puede salir de un lote que recibió animales en un paso anterior.

class Simulacion extends Error {
  constructor(resultado) {
    super('simulación');
    this.resultado = resultado;
  }
}

async function aplicarMultiple(tx, body, usuarioId, eventoId, kg) {
  const recibieron = new Map(); // loteId → número de paso
  const antes = new Map(); // potreroId → { potrero, lineas } antes de empezar
  const planes = [];
  let campoId = null;
  for (const [i, paso] of body.pasos.entries()) {
    const n = i + 1;
    try {
      if (recibieron.has(paso.loteOrigenId)) {
        throw badRequest(`ese lote recibió animales en el paso ${recibieron.get(paso.loteOrigenId)}: cada paso mueve lo que había antes de empezar`);
      }
      const lote = await tx.lote.findUnique({ where: { id: paso.loteOrigenId }, select: { campoId: true, potreroId: true } });
      if (lote) {
        if (campoId === null) campoId = lote.campoId;
        else if (lote.campoId !== campoId) throw badRequest('todos los pasos tienen que ser de la misma estancia');
      }
      for (const potreroId of [lote?.potreroId, paso.destinoPotreroId]) {
        if (potreroId && !antes.has(potreroId)) {
          const p = await tx.potrero.findUnique({ where: { id: potreroId }, select: potreroSelect });
          if (p) antes.set(potreroId, { potrero: p, lineas: (await fotoActual(tx, potreroId)).lineas });
        }
      }
      const plan = await aplicar(tx, { ...paso, fecha: body.fecha, nota: body.nota }, usuarioId, { eventoId });
      recibieron.set(plan.loteDestino.id, n);
      planes.push(plan);
    } catch (error) {
      if (error instanceof HttpError) error.message = `Paso ${n}: ${error.message}`;
      throw error;
    }
  }

  // Cómo queda cada potrero que tocó la cadena, y si quedan categorías mezcladas.
  const potreros = [];
  for (const { potrero, lineas } of antes.values()) {
    const despues = (await fotoActual(tx, potrero.id)).lineas;
    const categorias = [...new Set(despues.filter((l) => l.cabezas > 0).map((l) => l.categoria))];
    potreros.push({
      potreroId: potrero.id,
      potrero: potrero.nombre,
      antes: calc(potrero, lineas, kg),
      despues: calc(potrero, despues, kg),
      lineas: sinOrden(despues),
      ...(categorias.length > 1 && { aviso: `En ${potrero.nombre} quedan juntos: ${categorias.join(', ')}` }),
    });
  }
  return { campoId, planes, potreros };
}

const resumenPaso = (plan, i) => ({
  paso: i + 1,
  cabezas: plan.cabezas,
  modo: plan.modo,
  loteOrigen: plan.lote.nombre,
  categoriaOrigen: plan.categoriaOrigen.nombre,
  potreroOrigen: plan.origen.nombre,
  potreroDestino: plan.destino.nombre,
  loteDestino: plan.loteDestino.nombre,
  categoriaDestino: plan.categoriaDestino.nombre,
});

// La vista previa hace la cadena de verdad dentro de una transacción y la
// deshace al final: lo que se ve es exactamente lo que se guardaría.
export async function vistaPreviaMultiple(body, usuarioId) {
  const kg = await parametrosCarga();
  try {
    await prisma.$transaction(
      async (tx) => {
        const r = await aplicarMultiple(tx, body, usuarioId, null, kg);
        throw new Simulacion({ fecha: body.fecha ?? hoyISO(), pasos: r.planes.map(resumenPaso), potreros: r.potreros });
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  } catch (error) {
    if (error instanceof Simulacion) return error.resultado;
    throw error;
  }
  throw new Error('La simulación no devolvió nada');
}

export async function registrarMultiple(body, usuarioId) {
  const kg = await parametrosCarga();
  const { evento, r } = await prisma.$transaction(
    async (tx) => {
      const primero = await tx.lote.findUnique({ where: { id: body.pasos[0].loteOrigenId }, select: { campoId: true } });
      if (!primero) throw badRequest('Paso 1: el lote de origen no existe');
      const evento = await tx.eventoMovimiento.create({
        data: { tipo: 'MULTIPLE', campoId: primero.campoId, fecha: aFecha(body.fecha ?? hoyISO()), nota: body.nota ?? null, usuarioId },
      });
      const r = await aplicarMultiple(tx, body, usuarioId, evento.id, kg);
      return { evento, r };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
  const pasos = r.planes.map(resumenPaso);
  return {
    evento: { id: evento.id, tipo: evento.tipo },
    pasos,
    potreros: r.potreros,
    auditoria: { evento: evento.id, fecha: fechaISO(evento.fecha), pasos, ...(body.nota && { nota: body.nota }) },
  };
}

// --- Lista, reversión e historial de lote ---

export const incluir = {
  loteOrigen: { select: { id: true, nombre: true } },
  loteDestino: { select: { id: true, nombre: true } },
  potreroOrigen: { select: { id: true, nombre: true, campoId: true, campo: { select: { sigla: true } } } },
  potreroDestino: { select: { id: true, nombre: true, campoId: true, campo: { select: { sigla: true } } } },
  usuario: { select: { nombre: true } },
  evento: { select: { id: true, tipo: true, nota: true, revierteAId: true, revertidoPor: { select: { id: true } } } },
  revertidoPor: { select: { id: true } },
  tipo: { select: { id: true, clave: true, nombre: true, efecto: true } },
  causa: { select: { id: true, codigo: true, nombre: true } },
  campo: { select: { id: true, sigla: true, nombre: true } },
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

// La última versión que dejó un evento en cada potrero que tocó (la del último
// paso que pasó por ahí). Sirve para saber si después hubo otros cambios.
function ultimasDelEvento(pasos) {
  const porPotrero = new Map();
  for (const m of [...pasos].sort((a, b) => a.id - b.id)) {
    for (const [potreroId, versionId] of lados(m)) porPotrero.set(potreroId, versionId);
  }
  return porPotrero;
}

// Para cada evento: si ya se revirtió y si se puede revertir hoy.
async function estadoEventos(db, eventoIds) {
  const estado = new Map();
  if (!eventoIds.length) return estado;
  const eventos = await db.eventoMovimiento.findMany({
    where: { id: { in: eventoIds } },
    select: {
      id: true,
      tipo: true,
      revertidoPor: { select: { id: true } },
      movimientos: { select: { id: true, potreroOrigenId: true, potreroDestinoId: true, versionOrigenId: true, versionDestinoId: true } },
    },
  });
  for (const e of eventos) {
    const deEvento = ultimasDelEvento(e.movimientos);
    const ultimas = await ultimasVersiones(db, [...deEvento.keys()]);
    const intacto = [...deEvento].every(([potreroId, versionId]) => ultimas.get(potreroId) === versionId);
    estado.set(e.id, {
      pasos: e.movimientos.length,
      revertido: Boolean(e.revertidoPor),
      puedeRevertir: e.tipo !== 'REVERSION' && !e.revertidoPor && intacto,
    });
  }
  return estado;
}

export async function aItems(db, movimientos) {
  const ids = [...new Set(movimientos.flatMap((m) => [m.categoriaOrigenId, m.categoriaDestinoId]).filter((c) => c != null))];
  const categorias = new Map((await db.categoria.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true } })).map((c) => [c.id, c.nombre]));
  const ultimas = await ultimasVersiones(db, movimientos.flatMap((m) => [m.potreroOrigenId, m.potreroDestinoId]));
  const eventos = await estadoEventos(db, [...new Set(movimientos.map((m) => m.eventoId).filter((e) => e != null))]);
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
    campo: m.campo ?? null,
    campoOtro: m.campoOtro ?? null,
    loteMadres: m.loteMadres ?? null,
    nota: m.nota,
    usuario: m.usuario?.nombre ?? null,
    creadoEn: m.creadoEn,
    revierteA: m.revierteAId,
    revertido: Boolean(m.revertidoPor),
    // Un paso de un evento no se revierte suelto: se revierte el evento entero.
    puedeRevertir: m.eventoId == null && sePuedeRevertir(m, ultimas),
    evento: m.evento ? { id: m.evento.id, tipo: m.evento.tipo, nota: m.evento.nota, revierteA: m.evento.revierteAId, ...eventos.get(m.evento.id) } : null,
  }));
}

const ORDEN = [{ fecha: 'desc' }, { id: 'desc' }];

// Todos los movimientos de un campo, del más nuevo al más viejo. Filtros:
// desde / hasta (fecha), potreroId, loteId y categoriaId (de origen o de
// destino) y tipoId.
export async function listar(campoId, filtros = {}) {
  const id = parseId(campoId);
  const campo = id && (await prisma.campo.findUnique({ where: { id }, select: { id: true } }));
  if (!campo) throw notFound('Campo no encontrado');
  return listarDonde({ id: campo.id }, filtros);
}

// Los de todas las estancias del usuario ("Todas las estancias" arriba), con
// los mismos filtros. filtro: lo de alcance.js (filtroCampos); undefined =
// todas. Un movimiento entre campos es un solo registro: aparece una vez.
export function listarTodas(filtro, filtros = {}) {
  return listarDonde(filtro, filtros);
}

// campos: el filtro de las estancias ({ id } o { id: { in } }); undefined = todas.
async function listarDonde(campos, { desde, hasta, potreroId, loteId, categoriaId, tipoId } = {}) {
  const y = [];
  // Lo de estas estancias y lo que llegó o salió entre campos (un movimiento
  // entre campos tiene un potrero en cada una).
  if (campos) y.push({ OR: [{ campo: campos }, { potreroOrigen: { campo: campos } }, { potreroDestino: { campo: campos } }] });
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

// Deshace un movimiento dentro de una transacción: los potreros vuelven a su
// foto de antes y los lotes a su estado (potrero, estancia, categoría,
// activo). Se registra como un movimiento REVERSION; nada se borra. Quien
// llama controla antes que se pueda (que después no hubo otros cambios).
async function deshacer(tx, m, usuarioId, eventoId = null) {
  // Una entrada no tiene origen y una salida no tiene destino.
  const conOrigen = m.potreroOrigenId != null;
  const conDestino = m.potreroDestinoId != null;
  const mismo = conOrigen && m.potreroOrigenId === m.potreroDestinoId;
  const antesOrigen = conOrigen ? await versionAnterior(tx, m.potreroOrigenId, m.versionOrigen) : null;
  const antesDestino = mismo ? antesOrigen : conDestino ? await versionAnterior(tx, m.potreroDestinoId, m.versionDestino) : null;

  // Cada lote vuelve a como estaba en esas fotos (o queda cerrado si no
  // estaba). Entre campos, el lote entero vuelve también a su estancia.
  for (const loteId of new Set([m.loteOrigenId, m.loteDestinoId].filter((l) => l != null))) {
    const enOrigen = antesOrigen?.lineas.find((l) => l.loteId === loteId);
    const enDestino = antesDestino?.lineas.find((l) => l.loteId === loteId);
    const linea = enOrigen ?? enDestino;
    const potrero = enOrigen ? m.potreroOrigen : m.potreroDestino;
    await tx.lote.update({
      where: { id: loteId },
      data: linea ? { activo: true, categoriaId: linea.categoriaId, potreroId: potrero.id, campoId: potrero.campoId } : { activo: false },
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
  return tx.movimiento.create({
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
      // Entre campos: así la reversión también se ve en la otra estancia.
      campoOtroId: m.campoOtroId,
      nota,
      eventoId,
      versionOrigenId: vDestino?.id ?? null,
      versionDestinoId: vOrigen?.id ?? null,
      usuarioId,
    },
    include: incluir,
  });
}

const ladoAuditoria = (lote, potrero) => (potrero ? { lote: lote?.nombre ?? null, potrero: potrero.nombre } : null);

// Revierte un movimiento suelto. Solo si después no hubo otros cambios en sus
// potreros; un paso de un evento (múltiple, entre campos) no se revierte solo.
export async function revertir(id, usuarioId) {
  const movId = parseId(id);
  const resultado = await prisma.$transaction(
    async (tx) => {
      const m = movId && (await tx.movimiento.findUnique({ where: { id: movId }, include: { ...incluir, versionOrigen: true, versionDestino: true } }));
      if (!m) throw notFound('Movimiento no encontrado');
      if (m.eventoId != null) {
        throw badRequest('Este movimiento es parte de un movimiento múltiple o entre campos: revertí el evento entero');
      }
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
      return { m, reversion: await deshacer(tx, m, usuarioId) };
    },
    { timeout: 30_000, maxWait: 10_000 },
  );

  const [movimiento] = await aItems(prisma, [resultado.reversion]);
  const { m } = resultado;
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
      origen: ladoAuditoria(m.loteOrigen, m.potreroOrigen),
      destino: ladoAuditoria(m.loteDestino, m.potreroDestino),
    },
  };
}

const NOMBRE_EVENTO = { MULTIPLE: 'movimiento múltiple', ENTRE_CAMPOS: 'movimiento entre campos', REVERSION: 'reversión' };

// La estancia de un evento (para el control de alcance de la ruta).
export async function campoDeEvento(id) {
  const evId = parseId(id);
  return evId ? ((await prisma.eventoMovimiento.findUnique({ where: { id: evId }, select: { campoId: true } }))?.campoId ?? null) : null;
}

// Revierte un evento entero (todos sus pasos, del último al primero), como un
// evento REVERSION. Solo si en ninguno de sus potreros hubo cambios después.
export async function revertirEvento(id, usuarioId) {
  const evId = parseId(id);
  const r = await prisma.$transaction(
    async (tx) => {
      const ev =
        evId &&
        (await tx.eventoMovimiento.findUnique({
          where: { id: evId },
          include: {
            revertidoPor: { select: { id: true } },
            movimientos: { include: { ...incluir, versionOrigen: true, versionDestino: true }, orderBy: { id: 'asc' } },
          },
        }));
      if (!ev) throw notFound('Evento no encontrado');
      if (ev.tipo === 'REVERSION') throw badRequest('No se puede revertir una reversión: hacé un movimiento nuevo');
      if (ev.revertidoPor) throw conflict('Este evento ya fue revertido');

      const deEvento = ultimasDelEvento(ev.movimientos);
      const ultimas = await ultimasVersiones(tx, [...deEvento.keys()]);
      for (const [potreroId, versionId] of deEvento) {
        if (ultimas.get(potreroId) !== versionId) {
          const m = ev.movimientos.find((x) => x.potreroOrigenId === potreroId || x.potreroDestinoId === potreroId);
          const nombre = (m.potreroOrigenId === potreroId ? m.potreroOrigen : m.potreroDestino).nombre;
          throw conflict(`Después de este ${NOMBRE_EVENTO[ev.tipo]} hubo otros cambios en ${nombre}: no se puede revertir. Corregilo con un movimiento nuevo.`);
        }
      }

      const reversion = await tx.eventoMovimiento.create({
        data: {
          tipo: 'REVERSION',
          campoId: ev.campoId,
          fecha: aFecha(hoyISO()),
          nota: `Reversión del ${NOMBRE_EVENTO[ev.tipo]} del ${fechaUY(fechaISO(ev.fecha))}`,
          revierteAId: ev.id,
          usuarioId,
        },
      });
      const pasos = [];
      for (const m of [...ev.movimientos].reverse()) pasos.push(await deshacer(tx, m, usuarioId, reversion.id));
      return { ev, reversion, pasos };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );

  return {
    evento: { id: r.reversion.id, tipo: 'REVERSION', revierteA: r.ev.id },
    movimientos: await aItems(prisma, r.pasos),
    auditoria: {
      revierteA: r.ev.id,
      tipoOriginal: r.ev.tipo,
      fechaOriginal: fechaISO(r.ev.fecha),
      pasos: r.ev.movimientos.map((m) => ({
        cabezas: m.cabezas,
        origen: ladoAuditoria(m.loteOrigen, m.potreroOrigen),
        destino: ladoAuditoria(m.loteDestino, m.potreroDestino),
      })),
    },
  };
}

// Un lote: dónde está, qué tiene hoy y por dónde pasó.
// La familia de un lote (docs/LOGISTICA_MOVIMIENTOS.md §2): los lotes activos
// con la misma raíz, con sus cabezas de hoy. null si no está repartido.
// puede(campoId): las partes de estancias que el usuario no tiene solo se cuentan.
async function familiaDe(lote, puede) {
  const raizId = lote.raizId ?? lote.id;
  const miembros = await prisma.lote.findMany({
    where: { activo: true, OR: [{ id: raizId }, { raizId }] },
    include: { categoria: { select: { nombre: true } }, potrero: { select: { id: true, nombre: true } } },
    orderBy: { id: 'asc' },
  });
  if (miembros.length < 2) return null;
  const partes = [];
  let otrasEstancias = 0;
  let cabezas = 0;
  for (const l of miembros) {
    if (!puede(l.campoId)) {
      otrasEstancias += 1;
      continue;
    }
    const linea = (await fotoActual(prisma, l.potreroId)).lineas.find((x) => x.loteId === l.id);
    const n = linea?.cabezas ?? 0;
    cabezas += n;
    partes.push({ id: l.id, nombre: l.nombre, potrero: l.potrero, categoria: l.categoria.nombre, cabezas: n, pesoPromedioKg: linea?.pesoPromedioKg ?? null });
  }
  const raiz = miembros.find((l) => l.id === raizId) ?? (await prisma.lote.findUnique({ where: { id: raizId }, select: { id: true, nombre: true } }));
  return { raiz: { id: raiz.id, nombre: raiz.nombre }, partes, cabezas, otrasEstancias };
}

export async function historialLote(id, { puede = () => true } = {}) {
  const loteId = parseId(id);
  const lote =
    loteId &&
    (await prisma.lote.findUnique({
      where: { id: loteId },
      include: { categoria: { select: { nombre: true } }, potrero: { select: { id: true, nombre: true, tipo: true } } },
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
      // Feedlot: la entrada al corral.
      fechaEntrada: fechaISO(lote.fechaEntrada),
      pesoEntradaKg: lote.pesoEntradaKg == null ? null : Number(lote.pesoEntradaKg),
    },
    actual: linea ? { cabezas: linea.cabezas, pesoPromedioKg: linea.pesoPromedioKg, fecha: fechaISO(foto.version.fecha) } : null,
    familia: await familiaDe(lote, puede),
    movimientos,
  };
}
