import { useState } from 'react';
import usePuede from '../hooks/usePuede';
import HojaEventos from './HojaEventos';
import Icono from './Icono';
import { EVENTOS } from '../navegacion/menu';

// "Anotar evento" (23/11): abre la hoja Eventos de siempre. Antes estaba en la
// barra de abajo; ahora va en la pestaña Eventos de Registro y en las fichas
// del potrero y del lote. `contexto` ({ potrero } o { lote }) hace que el
// camino arranque con eso elegido ("arranca donde estás").
export default function BotonEventos({ contexto = {}, className = '' }) {
  const puedo = usePuede();
  const [abierto, setAbierto] = useState(false);
  if (!puedo(EVENTOS.requiere)) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-md border border-campo-600 bg-white px-3 py-2 text-sm font-semibold text-campo-700 hover:bg-campo-50 ${className}`}
      >
        <Icono nombre="eventos" className="h-4 w-4" /> Anotar evento
      </button>
      {abierto && <HojaEventos contexto={contexto} onCerrar={() => setAbierto(false)} />}
    </>
  );
}
