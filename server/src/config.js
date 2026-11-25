// Configuración central, leída y validada al importar (index.js carga .env
// antes). Si un valor está mal, la API no arranca y dice cuál.
// DATABASE_URL la lee src/db.js (así el seed no necesita el resto).
import path from 'node:path';
import { z } from 'zod';

// La carpeta server/, para resolver rutas relativas sin depender de desde
// dónde se arranque la API.
const SERVER_DIR = path.resolve(import.meta.dirname, '..');

// Número entero con valor por defecto. "" o ausente = valor por defecto.
const entero = (porDefecto, min, max) =>
  z.preprocess(
    (value) => (value === undefined || value === '' ? undefined : Number(value)),
    z
      .int({ error: `tiene que ser un número entero entre ${min} y ${max}` })
      .min(min, `mínimo ${min}`)
      .max(max, `máximo ${max}`)
      .default(porDefecto),
  );

const schema = z.object({
  NODE_ENV: z.string().optional(),
  PORT: entero(4000, 1, 65535),
  // Origen (o varios, separados por coma) desde donde se usa la app.
  // Vacío o ausente = la dirección que pone Render (RENDER_EXTERNAL_URL) o,
  // si no estamos en Render, http://localhost:5173.
  CLIENT_URL: z
    .string()
    .optional()
    .transform((value) =>
      (value?.trim() ? value : process.env.RENDER_EXTERNAL_URL?.trim() || 'http://localhost:5173')
        .split(',')
        .map((url) => url.trim().replace(/\/$/, ''))
        .filter(Boolean),
    )
    .refine((origins) => origins.length > 0, 'tiene que tener al menos una dirección (por ejemplo http://localhost:5173)'),
  // Detrás de un proxy (IIS, nginx...): cuántos saltos creer en X-Forwarded-For
  // para saber la IP real. Vacío = no hay proxy.
  TRUST_PROXY: z
    .string()
    .optional()
    .transform((value) => (!value || value === 'false' ? false : /^\d+$/.test(value) ? Number(value) : value)),
  // Carpeta del front compilado (npm run build en client/). Si no tiene un
  // index.html, la API no sirve el front (como en desarrollo, con Vite).
  FRONT_DIR: z
    .string()
    .optional()
    .transform((value) => path.resolve(SERVER_DIR, value?.trim() || '../client/dist')),

  SESION_INACTIVIDAD_MINUTOS: entero(30, 1, 24 * 60),
  SESION_MAXIMA_HORAS: entero(8, 1, 24 * 7),
  LOGIN_MAX_INTENTOS: entero(5, 1, 100),
  LOGIN_BLOQUEO_MINUTOS: entero(15, 1, 24 * 60),
  LOGIN_MAX_FALLOS_POR_IP: entero(100, 1, 100_000),

  // Precios de INAC (docs/PRECIOS_INAC.md). El token lo manda GitHub Actions
  // para disparar la importación semanal; vacío = esa ruta no anda.
  PRECIOS_TOKEN: z
    .string()
    .optional()
    .transform((value) => value?.trim() || null)
    .refine((value) => value == null || value.length >= 32, 'tiene que tener al menos 32 caracteres'),
  // Opcional: un contacto para la identificación con que se bajan los archivos de INAC.
  PRECIOS_CONTACTO: z
    .string()
    .optional()
    .transform((value) => value?.trim() || null),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const detalle = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);
  throw new Error(['Configuración inválida (revisá .env):', ...detalle].join('\n'));
}
const env = parsed.data;

export const IS_PRODUCTION = env.NODE_ENV === 'production';
export const PORT = env.PORT;
export const CLIENT_ORIGINS = env.CLIENT_URL;
export const TRUST_PROXY = env.TRUST_PROXY;
export const FRONT_DIR = env.FRONT_DIR;

const MINUTO = 60 * 1000;

export const SESION = {
  inactividadMs: env.SESION_INACTIVIDAD_MINUTOS * MINUTO,
  maximaMs: env.SESION_MAXIMA_HORAS * 60 * MINUTO,
  // ultimo_uso se guarda como mucho una vez por minuto, no en cada request.
  actualizarUsoCadaMs: MINUTO,
};

export const LOGIN = {
  maxIntentos: env.LOGIN_MAX_INTENTOS,
  bloqueoMs: env.LOGIN_BLOQUEO_MINUTOS * MINUTO,
  maxFallosPorIp: env.LOGIN_MAX_FALLOS_POR_IP,
  ventanaIpMs: 15 * MINUTO,
};

// En producción el prefijo __Host- obliga a HTTPS y a que la cookie sea solo
// de este dominio: ningún subdominio la puede pisar.
export const PRECIOS = {
  token: env.PRECIOS_TOKEN,
  contacto: env.PRECIOS_CONTACTO,
};

export const COOKIE_NAME = IS_PRODUCTION ? '__Host-sapsa_sesion' : 'sapsa_sesion';
