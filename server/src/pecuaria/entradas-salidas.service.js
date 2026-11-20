// Entradas y salidas de animales: paso 2 del "libro del rodeo"
// (PROPUESTA_MOVIMIENTOS §2 y §3). Qué se registra lo dice el tipo elegido:
//   ENTRA  nacimiento, compra, traslado desde otro campo: los animales llegan a
//          un potrero, a un lote que ya está o a uno nuevo (una línea por lote);
//   SALE   muerte, consumo, venta, traslado a otro campo, pérdida: salen de un
//          lote (una parte o todo; si sale todo, el lote queda cerrado).
// Cada línea es un movimiento con su propia versión de stock, así se puede
// revertir de a uno. Las entradas no tienen origen y las salidas no tienen destino.
// Una venta puede llevar el precio real (USD por kilo o por cabeza): con él y
// el peso de salida se calcula el valor de la venta (calculos.js: valorVenta).
import { prisma } from '../db.js';
import { badRequest } from '../errors.js';
import { calcularPotrero, valorVenta } from './calculos.js';
import { aFecha, fechaISO, hoyISO } from './importaciones.service.js';
import { crearLote, crearVersion, fotoActual, nombreOcupado } from './lotes.js';
import { aItems, incluir } from './movimientos.service.js';
import { detallePotrero, fechaUY, parametrosCarga } from './stock.service.js';

const r2 = (n) => Math.round(n * 100) / 100;
const potreroSelect = { id: true, nombre: true, campoId: true, hectareas: true, hectareasAConfirmar: true, areaUtilizable: true };
const copiar = (lineas) => lineas.map((l) => ({ ...l }));

async function tipoValido(db, tipoId) {
  const tipo = await db.tipoMovimiento.findUnique({ where: { id: tipoId } });
  if (!tipo) throw badRequest('El tipo de movimiento no existe');
  if (!tipo.activo) throw badRequest(`El tipo ${tipo.nombre} está desactivado`);
  if (tipo.efecto !== 'ENTRA' && tipo.efecto !== 'SALE') throw badRequest(`${tipo.nombre} no es ni una entrada ni una salida`);
  // Por ahora se registra lote por lote (los atajos por potrero o categoría vienen después).
  if (!tipo.niveles.some((n) => n === 'LOTE' || n === 'PARTE_LOTE')) throw badRequest(`${tipo.nombre} no se registra por lote`);
  return tipo;
}

async function categoriaActiva(db, id) {
  const c = await db.categoria.findUnique({ where: { id } });
  if (!c) throw badRequest('La categoría elegida no existe');
  if (!c.activo) throw badRequest(`La categoría ${c.nombre} está desactivada`);
  return c;
}

// Un tipo solo para hembras (o machos) no va con una categoría del otro sexo.
function controlarSexo(tipo, categoria) {
  if (tipo.sexo === 'CUALQUIERA' || !categoria.sexo || categoria.sexo === tipo.sexo) return;
  throw badRequest(`${tipo.nombre} es solo para ${tipo.sexo === 'HEMBRA' ? 'hembras' : 'machos'}: ${categoria.nombre} no corresponde`);
}

// La fecha (por defecto, hoy) no puede ser anterior al último dato del potrero.
function fechaValida(fecha, potrero, foto) {
  const dia = fecha ?? hoyISO();
  const ultima = fechaISO(foto.version?.fecha);
  if (ultima && dia < ultima) throw badRequest(`La fecha no puede ser anterior al último dato de ${potrero.nombre} (${fechaUY(ultima)})`);
  return dia;
}

// Causa, guía y otro campo: lo que pide el tipo.
async function datosDelTipo(db, tipo, body, campoId) {
  let causa = null;
  if (tipo.pideCausa) {
    if (!body.causaId) throw badRequest(`Elegí la causa: ${tipo.nombre} la pide`);
    causa = await db.causaMovimiento.findUnique({ where: { id: body.causaId }, include: { tipos: { where: { tipoId: tipo.id } } } });
    if (!causa) throw badRequest('La causa elegida no existe');
    if (!causa.tipos.length) throw badRequest(`La causa ${causa.codigo} (${causa.nombre}) no corresponde a ${tipo.nombre}`);
    if (!causa.activo) throw badRequest(`La causa ${causa.codigo} (${causa.nombre}) está desactivada`);
  } else if (body.causaId) {
    throw badRequest(`${tipo.nombre} no lleva causa`);
  }

  const guia = body.guia ?? null;
  if (tipo.pideGuia && !guia) throw badRequest(`Escribí el número de guía: ${tipo.nombre} lo pide`);

  let campoOtro = null;
  if (body.campoOtroId) {
    if (body.campoOtroId === campoId) throw badRequest('El traslado tiene que ser desde o hacia otro campo');
    campoOtro = await db.campo.findUnique({ where: { id: body.campoOtroId }, select: { id: true, sigla: true, nombre: true } });
    if (!campoOtro) throw badRequest('El otro campo no existe');
  }
  return { causa, guia, campoOtro };
}

