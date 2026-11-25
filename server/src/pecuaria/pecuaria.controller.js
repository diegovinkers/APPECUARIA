import { categorias, listParametros, setParametro, usosSuelo } from './catalogos.repository.js';
import { filtroCampos, filtroGrupo, puedeCampo } from './alcance.js';
import * as lugares from './lugares.repository.js';
import * as importaciones from './importaciones.service.js';
import * as stock from './stock.service.js';
import { resumenCampo, resumenTodas } from './resumen.service.js';
import * as movimientos from './movimientos.service.js';
import * as tipos from './tipos.repository.js';
import * as entradasSalidas from './entradas-salidas.service.js';
import { ACCION, cambios, registrar } from '../audit/audit.js';
import { badRequest, notFound, parseId } from '../errors.js';
import { filtrosMovimientosSchema, filtrosProcesosSchema, grupoSchema } from './pecuaria.schema.js';
import * as feedlot from './feedlot.service.js';
import * as eventos from './eventos.service.js';
import * as procesos from './procesos.service.js';
import * as procesosConfig from './procesos.configuracion.js';
import * as toros from './toros.service.js';

// Las claves que vinieron en el body: son las que se comparan para auditar.
const clavesEnviadas = (body) => Object.keys(body).filter((k) => body[k] !== undefined);

// Alta y edición de un catálogo, con su auditoría. Las ediciones solo se
// auditan si algo cambió.
function abm({ repo, entidad, creada, editada, noEncontrado }) {
  return {
    async list(req, res) {
      res.json(await repo.list());
    },
    async create(req, res) {
      const row = await repo.create(req.body);
      const detalle = { nombre: row.nombre, ...(row.codigo && { codigo: row.codigo }) };
      await registrar(req, { accion: creada, entidad, entidadId: row.id, detalle });
      res.status(201).json(row);
    },
    async update(req, res) {
      const resultado = await repo.update(req.params.id, req.body);
      if (!resultado) throw notFound(noEncontrado);
      const { antes, despues } = resultado;
      const detalle = cambios(antes, despues, clavesEnviadas(req.body));
      if (detalle) await registrar(req, { accion: editada, entidad, entidadId: despues.id, detalle });
      res.json(despues);
    },
  };
}

export const usosSueloController = abm({
  repo: usosSuelo,
  entidad: 'uso_suelo',
  creada: ACCION.USO_SUELO_CREADO,
  editada: ACCION.USO_SUELO_EDITADO,
  noEncontrado: 'Uso de suelo no encontrado',
});

export const categoriasController = abm({
  repo: categorias,
  entidad: 'categoria',
  creada: ACCION.CATEGORIA_CREADA,
  editada: ACCION.CATEGORIA_EDITADA,
  noEncontrado: 'Categoría no encontrada',
});

export const tiposMovimientoController = abm({
  repo: { list: tipos.listTipos, create: tipos.createTipo, update: tipos.updateTipo },
  entidad: 'tipo_movimiento',
  creada: ACCION.TIPO_MOVIMIENTO_CREADO,
  editada: ACCION.TIPO_MOVIMIENTO_EDITADO,
  noEncontrado: 'Tipo de movimiento no encontrado',
});

export const causasController = abm({
  repo: { list: tipos.listCausas, create: tipos.createCausa, update: tipos.updateCausa },
  entidad: 'causa_movimiento',
  creada: ACCION.CAUSA_CREADA,
  editada: ACCION.CAUSA_EDITADA,
  noEncontrado: 'Causa no encontrada',
});

export const camposController = abm({
  repo: { list: lugares.listCampos, create: lugares.createCampo, update: lugares.updateCampo },
  entidad: 'campo',
  creada: ACCION.CAMPO_CREADO,
  editada: ACCION.CAMPO_EDITADO,
  noEncontrado: 'Campo no encontrado',
});

// ?grupo=estancias|feedlots → el grupo (por defecto, estancias).
function grupoDe(req) {
  const r = grupoSchema.safeParse(req.query);
  if (!r.success) throw badRequest(r.error.issues[0].message);
  return r.data.grupo;
}

// El filtro de campos del usuario para ese grupo.
const filtroDelGrupo = (req) => filtroGrupo(req.user, grupoDe(req));

// Cada uno ve solo sus estancias (alcance.js).
camposController.list = async (req, res) => res.json(await lugares.listCampos(filtroCampos(req.user)));

