// Sirve el front compilado (client/dist) desde la misma dirección que la API.
// Tiene que ser así: la cookie de sesión es SameSite=Strict, y el front y la
// API en dos sitios distintos (por ejemplo dos subdominios de onrender.com)
// harían que el navegador no la mande.
//
// - Los archivos de /assets llevan una huella en el nombre: se guardan un año.
// - index.html no se guarda nunca, para que una versión nueva se vea enseguida.
// - Cualquier otra ruta GET que no sea de la API ni un archivo (/pecuaria,
//   /usuarios/3...) devuelve index.html: las rutas las resuelve React Router.
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';

const UN_ANIO_S = 365 * 24 * 60 * 60;

export function servirFront(dir) {
  const router = express.Router();
  const indexHtml = dir && path.join(dir, 'index.html');
  if (!indexHtml || !fs.existsSync(indexHtml)) return { router, activo: false };

  router.use(
    express.static(dir, {
      index: false,
      setHeaders(res, archivo) {
        const enAssets = path.relative(dir, archivo).split(path.sep)[0] === 'assets';
        res.set('Cache-Control', enAssets ? `public, max-age=${UN_ANIO_S}, immutable` : 'no-cache');
      },
    }),
  );

  router.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path === '/api' || req.path.startsWith('/api/')) return next();
    // Un archivo que no existe (/logo.png, /assets/viejo.js) es un 404, no la app.
    if (path.extname(req.path)) return next();
    res.set('Cache-Control', 'no-cache');
    res.sendFile(indexHtml);
  });

  return { router, activo: true };
}
