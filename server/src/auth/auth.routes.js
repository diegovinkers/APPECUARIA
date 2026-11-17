import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { changePassword, login, logout, me } from './auth.controller.js';
import { authAllowPendingPassword } from './auth.middleware.js';
import { changePasswordSchema, loginSchema } from './auth.schema.js';
import { validateBody } from '../middlewares/validate.js';
import { LOGIN } from '../config.js';

const router = Router();

// Límite por IP de logins fallidos (los correctos no cuentan). Complementa el
// bloqueo por cuenta: frena a quien prueba muchos usuarios distintos.
// Ojo: detrás de un proxy hay que configurar TRUST_PROXY, si no todos los
// usuarios comparten la IP del proxy.
const loginLimiter = rateLimit({
  windowMs: LOGIN.ventanaIpMs,
  limit: LOGIN.maxFallosPorIp,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).json({
      errors: ['Demasiados intentos fallidos desde esta conexión. Esperá unos minutos y probá de nuevo.'],
      code: 'DEMASIADOS_INTENTOS',
    }),
});

// Sin /register: los usuarios los crea un administrador (POST /api/users).
router.post('/login', loginLimiter, validateBody(loginSchema), login);
router.post('/logout', logout);
router.get('/verify', authAllowPendingPassword, me);
router.put('/password', authAllowPendingPassword, validateBody(changePasswordSchema), changePassword);

export default router;
