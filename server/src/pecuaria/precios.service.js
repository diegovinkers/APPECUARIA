// Precios de mercado (docs/PRECIOS_INAC.md): la importación semanal de INAC,
// lo que muestra la pantalla y las correcciones a mano.
//
// Una corrida: baja la página de INAC, busca el Excel por su título, compara
// la huella con la última corrida, lo lee, valida la semana nueva y guarda.
// Si el Excel no sirve, Claude de respaldo (con el Excel en CSV o con el PDF):
// lo que lee Claude queda siempre en revisión.
import { prisma } from '../db.js';
import { PRECIOS } from '../config.js';
import { ACCION, registrar } from '../audit/audit.js';
import { HttpError, badRequest, conflict, notFound } from '../errors.js';
import { INDICADORES, OBLIGATORIOS, indicador } from './precios.indicadores.js';
import { INAC, buscarEnlaceSerie, excelComoCsv, hashArchivo, leerSerieInac, sumarDias, userAgent } from './precios.inac.js';
import { validarSemana, valoresConocidos, variacion } from './precios.validacion.js';
import { crearClienteClaude, extraerConClaude } from './precios.claude.js';

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;
// Una corrida que lleva más que esto EN_CURSO se cortó (se reinició el servidor).
const VENCE_EN_CURSO = 15 * MINUTO;
// Al abrir la pantalla: si la última corrida que anduvo tiene más de 8 días,
// se dispara otra (no más de una cada 6 horas).
const ACTUALIZAR_SI_PASARON = 8 * DIA;
const ESPERA_ENTRE_CORRIDAS = 6 * HORA;
const TIMEOUT_DESCARGA = 60_000;

// Lo de afuera, cambiable en los tests (fetch simulado, Claude simulado).
const deps = {
  fetch: (...args) => globalThis.fetch(...args),
  claude: () => crearClienteClaude(),
  contacto: () => PRECIOS.contacto,
};
export function _usarDependencias(cambios) {
  const antes = { ...deps };
  Object.assign(deps, cambios);
  return () => Object.assign(deps, antes);
}
// La última corrida disparada al abrir la pantalla (para esperarla en los tests).
export let _enSegundoPlano = Promise.resolve();

const fecha = (iso) => new Date(`${iso}T00:00:00Z`);
const iso = (d) => (d ? d.toISOString().slice(0, 10) : null);

export function hoyUruguay(ahora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Montevideo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora);
}

