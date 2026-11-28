// Registro de auditoría: quién, qué, cuándo, sobre qué registro y desde qué IP.
// Solo se agregan filas; nada de la app las edita ni las borra.
import { prisma } from '../db.js';

// Códigos de acción. Fijos, para poder filtrar y contar con SQL.
export const ACCION = {
  LOGIN_OK: 'LOGIN_OK',
  // detalle.motivo: password | usuario_inexistente | bloqueado | desactivado
  LOGIN_FALLIDO: 'LOGIN_FALLIDO',
  USUARIO_BLOQUEADO: 'USUARIO_BLOQUEADO',
  USUARIO_DESBLOQUEADO: 'USUARIO_DESBLOQUEADO',
  LOGOUT: 'LOGOUT',
  PASSWORD_CAMBIADA: 'PASSWORD_CAMBIADA',
  PASSWORD_CAMBIO_FALLIDO: 'PASSWORD_CAMBIO_FALLIDO',
  PASSWORD_RESTABLECIDA: 'PASSWORD_RESTABLECIDA',

  // Usuarios, roles y permisos (paso 3 del rediseño).
  // detalle: { usuario, roles: [nombres], todasLasEstancias, campos: [siglas] }
  USUARIO_CREADO: 'USUARIO_CREADO',
  // detalle: { activo }
  USUARIO_ESTADO_CAMBIADO: 'USUARIO_ESTADO_CAMBIADO',
  // detalle: { antes: [nombres], despues: [nombres] }
  ROLES_ASIGNADOS: 'ROLES_ASIGNADOS',
  // detalle: { antes: { todas, campos: [siglas] }, despues: { todas, campos } }
  ESTANCIAS_ASIGNADAS: 'ESTANCIAS_ASIGNADAS',
  // detalle: { nombre, descripcion? } · en la edición, { antes, despues }
  ROL_CREADO: 'ROL_CREADO',
  ROL_EDITADO: 'ROL_EDITADO',
  ROL_BORRADO: 'ROL_BORRADO',
  // detalle: { rol, antes: ['modulo:ACCION'], despues: [...] }
  PERMISOS_CAMBIADOS: 'PERMISOS_CAMBIADOS',

  // Pecuaria. En las ediciones, detalle = { antes, despues } con los campos que cambiaron.
  USO_SUELO_CREADO: 'USO_SUELO_CREADO',
  USO_SUELO_EDITADO: 'USO_SUELO_EDITADO',
  CATEGORIA_CREADA: 'CATEGORIA_CREADA',
  CATEGORIA_EDITADA: 'CATEGORIA_EDITADA',
  TIPO_MOVIMIENTO_CREADO: 'TIPO_MOVIMIENTO_CREADO',
  TIPO_MOVIMIENTO_EDITADO: 'TIPO_MOVIMIENTO_EDITADO',
  // En las ediciones, los tipos a los que se aplica la causa van como tipoIds.
  CAUSA_CREADA: 'CAUSA_CREADA',
  CAUSA_EDITADA: 'CAUSA_EDITADA',
  PARAMETRO_CAMBIADO: 'PARAMETRO_CAMBIADO',
  CAMPO_CREADO: 'CAMPO_CREADO',
  CAMPO_EDITADO: 'CAMPO_EDITADO',
  POTRERO_CREADO: 'POTRERO_CREADO',
  POTRERO_EDITADO: 'POTRERO_EDITADO',
  // detalle: { archivo, hoja, fecha, campo, potrerosNuevos, versiones, cabezas }
  IMPORTACION_CONFIRMADA: 'IMPORTACION_CONFIRMADA',
  IMPORTACION_DESCARTADA: 'IMPORTACION_DESCARTADA',
  // detalle: { fecha, antes: [líneas], despues: [líneas], nota? }
  STOCK_CAMBIADO: 'STOCK_CAMBIADO',
  // detalle: { antes: { uso, desde }, despues: { uso, desde } }
  USO_SUELO_CAMBIADO: 'USO_SUELO_CAMBIADO',
  // detalle: { fecha, cabezas, pesoPromedioKg, modo, origen: { lote, potrero }, destino: { lote, potrero }, categoriaOrigen, categoriaDestino, nota? }
  MOVIMIENTO_REGISTRADO: 'MOVIMIENTO_REGISTRADO',
  // entidad_id = el movimiento que se deshizo. detalle: { revierteA, fecha, cabezas, modoOriginal, origen, destino }
  MOVIMIENTO_REVERTIDO: 'MOVIMIENTO_REVERTIDO',
  // detalle: lo que cambió de { nombre, fechaEntrada, pesoEntradaKg }, antes y después
  LOTE_EDITADO: 'LOTE_EDITADO',
  // Paso 5 del rediseño. entidad = el evento.
  // detalle: { evento, campoDestino, guia?, fecha, cabezas, modo, origen, destino, categoriaOrigen, categoriaDestino, nota? }
  MOVIMIENTO_ENTRE_CAMPOS: 'MOVIMIENTO_ENTRE_CAMPOS',
  // detalle: { evento, fecha, pasos: [{ paso, cabezas, potreroOrigen, potreroDestino, ... }], nota? }
  MOVIMIENTO_MULTIPLE: 'MOVIMIENTO_MULTIPLE',
  // entidad_id = el evento que se deshizo. detalle: { revierteA, tipoOriginal, fechaOriginal, pasos }
  EVENTO_REVERTIDO: 'EVENTO_REVERTIDO',
  // Eventos (pesada, recuento, vacuna...). entidad = evento_registro, entidad_id = el grupo (la carga).
  // detalle: { grupoId, tipo, fecha, nivel, referencia?, lotes, cabezas, cambiaStock, lineas: [{ lote, potrero, cabezas, ...datos }], nota? }
  EVENTO_REGISTRADO: 'EVENTO_REGISTRADO',
  // detalle: { tipo, fecha, grupoId, registros: [ids], lotes: [{ lote, potrero, cabezas }], cambiaStock }
  EVENTO_ANULADO: 'EVENTO_ANULADO',
  // Procesos. entidad = proceso, entidad_id = el proceso.
  // detalle: { nombre, campania, modalidad, fecha, lotes, cabezas | enCurso }
  PROCESO_CREADO: 'PROCESO_CREADO',
  // Una carga de una etapa. detalle: { proceso, etapa, fecha, grupoId, lineas: [{ lote, cabezas, ...datos }], ... }
  PROCESO_ETAPA: 'PROCESO_ETAPA',
  // detalle: { antes, despues } (nombre, nota)
  PROCESO_EDITADO: 'PROCESO_EDITADO',
  // detalle: { nombre, nota? }
  PROCESO_CERRADO: 'PROCESO_CERRADO',
  // detalle: { nombre, anclasAnuladas }
  PROCESO_ANULADO: 'PROCESO_ANULADO',
  // Configuración de los procesos (plazos, avisos, nombres de los estados).
  // entidad = etapa_plantilla. detalle: { antes, despues } por clave de etapa o de estado.
  PROCESO_CONFIG_EDITADA: 'PROCESO_CONFIG_EDITADA',
  // Una sugerencia del cronograma descartada o vuelta a activar.
  // entidad = proceso. detalle: { proceso, clave, nombre, fecha, descartada }
  PROCESO_SUGERENCIA: 'PROCESO_SUGERENCIA',
  // Toros (uno por uno). entidad = toro. detalle: { identificacion, campoId, ... } / { antes, despues }
  TORO_CREADO: 'TORO_CREADO',
  TORO_EDITADO: 'TORO_EDITADO',
  // Pasto de los potreros (docs/superpowers/plans/2026-11-26-pasto.md). Una
  // recorrida: entidad = lectura_pasto, entidad_id = el grupo.
  // detalle: { grupoId, fecha, campoId, lecturas: [{ potrero, altura }], nota? }
  // (el pasto anotado al mover va en el detalle del movimiento).
  PASTO_REGISTRADO: 'PASTO_REGISTRADO',
  // entidad_id = la lectura. detalle: { id, potrero, fecha, altura, momento, grupoId }
  PASTO_ANULADO: 'PASTO_ANULADO',
  // Precios de mercado (docs/PRECIOS_INAC.md). Una corrida de la importación:
  // entidad = importacion_precio. detalle: { estado, origen, semana, semanasNuevas, disparadoPor, errores }
  PRECIOS_IMPORTADOS: 'PRECIOS_IMPORTADOS',
  // Una importación en revisión, aprobada. detalle: { semana, precios, marcas }
  PRECIOS_APROBADOS: 'PRECIOS_APROBADOS',
  // entidad = precio_mercado. detalle: { indicador, semana, antes: { valor, nota }, despues: { valor, nota } }
  PRECIO_CORREGIDO: 'PRECIO_CORREGIDO',
  // Un precio cargado a mano. detalle: { indicador, semana, valor, nota }
  PRECIO_CARGADO: 'PRECIO_CARGADO',
};

