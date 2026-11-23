import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTiposMovimiento } from '../api/pecuaria';
import { getErrorMessages } from '../api/axios';
import { ICONO_EVENTO, agruparEventos, nombreCorto } from '../navegacion/eventos';
import { rutaEvento } from '../navegacion/menu';
import { ErrorList } from './ui';
import Icono from './Icono';

// La hoja del botón "Eventos": qué les hiciste (sin moverlos). Los tipos salen
// del catálogo (efecto REGISTRO y activos); Pesada y Recuento arriba y
// grandes, después Sanidad, Reproducción, Manejo y Otros. Al elegir uno va al
// camino de 4 pasos (EventoPage). contexto: { potrero, lote } de la pantalla
// donde estabas, para que el camino arranque con eso elegido.
// En el celular sube desde abajo; en la compu es una ventana al medio.
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

export default function HojaEventos({ onCerrar, contexto = {} }) {
  const navigate = useNavigate();
  const [tipos, setTipos] = useState(null);
  const [errors, setErrors] = useState([]);

  useEffect(() => {
    getTiposMovimiento()
      .then(({ data }) => setTipos(data))
      .catch((error) => setErrors(getErrorMessages(error, 'No se pudieron cargar los eventos')));
  }, []);

  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && onCerrar();
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [onCerrar]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center">
      <button type="button" aria-label="Cerrar" onClick={onCerrar} className="absolute inset-0 bg-black/40" />
      <div
        role="dialog"
        aria-label="Eventos"
        className="relative flex max-h-[85vh] w-full flex-col rounded-t-2xl bg-superficie px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 lg:max-w-md lg:rounded-2xl lg:pb-5"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-suelo-300 lg:hidden" aria-hidden="true" />
        <div className="mb-3 flex items-center gap-2">
          <h2 className="flex-1 text-base font-semibold">
            ¿Qué les hiciste?
            <span className="block text-xs font-normal text-suelo-500">Siguen donde estaban. Para moverlos, el botón +.</span>
          </h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-md p-1 text-suelo-500 hover:bg-suelo-200/70">
            <Icono nombre="cerrar" />
          </button>
        </div>
        <ErrorList errors={errors} />
        {!tipos && !errors.length && <p className="py-4 text-sm text-suelo-600">Cargando…</p>}
        {tipos && <ListaEventos tipos={tipos} onElegir={(t) => navigate(rutaEvento(t.id, contexto))} />}
      </div>
    </div>
  );
}
