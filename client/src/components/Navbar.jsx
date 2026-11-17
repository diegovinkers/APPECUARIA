import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const linkClass = ({ isActive }) =>
  `rounded-md px-3 py-2 text-sm font-medium transition ${
    isActive ? 'bg-sky-600 text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
  }`;

// Barra superior provisoria. En la fase 5 se reemplaza por el menú lateral
// armado con los módulos que el usuario puede ver.
export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <nav className="border-b border-zinc-800 bg-zinc-950 px-4 py-3">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <Link to="/" className="text-xl font-bold">
          SAPSA
        </Link>
        <div className="flex flex-wrap items-center gap-1">
          {user ? (
            <>
              {/* Con el cambio de contraseña pendiente solo se puede salir. */}
              {!user.debeCambiarPassword && (
                <NavLink to="/pecuaria" className={linkClass}>
                  Pecuaria
                </NavLink>
              )}
              {!user.debeCambiarPassword && (
                <NavLink to="/profile" className={linkClass}>
                  Mi perfil
                </NavLink>
              )}
              {user.esSuperadmin && !user.debeCambiarPassword && (
                <NavLink to="/users" className={linkClass}>
                  Usuarios
                </NavLink>
              )}
              <button
                type="button"
                onClick={handleLogout}
                className="ml-2 rounded-md border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-300 transition hover:border-red-400 hover:text-red-300"
              >
                Salir
              </button>
            </>
          ) : (
            <NavLink to="/login" className={linkClass}>
              Ingresar
            </NavLink>
          )}
        </div>
      </div>
    </nav>
  );
}
