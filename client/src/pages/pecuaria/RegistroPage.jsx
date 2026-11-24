import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { useEstancia } from '../../context/EstanciaContext';
import usePotreros from '../../hooks/usePotreros';
import { ErrorList, Notice } from '../../components/ui';
import MovimientosLista from '../../components/MovimientosLista';
import { DestinoBotonFiltros } from '../../components/PanelFiltros';
import { BarraAbajo, PantallaTabla, SinEstancia } from './comun';

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
// Con "Todas las estancias", lo de todas (cada potrero con su sigla). Todo se
// registra desde el "+" (24/11: Movimientos y Eventos; desde la pestaña Eventos
// abre en Eventos). La pantalla no scrollea: solo la tabla.
export default function RegistroPage() {
  const location = useLocation();
  const [params] = useSearchParams();
  const { campoId, todas, grupo } = useEstancia();
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
      <h1 className="sr-only">Registro</h1>
      <Notice tone="ok">{location.state?.aviso}</Notice>
      <ErrorList errors={errors} />
      {!campoId && !todas && <SinEstancia />}
      {(campoId || todas) && !potreros && !errors.length && <p className="text-suelo-600">Cargando…</p>}
      {potreros && <MovimientosLista key={ver} ver={ver} campoId={campoId} potreros={potreros} todas={todas} grupo={grupo} />}
      {/* Abajo, a lo ancho y cerca del pulgar (24/11): las pestañas y los
          filtros, iguales en las dos (anotar va en el "+"). Con el celular
          acostado se esconde. */}
      <BarraAbajo acostado data-testid="barra-registro">
        <nav aria-label="Pestañas del registro" className="flex min-w-0 flex-1 rounded-lg bg-suelo-200/70 p-1">
          {PESTANIAS.map(([valor, texto]) => (
            <Link
              key={valor}
              to={enlace(valor)}
              replace
              aria-current={ver === valor ? 'page' : undefined}
              className={`min-w-0 flex-1 truncate rounded-md px-1.5 py-1.5 text-center text-sm font-semibold sm:px-3 sm:text-base ${
                ver === valor ? 'bg-boton text-white shadow-sm' : 'text-suelo-700 hover:bg-suelo-300/60'
              }`}
            >
              {texto}
            </Link>
          ))}
        </nav>
        <DestinoBotonFiltros />
      </BarraAbajo>
    </PantallaTabla>
  );
}
