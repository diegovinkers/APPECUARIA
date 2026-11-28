// @vitest-environment jsdom
// La tarjeta de una propuesta del asistente (fase 2): estados y errores.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ confirmarPropuesta: vi.fn(), cancelarPropuesta: vi.fn() }));
vi.mock('../api/asistente', () => api);

const { default: TarjetaPropuesta, estadoVisible, textoEstado } = await import('./TarjetaPropuesta.jsx');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ahora = new Date('2026-11-27T15:00:00Z');
const base = { id: 3, estado: 'PENDIENTE', venceEn: '2026-11-27T15:30:00Z', tarjeta: { titulo: 'Pesada: 100 cab. en 1 lote' } };

describe('estadoVisible y textoEstado', () => {
  it('una pendiente que pasó la hora se ve vencida', () => {
    expect(estadoVisible(base, ahora)).toBe('PENDIENTE');
    expect(estadoVisible(base, new Date('2026-11-27T15:31:00Z'))).toBe('VENCIDA');
    expect(estadoVisible({ ...base, estado: 'CONFIRMADA' }, new Date('2026-11-28T00:00:00Z'))).toBe('CONFIRMADA');
  });

  it('el texto de cada estado', () => {
    expect(textoEstado(base, ahora)).toBe('Para confirmar hasta las 12:30');
    expect(textoEstado({ ...base, estado: 'CONFIRMADA' }, ahora)).toBe('✓ Registrado');
    expect(textoEstado({ ...base, estado: 'ERROR', error: 'En el 8.1 hay 50' }, ahora)).toBe('En el 8.1 hay 50');
    expect(textoEstado(base, new Date('2026-11-27T16:00:00Z'))).toBe('Venció sin confirmar: pedila de nuevo.');
  });
});

describe('la tarjeta', () => {
  let contenedor;
  let root;
  beforeEach(() => {
    contenedor = document.createElement('div');
    document.body.appendChild(contenedor);
    root = createRoot(contenedor);
    api.confirmarPropuesta.mockReset();
    api.cancelarPropuesta.mockReset();
  });
  afterEach(() => {
    act(() => root.unmount());
    contenedor.remove();
  });
  const montar = async (propuesta, onCambio = vi.fn()) => {
    act(() =>
      root.render(
        <MemoryRouter>
          <TarjetaPropuesta propuesta={propuesta} onCambio={onCambio} />
        </MemoryRouter>,
      ),
    );
    await act(async () => {});
    return onCambio;
  };
  const boton = (t) => [...contenedor.querySelectorAll('button')].find((b) => b.textContent === t);
  const futura = { ...base, venceEn: new Date(Date.now() + 60 * 60 * 1000).toISOString() };

  it('si la app dice que ya no está pendiente, muestra el motivo y toma el estado del servidor', async () => {
    api.confirmarPropuesta.mockRejectedValue({
      response: { data: { errors: ['Esta propuesta venció (pasó más de una hora). Pedila de nuevo.'], code: 'PROPUESTA_VENCIDA' } },
    });
    const onCambio = await montar(futura);
    await act(async () => boton('Confirmar').click());
    expect(contenedor.textContent).toContain('Esta propuesta venció');
    expect(onCambio).toHaveBeenCalledWith(expect.objectContaining({ id: 3, estado: 'VENCIDA' }));
  });

  it('con un error de red se puede volver a tocar', async () => {
    api.confirmarPropuesta.mockRejectedValueOnce(new Error('red'));
    const onCambio = await montar(futura);
    await act(async () => boton('Confirmar').click());
    expect(contenedor.textContent).toContain('No se pudo. Probá de nuevo.');
    expect(onCambio).not.toHaveBeenCalled();
    expect(boton('Confirmar').disabled).toBe(false);
  });

  it('una que dio error en la ruta muestra el mensaje y no ofrece botones', async () => {
    await montar({ ...base, estado: 'ERROR', error: 'En el 8.1 hay 50' });
    expect(contenedor.querySelector('[data-testid="estado-propuesta"]').textContent).toBe('En el 8.1 hay 50');
    expect(boton('Confirmar')).toBeUndefined();
  });
});
