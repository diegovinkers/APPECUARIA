import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { useEstancia } from '../../context/EstanciaContext';
import usePotreros from '../../hooks/usePotreros';
import { ErrorList, Notice } from '../../components/ui';
import MovimientosLista from '../../components/MovimientosLista';
import BotonEventos from '../../components/BotonEventos';
import { DestinoBotonFiltros } from '../../components/PanelFiltros';
import { nombreGrupo } from '../../navegacion/grupos';
import { PantallaTabla, SinEstancia } from './comun';

// Las pestañas (pedido de Diego, 20/11). `?ver=eventos` abre Eventos; sin
// nada, Movimientos. Procesos era la tercera: desde el 23/11 es una página
// propia y `?ver=procesos` redirige a /pecuaria/procesos (con sus filtros).
export const PESTANIAS = [
  ['movimientos', 'Movimientos'],
  ['eventos', 'Eventos'],
];
export const pestaniaDe = (params) => (params.get('ver') === 'eventos' ? 'eventos' : 'movimientos');

// Registro: todo lo que pasó en la estancia, en dos pestañas.
// - Movimientos: lo que cambió las cabezas o el lugar (mover, entre campos,
//   múltiples, cambio de categoría, entradas, salidas, destete) y los eventos
//   que cambiaron las cabezas (un recuento con diferencia).
// - Eventos: todo lo que se anotó (pesada, vacuna, ecografía...).
//   Arriba, "Anotar evento" abre la hoja Eventos (antes, en la barra de abajo).
// Con "Todas las estancias", lo de todas (cada potrero con su sigla). Se
// registra desde el "+" y desde "Anotar evento". La pantalla no scrollea: solo la tabla.
export default function RegistroPage() {
  const location = useLocation();
  const [params] = useSearchParams();
  const { campo, campoId, todas, grupo } = useEstancia();
  const { potreros, errors } = usePotreros(campoId, todas, grupo);
  const ver = pestaniaDe(params);
  const aProcesos = params.get('ver') === 'procesos';

  // Cambiar de pestaña conserva el período, el potrero y la categoría; el tipo
  // no, porque cada pestaña tiene los suyos.
  const enlace = (valor) => {
    const nuevo = new URLSearchParams(params);
    nuevo.delete('mtipo');
    if (valor === 'movimientos') nuevo.delete('ver');
    else nuevo.set('ver', valor);
    const texto = nuevo.toString();
    return `${location.pathname}${texto ? `?${texto}` : ''}`;
  };

  if (aProcesos) {
    const resto = new URLSearchParams(params);
    resto.delete('ver');
    const texto = resto.toString();
    return <Navigate to={`/pecuaria/procesos${texto ? `?${texto}` : ''}`} replace />;
  }

  return (
    <PantallaTabla>
      <div className="mb-2 flex shrink-0 items-center gap-2">
        <h1 className="sr-only">Registro</h1>
        <nav aria-label="Pestañas del registro" className="flex rounded-lg bg-suelo-200/70 p-1">
          {PESTANIAS.map(([valor, texto]) => (
            <Link
              key={valor}
              to={enlace(valor)}
              replace
              aria-current={ver === valor ? 'page' : undefined}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold sm:px-4 sm:text-base ${
                ver === valor ? 'bg-boton text-white shadow-sm' : 'text-suelo-700 hover:bg-suelo-300/60'
              }`}
            >
              {texto}
            </Link>
          ))}
        </nav>
        {/* La estancia ya está arriba en el selector: en el celular no se repite. */}
        {(campo || todas) && <span className="hidden text-sm text-suelo-600 sm:inline">{todas ? nombreGrupo(grupo) : campo.nombre}</span>}
        <div className="ml-auto flex items-center gap-2">
          {ver === 'eventos' && <BotonEventos />}
          <DestinoBotonFiltros />
        </div>
      </div>
      <Notice tone="ok">{location.state?.aviso}</Notice>
      <ErrorList errors={errors} />
      {!campoId && !todas && <SinEstancia />}
      {(campoId || todas) && !potreros && !errors.length && <p className="text-suelo-600">Cargando…</p>}
      {potreros && <MovimientosLista key={ver} ver={ver} campoId={campoId} potreros={potreros} todas={todas} grupo={grupo} />}
    </PantallaTabla>
  );
}
