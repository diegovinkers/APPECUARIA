import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEstancia } from '../context/EstanciaContext';
import { useTema } from '../context/TemaContext';
import { FEEDLOTS, TODAS, separarGrupos } from '../navegacion/grupos';
import { menuPara, puede } from '../navegacion/menu';
import HojaRegistrar from './HojaRegistrar';
import { DestinoFiltros, PanelFiltrosProvider, usePanelFiltros } from './PanelFiltros';
import Icono from './Icono';
import PanelAsistente, { BotonAsistente } from './PanelAsistente';
import useTirarParaActualizar from '../hooks/useTirarParaActualizar';
import useTeclado from '../hooks/useTeclado';

// El marco de la app (docs/DECISIONES.md §11; cambio de Diego del 19/11):
// - arriba: logo, selector de estancia, en la compu Resumen · Potreros ·
//   Movimientos + "Registrar", y el botón ☰ que despliega el menú (secciones,
//   perfil, salir);
// - abajo, en el celular: Resumen · Potreros · + · Registro · Procesos (23/11:
//   Procesos va donde estaba "Eventos"; el menú sigue en el ☰ de arriba, y
//   quien no registra, sin "+", ve además "Menú"). Desde el 24/11 el "+"
//   tiene todo: Movimientos y Eventos (HojaRegistrar);
// - panel izquierdo: los filtros de la pantalla donde estás (PanelFiltros).
//   En la compu, fijo; en el celular, se abre con la flechita del borde, con
//   el botón "Filtros" o deslizando desde el borde. Sin filtros, no aparece.
// El lugar del asistente (✦) queda para el paso 7.

// El logo de SAPSA (barras verdes + letras blancas, para la barra verde).
export function Logo({ className = 'h-7 w-auto' }) {
  return <img src="/logo-pecuaria.png" alt="Pecuaria" className={`shrink-0 ${className}`} />;
}

// La marca de la barra de arriba (27/11, pedido de Diego): el logo de
// Pecuaria (la vaca en el hexágono) en un cuadradito blanco (el logo tiene
// fondo blanco y gris oscuro: sobre el verde no se vería) y, al lado, SAPSA
// con PECUARIA debajo en letra chica.
export function Marca() {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <Logo className="h-8 w-8 rounded-lg bg-white p-0.5 lg:h-9 lg:w-9" />
      <span className="flex flex-col items-start leading-none">
        <span className="text-sm font-bold tracking-[0.08em] text-white">SAPSA</span>
        <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-white/75">Pecuaria</span>
      </span>
    </span>
  );
}

// Dos grupos (feedlots, 19/11): Estancias y Feedlots, cada uno con su
// "Todas / Todos" (si tiene más de un campo) y sus campos. Si el usuario no
// tiene feedlots, la lista es la de siempre, sin grupos.
export function SelectorEstancia() {
  const { campos, campoId, todas, campo, grupo, setCampoId } = useEstancia();
  if (!campos?.length) return null;
  if (campos.length === 1) {
    return <span className="truncate rounded-full bg-white/15 px-3 py-1 text-sm">{campo?.nombre}</span>;
  }
  const { estancias, feedlots } = separarGrupos(campos);
  const opciones = (lista, todos, texto) => (
    <>
      {lista.length > 1 && <option value={todos}>{texto}</option>}
      {lista.map((c) => (
        <option key={c.id} value={c.id}>
          {c.nombre}
        </option>
      ))}
    </>
  );
  const valor = todas ? (grupo === 'feedlots' ? FEEDLOTS : TODAS) : (campoId ?? '');
  return (
    <select
      value={valor}
      onChange={(e) => setCampoId([TODAS, FEEDLOTS].includes(e.target.value) ? e.target.value : Number(e.target.value))}
      aria-label="Estancia"
      className="min-w-0 max-w-[45vw] truncate rounded-full border-0 bg-white/15 px-3 py-1 text-sm text-white outline-none focus:ring-2 focus:ring-trigo-400 [&_option]:text-suelo-900 [&_optgroup]:text-suelo-900"
    >
      {feedlots.length === 0 ? (
        opciones(estancias, TODAS, 'Todas las estancias')
      ) : (
        <>
          {estancias.length > 0 && <optgroup label="Estancias">{opciones(estancias, TODAS, 'Todas las estancias')}</optgroup>}
          <optgroup label="Feedlots">{opciones(feedlots, FEEDLOTS, 'Todos los feedlots')}</optgroup>
        </>
      )}
    </select>
  );
}

