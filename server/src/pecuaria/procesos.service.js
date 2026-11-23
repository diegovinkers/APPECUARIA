// Procesos (diseño docs/superpowers/specs/2026-11-20-procesos-design.md): una
// cadena de etapas que lleva meses. En la v1, el ciclo reproductivo de un
// grupo de servicio: servicio → diagnóstico → parición → destete.
//
// Cada etapa deja un "ancla" en evento_registro (con procesoId y etapa), uno
// por lote; los movimientos que provoca cuelgan de ella (movimiento.procesoId
// y registroId) y van en un EventoMovimiento PROCESO con el grupoId de la
// carga, así se revierten juntos al anularla. Las etapas puntuales van una
// sola vez por proceso y lote (índice único parcial de la base, más un
// bloqueo de la fila del proceso para que dos cargas no se pisen).
//
// La etapa actual, las próximas fechas y el embudo se calculan
// (procesos.calculos.js); no se guardan.
import { randomUUID } from 'node:crypto';
import { prisma } from '../db.js';
import { Prisma } from '../generated/prisma/client.ts';
import { HttpError, badRequest, conflict, notFound, parseId } from '../errors.js';
import { aFecha, fechaISO, hoyISO } from './importaciones.service.js';
import { fotoActual, nombreLibre } from './lotes.js';
import { fechaUY } from './stock.service.js';
import { tipoPorClave } from './tipos.repository.js';
import { TEXTO_ETAPA, campaniaDe, embudo, etapaActual, fechasServicio, mesesEsperados, planDecision, sugerirCategoria, sumarDias, textoMeses } from './procesos.calculos.js';
import { sugerencias } from './procesos.sugerencias.js';
import { aplicar, revertirEventoEn } from './movimientos.service.js';
import { aplicarEntradaSalida } from './entradas-salidas.service.js';
import { ETAPAS_UNICAS, PLANTILLAS, TIPOS_REPRODUCCION, etapaDe, etapaDePlantilla } from './procesos.plantillas.js';
import { textoDatos } from './eventos.datos.js';
import { estadosProceso, plazosProceso } from './procesos.configuracion.js';
import { listaToros, textoToros } from './procesos.datos.js';
import { MODALIDAD, lineaDiagnostico, lineaParicion, lineaRevision, lineaSimple, textoAncla } from './procesos.datos.js';

const TX = { timeout: 60_000, maxWait: 10_000 };
const plural = (n, uno, varios) => `${n.toLocaleString('es-UY')} ${n === 1 ? uno : varios}`;
const esP2002 = (error) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
const nombreEtapa = (clave) => etapaDePlantilla(clave)?.nombre.toLowerCase() ?? clave.toLowerCase();

// Corre `fn` en una transacción. Un choque con el índice único (dos cargas de
// la misma etapa al mismo tiempo) es un 409, no un 500.
async function enTransaccion(fn) {
  try {
    return await prisma.$transaction(fn, TX);
  } catch (error) {
    if (esP2002(error)) throw conflict('Esa etapa ya está cargada para ese lote (la acaban de cargar). Actualizá la ficha.');
    throw error;
  }
}

// --- Parámetros ---

// Desde el 23/11 salen de los plazos de las etapas (etapa_plantilla, editables
// en Configuración → Procesos): gestación = plazo de la parición, ecografía y
// destete (en meses).
export async function parametrosProceso(db = prisma) {
  const plazos = await plazosProceso(db);
  return { gestacionDias: plazos.PARICION.plazo, diagnosticoDesdeDias: plazos.DIAGNOSTICO.plazo, lactanciaMeses: plazos.DESTETE.plazo, plazos };
}

// --- Lotes ---

// Las cabezas de hoy de cada lote (una foto por potrero).
async function cabezasDeHoy(db, lotes) {
  const fotos = new Map();
  const cabezas = new Map();
  for (const l of lotes) {
    if (!fotos.has(l.potreroId)) fotos.set(l.potreroId, await fotoActual(db, l.potreroId));
    const linea = fotos.get(l.potreroId).lineas.find((x) => x.loteId === l.id);
    cabezas.set(l.id, linea?.cabezas ?? 0);
  }
  return cabezas;
}

// El proceso abierto en que está un lote (o null).
export async function procesoAbiertoDe(db, loteId) {
  const pl = await db.procesoLote.findFirst({
    where: { loteId, hasta: null, proceso: { estado: 'ABIERTO' } },
    include: { proceso: { select: { id: true, nombre: true, tipo: true } } },
  });
  return pl ? { ...pl.proceso, rol: pl.rol, mes: pl.mes, destino: pl.destino } : null;
}

// Los procesos abiertos de unos lotes: Map loteId → { id, nombre, textoEtapa }.
export async function procesosDeLotes(loteIds) {
  const filas = await prisma.procesoLote.findMany({
    where: { loteId: { in: loteIds }, hasta: null, proceso: { estado: 'ABIERTO' } },
    include: { proceso: { include: { registros: { select: anclaSelect }, lotes: { include: { lote: { select: { activo: true } } } } } } },
  });
  const porLote = new Map();
  for (const f of filas) {
    const etapa = etapaActual(f.proceso.registros.map(aAncla), f.proceso.lotes.map(aLoteRol));
    porLote.set(f.loteId, { id: f.proceso.id, nombre: f.proceso.nombre, rol: f.rol, etapa, textoEtapa: TEXTO_ETAPA[etapa] });
  }
  return porLote;
}

// --- Crear ---

// Los lotes elegidos para empezar un proceso: que existan, tengan animales,
// sean hembras, de la misma estancia y no estén en otro proceso abierto.
async function lotesParaEmpezar(db, ids, campoId) {
  if (!ids.length) throw badRequest('Elegí los lotes que se sirven');
  if (new Set(ids).size !== ids.length) throw badRequest('Hay un lote elegido dos veces');
  const lotes = await db.lote.findMany({ where: { id: { in: ids } }, include: { categoria: true } });
  if (lotes.length !== ids.length) throw badRequest('Hay lotes elegidos que no existen');
  const campo = campoId ?? lotes[0].campoId;
  const cabezas = await cabezasDeHoy(db, lotes);
  const porId = new Map(lotes.map((l) => [l.id, l]));
  const anteriores = new Map(); // loteId → proceso del que viene (reentore)
  for (const id of ids) {
    const l = porId.get(id);
    if (l.campoId !== campo) throw badRequest('Los lotes tienen que ser de la misma estancia');
    if (!l.activo || !cabezas.get(l.id)) throw badRequest(`El lote ${l.nombre} no tiene animales`);
    if (l.categoria.sexo === 'MACHO') throw badRequest(`El lote ${l.nombre} es de ${l.categoria.nombre}: un servicio es para hembras`);
    const otro = await procesoAbiertoDe(db, l.id);
    // Las vacías que quedaron para el reentore pasan al servicio nuevo.
    if (otro?.destino === 'REENTORE') anteriores.set(l.id, otro.id);
    else if (otro) throw conflict(`El lote ${l.nombre} ya está en el proceso "${otro.nombre}"`);
  }
  return { campoId: campo, anteriores, lotes: ids.map((id) => ({ ...porId.get(id), cabezas: cabezas.get(id) })) };
}

async function nombreLibreProceso(db, campoId, base) {
  for (let k = 1; ; k++) {
    const nombre = k === 1 ? base : `${base} (${k})`;
    if (!(await db.proceso.findUnique({ where: { campoId_nombre: { campoId, nombre } }, select: { id: true } }))) return nombre;
  }
}

async function exigirNombreLibre(db, campoId, nombre, exceptoId = null) {
  const otro = await db.proceso.findUnique({ where: { campoId_nombre: { campoId, nombre } }, select: { id: true } });
  if (otro && otro.id !== exceptoId) throw badRequest(`Ya hay un proceso que se llama "${nombre}" en esta estancia`);
}

// Arma lo que se va a guardar al crear (sin guardar).
async function planCrear(db, body) {
  const enCurso = body.enCurso ?? null;
  const ids = enCurso ? enCurso.lotes.map((l) => l.loteId) : (body.lineas ?? []).map((l) => l.loteId);
  const { campoId, lotes, anteriores } = await lotesParaEmpezar(db, ids, body.campoId ?? null);
  const dia = enCurso ? enCurso.inicio : (body.fecha ?? hoyISO());
  const campania = campaniaDe(dia);

  let lineas = [];
  if (enCurso) {
    if (enCurso.fin < enCurso.inicio) throw badRequest('El fin del servicio no puede ser anterior al inicio');
    const prenadas = enCurso.prenadas ?? null;
    const vacias = enCurso.vacias ?? 0;
    if (prenadas == null) throw badRequest('Escribí cuántas quedaron preñadas');
    if (prenadas + vacias > enCurso.servidas) {
      throw badRequest(`Las preñadas y vacías (${prenadas + vacias}) no pueden ser más que las servidas (${enCurso.servidas})`);
    }
  } else {
    lineas = await lineasDeServicio(db, body.lineas, lotes, campoId);
  }

  const categorias = [...new Set(lotes.map((l) => l.categoria.nombre))];
  let nombre = body.nombre?.trim();
  if (nombre) await exigirNombreLibre(db, campoId, nombre);
  else nombre = await nombreLibreProceso(db, campoId, `Servicio ${campania} · ${categorias.join(' y ')}`.slice(0, 115));
  const toros = body.toros ?? (body.asignarToros?.length || null);
  return { campoId, lotes, anteriores, lineas, enCurso, dia, campania, nombre, modalidad: body.modalidad, toros, asignarToros: body.asignarToros ?? [], nota: body.nota ?? null };
}

// Las líneas de un servicio (al crear o en una tanda): cuántas entran de cada
// lote, el reparto en potreros y, en una IATF, a dónde van las inseminadas.
async function lineasDeServicio(db, lineasBody, lotes, campoId) {
  // Los potreros del reparto y del IATF: que existan y sean de la estancia.
  const ids = [...new Set(lineasBody.flatMap((l) => [...(l.reparto ?? []).map((r) => r.potreroId), ...(l.potreroId ? [l.potreroId] : [])]))];
  const potreros = new Map((await db.potrero.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true, campoId: true } })).map((p) => [p.id, p]));
  const potrero = (id) => {
    const p = potreros.get(id);
    if (!p || p.campoId !== campoId) throw badRequest('Hay un potrero elegido que no es de esta estancia');
    return p;
  };
  return lineasBody.map((linea) => {
    const lote = lotes.find((l) => l.id === linea.loteId);
    const cabezas = linea.cabezas ?? lote.cabezas;
    if (cabezas > lote.cabezas) throw badRequest(`El lote ${lote.nombre} tiene ${lote.cabezas} cabezas`);
    const reparto = (linea.reparto ?? []).map((r) => ({ ...r, potrero: potrero(r.potreroId) }));
    const vistos = new Set();
    for (const r of reparto) {
      if (r.potreroId === lote.potreroId) throw badRequest(`Las de ${lote.nombre} ya están en ${r.potrero.nombre}: para repartirlas, elegí otro potrero`);
      if (vistos.has(r.potreroId)) throw badRequest(`En el reparto de ${lote.nombre}, ${r.potrero.nombre} está dos veces`);
      vistos.add(r.potreroId);
    }
    const repartidas = reparto.reduce((s, r) => s + r.cabezas, 0);
    if (repartidas > cabezas) throw badRequest(`En el lote ${lote.nombre} se reparten ${repartidas} cabezas, pero entran al servicio ${cabezas}`);
    const destino = linea.potreroId ? potrero(linea.potreroId) : null;
    return { lote, cabezas, reparto, destino };
  });
}

// El potrero al que van los toros si no se elige: a donde fueron las vacas de
// la primera línea (el destino, el primer potrero del reparto o donde están).
const potreroDeLasVacas = (linea) => linea?.destino?.id ?? linea?.reparto?.[0]?.potreroId ?? linea?.lote?.potreroId ?? null;

const oracionCrear = (plan) => {
  if (plan.enCurso) {
    return `Vas a cargar "${plan.nombre}", que ya está ${plan.enCurso.etapa === 'PARIENDO' ? 'pariendo' : 'diagnosticado'}: ${plural(plan.enCurso.servidas, 'servida', 'servidas')}, ${plural(plan.enCurso.prenadas, 'preñada', 'preñadas')}`;
  }
  const cabezas = plan.lineas.reduce((s, l) => s + l.cabezas, 0);
  return `Vas a empezar "${plan.nombre}": ${MODALIDAD[plan.modalidad]} de ${plural(plan.lineas.length, 'lote', 'lotes')} (${plural(cabezas, 'cabeza', 'cabezas')}) el ${fechaUY(plan.dia)}`;
};

// La vista previa hace lo mismo que crear y lo deshace (Simulacion): así
// valida los repartos y muestra los movimientos que se harían.
export async function vistaPreviaCrear(body) {
  try {
    await prisma.$transaction(async (tx) => {
      const { plan, ctx } = await crearEn(tx, body, null);
      throw new Simulacion({
        nombre: plan.nombre,
        campania: plan.campania,
        oracion: oracionCrear(plan),
        lotes: plan.enCurso ? plan.lotes.length : plan.lineas.length,
        cabezas: plan.enCurso ? plan.enCurso.servidas : plan.lineas.reduce((s, l) => s + l.cabezas, 0),
        pasos: ctx?.pasos ?? [],
        avisos: [],
      });
    }, TX);
  } catch (error) {
    if (error instanceof Simulacion) return error.resultado;
    throw error;
  }
  throw new Error('La simulación no devolvió nada');
}

const toProceso = (p) => ({
  id: p.id,
  nombre: p.nombre,
  tipo: p.tipo,
  campoId: p.campoId,
  campania: p.campania,
  fechaInicio: fechaISO(p.fechaInicio),
  estado: p.estado,
  datos: p.datos,
  nota: p.nota,
});

