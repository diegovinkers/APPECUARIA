import { Router } from 'express';
import {
  createUser,
  listEstancias,
  listUsers,
  resetUserPassword,
  setUserEstancias,
  setUserRoles,
  setUserStatus,
  unlockUser,
} from './users.controller.js';
import { createUserSchema, estadoSchema, resetPasswordSchema, setEstanciasSchema, setRolesSchema } from './users.schema.js';
import { authRequired } from '../auth/auth.middleware.js';
import { requirePermission } from '../auth/permisos.js';
import { validateBody } from '../middlewares/validate.js';

const router = Router();

// Cada ruta declara su permiso (DECISIONES §3): VER listar, CREAR dar de alta,
// EDITAR roles, estancias, contraseña y desbloqueo, ANULAR activar/desactivar.
// El superadmin pasa siempre; las reglas finas (nadie se cambia a sí mismo,
// solo el superadmin asigna roles de administración) están en el controlador.
router.use(authRequired);

router.get('/', requirePermission('usuarios', 'VER'), listUsers);
// Para elegir las estancias de cada usuario (sin necesitar permisos de Pecuaria).
router.get('/estancias', requirePermission('usuarios', 'VER'), listEstancias);
router.post('/', requirePermission('usuarios', 'CREAR'), validateBody(createUserSchema), createUser);
router.put('/:id/roles', requirePermission('usuarios', 'EDITAR'), validateBody(setRolesSchema), setUserRoles);
router.put('/:id/estancias', requirePermission('usuarios', 'EDITAR'), validateBody(setEstanciasSchema), setUserEstancias);
router.patch('/:id/estado', requirePermission('usuarios', 'ANULAR'), validateBody(estadoSchema), setUserStatus);
router.put('/:id/password', requirePermission('usuarios', 'EDITAR'), validateBody(resetPasswordSchema), resetUserPassword);
router.post('/:id/desbloquear', requirePermission('usuarios', 'EDITAR'), unlockUser);

export default router;
