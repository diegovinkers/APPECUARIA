import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { CAMBIAR_PASSWORD } from '../components/ProtectedRoute';
import { inicioPara } from '../navegacion/menu';

// "/" no tiene pantalla propia: con sesión va a la primera pantalla que puede
// usar, casi siempre el Resumen (con el aviso que traiga, por ejemplo
// "cambiaste tu contraseña"); sin sesión, al login.
export default function HomePage() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <p className="p-6 text-suelo-600">Cargando...</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.debeCambiarPassword) return <Navigate to={CAMBIAR_PASSWORD} replace />;
  return <Navigate to={inicioPara(user)} replace state={location.state} />;
}
