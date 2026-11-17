import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { CAMBIAR_PASSWORD } from '../components/ProtectedRoute';
import { Notice } from '../components/ui';

export default function HomePage() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <p className="p-6 text-zinc-400">Cargando...</p>;
  if (user?.debeCambiarPassword) return <Navigate to={CAMBIAR_PASSWORD} replace />;

  return (
    <main className="mx-auto max-w-5xl px-4 py-16">
      {user ? (
        <>
          <Notice tone="ok">{location.state?.aviso}</Notice>
          <h1 className="text-3xl font-bold">Hola, {user.nombre}</h1>
          <p className="mt-2 text-zinc-400">
            {user.esSuperadmin
              ? 'Entraste como superadministrador.'
              : user.roles.length > 0
                ? `Tus roles: ${user.roles.map((r) => r.nombre).join(', ')}.`
                : 'Todavía no tenés roles asignados. Pedíselos a un administrador.'}
          </p>
        </>
      ) : (
        <>
          <h1 className="text-3xl font-bold">Bienvenido</h1>
          <p className="mt-2 text-zinc-400">
            <Link to="/login" className="text-sky-400 hover:underline">
              Iniciá sesión
            </Link>{' '}
            para continuar.
          </p>
        </>
      )}
    </main>
  );
}
