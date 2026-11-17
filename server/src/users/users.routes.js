import { Router } from 'express';
import { createUser, listUsers, resetUserPassword, setUserRoles, setUserStatus, unlockUser } from './users.controller.js';
import { createUserSchema, estadoSchema, resetPasswordSchema, setRolesSchema } from './users.schema.js';
import { authRequired, requireSuperadmin } from '../auth/auth.middleware.js';
import { validateBody } from '../middlewares/validate.js';

const router = Router();

// TEMPORAL (fases 2 y 3): todo el router es solo del superadmin.
// En la fase 4 cada ruta declara su permiso (usuarios: VER, CREAR, EDITAR...).
router.use(authRequired, requireSuperadmin);

router.get('/', listUsers);
router.post('/', validateBody(createUserSchema), createUser);
router.put('/:id/roles', validateBody(setRolesSchema), setUserRoles);
router.patch('/:id/estado', validateBody(estadoSchema), setUserStatus);
router.put('/:id/password', validateBody(resetPasswordSchema), resetUserPassword);
router.post('/:id/desbloquear', unlockUser);

export default router;
