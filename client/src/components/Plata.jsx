import { createContext, useContext, useState } from 'react';
import Icono from './Icono';

// El ojito del Resumen (26/11, pedido de Diego): los valores en dinero
// arrancan tapados y se ven al tocar el ojo. Cada vez que se entra al Resumen
// arrancan tapados otra vez (no se recuerda). Fuera del Resumen (sin
// PlataProvider) la plata se ve siempre.

const PlataContext = createContext({ visible: true, alternar: () => {} });

export function PlataProvider({ children }) {
  const [visible, setVisible] = useState(false);
  return <PlataContext.Provider value={{ visible, alternar: () => setVisible((v) => !v) }}>{children}</PlataContext.Provider>;
}

export const usePlata = () => useContext(PlataContext);

export const TAPADO = '•••••';

// Un valor en dinero: el texto, o puntitos si está tapado.
export function Plata({ children, className = '' }) {
  const { visible } = usePlata();
  if (visible) return <>{children}</>;
  return (
    <span className={`tracking-widest text-suelo-400 ${className}`} aria-label="valor oculto" data-plata="oculta">
      {TAPADO}
    </span>
  );
}

// El botón del ojo: cerrado = tapado; abierto = se ve.
export function BotonOjo({ className = '' }) {
  const { visible, alternar } = usePlata();
  return (
    <button
      type="button"
      onClick={alternar}
      aria-pressed={visible}
      aria-label={visible ? 'Ocultar los valores' : 'Mostrar los valores'}
      title={visible ? 'Ocultar los valores' : 'Mostrar los valores'}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-suelo-600 hover:bg-suelo-200/70 hover:text-suelo-900 ${className}`}
    >
      <Icono nombre={visible ? 'ojo' : 'ojoTachado'} className="h-5 w-5" />
    </button>
  );
}
