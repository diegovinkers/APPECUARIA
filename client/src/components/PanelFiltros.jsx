import { createContext, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Icono from './Icono';

// El panel izquierdo muestra los filtros de la pantalla donde estás (pedido de
// Diego, 19/11): Potreros y Movimientos ponen los suyos con <PanelFiltros>.
// En el celular es un cajón que se abre con la flechita del borde o con el
// botón "Filtros"; en la compu queda fijo a la izquierda. Las pantallas sin
// filtros no lo muestran.
const Ctx = createContext(null);

export function PanelFiltrosProvider({ children }) {
  const [destino, setDestino] = useState(null); // el lugar del panel, en el Marco
  const [abierto, setAbierto] = useState(false);
  const [cuantos, setCuantos] = useState(0); // pantallas con filtros montadas
  const value = { destino, setDestino, abierto, setAbierto, hay: cuantos > 0, setCuantos };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// El lugar del panel donde se dibujan los filtros (lo pone el Marco).
export function DestinoFiltros() {
  const { setDestino } = usePanelFiltros();
  return <div ref={setDestino} />;
}

export function usePanelFiltros() {
  return useContext(Ctx) ?? { destino: null, setDestino: () => {}, abierto: false, setAbierto: () => {}, hay: false, setCuantos: () => {} };
}

// activos: cuántos filtros hay puestos (para el botón). onLimpiar: si hay.
export default function PanelFiltros({ activos = 0, onLimpiar, children }) {
  const { destino, setAbierto, setCuantos } = usePanelFiltros();

  useEffect(() => {
    setCuantos((n) => n + 1);
    return () => setCuantos((n) => n - 1);
  }, [setCuantos]);

  return (
    <>
      {/* En el celular: el botón para abrir el cajón, arriba de la tabla. */}
      <div className="mb-3 flex items-center gap-3 lg:hidden">
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="flex items-center gap-2 rounded-md border border-suelo-300 bg-white px-3 py-2 text-sm font-medium text-suelo-800 hover:border-campo-400"
        >
          <Icono nombre="configuracion" className="h-4 w-4" />
          Filtros
          {activos > 0 && <span className="rounded-full bg-campo-600 px-2 text-xs text-white">{activos}</span>}
        </button>
        {activos > 0 && onLimpiar && (
          <button type="button" onClick={onLimpiar} className="text-sm text-campo-600 hover:underline">
            Limpiar
          </button>
        )}
      </div>
      {destino &&
        createPortal(
          <div className="space-y-3">
            {children}
            {activos > 0 && onLimpiar && (
              <button type="button" onClick={onLimpiar} className="text-sm text-campo-600 hover:underline">
                Limpiar filtros
              </button>
            )}
          </div>,
          destino,
        )}
    </>
  );
}
