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
import { badRequest, conflict, notFound, parseId } from '../errors.js';
import { aFecha, fechaISO, hoyISO } from './importaciones.service.js';
import { fotoActual } from './lotes.js';
import { fechaUY } from './stock.service.js';
import { tipoPorClave } from './tipos.repository.js';
import { TEXTO_ETAPA, campaniaDe, embudo, etapaActual, proximas } from './procesos.calculos.js';
import { ETAPAS_UNICAS, PLANTILLAS, TIPOS_REPRODUCCION, etapaDe, etapaDePlantilla } from './procesos.plantillas.js';
import { MODALIDAD, lineaSimple, textoAncla } from './procesos.datos.js';

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

export async function parametrosProceso(db = prisma) {
  const filas = await db.parametro.findMany({ where: { clave: { in: ['GESTACION_DIAS', 'DIAGNOSTICO_DESDE_DIAS', 'DESTETE_EDAD_DIAS'] } } });
  const valor = (clave, porDefecto) => Number(filas.find((f) => f.clave === clave)?.valor ?? porDefecto);
  return { gestacionDias: valor('GESTACION_DIAS', 283), diagnosticoDesdeDias: valor('DIAGNOSTICO_DESDE_DIAS', 45), desteteEdadDias: valor('DESTETE_EDAD_DIAS', 180) };
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
  return pl ? { ...pl.proceso, rol: pl.rol, mes: pl.mes } : null;
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
  for (const id of ids) {
    const l = porId.get(id);
    if (l.campoId !== campo) throw badRequest('Los lotes tienen que ser de la misma estancia');
    if (!l.activo || !cabezas.get(l.id)) throw badRequest(`El lote ${l.nombre} no tiene animales`);
    if (l.categoria.sexo === 'MACHO') throw badRequest(`El lote ${l.nombre} es de ${l.categoria.nombre}: un servicio es para hembras`);
    const otro = await procesoAbiertoDe(db, l.id);
    if (otro) throw conflict(`El lote ${l.nombre} ya está en el proceso "${otro.nombre}"`);
  }
  return { campoId: campo, lotes: ids.map((id) => ({ ...porId.get(id), cabezas: cabezas.get(id) })) };
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
  const { campoId, lotes } = await lotesParaEmpezar(db, ids, body.campoId ?? null);
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
    lineas = body.lineas.map((linea) => {
      const lote = lotes.find((l) => l.id === linea.loteId);
      const cabezas = linea.cabezas ?? lote.cabezas;
      if (cabezas > lote.cabezas) throw badRequest(`El lote ${lote.nombre} tiene ${lote.cabezas} cabezas`);
      return { lote, cabezas };
    });
  }

  const categorias = [...new Set(lotes.map((l) => l.categoria.nombre))];
  let nombre = body.nombre?.trim();
  if (nombre) await exigirNombreLibre(db, campoId, nombre);
  else nombre = await nombreLibreProceso(db, campoId, `Servicio ${campania} · ${categorias.join(' y ')}`.slice(0, 115));
  return { campoId, lotes, lineas, enCurso, dia, campania, nombre, modalidad: body.modalidad, toros: body.toros ?? null, nota: body.nota ?? null };
}

const oracionCrear = (plan) => {
  if (plan.enCurso) {
    return `Vas a cargar "${plan.nombre}", que ya está ${plan.enCurso.etapa === 'PARIENDO' ? 'pariendo' : 'diagnosticado'}: ${plural(plan.enCurso.servidas, 'servida', 'servidas')}, ${plural(plan.enCurso.prenadas, 'preñada', 'preñadas')}`;
  }
  const cabezas = plan.lineas.reduce((s, l) => s + l.cabezas, 0);
  return `Vas a empezar "${plan.nombre}": ${MODALIDAD[plan.modalidad]} de ${plural(plan.lineas.length, 'lote', 'lotes')} (${plural(cabezas, 'cabeza', 'cabezas')}) el ${fechaUY(plan.dia)}`;
};