// Crea el proceso con sus lotes y las anclas del inicio (o los datos
// iniciales, si ya venía en curso). `tx`: una transacción abierta.
async function crearEn(tx, body, usuarioId) {
  const plan = await planCrear(tx, body);
  const grupoId = randomUUID();
  const proceso = await tx.proceso.create({
    data: {
      nombre: plan.nombre,
      campoId: plan.campoId,
      campania: plan.campania,
      fechaInicio: aFecha(plan.dia),
      datos: { modalidad: plan.modalidad, ...(plan.toros != null && { toros: plan.toros }) },
      nota: plan.nota,
      procesoAnteriorId: [...plan.anteriores.values()][0] ?? null,
      usuarioId,
    },
  });
  const desde = aFecha(plan.enCurso ? hoyISO() : plan.dia);
  // Reentore: las vacías dejan el proceso anterior.
  for (const [loteId, anteriorId] of plan.anteriores) {
    await tx.procesoLote.update({ where: { procesoId_loteId: { procesoId: anteriorId, loteId } }, data: { hasta: desde } });
  }
  const roles = new Map((plan.enCurso?.lotes ?? []).map((l) => [l.loteId, l]));
  for (const l of plan.lotes) {
    await tx.procesoLote.create({
      data: { procesoId: proceso.id, loteId: l.id, rol: roles.get(l.id)?.rol ?? 'VIENTRES', mes: roles.get(l.id)?.mes ?? null, desde },
    });
  }
  const comun = { campoId: plan.campoId, procesoId: proceso.id, grupoId, nota: plan.nota, usuarioId };
  if (plan.enCurso) {
    // Datos iniciales: de todo el proceso (sin lote), sin tocar el stock.
    const e = plan.enCurso;
    const tipos = {
      INICIO: await tipoPorClave(tx, plan.modalidad === 'TOROS' ? 'ENTORE' : 'INSEMINACION'),
      FIN_SERVICIO: await tipoPorClave(tx, 'FIN_SERVICIO'),
      DIAGNOSTICO: await tipoPorClave(tx, 'ECOGRAFIA'),
    };
    const anclas = [
      { etapa: 'INICIO', fecha: e.inicio, cabezas: e.servidas, datos: { inicial: true, modalidad: plan.modalidad } },
      { etapa: 'FIN_SERVICIO', fecha: e.fin, cabezas: e.servidas, datos: { inicial: true } },
      { etapa: 'DIAGNOSTICO', fecha: e.fechaDiagnostico ?? e.fin, cabezas: e.prenadas + (e.vacias ?? 0), datos: { inicial: true, metodo: null, prenadas: { sin: e.prenadas }, vacias: e.vacias ?? 0 } },
    ];
    for (const a of anclas) {
      await tx.eventoRegistro.create({ data: { ...comun, tipoId: tipos[a.etapa].id, etapa: a.etapa, fecha: aFecha(a.fecha), nivel: 'CAMPO', cabezas: a.cabezas, datos: a.datos } });
    }
  } else {
    const tipo = await tipoPorClave(tx, plan.modalidad === 'TOROS' ? 'ENTORE' : 'INSEMINACION');
    // El mismo contexto que las cargas de las etapas (los movimientos van en
    // el evento PROCESO de este grupo, y se anulan juntos).
    const ctx = { tx, proceso, etapa: 'INICIO', dia: plan.dia, usuarioId, grupoId, nota: plan.nota, evento: null, lineas: [], pasos: [], avisos: [], rolesAntes: new Map(), primerAncla: null };
    for (const linea of plan.lineas) {
      const { lote, cabezas, reparto } = linea;
      const registro = await tx.eventoRegistro.create({
        data: {
          ...comun,
          tipoId: tipo.id,
          etapa: 'INICIO',
          fecha: aFecha(plan.dia),
          potreroId: lote.potreroId,
          loteId: lote.id,
          categoriaId: lote.categoriaId,
          nivel: cabezas < lote.cabezas ? 'PARTE_LOTE' : 'LOTE',
          cabezas,
          datos: {
            modalidad: plan.modalidad,
            ...(reparto.length && { reparto: reparto.map((r) => ({ potrero: r.potrero.nombre, cabezas: r.cabezas, ...(r.toros != null && { toros: r.toros }) })) }),
          },
        },
      });
      ctx.primerAncla ??= registro.id;
      ctx.primerRegistro ??= registro;
      await acomodarAlEmpezar(ctx, linea, plan.modalidad, registro);
    }
    // Los toros, uno por uno (fase 6): al potrero de las vacas o al elegido.
    if (plan.asignarToros.length) {
      if (plan.modalidad !== 'TOROS') throw badRequest('Los toros van en un entore');
      await entrarToros(ctx, plan.asignarToros, ctx.primerRegistro, potreroDeLasVacas(plan.lineas[0]));
    }
    if (ctx.primerAncla && ctx.rolesAntes.size) {
      await tx.eventoRegistro.update({ where: { id: ctx.primerAncla }, data: { rolesAntes: [...ctx.rolesAntes].map(([loteId, antes]) => ({ loteId, antes })) } });
    }
    return { proceso, plan, grupoId, ctx };
  }
  return { proceso, plan, grupoId };
}

const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// Al empezar (ajustes del 20/11): el reparto en potreros y, en una IATF, las
// inseminadas aparte de las que no.
//   Cada fila del reparto es una parte del mismo lote en ese potrero (si se
//   van todas, la última se lleva el lote entero).
//   IATF con menos inseminadas que el lote: lo inseminado que no se repartió
//   va a "<lote> · IATF dd/mm" (al potrero elegido o en el mismo); el lote
//   queda "sin inseminar" para otro día. Con todas inseminadas, el lote
//   entero puede ir al potrero elegido.
async function acomodarAlEmpezar(ctx, { lote, cabezas, reparto, destino }, modalidad, registro) {
  const { tx, dia, usuarioId, nota } = ctx;
  const aparte = modalidad === 'IATF' && cabezas < lote.cabezas;
  let quedan = lote.cabezas;
  for (const [i, r] of reparto.entries()) {
    const base = { loteOrigenId: lote.id, cabezas: r.cabezas, destinoPotreroId: r.potreroId, fecha: dia, nota };
    const entero = !aparte && i === reparto.length - 1 && r.cabezas === quedan;
    const p = await aplicar(tx, entero ? { ...base, modo: 'ENTERO' } : { ...base, modo: 'NUEVO', parteFamilia: {} }, usuarioId, await extraDe(ctx, registro));
    ctx.pasos.push({ texto: textoDelPlan(p) });
    if (!entero) await guardarRol(ctx, p.loteDestino.id, { rol: 'VIENTRES' }, registro);
    quedan -= r.cabezas;
  }
  const sinRepartir = cabezas - reparto.reduce((s, r) => s + r.cabezas, 0);
  if (aparte) {
    if (sinRepartir > 0) {
      const p = await aplicar(
        tx,
        { loteOrigenId: lote.id, cabezas: sinRepartir, destinoPotreroId: destino?.id ?? lote.potreroId, modo: 'NUEVO', parteFamilia: { sufijo: `IATF ${ddmm(dia)}` }, fecha: dia, nota },
        usuarioId,
        await extraDe(ctx, registro),
      );
      ctx.pasos.push({ texto: textoDelPlan(p) });
      await guardarRol(ctx, p.loteDestino.id, { rol: 'VIENTRES' }, registro);
    }
    await guardarRol(ctx, lote.id, { rol: 'SIN_SERVIR' }, registro);
    ctx.pasos.push({ texto: `${(lote.cabezas - cabezas).toLocaleString('es-UY')} quedan sin inseminar en ${lote.nombre}` });
  } else if (destino && quedan > 0 && quedan === lote.cabezas && destino.id !== lote.potreroId) {
    const p = await aplicar(tx, { loteOrigenId: lote.id, cabezas: quedan, destinoPotreroId: destino.id, modo: 'ENTERO', fecha: dia, nota }, usuarioId, await extraDe(ctx, registro));
    ctx.pasos.push({ texto: textoDelPlan(p) });
  }
}

export async function crear(body, usuarioId) {
  const { proceso, plan, grupoId } = await enTransaccion((tx) => crearEn(tx, body, usuarioId));
  return {
    proceso: toProceso(proceso),
    grupoId,
    oracion: oracionCrear(plan).replace(/^Vas a empezar/, 'Empezaste').replace(/^Vas a cargar/, 'Cargaste'),
    auditoria: {
      nombre: plan.nombre,
      campania: plan.campania,
      modalidad: plan.modalidad,
      fecha: plan.dia,
      lotes: plan.lotes.map((l) => l.nombre),
      ...(plan.enCurso ? { enCurso: plan.enCurso } : { cabezas: plan.lineas.reduce((s, l) => s + l.cabezas, 0) }),
    },
  };
}

// Desde Eventos (Entore o Inseminación con "Empieza un servicio"): el mismo
// crear, con el tipo como modalidad.
export function cuerpoDesdeEvento(tipo, body) {
  if (tipo.clave !== 'ENTORE' && tipo.clave !== 'INSEMINACION') throw badRequest('Solo un entore o una inseminación empiezan un servicio');
  if (!body.lineas?.length || (body.nivel && body.nivel !== 'LOTE')) throw badRequest('Para empezar un servicio, elegí los lotes');
  return {
    nombre: body.empezarServicio?.nombre ?? undefined,
    fecha: body.fecha,
    nota: body.nota,
    modalidad: tipo.clave === 'ENTORE' ? 'TOROS' : 'IATF',
    lineas: body.lineas.map((l) => ({ loteId: l.loteId, ...(l.cabezas != null && l.cabezas !== '' && { cabezas: Number(l.cabezas) }) })),
  };
}

// --- Las cargas de las etapas ---
//
// Una carga guarda los anclas (uno por lote) y hace sus movimientos, todo en
// la transacción que recibe. La vista previa hace lo mismo y lo deshace
// (Simulacion), así lo que se ve es exactamente lo que se guardaría.

class Simulacion extends Error {
  constructor(resultado) {
    super('simulación');
    this.resultado = resultado;
  }
}

const MES = /^\d{4}-\d{2}$/;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const nombreMes = (mes) => MESES[Number(mes.slice(5, 7)) - 1];
const mayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);

// "preñadas oct", "vacías", "sin diagnosticar" (para los errores y los nombres).
function nombreGrupo(clave) {
  if (clave === 'vacias') return 'vacías';
  if (clave === 'sin') return 'preñadas';
  if (clave === 'sinDiagnostico') return 'sin diagnosticar';
  return MES.test(clave) ? `preñadas ${nombreMes(clave)}` : clave;
}

// El sufijo del lote que forma un bloque: "preñadas oct", "preñadas nov–dic", "vacías".
function sufijoDe(bloque) {
  if (bloque.clase === 'VACIAS') return 'vacías';
  const meses = [...new Set(bloque.grupos.filter((c) => MES.test(c)))].sort();
  if (!meses.length) return 'preñadas';
  return `preñadas ${textoMeses(meses)}`;
}

// El texto de un movimiento de un proceso (la vista previa y la ficha).
function textoMovimiento({ modo, cabezas, potrero, lote, loteOrigen, categoria, tipo, guia }) {
  const n = cabezas.toLocaleString('es-UY');
  if (modo === 'CATEGORIA') return `${loteOrigen} pasa a ${categoria}`;
  if (modo === 'SUMAR') return `${n} → lote ${lote}`;
  if (modo === 'SALIDA') return `${n} salen: ${tipo.toLowerCase()}${guia ? ` (guía ${guia})` : ''}`;
  if (modo === 'ENTRADA') return `${n} entran a ${lote} (${categoria})`;
  return `${n} → ${potrero}, lote ${lote} (${categoria})`;
}

const textoDelPlan = (p) =>
  textoMovimiento({ modo: p.modo, cabezas: p.cabezas, potrero: p.destino.nombre, lote: p.loteDestino.nombre, loteOrigen: p.lote.nombre, categoria: p.categoriaDestino.nombre });

async function bloquear(tx, id) {
  await tx.$queryRaw`SELECT id FROM proceso WHERE id = ${id} FOR UPDATE`;
}

const anclaSelect = { id: true, etapa: true, loteId: true, fecha: true, cabezas: true, datos: true, anulado: true, grupoId: true };
const aAncla = (r) => ({ ...r, fecha: fechaISO(r.fecha) });
const aLoteRol = (pl) => ({ loteId: pl.loteId, rol: pl.rol, mes: pl.mes, activo: pl.lote.activo && pl.hasta == null });

// El cronograma y lo que sigue (procesos.sugerencias.js), con los plazos de
// Configuración, las sugerencias descartadas y los procesos enganchados.
const cronogramaDe = (p, anclas, roles, parametros, hoy) =>
  sugerencias({
    proceso: { modalidad: p.datos?.modalidad, estado: p.estado },
    anclas,
    lotes: roles,
    plazos: parametros.plazos,
    hoy,
    descartadas: p.datos?.descartadas ?? [],
    siguientes: (p.siguientes ?? []).map((s) => fechaISO(s.fechaInicio)),
  });
const incluirSiguientes = { siguientes: { where: { estado: { not: 'ANULADO' } }, select: { fechaInicio: true } } };

async function procesoParaCargar(tx, id) {
  const procesoId = parseId(id);
  const p = procesoId && (await tx.proceso.findUnique({ where: { id: procesoId } }));
  if (!p) throw notFound('Proceso no encontrado');
  await bloquear(tx, p.id);
  if (p.estado !== 'ABIERTO') throw conflict(`El proceso está ${p.estado === 'CERRADO' ? 'cerrado' : 'anulado'}: no se le pueden cargar etapas`);
  return p;
}

// ¿Ya tiene este lote esta etapa (vigente)? Error con la fecha.
async function exigirLibre(tx, procesoId, etapa, lote) {
  if (!ETAPAS_UNICAS.has(etapa)) return;
  const ya = await tx.eventoRegistro.findFirst({ where: { procesoId, etapa, loteId: lote.id, anulado: false }, select: { fecha: true } });
  if (ya) {
    throw conflict(`El lote ${lote.nombre} ya tiene su ${nombreEtapa(etapa)} (${fechaUY(fechaISO(ya.fecha))}). Para corregirlo, anulalo y cargalo de nuevo.`);
  }
}

