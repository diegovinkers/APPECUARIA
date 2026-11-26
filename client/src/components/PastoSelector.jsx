// Pasto de los potreros: el selector (Bajo / Medio / Alto) y las marcas.
import { ALTURAS, altura } from './pasto';

// Tres botones con la ayuda en cm debajo. Tocar el elegido lo saca: el dato es
// opcional. etiqueta: para quien lee la pantalla en voz alta. compacto: sin la
// ayuda (la recorrida la muestra una sola vez, arriba).
export function PastoSelector({ valor, onCambiar, etiqueta, compacto = false }) {
  return (
    <div role="group" aria-label={etiqueta} className="grid grid-cols-3 gap-1.5">
      {ALTURAS.map((a) => {
        const activo = valor === a.valor;
        return (
          <button
            key={a.valor}
            type="button"
            aria-pressed={activo}
            onClick={() => onCambiar(activo ? '' : a.valor)}
            title={`${a.nombre}: ${a.ayuda}`}
            className={`min-h-11 rounded-md border px-2 py-1.5 text-center ${
              activo ? `border-transparent ${a.color} ring-2 ring-campo-500` : 'border-suelo-300 bg-superficie text-suelo-800 hover:border-campo-500'
            }`}
          >
            <span className="block text-sm font-semibold">{a.nombre}</span>
            {!compacto && <span className="block text-[11px] leading-tight text-suelo-500">{a.ayuda}</span>}
          </button>
        );
      })}
    </div>
  );
}

// La etiqueta de color: "Medio". corta: solo la letra (la tabla en el celular).
export function PastoMarca({ valor, corta = false, title }) {
  const a = altura(valor);
  if (!a) return null;
  return (
    <span title={title ?? `Pasto ${a.nombre.toLowerCase()} (${a.ayuda})`} className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 text-xs font-medium leading-4 ${a.color}`} data-testid="marca-pasto">
      <span className={`h-1.5 w-1.5 rounded-full ${a.punto}`} aria-hidden="true" />
      {corta ? a.letra : a.nombre}
    </span>
  );
}