export async function vistaPreviaCrear(body) {
  const plan = await planCrear(prisma, body);
  return {
    nombre: plan.nombre,
    campania: plan.campania,
    oracion: oracionCrear(plan),
    lotes: plan.enCurso ? plan.lotes.length : plan.lineas.length,
    cabezas: plan.enCurso ? plan.enCurso.servidas : plan.lineas.reduce((s, l) => s + l.cabezas, 0),
    avisos: [],
  };
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
      usuarioId,
    },
  });
  const desde = aFecha(plan.enCurso ? hoyISO() : plan.dia);
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
    for (const { lote, cabezas } of plan.lineas) {
      await tx.eventoRegistro.create({
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
          datos: { modalidad: plan.modalidad },
        },
      });
    }
  }
  return { proceso, plan, grupoId };
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
    modalidad: tipo.clave === 'ENTORE' ? 'TOROS' : 'IA',
    lineas: body.lineas.map((l) => ({ loteId: l.loteId, ...(l.cabezas != null && l.cabezas !== '' && { cabezas: Number(l.cabezas) }) })),
  };
}

// --- Las etapas ---

async function bloquear(tx, id) {
  await tx.$queryRaw`SELECT id FROM proceso WHERE id = ${id} FOR UPDATE`;
}

const anclaSelect = { id: true, etapa: true, loteId: true, fecha: true, cabezas: true, datos: true, anulado: true, grupoId: true };
const aAncla = (r) => ({ ...r, fecha: fechaISO(r.fecha) });
const aLoteRol = (pl) => ({ loteId: pl.loteId, rol: pl.rol, activo: pl.lote.activo && pl.hasta == null });

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
  return elegidos.map(({ pl, linea }) => ({ pl, linea, lote: { ...pl.lote, cabezas: cabezas.get(pl.loteId) } }));
}

function fechaDeCarga(proceso, body) {
  const dia = body.fecha ?? hoyISO();
  const inicio = fechaISO(proceso.fechaInicio);
  if (dia < inicio) throw badRequest(`La fecha no puede ser anterior al inicio del proceso (${fechaUY(inicio)})`);
  return dia;
}

// Las etapas que solo anotan: repaso, fin del servicio y aborto (este último,
// sin pasarlas a vacías: eso llega con la parición).
async function planSimple(tx, proceso, etapaDef, body) {
  const dia = fechaDeCarga(proceso, body);
  const elegidos = await lotesDeLaCarga(tx, proceso, etapaDef, body.lineas);
  const tipo = await tipoPorClave(tx, etapaDef.tipos[0]);
  const lineas = [];
  for (const { lote, linea } of elegidos) {
    if (!lote.activo || !lote.cabezas) throw badRequest(`El lote ${lote.nombre} no tiene animales`);
    await exigirLibre(tx, proceso.id, etapaDef.clave, lote);
    const r = lineaSimple(etapaDef.clave, linea, lote);
    if (r.error) throw badRequest(r.error);
    lineas.push({ lote, cabezas: r.cabezas, parte: r.parte, datos: r.datos });
  }
  return { dia, tipo, lineas };
}

const ETAPAS_SIMPLES = new Set(['REPASO', 'FIN_SERVICIO', 'ABORTO']);

async function planEtapa(tx, proceso, etapa, body) {
  const etapaDef = etapaDePlantilla(etapa, proceso.tipo);
  if (!etapaDef) throw notFound('Etapa no encontrada');
  if (ETAPAS_SIMPLES.has(etapa)) return { etapaDef, ...(await planSimple(tx, proceso, etapaDef, body)) };
  throw badRequest(`La etapa ${nombreEtapa(etapa)} todavía no se puede cargar`);
}

const oracionEtapa = (plan) => {
  const cabezas = plan.lineas.reduce((s, l) => s + l.cabezas, 0);
  return `Vas a anotar ${plan.etapaDef.nombre.toLowerCase()} en ${plural(plan.lineas.length, 'lote', 'lotes')} (${plural(cabezas, 'cabeza', 'cabezas')}) el ${fechaUY(plan.dia)}`;
};

