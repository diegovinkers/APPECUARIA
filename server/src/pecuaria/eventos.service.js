// Eventos: lo que se les hace a los animales sin cambiar dónde están ni
// cuántos son (diseño docs/superpowers/specs/2026-11-20-eventos-design.md).
// Pesada, recuento, vacunas, tratamientos, ecografía, inseminación, entore,
// aborto, castración, caravaneo, alimentación... Los tipos salen del catálogo
// (TipoMovimiento con efecto REGISTRO).
//
// A quién (body.nivel):
//   CAMPO     la estancia entera (campoId): todos sus lotes con animales;
//   POTRERO   uno o varios potreros enteros (potreroIds): todos sus lotes;
//   CATEGORIA todos los lotes de una categoría en la estancia (campoId + categoriaId);
//   LOTE      los lotes de `lineas` (uno o varios; con menos cabezas, una parte).
// Los niveles grandes son atajos: se registra un EventoRegistro por lote, con
// el nivel anotado. Un tipo solo para hembras (o machos) no se aplica a lotes
// del otro sexo: en un atajo se saltean (y se avisa); elegidos uno por uno, es un error.
// `lineas` trae lo de cada lote (el peso, las cabezas contadas...).
//
// Efecto en el stock (una versión nueva del potrero, origen EVENTO):
//   PESADA    el peso nuevo del lote (las cabezas no cambian);
//   RECUENTO  si hay diferencia, las cabezas contadas (con el motivo); sin
//             diferencia, solo el registro.
// La fecha de lo que cambia el stock no puede ser anterior al último dato del
// potrero (como un movimiento). Lo demás, cualquier fecha que no sea futura.
//
// Anular: lo que no tocó el stock se anula y listo. Una pesada o un recuento
// con diferencia, solo si después no hubo otro cambio en ese potrero (como
// revertir un movimiento): se anulan juntos los del mismo potrero de esa
// carga y otra versión deja el stock como estaba.
import { randomUUID } from 'node:crypto';
import { prisma } from '../db.js';
import { badRequest, conflict, notFound, parseId } from '../errors.js';
import { aFecha, fechaISO, hoyISO } from './importaciones.service.js';
import { crearVersion, fotoActual } from './lotes.js';
import { fechaUY } from './stock.service.js';
import { lineaDelLote, textoDatos, validarComunes } from './eventos.datos.js';
import { colgarDeProceso } from './procesos.service.js';

const NOMBRE_NIVEL = {
  CAMPO: 'a la estancia entera',
  POTRERO: 'por potrero entero',
  CATEGORIA: 'por categoría',
  LOTE: 'por lote',
  PARTE_LOTE: 'a una parte de un lote',
};
const NOMBRE_SEXO = { HEMBRA: 'hembras', MACHO: 'machos' };
const MAX_LOTES = 500;

async function tipoDeEvento(db, tipoId) {
  const tipo = await db.tipoMovimiento.findUnique({ where: { id: tipoId } });
  if (!tipo) throw badRequest('El tipo de evento no existe');
  if (!tipo.activo) throw badRequest(`El tipo ${tipo.nombre} está desactivado`);
  if (tipo.efecto !== 'REGISTRO') throw badRequest(`${tipo.nombre} no es un evento: se registra con el botón +`);
  // La parición mueve animales (las madres, los terneros que entran): se carga desde su proceso.
  if (tipo.clave === 'PARICION') throw badRequest('La parición se carga desde su proceso (Registro → Procesos)');
  return tipo;
}

export const tipoDeEventoPorId = (tipoId) => tipoDeEvento(prisma, tipoId);

// ¿Este tipo se le puede aplicar a una categoría de ese sexo? (null = mixta o sin definir: sí)
const sexoCorresponde = (tipo, sexo) => tipo.sexo === 'CUALQUIERA' || !sexo || sexo === tipo.sexo;

