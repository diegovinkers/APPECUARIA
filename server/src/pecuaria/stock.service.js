// Detalle de un potrero, su historial, y los cambios a mano: stock (por lote)
// y uso de suelo. Cada cambio agrega filas; nada se pisa ni se borra.
import { prisma } from '../db.js';
import { badRequest, conflict, notFound, parseId } from '../errors.js';
import { calcularPotrero, kilosLinea } from './calculos.js';
import { aFecha, fechaISO, hoyISO } from './importaciones.service.js';
import { crearLote, crearVersion, nombreOcupado } from './lotes.js';

export const fechaUY = (iso) => iso.split('-').reverse().join('/');

export async function kgPorUg(db = prisma) {
  const p = await db.parametro.findUnique({ where: { clave: 'KG_POR_UG' } });
  return p ? Number(p.valor) : 380;
}

const lineaSelect = {
  loteId: true,
  categoriaId: true,
  cabezas: true,
  pesoPromedioKg: true,
  lote: { select: { nombre: true } },
  categoria: { select: { nombre: true, orden: true } },
};

// Por categoría (en el orden del catálogo) y, dentro de cada una, por nombre de lote.
const ordenarLineas = (lineas) =>
  [...lineas].sort(
    (a, b) => a.categoria.orden - b.categoria.orden || a.categoria.nombre.localeCompare(b.categoria.nombre) || a.lote.nombre.localeCompare(b.lote.nombre),
  );

const toLinea = (l) => {
  const linea = {
    loteId: l.loteId,
    lote: l.lote.nombre,
    categoriaId: l.categoriaId,
    categoria: l.categoria.nombre,
    cabezas: l.cabezas,
    pesoPromedioKg: l.pesoPromedioKg == null ? null : Number(l.pesoPromedioKg),
  };
  return { ...linea, kilos: kilosLinea(linea) };
};

const ULTIMA = { orderBy: [{ fecha: 'desc' }, { id: 'desc' }], take: 1 };

async function buscarPotrero(id) {
  const potreroId = parseId(id);
  const potrero =
    potreroId &&
    (await prisma.potrero.findUnique({
      where: { id: potreroId },
      select: {
        id: true,
        campoId: true,
        nombre: true,
        tipo: true,
        hectareas: true,
        hectareasAConfirmar: true,
        idAreaManejoCigam: true,
        activo: true,
        orden: true,
        campo: { select: { id: true, sigla: true, nombre: true } },
        subdivisiones: { select: { id: true, codigo: true, idTalhaoCigam: true }, orderBy: { id: 'asc' } },
        usos: { where: { hasta: null }, orderBy: { desde: 'desc' }, take: 1, select: { desde: true, usoSuelo: true } },
        versionesStock: {
          ...ULTIMA,
          select: {
            id: true,
            fecha: true,
            origen: true,
            nota: true,
            usuario: { select: { nombre: true } },
            lineas: { select: lineaSelect },
          },
        },
      },
    }));
  if (!potrero) throw notFound('Potrero no encontrado');
  return potrero;
}

export async function detallePotrero(id) {
  const { usos, versionesStock, hectareas, ...p } = await buscarPotrero(id);
  const [uso] = usos;
  const [version] = versionesStock;
  const kg = await kgPorUg();
  const ha = hectareas == null ? null : Number(hectareas);
  let stock = null;
  if (version) {
    const lineas = ordenarLineas(version.lineas).map(toLinea);
    stock = {
      versionId: version.id,
      fecha: fechaISO(version.fecha),
      origen: version.origen,
      nota: version.nota,
      usuario: version.usuario?.nombre ?? null,
      lineas,
      ...calcularPotrero({ hectareas: ha, hectareasAConfirmar: p.hectareasAConfirmar, lineas }, kg),
    };
  }
  return {
    ...p,
    hectareas: ha,
    usoActual: uso
      ? { id: uso.usoSuelo.id, nombre: uso.usoSuelo.nombre, grupo: uso.usoSuelo.grupo, desde: fechaISO(uso.desde) }
      : null,
    stock,
    kgPorUg: kg,
  };
}

// Cómo se cuenta un movimiento en el historial de cada potrero.
function textoMovimiento(m, potreroId) {
  const cab = `${m.cabezas} ${m.categoriaOrigen.nombre}`;
  const como = m.categoriaDestinoId !== m.categoriaOrigenId ? `, como ${m.categoriaDestino.nombre}` : '';
  if (m.potreroOrigenId === m.potreroDestinoId) {
    return `Se separaron ${cab} del lote ${m.loteOrigen.nombre} al lote ${m.loteDestino.nombre}${como}`;
  }
  if (m.modo === 'ENTERO') {
    return m.potreroOrigenId === potreroId
      ? `Salió el lote ${m.loteOrigen.nombre} entero (${cab}) hacia ${m.potreroDestino.nombre}`
      : `Llegó el lote ${m.loteOrigen.nombre} entero (${cab}) desde ${m.potreroOrigen.nombre}${como}`;
  }
  return m.potreroOrigenId === potreroId
    ? `Salieron ${cab} del lote ${m.loteOrigen.nombre} hacia ${m.potreroDestino.nombre} (lote ${m.loteDestino.nombre})`
    : `Llegaron ${cab} desde ${m.potreroOrigen.nombre} (lote ${m.loteOrigen.nombre}) al lote ${m.loteDestino.nombre}${como}`;
}

