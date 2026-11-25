// Detalle de un potrero, su historial, y los cambios a mano: stock (por lote)
// y uso de suelo. Cada cambio agrega filas; nada se pisa ni se borra.
import { prisma } from '../db.js';
import { badRequest, conflict, notFound, parseId } from '../errors.js';
import { calcularPotrero, kilosLinea, problemaArea } from './calculos.js';
import { aFecha, fechaISO, hoyISO } from './importaciones.service.js';
import { crearLote, crearVersion, nombreOcupado } from './lotes.js';
import { listarEventos, textosDeVersiones } from './eventos.service.js';

export const fechaUY = (iso) => iso.split('-').reverse().join('/');

export async function kgPorUg(db = prisma) {
  const p = await db.parametro.findUnique({ where: { clave: 'KG_POR_UG' } });
  return p ? Number(p.valor) : 380;
}

// Lo que necesita calcularPotrero: los kg por UG y el peso promedio y el
// precio de cada categoría (para los lotes sin peso y el valor del ganado).
export async function parametrosCarga(db = prisma) {
  const filas = await db.categoria.findMany({ select: { id: true, pesoPromedioKg: true, precioUsd: true, precioPor: true } });
  const num = (v) => (v == null ? null : Number(v));
  return {
    kgPorUg: await kgPorUg(db),
    categorias: new Map(filas.map((c) => [c.id, { pesoPromedioKg: num(c.pesoPromedioKg), precioUsd: num(c.precioUsd), precioPor: c.precioPor }])),
  };
}

const lineaSelect = {
  loteId: true,
  categoriaId: true,
  cabezas: true,
  pesoPromedioKg: true,
  lote: { select: { nombre: true, raizId: true, fechaEntrada: true, pesoEntradaKg: true } },
  categoria: { select: { nombre: true, orden: true, pesoPromedioKg: true } },
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
    // Las partes de un mismo lote repartido comparten familiaId (la raíz).
    familiaId: l.lote.raizId ?? l.loteId,
    categoriaId: l.categoriaId,
    categoria: l.categoria.nombre,
    cabezas: l.cabezas,
    pesoPromedioKg: l.pesoPromedioKg == null ? null : Number(l.pesoPromedioKg),
    // Feedlot: la entrada al corral.
    fechaEntrada: fechaISO(l.lote.fechaEntrada),
    pesoEntradaKg: l.lote.pesoEntradaKg == null ? null : Number(l.lote.pesoEntradaKg),
  };
  // Sin peso propio: el de su categoría, si tiene (se muestra con "≈").
  const pesoEstimadoKg = linea.pesoPromedioKg == null && l.categoria.pesoPromedioKg != null ? Number(l.categoria.pesoPromedioKg) : null;
  return { ...linea, pesoEstimadoKg, kilos: kilosLinea({ ...linea, pesoPromedioKg: linea.pesoPromedioKg ?? pesoEstimadoKg }) };
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
        areaUtilizable: true,
        metrosComedero: true,
        idAreaManejoCigam: true,
        activo: true,
        orden: true,
        campo: { select: { id: true, sigla: true, nombre: true, tipo: true } },
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
  const { usos, versionesStock, hectareas, areaUtilizable: area, metrosComedero, ...p } = await buscarPotrero(id);
  const [uso] = usos;
  const [version] = versionesStock;
  const kg = await parametrosCarga();
  const ha = hectareas == null ? null : Number(hectareas);
  const areaUtilizable = area == null ? null : Number(area);
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
      ...calcularPotrero({ hectareas: ha, hectareasAConfirmar: p.hectareasAConfirmar, areaUtilizable, lineas }, kg),
    };
  }
  return {
    ...p,
    hectareas: ha,
    areaUtilizable,
    metrosComedero: metrosComedero == null ? null : Number(metrosComedero),
    usoActual: uso
      ? { id: uso.usoSuelo.id, nombre: uso.usoSuelo.nombre, grupo: uso.usoSuelo.grupo, desde: fechaISO(uso.desde) }
      : null,
    stock,
    kgPorUg: kg.kgPorUg,
  };
}

