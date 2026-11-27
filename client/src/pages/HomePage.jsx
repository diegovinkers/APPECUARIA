import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { CAMBIAR_PASSWORD } from '../components/ProtectedRoute';
import { inicioPara } from '../navegacion/menu';
import { EsqueletoFicha } from '../components/Esqueleto';

// "/" no tiene pantalla propia: con sesión va a la primera pantalla que puede
// usar, casi siempre el Resumen (con el aviso que traiga, por ejemplo
// "cambiaste tu contraseña"); sin sesión, al login.
export default function HomePage() {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Mientras se revisa la sesión (al abrir la app), la forma de una pantalla (27/11).
  if (loading)
    return (
      <div className="mx-auto max-w-3xl p-4">
        <EsqueletoFicha testId="esqueleto-sesion" />
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  if (user.debeCambiarPassword) return <Navigate to={CAMBIAR_PASSWORD} replace />;
  return <Navigate to={inicioPara(user)} replace state={location.state} />;
}