// La fecha no puede ser anterior a las etapas de antes de ese lote.
async function exigirDespuesDe(ctx, lote, etapas) {
  const antes = await ctx.tx.eventoRegistro.findFirst({
    where: { procesoId: ctx.proceso.id, loteId: lote.id, etapa: { in: etapas }, anulado: false },
    orderBy: { fecha: 'desc' },
    select: { fecha: true, etapa: true },
  });
  if (antes && ctx.dia < fechaISO(antes.fecha)) {
    throw badRequest(`La fecha no puede ser anterior al ${nombreEtapa(antes.etapa)} del lote ${lote.nombre} (${fechaUY(fechaISO(antes.fecha))})`);
  }
}

// Los lotes de la carga: los de `lineas`, o (sin lineas) todos los del
// proceso con el rol que toma la etapa y que todavía no la tienen.
async function lotesDeLaCarga(tx, proceso, etapaDef, lineas) {
  const pls = await tx.procesoLote.findMany({ where: { procesoId: proceso.id, hasta: null }, include: { lote: { include: { categoria: true } } } });
  const porLote = new Map(pls.map((pl) => [pl.loteId, pl]));
  let elegidos;
  if (lineas?.length) {
    elegidos = [];
    for (const linea of lineas) {
      const pl = porLote.get(linea.loteId);
      if (!pl) {
        const l = await tx.lote.findUnique({ where: { id: linea.loteId }, select: { nombre: true } });
        throw badRequest(`El lote ${l?.nombre ?? 'elegido'} no es parte del proceso`);
      }
      if (!etapaDef.toma.includes(pl.rol)) throw badRequest(`El lote ${pl.lote.nombre} no corresponde a la etapa ${nombreEtapa(etapaDef.clave)}`);
      elegidos.push({ pl, linea });
    }
  } else {
    const hechas = await tx.eventoRegistro.findMany({ where: { procesoId: proceso.id, etapa: etapaDef.clave, anulado: false }, select: { loteId: true } });
    const ya = new Set(hechas.map((h) => h.loteId));
    const posibles = pls.filter((pl) => etapaDef.toma.includes(pl.rol) && pl.lote.activo);
    elegidos = posibles.filter((pl) => !(etapaDef.unica && ya.has(pl.loteId))).map((pl) => ({ pl, linea: { loteId: pl.loteId } }));
    if (!elegidos.length) {
      // Si todos ya la tienen, el error dice cuándo se cargó.
      if (posibles.length) await exigirLibre(tx, proceso.id, etapaDef.clave, posibles[0].lote);
      throw badRequest(`No hay lotes del proceso para cargarles ${nombreEtapa(etapaDef.clave)}`);
    }
  }
  const cabezas = await cabezasDeHoy(
    tx,
    elegidos.map((e) => e.pl.lote),
  );
  return elegidos.map(({ pl, linea }) => {
    const lote = { ...pl.lote, cabezas: cabezas.get(pl.loteId) };
    if (!lote.activo || !lote.cabezas) throw badRequest(`El lote ${lote.nombre} no tiene animales`);
    return { pl, linea, lote };
  });
}

function fechaDeCarga(proceso, body) {
  const dia = body.fecha ?? hoyISO();
  const inicio = fechaISO(proceso.fechaInicio);
  if (dia < inicio) throw badRequest(`La fecha no puede ser anterior al inicio del proceso (${fechaUY(inicio)})`);
  return dia;
}

// El ancla de un lote en esta carga.
async function crearAncla(ctx, tipo, lote, cabezas, datos) {
  const r = await ctx.tx.eventoRegistro.create({
    data: {
      tipoId: tipo.id,
      fecha: aFecha(ctx.dia),
      campoId: ctx.proceso.campoId,
      potreroId: lote.potreroId,
      loteId: lote.id,
      categoriaId: lote.categoriaId,
      nivel: cabezas < lote.cabezas ? 'PARTE_LOTE' : 'LOTE',
      cabezas,
      datos,
      nota: ctx.nota,
      grupoId: ctx.grupoId,
      procesoId: ctx.proceso.id,
      etapa: ctx.etapa,
      usuarioId: ctx.usuarioId,
    },
  });
  ctx.lineas.push({ lote, cabezas, datos });
  ctx.primerAncla ??= r.id;
  return r;
}

// Lo que va en cada movimiento de la carga: el evento PROCESO (se crea con el
// primero), el proceso y el ancla.
async function extraDe(ctx, registro) {
  if (!ctx.evento) {
    ctx.evento = await ctx.tx.eventoMovimiento.create({
      data: { tipo: 'PROCESO', campoId: ctx.proceso.campoId, fecha: aFecha(ctx.dia), nota: ctx.nota, procesoId: ctx.proceso.id, grupoId: ctx.grupoId, usuarioId: ctx.usuarioId },
    });
  }
  return { eventoId: ctx.evento.id, procesoId: ctx.proceso.id, registroId: registro?.id ?? null };
}

// El rol de un lote en el proceso: lo crea o lo cambia.
async function guardarRol(ctx, loteId, { rol, mes = null, destino = null, hasta = null }, registro) {
  if (!ctx.rolesAntes.has(loteId)) {
    const antes = await ctx.tx.procesoLote.findUnique({ where: { procesoId_loteId: { procesoId: ctx.proceso.id, loteId } } });
    ctx.rolesAntes.set(loteId, antes && { rol: antes.rol, mes: antes.mes, destino: antes.destino, hasta: fechaISO(antes.hasta) });
  }
  await ctx.tx.procesoLote.upsert({
    where: { procesoId_loteId: { procesoId: ctx.proceso.id, loteId } },
    update: { rol, mes, destino, hasta: hasta ? aFecha(hasta) : null },
    create: { procesoId: ctx.proceso.id, loteId, rol, mes, destino, hasta: hasta ? aFecha(hasta) : null, desde: aFecha(ctx.dia), registroId: registro?.id ?? null },
  });
}

// Hace la decisión de un lote (diseño §8): planDecision dice los pasos; cada
// uno es un movimiento que cuelga del ancla. Después, el rol de cada lote que
// quedó. Un error dice de qué grupo es ("Preñadas oct: ...").
async function ejecutarDecision(ctx, lote, grupos, registro) {
  const plan = planDecision({ lote, grupos });
  if (plan.error) throw badRequest(plan.error);
  const { tx, dia, usuarioId } = ctx;
  const creados = new Map(); // grupos del bloque → lote creado (o al que se sumó)
  // Ecografía por partes (fase 6): si en el potrero ya hay una parte de este
  // lote con el mismo estado y categoría (las preñadas del día anterior), lo
  // de hoy se suma a ella en vez de formar otra parte.
  const sumarA = new Map();
  for (const b of plan.bloques) {
    const parte = await parteConElMismoEstado(ctx, lote, b);
    if (parte) sumarA.set(b.grupos, parte);
  }
  for (const paso of plan.pasos) {
    const parte = (paso.tipo === 'PARTE' || paso.tipo === 'MOVER_ENTERO' || paso.tipo === 'CATEGORIA') && sumarA.get(paso.grupos);
    if (parte) Object.assign(paso, { tipo: 'SUMAR', loteDestinoId: parte.id, potreroId: parte.potreroId });
  }
  const queda = plan.bloques.find((b) => b.queda);
  if (queda && sumarA.has(queda.grupos) && !plan.pasos.some((p) => p.grupos === queda.grupos)) {
    const parte = sumarA.get(queda.grupos);
    plan.pasos.push({ tipo: 'SUMAR', grupos: queda.grupos, cabezas: queda.cabezas, loteDestinoId: parte.id, potreroId: parte.potreroId });
  }
  for (const paso of plan.pasos) {
    try {
      if (paso.tipo === 'VENTA') {
        const venta = await tipoPorClave(tx, 'VENTA');
        const v = paso.venta;
        await aplicarEntradaSalida(
          tx,
          {
            tipoId: venta.id,
            loteId: lote.id,
            cabezas: paso.cabezas,
            fecha: dia,
            nota: ctx.nota,
            guia: v.guia ?? null,
            precioVentaUsd: v.precioVentaUsd ?? null,
            precioVentaPor: v.precioVentaPor ?? null,
            pesoPromedioKg: v.pesoPromedioKg ?? null,
          },
          usuarioId,
          await extraDe(ctx, registro),
        );
        ctx.pasos.push({ texto: textoMovimiento({ modo: 'SALIDA', cabezas: paso.cabezas, tipo: venta.nombre, guia: v.guia }) });
        continue;
      }
      const base = { loteOrigenId: lote.id, cabezas: paso.cabezas, fecha: dia, nota: ctx.nota };
      if (paso.tipo === 'SUMAR') {
        const p = await aplicar(tx, { ...base, destinoPotreroId: paso.potreroId, modo: 'SUMAR', loteDestinoId: paso.loteDestinoId }, usuarioId, await extraDe(ctx, registro));
        creados.set(paso.grupos, paso.loteDestinoId);
        ctx.pasos.push({ texto: textoDelPlan(p) });
        continue;
      }
      const cuerpo =
        paso.tipo === 'PARTE'
          ? { ...base, destinoPotreroId: paso.potreroId, modo: 'NUEVO', parteFamilia: { categoriaId: paso.categoriaId, sufijo: sufijoDe(plan.bloques.find((b) => b.grupos === paso.grupos)) } }
          : paso.tipo === 'CATEGORIA'
            ? { ...base, destinoPotreroId: lote.potreroId, modo: 'CATEGORIA', categoriaId: paso.categoriaId }
            : { ...base, destinoPotreroId: paso.potreroId, modo: 'ENTERO', categoriaId: paso.categoriaId };
      const p = await aplicar(tx, cuerpo, usuarioId, await extraDe(ctx, registro));
      if (paso.tipo === 'PARTE') creados.set(paso.grupos, p.loteDestino.id);
      ctx.pasos.push({ texto: textoDelPlan(p) });
    } catch (error) {
      if (error instanceof HttpError) error.message = `${mayuscula(paso.grupos.map(nombreGrupo).join(' y '))}: ${error.message}`;
      throw error;
    }
  }

  // Si el lote se sumó entero a otra parte, queda cerrado: sale del proceso.
  if (queda && creados.has(queda.grupos)) {
    const pl = await tx.procesoLote.findUnique({ where: { procesoId_loteId: { procesoId: ctx.proceso.id, loteId: lote.id } } });
    await guardarRol(ctx, lote.id, { rol: pl.rol, mes: pl.mes, destino: pl.destino, hasta: dia }, registro);
  }
  for (const b of plan.bloques) {
    const loteId = creados.get(b.grupos) ?? (b.queda ? lote.id : null);
    const meses = [...new Set(b.grupos.filter((c) => MES.test(c)))];
    const mes = meses.length === 1 && !b.grupos.includes('sin') ? meses[0] : null;
    const n = b.cabezas.toLocaleString('es-UY');
    if (b.clase === 'PRENADAS') await guardarRol(ctx, loteId, { rol: 'PRENADAS', mes }, registro);
    else if (b.clase === 'SIN') await guardarRol(ctx, loteId, { rol: 'VIENTRES' }, registro);
    else if (b.destino === 'INVERNADA') await guardarRol(ctx, loteId, { rol: 'LIBRES', destino: 'INVERNADA', hasta: dia }, registro);
    else if (b.destino === 'SALEN') {
      await guardarRol(ctx, loteId, { rol: 'LIBRES', hasta: dia }, registro);
      ctx.pasos.push({ texto: `${n} vacías: salen del proceso` });
    } else if (b.destino === 'REENTORE') {
      await guardarRol(ctx, loteId, { rol: 'VACIAS', destino: 'REENTORE' }, registro);
      ctx.pasos.push({ texto: `${n} vacías: para volver a servir` });
    } else {
      await guardarRol(ctx, loteId, { rol: 'VACIAS' }, registro);
      if (b.destino === 'DESPUES') ctx.pasos.push({ texto: `${n} vacías: las decidís después` });
    }
  }
  // Si se vendió todo el lote, queda anotado así.
  if (!plan.bloques.length) await guardarRol(ctx, lote.id, { rol: 'VACIAS', destino: 'VENTA', hasta: dia }, registro);
}

// --- Toros (uno por uno, fase 6) ---
//
// Un toro es una cabeza de su lote de toros: entrar a un proceso (o salir)
// mueve esa cabeza al potrero, con el mismo mecanismo que mover. Si en el
// potrero ya hay una parte de la misma familia y categoría, se suma a ella;
// si no, forma una parte nueva (o, si es la última cabeza, va el lote entero).
// Lo que pasó con cada toro queda en los datos del ancla (para anular).

async function parteEnPotrero(tx, lote, potreroId) {
  const raiz = lote.raizId ?? lote.id;
  return tx.lote.findFirst({
    where: { activo: true, potreroId, categoriaId: lote.categoriaId, id: { not: lote.id }, OR: [{ id: raiz }, { raizId: raiz }] },
    orderBy: { id: 'asc' },
  });
}

// Mueve la cabeza de un toro a un potrero. Devuelve el lote donde queda.
async function moverUnToro(ctx, toro, potreroId, registro) {
  const lote = await ctx.tx.lote.findUnique({ where: { id: toro.loteId } });
  if (!lote?.activo) {
    ctx.avisos.push(`El lote del toro ${toro.identificacion} está cerrado: se anota, pero el stock no cambia`);
    return toro.loteId;
  }
  if (lote.potreroId === potreroId) return lote.id;
  const cabezas = (await cabezasDeHoy(ctx.tx, [lote])).get(lote.id) ?? 0;
  if (cabezas < 1) throw badRequest(`El lote ${lote.nombre} del toro ${toro.identificacion} no tiene cabezas`);
  const destino = await parteEnPotrero(ctx.tx, lote, potreroId);
  const base = { loteOrigenId: lote.id, cabezas: 1, destinoPotreroId: potreroId, fecha: ctx.dia, nota: ctx.nota };
  const cuerpo = destino ? { ...base, modo: 'SUMAR', loteDestinoId: destino.id } : cabezas === 1 ? { ...base, modo: 'ENTERO' } : { ...base, modo: 'NUEVO', parteFamilia: {} };
  const p = await aplicar(ctx.tx, cuerpo, ctx.usuarioId, await extraDe(ctx, registro));
  ctx.pasos.push({ texto: `Toro ${toro.identificacion}: ${textoDelPlan(p)}` });
  return p.loteDestino.id;
}

