// @vitest-environment jsdom
// El selector de pasto (26/11): tres botones; tocar el elegido lo saca.
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PastoMarca, PastoSelector } from './PastoSelector.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('PastoSelector', () => {
  let contenedor;
  let root;
  beforeEach(() => {
    contenedor = document.createElement('div');
    document.body.appendChild(contenedor);
    root = createRoot(contenedor);
  });
  afterEach(() => {
    act(() => root.unmount());
    contenedor.remove();
  });

  function Probar({ compacto }) {
    const [valor, setValor] = useState('');
    return (
      <>
        <PastoSelector valor={valor} onCambiar={setValor} etiqueta="Pasto en P1" compacto={compacto} />
        <p data-testid="valor">{valor}</p>
      </>
    );
  }
  const boton = (t) => [...contenedor.querySelectorAll('button')].find((b) => b.textContent.startsWith(t));
  const valor = () => contenedor.querySelector('[data-testid="valor"]').textContent;

  it('elige, cambia y, tocando el mismo, lo saca', () => {
    act(() => root.render(<Probar />));
    expect(contenedor.querySelector('[role="group"]').getAttribute('aria-label')).toBe('Pasto en P1');
    expect(contenedor.textContent).toMatch(/Bajomenos de 10 cm/);
    act(() => boton('Medio').click());
    expect(valor()).toBe('MEDIO');
    expect(boton('Medio').getAttribute('aria-pressed')).toBe('true');
    act(() => boton('Alto').click());
    expect(valor()).toBe('ALTO');
    act(() => boton('Alto').click());
    expect(valor()).toBe('');
  });

  it('compacto: sin la ayuda en cm (queda en el title)', () => {
    act(() => root.render(<Probar compacto />));
    expect(contenedor.textContent).not.toMatch(/cm/);
    expect(boton('Bajo').title).toBe('Bajo: menos de 10 cm');
  });

  it('la marca: el nombre o, corta, la letra', () => {
    act(() =>
      root.render(
        <>
          <PastoMarca valor="ALTO" />
          <PastoMarca valor="BAJO" corta />
          <PastoMarca valor={null} />
        </>,
      ),
    );
    const marcas = [...contenedor.querySelectorAll('[data-testid="marca-pasto"]')];
    expect(marcas.map((m) => m.textContent)).toEqual(['Alto', 'B']);
    expect(marcas[1].title).toBe('Pasto bajo (menos de 10 cm)');
  });
});