// Los lotes a los que se aplica, con su foto de hoy:
//   [{ lote: { id, nombre, campoId, categoriaId }, potrero, linea, categoria }]
// y cuántos se saltearon por el sexo.
async function resolverLotes(db, tipo, body) {
  const nivel = body.nivel ?? 'LOTE';
  if (nivel !== 'LOTE' && !tipo.niveles.includes(nivel)) throw badRequest(`${tipo.nombre} no se anota ${NOMBRE_NIVEL[nivel]}`);

  const fotos = new Map(); // potreroId → foto
  const foto = async (potreroId) => {
    if (!fotos.has(potreroId)) fotos.set(potreroId, await fotoActual(db, potreroId));
    return fotos.get(potreroId);
  };
  const potreroSelect = { id: true, nombre: true, campoId: true, tipo: true };
  const candidatos = [];
  const agregarPotrero = async (potrero, filtro = () => true) => {
    for (const l of (await foto(potrero.id)).lineas) {
      if (l.cabezas > 0 && filtro(l)) candidatos.push({ potrero, linea: l });
    }
  };

  let campoId = null;
  let referencia = null; // para la oración de la vista previa
  if (nivel === 'CAMPO' || nivel === 'CATEGORIA') {
    const campo = body.campoId && (await db.campo.findUnique({ where: { id: body.campoId }, select: { id: true, nombre: true } }));
    if (!campo) throw badRequest('Elegí la estancia');
    campoId = campo.id;
    let categoria = null;
    if (nivel === 'CATEGORIA') {
      categoria = body.categoriaId && (await db.categoria.findUnique({ where: { id: body.categoriaId } }));
      if (!categoria) throw badRequest('Elegí la categoría');
      if (!sexoCorresponde(tipo, categoria.sexo)) {
        throw badRequest(`${tipo.nombre} es solo para ${NOMBRE_SEXO[tipo.sexo]}: ${categoria.nombre} no corresponde`);
      }
    }
    referencia = nivel === 'CAMPO' ? { campo: campo.nombre } : { categoria: categoria.nombre };
    const potreros = await db.potrero.findMany({ where: { campoId: campo.id, activo: true }, select: potreroSelect, orderBy: [{ orden: 'asc' }, { nombre: 'asc' }] });
    for (const p of potreros) await agregarPotrero(p, (l) => !categoria || l.categoriaId === categoria.id);
  } else if (nivel === 'POTRERO') {
    const ids = [...new Set(body.potreroIds ?? [])];
    if (!ids.length) throw badRequest('Elegí al menos un potrero');
    const potreros = await db.potrero.findMany({ where: { id: { in: ids } }, select: potreroSelect });
    if (potreros.length !== ids.length) throw badRequest('Hay potreros elegidos que no existen');
    campoId = potreros[0].campoId;
    if (potreros.some((p) => p.campoId !== campoId)) throw badRequest('Los potreros tienen que ser de la misma estancia');
    referencia = { potreros: potreros.map((p) => p.nombre) };
    for (const id of ids) await agregarPotrero(potreros.find((p) => p.id === id));
  } else {
    if (!body.lineas?.length) throw badRequest('Elegí a qué lotes se lo hiciste');
    const vistos = new Set();
    for (const linea of body.lineas) {
      if (vistos.has(linea.loteId)) throw badRequest('Hay un lote elegido dos veces');
      vistos.add(linea.loteId);
      const lote = await db.lote.findUnique({ where: { id: linea.loteId }, include: { potrero: { select: potreroSelect } } });
      if (!lote) throw badRequest('Hay lotes elegidos que no existen');
      if (!lote.activo) throw badRequest(`El lote ${lote.nombre} está cerrado: no tiene animales`);
      const l = (await foto(lote.potreroId)).lineas.find((x) => x.loteId === lote.id);
      if (!l || !(l.cabezas > 0)) throw badRequest(`El lote ${lote.nombre} no tiene animales cargados`);
      candidatos.push({ potrero: lote.potrero, linea: l });
    }
    campoId = candidatos[0].potrero.campoId;
    if (candidatos.some((c) => c.potrero.campoId !== campoId)) throw badRequest('Los lotes tienen que ser de la misma estancia');
  }

  // El sexo de cada categoría.
  const sexos = new Map(
    (await db.categoria.findMany({ where: { id: { in: [...new Set(candidatos.map((c) => c.linea.categoriaId))] } }, select: { id: true, sexo: true } })).map((c) => [
      c.id,
      c.sexo,
    ]),
  );
  let omitidos = 0;
  const elegidos = [];
  for (const c of candidatos) {
    if (sexoCorresponde(tipo, sexos.get(c.linea.categoriaId))) {
      elegidos.push(c);
    } else if (nivel === 'LOTE') {
      throw badRequest(`${tipo.nombre} es solo para ${NOMBRE_SEXO[tipo.sexo]}: el lote ${c.linea.lote} es de ${c.linea.categoria}`);
    } else {
      omitidos += 1;
    }
  }
  if (!elegidos.length) {
    throw badRequest(omitidos ? `No hay lotes de ${NOMBRE_SEXO[tipo.sexo]} en lo elegido: ${tipo.nombre} es solo para ${NOMBRE_SEXO[tipo.sexo]}` : 'No hay lotes con animales en lo elegido');
  }
  if (elegidos.length > MAX_LOTES) throw badRequest(`Son demasiados lotes juntos (${elegidos.length}): anotalo por partes`);
  return { nivel, campoId, referencia, elegidos, omitidos, fotos };
}