export async function vistaPreviaEtapa(id, etapa, body) {
  // Simula sin guardar: el plan solo lee.
  return prisma.$transaction(async (tx) => {
    const proceso = await procesoParaCargar(tx, id);
    const plan = await planEtapa(tx, proceso, etapa, body);
    return {
      etapa,
      oracion: oracionEtapa(plan),
      lineas: plan.lineas.map((l) => ({ loteId: l.lote.id, lote: l.lote.nombre, cabezas: l.cabezas, texto: textoAncla(etapa, l.datos, l.cabezas) })),
      avisos: plan.avisos ?? [],
    };
  }, TX);
}

export async function registrarEtapa(id, etapa, body, usuarioId) {
  const r = await enTransaccion(async (tx) => {
    const proceso = await procesoParaCargar(tx, id);
    const plan = await planEtapa(tx, proceso, etapa, body);
    const grupoId = randomUUID();
    for (const l of plan.lineas) {
      await tx.eventoRegistro.create({
        data: {
          tipoId: plan.tipo.id,
          fecha: aFecha(plan.dia),
          campoId: proceso.campoId,
          potreroId: l.lote.potreroId,
          loteId: l.lote.id,
          categoriaId: l.lote.categoriaId,
          nivel: l.parte ? 'PARTE_LOTE' : 'LOTE',
          cabezas: l.cabezas,
          datos: l.datos,
          nota: body.nota ?? null,
          grupoId,
          procesoId: proceso.id,
          etapa,
          usuarioId,
        },
      });
    }
    return { proceso, plan, grupoId };
  });
  return {
    grupoId: r.grupoId,
    oracion: oracionEtapa(r.plan).replace(/^Vas a anotar/, 'Anotaste'),
    ficha: await ficha(r.proceso.id),
    auditoria: {
      proceso: r.proceso.nombre,
      etapa,
      fecha: r.plan.dia,
      grupoId: r.grupoId,
      lineas: r.plan.lineas.map((l) => ({ lote: l.lote.nombre, cabezas: l.cabezas, ...l.datos })),
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
    if (tipo.clave === 'ECOGRAFIA' && hechas.includes('DIAGNOSTICO')) {
      throw conflict(`El lote ${r.lote.nombre} ya tiene su diagnóstico en el proceso "${proceso.nombre}": una revisión se carga desde el proceso`);
    }
    const etapa = etapaDe(tipo.clave, hechas);
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
  const proxima = proximas({ anclas, lotes: roles, parametros, hoy: hoyISO() });
  const cabezas = await cabezasDeHoy(
    prisma,
    p.lotes.map((pl) => pl.lote),
  );

  const etapas = PLANTILLAS[p.tipo].etapas.map((e) => {
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
      movimientos: [],
      puedeAnular: !rs.every((r) => r.anulado),
    }));
    let estado = vigentes.length ? 'HECHA' : 'PENDIENTE';
    if (!vigentes.length && proxima.etapa === e.clave && proxima.atrasada) estado = 'ATRASADA';
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
  }));

  return {
    proceso: { ...toProceso(p), campo: p.campo },
    etapa,
    textoEtapa: TEXTO_ETAPA[etapa],
    proxima,
    embudo: embudo(anclas, await movimientosEmbudo(prisma, p.lotes)),
    lotes,
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
      lotes: { include: { lote: { select: { id: true, activo: true, potreroId: true } } } },
      registros: { select: anclaSelect },
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
      proxima: proximas({ anclas, lotes: roles, parametros, hoy }),
      embudoCorto: embudo(anclas).corto,
      lotes: activos.length,
      // Los lotes que están hoy en el proceso (Eventos: no ofrecer "empezar un servicio" con ellos).
      loteIds: activos.map((pl) => pl.loteId),
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
