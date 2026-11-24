import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useEstancia } from '../../context/EstanciaContext';
import usePuede from '../../hooks/usePuede';
import { Notice } from '../../components/ui';
import { formatNumero } from '../../components/pecuaria';
import ProcesosLista from '../../components/ProcesosLista';
import TableroProcesos, { useTablero } from '../../components/TableroProcesos';
import { SECCIONES_TABLERO, esSeccion } from '../../components/tablero';
import { Encabezado, PantallaTabla, SinEstancia } from './comun';

// Procesos (24/11, dibujo de Diego): un tablero con las 4 secciones del ciclo
// de la vaca (En servicio, Reentore, Preñadas, Con cría al pie) y, aparte,
// "Todos" (la lista de siempre, con cerrados y anulados). En el celular, una
// pestaña por sección con sus cabezas; en la compu, las 4 columnas juntas.
// La pestaña va en la URL (?seccion=).
export default function ProcesosPage() {
  const location = useLocation();
  const puedo = usePuede();
  const [params, setParams] = useSearchParams();
  const { campoId, todas, grupo } = useEstancia();
  const hayEstancia = Boolean(campoId || todas);
  const pedida = params.get('seccion');
  const seccion = pedida === 'todos' || esSeccion(pedida) ? pedida : 'servicio';
  const verTodos = seccion === 'todos';
  const { tablero, errors } = useTablero({ campoId: hayEstancia ? campoId : null, todas, grupo });

  const elegir = (clave) =>
    setParams(
      (actual) => {
        const nuevo = new URLSearchParams(actual);
        clave === 'servicio' ? nuevo.delete('seccion') : nuevo.set('seccion', clave);
        return nuevo;
      },
      { replace: true },
    );
  const pestana = (activa) =>
    `flex min-w-0 flex-1 flex-col items-center rounded-md px-1 py-1.5 text-xs leading-tight ${activa ? 'bg-boton text-white' : 'text-suelo-700 hover:bg-suelo-200/70'}`;

  return (
    <PantallaTabla>
      <Encabezado titulo="Procesos">
        {puedo('pecuaria:CREAR') && (
          <Link to="/pecuaria/procesos/nuevo" className="inline-flex min-h-11 items-center rounded-md bg-boton px-4 py-2 text-sm font-semibold text-white hover:bg-boton-hover">
            + Nuevo proceso
          </Link>
        )}
      </Encabezado>
      <Notice tone="ok">{location.state?.aviso}</Notice>
      {!hayEstancia && <SinEstancia />}
      {hayEstancia && (
        <>
          <nav aria-label="Secciones" className="mb-2 flex shrink-0 gap-1 rounded-lg bg-suelo-100 p-1">
            {/* En el celular, una pestaña por sección; en la compu, "Tablero" (las 4 juntas). */}
            {SECCIONES_TABLERO.map((s) => (
              <button key={s.clave} type="button" onClick={() => elegir(s.clave)} aria-pressed={seccion === s.clave} className={`${pestana(seccion === s.clave)} md:hidden`}>
                <span className="font-semibold">{s.corto}</span>
                <span className="tabular-nums opacity-80">{tablero ? formatNumero(tablero.totales[s.clave]) : '…'}</span>
              </button>
            ))}
            <button type="button" onClick={() => elegir('servicio')} aria-pressed={!verTodos} className={`${pestana(!verTodos)} hidden md:flex`}>
              <span className="font-semibold">Tablero</span>
            </button>
            <button type="button" onClick={() => elegir('todos')} aria-pressed={verTodos} className={pestana(verTodos)}>
              <span className="font-semibold">Todos</span>
              <span className="opacity-80 md:hidden">lista</span>
            </button>
          </nav>
          {verTodos ? (
            <ProcesosLista campoId={campoId} todas={todas} grupo={grupo} conNuevo={false} />
          ) : (
            <TableroProcesos tablero={tablero} errors={errors} seccion={seccion} todas={todas} />
          )}
        </>
      )}
    </PantallaTabla>
  );
}
