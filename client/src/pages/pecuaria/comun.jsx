import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useEstancia } from '../../context/EstanciaContext';
import { ErrorList } from '../../components/ui';
import { DestinoBotonFiltros } from '../../components/PanelFiltros';

// Encabezado de Resumen, Potreros y Movimientos, en un solo renglón (pedido de
// Diego, 19/11): el título, la estancia chica al lado y, en el celular, el
// botón "Filtros" de la pantalla (si tiene).
export function Encabezado({ titulo, children }) {
  const { campo, todas } = useEstancia();
  return (
    <div className="mb-2 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1">
      <h1 className="text-xl font-bold leading-tight sm:text-2xl">
        {titulo}
        {(campo || todas) && <span className="ml-2 text-sm font-normal text-suelo-600">{todas ? 'Todas las estancias' : campo.nombre}</span>}
      </h1>
      <DestinoBotonFiltros />
      {children && <div className="ml-auto">{children}</div>}
    </div>
  );
}

// Pantalla de una tabla (Potreros, Movimientos): ocupa justo el alto que deja
// el Marco; el título y el paginador quedan fijos y solo scrollea la tabla
// (pedido de Diego, 19/11). La lista adentro usa flex-1 + min-h-0.
export function PantallaTabla({ children }) {
  return <main className="mx-auto flex h-full max-w-5xl flex-col px-4 pt-3 sm:pt-5 lg:pb-4">{children}</main>;
}

// Mientras no haya estancia elegida: cargando, error o "importá la planilla".
export function SinEstancia() {
  const { campos, errors } = useEstancia();
  if (errors.length) return <ErrorList errors={errors} />;
  if (!campos) return <p className="text-suelo-600">Cargando…</p>;
  return (
    <div className="rounded-lg border border-dashed border-suelo-300 bg-white p-8 text-center text-suelo-600">
      Todavía no hay datos.{' '}
      <Link to="/pecuaria/importar" className="text-campo-600 hover:underline">
        Empezá importando la planilla de cargas
      </Link>
      .
    </div>
  );
}

// Con "Todas las estancias" elegido, las pantallas de una sola estancia
// (Potreros, Movimientos) piden cuál.
export function ElegirEstancia({ texto = '¿De qué estancia?' }) {
  const { campos, setCampoId } = useEstancia();
  return (
    <div className="rounded-lg border border-suelo-200 bg-white p-4">
      <p className="mb-3 text-suelo-700">{texto}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {campos.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCampoId(c.id)}
            className="rounded-md border border-suelo-300 px-4 py-3 text-left font-medium hover:border-campo-500 hover:bg-campo-50"
          >
            {c.nombre}
          </button>
        ))}
      </div>
    </div>
  );
}

// Las direcciones viejas (/pecuaria?vista=potreros&q=...) siguen andando.
export function RedirigirPecuaria() {
  const [params] = useSearchParams();
  const vista = ['potreros', 'movimientos'].includes(params.get('vista')) ? params.get('vista') : 'resumen';
  params.delete('vista');
  const resto = params.toString();
  return <Navigate to={`/pecuaria/${vista}${resto ? `?${resto}` : ''}`} replace />;
}
