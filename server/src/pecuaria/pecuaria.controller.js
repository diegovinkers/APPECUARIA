import { categorias, listParametros, setParametro, usosSuelo } from './catalogos.repository.js';
import { filtroCampos } from './alcance.js';
import * as lugares from './lugares.repository.js';
import * as importaciones from './importaciones.service.js';
import * as stock from './stock.service.js';
import { resumenCampo } from './resumen.service.js';
import * as movimientos from './movimientos.service.js';
import * as tipos from './tipos.repository.js';
import * as entradasSalidas from './entradas-salidas.service.js';
import { ACCION, cambios, registrar } from '../audit/audit.js';
import { badRequest, notFound } from '../errors.js';
import { filtrosMovimientosSchema } from './pecuaria.schema.js';

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

// Cada uno ve solo sus estancias (alcance.js).
camposController.list = async (req, res) => res.json(await lugares.listCampos(filtroCampos(req.user)));

// --- Parámetros ---

export async function getParametros(req, res) {
  res.json(await listParametros());
}

export async function putParametro(req, res) {
  const resultado = await setParametro(req.params.clave, req.body.valor);
  if (!resultado) throw notFound('Parámetro no encontrado');
  const { antes, despues } = resultado;
  if (antes.valor !== despues.valor) {
    await registrar(req, {
      accion: ACCION.PARAMETRO_CAMBIADO,
      entidad: 'parametro',
      entidadId: despues.clave,
      detalle: { antes: antes.valor, despues: despues.valor },
    });
  }
  res.json(despues);
}

// --- Potreros ---

const POTRERO_NO_ENCONTRADO = 'Potrero no encontrado';
const CAMPO_NO_ENCONTRADO = 'Campo no encontrado';

export async function listPotreros(req, res) {
  const potreros = await lugares.listPotreros(req.params.campoId);
  if (!potreros) throw notFound(CAMPO_NO_ENCONTRADO);
  res.json(potreros);
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

export async function getPotrero(req, res) {
  res.json(await stock.detallePotrero(req.params.id));
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

export async function getResumen(req, res) {
  res.json(await resumenCampo(req.params.campoId));
}

// --- Lotes y movimientos ---

export async function patchLote(req, res) {
  const { antes, despues } = await stock.renombrarLote(req.params.id, req.body.nombre);
  if (antes.nombre !== despues.nombre) {
    await registrar(req, {
      accion: ACCION.LOTE_EDITADO,
      entidad: 'lote',
      entidadId: despues.id,
      detalle: { antes: { nombre: antes.nombre }, despues: { nombre: despues.nombre } },
    });
  }
  res.json({ id: despues.id, nombre: despues.nombre, potreroId: despues.potreroId, categoriaId: despues.categoriaId, activo: despues.activo });
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

export async function getMovimientos(req, res) {
  const filtros = filtrosMovimientosSchema.safeParse(req.query);
  if (!filtros.success) throw badRequest(filtros.error.issues[0].message);
  res.json(await movimientos.listar(req.params.campoId, filtros.data));
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
  res.json(await movimientos.historialLote(req.params.id));
}
