import { Router } from 'express';
import * as roles from './roles.repository.js';
import { crearRolSchema, editarRolSchema, permisosSchema } from './roles.schema.js';
import { authRequired } from '../auth/auth.middleware.js';
import { requirePermission } from '../auth/permisos.js';
import { validateBody } from '../middlewares/validate.js';
import { ACCION, cambios, registrar } from '../audit/audit.js';
import { forbidden, notFound } from '../errors.js';

const router = Router();
const NO_ENCONTRADO = 'Rol no encontrado';

// Roles y su matriz de permisos (DECISIONES §3). Editar la matriz es solo del
// superadmin: cambia lo que puede hacer todo el que tenga ese rol.
router.use(authRequired);

router.get('/', requirePermission('roles', 'VER'), async (req, res) => res.json(await roles.list()));

// Lo que se puede marcar en la matriz: módulos y acciones.
router.get('/catalogo', requirePermission('roles', 'VER'), async (req, res) => res.json(await roles.catalogo()));

router.post('/', requirePermission('roles', 'CREAR'), validateBody(crearRolSchema), async (req, res) => {
  const rol = await roles.create(req.body);
  await registrar(req, {
    accion: ACCION.ROL_CREADO,
    entidad: 'rol',
    entidadId: rol.id,
    detalle: { nombre: rol.nombre, ...(rol.descripcion && { descripcion: rol.descripcion }) },
  });
  res.status(201).json(rol);
});

router.patch('/:id', requirePermission('roles', 'EDITAR'), validateBody(editarRolSchema), async (req, res) => {
  const resultado = await roles.update(req.params.id, req.body);
  if (!resultado) throw notFound(NO_ENCONTRADO);
  const detalle = cambios(resultado.antes, resultado.despues, Object.keys(req.body));
  if (detalle) await registrar(req, { accion: ACCION.ROL_EDITADO, entidad: 'rol', entidadId: resultado.despues.id, detalle });
  res.json(resultado.despues);
});

router.delete('/:id', requirePermission('roles', 'ANULAR'), async (req, res) => {
  const rol = await roles.remove(req.params.id);
  if (!rol) throw notFound(NO_ENCONTRADO);
  await registrar(req, { accion: ACCION.ROL_BORRADO, entidad: 'rol', entidadId: rol.id, detalle: { nombre: rol.nombre, permisos: rol.permisos } });
  res.status(204).end();
});

router.put('/:id/permisos', requirePermission('roles', 'EDITAR'), validateBody(permisosSchema), async (req, res) => {
  if (!req.user.esSuperadmin) throw forbidden('Solo el superadministrador puede cambiar los permisos de un rol');
  const resultado = await roles.setPermisos(req.params.id, req.body.permisos);
  if (!resultado) throw notFound(NO_ENCONTRADO);
  const { antes, despues } = resultado;
  if (JSON.stringify(antes.permisos) !== JSON.stringify(despues.permisos)) {
    await registrar(req, {
      accion: ACCION.PERMISOS_CAMBIADOS,
      entidad: 'rol',
      entidadId: despues.id,
      detalle: { rol: despues.nombre, antes: antes.permisos, despues: despues.permisos },
    });
  }
  res.json(despues);
});

export default router;
