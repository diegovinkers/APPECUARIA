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
  // detalle: { antes: { nombre }, despues: { nombre } }
  LOTE_EDITADO: 'LOTE_EDITADO',
  // Paso 5 del rediseño. entidad = el evento.
  // detalle: { evento, campoDestino, guia?, fecha, cabezas, modo, origen, destino, categoriaOrigen, categoriaDestino, nota? }
  MOVIMIENTO_ENTRE_CAMPOS: 'MOVIMIENTO_ENTRE_CAMPOS',
  // detalle: { evento, fecha, pasos: [{ paso, cabezas, potreroOrigen, potreroDestino, ... }], nota? }
  MOVIMIENTO_MULTIPLE: 'MOVIMIENTO_MULTIPLE',
  // entidad_id = el evento que se deshizo. detalle: { revierteA, tipoOriginal, fechaOriginal, pasos }
  EVENTO_REVERTIDO: 'EVENTO_REVERTIDO',
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

// usuarioId = quién lo hizo (por defecto, el de la sesión). Para los logins
// es la cuenta con la que se intentó entrar, o null si no existe: en ese caso
// no se guarda el nombre que escribieron, porque a veces es la contraseña
// tipeada en el campo equivocado.
export async function registrar(req, { accion, usuarioId = req.user?.id ?? null, entidad = null, entidadId = null, detalle }) {
  await prisma.auditoria.create({
    data: {
      accion,
      usuarioId,
      entidad,
      entidadId: entidadId == null ? null : String(entidadId),
      detalle,
      ip: req.ip?.slice(0, 45) ?? null,
    },
  });
}
