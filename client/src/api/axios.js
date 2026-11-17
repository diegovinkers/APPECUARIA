import axios from 'axios';

// La API siempre está en la misma dirección que el front, bajo /api: en
// producción la sirve el mismo Express, y en desarrollo Vite le pasa las
// requests a la API (ver vite.config.js). Tiene que ser así porque la cookie
// de sesión es SameSite=Strict.
// withCredentials: el navegador manda la cookie de sesión en cada request.
const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

export default api;

// La API siempre responde los errores como { errors: string[] }.
export function getErrorMessages(error, fallback) {
  const errors = error?.response?.data?.errors;
  return Array.isArray(errors) && errors.length > 0 ? errors : [fallback];
}
