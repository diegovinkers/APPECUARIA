import { Router } from 'express';
import * as roles from './roles.repository.js';
import { authRequired, requireSuperadmin } from '../auth/auth.middleware.js';

const router = Router();

// TEMPORAL (fase 2): solo lectura y solo superadmin. El ABM de roles y la
// matriz de permisos llegan en la fase 4.
router.use(authRequired, requireSuperadmin);

router.get('/', async (req, res) => res.json(await roles.list()));

export default router;