// El precio de venta (opcional): solo en una venta. Por kilo, pide el peso de
// salida. Devuelve { precioVentaUsd, precioVentaPor } (null si no hay precio).
export function precioDeVenta(tipo, { precioVentaUsd = null, precioVentaPor = null, pesoPromedioKg = null }) {
  if (precioVentaUsd == null) return { precioVentaUsd: null, precioVentaPor: null };
  if (tipo.clave !== 'VENTA') throw badRequest(`${tipo.nombre} no lleva precio de venta`);
  if (!precioVentaPor) throw badRequest('Elegí si el precio de venta es por kilo o por cabeza');
  if (precioVentaPor === 'KG' && pesoPromedioKg == null) throw badRequest('Para el precio por kilo, escribí el peso de salida');
  return { precioVentaUsd, precioVentaPor };
}

// --- Salidas ---

async function planSalida(db, tipo, body) {
  if (!body.loteId) throw badRequest('Elegí el lote del que salen los animales');
  if (!body.cabezas) throw badRequest('Escribí cuántas cabezas salen');
  const lote = await db.lote.findUnique({ where: { id: body.loteId }, include: { categoria: true, potrero: { select: potreroSelect } } });
  if (!lote) throw badRequest('El lote elegido no existe');
  if (!lote.activo) throw badRequest(`El lote ${lote.nombre} está cerrado: no tiene animales`);
  controlarSexo(tipo, lote.categoria);

  const potrero = lote.potrero;
  const foto = await fotoActual(db, potrero.id);
  const linea = foto.lineas.find((l) => l.loteId === lote.id);
  if (!linea) throw badRequest(`El lote ${lote.nombre} no tiene animales cargados`);
  const n = linea.cabezas;
  const m = body.cabezas;
  if (m > n) throw badRequest(`El lote ${lote.nombre} solo tiene ${n} cabezas`);
  const dia = fechaValida(body.fecha, potrero, foto);
  const extra = await datosDelTipo(db, tipo, body, lote.campoId);
  const precio = precioDeVenta(tipo, body);

  // El peso de los que quedan, si se cargó el de los que salen.
  const p = linea.pesoPromedioKg;
  const pm = body.pesoPromedioKg ?? null;
  let pesoQuedan = p;
  if (m < n && p != null && pm != null) {
    pesoQuedan = r2((n * p - m * pm) / (n - m));
    if (!(pesoQuedan > 0)) {
      throw badRequest('Con ese peso de los que salen, el promedio de los que quedan da imposible: revisá el peso');
    }
  }
  const lineas = copiar(foto.lineas);
  const en = lineas.find((l) => l.loteId === lote.id);
  en.cabezas = n - m;
  en.pesoPromedioKg = pesoQuedan;

  return {
    tipo,
    dia,
    campoId: lote.campoId,
    potrero,
    foto,
    ...extra,
    nota: body.nota ?? null,
    cierraLote: m === n,
    pasos: [
      {
        cabezas: m,
        pesoPromedioKg: pm,
        ...precio,
        lote: { id: lote.id, nombre: lote.nombre },
        categoria: { id: lote.categoriaId, nombre: lote.categoria.nombre },
        lineas: lineas.filter((l) => l.cabezas > 0),
      },
    ],
  };
}

// --- Entradas ---

