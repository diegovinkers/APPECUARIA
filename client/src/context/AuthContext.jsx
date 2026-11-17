import { createContext, useContext, useEffect, useState } from 'react';
import api, { getErrorMessages } from '../api/axios';
import { changePasswordRequest, loginRequest, logoutRequest, verifyRequest } from '../api/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState([]);
  // Aviso para la pantalla de login, por ejemplo "Tu sesión venció".
  const [notice, setNotice] = useState(null);

  // Respuestas de la API que cambian la sesión, vengan de la pantalla que vengan:
  // - 401 (sesión vencida o cerrada, usuario desactivado): se cierra la sesión
  //   local y las rutas protegidas mandan al login.
  // - 403 DEBE_CAMBIAR_PASSWORD: las rutas mandan a cambiar la contraseña.
  // Tiene que ir antes que el efecto del /verify: axios solo aplica los
  // interceptores que ya existían cuando salió cada request.
  useEffect(() => {
    const id = api.interceptors.response.use(undefined, (error) => {
      const { status, data } = error.response ?? {};
      if (status === 401) {
        setUser(null);
        if (data?.code === 'SESION_VENCIDA') setNotice(data.errors[0]);
      } else if (status === 403 && data?.code === 'DEBE_CAMBIAR_PASSWORD') {
        setUser((current) => current && { ...current, debeCambiarPassword: true });
      }
      return Promise.reject(error);
    });
    return () => api.interceptors.response.eject(id);
  }, []);

  // Al abrir la app: si hay una cookie de sesión válida, recupera el usuario.
  useEffect(() => {
    verifyRequest()
      .then((res) => setUser(res.data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (errors.length === 0) return;
    const timer = setTimeout(() => setErrors([]), 8000);
    return () => clearTimeout(timer);
  }, [errors]);

  // Devuelve el usuario si salió bien, o null (y deja los mensajes en errors).
  async function signin(data) {
    try {
      const res = await loginRequest(data);
      setUser(res.data);
      setErrors([]);
      setNotice(null);
      return res.data;
    } catch (error) {
      setErrors(getErrorMessages(error, 'No se pudo iniciar sesión. ¿Está levantada la API?'));
      return null;
    }
  }

  async function logout() {
    try {
      await logoutRequest();
    } catch {
      // La sesión local se cierra igual.
    }
    setUser(null);
    setNotice(null);
  }

  // Cambia la propia contraseña. Si falla, lanza el error para que la
  // pantalla muestre los mensajes.
  async function changePassword(data) {
    try {
      const res = await changePasswordRequest(data);
      setUser(res.data);
    } catch (error) {
      // Demasiados intentos con la contraseña actual: la API bloqueó la
      // cuenta y cerró la sesión.
      if (error.response?.data?.code === 'USUARIO_BLOQUEADO') {
        setUser(null);
        setNotice(error.response.data.errors[0]);
      }
      throw error;
    }
  }

  const value = { user, isAuthenticated: Boolean(user), loading, errors, notice, signin, logout, changePassword };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return context;
}
