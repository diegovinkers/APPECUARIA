// El asistente usa las MISMAS rutas que las pantallas, con la cookie de la
// persona que le habla. Así pasa por lo mismo que una pantalla: la sesión,
// los permisos (requirePermission), el alcance por estancia (alcance.js) y la
// validación. No hay otra puerta.
//
// Cómo: la app escucha también en 127.0.0.1, en un puerto que elige el
// sistema (solo se puede usar desde el mismo servidor, no desde afuera), y el
// asistente le pide ahí. Se probó light-my-request (pedidos sin red), pero con
// Express cambia el prototipo de TODAS las requests de la app: descartado.
import http from 'node:http';

const servidores = new WeakMap();

// La dirección local de la app (se abre la primera vez que hace falta).
function direccion(app) {
  if (!servidores.has(app)) {
    servidores.set(
      app,
      new Promise((resolve, reject) => {
        const servidor = http.createServer(app);
        servidor.on('error', reject);
        servidor.listen(0, '127.0.0.1', () => {
          // No retiene el proceso (los tests y el apagado terminan igual).
          servidor.unref();
          resolve(`http://127.0.0.1:${servidor.address().port}`);
        });
      }),
    );
  }
  return servidores.get(app);
}

/**
 * @param {{ app, cookie: string, ip?: string }} ctx la app de Express, la cookie
 *   de la request y la IP de la persona (va en X-Forwarded-For y en X-Real-IP,
 *   que es la que lee Railway: así la auditoría guarda la IP real y no 127.0.0.1).
 * @param {{ ruta: string, query?: object, metodo?: string, cuerpo?: object, cabeceras?: object }} pedido
 *   ruta bajo /api/pecuaria. Sin `metodo`, GET.
 * @returns {Promise<{ estado: number, datos: any }>}
 */
export async function llamarApi(ctx, { ruta, query, metodo = 'GET', cuerpo, cabeceras }) {
  const params = new URLSearchParams(
    Object.entries(query ?? {})
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => [k, String(v)]),
  ).toString();
  const headers = { cookie: ctx.cookie ?? '', ...(ctx.ip && { 'x-forwarded-for': ctx.ip, 'x-real-ip': ctx.ip }), ...cabeceras };
  if (cuerpo !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(`${await direccion(ctx.app)}/api/pecuaria${ruta}${params ? `?${params}` : ''}`, {
    method: metodo,
    headers,
    ...(cuerpo !== undefined && { body: JSON.stringify(cuerpo) }),
    signal: AbortSignal.timeout(metodo === 'GET' ? 30_000 : 90_000),
  });
  let datos = null;
  try {
    datos = await r.json();
  } catch {
    // Sin JSON: queda null.
  }
  return { estado: r.status, datos };
}

// Para las herramientas: los datos, o un Error con el mensaje de la API
// (por ejemplo "Potrero no encontrado" o "No tenés permiso para esto").
export async function pedir(ctx, pedido) {
  const { estado, datos } = await llamarApi(ctx, pedido);
  if (estado >= 400) {
    const error = new Error(datos?.errors?.[0] ?? `La app contestó ${estado}`);
    error.estado = estado;
    throw error;
  }
  return datos;
}