// Títulos cortos de las entradas y salidas (un solo lado) en la tabla de la ficha.
const TITULO_TIPO = {
  NACIMIENTO: 'Nacimiento',
  VENTA: 'Venta',
  TRASLADO_ENTRADA: 'Traslado',
  TRASLADO_SALIDA: 'Traslado',
  PERDIDA: 'Pérdida',
};

// Cómo se cuenta un movimiento en el historial de un potrero: un título corto
// para la tabla ("Entraron 5"), el detalle (de dónde, a dónde, qué) y el texto
// completo (para la fila desplegada). Una entrada (compra, nacimiento) no tiene
// potrero de origen y una salida (venta, muerte) no tiene destino.
export function describirMovimiento(m, potrero) {
  const pid = potrero.id;
  const catO = m.categoriaOrigen?.nombre ?? m.categoriaDestino?.nombre ?? '';
  const catD = m.categoriaDestino?.nombre ?? catO;
  const cab = `${m.cabezas} ${catO}`;
  const como = m.categoriaDestinoId && m.categoriaOrigenId && m.categoriaDestinoId !== m.categoriaOrigenId ? `, como ${catD}` : '';
  const sale = m.potreroOrigenId === pid && m.potreroDestinoId !== pid;
  const otro = sale ? m.potreroDestino : m.potreroOrigen;
  // Otro potrero (con la sigla si es de otra estancia) o, si no hay, el campo de un traslado.
  const lugar = otro
    ? `${otro.campoId !== potrero.campoId && otro.campo?.sigla ? `${otro.campo.sigla} ` : ''}${otro.nombre}`
    : (m.campoOtro?.nombre ?? null);
  const hacia = lugar ? ` ${sale ? 'a' : 'de'} ${lugar}` : '';
  const loteO = m.loteOrigen?.nombre;
  const loteD = m.loteDestino?.nombre;
  const reversion = m.modo === 'REVERSION';

  // En el mismo potrero: separar en otro lote o cambiar de categoría.
  if (m.potreroOrigenId === m.potreroDestinoId) {
    if (m.modo === 'CATEGORIA') {
      return { titulo: 'Cambio de categoría', detalle: `${m.cabezas} ${catO} → ${catD}`, texto: `Cambio de categoría: ${cab} pasaron a ${catD} (lote ${loteD})` };
    }
    return {
      titulo: reversion ? 'Reversión' : `Se separaron ${m.cabezas}`,
      detalle: `${catO}: lote ${loteO} → ${loteD}`,
      texto: `Se separaron ${cab} del lote ${loteO} al lote ${loteD}${como}`,
    };
  }
  // De un solo lado: compra, nacimiento, venta, muerte, traslado.
  if (!otro) {
    const nombre = TITULO_TIPO[m.tipo?.clave] ?? m.tipo?.nombre ?? (sale ? 'Salida' : 'Entrada');
    return {
      titulo: reversion ? 'Reversión' : nombre,
      detalle: `${sale ? '−' : '+'}${cab}${hacia}`,
      texto: `${reversion ? 'Reversión' : (m.tipo?.nombre ?? nombre)}: ${sale ? 'salieron' : 'entraron'} ${cab} (lote ${sale ? loteO : loteD})${hacia}`,
    };
  }
  const titulo = reversion
    ? 'Reversión'
    : m.tipo?.clave === 'DESTETE'
      ? 'Destete'
      : m.modo === 'ENTERO'
        ? sale ? 'Salió el lote' : 'Llegó el lote'
        : `${sale ? 'Salieron' : 'Entraron'} ${m.cabezas}`;
  const detalle = m.modo === 'ENTERO' && !reversion ? `${loteO} · ${cab}${hacia}${como}` : `${catO}${hacia}${sale ? '' : como}`;
  const texto =
    m.modo === 'ENTERO'
      ? sale
        ? `Salió el lote ${loteO} entero (${cab}) hacia ${lugar}`
        : `Llegó el lote ${loteO} entero (${cab}) desde ${lugar}${como}`
      : sale
        ? `Salieron ${cab} del lote ${loteO} hacia ${lugar} (lote ${loteD})`
        : `Llegaron ${cab} desde ${lugar} (lote ${loteO}) al lote ${loteD}${como}`;
  return { titulo, detalle, texto };
}

