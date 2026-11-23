import { inputClass } from './ui';
import { opcionPotrero } from './pecuaria';

// Elegir toros (fase 6, docs/PECUARIA.md §9): cada toro, uno por uno, con el
// potrero al que va. Lo usan el fin del entore (salen), la etapa Toros (salen
// o entran) y empezar un proceso o sumar una tanda (entran).
const selector = `${inputClass} min-h-11 px-3`;

// { [toroId]: potreroId | '' } → [{ toroId, potreroId? }] (solo los elegidos).
export function listaParaApi(elegidos = {}) {
  return Object.entries(elegidos)
    .filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([toroId, potreroId]) => ({ toroId: Number(toroId), ...(potreroId ? { potreroId: Number(potreroId) } : {}) }));
}

// ¿Falta el potrero de algún toro elegido? (cuando el potrero es obligatorio)
export const faltaPotrero = (elegidos = {}) => Object.values(elegidos).some((v) => v === '');

// Los toros que se pueden traer: activos y que no están en otro proceso.
export const torosLibres = (toros = []) => toros.filter((t) => t.activo && !t.enProceso);

// Una lista de toros con casillas y, si `conPotrero`, el potrero de cada uno.
//   toros: [{ id, identificacion, raza?, genetica?, lote?, potrero? }]
//   elegidos: { [toroId]: potreroId | '' }   (sin la clave = no elegido)
export function ListaToros({ titulo, ayuda, toros, elegidos, onCambiar, potreros = [], conPotrero = true, potreroPorDefecto = '', vacio }) {
  const alternar = (t) => {
    const nuevo = { ...elegidos };
    if (t.id in nuevo) delete nuevo[t.id];
    else nuevo[t.id] = conPotrero ? String(potreroPorDefecto ?? '') : '';
    onCambiar(nuevo);
  };
  return (
    <fieldset className="space-y-2" aria-label={titulo}>
      <legend className="text-sm font-semibold">{titulo}</legend>
      {ayuda && <p className="text-xs text-suelo-500">{ayuda}</p>}
      {toros.length === 0 && <p className="text-sm text-suelo-600">{vacio ?? 'No hay toros.'}</p>}
      {conPotrero && Object.keys(elegidos).length > 1 && (
        <label className="block text-xs text-suelo-600">
          Todos a…
          <select
            aria-label={`${titulo}: todos al potrero`}
            value=""
            onChange={(e) => e.target.value && onCambiar(Object.fromEntries(Object.keys(elegidos).map((k) => [k, e.target.value])))}
            className={`${selector} mt-1 w-full`}
          >
            <option value="">Elegí un potrero para todos…</option>
            {potreros.map((p) => (
              <option key={p.id} value={p.id}>
                {opcionPotrero(p)}
              </option>
            ))}
          </select>
        </label>
      )}
      <ul className="divide-y divide-suelo-100 rounded-lg border border-suelo-200 bg-superficie">
        {toros.map((t) => {
          const elegido = t.id in elegidos;
          return (
            <li key={t.id} className="px-3 py-2" data-toro={t.identificacion}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                <input type="checkbox" checked={elegido} onChange={() => alternar(t)} className="h-5 w-5 accent-campo-600" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{t.identificacion}</span>
                  <span className="block text-xs text-suelo-500">
                    {[t.raza, t.genetica].filter(Boolean).join(' · ') || 'Sin raza ni genética'}
                    {t.donde ? ` · ${t.donde}` : ''}
                  </span>
                </span>
              </label>
              {elegido && conPotrero && (
                <label className="mt-1 block text-xs text-suelo-600">
                  ¿A qué potrero va?
                  <select
                    aria-label={`Potrero del toro ${t.identificacion}`}
                    value={elegidos[t.id]}
                    onChange={(e) => onCambiar({ ...elegidos, [t.id]: e.target.value })}
                    className={`${selector} mt-1 w-full`}
                  >
                    <option value="">Elegí…</option>
                    {potreros.map((p) => (
                      <option key={p.id} value={p.id}>
                        {opcionPotrero(p)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
