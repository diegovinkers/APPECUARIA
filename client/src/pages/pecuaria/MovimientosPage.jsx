import { useLocation } from 'react-router-dom';
import { useEstancia } from '../../context/EstanciaContext';
import usePotreros from '../../hooks/usePotreros';
import { ErrorList, Notice } from '../../components/ui';
import MovimientosLista from '../../components/MovimientosLista';
import { ElegirEstancia, Encabezado, SinEstancia } from './comun';

// Todos los cambios de la estancia: entre potreros, entre campos, múltiples,
// de categoría, entradas y salidas, en una tabla con filtros y la opción de
// revertir. Se registran desde el botón "+" (con el aviso de lo que se hizo).
export default function MovimientosPage() {
  const location = useLocation();
  const { campoId, todas } = useEstancia();
  const { potreros, errors } = usePotreros(campoId);

  return (
    <main className="mx-auto max-w-5xl px-4 py-5 sm:py-8">
      <Encabezado titulo="Movimientos" />
      <Notice tone="ok">{location.state?.aviso}</Notice>
      <ErrorList errors={errors} />
      {todas && <ElegirEstancia />}
      {!campoId && !todas && <SinEstancia />}
      {campoId && !potreros && !errors.length && <p className="text-suelo-600">Cargando…</p>}
      {potreros && <MovimientosLista campoId={campoId} potreros={potreros} />}
    </main>
  );
}
