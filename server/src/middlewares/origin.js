// Segunda barrera contra CSRF (la primera es la cookie SameSite=Strict):
// las requests que cambian algo (POST, PUT, PATCH, DELETE) que traen el
// encabezado Origin tienen que venir del front de la app.
// Los navegadores siempre mandan Origin en esas requests; si falta, no es un
// navegador (curl, tests, otro servidor) y no hay cookie ajena que abusar.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const checkOrigin = (allowedOrigins) => (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.get('origin');
  if (origin && !allowedOrigins.includes(origin)) {
    return res.status(403).json({ errors: ['Origen no permitido'] });
  }
  next();
};
