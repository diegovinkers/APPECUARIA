// Errores que el manejador de app.js convierte en { errors: [mensaje] }
// con el status indicado. Se pueden lanzar desde cualquier capa.
// `code` es opcional: un identificador fijo para que el front reaccione
// (por ejemplo DEBE_CAMBIAR_PASSWORD) sin depender del texto.
export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message) => new HttpError(400, message);
export const unauthorized = (message, code) => new HttpError(401, message, code);
export const forbidden = (message, code) => new HttpError(403, message, code);
export const notFound = (message) => new HttpError(404, message);
export const conflict = (message) => new HttpError(409, message);
export const tooManyRequests = (message, code) => new HttpError(429, message, code);

// Los ids de la base son enteros. Algo que no lo sea ("abc", "1.5", "-3",
// o más grande que un INTEGER de PostgreSQL) no puede existir: null.
export function parseId(value) {
  if (!/^\d{1,10}$/.test(String(value))) return null;
  const id = Number(value);
  return id > 0 && id <= 2_147_483_647 ? id : null;
}