// Claro / Oscuro / Automático (23/11): se guarda en este celular o compu.
const OPCIONES_TEMA = [
  ['claro', 'Claro'],
  ['oscuro', 'Oscuro'],
  ['auto', 'Automático'],
];

export function SelectorTema() {
  const { preferencia, elegir } = useTema();
  return (
    <div className="px-3 pb-2 pt-1">
      <p id="titulo-tema" className="mb-1 text-xs text-suelo-500">
        Pantalla
      </p>
      <div role="radiogroup" aria-labelledby="titulo-tema" className="grid grid-cols-3 gap-1 rounded-lg bg-suelo-200/70 p-1">
        {OPCIONES_TEMA.map(([valor, texto]) => (
          <button
            key={valor}
            type="button"
            role="radio"
            aria-checked={preferencia === valor}
            onClick={() => elegir(valor)}
            className={`rounded-md px-2 py-1.5 text-xs font-medium ${
              preferencia === valor ? 'bg-superficie text-campo-700 shadow-sm' : 'text-suelo-600 hover:text-suelo-900'
            }`}
          >
            {texto}
          </button>
        ))}
      </div>
    </div>
  );
}

// El botón de la barra de arriba, solo en el celular (24/11, pedido de
// Diego): pasa de claro a oscuro y al revés. El ícono dice cómo está la
// pantalla (sol = claro, luna = oscuro). "Automático" queda en el menú ☰.
export function BotonTema() {
  const { tema, elegir } = useTema();
  const oscuro = tema === 'oscuro';
  return (
    <button
      type="button"
      onClick={() => elegir(oscuro ? 'claro' : 'oscuro')}
      aria-label={oscuro ? 'Pantalla oscura: pasar a clara' : 'Pantalla clara: pasar a oscura'}
      title={oscuro ? 'Pasar a pantalla clara' : 'Pasar a pantalla oscura'}
      className="flex h-9 w-8 shrink-0 items-center justify-center rounded-md text-white/90 hover:bg-white/15 lg:hidden"
      data-testid="boton-tema"
    >
      <Icono nombre={oscuro ? 'luna' : 'sol'} className="h-5 w-5" />
    </button>
  );
}

// Las iniciales del usuario (27/11): la primera letra de las dos primeras
// palabras del nombre ("Encargado Ejemplo" → "EE"); con una sola palabra, sus
// dos primeras letras; sin nombre, las del usuario.
export function iniciales(user) {
  const palabras = String(user?.nombre || user?.usuario || '')
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (!palabras.length) return '?';
  const letras = palabras.length > 1 ? palabras[0][0] + palabras[1][0] : palabras[0].slice(0, 2);
  return letras.toLocaleUpperCase('es');
}

// El círculo con las iniciales, en la barra de arriba entre el tema y el ☰
// (pedido de Diego, 27/11). Lleva a "Mi perfil".
export function AvatarUsuario({ user }) {
  return (
    <Link
      to="/profile"
      aria-label={`Mi perfil (${user.nombre || user.usuario})`}
      title={user.nombre || user.usuario}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-trigo-500 text-xs font-bold tracking-wide text-trigo-900 ring-2 ring-white/25 hover:bg-trigo-400"
      data-testid="avatar-usuario"
    >
      {iniciales(user)}
    </Link>
  );
}