// --- Parámetros ---

export async function getParametros(req, res) {
  res.json(await listParametros());
}

// Las etapas del feedlot tienen que quedar en orden: adaptación < engorde <
// ciclo. valores: { CLAVE: valor } con lo que se va a guardar.
async function controlarEtapas(valores) {
  const claves = ['FEEDLOT_ADAPTACION_DIAS', 'FEEDLOT_ENGORDE_DIAS', 'CICLO_FEEDLOT_DIAS'];
  if (!claves.some((c) => c in valores)) return;
  const actuales = await feedlot.parametrosFeedlot();
  const dias = {
    adaptacionDias: valores.FEEDLOT_ADAPTACION_DIAS ?? actuales.adaptacionDias,
    engordeDias: valores.FEEDLOT_ENGORDE_DIAS ?? actuales.engordeDias,
    cicloDias: valores.CICLO_FEEDLOT_DIAS ?? actuales.cicloDias,
  };
  const problema = feedlot.problemaEtapas(dias);
  if (problema) throw badRequest(problema);
}

async function guardarParametro(req, clave, valor) {
  const resultado = await setParametro(clave, valor);
  if (!resultado) throw notFound(`Parámetro no encontrado: ${clave}`);
  const { antes, despues } = resultado;
  if (antes.valor !== despues.valor) {
    await registrar(req, {
      accion: ACCION.PARAMETRO_CAMBIADO,
      entidad: 'parametro',
      entidadId: despues.clave,
      detalle: { antes: antes.valor, despues: despues.valor },
    });
  }
  return despues;
}

export async function putParametro(req, res) {
  await controlarEtapas({ [req.params.clave]: req.body.valor });
  res.json(await guardarParametro(req, req.params.clave, req.body.valor));
}

// Varios a la vez (los del feedlot): se controlan juntos, así el orden de las
// etapas se puede cambiar de una sola vez. Si uno no existe, no se guarda ninguno.
export async function putParametros(req, res) {
  const { valores } = req.body;
  const existentes = new Set((await listParametros()).map((p) => p.clave));
  const falta = Object.keys(valores).find((c) => !existentes.has(c));
  if (falta) throw notFound(`Parámetro no encontrado: ${falta}`);
  await controlarEtapas(valores);
  const guardados = [];
  for (const [clave, valor] of Object.entries(valores)) guardados.push(await guardarParametro(req, clave, valor));
  res.json(guardados);
}

// --- Potreros ---

const POTRERO_NO_ENCONTRADO = 'Potrero no encontrado';
const CAMPO_NO_ENCONTRADO = 'Campo no encontrado';

// Los corrales de un feedlot llevan además sus datos del feedlot (días de
// encierre, peso de hoy, ganancia diaria, cm de comedero, salida: la tabla de
// Corrales, 25/11). Un corral vacío lleva feedlot: null.
async function conFeedlot(potreros) {
  const esCorral = (p) => p.campo?.tipo === 'CONFINAMIENTO';
  const ids = potreros.filter(esCorral).map((p) => p.id);
  if (!ids.length) return potreros;
  const datos = await feedlot.datosDeCorrales(ids);
  return potreros.map((p) => (esCorral(p) ? { ...p, feedlot: datos.get(p.id) ?? null } : p));
}

export async function listPotreros(req, res) {
  const potreros = await lugares.listPotreros(req.params.campoId);
  if (!potreros) throw notFound(CAMPO_NO_ENCONTRADO);
  res.json(await conFeedlot(potreros));
}

// "Todas las estancias": los potreros de todas las del usuario.
export async function listPotrerosTodas(req, res) {
  res.json(await conFeedlot(await lugares.listPotrerosTodas(filtroDelGrupo(req))));
}

export async function createPotrero(req, res) {
  const potrero = await lugares.createPotrero(req.params.campoId, req.body);
  if (!potrero) throw notFound(CAMPO_NO_ENCONTRADO);
  await registrar(req, {
    accion: ACCION.POTRERO_CREADO,
    entidad: 'potrero',
    entidadId: potrero.id,
    detalle: { campoId: potrero.campoId, nombre: potrero.nombre },
  });
  res.status(201).json(potrero);
}

