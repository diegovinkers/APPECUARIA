import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useEstancia } from '../../context/EstanciaContext';
import usePuede from '../../hooks/usePuede';
import { Notice } from '../../components/ui';
import ProcesosLista from '../../components/ProcesosLista';
import TableroProcesos, { useTablero } from '../../components/TableroProcesos';
import { Encabezado, PantallaTabla, SinEstancia } from './comun';

// Procesos (24/11, dibujo de Diego): el tablero con las 4 secciones del ciclo
// de la vaca una debajo de la otra, como un acordeón (En servicio, Reentore,
// Preñadas, Con cría al pie), y aparte "Todos" (la lista de siempre, con
// cerrados y anulados). Lo que se ve va en la URL (?ver=todos).
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
  const opcion = (activa) => `flex-1 rounded-md px-3 py-1.5 text-sm font-semibold ${activa ? 'bg-boton text-white' : 'text-suelo-700 hover:bg-suelo-200/70'}`;

  return (
    <PantallaTabla>
      <Encabezado titulo="Procesos">
        {puedo('pecuaria:CREAR') && (
          // En el celular, "+ Nuevo" (así entra al lado del botón Filtros de "Todos").
          <Link
            to="/pecuaria/procesos/nuevo"
            aria-label="Nuevo proceso"
            className="inline-flex min-h-10 items-center whitespace-nowrap rounded-md bg-boton px-3 py-2 text-sm font-semibold text-white hover:bg-boton-hover"
          >
            + Nuevo<span className="hidden sm:inline">&nbsp;proceso</span>
          </Link>
        )}
      </Encabezado>
      <Notice tone="ok">{location.state?.aviso}</Notice>
      {!hayEstancia && <SinEstancia />}
      {hayEstancia && (
        <>
          <nav aria-label="Vista" className="mb-2 flex shrink-0 gap-1 rounded-lg bg-suelo-100 p-1 sm:max-w-xs">
            <button type="button" onClick={() => ver(false)} aria-pressed={!verTodos} className={opcion(!verTodos)}>
              Tablero
            </button>
            <button type="button" onClick={() => ver(true)} aria-pressed={verTodos} className={opcion(verTodos)}>
              Todos
            </button>
          </nav>
          {verTodos ? (
            <ProcesosLista campoId={campoId} todas={todas} grupo={grupo} conNuevo={false} />
          ) : (
            <TableroProcesos tablero={tablero} errors={errors} todas={todas} />
          )}
        </>
      )}
    </PantallaTabla>
  );
}