async function potreroDelProceso(ctx, potreroId, toro) {
  if (!potreroId) throw badRequest(`Elegí a qué potrero va el toro ${toro.identificacion}`);
  const p = await ctx.tx.potrero.findUnique({ where: { id: potreroId }, select: { id: true, nombre: true, campoId: true, activo: true } });
  if (!p || p.campoId !== ctx.proceso.campoId) throw badRequest('El potrero de los toros no es de esta estancia');
  return p;
}

// Anota en el ancla lo que pasó con cada toro (se suma a lo que ya tenía).
async function anotarToros(ctx, registro, toros) {
  const actual = await ctx.tx.eventoRegistro.findUnique({ where: { id: registro.id }, select: { datos: true } });
  const datos = { ...(actual.datos ?? {}), toros: [...(actual.datos?.toros ?? []), ...toros] };
  await ctx.tx.eventoRegistro.update({ where: { id: registro.id }, data: { datos } });
  const linea = ctx.lineas.find((l) => l.registroId === registro.id);
  if (linea) linea.datos = datos;
}

// Entran toros al proceso: cada uno, al potrero elegido (o al de las vacas).
async function entrarToros(ctx, lista, registro, potreroDefecto) {
  const { tx, proceso, dia } = ctx;
  const anotados = [];
  for (const t of lista) {
    const toro = await tx.toro.findUnique({
      where: { id: t.toroId },
      include: { asignaciones: { where: { hasta: null }, include: { proceso: { select: { nombre: true } } } } },
    });
    if (!toro || toro.campoId !== proceso.campoId) throw badRequest('Hay un toro que no es de esta estancia');
    if (!toro.activo) throw badRequest(`El toro ${toro.identificacion} está dado de baja`);
    if (toro.asignaciones.length) throw conflict(`El toro ${toro.identificacion} ya está en el proceso "${toro.asignaciones[0].proceso.nombre}"`);
    const potrero = await potreroDelProceso(ctx, t.potreroId ?? potreroDefecto, toro);
    let loteDespues = toro.loteId;
    if (toro.loteId) loteDespues = await moverUnToro(ctx, toro, potrero.id, registro);
    else ctx.avisos.push(`El toro ${toro.identificacion} no está en ningún lote de toros: se anota en el proceso, pero el stock no cambia`);
    await tx.toro.update({ where: { id: toro.id }, data: { loteId: loteDespues } });
    await tx.procesoToro.create({ data: { procesoId: proceso.id, toroId: toro.id, potreroId: potrero.id, desde: aFecha(dia), registroId: registro.id } });
    anotados.push({ toroId: toro.id, identificacion: toro.identificacion, accion: 'ENTRA', potrero: potrero.nombre, loteAntes: toro.loteId, loteDespues });
  }
  if (anotados.length) await anotarToros(ctx, registro, anotados);
}

// Salen toros del proceso: cada uno, al potrero elegido.
async function sacarToros(ctx, lista, registro, potreroDefecto = null) {
  const { tx, proceso, dia } = ctx;
  const anotados = [];
  for (const t of lista) {
    const asig = await tx.procesoToro.findFirst({ where: { procesoId: proceso.id, toroId: t.toroId, hasta: null }, include: { toro: true } });
    if (!asig) throw badRequest('Hay un toro elegido que no está en el proceso');
    if (dia < fechaISO(asig.desde)) throw badRequest(`El toro ${asig.toro.identificacion} entró el ${fechaUY(fechaISO(asig.desde))}: no puede salir antes`);
    const potrero = await potreroDelProceso(ctx, t.potreroId ?? potreroDefecto, asig.toro);
    const loteDespues = asig.toro.loteId ? await moverUnToro(ctx, asig.toro, potrero.id, registro) : null;
    await tx.toro.update({ where: { id: asig.toroId }, data: { loteId: loteDespues } });
    await tx.procesoToro.update({ where: { id: asig.id }, data: { hasta: aFecha(dia), registroSalidaId: registro.id } });
    anotados.push({ toroId: asig.toroId, identificacion: asig.toro.identificacion, accion: 'SALE', potrero: potrero.nombre, loteAntes: asig.toro.loteId, loteDespues });
  }
  if (anotados.length) await anotarToros(ctx, registro, anotados);
}

// Toros que entran o salen en cualquier momento del servicio (después de una
// parte de la ecografía: sacarlos, volver a entorar con el mismo o traer otro).
//   body: { entran?: [{ toroId, potreroId }], salen?: [{ toroId, potreroId }] }
async function cargaToros(ctx, body) {
  const entran = listaToros(body.entran);
  const salen = listaToros(body.salen);
  if (entran.error || salen.error) throw badRequest(entran.error ?? salen.error);
  const total = entran.lista.length + salen.lista.length;
  if (!total) throw badRequest('Elegí los toros que entran o salen');
  const potreroId = entran.lista[0]?.potreroId ?? salen.lista[0]?.potreroId ?? null;
  const tipo = await tipoPorClave(ctx.tx, 'ENTORE');
  const registro = await ctx.tx.eventoRegistro.create({
    data: {
      tipoId: tipo.id,
      fecha: aFecha(ctx.dia),
      campoId: ctx.proceso.campoId,
      potreroId,
      nivel: 'POTRERO',
      cabezas: total,
      datos: {},
      nota: ctx.nota,
      grupoId: ctx.grupoId,
      procesoId: ctx.proceso.id,
      etapa: 'TOROS',
      usuarioId: ctx.usuarioId,
    },
  });
  ctx.primerAncla ??= registro.id;
  ctx.lineas.push({ registroId: registro.id, lote: { id: null, nombre: null }, cabezas: total, datos: {} });
  // Primero salen (así un toro puede salir y otro entrar al mismo potrero).
  await sacarToros(ctx, salen.lista, registro);
  await entrarToros(ctx, entran.lista, registro, null);
}

// Otra tanda de hembras que entra al servicio en otro día (fase 6): lotes
// nuevos (o, en un entore, más cabezas de un lote que ya está servido), con
// el mismo reparto que al empezar y, en un entore, sus toros.
async function cargaTanda(ctx, body) {
  const { tx, proceso } = ctx;
  if (!body.lineas?.length) throw badRequest('Elegí los lotes de la tanda');
  const modalidad = ['IATF', 'IA'].includes(proceso.datos?.modalidad) ? 'IATF' : 'TOROS';
  const ids = body.lineas.map((l) => l.loteId);
  if (new Set(ids).size !== ids.length) throw badRequest('Hay un lote elegido dos veces');
  const propios = new Map((await tx.procesoLote.findMany({ where: { procesoId: proceso.id, loteId: { in: ids }, hasta: null } })).map((pl) => [pl.loteId, pl]));
  for (const pl of propios.values()) {
    const l = await tx.lote.findUnique({ where: { id: pl.loteId }, select: { nombre: true } });
    if (modalidad === 'IATF') throw badRequest(`El lote ${l.nombre} ya está en el proceso: para inseminar más de ese lote, anotá otro día de inseminación`);
    if (pl.rol !== 'VIENTRES') throw badRequest(`El lote ${l.nombre} ya está en el proceso y no está en servicio`);
  }
  const nuevos = ids.filter((id) => !propios.has(id));
  const { anteriores } = nuevos.length ? await lotesParaEmpezar(tx, nuevos, proceso.campoId) : { anteriores: new Map() };
  const filas = await tx.lote.findMany({ where: { id: { in: ids } }, include: { categoria: true } });
  const cabezas = await cabezasDeHoy(tx, filas);
  const lotes = filas.map((l) => ({ ...l, cabezas: cabezas.get(l.id) ?? 0 }));
  for (const l of lotes) if (l.campoId !== proceso.campoId || !l.activo || !l.cabezas) throw badRequest(`El lote ${l.nombre} no tiene animales en esta estancia`);
  const lineas = await lineasDeServicio(tx, body.lineas, lotes, proceso.campoId);
  const toros = listaToros(body.toros);
  if (toros.error) throw badRequest(toros.error);
  if (toros.lista.length && modalidad !== 'TOROS') throw badRequest('Los toros van en un entore');
  const tipo = await tipoPorClave(tx, modalidad === 'TOROS' ? 'ENTORE' : 'INSEMINACION');
  let primero = null;
  for (const linea of lineas) {
    const anterior = anteriores.get(linea.lote.id);
    // Las vacías para volver a servir dejan el proceso de antes.
    if (anterior) await tx.procesoLote.update({ where: { procesoId_loteId: { procesoId: anterior, loteId: linea.lote.id } }, data: { hasta: aFecha(ctx.dia) } });
    const datos = {
      modalidad,
      ...(linea.reparto.length && { reparto: linea.reparto.map((r) => ({ potrero: r.potrero.nombre, cabezas: r.cabezas, ...(r.toros != null && { toros: r.toros }) })) }),
      ...(anterior && { anteriorProcesoId: anterior }),
    };
    const registro = await crearAncla(ctx, tipo, linea.lote, linea.cabezas, datos);
    ctx.lineas.at(-1).registroId = registro.id;
    primero ??= registro;
    if (!propios.has(linea.lote.id)) await guardarRol(ctx, linea.lote.id, { rol: 'VIENTRES' }, registro);
    await acomodarAlEmpezar(ctx, linea, modalidad, registro);
  }
  if (toros.lista.length) await entrarToros(ctx, toros.lista, primero, potreroDeLasVacas(lineas[0]));
}

// El fin del servicio (del entore): se anota por lote y, en la misma carga,
// salen los toros (salenToros: [{ toroId, potreroId }]). Si quedan toros en
// el proceso, avisa.
async function cargaFinServicio(ctx, body) {
  const salen = listaToros(body.salenToros);
  if (salen.error) throw badRequest(salen.error);
  await cargaSimple(ctx, body);
  if (salen.lista.length) {
    const registro = await ctx.tx.eventoRegistro.findUnique({ where: { id: ctx.primerAncla } });
    if (!ctx.lineas.find((l) => l.registroId === registro.id) && ctx.lineas[0]) ctx.lineas[0].registroId = registro.id;
    await sacarToros(ctx, salen.lista, registro);
  }
  const quedan = await ctx.tx.procesoToro.count({ where: { procesoId: ctx.proceso.id, hasta: null } });
  if (quedan) ctx.avisos.push(`Quedan ${plural(quedan, 'toro', 'toros')} en el proceso`);
}

// Una parte del proceso, en el potrero del bloque, de la misma familia y
// categoría y con el estado que va a tener el bloque (preñadas del mismo mes,
// o vacías sin decidir / para volver a servir). null si no hay.
async function parteConElMismoEstado(ctx, lote, bloque) {
  if (bloque.clase === 'SIN') return null;
  const meses = [...new Set(bloque.grupos.filter((c) => MES.test(c)))];
  const mes = meses.length === 1 && !bloque.grupos.includes('sin') ? meses[0] : null;
  const rol = bloque.clase === 'PRENADAS' ? 'PRENADAS' : 'VACIAS';
  if (rol === 'VACIAS' && !['DESPUES', 'REENTORE', null].includes(bloque.destino)) return null;
  const destino = rol === 'VACIAS' && bloque.destino === 'REENTORE' ? 'REENTORE' : null;
  const raiz = lote.raizId ?? lote.id;
  const pls = await ctx.tx.procesoLote.findMany({
    where: {
      procesoId: ctx.proceso.id,
      hasta: null,
      rol,
      mes,
      destino,
      loteId: { not: lote.id },
      lote: { activo: true, potreroId: bloque.potreroId, categoriaId: bloque.categoriaId, OR: [{ id: raiz }, { raizId: raiz }] },
    },
    include: { lote: true },
    orderBy: { id: 'asc' },
  });
  return pls[0]?.lote ?? null;
}

// Las etapas que solo anotan: repaso, fin del servicio y aborto.
async function cargaSimple(ctx, body) {
  const elegidos = await lotesDeLaCarga(ctx.tx, ctx.proceso, ctx.etapaDef, body.lineas);
  const tipo = await tipoPorClave(ctx.tx, ctx.etapaDef.tipos[0]);
  for (const { lote, linea } of elegidos) {
    await exigirLibre(ctx.tx, ctx.proceso.id, ctx.etapa, lote);
    const r = lineaSimple(ctx.etapa, linea, lote);
    if (r.error) throw badRequest(r.error);
    const registro = await crearAncla(ctx, tipo, lote, r.cabezas, ctx.etapa === 'ABORTO' && body.aVacias ? { aVacias: true } : r.datos);
    ctx.lineas.at(-1).registroId = registro.id;
    if (ctx.etapa === 'ABORTO' && body.aVacias) await abortoAVacias(ctx, lote, r.cabezas, registro);
  }
}

// Las preñadas (por mes) y las vacías de un diagnóstico, como grupos.
const gruposDelDiagnostico = (datos) => [
  ...Object.entries(datos.prenadas)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([clave, cabezas]) => ({ clave, cabezas, clase: 'PRENADAS' })),
  ...(datos.vacias ? [{ clave: 'vacias', cabezas: datos.vacias, clase: 'VACIAS' }] : []),
];