// La ruedita de tirar para actualizar (27/11): baja con el dedo, gira según
// cuánto falta y, pasado el umbral, se pone verde; mientras actualiza, gira sola.
export function RuedaActualizar({ distancia, listo, actualizando }) {
  if (!distancia && !actualizando) return null;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center"
      style={{ transform: `translateY(${Math.max(8, distancia - 28)}px)` }}
      data-testid="rueda-actualizar"
    >
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-full bg-superficie shadow-md ring-1 ring-suelo-200 ${listo || actualizando ? 'text-campo-600' : 'text-suelo-400'}`}
      >
        <span className={`flex ${actualizando ? 'motion-safe:animate-spin' : ''}`} style={actualizando ? undefined : { transform: `rotate(${distancia * 3}deg)` }}>
          <Icono nombre="actualizar" className="h-5 w-5" />
        </span>
      </span>
      <span role="status" className="sr-only">
        {actualizando ? 'Actualizando…' : listo ? 'Soltá para actualizar' : ''}
      </span>
    </div>
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
        {!achicado && <SelectorTema />}
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
    <header className="flex items-center gap-2 bg-barra px-4 py-3 text-white">
      <Marca />
      <span className="flex-1" />
      {onSalir && (
        <button type="button" onClick={onSalir} className="rounded-md px-3 py-1.5 text-sm hover:bg-white/15">
          Salir
        </button>
      )}
    </header>
  );
}

export default function Marco() {
  return (
    <PanelFiltrosProvider>
      <MarcoInterno />
    </PanelFiltrosProvider>
  );
}

// El "+" sabe dónde estás (24/11): desde la ficha de un potrero o de un lote,
// los eventos arrancan con eso elegido; desde Historial → Eventos, abre en
// Eventos.
export function contextoDe(pathname) {
  const potrero = pathname.match(/^\/pecuaria\/potreros\/(\d+)/);
  if (potrero) return { potrero: Number(potrero[1]) };
  const lote = pathname.match(/^\/pecuaria\/lotes\/(\d+)/);
  if (lote) return { lote: Number(lote[1]) };
  return {};
}
export function vistaInicial({ pathname, search }) {
  return pathname === '/pecuaria/historial' && new URLSearchParams(search).get('ver') === 'eventos' ? 'eventos' : 'mover';
}

function MarcoInterno() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const filtros = usePanelFiltros();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [registrarAbierto, setRegistrarAbierto] = useState(false);
  // El asistente (27/11): cajón de la derecha, con el botón IA de arriba.
  const [asistenteAbierto, setAsistenteAbierto] = useState(false);
  // Celular acostado: las barras de arriba y de abajo se esconden; el botón
  // flotante las trae y tocar la pantalla (o cambiar de página) las esconde.
  const [barras, setBarras] = useState(false);
  const contenido = useRef(null);
  // Tirar para actualizar (27/11): la caja del contenido (para escuchar el
  // dedo) y una vuelta que, al cambiar, vuelve a armar la pantalla (pide de
  // nuevo sus datos, con los esqueletos mientras llegan).
  const [caja, setCaja] = useState(null);
  const refContenido = useCallback((el) => {
    contenido.current = el;
    setCaja(el);
  }, []);
  const [vuelta, setVuelta] = useState(0);
  const actualizar = useCallback(() => {
    setVuelta((v) => v + 1);
    // De paso, ¿hay una versión nueva publicada? (sale el cartel "Actualizar").
    navigator.serviceWorker
      ?.getRegistration?.()
      .then((r) => r?.update())
      .catch(() => {});
  }, []);
  const tirar = useTirarParaActualizar(caja, actualizar);
  const conMenu = Boolean(user && !user.debeCambiarPassword);
  // El teclado del celular (27/11): con él abierto, la app ocupa solo lo que
  // queda arriba (sigue-teclado) y la barra de abajo se queda abajo, tapada
  // (teclado:hidden). Solo con sesión: el login es una página común.
  useTeclado(conMenu);
  const menu = menuPara(user);
  const { setAbierto: setFiltrosAbierto, hay: hayFiltros } = filtros;
  // El asistente consulta Pecuaria: lo ve quien puede ver Pecuaria.
  const conAsistente = conMenu && puede(user, 'pecuaria:VER');

  async function salir() {
    setMenuAbierto(false);
    await logout();
    navigate('/login');
  }

  // Al cambiar de pantalla se cierran el menú, los filtros y la hoja del "+",
  // y lo de la pantalla nueva arranca desde arriba.
  useEffect(() => {
    contenido.current?.scrollTo?.(0, 0);
    setMenuAbierto(false);
    setFiltrosAbierto(false);
    setRegistrarAbierto(false);
    setBarras(false);
  }, [location.pathname, setFiltrosAbierto]);

  // Deslizar desde el borde izquierdo abre los filtros (celular).
  useEffect(() => {
    if (!conMenu || !hayFiltros) return undefined;
    let inicio = null;
    const empieza = (e) => {
      const t = e.touches[0];
      inicio = t.clientX < 24 ? { x: t.clientX, y: t.clientY } : null;
    };
    const termina = (e) => {
      if (!inicio) return;
      const t = e.changedTouches[0];
      if (t.clientX - inicio.x > 60 && Math.abs(t.clientY - inicio.y) < 50) setFiltrosAbierto(true);
      inicio = null;
    };
    document.addEventListener('touchstart', empieza, { passive: true });
    document.addEventListener('touchend', termina, { passive: true });
    return () => {
      document.removeEventListener('touchstart', empieza);
      document.removeEventListener('touchend', termina);
    };
  }, [conMenu, hayFiltros, setFiltrosAbierto]);

  // Escape cierra lo que esté abierto.
  useEffect(() => {
    if (!menuAbierto && !filtros.abierto && !asistenteAbierto) return undefined;
    const tecla = (e) => {
      if (e.key !== 'Escape') return;
      setMenuAbierto(false);
      setFiltrosAbierto(false);
      setAsistenteAbierto(false);
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [menuAbierto, filtros.abierto, asistenteAbierto, setFiltrosAbierto]);

  if (!conMenu) {
    return (
      <>
        <BarraSimple onSalir={user ? salir : null} />
        <Outlet />
      </>
    );
  }

  const linkArriba = ({ isActive }) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-white/20 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'}`;
  const linkAbajo = ({ isActive }) =>
    `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${isActive ? 'font-semibold text-campo-600' : 'text-suelo-500'}`;

  return (
    // La app ocupa justo la pantalla: arriba la barra, abajo (celular) la barra
    // de abajo, y en el medio lo que scrollea. Así Potreros y Movimientos
    // (PantallaTabla) dejan fijos el título y el paginador y solo scrollea la tabla.
    // Fijo a la pantalla (fixed inset-0): arrastrar de más no corre la barra de
    // abajo (pedido de Diego, 19/11).
    // Con el teclado abierto, el marco ocupa lo que se ve arriba de él (sigue-teclado).
    <div className="sigue-teclado fixed inset-0 flex flex-col">
      {/* En el celular entran logo, estancia, tema, iniciales y ☰ a 360 px: logo
          un poco más bajo y menos espacio entre cosas (24/11). */}
      <header className={`relative z-30 flex shrink-0 items-center gap-1.5 bg-barra px-3 py-2.5 text-white lg:gap-3 lg:px-4 ${barras ? '' : 'acostado:hidden'}`}>
        <Link to="/pecuaria/resumen" className="flex shrink-0 items-center" aria-label="SAPSA, ir al inicio">
          <Marca />
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
        {/* Después de las estancias: el tema, las iniciales y, último, el ☰ (27/11). */}
        <BotonTema />
        {conAsistente && <BotonAsistente abierto={asistenteAbierto} onClick={() => setAsistenteAbierto((a) => !a)} />}
        <AvatarUsuario user={user} />
        <button
          type="button"
          onClick={() => setMenuAbierto((a) => !a)}
          aria-label="Menú"
          aria-expanded={menuAbierto}
          className="rounded-md p-1.5 hover:bg-white/15"
        >
          <Icono nombre={menuAbierto ? 'cerrar' : 'menu'} className="h-6 w-6" />
        </button>
      </header>

      {conAsistente && <PanelAsistente abierto={asistenteAbierto} onCerrar={() => setAsistenteAbierto(false)} />}

      {/* El menú: se despliega desde el botón ☰ de arriba (o "Menú" abajo). */}
      {menuAbierto && (
        <div className="fixed inset-0 z-40">
          <button type="button" aria-label="Cerrar el menú" onClick={() => setMenuAbierto(false)} className="absolute inset-0 bg-black/30" />
          <div
            role="dialog"
            aria-label="Menú"
            className="absolute right-2 top-[56px] flex max-h-[calc(100vh-72px)] w-[min(20rem,calc(100vw-1rem))] flex-col rounded-xl border border-suelo-200 bg-superficie p-3 shadow-xl"
          >
            <ContenidoPanel menu={menu} onCerrar={() => setMenuAbierto(false)} onSalir={salir} />
          </div>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        <RuedaActualizar {...tirar} />
        {/* Panel de filtros: cajón en el celular, fijo en la compu. */}
        {hayFiltros && filtros.abierto && (
          <button type="button" aria-label="Cerrar los filtros" onClick={() => setFiltrosAbierto(false)} className="fixed inset-0 z-40 bg-black/40 lg:hidden" />
        )}
        <aside
          aria-label="Filtros"
          className={`${hayFiltros ? '' : 'hidden'} fixed inset-y-0 left-0 z-40 w-[85%] max-w-xs overflow-y-auto bg-superficie p-4 pt-[max(1rem,env(safe-area-inset-top))] shadow-xl transition-transform ${
            filtros.abierto ? 'translate-x-0' : '-translate-x-full'
          } lg:static lg:z-0 lg:w-72 lg:max-w-none lg:shrink-0 lg:translate-x-0 lg:border-r lg:border-suelo-200 lg:shadow-none`}
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="font-semibold">Filtros</p>
            <button type="button" onClick={() => setFiltrosAbierto(false)} aria-label="Cerrar" className="rounded-md p-1.5 text-suelo-600 hover:bg-suelo-200/70 lg:hidden">
              <Icono nombre="cerrar" className="h-6 w-6" />
            </button>
          </div>
          <DestinoFiltros />
        </aside>
        {/* pb-5: que el "+" de la barra de abajo (sobresale) no tape lo último. */}
        <div
          ref={refContenido}
          onPointerDown={() => barras && setBarras(false)}
          className="min-w-0 flex-1 overflow-y-auto pb-5 lg:pb-0 acostado:pb-1 teclado:pb-1"
          // Mientras se tira, el contenido baja con el dedo (en reposo, sin
          // transform: si no, las ventanas fijas de adentro se correrían).
          style={tirar.distancia && !tirar.actualizando ? { transform: `translateY(${tirar.distancia}px)` } : undefined}
          data-testid="contenido"
        >
          <Outlet key={vuelta} />
        </div>
      </div>

      {/* Celular: la flechita del borde (solo si la pantalla tiene filtros) y la barra de abajo. */}
      {hayFiltros && (
        <button
          type="button"
          onClick={() => setFiltrosAbierto(true)}
          aria-label="Abrir los filtros"
          className="fixed left-0 top-1/2 z-20 flex h-12 w-5 -translate-y-1/2 items-center justify-center rounded-r-lg bg-boton/90 text-white lg:hidden teclado:hidden"
        >
          <Icono nombre="derecha" className="h-4 w-4" />
        </button>
      )}

      {/* Celular acostado: el botón que trae las barras (solo con las barras escondidas). */}
      {!barras && (
        <button
          type="button"
          onClick={() => setBarras(true)}
          aria-label="Mostrar el menú"
          className="fixed right-2 top-2 z-40 hidden h-9 w-9 items-center justify-center rounded-full bg-barra text-white shadow-md acostado:flex"
          data-testid="mostrar-barras"
        >
          <Icono nombre="menu" className="h-5 w-5" />
        </button>
      )}

      <nav
        aria-label="Barra de abajo"
        className={`relative z-30 flex shrink-0 items-end border-t border-suelo-200 bg-superficie pb-[env(safe-area-inset-bottom)] lg:hidden teclado:hidden ${barras ? '' : 'acostado:hidden'}`}
        data-testid="barra-abajo"
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
              className="-mt-5 mb-1 flex h-14 w-14 items-center justify-center rounded-full bg-trigo-500 text-trigo-900 shadow-md ring-4 ring-superficie"
            >
              <Icono nombre="mas" className="h-7 w-7" />
            </button>
          </div>
        )}
        {menu.principal.slice(2).map((item) => (
          <NavLink key={item.clave} to={item.ruta} className={linkAbajo}>
            <Icono nombre={item.icono} className="h-6 w-6" />
            {item.texto}
          </NavLink>
        ))}
        {menu.registrar.length === 0 && (
          <button type="button" onClick={() => setMenuAbierto(true)} className={linkAbajo({ isActive: false })}>
            <Icono nombre="menu" className="h-6 w-6" />
            Menú
          </button>
        )}
      </nav>

      {registrarAbierto && (
        <HojaRegistrar
          acciones={menu.registrar}
          eventos={Boolean(menu.eventos)}
          contexto={contextoDe(location.pathname)}
          inicial={vistaInicial(location)}
          onCerrar={() => setRegistrarAbierto(false)}
        />
      )}
    </div>
  );
}
