import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const CAMBIAR_PASSWORD = '/cambiar-password';

// Sin sesión → al login (y vuelve a esta página después de entrar).
// Con la contraseña puesta por un administrador → a cambiarla, antes que nada.
// Con `superadmin`, además exige el indicador de superadmin (TEMPORAL: en la
// fase 5 se reemplaza por permisos por módulo).
// Es solo comodidad visual: quien protege los datos es la API.
export default function ProtectedRoute({ superadmin = false }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <p className="p-6 text-suelo-600">Cargando...</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (user.debeCambiarPassword && location.pathname !== CAMBIAR_PASSWORD) {
    return <Navigate to={CAMBIAR_PASSWORD} replace />;
  }
  if (superadmin && !user.esSuperadmin) return <Navigate to="/" replace />;

  return <Outlet />;
}