// El diagnóstico (ecografía o tacto) con la decisión de cada grupo (diseño §8).
// Lo que no se decide: las preñadas se quedan en su potrero, con la categoría
// sugerida; las vacías, para decidir después.
async function cargaDiagnostico(ctx, body) {
  if (!body.lineas?.length) throw badRequest('Escribí las preñadas y las vacías de cada lote');
  const elegidos = await lotesDeLaCarga(ctx.tx, ctx.proceso, ctx.etapaDef, body.lineas);
  const tipo = await tipoPorClave(ctx.tx, 'ECOGRAFIA');
  const categorias = await ctx.tx.categoria.findMany({ select: { id: true, nombre: true } });
  const decisiones = new Map((body.decision ?? []).map((d) => [d.loteId, d.grupos ?? []]));
  for (const loteId of decisiones.keys()) {
    if (!elegidos.some((e) => e.lote.id === loteId)) throw badRequest('Hay una decisión de un lote que no está en el diagnóstico');
  }
  for (const { lote, linea } of elegidos) {
    await exigirLibre(ctx.tx, ctx.proceso.id, ctx.etapa, lote);
    await exigirDespuesDe(ctx, lote, ['INICIO', 'TANDA', 'REPASO', 'FIN_SERVICIO']);
    const r = lineaDiagnostico(linea, lote, body.metodo);
    if (r.error) throw badRequest(r.error);
    const registro = await crearAncla(ctx, tipo, lote, r.cabezas, r.datos);
    const grupos = gruposDelDiagnostico(r.datos);
    const dec = decisiones.get(lote.id) ?? [];
    for (const g of dec) if (!grupos.some((x) => x.clave === g.clave)) throw badRequest(`El grupo ${nombreGrupo(g.clave)} no está en el diagnóstico del lote ${lote.nombre}`);
    const sugerida = (paso) => sugerirCategoria(paso, lote.categoria, categorias).id;
    const finales = grupos.map((g) => {
      const d = dec.find((x) => x.clave === g.clave);
      const vacia = g.clase === 'VACIAS';
      const destino = d?.destino ?? (vacia ? { despues: true } : { potreroId: lote.potreroId });
      // La categoría de la madre no cambia (docs/PECUARIA.md §9): el estado va en el rol.
      const categoriaId = d?.categoriaId ?? (vacia && destino.invernada ? sugerida('VACIA') : lote.categoriaId);
      return { ...g, destino, categoriaId };
    });
    await ejecutarDecision(ctx, lote, finales, registro);
  }
}

// La revisión del diagnóstico: "de 10 vacías, 2 estaban preñadas". Con
// aLoteId, las que cambian se suman a ese lote del proceso.
async function cargaRevision(ctx, body) {
  const elegidos = await lotesDeLaCarga(ctx.tx, ctx.proceso, ctx.etapaDef, body.lineas);
  const tipo = await tipoPorClave(ctx.tx, 'ECOGRAFIA');
  for (const { lote, linea } of elegidos) {
    await exigirLibre(ctx.tx, ctx.proceso.id, ctx.etapa, lote);
    const r = lineaRevision(linea, lote);
    if (r.error) throw badRequest(r.error);
    const registro = await crearAncla(ctx, tipo, lote, r.cabezas, r.datos);
    if (!r.aLoteId) {
      ctx.avisos.push(`Las que cambian siguen en el lote ${lote.nombre}: separalas con el + si hace falta`);
      continue;
    }
    if (r.datos.aPrenadas && r.datos.aVacias) throw badRequest(`En el lote ${lote.nombre}: para mandarlas a otro lote, que cambien en un solo sentido`);
    const destino = await ctx.tx.procesoLote.findUnique({ where: { procesoId_loteId: { procesoId: ctx.proceso.id, loteId: r.aLoteId } }, include: { lote: true } });
    const rolDestino = r.datos.aPrenadas ? 'PRENADAS' : 'VACIAS';
    if (!destino || destino.rol !== rolDestino || !destino.lote.activo) throw badRequest(`El lote de destino tiene que ser de ${rolDestino === 'PRENADAS' ? 'preñadas' : 'vacías'} del proceso`);
    const p = await aplicar(
      ctx.tx,
      { loteOrigenId: lote.id, cabezas: r.cabezas, destinoPotreroId: destino.lote.potreroId, modo: 'SUMAR', loteDestinoId: destino.loteId, fecha: ctx.dia, nota: ctx.nota },
      ctx.usuarioId,
      await extraDe(ctx, registro),
    );
    ctx.pasos.push({ texto: textoDelPlan(p) });
  }
}

const destinoDecision = (d) => (d?.venta ? 'VENTA' : d?.invernada ? 'INVERNADA' : d?.reentore ? 'REENTORE' : d?.salen ? 'SALEN' : d?.potreroId ? 'MOVER' : null);

// Lo que se decide después con las vacías (diseño §8, "Decidir"): cada lote
// de vacías sin destino, entero, a venta, invernada, reentore u otro potrero.
async function cargaDecision(ctx, body) {
  if (!body.lineas?.length) throw badRequest('Elegí qué hacés con las vacías');
  const tipo = await tipoPorClave(ctx.tx, 'ECOGRAFIA');
  const categorias = await ctx.tx.categoria.findMany({ select: { id: true, nombre: true } });
  for (const linea of body.lineas) {
    const pl = await ctx.tx.procesoLote.findUnique({
      where: { procesoId_loteId: { procesoId: ctx.proceso.id, loteId: linea.loteId } },
      include: { lote: { include: { categoria: true } } },
    });
    const nombre = pl?.lote.nombre ?? (await ctx.tx.lote.findUnique({ where: { id: linea.loteId }, select: { nombre: true } }))?.nombre ?? 'elegido';
    if (!pl || pl.rol !== 'VACIAS' || pl.destino || pl.hasta || !pl.lote.activo) throw badRequest(`El lote ${nombre} no tiene nada para decidir`);
    const destino = destinoDecision(linea.destino);
    if (!destino) throw badRequest(`Elegí qué hacés con las vacías del lote ${nombre}`);
    const lote = { ...pl.lote, cabezas: (await cabezasDeHoy(ctx.tx, [pl.lote])).get(pl.loteId) };
    const registro = await crearAncla(ctx, tipo, lote, lote.cabezas, { destino });
    const categoriaId = linea.categoriaId ?? (destino === 'INVERNADA' ? sugerirCategoria('VACIA', lote.categoria, categorias).id : lote.categoriaId);
    await ejecutarDecision(ctx, lote, [{ clave: 'vacias', cabezas: lote.cabezas, clase: 'VACIAS', destino: linea.destino, categoriaId }], registro);
  }
}

// --- IATF por días (ajustes del 20/11) ---

// Otro día de inseminación: de cada lote "sin inseminar", las inseminadas
// van a "<lote> · IATF dd/mm" (al potrero elegido o en el mismo); si se
// inseminan todas, el lote mismo pasa a servido (y se mueve si se eligió).
async function cargaInseminacion(ctx, body) {
  if (!body.lineas?.length) throw badRequest('Escribí cuántas se inseminaron de cada lote');
  const elegidos = await lotesDeLaCarga(ctx.tx, ctx.proceso, ctx.etapaDef, body.lineas);
  const tipo = await tipoPorClave(ctx.tx, 'INSEMINACION');
  for (const { lote, linea } of elegidos) {
    const n = aNumero(linea.cabezas);
    if (!Number.isInteger(n) || n < 1) throw badRequest(`Escribí cuántas se inseminaron del lote ${lote.nombre}`);
    if (n > lote.cabezas) throw badRequest(`El lote ${lote.nombre} tiene ${lote.cabezas} sin inseminar`);
    const potreroId = linea.potreroId ? Number(linea.potreroId) : lote.potreroId;
    const registro = await crearAncla(ctx, tipo, lote, n, {});
    const base = { loteOrigenId: lote.id, cabezas: n, destinoPotreroId: potreroId, fecha: ctx.dia, nota: ctx.nota };
    if (n < lote.cabezas) {
      const p = await aplicar(ctx.tx, { ...base, modo: 'NUEVO', parteFamilia: { sufijo: `IATF ${ddmm(ctx.dia)}` } }, ctx.usuarioId, await extraDe(ctx, registro));
      ctx.pasos.push({ texto: textoDelPlan(p) });
      await guardarRol(ctx, p.loteDestino.id, { rol: 'VIENTRES' }, registro);
    } else {
      if (potreroId !== lote.potreroId) {
        const p = await aplicar(ctx.tx, { ...base, modo: 'ENTERO' }, ctx.usuarioId, await extraDe(ctx, registro));
        ctx.pasos.push({ texto: textoDelPlan(p) });
      }
      await guardarRol(ctx, lote.id, { rol: 'VIENTRES' }, registro);
    }
  }
}

// Terminar la inseminación: las que quedaron sin inseminar van al repaso con
// toro (siguen en el proceso y cuentan como servidas) o salen del proceso.
// En los dos casos se pueden mover enteras a otro potrero.
async function cargaFinInseminacion(ctx, body) {
  const elegidos = await lotesDeLaCarga(ctx.tx, ctx.proceso, ctx.etapaDef, body.lineas);
  const tipo = await tipoPorClave(ctx.tx, 'INSEMINACION');
  for (const { lote, linea } of elegidos) {
    const destino = linea.destino;
    if (destino !== 'REPASO' && destino !== 'SALEN') throw badRequest(`Elegí qué pasa con las sin inseminar de ${lote.nombre}: al repaso con toro o salen del proceso`);
    const registro = await crearAncla(ctx, tipo, lote, lote.cabezas, { destino });
    const potreroId = linea.potreroId ? Number(linea.potreroId) : null;
    if (potreroId && potreroId !== lote.potreroId) {
      const p = await aplicar(ctx.tx, { loteOrigenId: lote.id, cabezas: lote.cabezas, destinoPotreroId: potreroId, modo: 'ENTERO', fecha: ctx.dia, nota: ctx.nota }, ctx.usuarioId, await extraDe(ctx, registro));
      ctx.pasos.push({ texto: textoDelPlan(p) });
    }
    await guardarRol(ctx, lote.id, destino === 'REPASO' ? { rol: 'VIENTRES' } : { rol: 'LIBRES', hasta: ctx.dia }, registro);
  }
}

// --- Parición (diseño §9) ---

// Un lote del proceso con ese rol y mes, en el mismo potrero y de la misma
// familia (o, para las crías, con el nombre de la familia y del sexo).
async function loteDelMes(ctx, { rol, mes, potreroId, raizId, raizNombre, sexo = null }) {
  const pls = await ctx.tx.procesoLote.findMany({
    where: { procesoId: ctx.proceso.id, rol, mes, hasta: null, lote: { activo: true, potreroId } },
    include: { lote: { include: { categoria: { select: { sexo: true } } } } },
    orderBy: { id: 'asc' },
  });
  return (
    pls.find((pl) =>
      sexo ? pl.lote.categoria.sexo === sexo && pl.lote.nombre.startsWith(`${raizNombre} · `) : pl.lote.id === raizId || pl.lote.raizId === raizId,
    ) ?? null
  );
}

// Avisa si la parición es antes de inicio + 260 días.
async function avisoTemprano(ctx) {
  const anclas = (await ctx.tx.eventoRegistro.findMany({ where: { procesoId: ctx.proceso.id, anulado: false }, select: anclaSelect })).map(aAncla);
  const { inicio } = fechasServicio(anclas);
  if (!inicio || ctx.dia >= sumarDias(inicio, 260)) return;
  const { gestacionDias } = await parametrosProceso(ctx.tx);
  const probable = sumarDias(inicio, gestacionDias);
  const faltan = Math.round((new Date(`${probable}T12:00:00Z`) - new Date(`${ctx.dia}T12:00:00Z`)) / 86_400_000);
  ctx.avisos.push(`La parición del ${fechaUY(ctx.dia)} es temprana: faltan ${faltan} días para la fecha probable (${fechaUY(probable)}). ¿Está bien la fecha?`);
}

// La parición de cada lote de preñadas (una carga; puede haber muchas, una
// por recorrida). Por cada lote:
//   1. las madres muertas al parto salen como muerte (causa Parto);
//   2. las que parieron se suman a "<raíz> · paridas <mes>" (en el mismo
//      potrero, de la familia), que se crea si no existe; si parieron todas y
//      no hay paridas de ese mes, el lote mismo cambia de categoría;
//   3. los terneros y terneras entran con Nacimiento a "<raíz> · terneros <mes>"
//      y "· terneras <mes>", con el lote de las madres anotado.
// Los nacidos muertos solo quedan en el ancla: nunca entraron al stock.
async function cargaParicion(ctx, body) {
  if (!body.lineas?.length) throw badRequest('Escribí la parición de cada lote');
  const elegidos = await lotesDeLaCarga(ctx.tx, ctx.proceso, ctx.etapaDef, body.lineas);
  const { tx } = ctx;
  const categorias = await tx.categoria.findMany({ where: { activo: true }, select: { id: true, nombre: true } });
  const tipos = { PARICION: await tipoPorClave(tx, 'PARICION'), NACIMIENTO: await tipoPorClave(tx, 'NACIMIENTO'), MUERTE: await tipoPorClave(tx, 'MUERTE') };
  const causa = await tx.causaMovimiento.findUnique({ where: { codigo: 'PA-001' } });
  const mes = ctx.dia.slice(0, 7);
  const sufMes = nombreMes(mes);
  await avisoTemprano(ctx);

  for (const { lote, linea } of elegidos) {
    const r = lineaParicion(linea, lote);
    if (r.error) throw badRequest(r.error);
    ctx.avisos.push(...r.avisos);
    const { madres, machos, hembras, madresMuertas } = r.datos;
    const registro = await crearAncla(ctx, tipos.PARICION, lote, madres + madresMuertas, { ...r.datos, mes });
    const extra = await extraDe(ctx, registro);
    const raizId = lote.raizId ?? lote.id;
    const raizNombre = lote.raizId ? (await tx.lote.findUnique({ where: { id: raizId }, select: { nombre: true } })).nombre : lote.nombre;
    const sugerida = (paso) => sugerirCategoria(paso, lote.categoria, categorias);

    if (madresMuertas) {
      if (!causa) throw badRequest('Falta la causa "Parto" (PA-001) en Configuración → Causas');
      await aplicarEntradaSalida(tx, { tipoId: tipos.MUERTE.id, loteId: lote.id, cabezas: madresMuertas, fecha: ctx.dia, causaId: causa.id, nota: ctx.nota }, ctx.usuarioId, extra);
      ctx.pasos.push({ texto: `${madresMuertas.toLocaleString('es-UY')} madres muertas al parto` });
    }

    let madresId = null;
    if (madres) {
      const restantes = lote.cabezas - madresMuertas;
      const categoriaId = linea.categoriaMadresId ?? sugerida('PARIDA').id;
      const paridas = await loteDelMes(ctx, { rol: 'PARIDAS', mes, potreroId: lote.potreroId, raizId });
      const base = { loteOrigenId: lote.id, cabezas: madres, destinoPotreroId: lote.potreroId, fecha: ctx.dia, nota: ctx.nota };
      if (paridas) {
        const p = await aplicar(tx, { ...base, modo: 'SUMAR', loteDestinoId: paridas.loteId }, ctx.usuarioId, extra);
        ctx.pasos.push({ texto: textoDelPlan(p) });
        madresId = paridas.loteId;
      } else if (madres === restantes) {
        if (categoriaId !== lote.categoriaId) {
          const p = await aplicar(tx, { ...base, modo: 'CATEGORIA', categoriaId }, ctx.usuarioId, extra);
          ctx.pasos.push({ texto: textoDelPlan(p) });
        }
        madresId = lote.id;
        await guardarRol(ctx, lote.id, { rol: 'PARIDAS', mes }, registro);
      } else {
        const p = await aplicar(tx, { ...base, modo: 'NUEVO', parteFamilia: { categoriaId, sufijo: `paridas ${sufMes}` } }, ctx.usuarioId, extra);
        ctx.pasos.push({ texto: textoDelPlan(p) });
        madresId = p.loteDestino.id;
        await guardarRol(ctx, madresId, { rol: 'PARIDAS', mes }, registro);
      }
    }

    const crias = [];
    for (const [sexo, n, paso, palabra] of [
      ['MACHO', machos, 'CRIA_MACHO', 'terneros'],
      ['HEMBRA', hembras, 'CRIA_HEMBRA', 'terneras'],
    ]) {
      if (!n) continue;
      const ya = await loteDelMes(ctx, { rol: 'CRIAS', mes, potreroId: lote.potreroId, raizNombre, sexo });
      if (ya) crias.push({ cabezas: n, loteId: ya.loteId });
      else crias.push({ cabezas: n, nuevoLote: { nombre: await nombreLibre(tx, lote.campoId, `${raizNombre} · ${palabra} ${sufMes}`), categoriaId: sugerida(paso).id } });
    }
    if (crias.length) {
      const { plan } = await aplicarEntradaSalida(
        tx,
        { tipoId: tipos.NACIMIENTO.id, potreroId: lote.potreroId, fecha: ctx.dia, nota: ctx.nota, ...(madresId && { loteMadresId: madresId }), lineas: crias },
        ctx.usuarioId,
        extra,
      );
      for (const [i, paso] of plan.pasos.entries()) {
        ctx.pasos.push({ texto: textoMovimiento({ modo: 'ENTRADA', cabezas: paso.cabezas, lote: paso.lote.nombre, categoria: paso.categoria.nombre }) });
        if (crias[i].nuevoLote) await guardarRol(ctx, paso.lote.id, { rol: 'CRIAS', mes }, registro);
      }
    }
  }
}

