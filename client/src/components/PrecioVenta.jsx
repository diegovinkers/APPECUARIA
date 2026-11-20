import { inputClass } from './ui';
import { formatUsd } from './pecuaria';

// El precio de venta real (20/11): al registrar una salida de tipo VENTA, en
// dólares por kilo o por cabeza. Es opcional. El valor de la venta lo calcula
// el servidor (vista previa): por kilo, cabezas × peso de salida × precio; por
// cabeza, cabezas × precio.

const aNumero = (texto) => (String(texto ?? '').trim() === '' ? null : Number(String(texto).trim().replace(',', '.')));

// Lo que se manda al servidor: nada si no hay precio.
export function cuerpoVenta(precio, por) {
  const n = aNumero(precio);
  return n == null ? {} : { precioVentaUsd: n, precioVentaPor: por };
}

// Lo que falta para poder calcular el valor (para avisar antes de mandar), o null.
export function faltaParaVenta({ precio, por, peso }) {
  const n = aNumero(precio);
  if (n == null) return null;
  if (!(n > 0)) return 'El precio de venta tiene que ser un número mayor que cero';
  if (por === 'KG' && aNumero(peso) == null) return 'Para el precio por kilo, escribí el peso de salida';
  return null;
}

const POR = [
  ['KG', 'por kilo'],
  ['CABEZA', 'por cabeza'],
];

export default function CamposPrecioVenta({ precio, por, peso, valor, onPrecio, onPor }) {
  const falta = faltaParaVenta({ precio, por, peso });
  return (
    <div className="space-y-2" data-testid="precio-venta">
      <label className="block text-sm text-suelo-600">
        Precio de venta (opcional)
        <div className="mt-1 flex items-center gap-2">
          <span className="text-sm text-suelo-700">USD</span>
          <input
            inputMode="decimal"
            value={precio}
            onChange={(e) => onPrecio(e.target.value)}
            placeholder={por === 'KG' ? 'por kg en pie' : 'por cabeza'}
            className={`${inputClass.replace('w-full', '')} w-28`}
            aria-label="Precio de venta en dólares"
          />
          <div className="flex gap-1" role="group" aria-label="El precio es">
            {POR.map(([valorPor, texto]) => (
              <button
                key={valorPor}
                type="button"
                aria-pressed={por === valorPor}
                onClick={() => onPor(valorPor)}
                className={`rounded-full px-3 py-1 text-xs ${por === valorPor ? 'bg-campo-600 text-white' : 'bg-suelo-200/70 text-suelo-700'}`}
              >
                {texto}
              </button>
            ))}
          </div>
        </div>
      </label>
      {falta && <p className="text-xs text-amber-800">{falta}</p>}
      {valor != null && (
        <p className="text-sm">
          Valor de la venta: <strong data-testid="valor-venta">{formatUsd(valor)}</strong>
        </p>
      )}
    </div>
  );
}