// Arma todo lo que se va a guardar, sin guardar nada: lo usan la vista previa
// y el registro (dentro de la transacción).
async function planificar(db, body) {
  const tipo = await tipoDeEvento(db, body.tipoId);
  const comunes = validarComunes(tipo.clave, body.datos);
  if (comunes.error) throw badRequest(comunes.error);
  const { nivel, campoId, referencia, elegidos, omitidos, fotos } = await resolverLotes(db, tipo, body);
  const porLote = new Map((body.lineas ?? []).map((l) => [l.loteId, l]));
  const ids = new Set(elegidos.map((c) => c.linea.loteId));
  for (const loteId of porLote.keys()) {
    if (!ids.has(loteId)) throw badRequest('Hay datos de un lote que no es parte de lo elegido');
  }

  const dia = body.fecha ?? hoyISO();
  const registros = [];
  const cambios = new Map(); // potreroId → { potrero, lineas } (la foto nueva)
  for (const { potrero, linea } of elegidos) {
    const r = lineaDelLote(tipo.clave, porLote.get(linea.loteId), { nombre: linea.lote, cabezas: linea.cabezas, pesoPromedioKg: linea.pesoPromedioKg });
    if (r.error) throw badRequest(r.error);
    if (r.parte && !tipo.niveles.includes('PARTE_LOTE')) {
      throw badRequest(`${tipo.nombre} se anota al lote entero: ${linea.lote} tiene ${linea.cabezas} cabezas`);
    }
    if (!r.parte && nivel === 'LOTE' && !tipo.niveles.includes('LOTE')) throw badRequest(`${tipo.nombre} no se anota por lote`);
    let despues = null;
    if (r.cambia) {
      const ultima = fechaISO(fotos.get(potrero.id).version?.fecha);
      if (ultima && dia < ultima) throw badRequest(`La fecha no puede ser anterior al último dato de ${potrero.nombre} (${fechaUY(ultima)})`);
      if (!cambios.has(potrero.id)) cambios.set(potrero.id, { potrero, lineas: fotos.get(potrero.id).lineas.map((l) => ({ ...l })) });
      const nueva = cambios.get(potrero.id).lineas.find((l) => l.loteId === linea.loteId);
      Object.assign(nueva, r.cambia);
      despues = { cabezas: nueva.cabezas, pesoPromedioKg: nueva.pesoPromedioKg };
    }
    registros.push({
      potrero,
      lote: { id: linea.loteId, nombre: linea.lote },
      categoria: { id: linea.categoriaId, nombre: linea.categoria },
      nivel: nivel === 'LOTE' ? (r.parte ? 'PARTE_LOTE' : 'LOTE') : nivel,
      cabezas: r.cabezas,
      datos: { ...comunes.datos, ...r.datos },
      antes: { cabezas: linea.cabezas, pesoPromedioKg: linea.pesoPromedioKg },
      despues,
    });
  }
  // Procesos: un evento de reproducción de un lote que está en un proceso
  // abierto se cuelga solo, con la etapa que le toca.
  const deProceso = await colgarDeProceso(db, tipo, registros);
  registros.forEach((r, i) => {
    r.proceso = deProceso[i];
  });
  return { tipo, dia, nivel, campoId, referencia, omitidos, registros, cambios, nota: body.nota ?? null };
}

