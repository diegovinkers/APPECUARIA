import { useLocation } from 'react-router-dom';
import { useEstancia } from '../../context/EstanciaContext';
import { Notice } from '../../components/ui';
import ProcesosLista from '../../components/ProcesosLista';
import { Encabezado, PantallaTabla, SinEstancia } from './comun';

// Procesos (23/11): página propia, con su botón en la barra de abajo. Antes
// era una pestaña de Registro (`/pecuaria/registro?ver=procesos` redirige
// acá). La lista, sus filtros y "+ Nuevo proceso" son los de siempre.
export default function ProcesosPage() {
  const location = useLocation();
  const { campoId, todas, grupo } = useEstancia();
  return (
    <PantallaTabla>
      <Encabezado titulo="Procesos" />
      <Notice tone="ok">{location.state?.aviso}</Notice>
      {!campoId && !todas && <SinEstancia />}
      {(campoId || todas) && <ProcesosLista campoId={campoId} todas={todas} grupo={grupo} />}
    </PantallaTabla>
  );
}