export async function updatePotrero(req, res) {
  const resultado = await lugares.updatePotrero(req.params.id, req.body);
  if (!resultado) throw notFound(POTRERO_NO_ENCONTRADO);
  const { antes, despues } = resultado;
  // Las subdivisiones se comparan por código, no por id.
  const plano = (p) => ({ ...p, subdivisiones: p.subdivisiones.map((s) => s.codigo) });
  const detalle = cambios(plano(antes), plano(despues), clavesEnviadas(req.body));
  if (detalle) await registrar(req, { accion: ACCION.POTRERO_EDITADO, entidad: 'potrero', entidadId: despues.id, detalle });
  res.json(despues);
}

// --- Importación de la planilla ---

export async function subirPlanilla(req, res) {
  const vista = await importaciones.previsualizarPlanilla({
    buffer: Buffer.isBuffer(req.body) ? req.body : null,
    archivo: String(req.query.archivo || 'planilla.xlsx').slice(0, 255),
    hoja: req.query.hoja ? String(req.query.hoja) : undefined,
    // v1: solo La Gateada. El parámetro queda para sumar las demás estancias.
    campo: String(req.query.campo || 'EG').slice(0, 10),
    usuarioId: req.user.id,
  });
  res.status(201).json(vista);
}

export async function getImportacion(req, res) {
  res.json(await importaciones.obtener(req.params.id));
}

export async function confirmarImportacion(req, res) {
  const resultado = await importaciones.confirmar(req.params.id, req.body, req.user.id);
  const { id, estado, ...detalle } = resultado;
  await registrar(req, { accion: ACCION.IMPORTACION_CONFIRMADA, entidad: 'importacion', entidadId: id, detalle });
  res.json(resultado);
}

export async function descartarImportacion(req, res) {
  const vista = await importaciones.descartar(req.params.id);
  await registrar(req, {
    accion: ACCION.IMPORTACION_DESCARTADA,
    entidad: 'importacion',
    entidadId: vista.id,
    detalle: { archivo: vista.archivo, hoja: vista.hoja },
  });
  res.json(vista);
}

// --- Detalle, stock y uso de un potrero ---

// Los procesos abiertos de unos lotes, sin repetir: [{ id, nombre, rol, etapa, textoEtapa }].
async function procesosDe(loteIds) {
  const porLote = await procesos.procesosDeLotes(loteIds);
  return [...new Map([...porLote.values()].flat().map((p) => [p.id, p])).values()];
}

export async function getPotrero(req, res) {
  const detalle = await stock.detallePotrero(req.params.id);
  res.json({ ...detalle, procesos: await procesosDe((detalle.stock?.lineas ?? []).map((l) => l.loteId)) });
}

export async function getHistorial(req, res) {
  res.json(await stock.historialPotrero(req.params.id));
}

export async function putStock(req, res) {
  const { potrero, aviso, auditoria } = await stock.guardarStock(req.params.id, req.body, req.user.id);
  await registrar(req, { accion: ACCION.STOCK_CAMBIADO, entidad: 'potrero', entidadId: potrero.id, detalle: auditoria });
  res.json({ potrero, aviso });
}

export async function putUso(req, res) {
  const { potrero, auditoria } = await stock.cambiarUso(req.params.id, req.body, req.user.id);
  await registrar(req, { accion: ACCION.USO_SUELO_CAMBIADO, entidad: 'potrero', entidadId: potrero.id, detalle: auditoria });
  res.json(potrero);
}

// --- Resumen por campo ---

// Todas las estancias que el usuario puede ver, sumadas.
export async function getResumenTodas(req, res) {
  const grupo = grupoDe(req);
  res.json(await resumenTodas(filtroGrupo(req.user, grupo), grupo));
}

// --- Feedlot: el análisis por corral ---

export async function getFeedlot(req, res) {
  res.json(await feedlot.feedlotCampo(req.params.campoId));
}

// Todos los feedlots del usuario.
export async function getFeedlots(req, res) {
  res.json(await feedlot.feedlotsTodos(filtroGrupo(req.user, 'feedlots')));
}

export async function getResumen(req, res) {
  res.json(await resumenCampo(req.params.campoId));
}

// --- Lotes y movimientos ---

// El nombre y, en el feedlot, la entrada al corral. Solo se audita lo que cambió.
export async function patchLote(req, res) {
  const { antes, despues, lote } = await stock.editarLote(req.params.id, req.body);
  const detalle = cambios(antes, despues, clavesEnviadas(req.body));
  if (detalle) await registrar(req, { accion: ACCION.LOTE_EDITADO, entidad: 'lote', entidadId: lote.id, detalle });
  res.json({ id: lote.id, potreroId: lote.potreroId, categoriaId: lote.categoriaId, activo: lote.activo, ...despues });
}

