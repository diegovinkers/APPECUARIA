import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useEstancia } from '../../context/EstanciaContext';
import usePuede from '../../hooks/usePuede';
import { Notice } from '../../components/ui';
import ProcesosLista from '../../components/ProcesosLista';
import TableroProcesos, { useTablero } from '../../components/TableroProcesos';
import { BarraAbajo, PantallaTabla, SinEstancia } from './comun';
import { DestinoBotonFiltros } from '../../components/PanelFiltros';

// Procesos (24/11, dibujo de Diego): el tablero con las 5 secciones del ciclo (desde el 27/11, con Embriones aparte y sin números)
// de la vaca una debajo de la otra, como un acordeón (Inseminación, Entore,
// Preñadas, Con cría al pie), y aparte "Todos" (la lista de siempre, con
// cerrados y anulados). Lo que se ve va en la URL (?ver=todos). Abajo, a lo
// ancho: Tablero / Todos, los filtros (en Todos) y "+ Nuevo".
export default function ProcesosPage() {
  const location = useLocation();
  const puedo = usePuede();
  const [params, setParams] = useSearchParams();
  const { campoId, todas, grupo } = useEstancia();
  const hayEstancia = Boolean(campoId || todas);
  // ?seccion=todos es de la primera versión (con pestañas).
  const verTodos = params.get('ver') === 'todos' || params.get('seccion') === 'todos';
  const { tablero, errors } = useTablero({ campoId: hayEstancia ? campoId : null, todas, grupo });

  const ver = (todos) =>
    setParams(
      (actual) => {
        const nuevo = new URLSearchParams(actual);
        nuevo.delete('seccion');
        todos ? nuevo.set('ver', 'todos') : nuevo.delete('ver');
        return nuevo;
      },
      { replace: true },
    );
  const opcion = (activa) => `flex-1 rounded-md px-3 py-1.5 text-sm font-semibold ${activa ? 'bg-boton text-white shadow-sm' : 'text-suelo-700 hover:bg-suelo-300/60'}`;

  return (
    <PantallaTabla>
      {/* Sin título ni estancia arriba (24/11): la estancia ya está en la barra
          de arriba. Las opciones van abajo, cerca del pulgar. */}
      <h1 className="sr-only">Procesos</h1>
      <Notice tone="ok">{location.state?.aviso}</Notice>
      {!hayEstancia && <SinEstancia />}
      {hayEstancia &&
        (verTodos ? (
          <ProcesosLista campoId={campoId} todas={todas} grupo={grupo} conNuevo={false} />
        ) : (
          <TableroProcesos tablero={tablero} errors={errors} todas={todas} />
        ))}
      {hayEstancia && (
        <BarraAbajo data-testid="barra-procesos">
          <nav aria-label="Vista" className="flex min-w-0 flex-1 gap-1 rounded-lg bg-suelo-200/70 p-1">
            <button type="button" onClick={() => ver(false)} aria-pressed={!verTodos} className={opcion(!verTodos)}>
              Tablero
            </button>
            <button type="button" onClick={() => ver(true)} aria-pressed={verTodos} className={opcion(verTodos)}>
              Todos
            </button>
          </nav>
          {/* En "Todos", el botón de los filtros (la lista los manda acá). */}
          <DestinoBotonFiltros />
          {puedo('pecuaria:CREAR') && (
            <Link
              to="/pecuaria/procesos/nuevo"
              aria-label="Nuevo proceso"
              className="inline-flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-md bg-boton px-3 py-2 text-sm font-semibold text-white hover:bg-boton-hover"
            >
              + Nuevo<span className="hidden sm:inline">&nbsp;proceso</span>
            </Link>
          )}
        </BarraAbajo>
      )}
    </PantallaTabla>
  );
}
