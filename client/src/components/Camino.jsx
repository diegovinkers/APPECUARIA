// El camino de pasos (eventos, 20/11): qué → a quién → datos → revisar y
// confirmar. Es genérico: arriba los pasos (los anteriores se pueden tocar para
// volver sin perder lo cargado), en el medio el paso actual y abajo, fija, la
// barra con "Atrás" y el botón para seguir. Botones de 44 px como mínimo.
//   pasos: ['Qué', 'A quién', 'Datos', 'Revisar'] · actual: índice (0, 1...)
//   onIr(i): volver a un paso anterior · onSeguir: el botón principal
export const PASOS_EVENTO = ['Qué', 'A quién', 'Datos', 'Revisar'];

export default function Camino({ titulo, pasos = PASOS_EVENTO, actual, onIr, onSeguir, textoSeguir = 'Seguir', puedeSeguir = true, ocupado = false, ayuda, children }) {
  return (
    <main className="mx-auto flex min-h-full max-w-3xl flex-col px-4 pt-3 sm:pt-6">
      {titulo && <h1 className="text-xl font-bold leading-tight sm:text-2xl">{titulo}</h1>}
      <ol className="mt-2 flex items-center gap-1 text-xs" aria-label="Pasos">
        {pasos.map((p, i) => {
          const hecho = i < actual;
          const contenido = (
            <>
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  i === actual ? 'bg-boton text-white' : hecho ? 'bg-campo-100 text-campo-700' : 'bg-suelo-200 text-suelo-500'
                }`}
              >
                {i + 1}
              </span>
              <span className={`truncate ${i === actual ? 'font-semibold text-suelo-900' : 'text-suelo-500'}`}>{p}</span>
            </>
          );
          return (
            <li key={p} className="flex min-w-0 flex-1 items-center" aria-current={i === actual ? 'step' : undefined}>
              {hecho && onIr ? (
                <button type="button" onClick={() => onIr(i)} className="flex min-h-11 min-w-0 items-center gap-1 hover:underline">
                  {contenido}
                </button>
              ) : (
                <span className="flex min-h-11 min-w-0 items-center gap-1">{contenido}</span>
              )}
            </li>
          );
        })}
      </ol>

      <div className="flex-1 pb-4">{children}</div>

      {onSeguir && (
        <div className="sticky bottom-0 -mx-4 mt-auto flex items-center gap-3 border-t border-suelo-200 bg-superficie px-4 py-3">
          {actual > 0 && onIr && (
            <button type="button" onClick={() => onIr(actual - 1)} className="min-h-11 rounded-md border border-suelo-300 px-4 text-sm font-medium text-suelo-800">
              Atrás
            </button>
          )}
          <span className="min-w-0 flex-1 truncate text-xs text-suelo-600">{ayuda}</span>
          <button
            type="button"
            onClick={onSeguir}
            disabled={!puedeSeguir || ocupado}
            className="min-h-11 rounded-md bg-boton px-5 text-sm font-semibold text-white hover:bg-boton-hover disabled:opacity-50"
          >
            {textoSeguir}
          </button>
        </div>
      )}
    </main>
  );
}