export async function historialPotrero(id) {
  const potrero = await buscarPotrero(id);
  const [versiones, usos, movimientos] = await Promise.all([
    prisma.versionStock.findMany({
      where: { potreroId: potrero.id },
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        fecha: true,
        origen: true,
        nota: true,
        creadoEn: true,
        usuario: { select: { nombre: true } },
        importacion: { select: { archivo: true, hoja: true } },
        lineas: { select: lineaSelect },
      },
    }),
    prisma.potreroUso.findMany({
      where: { potreroId: potrero.id },
      orderBy: [{ desde: 'desc' }, { id: 'desc' }],
      select: { desde: true, hasta: true, usuario: { select: { nombre: true } }, usoSuelo: { select: { id: true, nombre: true, grupo: true } } },
    }),
    prisma.movimiento.findMany({
      where: { OR: [{ potreroOrigenId: potrero.id }, { potreroDestinoId: potrero.id }] },
      include: {
        loteOrigen: { select: { nombre: true } },
        loteDestino: { select: { nombre: true } },
        potreroOrigen: { select: { nombre: true } },
        potreroDestino: { select: { nombre: true } },
      },
    }),
  ]);
  const ids = [...new Set(movimientos.flatMap((m) => [m.categoriaOrigenId, m.categoriaDestinoId]))];
  const nombres = new Map((await prisma.categoria.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true } })).map((c) => [c.id, c]));
  const porVersion = new Map();
  for (const m of movimientos) {
    m.categoriaOrigen = nombres.get(m.categoriaOrigenId);
    m.categoriaDestino = nombres.get(m.categoriaDestinoId);
    const vid = m.potreroOrigenId === potrero.id ? m.versionOrigenId : m.versionDestinoId;
    porVersion.set(vid, textoMovimiento(m, potrero.id));
  }
  return {
    versiones: versiones.map((v) => {
      const lineas = ordenarLineas(v.lineas).map(toLinea);
      return {
        id: v.id,
        fecha: fechaISO(v.fecha),
        origen: v.origen,
        nota: v.nota,
        creadoEn: v.creadoEn,
        usuario: v.usuario?.nombre ?? null,
        importacion: v.importacion,
        movimiento: porVersion.get(v.id) ?? null,
        lineas,
        cabezas: lineas.reduce((s, l) => s + l.cabezas, 0),
      };
    }),
    usos: usos.map((u) => ({
      uso: u.usoSuelo,
      desde: fechaISO(u.desde),
      hasta: fechaISO(u.hasta),
      usuario: u.usuario?.nombre ?? null,
    })),
  };
}

const resumenLineas = (lineas) =>
  lineas.map((l) => ({ lote: l.lote, categoria: l.categoria, cabezas: l.cabezas, pesoPromedioKg: l.pesoPromedioKg }));

