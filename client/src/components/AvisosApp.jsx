import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useEnLinea } from '../hooks/useEnLinea.js';

// Avisos de la PWA (docs/superpowers/specs/2026-11-18-pwa-design.md):
// - "Sin conexión": franja arriba mientras no hay señal.
// - "Hay una versión nueva": abajo, cuando se publicó otra versión. La app
//   nunca se recarga sola: se actualiza solo si el usuario toca "Actualizar"
//   (así no se pierde una carga a medio hacer).
const UNA_HORA_MS = 60 * 60 * 1000;

function buscarVersionNueva(registro) {
  if (!registro) return;
  const revisar = () => registro.update().catch(() => {});
  setInterval(revisar, UNA_HORA_MS);
  // En el celular la app queda abierta días: revisar también al volver a ella.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') revisar();
  });
}

export default function AvisosApp() {
  const enLinea = useEnLinea();
  const {
    needRefresh: [hayVersionNueva, setHayVersionNueva],
    updateServiceWorker,
  } = useRegisterSW({ onRegisteredSW: (_url, registro) => buscarVersionNueva(registro) });

  // Mientras está el cartel, espacio al final de la página para que no tape
  // los últimos botones.
  useEffect(() => {
    if (!hayVersionNueva) return undefined;
    document.body.style.paddingBottom = '8rem';
    return () => {
      document.body.style.paddingBottom = '';
    };
  }, [hayVersionNueva]);

  return (
    <>
      {!enLinea && (
        <div role="status" className="sticky top-0 z-50 bg-amber-600 px-4 py-2 text-center text-sm font-medium text-white">
          Sin conexión: no se puede guardar nada hasta que vuelva la señal.
        </div>
      )}

      {hayVersionNueva && (
        <>
          <div
            role="alert"
            className="fixed inset-x-0 bottom-0 z-50 mx-auto mb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:mb-4 w-[calc(100%-2rem)] max-w-md rounded-lg border border-suelo-200 bg-white p-4 shadow-lg ring-1 ring-campo-500/40"
          >
            <p className="mb-3 text-sm text-suelo-900">Hay una versión nueva de la app.</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => updateServiceWorker(true)}
                className="flex-1 rounded-md bg-campo-600 px-4 py-2 font-medium text-white transition hover:bg-campo-700"
              >
                Actualizar
              </button>
              <button
                type="button"
                onClick={() => setHayVersionNueva(false)}
                className="rounded-md px-4 py-2 text-suelo-700 transition hover:bg-suelo-300/60"
              >
                Después
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