// Título y detalle de una versión con varios movimientos (un movimiento
// múltiple, una entrada con varias líneas): si todos dicen lo mismo, ese.
function juntarDescripciones(lista) {
  if (lista.length === 1) return lista[0];
  const titulos = new Set(lista.map((d) => d.titulo));
  return {
    titulo: titulos.size === 1 ? lista[0].titulo : `${lista.length} movimientos`,
    detalle: lista.map((d) => d.detalle).join('; '),
    texto: lista.map((d) => d.texto).join('. '),
  };
}

const TITULO_ORIGEN = { PLANILLA: 'Planilla', MANUAL: 'A mano', MOVIMIENTO: 'Movimiento', EVENTO: 'Evento' };

// La carga de una versión. Se calcula con las hectáreas (y el área
// utilizable) de hoy: no se guardan las de antes. Los lotes sin peso usan el
// promedio de su categoría de hoy (kilosEstimados: se muestra con "≈").
function cargaDeVersion(potrero, lineas, kg) {
  const c = calcularPotrero(
    {
      hectareas: potrero.hectareas == null ? null : Number(potrero.hectareas),
      hectareasAConfirmar: potrero.hectareasAConfirmar,
      areaUtilizable: potrero.areaUtilizable == null ? null : Number(potrero.areaUtilizable),
      lineas,
    },
    kg,
  );
  return {
    cabezas: c.cabezas,
    pesoPromedio: c.cabezas && c.kilosCompletos ? Math.round(c.kilos / c.cabezas) : null,
    kgPvHa: c.kilosCompletos ? c.kgPvHa : null,
    cabHa: c.cabHa,
    kilosEstimados: c.kilosEstimados,
  };
}

// Cuánto cambió cada dato contra la versión anterior (null: no se puede
// comparar, porque falta uno de los dos).
const diferencia = (despues, antes) => (despues == null || antes == null ? null : Math.round((despues - antes) * 100) / 100);
export function variacion(carga, anterior) {
  if (!anterior) return null;
  return {
    cabezas: carga.cabezas - anterior.cabezas,
    pesoPromedio: diferencia(carga.pesoPromedio, anterior.pesoPromedio),
    kgPvHa: diferencia(carga.kgPvHa, anterior.kgPvHa),
    cabHa: diferencia(carga.cabHa, anterior.cabHa),
  };
}