// Guarda una foto nueva del potrero (a mano), lote por lote. Cada línea es un
// lote del potrero ({ loteId }) o uno nuevo ({ nombreLote? }). La categoría de
// un lote existente se puede cambiar (recategorización). Los lotes del potrero
// que no vienen, o vienen en 0, quedan cerrados.
export async function guardarStock(id, { fecha, lineas, nota }, usuarioId) {
  const potrero = await buscarPotrero(id);
  const antes = await detallePotrero(potrero.id);
  const dia = fecha ?? hoyISO();

  const categorias = new Map(
    (
      await prisma.categoria.findMany({
        where: { id: { in: lineas.map((l) => l.categoriaId) } },
        select: { id: true, nombre: true, activo: true },
      })
    ).map((c) => [c.id, c]),
  );
  const lotesDelPotrero = new Map(
    (await prisma.lote.findMany({ where: { potreroId: potrero.id, activo: true } })).map((l) => [l.id, l]),
  );
  const vistos = new Set();
  for (const l of lineas) {
    const c = categorias.get(l.categoriaId);
    if (!c) throw badRequest(`La categoría elegida (${l.categoriaId}) no existe`);
    if (l.loteId != null) {
      const lote = lotesDelPotrero.get(l.loteId) ?? (await prisma.lote.findUnique({ where: { id: l.loteId } }));
      if (!lote || !lotesDelPotrero.has(l.loteId)) throw badRequest(`El lote ${lote?.nombre ?? l.loteId} no está en este potrero`);
      if (vistos.has(l.loteId)) throw badRequest(`El lote ${lote.nombre} aparece dos veces`);
      vistos.add(l.loteId);
      if (!c.activo && c.id !== lote.categoriaId) throw badRequest(`La categoría ${c.nombre} está desactivada`);
    } else if (!c.activo) {
      throw badRequest(`La categoría ${c.nombre} está desactivada`);
    }
  }

  const despuesLineas = await prisma.$transaction(async (tx) => {
    const finales = [];
    for (const l of lineas) {
      const c = categorias.get(l.categoriaId);
      let loteId = l.loteId;
      let nombreLote;
      if (loteId != null) {
        const lote = lotesDelPotrero.get(loteId);
        nombreLote = lote.nombre;
        if (lote.categoriaId !== c.id) await tx.lote.update({ where: { id: loteId }, data: { categoriaId: c.id } });
        if (l.cabezas === 0) await tx.lote.update({ where: { id: loteId }, data: { activo: false } });
      } else {
        if (l.cabezas === 0) continue;
        const nuevo = await crearLote(tx, { campoId: potrero.campoId, potrero, categoria: c, nombre: l.nombreLote });
        loteId = nuevo.id;
        nombreLote = nuevo.nombre;
      }
      if (l.cabezas > 0) {
        finales.push({ loteId, lote: nombreLote, categoriaId: c.id, categoria: c.nombre, cabezas: l.cabezas, pesoPromedioKg: l.pesoPromedioKg ?? null });
      }
    }
    // Los lotes del potrero que no vinieron quedan cerrados.
    await tx.lote.updateMany({
      where: { potreroId: potrero.id, activo: true, id: { notIn: finales.map((f) => f.loteId) } },
      data: { activo: false },
    });
    await crearVersion(tx, { potreroId: potrero.id, fecha: aFecha(dia), origen: 'MANUAL', lineas: finales, usuarioId, nota });
    return finales;
  });

  const despues = await detallePotrero(potrero.id);
  const aviso =
    antes.stock && dia < antes.stock.fecha
      ? `Guardado con fecha ${fechaUY(dia)}, pero hay un dato más nuevo (${fechaUY(antes.stock.fecha)}): el stock actual sigue siendo ese`
      : null;
  return {
    potrero: despues,
    aviso,
    auditoria: {
      fecha: dia,
      antes: antes.stock ? resumenLineas(antes.stock.lineas) : [],
      despues: resumenLineas(despuesLineas),
      ...(nota && { nota }),
    },
  };
}

// Cierra el uso vigente y abre el nuevo desde la fecha (por defecto, hoy).
export async function cambiarUso(id, { usoSueloId, desde }, usuarioId) {
  const potrero = await buscarPotrero(id);
  const uso = await prisma.usoSuelo.findUnique({ where: { id: usoSueloId } });
  if (!uso) throw badRequest('El uso de suelo elegido no existe');
  if (!uso.activo) throw badRequest(`El uso de suelo ${uso.nombre} está desactivado`);

  const dia = desde ?? hoyISO();
  const vigente = await prisma.potreroUso.findFirst({
    where: { potreroId: potrero.id, hasta: null },
    orderBy: { desde: 'desc' },
    include: { usoSuelo: { select: { nombre: true } } },
  });
  if (vigente) {
    if (vigente.usoSueloId === uso.id) throw badRequest(`El potrero ya tiene ese uso (${uso.nombre})`);
    const desdeVigente = fechaISO(vigente.desde);
    if (dia < desdeVigente) {
      throw badRequest(`La fecha no puede ser anterior al uso vigente (${vigente.usoSuelo.nombre}, desde el ${fechaUY(desdeVigente)})`);
    }
  }

  await prisma.$transaction([
    ...(vigente ? [prisma.potreroUso.update({ where: { id: vigente.id }, data: { hasta: aFecha(dia) } })] : []),
    prisma.potreroUso.create({ data: { potreroId: potrero.id, usoSueloId: uso.id, desde: aFecha(dia), usuarioId } }),
  ]);
  return {
    potrero: await detallePotrero(potrero.id),
    auditoria: {
      antes: vigente ? { uso: vigente.usoSuelo.nombre, desde: fechaISO(vigente.desde) } : null,
      despues: { uso: uso.nombre, desde: dia },
    },
  };
}

// Renombra un lote. Devuelve { antes, despues }.
export async function renombrarLote(id, nombre) {
  const loteId = parseId(id);
  const lote = loteId && (await prisma.lote.findUnique({ where: { id: loteId } }));
  if (!lote) throw notFound('Lote no encontrado');
  if (await nombreOcupado(prisma, lote.campoId, nombre, lote.id)) throw conflict(`Ya existe un lote "${nombre}" en este campo`);
  const despues = await prisma.lote.update({ where: { id: lote.id }, data: { nombre } });
  return { antes: lote, despues };
}