export async function postVistaPreviaMovimiento(req, res) {
  res.json(await movimientos.vistaPrevia(req.body));
}

export async function postMovimiento(req, res) {
  const { auditoria, ...resultado } = await movimientos.registrar(req.body, req.user.id);
  await registrar(req, {
    accion: ACCION.MOVIMIENTO_REGISTRADO,
    entidad: 'movimiento',
    entidadId: resultado.movimiento.id,
    detalle: auditoria,
  });
  res.status(201).json(resultado);
}

// --- Mover entre campos y movimiento múltiple (paso 5 del rediseño) ---

export async function getDestinosEntreCampos(req, res) {
  const origen = parseId(req.query.origen);
  if (!origen) throw badRequest('Elegí el campo de origen');
  res.json(await movimientos.destinosEntreCampos(origen, filtroCampos(req.user)));
}

export async function postVistaPreviaEntreCampos(req, res) {
  res.json(await movimientos.vistaPreviaEntreCampos(req.body));
}

export async function postEntreCampos(req, res) {
  const { auditoria, ...resultado } = await movimientos.registrarEntreCampos(req.body, req.user.id);
  await registrar(req, { accion: ACCION.MOVIMIENTO_ENTRE_CAMPOS, entidad: 'evento_movimiento', entidadId: resultado.evento.id, detalle: auditoria });
  res.status(201).json(resultado);
}

export async function postVistaPreviaMultiple(req, res) {
  res.json(await movimientos.vistaPreviaMultiple(req.body, req.user.id));
}

export async function postMultiple(req, res) {
  const { auditoria, ...resultado } = await movimientos.registrarMultiple(req.body, req.user.id);
  await registrar(req, { accion: ACCION.MOVIMIENTO_MULTIPLE, entidad: 'evento_movimiento', entidadId: resultado.evento.id, detalle: auditoria });
  res.status(201).json(resultado);
}

export async function postRevertirEvento(req, res) {
  const { auditoria, ...resultado } = await movimientos.revertirEvento(req.params.id, req.user.id);
  await registrar(req, { accion: ACCION.EVENTO_REVERTIDO, entidad: 'evento_movimiento', entidadId: auditoria.revierteA, detalle: auditoria });
  res.status(201).json(resultado);
}

export async function getMovimientos(req, res) {
  const filtros = filtrosMovimientosSchema.safeParse(req.query);
  if (!filtros.success) throw badRequest(filtros.error.issues[0].message);
  res.json(await movimientos.listar(req.params.campoId, filtros.data));
}

// "Todas las estancias": los movimientos de todas las del usuario.
export async function getMovimientosTodas(req, res) {
  const filtros = filtrosMovimientosSchema.safeParse(req.query);
  if (!filtros.success) throw badRequest(filtros.error.issues[0].message);
  res.json(await movimientos.listarTodas(filtroDelGrupo(req), filtros.data));
}

// --- Entradas y salidas ---

export async function postVistaPreviaEntradaSalida(req, res) {
  res.json(await entradasSalidas.vistaPrevia(req.body));
}

// Una fila de auditoría por movimiento (un nacimiento puede registrar dos).
export async function postEntradaSalida(req, res) {
  const { auditorias, ...resultado } = await entradasSalidas.registrar(req.body, req.user.id);
  for (const { id, detalle } of auditorias) {
    await registrar(req, { accion: ACCION.MOVIMIENTO_REGISTRADO, entidad: 'movimiento', entidadId: id, detalle });
  }
  res.status(201).json(resultado);
}

export async function postRevertirMovimiento(req, res) {
  const { auditoria, ...resultado } = await movimientos.revertir(req.params.id, req.user.id);
  await registrar(req, { accion: ACCION.MOVIMIENTO_REVERTIDO, entidad: 'movimiento', entidadId: auditoria.revierteA, detalle: auditoria });
  res.status(201).json(resultado);
}

export async function getLote(req, res) {
  const lote = await movimientos.historialLote(req.params.id, { puede: (campoId) => puedeCampo(req.user, campoId) });
  res.json({ ...lote, procesos: await procesosDe([lote.lote.id]) });
}

// --- Eventos (pesada, recuento, vacuna...) ---

