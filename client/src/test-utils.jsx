// Ayudas para los tests del front.
import { DestinoFiltros, PanelFiltrosProvider } from './components/PanelFiltros';

// El texto de un elemento como se ve en la compu: sin lo que solo aparece en
// el celular (las segundas líneas con clase md:hidden).
export function textoCompu(el) {
  const copia = el.cloneNode(true);
  for (const e of copia.querySelectorAll('[class*="md:hidden"]')) e.remove();
  return copia.textContent;
}

// Para probar una pantalla con filtros: el panel donde se dibujan.
export function ConPanel({ children }) {
  return (
    <PanelFiltrosProvider>
      <DestinoFiltros />
      {children}
    </PanelFiltrosProvider>
  );
}
