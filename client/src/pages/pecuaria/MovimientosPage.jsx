import { useEstancia } from '../../context/EstanciaContext';
import usePotreros from '../../hooks/usePotreros';
import { ErrorList } from '../../components/ui';
import MovimientosLista from '../../components/MovimientosLista';
import { ElegirEstancia, Encabezado, SinEstancia } from './comun';

// Todos los cambios de la estancia: entre potreros, de categoría, entradas y
// salidas, con filtros y la opción de revertir.
export default function MovimientosPage() {
  const { campoId, todas } = useEstancia();
  const { potreros, errors } = usePotreros(campoId);

  return (
    <main className="mx-auto max-w-5xl px-4 py-5 sm:py-8">
      <Encabezado titulo="Movimientos" />
      <ErrorList errors={errors} />
      {todas && <ElegirEstancia />}
      {!campoId && !todas && <SinEstancia />}
      {campoId && !potreros && !errors.length && <p className="text-suelo-600">Cargando…</p>}
      {potreros && <MovimientosLista campoId={campoId} potreros={potreros} />}
    </main>
  );
}