export async function postVistaPreviaEvento(req, res) {
  // Un entore o una inseminación que empieza un servicio: la vista previa del proceso.
  if (req.body.empezarServicio) {
    const tipo = await eventos.tipoDeEventoPorId(req.body.tipoId);
    return res.json({ empezarServicio: await procesos.vistaPreviaCrear(procesos.cuerpoDesdeEvento(tipo, req.body)) });
  }
  res.json(await eventos.vistaPrevia(req.body));
}

// Una fila de auditoría por carga (todos los lotes juntos).
export async function postEvento(req, res) {
  if (req.body.empezarServicio) {
    const tipo = await eventos.tipoDeEventoPorId(req.body.tipoId);
    const { auditoria, ...creado } = await procesos.crear(procesos.cuerpoDesdeEvento(tipo, req.body), req.user.id);
    await registrar(req, { accion: ACCION.PROCESO_CREADO, entidad: 'proceso', entidadId: creado.proceso.id, detalle: auditoria });
    return res.status(201).json({ ...creado, eventos: await eventos.listarEventos(undefined, { grupoId: creado.grupoId }) });
  }
  const { auditoria, ...resultado } = await eventos.registrar(req.body, req.user.id);
  await registrar(req, { accion: ACCION.EVENTO_REGISTRADO, entidad: 'evento_registro', entidadId: resultado.grupoId, detalle: auditoria });
  res.status(201).json(resultado);
}

export async function postAnularEvento(req, res) {
  const { auditoria, ...resultado } = await eventos.anular(req.params.id, req.user.id);
  await registrar(req, { accion: ACCION.EVENTO_ANULADO, entidad: 'evento_registro', entidadId: auditoria.grupoId, detalle: auditoria });
  res.json(resultado);
}

export async function postAnularGrupoEventos(req, res) {
  const { auditoria, ...resultado } = await eventos.anularGrupo(req.params.grupoId, req.user.id);
  await registrar(req, { accion: ACCION.EVENTO_ANULADO, entidad: 'evento_registro', entidadId: auditoria.grupoId, detalle: auditoria });
  res.json(resultado);
}

// --- Procesos (diseño docs/superpowers/specs/2026-11-20-procesos-design.md) ---

const filtrosProcesos = (req) => {
  const filtros = filtrosProcesosSchema.safeParse(req.query);
  if (!filtros.success) throw badRequest(filtros.error.issues[0].message);
  return filtros.data;
};

// Los de todas las estancias del usuario (o del grupo de arriba).
export async function getProcesosTodas(req, res) {
  res.json(await procesos.listar(filtroDelGrupo(req), filtrosProcesos(req)));
}

export async function getProcesos(req, res) {
  const campoId = parseId(req.params.campoId);
  if (!campoId) throw notFound('Campo no encontrado');
  res.json(await procesos.listar({ id: campoId }, filtrosProcesos(req)));
}

export async function getProceso(req, res) {
  res.json(await procesos.ficha(req.params.id));
}

export async function postVistaPreviaProceso(req, res) {
  res.json(await procesos.vistaPreviaCrear(req.body));
}

export async function postProceso(req, res) {
  const { auditoria, ...resultado } = await procesos.crear(req.body, req.user.id);
  await registrar(req, { accion: ACCION.PROCESO_CREADO, entidad: 'proceso', entidadId: resultado.proceso.id, detalle: auditoria });
  res.status(201).json(resultado);
}

export async function postVistaPreviaEtapa(req, res) {
  res.json(await procesos.vistaPreviaEtapa(req.params.id, req.params.etapa, req.body));
}

export async function postEtapa(req, res) {
  const { auditoria, ...resultado } = await procesos.registrarEtapa(req.params.id, req.params.etapa, req.body, req.user.id);
  await registrar(req, { accion: ACCION.PROCESO_ETAPA, entidad: 'proceso', entidadId: resultado.ficha.proceso.id, detalle: auditoria });
  res.status(201).json(resultado);
}

export async function patchProceso(req, res) {
  const { antes, despues } = await procesos.editar(req.params.id, req.body);
  const detalle = cambios(antes, despues, clavesEnviadas(req.body));
  if (detalle) await registrar(req, { accion: ACCION.PROCESO_EDITADO, entidad: 'proceso', entidadId: despues.id, detalle });
  res.json(despues);
}

