import { useLocation } from 'react-router-dom';
import { useEstancia } from '../../context/EstanciaContext';
import usePotreros from '../../hooks/usePotreros';
import { ErrorList, Notice } from '../../components/ui';
import MovimientosLista from '../../components/MovimientosLista';
import { Encabezado, PantallaTabla, SinEstancia } from './comun';

// Todos los cambios de la estancia: entre potreros, entre campos, múltiples,
// de categoría, entradas y salidas, en una tabla con filtros y la opción de
// revertir. Con "Todas las estancias", los de todas (cada potrero con la sigla
// de su estancia; uno entre campos aparece una vez). Se registran desde el
// botón "+" (con el aviso de lo que se hizo).
// La pantalla no scrollea: solo la tabla.
export default function MovimientosPage() {
  const location = useLocation();
  const { campoId, todas, grupo } = useEstancia();
  const { potreros, errors } = usePotreros(campoId, todas, grupo);

  return (
    <PantallaTabla>
      <Encabezado titulo="Movimientos" />
      <Notice tone="ok">{location.state?.aviso}</Notice>
      <ErrorList errors={errors} />
      {!campoId && !todas && <SinEstancia />}
      {(campoId || todas) && !potreros && !errors.length && <p className="text-suelo-600">Cargando…</p>}
      {potreros && <MovimientosLista campoId={campoId} potreros={potreros} todas={todas} grupo={grupo} />}
    </PantallaTabla>
  );
}
