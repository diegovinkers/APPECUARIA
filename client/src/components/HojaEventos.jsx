import { ICONO_EVENTO, agruparEventos, nombreCorto } from '../navegacion/eventos';
import Icono from './Icono';

// La lista de eventos: qué les hiciste (sin moverlos). Los tipos salen del
// catálogo (efecto REGISTRO y activos); Pesada y Recuento arriba y grandes,
// después Sanidad, Reproducción, Manejo y Otros. Al elegir uno va al camino de
// 4 pasos (EventoPage). La usan la pestaña Eventos del "+" (HojaRegistrar,
// 24/11) y EventoPage.
export function ListaEventos({ tipos, onElegir }) {
  const { destacados, grupos } = agruparEventos(tipos);
  if (!destacados.length && !grupos.length) return <p className="py-4 text-sm text-suelo-600">No hay eventos activos (Configuración → Tipos de movimiento).</p>;
  return (
    <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
      {destacados.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {destacados.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onElegir(t)}
              className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border border-campo-200 bg-campo-50 px-2 py-3 font-semibold text-campo-800 hover:bg-campo-100"
            >
              <Icono nombre={ICONO_EVENTO[t.clave] ?? 'eventos'} className="h-7 w-7" />
              {nombreCorto(t)}
            </button>
          ))}
        </div>
      )}
      {grupos.map((g) => (
        <section key={g.grupo} className="mt-3">
          <p className="px-1 text-xs font-semibold uppercase tracking-wide text-suelo-500">{g.titulo}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {g.tipos.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onElegir(t)}
                className="min-h-11 rounded-full border border-suelo-300 bg-superficie px-3.5 py-2 text-sm font-medium text-suelo-800 hover:border-campo-500 hover:bg-campo-50"
              >
                {nombreCorto(t)}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
