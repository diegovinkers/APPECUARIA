import { useState } from 'react';
import usePuede from '../hooks/usePuede';
import HojaEventos from './HojaEventos';
import Icono from './Icono';
import { EVENTOS } from '../navegacion/menu';

// "Anotar evento" (23/11): abre la hoja Eventos de siempre. Antes estaba en la
// barra de abajo; ahora va en la pestaña Eventos de Registro y en las fichas
// del potrero y del lote. `contexto` ({ potrero } o { lote }) hace que el
// camino arranque con eso elegido ("arranca donde estás").
// corto: en el celular dice solo "Anotar" (en la barra de abajo de Registro).
export default function BotonEventos({ contexto = {}, className = '', corto = false }) {
  const puedo = usePuede();
  const [abierto, setAbierto] = useState(false);
  if (!puedo(EVENTOS.requiere)) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className={`inline-flex ${corto ? "min-h-10 shrink-0" : "min-h-11"} items-center gap-1.5 rounded-md border border-campo-600 bg-superficie px-3 py-2 text-sm font-semibold text-campo-700 hover:bg-campo-50 ${className}`}
      >
        <Icono nombre="eventos" className={`h-4 w-4 ${corto ? 'hidden sm:block' : ''}`} />
        {corto ? (
          <>
            Anotar<span className="hidden sm:inline">&nbsp;evento</span>
          </>
        ) : (
          'Anotar evento'
        )}
      </button>
      {abierto && <HojaEventos contexto={contexto} onCerrar={() => setAbierto(false)} />}
    </>
  );
}