async function planEntrada(db, tipo, body) {
  if (!body.potreroId) throw badRequest('Elegí el potrero al que entran los animales');
  if (!body.lineas?.length) throw badRequest('Escribí cuántos animales entran');
  const potrero = await db.potrero.findUnique({ where: { id: body.potreroId }, select: potreroSelect });
  if (!potrero) throw badRequest('El potrero elegido no existe');
  const foto = await fotoActual(db, potrero.id);
  const dia = fechaValida(body.fecha, potrero, foto);
  const extra = await datosDelTipo(db, tipo, body, potrero.campoId);

  let madres = null;
  if (body.loteMadresId) {
    const lote = await db.lote.findUnique({ where: { id: body.loteMadresId }, include: { categoria: true } });
    if (!lote || lote.campoId !== potrero.campoId) throw badRequest('El lote de las madres no es de este campo');
    if (lote.categoria.sexo === 'MACHO') {
      throw badRequest(`El lote de las madres tiene que ser de hembras: ${lote.nombre} es de ${lote.categoria.nombre}`);
    }
    madres = { id: lote.id, nombre: lote.nombre };
  }

  // Los nombres de los lotes nuevos: libres en el campo y sin repetirse entre sí.
  const usados = new Set();
  const libre = async (nombre) => !usados.has(nombre.toLowerCase()) && !(await nombreOcupado(db, potrero.campoId, nombre));

  const actuales = copiar(foto.lineas);
  const pasos = [];
  for (const [i, l] of body.lineas.entries()) {
    let lote;
    let categoria;
    if (l.loteId) {
      const d = actuales.find((x) => x.loteId === l.loteId);
      if (!d) {
        const otro = await db.lote.findUnique({ where: { id: l.loteId }, select: { nombre: true } });
        throw badRequest(`El lote ${otro?.nombre ?? 'elegido'} no está en ${potrero.nombre}`);
      }
      controlarSexo(tipo, await db.categoria.findUnique({ where: { id: d.categoriaId } }));
      d.pesoPromedioKg = d.pesoPromedioKg != null && l.pesoPromedioKg != null ? r2((d.cabezas * d.pesoPromedioKg + l.cabezas * l.pesoPromedioKg) / (d.cabezas + l.cabezas)) : null;
      d.cabezas += l.cabezas;
      lote = { id: d.loteId, nombre: d.lote };
      categoria = { id: d.categoriaId, nombre: d.categoria };
    } else if (l.nuevoLote?.categoriaId) {
      const c = await categoriaActiva(db, l.nuevoLote.categoriaId);
      controlarSexo(tipo, c);
      let nombre = l.nuevoLote.nombre?.trim();
      if (nombre) {
        if (!(await libre(nombre))) throw badRequest(`Ya existe un lote "${nombre}" en este campo`);
      } else {
        const raiz = `${potrero.nombre} · ${c.nombre}`.slice(0, 74);
        for (let k = 1; ; k++) {
          nombre = k === 1 ? raiz : `${raiz} (${k})`;
          if (await libre(nombre)) break;
        }
      }
      usados.add(nombre.toLowerCase());
      // `nuevo` marca la línea hasta que el lote exista (al registrar).
      actuales.push({ loteId: null, nuevo: i, lote: nombre, categoriaId: c.id, categoria: c.nombre, orden: c.orden, cabezas: l.cabezas, pesoPromedioKg: l.pesoPromedioKg ?? null });
      lote = { id: null, nuevo: i, nombre };
      categoria = { id: c.id, nombre: c.nombre };
    } else {
      throw badRequest('Elegí a qué lote van los animales: uno que ya está en el potrero o uno nuevo');
    }
    pasos.push({ cabezas: l.cabezas, pesoPromedioKg: l.pesoPromedioKg ?? null, lote, categoria, lineas: copiar(actuales) });
  }

  return { tipo, dia, campoId: potrero.campoId, potrero, foto, ...extra, madres, nota: body.nota ?? null, pasos };
}

async function planificar(db, body) {
  const tipo = await tipoValido(db, body.tipoId);
  return tipo.efecto === 'SALE' ? planSalida(db, tipo, body) : planEntrada(db, tipo, body);
}

// --- Vista previa y registro ---

const calc = (potrero, lineas, kg) =>
  calcularPotrero(
    {
      hectareas: potrero.hectareas == null ? null : Number(potrero.hectareas),
      hectareasAConfirmar: potrero.hectareasAConfirmar,
      areaUtilizable: potrero.areaUtilizable,
      lineas,
    },
    kg,
  );
const sinMarcas = (lineas) => lineas.map(({ orden, nuevo, ...l }) => l);