export async function historialPotrero(id) {
  const potrero = await buscarPotrero(id);
  const [versiones, usos, movimientos, textosEventos, eventos] = await Promise.all([
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
      orderBy: { id: 'asc' },
      include: {
        loteOrigen: { select: { nombre: true } },
        loteDestino: { select: { nombre: true } },
        potreroOrigen: { select: { nombre: true, campoId: true, campo: { select: { sigla: true } } } },
        potreroDestino: { select: { nombre: true, campoId: true, campo: { select: { sigla: true } } } },
        campoOtro: { select: { nombre: true } },
        tipo: { select: { clave: true, nombre: true } },
      },
    }),
    textosDeVersiones(potrero.id),
    listarEventos(undefined, { potreroId: potrero.id }),
  ]);
  const kg = await parametrosCarga();
  const ids = [...new Set(movimientos.flatMap((m) => [m.categoriaOrigenId, m.categoriaDestinoId]).filter(Boolean))];
  const nombres = new Map((await prisma.categoria.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true } })).map((c) => [c.id, c]));
  // Una versión puede venir de varios movimientos (un múltiple, una entrada de varias líneas).
  const porVersion = new Map();
  // En la ficha no se muestran las reversiones ni lo que se revirtió (pedido
  // de Diego, 25/11): la reversión deja el potrero como estaba, así que las
  // dos versiones se van juntas. En Historial (la lista completa) sigue todo.
  const revertidos = new Set(movimientos.map((m) => m.revierteAId).filter((id) => id != null));
  const ocultas = new Map(); // versión → ¿todos sus movimientos se ocultan?
  for (const m of movimientos) {
    m.categoriaOrigen = nombres.get(m.categoriaOrigenId);
    m.categoriaDestino = nombres.get(m.categoriaDestinoId);
    const vid = m.potreroOrigenId === potrero.id ? m.versionOrigenId : m.versionDestinoId;
    porVersion.set(vid, [...(porVersion.get(vid) ?? []), describirMovimiento(m, potrero)]);
    const oculto = m.modo === 'REVERSION' || revertidos.has(m.id);
    ocultas.set(vid, (ocultas.get(vid) ?? true) && oculto);
  }
  // De la más nueva a la más vieja; la variación es contra la que sigue en la lista.
  const filas = versiones.filter((v) => !ocultas.get(v.id)).map((v) => {
    const lineas = ordenarLineas(v.lineas).map(toLinea);
    const mov = porVersion.has(v.id) ? juntarDescripciones(porVersion.get(v.id)) : null;
    // Una pesada o un recuento con diferencia (o su anulación).
    const evento = textosEventos.get(v.id) ?? null;
    const titulo = mov?.titulo ?? evento?.titulo ?? TITULO_ORIGEN[v.origen];
    const detalle =
      mov?.detalle ??
      evento?.texto ??
      (v.importacion ? `${v.importacion.archivo} (${v.importacion.hoja})` : (v.nota ?? null));
    return {
      id: v.id,
      fecha: fechaISO(v.fecha),
      origen: v.origen,
      nota: v.nota,
      creadoEn: v.creadoEn,
      usuario: v.usuario?.nombre ?? null,
      importacion: v.importacion,
      titulo,
      detalle,
      movimiento: mov?.texto ?? null,
      evento: evento?.texto ?? null,
      lineas,
      cabezas: lineas.reduce((s, l) => s + l.cabezas, 0),
      carga: cargaDeVersion(potrero, lineas, kg),
    };
  });
  return {
    versiones: filas.map((v, i) => ({ ...v, cambio: variacion(v.carga, filas[i + 1]?.carga) })),
    usos: usos.map((u) => ({
      uso: u.usoSuelo,
      desde: fechaISO(u.desde),
      hasta: fechaISO(u.hasta),
      usuario: u.usuario?.nombre ?? null,
    })),
    // Lo que se les hizo a los lotes del potrero (pesadas, vacunas...).
    eventos,
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
// areaUtilizable: lo que ocupa el uso nuevo; si no se manda, todas las hectáreas.
export async function cambiarUso(id, { usoSueloId, desde, areaUtilizable = null }, usuarioId) {
  const potrero = await buscarPotrero(id);
  const problema = problemaArea({ hectareas: potrero.hectareas, hectareasAConfirmar: potrero.hectareasAConfirmar, areaUtilizable });
  if (problema) throw badRequest(problema);
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
    prisma.potrero.update({ where: { id: potrero.id }, data: { areaUtilizable } }),
  ]);
  const areaAntes = potrero.areaUtilizable == null ? null : Number(potrero.areaUtilizable);
  return {
    potrero: await detallePotrero(potrero.id),
    auditoria: {
      antes: { ...(vigente && { uso: vigente.usoSuelo.nombre, desde: fechaISO(vigente.desde) }), areaUtilizable: areaAntes },
      despues: { uso: uso.nombre, desde: dia, areaUtilizable },
    },
  };
}

// Lo que se puede editar de un lote, como se muestra y se audita.
const loteEditable = (l) => ({
  nombre: l.nombre,
  fechaEntrada: fechaISO(l.fechaEntrada),
  pesoEntradaKg: l.pesoEntradaKg == null ? null : Number(l.pesoEntradaKg),
});

// Edita un lote: el nombre y, en el feedlot, la fecha y el peso de entrada al
// corral. Devuelve { antes, despues, lote } (antes y despues: lo editable).
export async function editarLote(id, { nombre, fechaEntrada, pesoEntradaKg }) {
  const loteId = parseId(id);
  const lote = loteId && (await prisma.lote.findUnique({ where: { id: loteId } }));
  if (!lote) throw notFound('Lote no encontrado');
  if (nombre !== undefined && (await nombreOcupado(prisma, lote.campoId, nombre, lote.id))) {
    throw conflict(`Ya existe un lote "${nombre}" en este campo`);
  }
  const data = {
    ...(nombre !== undefined && { nombre }),
    ...(fechaEntrada !== undefined && { fechaEntrada: fechaEntrada == null ? null : aFecha(fechaEntrada) }),
    ...(pesoEntradaKg !== undefined && { pesoEntradaKg }),
  };
  const despues = await prisma.lote.update({ where: { id: lote.id }, data });
  return { antes: loteEditable(lote), despues: loteEditable(despues), lote: despues };
}