const plural = (n, uno, varios) => `${n.toLocaleString('es-UY')} ${n === 1 ? uno : varios}`;

// "Vas a anotar Vacuna aftosa en 3 lotes, 412 cabezas, el 20/11/2026".
export function oracion(plan) {
  const lotes = plural(plan.registros.length, 'lote', 'lotes');
  const cabezas = plural(plan.registros.reduce((s, r) => s + r.cabezas, 0), 'cabeza', 'cabezas');
  let donde = `en ${lotes}`;
  if (plan.nivel === 'CAMPO') donde = `en toda la estancia ${plan.referencia.campo} (${lotes})`;
  else if (plan.nivel === 'CATEGORIA') donde = `en todos los lotes de ${plan.referencia.categoria} (${lotes})`;
  else if (plan.nivel === 'POTRERO') {
    const p = plan.referencia.potreros;
    donde = `${p.length === 1 ? `en el potrero ${p[0]}` : `en ${p.length} potreros`} (${lotes})`;
  }
  return `Vas a anotar ${plan.tipo.nombre} ${donde}, ${cabezas}, el ${fechaUY(plan.dia)}`;
}

const avisosDe = (plan) =>
  plan.omitidos ? [`No se incluyen ${plural(plan.omitidos, 'lote', 'lotes')} de ${plan.tipo.sexo === 'HEMBRA' ? 'machos' : 'hembras'}: ${plan.tipo.nombre} es solo para ${NOMBRE_SEXO[plan.tipo.sexo]}`] : [];

const lineaVista = (r, clave) => ({
  loteId: r.lote.id,
  lote: r.lote.nombre,
  potreroId: r.potrero.id,
  potrero: r.potrero.nombre,
  categoria: r.categoria.nombre,
  nivel: r.nivel,
  cabezas: r.cabezas,
  datos: r.datos,
  texto: textoDatos(clave, r.datos),
  antes: r.antes,
  despues: r.despues,
  proceso: r.proceso ? { id: r.proceso.procesoId, nombre: r.proceso.nombre, etapa: r.proceso.etapa } : null,
});

export async function vistaPrevia(body) {
  const plan = await planificar(prisma, body);
  return {
    tipo: { id: plan.tipo.id, clave: plan.tipo.clave, nombre: plan.tipo.nombre },
    fecha: plan.dia,
    nivel: plan.nivel,
    oracion: oracion(plan),
    lotes: plan.registros.length,
    cabezas: plan.registros.reduce((s, r) => s + r.cabezas, 0),
    cambiaStock: plan.cambios.size > 0,
    avisos: avisosDe(plan),
    lineas: plan.registros.map((r) => lineaVista(r, plan.tipo.clave)),
  };
}