// La decisión de las vacías: una carga de la etapa DECISION.
export async function postVistaPreviaDecision(req, res) {
  res.json(await procesos.vistaPreviaEtapa(req.params.id, 'DECISION', req.body));
}

export async function postDecision(req, res) {
  const { auditoria, ...resultado } = await procesos.registrarEtapa(req.params.id, 'DECISION', req.body, req.user.id);
  await registrar(req, { accion: ACCION.PROCESO_ETAPA, entidad: 'proceso', entidadId: resultado.ficha.proceso.id, detalle: auditoria });
  res.status(201).json(resultado);
}

// Anular una carga de un proceso (con sus movimientos).
export async function postAnularCarga(req, res) {
  const { auditoria, ...resultado } = await procesos.anularCarga(req.params.id, req.params.grupoId, req.user.id);
  await registrar(req, { accion: ACCION.EVENTO_ANULADO, entidad: 'proceso', entidadId: resultado.ficha.proceso.id, detalle: auditoria });
  res.json(resultado);
}

export async function postCerrarProceso(req, res) {
  const { auditoria, ...resultado } = await procesos.cerrar(req.params.id, req.body);
  await registrar(req, { accion: ACCION.PROCESO_CERRADO, entidad: 'proceso', entidadId: resultado.proceso.id, detalle: auditoria });
  res.json(resultado);
}

export async function postAnularProceso(req, res) {
  const { auditoria, ...resultado } = await procesos.anularProceso(req.params.id, req.user.id);
  await registrar(req, { accion: ACCION.PROCESO_ANULADO, entidad: 'proceso', entidadId: resultado.proceso.id, detalle: auditoria });
  res.json(resultado);
}

export async function getSueltos(req, res) {
  res.json(await procesos.sueltos(req.params.id));
}

export async function postAsociar(req, res) {
  const { auditoria, ...resultado } = await procesos.asociar(req.params.id, req.body, req.user.id);
  await registrar(req, { accion: ACCION.PROCESO_ETAPA, entidad: 'proceso', entidadId: resultado.ficha.proceso.id, detalle: auditoria });
  res.json(resultado);
}

// --- Procesos: configuración (plazos, avisos y nombres de los estados) ---

export async function getConfiguracionProcesos(req, res) {
  res.json(await procesosConfig.leerConfiguracion());
}

export async function putConfiguracionProcesos(req, res) {
  const { antes, despues, cambio } = await procesosConfig.guardarConfiguracion(req.body);
  if (cambio) await registrar(req, { accion: ACCION.PROCESO_CONFIG_EDITADA, entidad: 'etapa_plantilla', entidadId: null, detalle: { antes, despues } });
  res.json(await procesosConfig.leerConfiguracion());
}

// --- Toros ---

// Lo que se audita de un toro (el lote, por su nombre).
const toroPlano = (t) => ({ identificacion: t.identificacion, raza: t.raza, genetica: t.genetica, lote: t.lote?.nombre ?? null, activo: t.activo, nota: t.nota });

export async function getToros(req, res) {
  res.json(await toros.listar(req.params.campoId, { todos: req.query.todos === '1' }));
}

export async function postToro(req, res) {
  const toro = await toros.crear(req.params.campoId, req.body);
  await registrar(req, { accion: ACCION.TORO_CREADO, entidad: 'toro', entidadId: toro.id, detalle: { campoId: toro.campoId, ...toroPlano(toro) } });
  res.status(201).json(toro);
}

export async function patchToro(req, res) {
  const { antes, despues } = await toros.editar(req.params.id, req.body);
  const claves = clavesEnviadas(req.body).map((k) => (k === 'loteId' ? 'lote' : k));
  const detalle = cambios(toroPlano(antes), toroPlano(despues), claves);
  if (detalle) await registrar(req, { accion: ACCION.TORO_EDITADO, entidad: 'toro', entidadId: despues.id, detalle: { identificacion: despues.identificacion, ...detalle } });
  res.json(despues);
}

// --- Procesos: descartar una sugerencia (o volver a activarla) ---

export async function postSugerencia(req, res) {
  const { nombre, item } = await procesos.descartarSugerencia(req.params.id, req.body);
  await registrar(req, {
    accion: ACCION.PROCESO_SUGERENCIA,
    entidad: 'proceso',
    entidadId: req.params.id,
    detalle: { proceso: nombre, ...item, descartada: req.body.descartada },
  });
  res.json(await procesos.ficha(req.params.id));
}