// El fin de la parición de un lote: las que quedaron sin parir pasan a
// vacías ("falladas"), con la misma decisión que en el diagnóstico (por
// defecto, para decidir después).
async function cargaFinParicion(ctx, body) {
  const elegidos = await lotesDeLaCarga(ctx.tx, ctx.proceso, ctx.etapaDef, body.lineas);
  const tipo = await tipoPorClave(ctx.tx, 'PARICION');
  const categorias = await ctx.tx.categoria.findMany({ where: { activo: true }, select: { id: true, nombre: true } });
  for (const { lote, linea } of elegidos) {
    await exigirLibre(ctx.tx, ctx.proceso.id, ctx.etapa, lote);
    const registro = await crearAncla(ctx, tipo, lote, lote.cabezas, { falladas: lote.cabezas });
    const destino = linea.destino ?? { despues: true };
    const categoriaId = linea.categoriaId ?? (destino.invernada ? sugerirCategoria('VACIA', lote.categoria, categorias).id : lote.categoriaId);
    await ejecutarDecision(ctx, lote, [{ clave: 'vacias', cabezas: lote.cabezas, clase: 'VACIAS', destino, categoriaId }], registro);
  }
}

// Un aborto con "pasarlas a vacías": las que abortaron se van a un lote de
// vacías del proceso (en el mismo potrero, de la familia), para decidir después.
async function abortoAVacias(ctx, lote, cabezas, registro) {
  const raizId = lote.raizId ?? lote.id;
  const vacias = await ctx.tx.procesoLote.findFirst({
    where: { procesoId: ctx.proceso.id, rol: 'VACIAS', destino: null, hasta: null, lote: { activo: true, potreroId: lote.potreroId, OR: [{ id: raizId }, { raizId }] } },
  });
  const extra = await extraDe(ctx, registro);
  const base = { loteOrigenId: lote.id, cabezas, destinoPotreroId: lote.potreroId, fecha: ctx.dia, nota: ctx.nota };
  if (vacias && vacias.loteId !== lote.id) {
    const p = await aplicar(ctx.tx, { ...base, modo: 'SUMAR', loteDestinoId: vacias.loteId }, ctx.usuarioId, extra);
    ctx.pasos.push({ texto: textoDelPlan(p) });
  } else if (cabezas === lote.cabezas) {
    await guardarRol(ctx, lote.id, { rol: 'VACIAS' }, registro);
  } else {
    const p = await aplicar(ctx.tx, { ...base, modo: 'NUEVO', parteFamilia: { sufijo: 'vacías' } }, ctx.usuarioId, extra);
    ctx.pasos.push({ texto: textoDelPlan(p) });
    await guardarRol(ctx, p.loteDestino.id, { rol: 'VACIAS' }, registro);
  }
}

// --- Destete (diseño §10) ---

const aNumero = (v) => (v == null || v === '' ? null : Number(String(v).trim().replace(',', '.')));

// El lote de las madres de unas crías: el del nacimiento (si sigue activo y
// en el mismo potrero); si no, el de paridas del mismo mes en ese potrero.
async function madresDe(ctx, crias, pl) {
  const nacimiento = await ctx.tx.movimiento.findFirst({
    where: { loteDestinoId: crias.id, modo: 'ENTRADA', loteMadresId: { not: null } },
    orderBy: { id: 'desc' },
    include: { loteMadres: { include: { categoria: true } } },
  });
  const m = nacimiento?.loteMadres;
  if (m?.activo && m.potreroId === crias.potreroId) return m;
  const paridas = await ctx.tx.procesoLote.findFirst({
    where: { procesoId: ctx.proceso.id, rol: 'PARIDAS', mes: pl.mes, hasta: null, lote: { activo: true, potreroId: crias.potreroId } },
    include: { lote: { include: { categoria: true } } },
  });
  return paridas?.lote ?? null;
}

// El destete de cada lote de crías (entero): se va a otro potrero, con el
// lote de las madres anotado, y puede cambiar de categoría al llegar. Cuando
// a las madres ya no les quedan crías al pie, vuelven a ser de cría
// (categoría sugerida) y dejan el proceso.
async function cargaDestete(ctx, body) {
  if (!body.lineas?.length) throw badRequest('Elegí los terneros que se destetan');
  const elegidos = await lotesDeLaCarga(ctx.tx, ctx.proceso, ctx.etapaDef, body.lineas);
  const tipo = await tipoPorClave(ctx.tx, 'DESTETE');
  const categorias = await ctx.tx.categoria.findMany({ where: { activo: true }, select: { id: true, nombre: true } });
  for (const { lote, linea, pl } of elegidos) {
    await exigirLibre(ctx.tx, ctx.proceso.id, ctx.etapa, lote);
    if (!linea.destinoPotreroId) throw badRequest(`Elegí a qué potrero se van los terneros del lote ${lote.nombre}`);
    if (linea.cabezas != null && linea.cabezas !== '' && Number(linea.cabezas) !== lote.cabezas) {
      throw badRequest(`El lote ${lote.nombre} se desteta entero (${lote.cabezas} cabezas)`);
    }
    const madres = await madresDe(ctx, lote, pl);
    if (!madres) throw badRequest(`Las madres de ${lote.nombre} no están en su potrero: no se puede destetar desde acá`);
    const peso = aNumero(linea.pesoPromedioKg);
    const registro = await crearAncla(ctx, tipo, lote, lote.cabezas, { destetados: lote.cabezas, ...(peso != null && { pesoPromedioKg: peso }) });
    const extra = await extraDe(ctx, registro);
    const p = await aplicar(
      ctx.tx,
      {
        loteOrigenId: lote.id,
        cabezas: lote.cabezas,
        destinoPotreroId: linea.destinoPotreroId,
        modo: 'ENTERO',
        ...(linea.categoriaId && { categoriaId: linea.categoriaId }),
        ...(peso != null && { pesoPromedioKg: peso }),
        destete: true,
        loteMadresId: madres.id,
        fecha: ctx.dia,
        nota: ctx.nota,
      },
      ctx.usuarioId,
      extra,
    );
    ctx.pasos.push({ texto: textoDelPlan(p) });
    await guardarRol(ctx, lote.id, { rol: 'CRIAS', mes: pl.mes, hasta: ctx.dia }, registro);

    // ¿Les quedan crías al pie a las madres?
    const quedan = await ctx.tx.procesoLote.count({
      where: { procesoId: ctx.proceso.id, rol: 'CRIAS', mes: pl.mes, hasta: null, lote: { activo: true, potreroId: madres.potreroId } },
    });
    if (!quedan) {
      const plMadres = await ctx.tx.procesoLote.findUnique({ where: { procesoId_loteId: { procesoId: ctx.proceso.id, loteId: madres.id } } });
      const categoriaId = linea.categoriaMadresId ?? sugerirCategoria('DESTETE_MADRE', madres.categoria, categorias).id;
      if (categoriaId !== madres.categoriaId) {
        const n = (await cabezasDeHoy(ctx.tx, [madres])).get(madres.id);
        const q = await aplicar(ctx.tx, { loteOrigenId: madres.id, cabezas: n, destinoPotreroId: madres.potreroId, modo: 'CATEGORIA', categoriaId, fecha: ctx.dia, nota: ctx.nota }, ctx.usuarioId, extra);
        ctx.pasos.push({ texto: textoDelPlan(q) });
      }
      if (plMadres) await guardarRol(ctx, madres.id, { rol: 'LIBRES', mes: plMadres.mes, hasta: ctx.dia }, registro);
    }
  }
}

// --- Cierre y anular ---

// Se cierra solo cuando terminó (todas las crías destetadas, nada sin parir)
// y no queda nada por decidir; se vuelve a abrir si deja de estar terminado
// (por ejemplo, al anular el último destete).
async function revisarCierre(tx, procesoId) {
  const p = await tx.proceso.findUnique({ where: { id: procesoId }, include: { registros: { select: anclaSelect }, lotes: { include: { lote: { select: { activo: true } } } } } });
  const etapa = etapaActual(p.registros.map(aAncla), p.lotes.map(aLoteRol));
  const pendientes = p.lotes.some((pl) => pl.rol === 'VACIAS' && !pl.destino && pl.hasta == null && pl.lote.activo);
  if (p.estado === 'ABIERTO' && etapa === 'TERMINADO' && !pendientes) {
    await tx.proceso.update({ where: { id: p.id }, data: { estado: 'CERRADO', cerradoEn: new Date() } });
  } else if (p.estado === 'CERRADO' && etapa !== 'TERMINADO') {
    await tx.proceso.update({ where: { id: p.id }, data: { estado: 'ABIERTO', cerradoEn: null } });
  }
}

// Anula una carga: revierte sus movimientos (del último al primero; solo si
// después no hubo otros cambios en esos potreros), anula sus anclas y deja los
// lotes del proceso como estaban antes. Todo junto o nada.
export async function anularCarga(id, grupoId, usuarioId) {
  const procesoId = parseId(id);
  const r = await prisma.$transaction(async (tx) => {
    const proceso = procesoId && (await tx.proceso.findUnique({ where: { id: procesoId } }));
    if (!proceso) throw notFound('Proceso no encontrado');
    await bloquear(tx, proceso.id);
    if (proceso.estado === 'ANULADO') throw conflict('El proceso está anulado');
    const anclas = await tx.eventoRegistro.findMany({ where: { procesoId: proceso.id, grupoId: String(grupoId).slice(0, 36) }, orderBy: { id: 'asc' }, include: { lote: { select: { nombre: true } } } });
    if (!anclas.length) throw notFound('Carga no encontrada');
    if (anclas.every((a) => a.anulado)) throw conflict('Esta carga ya está anulada');
    const ev = await tx.eventoMovimiento.findFirst({ where: { procesoId: proceso.id, grupoId: anclas[0].grupoId, tipo: 'PROCESO' }, include: { revertidoPor: { select: { id: true } } } });
    let movimientos = 0;
    if (ev && !ev.revertidoPor) movimientos = (await revertirEventoEn(tx, ev.id, usuarioId, { desdeProceso: true })).pasos.length;
    // Los toros vuelven a como estaban (su lote ya recuperó la cabeza al revertir).
    for (const a of anclas) {
      for (const t of a.datos?.toros ?? []) {
        if (t.accion === 'ENTRA') await tx.procesoToro.deleteMany({ where: { registroId: a.id, toroId: t.toroId } });
        else await tx.procesoToro.updateMany({ where: { registroSalidaId: a.id, toroId: t.toroId }, data: { hasta: null, registroSalidaId: null } });
        await tx.toro.update({ where: { id: t.toroId }, data: { loteId: t.loteAntes ?? null } });
      }
      // Una tanda con vacías de otro proceso: vuelven a él.
      if (a.datos?.anteriorProcesoId && a.loteId) {
        await tx.procesoLote.updateMany({ where: { procesoId: a.datos.anteriorProcesoId, loteId: a.loteId }, data: { hasta: null } });
      }
    }
    for (const a of anclas) {
      for (const { loteId, antes } of a.rolesAntes ?? []) {
        if (!antes) await tx.procesoLote.deleteMany({ where: { procesoId: proceso.id, loteId } });
        else {
          await tx.procesoLote.update({
            where: { procesoId_loteId: { procesoId: proceso.id, loteId } },
            data: { rol: antes.rol, mes: antes.mes, destino: antes.destino, hasta: antes.hasta ? aFecha(antes.hasta) : null },
          });
        }
      }
    }
    await tx.eventoRegistro.updateMany({ where: { id: { in: anclas.map((a) => a.id) }, anulado: false }, data: { anulado: true, anuladoEn: new Date(), anuladoPorId: usuarioId } });
    await revisarCierre(tx, proceso.id);
    return { proceso, anclas, movimientos };
  }, TX);
  return {
    ficha: await ficha(r.proceso.id),
    auditoria: {
      proceso: r.proceso.nombre,
      etapa: r.anclas[0].etapa,
      fecha: fechaISO(r.anclas[0].fecha),
      grupoId: r.anclas[0].grupoId,
      registros: r.anclas.map((a) => a.id),
      lotes: r.anclas.map((a) => ({ lote: a.lote?.nombre ?? null, cabezas: a.cabezas })),
      movimientosRevertidos: r.movimientos,
    },
  };
}