export async function registrar(body, usuarioId) {
  const { plan, grupoId } = await prisma.$transaction(
    async (tx) => {
      const plan = await planificar(tx, body);
      const grupoId = randomUUID();
      const fecha = aFecha(plan.dia);
      // Una versión por potrero que cambia (con todos sus lotes).
      const versiones = new Map();
      for (const [potreroId, { lineas }] of plan.cambios) {
        const v = await crearVersion(tx, { potreroId, fecha, origen: 'EVENTO', lineas, usuarioId, nota: plan.nota });
        versiones.set(potreroId, v.id);
        // Un recuento que da 0: el lote queda cerrado (como al corregir el stock).
        for (const l of lineas) if (l.cabezas === 0) await tx.lote.update({ where: { id: l.loteId }, data: { activo: false } });
      }
      await tx.eventoRegistro.createMany({
        data: plan.registros.map((r) => ({
          tipoId: plan.tipo.id,
          fecha,
          campoId: plan.campoId,
          potreroId: r.potrero.id,
          loteId: r.lote.id,
          categoriaId: r.categoria.id,
          nivel: r.nivel,
          cabezas: r.cabezas,
          datos: r.datos,
          nota: plan.nota,
          grupoId,
          versionId: r.despues ? versiones.get(r.potrero.id) : null,
          procesoId: r.proceso?.procesoId ?? null,
          etapa: r.proceso?.etapa ?? null,
          usuarioId,
        })),
      });
      return { plan, grupoId };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
  const eventos = await listarEventos(undefined, { grupoId });
  return {
    grupoId,
    eventos,
    oracion: oracion(plan).replace(/^Vas a anotar/, 'Anotaste'),
    auditoria: {
      grupoId,
      tipo: plan.tipo.nombre,
      fecha: plan.dia,
      nivel: plan.nivel,
      ...(plan.referencia && { referencia: plan.referencia }),
      lotes: plan.registros.length,
      cabezas: plan.registros.reduce((s, r) => s + r.cabezas, 0),
      cambiaStock: plan.cambios.size > 0,
      lineas: plan.registros.map((r) => ({ lote: r.lote.nombre, potrero: r.potrero.nombre, cabezas: r.cabezas, ...r.datos })),
      ...(plan.nota && { nota: plan.nota }),
    },
  };
}

// --- Lista ---

const incluir = {
  tipo: { select: { id: true, clave: true, nombre: true } },
  campo: { select: { id: true, sigla: true, nombre: true } },
  potrero: { select: { id: true, nombre: true, campoId: true, campo: { select: { sigla: true } } } },
  lote: { select: { id: true, nombre: true } },
  categoria: { select: { id: true, nombre: true } },
  usuario: { select: { nombre: true } },
  anuladoPor: { select: { nombre: true } },
  proceso: { select: { id: true, nombre: true } },
};

// La última versión de cada potrero (para saber qué se puede anular).
async function ultimasVersiones(db, potreroIds) {
  const ultimas = new Map();
  for (const id of new Set(potreroIds.filter((p) => p != null))) {
    const v = await db.versionStock.findFirst({ where: { potreroId: id }, orderBy: [{ fecha: 'desc' }, { id: 'desc' }], select: { id: true } });
    ultimas.set(id, v?.id ?? null);
  }
  return ultimas;
}

async function aItems(db, rows) {
  const ultimas = await ultimasVersiones(db, rows.filter((r) => r.versionId != null).map((r) => r.potreroId));
  return rows.map((r) => ({
    id: r.id,
    grupoId: r.grupoId,
    fecha: fechaISO(r.fecha),
    tipo: r.tipo,
    nivel: r.nivel,
    cabezas: r.cabezas,
    datos: r.datos,
    texto: textoDatos(r.tipo.clave, r.datos),
    nota: r.nota,
    campo: r.campo,
    potrero: r.potrero,
    lote: r.lote,
    categoria: r.categoria?.nombre ?? null,
    usuario: r.usuario?.nombre ?? null,
    creadoEn: r.creadoEn,
    cambiaStock: r.versionId != null,
    // Cambió las cabezas (un recuento con diferencia): también va en la
    // pestaña Movimientos. La pesada cambia el stock (los kilos) pero no las
    // cabezas ni el lugar, así que no (pedido de Diego, 20/11).
    cambiaCabezas: r.versionId != null && r.tipo.clave !== 'PESADA',
    anulado: r.anulado,
    anuladoEn: r.anuladoEn,
    anuladoPor: r.anuladoPor?.nombre ?? null,
    // Procesos: si es una etapa de un proceso.
    proceso: r.proceso ?? null,
    etapa: r.etapa ?? null,
    // Lo que cambió el stock solo si después no hubo otros cambios en el potrero.
    puedeAnular: !r.anulado && (r.versionId == null || ultimas.get(r.potreroId) === r.versionId),
  }));
}

// Los eventos de esas estancias (campos: { id } o { id: { in } }; undefined =
// todas), del más nuevo al más viejo. Filtros: desde / hasta, potreroId,
// loteId, categoriaId, tipoId y grupoId. soloCabezas: solo los que cambiaron
// las cabezas (ver cambiaCabezas).
export async function listarEventos(campos, { desde, hasta, potreroId, loteId, categoriaId, tipoId, grupoId, soloCabezas = false } = {}) {
  const y = [];
  if (soloCabezas) y.push({ versionId: { not: null } }, { tipo: { clave: { not: 'PESADA' } } });
  if (campos) y.push({ campo: campos });
  if (grupoId) y.push({ grupoId });
  if (tipoId) y.push({ tipoId });
  if (desde) y.push({ fecha: { gte: aFecha(desde) } });
  if (hasta) y.push({ fecha: { lte: aFecha(hasta) } });
  if (potreroId) y.push({ potreroId });
  if (loteId) y.push({ loteId });
  if (categoriaId) y.push({ categoriaId });
  const rows = await prisma.eventoRegistro.findMany({ where: { AND: y }, include: incluir, orderBy: [{ fecha: 'desc' }, { id: 'desc' }], take: 2000 });
  return aItems(prisma, rows);
}

// --- Para el historial de un potrero ---

const fmt = (n) => (n == null ? '?' : Number(n).toLocaleString('es-UY', { maximumFractionDigits: 1 }));

// Cómo cuenta el historial del potrero la versión que dejó un evento.
export function textoVersionEvento(r) {
  const d = r.datos ?? {};
  if (r.tipo.clave === 'PESADA') {
    const antes = d.pesoAnteriorKg != null ? `de ${fmt(d.pesoAnteriorKg)} a` : 'a';
    return `Pesada del lote ${r.lote.nombre}: ${antes} ${fmt(d.pesoPromedioKg)} kg`;
  }
  if (r.tipo.clave === 'RECUENTO') return `Recuento del lote ${r.lote.nombre}: había ${d.anteriores}, se contaron ${d.contadas}${d.motivo ? ` (${d.motivo})` : ''}`;
  return `${r.tipo.nombre} del lote ${r.lote.nombre}`;
}

// versionId → texto, para las versiones que dejaron los eventos de un potrero
// (y sus anulaciones).
export async function textosDeVersiones(potreroId) {
  const rows = await prisma.eventoRegistro.findMany({
    where: { potreroId, OR: [{ versionId: { not: null } }, { versionAnulacionId: { not: null } }] },
    include: { tipo: { select: { clave: true, nombre: true } }, lote: { select: { nombre: true } } },
    orderBy: { id: 'asc' },
  });
  const textos = new Map();
  const sumar = (id, texto) => textos.set(id, textos.has(id) ? `${textos.get(id)}; ${texto}` : texto);
  for (const r of rows) {
    if (r.versionId) sumar(r.versionId, textoVersionEvento(r));
    if (r.versionAnulacionId) sumar(r.versionAnulacionId, `Anulación: ${textoVersionEvento(r)}`);
  }
  return textos;
}

// --- Anular ---

// La estancia de un evento o de una carga (para el control de alcance).
export async function campoDeRegistro(id) {
  const rid = parseId(id);
  return rid ? ((await prisma.eventoRegistro.findUnique({ where: { id: rid }, select: { campoId: true } }))?.campoId ?? null) : null;
}

export async function campoDeGrupo(grupoId) {
  return (await prisma.eventoRegistro.findFirst({ where: { grupoId: String(grupoId) }, select: { campoId: true } }))?.campoId ?? null;
}

// La versión de un potrero justo antes de otra (null: estaba vacío).
function versionAnterior(db, version) {
  return db.versionStock.findFirst({
    where: { potreroId: version.potreroId, OR: [{ fecha: { lt: version.fecha } }, { fecha: version.fecha, id: { lt: version.id } }] },
    orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
    include: { lineas: true },
  });
}

const incluirAnular = { ...incluir, version: true };

// Anula estos registros dentro de una transacción. Los que cambiaron el stock
// arrastran a los demás de la misma versión (el mismo potrero, la misma carga).
async function anularVarios(tx, registros, usuarioId) {
  const porVersion = new Map();
  for (const r of registros) if (r.versionId) porVersion.set(r.versionId, r);
  // Antes de tocar nada: que nada haya cambiado después en esos potreros.
  const ultimas = await ultimasVersiones(tx, [...porVersion.values()].map((r) => r.potreroId));
  for (const r of porVersion.values()) {
    if (ultimas.get(r.potreroId) !== r.versionId) {
      throw conflict(
        `Después de esta ${r.tipo.nombre.toLowerCase()} hubo otros cambios en ${r.potrero.nombre}: no se puede anular. Corregilo con un recuento o una pesada nueva.`,
      );
    }
  }
  const ahora = new Date();
  const anulados = new Set(registros.map((r) => r.id));
  for (const [versionId, r] of porVersion) {
    const anterior = await versionAnterior(tx, r.version);
    const lineas = (anterior?.lineas ?? []).map((l) => ({ loteId: l.loteId, categoriaId: l.categoriaId, cabezas: l.cabezas, pesoPromedioKg: l.pesoPromedioKg }));
    const nota = `Anulación de la ${r.tipo.nombre.toLowerCase()} del ${fechaUY(fechaISO(r.fecha))}`;
    const v = await crearVersion(tx, { potreroId: r.potreroId, fecha: aFecha(hoyISO()), origen: 'EVENTO', lineas, usuarioId, nota });
    // Los lotes vuelven a estar abiertos si estaban (un recuento que había dado 0).
    const hermanos = await tx.eventoRegistro.findMany({ where: { versionId, anulado: false }, select: { id: true, loteId: true } });
    for (const h of hermanos) {
      anulados.add(h.id);
      if (h.loteId && lineas.some((l) => l.loteId === h.loteId)) await tx.lote.update({ where: { id: h.loteId }, data: { activo: true } });
    }
    await tx.eventoRegistro.updateMany({ where: { versionId, anulado: false }, data: { versionAnulacionId: v.id } });
  }
  await tx.eventoRegistro.updateMany({ where: { id: { in: [...anulados] }, anulado: false }, data: { anulado: true, anuladoEn: ahora, anuladoPorId: usuarioId } });
  return [...anulados];
}

async function anularDonde(where, usuarioId, siVacio) {
  const ids = await prisma.$transaction(
    async (tx) => {
      const registros = await tx.eventoRegistro.findMany({ where, include: incluirAnular, orderBy: { id: 'asc' } });
      if (!registros.length) throw siVacio();
      const vigentes = registros.filter((r) => !r.anulado);
      if (!vigentes.length) throw conflict(registros.length === 1 ? 'Este evento ya está anulado' : 'Estos eventos ya están anulados');
      return anularVarios(tx, vigentes, usuarioId);
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
  const eventos = await aItems(prisma, await prisma.eventoRegistro.findMany({ where: { id: { in: ids } }, include: incluir, orderBy: { id: 'asc' } }));
  const [primero] = eventos;
  return {
    eventos,
    auditoria: {
      tipo: primero.tipo.nombre,
      fecha: primero.fecha,
      grupoId: primero.grupoId,
      registros: eventos.map((e) => e.id),
      lotes: eventos.map((e) => ({ lote: e.lote?.nombre ?? null, potrero: e.potrero?.nombre ?? null, cabezas: e.cabezas })),
      cambiaStock: eventos.some((e) => e.cambiaStock),
    },
  };
}

// Un evento (y, si cambió el stock, los de su mismo potrero en esa carga).
export function anular(id, usuarioId) {
  const rid = parseId(id);
  if (!rid) throw notFound('Evento no encontrado');
  return anularDonde({ id: rid }, usuarioId, () => notFound('Evento no encontrado'));
}

// Todo lo que se cargó junto (una campaña entera).
export function anularGrupo(grupoId, usuarioId) {
  return anularDonde({ grupoId: String(grupoId).slice(0, 36) }, usuarioId, () => notFound('Evento no encontrado'));
}

// --- Para el feedlot ---

// Las dos últimas pesadas (sin anular) de cada lote: Map loteId → [{ fecha, pesoKg }]
// (la más nueva primero).
export async function ultimasPesadas(loteIds) {
  const porLote = new Map();
  if (!loteIds.length) return porLote;
  const rows = await prisma.eventoRegistro.findMany({
    where: { loteId: { in: loteIds }, anulado: false, tipo: { clave: 'PESADA' } },
    select: { loteId: true, fecha: true, datos: true },
    orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
  });
  for (const r of rows) {
    const lista = porLote.get(r.loteId) ?? [];
    if (lista.length < 2 && r.datos?.pesoPromedioKg != null) lista.push({ fecha: fechaISO(r.fecha), pesoKg: Number(r.datos.pesoPromedioKg) });
    porLote.set(r.loteId, lista);
  }
  return porLote;
}
