// Mientras carga, la forma de lo que va a aparecer (pedido de Diego, 27/11):
// barras grises que laten en lugar de "Cargando…". Para el lector de
// pantalla dice "Cargando…". Con "reducir movimiento" no laten.

// Largos de las barras, para que no parezcan todas iguales (siempre los
// mismos: no cambian en cada dibujo).
const LARGOS = ['w-3/4', 'w-1/2', 'w-2/3', 'w-5/6', 'w-3/5', 'w-4/5'];

export function Barra({ className = '' }) {
  return <span aria-hidden="true" className={`block h-3 rounded bg-suelo-200 motion-safe:animate-pulse ${className}`} />;
}

// Una tabla vacía con la forma de la de verdad.
// columnas: [{ clave, clase (vista y ancho del th), derecha, dosLineas }].
// claseFila: el alto de las filas (el mismo que la tabla de verdad).
export function EsqueletoTabla({ columnas, filas = 14, claseFila = '', testId = 'esqueleto' }) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-0 flex-1 flex-col" data-testid={testId}>
      <span className="sr-only">Cargando…</span>
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-suelo-300 bg-superficie">
        <table className="w-full table-fixed border-separate border-spacing-0" aria-hidden="true">
          <thead>
            <tr>
              {columnas.map((c) => (
                <th key={c.clave} className={`border-b border-r border-suelo-300 bg-suelo-100 px-1.5 py-2.5 last:border-r-0 md:px-2 ${c.clase ?? ''}`}>
                  <Barra className={`h-2.5 w-2/3 bg-suelo-300/70 ${c.derecha ? 'ml-auto' : ''}`} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: filas }, (_, n) => (
              <tr key={n} className={`${claseFila} ${n % 2 ? '[&>td]:bg-suelo-50' : ''}`}>
                {columnas.map((c, i) => (
                  <td key={c.clave} className={`border-b border-r border-suelo-200 px-1.5 align-middle last:border-r-0 md:px-2 ${c.clase ?? ''}`}>
                    <Barra className={`${c.derecha ? 'ml-auto w-2/3' : LARGOS[(n + i) % LARGOS.length]}`} />
                    {c.dosLineas && <Barra className={`mt-1.5 h-2.5 md:hidden ${LARGOS[(n + i + 3) % LARGOS.length]}`} />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Para las pantallas que no son una tabla (Resumen, Procesos): unos bloques
// grises con barras, en lugar de "Cargando…".
export function EsqueletoBloques({ bloques = 4, testId = 'esqueleto' }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3" data-testid={testId}>
      <span className="sr-only">Cargando…</span>
      {Array.from({ length: bloques }, (_, n) => (
        <div key={n} aria-hidden="true" className="rounded-lg border border-suelo-200 bg-superficie p-4">
          <Barra className={`h-4 ${LARGOS[n % LARGOS.length]}`} />
          <Barra className={`mt-3 ${LARGOS[(n + 2) % LARGOS.length]}`} />
          <Barra className={`mt-2 ${LARGOS[(n + 4) % LARGOS.length]}`} />
        </div>
      ))}
    </div>
  );
}