// Cerrar a mano (por ejemplo, si se vendió todo), con una nota opcional.
export async function cerrar(id, { nota } = {}) {
  const procesoId = parseId(id);
  const p = procesoId && (await prisma.proceso.findUnique({ where: { id: procesoId } }));
  if (!p) throw notFound('Proceso no encontrado');
  if (p.estado !== 'ABIERTO') throw conflict(`El proceso ya está ${p.estado === 'CERRADO' ? 'cerrado' : 'anulado'}`);
  const despues = await prisma.proceso.update({ where: { id: p.id }, data: { estado: 'CERRADO', cerradoEn: new Date(), ...(nota && { nota }) } });
  return { proceso: toProceso(despues), auditoria: { nombre: p.nombre, ...(nota && { nota }) } };
}

// Anular el proceso entero: solo si ninguna carga vigente movió animales
// (esas se anulan primero, de la última a la primera).
export async function anularProceso(id, usuarioId) {
  const procesoId = parseId(id);
  const r = await prisma.$transaction(async (tx) => {
    const p = procesoId && (await tx.proceso.findUnique({ where: { id: procesoId } }));
    if (!p) throw notFound('Proceso no encontrado');
    await bloquear(tx, p.id);
    if (p.estado === 'ANULADO') throw conflict('El proceso ya está anulado');
    const conMovimientos = await tx.eventoMovimiento.count({ where: { procesoId: p.id, tipo: 'PROCESO', revertidoPor: null, movimientos: { some: {} } } });
    if (conMovimientos) throw conflict('Este proceso tiene cargas que movieron animales: anulalas primero, de la última a la primera');
    const anuladas = await tx.eventoRegistro.updateMany({ where: { procesoId: p.id, anulado: false }, data: { anulado: true, anuladoEn: new Date(), anuladoPorId: usuarioId } });
    const despues = await tx.proceso.update({ where: { id: p.id }, data: { estado: 'ANULADO' } });
    return { p, despues, anclas: anuladas.count };
  }, TX);
  return { proceso: toProceso(r.despues), auditoria: { nombre: r.p.nombre, anclasAnuladas: r.anclas } };
}

const CARGAS = {
  INSEMINACION: cargaInseminacion,
  FIN_INSEMINACION: cargaFinInseminacion,
  REPASO: cargaSimple,
  FIN_SERVICIO: cargaFinServicio,
  TANDA: cargaTanda,
  TOROS: cargaToros,
  ABORTO: cargaSimple,
  DIAGNOSTICO: cargaDiagnostico,
  REVISION: cargaRevision,
  DECISION: cargaDecision,
  PARICION: cargaParicion,
  FIN_PARICION: cargaFinParicion,
  DESTETE: cargaDestete,
};

// Hace la carga de una etapa en la transacción. Devuelve el contexto: los
// anclas (lineas), los pasos (textos de los movimientos) y los avisos.
async function cargar(tx, proceso, etapa, body, usuarioId) {
  const etapaDef = etapaDePlantilla(etapa, proceso.tipo);
  if (!etapaDef) throw notFound('Etapa no encontrada');
  if (etapa === 'INICIO') throw badRequest('El inicio del servicio se carga al empezar el proceso');
  const carga = CARGAS[etapa];
  if (!carga) throw badRequest(`La etapa ${nombreEtapa(etapa)} todavía no se puede cargar`);
  const ctx = {
    tx,
    proceso,
    etapa,
    etapaDef,
    dia: fechaDeCarga(proceso, body),
    usuarioId,
    grupoId: randomUUID(),
    nota: body.nota ?? null,
    evento: null,
    lineas: [],
    pasos: [],
    avisos: [],
    rolesAntes: new Map(),
    primerAncla: null,
  };
  await carga(ctx, body);
  // Cómo estaban los lotes del proceso (para anular la carga), en el primer ancla.
  if (ctx.primerAncla && ctx.rolesAntes.size) {
    await tx.eventoRegistro.update({ where: { id: ctx.primerAncla }, data: { rolesAntes: [...ctx.rolesAntes].map(([loteId, antes]) => ({ loteId, antes })) } });
  }
  await revisarCierre(tx, proceso.id);
  return ctx;
}

function oracionEtapa(ctx) {
  const cabezas = ctx.lineas.reduce((s, l) => s + l.cabezas, 0);
  if (ctx.etapa === 'DIAGNOSTICO') {
    const prenadas = ctx.lineas.reduce((s, l) => s + Object.values(l.datos.prenadas).reduce((a, b) => a + b, 0), 0);
    return `Vas a anotar el diagnóstico de ${plural(cabezas, 'cabeza', 'cabezas')} (${plural(prenadas, 'preñada', 'preñadas')}, ${plural(cabezas - prenadas, 'vacía', 'vacías')}) el ${fechaUY(ctx.dia)}`;
  }
  if (ctx.etapa === 'PARICION') {
    const madres = ctx.lineas.reduce((s, l) => s + l.datos.madres, 0);
    const vivos = ctx.lineas.reduce((s, l) => s + l.datos.machos + l.datos.hembras, 0);
    return `Vas a anotar la parición de ${plural(madres, 'madre', 'madres')} (${plural(vivos, 'ternero vivo', 'terneros vivos')}) el ${fechaUY(ctx.dia)}`;
  }
  if (ctx.etapa === 'FIN_PARICION') return `Vas a anotar el fin de la parición: ${plural(cabezas, 'no parió', 'no parieron')} (pasan a vacías) el ${fechaUY(ctx.dia)}`;
  if (ctx.etapa === 'DESTETE') return `Vas a anotar el destete de ${plural(cabezas, 'ternero', 'terneros')} el ${fechaUY(ctx.dia)}`;
  if (ctx.etapa === 'DECISION') return `Vas a decidir qué se hace con ${plural(cabezas, 'vacía', 'vacías')} el ${fechaUY(ctx.dia)}`;
  if (ctx.etapa === 'TANDA') return `Vas a anotar otra tanda: ${plural(ctx.lineas.length, 'lote', 'lotes')} (${plural(cabezas, 'cabeza', 'cabezas')}) entran al servicio el ${fechaUY(ctx.dia)}`;
  if (ctx.etapa === 'TOROS') return `Vas a anotar los toros${textoToros(ctx.lineas[0]?.datos)} el ${fechaUY(ctx.dia)}`;
  return `Vas a anotar ${ctx.etapaDef.nombre.toLowerCase()} en ${plural(ctx.lineas.length, 'lote', 'lotes')} (${plural(cabezas, 'cabeza', 'cabezas')}) el ${fechaUY(ctx.dia)}`;
}

const resumenCarga = (ctx) => ({
  etapa: ctx.etapa,
  grupoId: ctx.grupoId,
  dia: ctx.dia,
  oracion: oracionEtapa(ctx),
  lineas: ctx.lineas.map((l) => ({ loteId: l.lote.id, lote: l.lote.nombre, cabezas: l.cabezas, texto: textoAncla(ctx.etapa, l.datos, l.cabezas) })),
  pasos: ctx.pasos,
  avisos: ctx.avisos,
});

export async function vistaPreviaEtapa(id, etapa, body) {
  try {
    await prisma.$transaction(async (tx) => {
      const proceso = await procesoParaCargar(tx, id);
      const { grupoId, dia, ...resumen } = resumenCarga(await cargar(tx, proceso, etapa, body, null));
      throw new Simulacion(resumen);
    }, TX);
  } catch (error) {
    if (error instanceof Simulacion) return error.resultado;
    if (esP2002(error)) throw conflict('Esa etapa ya está cargada para ese lote (la acaban de cargar). Actualizá la ficha.');
    throw error;
  }
  throw new Error('La simulación no devolvió nada');
}

export async function registrarEtapa(id, etapa, body, usuarioId) {
  const { proceso, resumen } = await enTransaccion(async (tx) => {
    const proceso = await procesoParaCargar(tx, id);
    return { proceso, resumen: resumenCarga(await cargar(tx, proceso, etapa, body, usuarioId)) };
  });
  return {
    grupoId: resumen.grupoId,
    oracion: resumen.oracion.replace(/^Vas a anotar/, 'Anotaste').replace(/^Vas a decidir/, 'Decidiste'),
    pasos: resumen.pasos,
    ficha: await ficha(proceso.id),
    auditoria: {
      proceso: proceso.nombre,
      etapa,
      fecha: resumen.dia,
      grupoId: resumen.grupoId,
      lineas: resumen.lineas.map((l) => ({ lote: l.lote, cabezas: l.cabezas, texto: l.texto })),
      pasos: resumen.pasos.map((p) => p.texto),
    },
  };
}

// --- Los eventos sueltos de reproducción ---

// Para cada registro de una carga de Eventos ({ lote: { id, nombre } }): el
// proceso abierto de su lote y la etapa que le toca, o null. Un evento de
// reproducción de un lote en proceso se cuelga solo; una segunda ecografía,
// o una etapa que ya tiene, da error (se hace desde el proceso).
export async function colgarDeProceso(db, tipo, registros) {
  if (!TIPOS_REPRODUCCION.has(tipo.clave)) return registros.map(() => null);
  const resultado = [];
  for (const r of registros) {
    const proceso = await procesoAbiertoDe(db, r.lote.id);
    if (!proceso) {
      resultado.push(null);
      continue;
    }
    const hechas = (await db.eventoRegistro.findMany({ where: { procesoId: proceso.id, loteId: r.lote.id, anulado: false }, select: { etapa: true } })).map((h) => h.etapa);
    // Una ecografía suelta no separa preñadas y vacías: otra parte (o una
    // revisión) se carga desde el proceso.
    if (tipo.clave === 'ECOGRAFIA' && hechas.includes('DIAGNOSTICO')) {
      throw conflict(`El lote ${r.lote.nombre} ya tiene su diagnóstico en el proceso "${proceso.nombre}": otra parte de la ecografía, o una revisión, se carga desde el proceso`);
    }
    const etapa = etapaDe(tipo.clave, hechas, proceso.rol);
    if (ETAPAS_UNICAS.has(etapa) && hechas.includes(etapa)) {
      throw conflict(`El lote ${r.lote.nombre} ya tiene su ${nombreEtapa(etapa)} en el proceso "${proceso.nombre}"`);
    }
    resultado.push({ procesoId: proceso.id, nombre: proceso.nombre, etapa });
  }
  return resultado;
}

// --- Ficha ---

const incluirFicha = {
  campo: { select: { id: true, sigla: true, nombre: true } },
  lotes: {
    include: { lote: { include: { potrero: { select: { id: true, nombre: true } }, categoria: { select: { nombre: true } } } } },
    orderBy: { id: 'asc' },
  },
  registros: { include: { lote: { select: { id: true, nombre: true } } }, orderBy: [{ fecha: 'asc' }, { id: 'asc' }] },
  toros: {
    include: { toro: { select: { id: true, identificacion: true, raza: true, genetica: true } }, potrero: { select: { id: true, nombre: true } } },
    orderBy: [{ desde: 'asc' }, { id: 'asc' }],
  },
  ...incluirSiguientes,
};

// Las muertes (con el "+" o desde el proceso) de los lotes de crías.
async function movimientosEmbudo(db, lotes) {
  const crias = lotes.filter((pl) => pl.rol === 'CRIAS').map((pl) => pl.loteId);
  if (!crias.length) return [];
  const filas = await db.movimiento.findMany({
    where: { loteOrigenId: { in: crias }, modo: 'SALIDA', tipo: { clave: 'MUERTE' } },
    select: { cabezas: true, revertidoPor: { select: { id: true } } },
  });
  return filas.map((m) => ({ tipo: 'MUERTE', cabezas: m.cabezas, rol: 'CRIAS', revertido: Boolean(m.revertidoPor) }));
}

