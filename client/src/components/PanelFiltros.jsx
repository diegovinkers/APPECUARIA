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
  const [destinoBoton, setDestinoBoton] = useState(null); // al lado del título (Encabezado)
  const value = { destino, setDestino, abierto, setAbierto, hay: cuantos > 0, setCuantos, destinoBoton, setDestinoBoton };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// El lugar del panel donde se dibujan los filtros (lo pone el Marco).
export function DestinoFiltros() {
  const { setDestino } = usePanelFiltros();
  return <div ref={setDestino} />;
}

// El lugar del botón "Filtros", al lado del título de la pantalla (lo pone el
// Encabezado). Sin él, el botón va donde esté <PanelFiltros>.
export function DestinoBotonFiltros() {
  const { setDestinoBoton } = usePanelFiltros();
  return <div ref={setDestinoBoton} className="contents" />;
}

const SIN_PANEL = {
  destino: null,
  setDestino: () => {},
  abierto: false,
  setAbierto: () => {},
  hay: false,
  setCuantos: () => {},
  destinoBoton: null,
  setDestinoBoton: () => {},
};

export function usePanelFiltros() {
  return useContext(Ctx) ?? SIN_PANEL;
}

// activos: cuántos filtros hay puestos (para el botón). onLimpiar: si hay.
// compacto: el botón es solo el ícono (y cuántos hay), y "Limpiar" queda
// adentro del cajón (Registro, Procesos y Potreros: pedido de Diego, 24/11).
export default function PanelFiltros({ activos = 0, onLimpiar, compacto = false, children }) {
  const { destino, setAbierto, setCuantos, destinoBoton } = usePanelFiltros();

  useEffect(() => {
    setCuantos((n) => n + 1);
    return () => setCuantos((n) => n - 1);
  }, [setCuantos]);

  // En el celular: el botón para abrir el cajón (en la compu el panel está fijo).
  const boton = (
    <div className={`flex items-center gap-2 lg:hidden ${destinoBoton ? '' : 'mb-2'}`}>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={compacto ? 'Filtros' : undefined}
        className="flex items-center gap-1.5 rounded-md border border-suelo-300 bg-superficie px-2.5 py-1.5 text-sm font-medium text-suelo-800 hover:border-campo-400"
      >
        <Icono nombre="configuracion" className="h-4 w-4" />
        {!compacto && <span>Filtros</span>}
        {activos > 0 && <span className="rounded-full bg-boton px-2 text-xs text-white">{activos}</span>}
      </button>
      {activos > 0 && onLimpiar && !compacto && (
        <button type="button" onClick={onLimpiar} className="text-sm text-campo-600 hover:underline">
          Limpiar
        </button>
      )}
    </div>
  );

  return (
    <>
      {destinoBoton ? createPortal(boton, destinoBoton) : boton}
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