async function bajar(url) {
  let res;
  try {
    res = await deps.fetch(url, {
      headers: { 'User-Agent': userAgent(deps.contacto()) },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_DESCARGA),
    });
  } catch (error) {
    throw new Error(`no se pudo bajar ${url} (${error.name === 'TimeoutError' ? 'tardó demasiado' : error.message})`);
  }
  if (!res.ok) throw new Error(`${url} contestó ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ---------------------------------------------------------------------------
// La corrida

/**
 * Corre una importación de INAC. Devuelve la importación terminada (también
 * si terminó en ERROR). Lanza 409 si ya hay una en curso.
 * @param req la request (para la auditoría y el usuario).
 * @param {{ disparadoPor: 'PROGRAMADO'|'AL_ABRIR'|'BOTON' }} opciones
 */
export async function actualizarPrecios(req, { disparadoPor }) {
  await prisma.importacionPrecio.updateMany({
    where: { fuente: 'INAC', estado: 'EN_CURSO', inicio: { lt: new Date(Date.now() - VENCE_EN_CURSO) } },
    data: { estado: 'ERROR', fin: new Date(), detalle: { errores: ['Se cortó sin terminar.'] } },
  });

  let importacion;
  try {
    importacion = await prisma.importacionPrecio.create({
      data: { fuente: 'INAC', disparadoPor, usuarioId: req.user?.id ?? null },
    });
  } catch (error) {
    if (error.code === 'P2002') throw new HttpError(409, 'Ya hay una actualización de precios en curso. Probá en unos minutos.', 'EN_CURSO');
    throw error;
  }

  const detalle = { avisos: [], errores: [] };
  let resultado;
  try {
    resultado = await correr(importacion.id, detalle);
  } catch (error) {
    detalle.errores.push(error.message);
    resultado = { estado: 'ERROR' };
  }

  const terminada = await prisma.importacionPrecio.update({
    where: { id: importacion.id },
    data: {
      estado: resultado.estado,
      origen: resultado.origen ?? null,
      semanaDesde: resultado.semanaDesde ? fecha(resultado.semanaDesde) : null,
      hashArchivo: resultado.hash ?? null,
      fin: new Date(),
      detalle: { ...detalle, avisos: detalle.avisos.slice(0, 30), totalAvisos: detalle.avisos.length },
    },
    include: INCLUIR_IMPORTACION,
  });
  await registrar(req, {
    accion: ACCION.PRECIOS_IMPORTADOS,
    entidad: 'importacion_precio',
    entidadId: String(importacion.id),
    detalle: {
      estado: resultado.estado,
      origen: resultado.origen ?? null,
      semana: resultado.semanaDesde ?? null,
      semanasNuevas: detalle.semanasNuevas ?? 0,
      disparadoPor,
      errores: detalle.errores,
    },
  });
  return formatoImportacion(terminada);
}

async function correr(importacionId, detalle) {
  // 1. El Excel: primero la página (para encontrarlo por su título).
  let excel = null;
  let motivo = null;
  let url = INAC.EXCEL;
  try {
    const encontrada = buscarEnlaceSerie((await bajar(INAC.PAGINA)).toString('utf8'));
    if (encontrada) url = encontrada;
    else detalle.avisos.push('No encontré el enlace del Excel en la página de INAC; usé la dirección conocida.');
  } catch (error) {
    detalle.avisos.push(`No pude leer la página de INAC (${error.message}); usé la dirección conocida del Excel.`);
  }
  detalle.url = url;
  try {
    excel = await bajar(url);
    if (excel.subarray(0, 2).toString('latin1') !== 'PK') throw new Error('lo que bajó no es un Excel');
  } catch (error) {
    excel = null;
    motivo = `No pude bajar el Excel: ${error.message}.`;
  }

  const hash = excel ? hashArchivo(excel) : null;
  if (excel) {
    const anterior = await prisma.importacionPrecio.findFirst({
      where: { fuente: 'INAC', id: { not: importacionId }, hashArchivo: { not: null }, estado: { in: ['OK', 'EN_REVISION', 'SIN_CAMBIOS'] } },
      orderBy: { id: 'desc' },
    });
    if (anterior?.hashArchivo === hash) {
      return { estado: 'SIN_CAMBIOS', origen: 'EXCEL', hash, semanaDesde: iso(anterior.semanaDesde) };
    }

    // 2. Leerlo.
    const lectura = await leerSerieInac(excel);
    const ultima = lectura.semanas.at(-1);
    const faltan = ultima ? OBLIGATORIOS.filter((k) => ultima.valores[k] == null) : OBLIGATORIOS;
    if (ultima && !faltan.length) {
      detalle.avisos.push(...lectura.errores, ...lectura.avisos);
      return guardarSemanas({ semanas: lectura.semanas, origen: 'EXCEL', hash, importacionId, detalle });
    }
    motivo = `El Excel no se pudo leer: ${lectura.errores.join(' ') || 'faltan los precios en 4ta balanza.'}`;
  }

  // 3. Claude de respaldo.
  detalle.respaldo = motivo;
  const cliente = deps.claude();
  if (!cliente) throw new Error(`${motivo} No hay ANTHROPIC_API_KEY: no se puede usar Claude de respaldo.`);

  let semana = null;
  if (excel) {
    try {
      semana = await extraerConClaude({ cliente, csv: await excelComoCsv(excel) });
      detalle.leidoCon = 'Claude, con el Excel en CSV';
    } catch (error) {
      detalle.avisos.push(`Claude con el Excel: ${error.message}`);
    }
  }
  if (!semana) {
    const pdf = await bajar(INAC.PDF);
    if (pdf.subarray(0, 4).toString('latin1') !== '%PDF') throw new Error('Lo que bajó como informe de INAC no es un PDF.');
    semana = await extraerConClaude({ cliente, pdf });
    detalle.leidoCon = 'Claude, con el PDF del informe';
  }
  return guardarSemanas({
    semanas: [semana],
    origen: 'CLAUDE',
    hash,
    importacionId,
    detalle,
    revisar: `Leído con Claude (${detalle.leidoCon.replace('Claude, ', '')}) porque ${motivo.charAt(0).toLowerCase()}${motivo.slice(1)} Revisalo contra el informe de INAC antes de aprobar.`,
  });
}

// Los valores de una semana guardada (para comparar la nueva con la anterior).
async function valoresGuardados(desde) {
  if (!desde) return null;
  const filas = await prisma.precioMercado.findMany({ where: { fuente: 'INAC', semanaDesde: fecha(desde) } });
  return { valores: Object.fromEntries(filas.map((f) => [f.indicador, Number(f.valor)])) };
}

// Guarda las semanas nuevas (las posteriores a la última guardada de INAC).
// La más nueva se valida contra la anterior; con algo marcado (o leída con
// Claude) todas las de esta corrida quedan sin publicar hasta que se aprueben.
async function guardarSemanas({ semanas, origen, hash, importacionId, detalle, revisar = null }) {
  const ultimaGuardada = await prisma.precioMercado.findFirst({
    where: { fuente: 'INAC' },
    orderBy: { semanaDesde: 'desc' },
    select: { semanaDesde: true },
  });
  const desdeGuardada = iso(ultimaGuardada?.semanaDesde);
  const nuevas = semanas.filter((s) => !desdeGuardada || s.desde > desdeGuardada);
  detalle.semanasNuevas = nuevas.length;
  if (!nuevas.length) return { estado: 'SIN_CAMBIOS', origen, hash, semanaDesde: desdeGuardada };

  const ultima = nuevas.at(-1);
  const i = semanas.indexOf(ultima);
  const anterior = i > 0 ? semanas[i - 1] : await valoresGuardados(desdeGuardada);
  const control = validarSemana({ semana: ultima, anterior, hoy: hoyUruguay() });
  detalle.ultima = { desde: ultima.desde, hasta: ultima.hasta };
  detalle.avisos.push(...control.avisos);
  if (control.estado === 'ERROR') {
    detalle.errores.push(...control.errores);
    return { estado: 'ERROR', origen, hash, semanaDesde: ultima.desde };
  }
  const marcas = [...control.marcas];
  if (revisar) marcas.push({ motivo: 'CLAUDE', texto: revisar });
  detalle.marcas = marcas;
  const estado = marcas.length ? 'EN_REVISION' : 'OK';

  const filas = nuevas.flatMap((s) => Object.entries(valoresConocidos(s.valores)).map(([clave, valor]) => ({
    fuente: 'INAC',
    indicador: clave,
    semanaDesde: fecha(s.desde),
    semanaHasta: fecha(s.hasta),
    valor,
    unidad: indicador(clave).unidad,
    origen,
    publicado: estado === 'OK',
    importacionId,
  })));
  // La primera vez entra todo el histórico (unas 20.000 filas): de a tandas.
  await prisma.$transaction(async (tx) => {
    for (let k = 0; k < filas.length; k += 2000) {
      await tx.precioMercado.createMany({ data: filas.slice(k, k + 2000), skipDuplicates: true });
    }
  }, { timeout: 120_000 });
  return { estado, origen, hash, semanaDesde: ultima.desde };
}

// ---------------------------------------------------------------------------
// Al abrir la pantalla

export async function debeActualizarAlAbrir(ahora = new Date()) {
  const ultimaQueAnduvo = await prisma.importacionPrecio.findFirst({
    where: { fuente: 'INAC', estado: { in: ['OK', 'SIN_CAMBIOS', 'EN_REVISION'] } },
    orderBy: { inicio: 'desc' },
  });
  if (ultimaQueAnduvo && ahora - ultimaQueAnduvo.inicio < ACTUALIZAR_SI_PASARON) return false;
  const reciente = await prisma.importacionPrecio.findFirst({
    where: { fuente: 'INAC', inicio: { gte: new Date(ahora - ESPERA_ENTRE_CORRIDAS) } },
  });
  return !reciente;
}

// Si corresponde, dispara una corrida sin esperarla. true si la disparó.
export async function actualizarAlAbrir(req) {
  if (!(await debeActualizarAlAbrir())) return false;
  _enSegundoPlano = actualizarPrecios(req, { disparadoPor: 'AL_ABRIR' }).catch(() => {});
  return true;
}

// ---------------------------------------------------------------------------
// Consultas

const INCLUIR_IMPORTACION = {
  usuario: { select: { id: true, nombre: true } },
  aprobadaPor: { select: { id: true, nombre: true } },
};

function formatoImportacion(i) {
  return {
    id: i.id,
    fuente: i.fuente,
    estado: i.estado,
    origen: i.origen,
    semanaDesde: iso(i.semanaDesde),
    semanaHasta: i.semanaDesde ? sumarDias(iso(i.semanaDesde), 6) : null,
    inicio: i.inicio,
    fin: i.fin,
    disparadoPor: i.disparadoPor,
    usuario: i.usuario ?? null,
    aprobadaPor: i.aprobadaPor ?? null,
    aprobadaEn: i.aprobadaEn,
    detalle: i.detalle ?? {},
  };
}

function formatoPrecio(p) {
  const ind = indicador(p.indicador);
  return {
    id: p.id,
    fuente: p.fuente,
    indicador: p.indicador,
    nombre: ind?.nombre ?? p.indicador,
    grupo: ind?.grupo ?? null,
    unidad: p.unidad,
    semanaDesde: iso(p.semanaDesde),
    semanaHasta: iso(p.semanaHasta),
    valor: Number(p.valor),
    cabezas: p.cabezas,
    origen: p.origen,
    publicado: p.publicado,
    corregido: p.corregidoPorId != null,
    nota: p.nota,
  };
}

// De varias filas del mismo indicador y semana, la cargada a mano manda.
function elegir(filas, clave) {
  const delIndicador = filas.filter((f) => f.indicador === clave);
  return delIndicador.find((f) => f.fuente === 'MANUAL') ?? delIndicador[0] ?? null;
}

export async function importaciones({ limite = 20 } = {}) {
  const filas = await prisma.importacionPrecio.findMany({ orderBy: { id: 'desc' }, take: limite, include: INCLUIR_IMPORTACION });
  return filas.map(formatoImportacion);
}

// La última semana publicada, con la anterior y la variación de cada precio.
export async function ultimos() {
  const [ultimaImportacion] = await importaciones({ limite: 1 });
  const ultima = await prisma.precioMercado.findFirst({ where: { publicado: true }, orderBy: { semanaDesde: 'desc' } });
  if (!ultima) return { semana: null, anterior: null, precios: [], ultimaImportacion: ultimaImportacion ?? null };

  const previa = await prisma.precioMercado.findFirst({
    where: { publicado: true, semanaDesde: { lt: ultima.semanaDesde } },
    orderBy: { semanaDesde: 'desc' },
  });
  const [deLaUltima, deLaPrevia] = await Promise.all([
    prisma.precioMercado.findMany({ where: { publicado: true, semanaDesde: ultima.semanaDesde }, include: { importacion: true } }),
    previa ? prisma.precioMercado.findMany({ where: { publicado: true, semanaDesde: previa.semanaDesde } }) : [],
  ]);

  const precios = INDICADORES.map((ind) => {
    const act = elegir(deLaUltima, ind.clave);
    const ant = elegir(deLaPrevia, ind.clave);
    if (!act && !ant) return null;
    return {
      ...(act ? formatoPrecio(act) : { indicador: ind.clave, nombre: ind.nombre, grupo: ind.grupo, unidad: ind.unidad, valor: null }),
      anterior: ant ? Number(ant.valor) : null,
      variacion: act && ant ? variacion(Number(act.valor), Number(ant.valor)) : null,
    };
  }).filter(Boolean);

  const deInac = deLaUltima.find((f) => f.fuente === 'INAC');
  return {
    semana: { desde: iso(ultima.semanaDesde), hasta: iso(ultima.semanaHasta) },
    anterior: previa ? { desde: iso(previa.semanaDesde), hasta: iso(previa.semanaHasta) } : null,
    fuente: deInac ? 'INAC' : 'MANUAL',
    actualizadoEn: deInac?.importacion?.fin ?? deLaUltima[0].creadoEn,
    precios,
    ultimaImportacion: ultimaImportacion ?? null,
  };
}

// El historial: por defecto, las últimas 26 semanas publicadas.
export async function historial({ indicador: clave, desde, hasta, fuente } = {}) {
  const where = { publicado: true };
  if (clave) where.indicador = clave;
  if (fuente) where.fuente = fuente;
  if (desde || hasta) {
    where.semanaDesde = {};
    if (desde) where.semanaDesde.gte = fecha(desde);
    if (hasta) where.semanaDesde.lte = fecha(hasta);
  } else {
    const ultima = await prisma.precioMercado.findFirst({ where, orderBy: { semanaDesde: 'desc' } });
    if (!ultima) return [];
    where.semanaDesde = { gte: fecha(sumarDias(iso(ultima.semanaDesde), -7 * 25)) };
  }
  const filas = await prisma.precioMercado.findMany({ where, orderBy: [{ semanaDesde: 'asc' }, { indicador: 'asc' }] });
  return filas.map(formatoPrecio);
}

// ---------------------------------------------------------------------------
// Aprobar, corregir y cargar a mano

export async function aprobar(req, id) {
  const imp = await prisma.importacionPrecio.findUnique({ where: { id } });
  if (!imp) throw notFound('Importación no encontrada');
  if (imp.estado !== 'EN_REVISION') throw conflict('Esa importación no está en revisión.');
  const [publicados, aprobada] = await prisma.$transaction([
    prisma.precioMercado.updateMany({ where: { importacionId: id }, data: { publicado: true } }),
    prisma.importacionPrecio.update({
      where: { id },
      data: { estado: 'OK', aprobadaPorId: req.user.id, aprobadaEn: new Date() },
      include: INCLUIR_IMPORTACION,
    }),
  ]);
  await registrar(req, {
    accion: ACCION.PRECIOS_APROBADOS,
    entidad: 'importacion_precio',
    entidadId: String(id),
    detalle: { semana: iso(imp.semanaDesde), precios: publicados.count, marcas: imp.detalle?.marcas ?? [] },
  });
  return formatoImportacion(aprobada);
}

export async function corregir(req, id, { valor, nota }) {
  const antes = await prisma.precioMercado.findUnique({ where: { id } });
  if (!antes) throw notFound('Precio no encontrado');
  const despues = await prisma.precioMercado.update({
    where: { id },
    data: { valor, nota, corregidoPorId: req.user.id },
  });
  await registrar(req, {
    accion: ACCION.PRECIO_CORREGIDO,
    entidad: 'precio_mercado',
    entidadId: String(id),
    detalle: {
      indicador: antes.indicador,
      semana: iso(antes.semanaDesde),
      antes: { valor: Number(antes.valor), nota: antes.nota },
      despues: { valor: Number(despues.valor), nota },
    },
  });
  return formatoPrecio(despues);
}

export async function cargarManual(req, { indicador: clave, semanaDesde, valor, nota = null, cabezas = null }) {
  const dia = fecha(semanaDesde);
  if (Number.isNaN(dia.getTime()) || iso(dia) !== semanaDesde) throw badRequest('La fecha no es válida.');
  if (dia.getUTCDay() !== 0) throw badRequest('La semana tiene que empezar un domingo (como las de INAC).');
  if (semanaDesde > hoyUruguay()) throw badRequest('La semana todavía no empezó.');
  let creado;
  try {
    creado = await prisma.precioMercado.create({
      data: {
        fuente: 'MANUAL',
        indicador: clave,
        semanaDesde: dia,
        semanaHasta: fecha(sumarDias(semanaDesde, 6)),
        valor,
        unidad: indicador(clave).unidad,
        cabezas,
        origen: 'MANUAL',
        nota,
      },
    });
  } catch (error) {
    if (error.code === 'P2002') throw conflict('Ya hay un precio cargado a mano para ese indicador y esa semana: corregilo.');
    throw error;
  }
  await registrar(req, {
    accion: ACCION.PRECIO_CARGADO,
    entidad: 'precio_mercado',
    entidadId: String(creado.id),
    detalle: { indicador: clave, semana: semanaDesde, valor, nota },
  });
  return formatoPrecio(creado);
}