export async function ficha(id) {
  const procesoId = parseId(id);
  const p = procesoId && (await prisma.proceso.findUnique({ where: { id: procesoId }, include: incluirFicha }));
  if (!p) throw notFound('Proceso no encontrado');
  const parametros = await parametrosProceso();
  const anclas = p.registros.map(aAncla);
  const roles = p.lotes.map(aLoteRol);
  const etapa = etapaActual(anclas, roles);
  const { items: cronograma, proxima } = cronogramaDe(p, anclas, roles, parametros, hoyISO());
  const cabezas = await cabezasDeHoy(
    prisma,
    p.lotes.map((pl) => pl.lote),
  );

  // Los movimientos de cada carga (por el grupo del evento PROCESO).
  const movs = await prisma.movimiento.findMany({
    where: { procesoId: p.id },
    include: {
      evento: { select: { grupoId: true, revertidoPor: { select: { id: true } } } },
      loteOrigen: { select: { nombre: true } },
      loteDestino: { select: { nombre: true } },
      potreroDestino: { select: { nombre: true } },
      tipo: { select: { nombre: true } },
    },
    orderBy: { id: 'asc' },
  });
  const nombresCategoria = new Map(
    (await prisma.categoria.findMany({ where: { id: { in: [...new Set(movs.map((m) => m.categoriaDestinoId).filter(Boolean))] } }, select: { id: true, nombre: true } })).map((c) => [
      c.id,
      c.nombre,
    ]),
  );
  const movsDe = new Map();
  for (const m of movs) {
    const g = m.evento?.grupoId;
    if (!movsDe.has(g)) movsDe.set(g, []);
    movsDe.get(g).push({
      id: m.id,
      revertido: Boolean(m.evento?.revertidoPor),
      texto: textoMovimiento({
        modo: m.modo,
        cabezas: m.cabezas,
        potrero: m.potreroDestino?.nombre,
        lote: m.loteDestino?.nombre,
        loteOrigen: m.loteOrigen?.nombre,
        categoria: nombresCategoria.get(m.categoriaDestinoId),
        tipo: m.tipo.nombre,
        guia: m.guia,
      }),
    });
  }

  // Los días de inseminación, solo en una IATF (IA: las de antes de los ajustes).
  const esIatf = ['IATF', 'IA'].includes(p.datos?.modalidad);
  const etapas = PLANTILLAS[p.tipo].etapas.filter((e) => !e.soloIatf || esIatf).map((e) => {
    const deEtapa = p.registros.filter((r) => r.etapa === e.clave);
    const vigentes = deEtapa.filter((r) => !r.anulado);
    const grupos = new Map();
    for (const r of deEtapa) {
      if (!grupos.has(r.grupoId)) grupos.set(r.grupoId, []);
      grupos.get(r.grupoId).push(r);
    }
    const cargas = [...grupos.entries()].map(([grupoId, rs]) => ({
      grupoId,
      fecha: fechaISO(rs[0].fecha),
      inicial: Boolean(rs[0].datos?.inicial),
      anulada: rs.every((r) => r.anulado),
      lineas: rs.map((r) => ({ registroId: r.id, loteId: r.loteId, lote: r.lote?.nombre ?? null, cabezas: r.cabezas, datos: r.datos, texto: textoAncla(e.clave, r.datos, r.cabezas) })),
      movimientos: movsDe.get(grupoId) ?? [],
      puedeAnular: !rs.every((r) => r.anulado) && p.estado !== 'ANULADO',
    }));
    let estado = vigentes.length ? 'HECHA' : 'PENDIENTE';
    if (!vigentes.length && proxima?.etapa === e.clave && proxima.atrasada) estado = 'ATRASADA';
    return {
      clave: e.clave,
      nombre: e.nombre,
      linea: e.linea,
      unica: e.unica,
      estado,
      fecha: vigentes.length ? fechaISO(vigentes[0].fecha) : null,
      cargas,
    };
  });

  // La categoría que se sugiere en cada paso para cada lote (las pantallas la preeligen).
  const categorias = await prisma.categoria.findMany({ where: { activo: true }, select: { id: true, nombre: true } });
  const PASOS_CATEGORIA = ['PRENADA', 'VACIA', 'PARIDA', 'DESTETE_MADRE', 'CRIA_MACHO', 'CRIA_HEMBRA'];
  // La preñez no cambia la categoría de la madre (el estado va en el rol).
  const sugeridas = (pl) =>
    Object.fromEntries(
      PASOS_CATEGORIA.map((paso) => [paso, paso === 'PRENADA' ? pl.lote.categoriaId : (sugerirCategoria(paso, { id: pl.lote.categoriaId, nombre: pl.lote.categoria.nombre }, categorias)?.id ?? null)]),
    );
  const servicio = fechasServicio(anclas);

  const lotes = p.lotes.map((pl) => ({
    loteId: pl.loteId,
    nombre: pl.lote.nombre,
    potrero: pl.lote.potrero,
    categoria: pl.lote.categoria.nombre,
    cabezas: cabezas.get(pl.loteId) ?? 0,
    rol: pl.rol,
    mes: pl.mes,
    destino: pl.destino,
    activo: pl.lote.activo && pl.hasta == null,
    salio: pl.hasta != null || !pl.lote.activo,
    categoriaId: pl.lote.categoriaId,
    sugeridas: sugeridas(pl),
  }));

  return {
    proceso: { ...toProceso(p), campo: p.campo },
    etapa,
    textoEtapa: TEXTO_ETAPA[etapa],
    proxima,
    // Las etapas con su fecha esperada y la real (docs/PECUARIA.md §9).
    cronograma,
    // El nombre de cada estado (rol), de Configuración → Procesos.
    estados: await estadosProceso(),
    embudo: embudo(anclas, await movimientosEmbudo(prisma, p.lotes)),
    // Los meses en que se espera la parición (para repartir las preñadas en el diagnóstico).
    meses: servicio.inicio ? mesesEsperados(servicio, parametros.gestacionDias) : [],
    lotes,
    // Los toros del proceso (uno por uno): los que están y los que salieron.
    toros: p.toros.map((t) => ({
      id: t.id,
      toroId: t.toroId,
      identificacion: t.toro.identificacion,
      raza: t.toro.raza,
      genetica: t.toro.genetica,
      potrero: t.potrero,
      desde: fechaISO(t.desde),
      hasta: t.hasta ? fechaISO(t.hasta) : null,
    })),
    etapas,
    pendientes: lotes.filter((l) => l.rol === 'VACIAS' && !l.destino && l.activo).map((l) => ({ tipo: 'DECIDIR_VACIAS', loteId: l.loteId, lote: l.nombre, cabezas: l.cabezas })),
  };
}

// --- Lista ---

// campos: el filtro de las estancias (alcance.js); filtros: estado (por
// defecto, abiertos; TODOS = todos), campaña, etapa y período de inicio.
export async function listar(campos, { estado = 'ABIERTO', campania, etapa, desde, hasta } = {}) {
  const y = [];
  if (campos) y.push({ campo: campos });
  if (estado && estado !== 'TODOS') y.push({ estado });
  if (campania) y.push({ campania });
  if (desde) y.push({ fechaInicio: { gte: aFecha(desde) } });
  if (hasta) y.push({ fechaInicio: { lte: aFecha(hasta) } });
  const filas = await prisma.proceso.findMany({
    where: { AND: y },
    include: {
      campo: { select: { id: true, sigla: true, nombre: true } },
      lotes: { include: { lote: { select: { id: true, activo: true, potreroId: true, potrero: { select: { nombre: true } } } } } },
      registros: { select: anclaSelect },
      ...incluirSiguientes,
    },
    orderBy: [{ fechaInicio: 'desc' }, { id: 'desc' }],
    take: 1000,
  });
  const parametros = await parametrosProceso();
  const hoy = hoyISO();
  const lista = [];
  for (const p of filas) {
    const anclas = p.registros.map(aAncla);
    const roles = p.lotes.map(aLoteRol);
    const e = etapaActual(anclas, roles);
    if (etapa && e !== etapa) continue;
    const activos = p.lotes.filter((pl) => pl.lote.activo && pl.hasta == null);
    const cabezas = await cabezasDeHoy(
      prisma,
      activos.map((pl) => pl.lote),
    );
    lista.push({
      id: p.id,
      nombre: p.nombre,
      tipo: p.tipo,
      campo: p.campo,
      estado: p.estado,
      campania: p.campania,
      fechaInicio: fechaISO(p.fechaInicio),
      etapa: e,
      textoEtapa: TEXTO_ETAPA[e],
      modalidad: p.datos?.modalidad ?? null,
      // Dónde están hoy los animales del proceso (sin repetir).
      potreros: [...new Set(activos.map((pl) => pl.lote.potrero.nombre))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true })),
      proxima: cronogramaDe(p, anclas, roles, parametros, hoy).proxima,
      embudoCorto: embudo(anclas).corto,
      lotes: activos.length,
      // Los lotes que están hoy en el proceso (Eventos: no ofrecer "empezar un
      // servicio" con ellos), sin las vacías que quedaron para volver a servir:
      // esas van aparte, y se ofrecen primero en un proceso nuevo.
      loteIds: activos.filter((pl) => pl.destino !== 'REENTORE').map((pl) => pl.loteId),
      reentoreIds: activos.filter((pl) => pl.destino === 'REENTORE').map((pl) => pl.loteId),
      cabezas: [...cabezas.values()].reduce((s, n) => s + n, 0),
      pendientes: p.lotes.filter((pl) => pl.rol === 'VACIAS' && !pl.destino && pl.hasta == null && pl.lote.activo).length,
    });
  }
  return lista;
}

// --- Editar ---

export async function editar(id, { nombre, nota }) {
  const procesoId = parseId(id);
  const antes = procesoId && (await prisma.proceso.findUnique({ where: { id: procesoId } }));
  if (!antes) throw notFound('Proceso no encontrado');
  if (nombre !== undefined) await exigirNombreLibre(prisma, antes.campoId, nombre, antes.id);
  const despues = await prisma.proceso.update({
    where: { id: antes.id },
    data: { ...(nombre !== undefined && { nombre }), ...(nota !== undefined && { nota }) },
  });
  return { antes: toProceso(antes), despues: toProceso(despues) };
}

// La estancia de un proceso (para el alcance).
export async function campoDeProceso(id) {
  const procesoId = parseId(id);
  return procesoId ? ((await prisma.proceso.findUnique({ where: { id: procesoId }, select: { campoId: true } }))?.campoId ?? undefined) : undefined;
}

// --- Eventos sueltos (diseño §13) ---

// La etapa que tomaría un evento suelto en el proceso (la ecografía, solo como diagnóstico).
const etapaDeSuelto = (clave, hechas) => (clave === 'ECOGRAFIA' ? 'DIAGNOSTICO' : etapaDe(clave, hechas));

async function sueltosDe(db, procesoId, ids = null) {
  const pls = await db.procesoLote.findMany({ where: { procesoId, hasta: null }, select: { loteId: true } });
  return db.eventoRegistro.findMany({
    where: {
      procesoId: null,
      anulado: false,
      loteId: { in: pls.map((pl) => pl.loteId) },
      tipo: { clave: { in: [...TIPOS_REPRODUCCION] } },
      ...(ids && { id: { in: ids } }),
    },
    include: { tipo: { select: { clave: true, nombre: true } }, lote: { select: { id: true, nombre: true } } },
    orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
  });
}

// Los entores, inseminaciones, ecografías y abortos sueltos de los lotes del
// proceso, con la etapa que tomarían.
export async function sueltos(id) {
  const procesoId = parseId(id);
  if (!procesoId || !(await prisma.proceso.findUnique({ where: { id: procesoId }, select: { id: true } }))) throw notFound('Proceso no encontrado');
  const filas = await sueltosDe(prisma, procesoId);
  const lista = [];
  for (const r of filas) {
    const hechas = (await prisma.eventoRegistro.findMany({ where: { procesoId, loteId: r.loteId, anulado: false }, select: { etapa: true } })).map((h) => h.etapa);
    lista.push({ id: r.id, fecha: fechaISO(r.fecha), tipo: r.tipo, lote: r.lote, cabezas: r.cabezas, texto: textoDatos(r.tipo.clave, r.datos), etapa: etapaDeSuelto(r.tipo.clave, hechas) });
  }
  return lista;
}

// Suma eventos sueltos al proceso, con la etapa que les toca (si está libre).
export async function asociar(id, { registroIds = [] }, usuarioId) {
  const r = await enTransaccion(async (tx) => {
    const proceso = await procesoParaCargar(tx, id);
    const filas = await sueltosDe(tx, proceso.id, registroIds);
    if (filas.length !== new Set(registroIds).size) throw badRequest('Hay eventos que no se pueden sumar: ya son de un proceso, están anulados o no son de los lotes del proceso');
    const hechos = [];
    for (const f of filas) {
      const hechas = (await tx.eventoRegistro.findMany({ where: { procesoId: proceso.id, loteId: f.loteId, anulado: false }, select: { etapa: true } })).map((h) => h.etapa);
      const etapa = etapaDeSuelto(f.tipo.clave, hechas);
      await exigirLibre(tx, proceso.id, etapa, f.lote);
      // Una ecografía suelta no separa preñadas y vacías: si el lote ya tiene
      // diagnóstico, no se suma (otra parte se carga desde el proceso).
      if (etapa === 'DIAGNOSTICO' && hechas.includes('DIAGNOSTICO')) {
        throw conflict(`El lote ${f.lote.nombre} ya tiene su diagnóstico (${fechaUY(fechaISO(f.fecha))}): otra parte de la ecografía se carga desde el proceso`);
      }
      await tx.eventoRegistro.update({ where: { id: f.id }, data: { procesoId: proceso.id, etapa } });
      hechos.push({ id: f.id, tipo: f.tipo.nombre, lote: f.lote.nombre, etapa });
    }
    await revisarCierre(tx, proceso.id);
    return { proceso, hechos };
  });
  return { ficha: await ficha(r.proceso.id), auditoria: { proceso: r.proceso.nombre, asociados: r.hechos, usuarioId } };
}

// --- Sugerencias (docs/PECUARIA.md §9) ---

// Descarta una sugerencia del cronograma (no va a pasar en este proceso: por
// ejemplo, no se ecografía) o la vuelve a activar. Se guarda en
// proceso.datos.descartadas. No se descarta lo hecho ni el inicio.
// Devuelve { nombre, item } para la auditoría.
export async function descartarSugerencia(id, { clave, descartada }) {
  const { proceso, cronograma } = await ficha(id);
  if (proceso.estado !== 'ABIERTO') throw conflict(`El proceso está ${proceso.estado === 'CERRADO' ? 'cerrado' : 'anulado'}`);
  const item = cronograma.find((i) => i.clave === clave);
  if (!item || item.clave === 'INICIO') throw badRequest('Esa sugerencia no está en el cronograma de este proceso');
  if (item.estado === 'HECHA') throw badRequest(`${item.nombre} ya está hecha: no se puede descartar`);
  await prisma.$transaction(async (tx) => {
    await bloquear(tx, proceso.id);
    const p = await tx.proceso.findUnique({ where: { id: proceso.id }, select: { datos: true } });
    const actuales = new Set(p.datos?.descartadas ?? []);
    if (descartada) actuales.add(clave);
    else actuales.delete(clave);
    await tx.proceso.update({ where: { id: proceso.id }, data: { datos: { ...p.datos, descartadas: [...actuales] } } });
  });
  return { nombre: proceso.nombre, item: { clave, nombre: item.nombre, fecha: item.fecha } };
}
