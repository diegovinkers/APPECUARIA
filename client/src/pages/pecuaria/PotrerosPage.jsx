import { useEstancia } from '../../context/EstanciaContext';
import usePotreros from '../../hooks/usePotreros';
import { ErrorList } from '../../components/ui';
import PotrerosLista from '../../components/PotrerosLista';
import { PantallaTabla, SinEstancia } from './comun';

// Los potreros de la estancia con su uso, cabezas, lotes y carga, con filtros.
// Con "Todas las estancias", los de todas, cada uno con la sigla de su
// estancia (pedido de Diego, 19/11). Tocar un potrero abre su ficha. La
// pantalla no scrollea: solo la tabla.
// Sin título ni estancia arriba (pedido de Diego, 24/11): la estancia ya está
// en la barra de arriba y la pantalla, marcada en la de abajo. Tampoco está
// "+ Corral". Abajo de la tabla (cerca del pulgar), el buscador y el botón
// de los filtros (PotrerosLista).
export default function PotrerosPage() {
  const { campoId, todas, grupo } = useEstancia();
  const { potreros, errors } = usePotreros(campoId, todas, grupo);

  return (
    <PantallaTabla>
      <ErrorList errors={errors} />
      {!campoId && !todas && <SinEstancia />}
      {(campoId || todas) && !potreros && !errors.length && <p className="text-suelo-600">Cargando…</p>}
      {potreros && <PotrerosLista potreros={potreros} todas={todas} />}
    </PantallaTabla>
  );
}