// Para auditar una edición: de las claves indicadas, solo las que cambiaron.
// Devuelve null si no cambió nada.
export function cambios(antes, despues, claves) {
  const resultado = { antes: {}, despues: {} };
  for (const clave of claves) {
    if (JSON.stringify(antes[clave]) !== JSON.stringify(despues[clave])) {
      resultado.antes[clave] = antes[clave];
      resultado.despues[clave] = despues[clave];
    }
  }
  return Object.keys(resultado.antes).length ? resultado : null;
}

// Lo que se confirma desde el asistente (fase 2) llega por la dirección local
// de la app (asistente/llamar.js) con la cabecera X-Origen: asistente. Solo se
// cree si viene de la misma máquina: desde afuera la cabecera no cuenta.
const LOCAL = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function desdeElAsistente(req) {
  if (req.get?.('x-origen') !== 'asistente' || !LOCAL.has(req.socket?.remoteAddress)) return null;
  const propuestaId = Number(req.get('x-asistente-propuesta'));
  return { origen: 'asistente', ...(Number.isInteger(propuestaId) && propuestaId > 0 && { propuestaId }) };
}

// usuarioId = quién lo hizo (por defecto, el de la sesión). Para los logins
// es la cuenta con la que se intentó entrar, o null si no existe: en ese caso
// no se guarda el nombre que escribieron, porque a veces es la contraseña
// tipeada en el campo equivocado.
export async function registrar(req, { accion, usuarioId = req.user?.id ?? null, entidad = null, entidadId = null, detalle }) {
  const asistente = desdeElAsistente(req);
  await prisma.auditoria.create({
    data: {
      accion,
      usuarioId,
      entidad,
      entidadId: entidadId == null ? null : String(entidadId),
      detalle: asistente ? { ...detalle, ...asistente } : detalle,
      ip: req.ip?.slice(0, 45) ?? null,
    },
  });
}
