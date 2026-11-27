import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import morgan from 'morgan';
import { CLIENT_ORIGINS, FRONT_DIR, IS_PRODUCTION, TRUST_PROXY } from './config.js';
import { servirFront } from './front.js';
import { HttpError } from './errors.js';
import { checkOrigin } from './middlewares/origin.js';
import authRoutes from './auth/auth.routes.js';
import usersRoutes from './users/users.routes.js';
import rolesRoutes from './roles/roles.routes.js';
import pecuariaRoutes from './pecuaria/pecuaria.routes.js';
import asistenteRoutes from './asistente/asistente.routes.js';

const app = express();

// Detrás de un proxy, para que req.ip sea la IP real (límite por IP, auditoría).
if (TRUST_PROXY !== false) app.set('trust proxy', TRUST_PROXY);

// Encabezados de seguridad (y sin X-Powered-By). same-site: el front puede
// leer las respuestas si está en el mismo sitio que la API.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
// credentials: true deja que el navegador mande la cookie de sesión desde el front.
app.use(cors({ origin: CLIENT_ORIGINS, credentials: true }));
app.use(checkOrigin(CLIENT_ORIGINS));
// En producción, sin colores (en el panel de Render se ven como basura).
if (process.env.NODE_ENV !== 'test') app.use(morgan(IS_PRODUCTION ? 'short' : 'dev'));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Las respuestas de la API tienen datos personales: que nadie las guarde en caché.
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use('/api', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/pecuaria', pecuariaRoutes);
app.use('/api/asistente', asistenteRoutes);

// El front compilado, en la misma dirección (ver front.js). En desarrollo no
// hay client/dist y el front lo sirve Vite.
app.use(servirFront(FRONT_DIR).router);

app.use((req, res) => res.status(404).json({ errors: ['Ruta no encontrada'] }));

// Todas las respuestas de error tienen la forma { errors: string[] } (y a
// veces un `code` fijo para el front). Express 5 manda acá también los
// errores de los handlers async.
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ errors: ['El JSON enviado no es válido'] });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ errors: ['El archivo es demasiado grande'] });
  }
  if (error instanceof HttpError) {
    return res.status(error.status).json({ errors: [error.message], ...(error.code && { code: error.code }) });
  }
  console.error(error);
  res.status(500).json({ errors: ['Error interno. Probá de nuevo.'] });
});

export default app;
