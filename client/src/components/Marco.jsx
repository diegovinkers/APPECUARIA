import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { TODAS, useEstancia } from '../context/EstanciaContext';
import { menuPara } from '../navegacion/menu';
import HojaRegistrar from './HojaRegistrar';
import Icono from './Icono';

// El marco de la app (docs/DECISIONES.md §11):
// - arriba: logo, selector de estancia y, en la compu, Resumen · Potreros ·
//   Movimientos + "Registrar";
// - abajo, en el celular: Resumen · Potreros · + · Movimientos · Menú;
// - panel izquierdo: fijo en la compu (se achica a íconos); en el celular se
//   abre con la flechita del borde, con "Menú" o deslizando desde el borde.
// El lugar del asistente (✦) queda para el paso 7.
const ACHICADO = 'sapsa.panelAchicado';

function leerAchicado() {
  try {
    return localStorage.getItem(ACHICADO) === '1';
  } catch {
    return false;
  }
}

export function Logo({ className = 'h-8 w-8 text-lg' }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-lg bg-trigo-500 font-bold text-trigo-900 ${className}`} aria-hidden="true">
      S
    </span>
  );
}

export function SelectorEstancia() {
  const { campos, campoId, todas, campo, setCampoId } = useEstancia();
  if (!campos?.length) return null;
  if (campos.length === 1) {
    return <span className="truncate rounded-full bg-white/15 px-3 py-1 text-sm">{campo?.nombre}</span>;
  }
  return (
    <select
      value={todas ? TODAS : (campoId ?? '')}
      onChange={(e) => setCampoId(e.target.value === TODAS ? TODAS : Number(e.target.value))}
      aria-label="Estancia"
      className="max-w-[45vw] truncate rounded-full border-0 bg-white/15 px-3 py-1 text-sm text-white outline-none focus:ring-2 focus:ring-trigo-400 [&>option]:text-suelo-900"
    >
      <option value={TODAS}>Todas las estancias</option>
      {campos.map((c) => (
        <option key={c.id} value={c.id}>
          {c.nombre}
        </option>
      ))}
    </select>
  );
}

// Es activo si la dirección empieza con la ruta (o con `activoEn`).
const activo = (pathname, item) => pathname === item.ruta || pathname.startsWith(`${item.activoEn ?? item.ruta}/`) || pathname === item.activoEn;

export function ContenidoPanel({ menu, achicado = false, onCerrar, onSalir }) {
  const { pathname } = useLocation();
  const { campos, campo } = useEstancia();
  const { user } = useAuth();
  const fila = `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${achicado ? 'justify-center' : ''}`;

  return (
    <nav aria-label="Menú" className="flex h-full flex-col">
      {campos?.length === 1 && !achicado && (
        <div className="mb-2 rounded-lg bg-campo-100 px-3 py-2 text-campo-700">
          <p className="text-xs">Tu estancia</p>
          <p className="font-medium">{campo?.nombre}</p>
          {user?.roles?.length > 0 && <p className="text-xs">{user.roles.map((r) => r.nombre).join(', ')}</p>}
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        {menu.panel.map((g) => (
          <div key={g.grupo}>
            {!achicado && <p className="mb-1 mt-4 px-3 text-xs text-suelo-500">{g.grupo}</p>}
            {achicado && <hr className="my-2 border-suelo-200" />}
            {g.items.map((item) =>
              item.pronto ? (
                !achicado && (
                  <p key={item.clave} className={`${fila} text-suelo-400`}>
                    <Icono nombre={item.icono} />
                    {item.texto} · pronto
                  </p>
                )
              ) : (
                <Link
                  key={item.clave}
                  to={item.ruta}
                  onClick={onCerrar}
                  title={achicado ? item.texto : undefined}
                  aria-current={activo(pathname, item) ? 'page' : undefined}
                  className={`${fila} ${activo(pathname, item) ? 'bg-campo-100 font-medium text-campo-700' : 'text-suelo-700 hover:bg-suelo-200/70'}`}
                >
                  <Icono nombre={item.icono} />
                  {!achicado && item.texto}
                  {achicado && <span className="sr-only">{item.texto}</span>}
                </Link>
              ),
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 border-t border-suelo-200 pt-2">
        <Link
          to="/profile"
          onClick={onCerrar}
          title={achicado ? 'Mi perfil' : undefined}
          className={`${fila} ${pathname === '/profile' ? 'bg-campo-100 font-medium text-campo-700' : 'text-suelo-700 hover:bg-suelo-200/70'}`}
        >
          <Icono nombre="perfil" />
          {achicado ? <span className="sr-only">Mi perfil</span> : 'Mi perfil'}
        </Link>
        <button type="button" onClick={onSalir} title={achicado ? 'Salir' : undefined} className={`${fila} w-full text-red-700 hover:bg-red-50`}>
          <Icono nombre="salir" />
          {achicado ? <span className="sr-only">Salir</span> : 'Salir'}
        </button>
      </div>
    </nav>
  );
}

// Barra mínima: sin sesión o con la contraseña por cambiar (solo se puede salir).
function BarraSimple({ onSalir }) {
  return (
    <header className="flex items-center gap-2 bg-campo-600 px-4 py-3 text-white">
      <Logo />
      <span className="flex-1 text-lg font-semibold">SAPSA</span>
      {onSalir && (
        <button type="button" onClick={onSalir} className="rounded-md px-3 py-1.5 text-sm hover:bg-white/15">
          Salir
        </button>
      )}
    </header>
  );
}

export default function Marco() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [registrarAbierto, setRegistrarAbierto] = useState(false);
  const [achicado, setAchicado] = useState(leerAchicado);
  const conMenu = Boolean(user && !user.debeCambiarPassword);
  const menu = menuPara(user);

  async function salir() {
    setPanelAbierto(false);
    await logout();
    navigate('/login');
  }

  function alternarAchicado() {
    setAchicado((a) => {
      try {
        localStorage.setItem(ACHICADO, a ? '0' : '1');
      } catch {
        // Sin almacenamiento: vuelve a abrirse la próxima vez.
      }
      return !a;
    });
  }

  // Al cambiar de pantalla se cierran el panel y la hoja del "+".
  useEffect(() => {
    setPanelAbierto(false);
    setRegistrarAbierto(false);
  }, [location.pathname]);

  // Deslizar desde el borde izquierdo abre el panel (celular).
  useEffect(() => {
    if (!conMenu) return undefined;
    let inicio = null;
    const empieza = (e) => {
      const t = e.touches[0];
      inicio = t.clientX < 24 ? { x: t.clientX, y: t.clientY } : null;
    };
    const termina = (e) => {
      if (!inicio) return;
      const t = e.changedTouches[0];
      if (t.clientX - inicio.x > 60 && Math.abs(t.clientY - inicio.y) < 50) setPanelAbierto(true);
      inicio = null;
    };
    document.addEventListener('touchstart', empieza, { passive: true });
    document.addEventListener('touchend', termina, { passive: true });
    return () => {
      document.removeEventListener('touchstart', empieza);
      document.removeEventListener('touchend', termina);
    };
  }, [conMenu]);

  // Escape cierra lo que esté abierto.
  useEffect(() => {
    if (!panelAbierto) return undefined;
    const tecla = (e) => e.key === 'Escape' && setPanelAbierto(false);
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [panelAbierto]);

  if (!conMenu) {
    return (
      <>
        <BarraSimple onSalir={user ? salir : null} />
        <Outlet />
      </>
    );
  }

  const linkArriba = ({ isActive }) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-white/20 text-white' : 'text-campo-100 hover:bg-white/10 hover:text-white'}`;
  const linkAbajo = ({ isActive }) =>
    `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${isActive ? 'font-semibold text-campo-600' : 'text-suelo-500'}`;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 flex items-center gap-2 bg-campo-600 px-3 py-2.5 text-white lg:gap-3 lg:px-4">
        <Link to="/pecuaria/resumen" className="flex items-center gap-2">
          <Logo />
          <span className="text-lg font-semibold">SAPSA</span>
        </Link>
        <SelectorEstancia />
        <nav aria-label="Principal" className="ml-3 hidden items-center gap-1 lg:flex">
          {menu.principal.map((item) => (
            <NavLink key={item.clave} to={item.ruta} className={linkArriba}>
              {item.texto}
            </NavLink>
          ))}
        </nav>
        <span className="flex-1" />
        {menu.registrar.length > 0 && (
          <button
            type="button"
            onClick={() => setRegistrarAbierto(true)}
            className="hidden items-center gap-1 rounded-md bg-trigo-500 px-3 py-1.5 text-sm font-semibold text-trigo-900 hover:bg-trigo-400 lg:flex"
          >
            <Icono nombre="mas" className="h-4 w-4" /> Registrar
          </button>
        )}
        <Link to="/profile" className="hidden items-center gap-2 rounded-md px-2 py-1.5 text-sm text-campo-100 hover:bg-white/10 lg:flex">
          <Icono nombre="perfil" />
          {user.nombre}
        </Link>
      </header>

      <div className="lg:flex">
        <aside
          className={`sticky top-[52px] hidden h-[calc(100vh-52px)] shrink-0 border-r border-suelo-200 bg-white p-3 lg:block ${achicado ? 'w-16' : 'w-60'}`}
        >
          <div className="flex h-full flex-col">
            <button
              type="button"
              onClick={alternarAchicado}
              aria-label={achicado ? 'Agrandar el menú' : 'Achicar el menú'}
              className={`mb-1 flex rounded-md p-1.5 text-suelo-500 hover:bg-suelo-200/70 ${achicado ? 'self-center' : 'self-end'}`}
            >
              <Icono nombre={achicado ? 'agrandar' : 'achicar'} />
            </button>
            <div className="min-h-0 flex-1">
              <ContenidoPanel menu={menu} achicado={achicado} onSalir={salir} />
            </div>
          </div>
        </aside>
        <div className="min-w-0 flex-1 pb-24 lg:pb-0">
          <Outlet />
        </div>
      </div>

      {/* Celular: la flechita del borde, la barra de abajo y el panel. */}
      <button
        type="button"
        onClick={() => setPanelAbierto(true)}
        aria-label="Abrir el menú"
        className="fixed left-0 top-1/2 z-20 flex h-12 w-5 -translate-y-1/2 items-center justify-center rounded-r-lg bg-campo-600/90 text-white lg:hidden"
      >
        <Icono nombre="derecha" className="h-4 w-4" />
      </button>

      <nav
        aria-label="Barra de abajo"
        className="fixed inset-x-0 bottom-0 z-30 flex items-end border-t border-suelo-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {menu.principal.slice(0, 2).map((item) => (
          <NavLink key={item.clave} to={item.ruta} className={linkAbajo}>
            <Icono nombre={item.icono} className="h-6 w-6" />
            {item.texto}
          </NavLink>
        ))}
        {menu.registrar.length > 0 && (
          <div className="flex flex-1 justify-center">
            <button
              type="button"
              onClick={() => setRegistrarAbierto(true)}
              aria-label="Registrar"
              className="-mt-5 mb-1 flex h-14 w-14 items-center justify-center rounded-full bg-trigo-500 text-trigo-900 shadow-md ring-4 ring-white"
            >
              <Icono nombre="mas" className="h-7 w-7" />
            </button>
          </div>
        )}
        {menu.principal.slice(2).map((item) => (
          <NavLink key={item.clave} to={item.ruta} className={linkAbajo}>
            <Icono nombre={item.icono} className="h-6 w-6" />
            {item.texto === 'Movimientos' ? 'Movim.' : item.texto}
          </NavLink>
        ))}
        <button type="button" onClick={() => setPanelAbierto(true)} className={linkAbajo({ isActive: false })}>
          <Icono nombre="menu" className="h-6 w-6" />
          Menú
        </button>
      </nav>

      {panelAbierto && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Cerrar el menú" onClick={() => setPanelAbierto(false)} className="absolute inset-0 bg-black/40" />
          <div role="dialog" aria-label="Menú" className="absolute inset-y-0 left-0 flex w-[80%] max-w-xs flex-col bg-white p-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <div className="mb-2 flex items-center gap-2">
              <Logo />
              <span className="flex-1 text-lg font-semibold">SAPSA</span>
              <button type="button" onClick={() => setPanelAbierto(false)} aria-label="Cerrar" className="rounded-md p-1.5 text-suelo-600 hover:bg-suelo-200/70">
                <Icono nombre="cerrar" className="h-6 w-6" />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <ContenidoPanel menu={menu} onCerrar={() => setPanelAbierto(false)} onSalir={salir} />
            </div>
          </div>
        </div>
      )}

      {registrarAbierto && <HojaRegistrar acciones={menu.registrar} onCerrar={() => setRegistrarAbierto(false)} />}
    </div>
  );
}