export async function vistaPrevia(body) {
  const plan = await planificar(prisma, body);
  const kg = await parametrosCarga();
  const final = plan.pasos.at(-1).lineas;
  return {
    fecha: plan.dia,
    efecto: plan.tipo.efecto,
    potreroId: plan.potrero.id,
    potrero: plan.potrero.nombre,
    antes: calc(plan.potrero, plan.foto.lineas, kg),
    despues: calc(plan.potrero, final, kg),
    lineas: sinMarcas(final),
    // Una venta con precio: lo que vale (null si no hay precio).
    valorVentaUsd: plan.tipo.efecto === 'SALE' ? valorVenta(plan.pasos[0]) : null,
  };
}

const textoCausa = (c) => (c ? `${c.codigo} ${c.nombre}` : undefined);

export async function registrar(body, usuarioId) {
  const { plan, ids } = await prisma.$transaction(
    async (tx) => {
      const plan = await planificar(tx, body);
      const fecha = aFecha(plan.dia);
      const sale = plan.tipo.efecto === 'SALE';
      const comun = {
        campoId: plan.campoId,
        tipoId: plan.tipo.id,
        fecha,
        modo: sale ? 'SALIDA' : 'ENTRADA',
        causaId: plan.causa?.id ?? null,
        guia: plan.guia,
        campoOtroId: plan.campoOtro?.id ?? null,
        loteMadresId: plan.madres?.id ?? null,
        nota: plan.nota,
        usuarioId,
      };
      const version = { fecha, origen: 'MOVIMIENTO', usuarioId, nota: plan.nota };

      const ids = [];
      const creados = new Map(); // línea `nuevo` → id del lote creado
      for (const paso of plan.pasos) {
        if (paso.lote.id == null) {
          const nuevo = await crearLote(tx, { campoId: plan.campoId, potrero: plan.potrero, categoria: paso.categoria, nombre: paso.lote.nombre });
          creados.set(paso.lote.nuevo, nuevo.id);
          paso.lote.id = nuevo.id;
        }
        const lineas = paso.lineas.map((l) => ({ ...l, loteId: l.loteId ?? creados.get(l.nuevo) }));
        const v = await crearVersion(tx, { ...version, potreroId: plan.potrero.id, lineas });
        const lado = sale
          ? { loteOrigenId: paso.lote.id, potreroOrigenId: plan.potrero.id, categoriaOrigenId: paso.categoria.id, versionOrigenId: v.id }
          : { loteDestinoId: paso.lote.id, potreroDestinoId: plan.potrero.id, categoriaDestinoId: paso.categoria.id, versionDestinoId: v.id };
        const venta = paso.precioVentaUsd != null ? { precioVentaUsd: paso.precioVentaUsd, precioVentaPor: paso.precioVentaPor } : {};
        const m = await tx.movimiento.create({ data: { ...comun, ...lado, cabezas: paso.cabezas, pesoPromedioKg: paso.pesoPromedioKg, ...venta } });
        ids.push(m.id);
      }
      if (sale && plan.cierraLote) await tx.lote.update({ where: { id: plan.pasos[0].lote.id }, data: { activo: false } });
      return { plan, ids };
    },
    { timeout: 30_000, maxWait: 10_000 },
  );

  const movimientos = await aItems(prisma, await prisma.movimiento.findMany({ where: { id: { in: ids } }, include: incluir, orderBy: { id: 'asc' } }));
  const sale = plan.tipo.efecto === 'SALE';
  const auditorias = movimientos.map((m) => ({
    id: m.id,
    detalle: {
      tipo: plan.tipo.nombre,
      fecha: m.fecha,
      cabezas: m.cabezas,
      pesoPromedioKg: m.pesoPromedioKg,
      modo: m.modo,
      [sale ? 'origen' : 'destino']: { lote: (sale ? m.loteOrigen : m.loteDestino).nombre, potrero: plan.potrero.nombre },
      categoria: sale ? m.categoriaOrigen : m.categoriaDestino,
      ...(plan.causa && { causa: textoCausa(plan.causa) }),
      ...(plan.guia && { guia: plan.guia }),
      ...(m.precioVentaUsd != null && { precioVentaUsd: m.precioVentaUsd, precioVentaPor: m.precioVentaPor, valorVentaUsd: m.valorVentaUsd }),
      ...(plan.campoOtro && { campoOtro: plan.campoOtro.sigla }),
      ...(plan.madres && { loteMadres: plan.madres.nombre }),
      ...(plan.nota && { nota: plan.nota }),
    },
  }));
  return { movimientos, potrero: await detallePotrero(plan.potrero.id), auditorias };
}
