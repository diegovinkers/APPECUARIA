// @vitest-environment jsdom
// El asistente como cajón de la derecha (27/11): un chat por persona, con su
// historial; la respuesta llega de a poco y dice qué está buscando.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  estadoAsistente: vi.fn(),
  historialAsistente: vi.fn(),
  preguntarAlAsistente: vi.fn(),
  confirmarPropuesta: vi.fn(),
  cancelarPropuesta: vi.fn(),
}));
vi.mock('../api/asistente', () => api);

const { default: PanelAsistente, EJEMPLOS, EJEMPLO_ACCION, conPropuesta, etiquetaDia, mensajesDeHistorial } = await import('./PanelAsistente.jsx');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('etiquetaDia y mensajesDeHistorial', () => {
  it('Hoy, Ayer o la fecha (hora de Uruguay)', () => {
    const ahora = new Date('2026-11-27T15:00:00Z');
    expect(etiquetaDia('2026-11-27T13:00:00Z', ahora)).toBe('Hoy');
    expect(etiquetaDia('2026-11-26T20:00:00Z', ahora)).toBe('Ayer');
    expect(etiquetaDia('2026-11-20T12:00:00Z', ahora)).toBe('20/11/2026');
  });

  it('cada consulta da la pregunta y la respuesta (o el error)', () => {
    expect(mensajesDeHistorial([{ id: 4, pregunta: 'p', respuesta: null, error: 'falló', creadaEn: 'f' }])).toEqual([
      { clave: 'p4', rol: 'persona', texto: 'p', fecha: 'f' },
      { clave: 'r4', rol: 'asistente', texto: '', error: 'falló', propuestas: [] },
    ]);
  });

  it('conPropuesta cambia solo esa propuesta', () => {
    const ms = [
      { clave: 'r1', propuestas: [{ id: 1, estado: 'PENDIENTE' }, { id: 2, estado: 'PENDIENTE' }] },
      { clave: 'r2', texto: 'x' },
    ];
    expect(conPropuesta(ms, { id: 2, estado: 'CONFIRMADA' })[0].propuestas).toEqual([
      { id: 1, estado: 'PENDIENTE' },
      { id: 2, estado: 'CONFIRMADA' },
    ]);
  });
});

describe('el cajón del asistente', () => {
  let contenedor;
  let root;
  const onCerrar = vi.fn();
  beforeEach(() => {
    contenedor = document.createElement('div');
    document.body.appendChild(contenedor);
    root = createRoot(contenedor);
    onCerrar.mockReset();
    api.estadoAsistente.mockReset().mockResolvedValue({ configurado: true, modelo: 'claude-haiku-5-5' });
    api.historialAsistente.mockReset().mockResolvedValue({ consultas: [], hayMas: false });
    api.preguntarAlAsistente.mockReset();
    api.confirmarPropuesta.mockReset();
    api.cancelarPropuesta.mockReset();
  });
  afterEach(() => {
    act(() => root.unmount());
    contenedor.remove();
  });

  const montar = async (abierto = true) => {
    act(() =>
      root.render(
        <MemoryRouter>
          <PanelAsistente abierto={abierto} onCerrar={onCerrar} />
        </MemoryRouter>,
      ),
    );
    await act(async () => {});
  };
  const campo = () => contenedor.querySelector('textarea');
  const escribir = (valor) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    act(() => {
      setter.call(campo(), valor);
      campo().dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const enviarBoton = () => contenedor.querySelector('button[aria-label="Enviar"]');
  const respuestas = () => [...contenedor.querySelectorAll('[data-testid="respuesta"]')].map((r) => r.textContent);
  const boton = (t) => [...contenedor.querySelectorAll('button')].find((b) => b.textContent === t);

  it('cerrado no pide nada; al abrirse trae el estado y el historial una sola vez', async () => {
    await montar(false);
    expect(api.historialAsistente).not.toHaveBeenCalled();
    expect(contenedor.querySelector('[data-testid="panel-asistente"]').className).toContain('translate-x-full');
    await montar(true);
    await montar(false);
    await montar(true);
    expect(api.historialAsistente).toHaveBeenCalledTimes(1);
    expect(contenedor.querySelector('[data-testid="panel-asistente"]').className).toContain('translate-x-0');
  });

  it('muestra el historial con los días y "Ver anteriores" trae los de antes', async () => {
    const hoy = new Date().toISOString();
    api.historialAsistente
      .mockResolvedValueOnce({ consultas: [{ id: 8, pregunta: '¿Y en el 12?', respuesta: 'Está vacío.', creadaEn: hoy }], hayMas: true })
      .mockResolvedValueOnce({ consultas: [{ id: 3, pregunta: '¿Cuántos terneros?', respuesta: 'Hay **2.399**.', creadaEn: '2026-11-20T12:00:00Z' }], hayMas: false });
    await montar();
    expect(contenedor.textContent).toContain('Hoy');
    expect(respuestas()).toEqual(['Está vacío.']);
    expect(contenedor.textContent).not.toContain(EJEMPLOS[0]);

    await act(async () => boton('Ver anteriores').click());
    expect(api.historialAsistente).toHaveBeenLastCalledWith(8);
    expect(respuestas()).toEqual(['Hay 2.399.', 'Está vacío.']);
    expect(contenedor.textContent).toContain('20/11/2026');
    expect(boton('Ver anteriores')).toBeUndefined();
  });

  it('sin historial muestra los ejemplos; tocar uno lo pregunta (sin id de conversación: un chat por persona)', async () => {
    api.preguntarAlAsistente.mockImplementation(async ({ alEvento }) => {
      alEvento({ tipo: 'conversacion', id: 'c1' });
      alEvento({ tipo: 'texto', texto: 'Hay 6 estancias.' });
      alEvento({ tipo: 'fin' });
    });
    await montar();
    await act(async () => boton(EJEMPLOS[0]).click());
    expect(api.preguntarAlAsistente).toHaveBeenCalledWith(expect.objectContaining({ pregunta: EJEMPLOS[0] }));
    expect(api.preguntarAlAsistente.mock.calls[0][0].conversacionId).toBeUndefined();
    expect(respuestas()).toEqual(['Hay 6 estancias.']);
  });

  it('muestra qué busca mientras tanto y arma la respuesta de a poco, con enlaces', async () => {
    let terminar;
    api.preguntarAlAsistente.mockImplementationOnce(
      ({ alEvento }) =>
        new Promise((resolve) => {
          alEvento({ tipo: 'buscando', texto: 'Buscando el potrero 8.1…' });
          terminar = () => {
            alEvento({ tipo: 'texto', texto: 'En [EG 8.1](/pecuaria/potreros/8) hay ' });
            alEvento({ tipo: 'texto', texto: '**272 terneros chicos**.' });
            alEvento({ tipo: 'fin' });
            resolve();
          };
        }),
    );
    await montar();
    escribir('¿Qué hay en el 8.1?');
    await act(async () => enviarBoton().click());
    expect(contenedor.querySelector('[role="status"]').textContent).toBe('Buscando el potrero 8.1…');
    expect(enviarBoton().disabled).toBe(true);
    await act(async () => terminar());
    expect(respuestas()).toEqual(['En EG 8.1 hay 272 terneros chicos.']);
    expect(contenedor.querySelector('[data-testid="respuesta"] a').getAttribute('href')).toBe('/pecuaria/potreros/8');
    expect(contenedor.querySelector('[role="status"]')).toBeNull();
  });

  it('en el celular, tocar un enlace de la respuesta cierra el cajón', async () => {
    api.historialAsistente.mockResolvedValueOnce({
      consultas: [{ id: 1, pregunta: 'p', respuesta: 'Mirá [EG 8.1](/pecuaria/potreros/8).', creadaEn: new Date().toISOString() }],
      hayMas: false,
    });
    window.matchMedia = vi.fn(() => ({ matches: false }));
    await montar();
    await act(async () => contenedor.querySelector('[data-testid="respuesta"] a').click());
    expect(onCerrar).toHaveBeenCalled();
  });

  it('fase 2: la propuesta llega como tarjeta; Confirmar la registra una sola vez', async () => {
    const venceEn = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const propuesta = {
      id: 7,
      estado: 'PENDIENTE',
      venceEn,
      tarjeta: {
        titulo: 'Mover 30 Terneros de 8.1 a 12',
        renglones: ['8.1: 100 → 70 cab.', '12: vacío → 30 cab.'],
        avisos: ['Quedan juntas dos categorías'],
        link: '/pecuaria/potreros/12',
      },
    };
    api.estadoAsistente.mockResolvedValue({ configurado: true, puedeRegistrar: true });
    api.preguntarAlAsistente.mockImplementation(async ({ alEvento }) => {
      alEvento({ tipo: 'propuesta', propuesta });
      alEvento({ tipo: 'texto', texto: 'Te dejé la propuesta para confirmar.' });
      alEvento({ tipo: 'fin' });
    });
    let terminar;
    api.confirmarPropuesta.mockImplementation(() => new Promise((resolve) => (terminar = () => resolve({ ...propuesta, estado: 'CONFIRMADA' }))));
    await montar();
    expect(boton(EJEMPLO_ACCION)).toBeDefined();
    escribir('Mové 30 terneros del 8.1 al 12');
    await act(async () => enviarBoton().click());
    const tarjeta = contenedor.querySelector('[data-testid="tarjeta-propuesta"]');
    expect(tarjeta.textContent).toContain('Mover 30 Terneros de 8.1 a 12');
    expect(tarjeta.textContent).toContain('12: vacío → 30 cab.');
    expect(tarjeta.querySelector('[data-testid="avisos-propuesta"]').textContent).toContain('Quedan juntas dos categorías');

    await act(async () => boton('Confirmar').click());
    expect(boton('Registrando…').disabled).toBe(true);
    await act(async () => boton('Registrando…').click());
    expect(api.confirmarPropuesta).toHaveBeenCalledTimes(1);
    expect(api.confirmarPropuesta).toHaveBeenCalledWith(7);
    await act(async () => terminar());
    expect(contenedor.querySelector('[data-testid="estado-propuesta"]').textContent).toBe('✓ Registrado · Ver');
    expect(contenedor.querySelector('[data-testid="estado-propuesta"] a').getAttribute('href')).toBe('/pecuaria/potreros/12');
    expect(boton('Confirmar')).toBeUndefined();
  });

  it('fase 2: sin permiso de registrar, no hay ejemplo de acción', async () => {
    api.estadoAsistente.mockResolvedValue({ configurado: true, puedeRegistrar: false });
    await montar();
    expect(boton(EJEMPLO_ACCION)).toBeUndefined();
    expect(contenedor.textContent).not.toContain('Confirmar');
  });

  it('fase 2: Cancelar no confirma; el historial trae cada tarjeta con su estado', async () => {
    const hoy = new Date().toISOString();
    const venceEn = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    api.historialAsistente.mockResolvedValueOnce({
      consultas: [
        {
          id: 2,
          pregunta: 'pasto',
          respuesta: 'Listo.',
          creadaEn: hoy,
          propuestas: [
            { id: 1, estado: 'CANCELADA', venceEn, tarjeta: { titulo: 'Pasto de 1 potrero' } },
            { id: 2, estado: 'PENDIENTE', venceEn, tarjeta: { titulo: 'Pasto de 2 potreros' } },
          ],
        },
      ],
      hayMas: false,
    });
    api.cancelarPropuesta.mockResolvedValue({ id: 2, estado: 'CANCELADA', venceEn, tarjeta: { titulo: 'Pasto de 2 potreros' } });
    await montar();
    const tarjetas = () => [...contenedor.querySelectorAll('[data-testid="tarjeta-propuesta"]')];
    expect(tarjetas()[0].textContent).toContain('Cancelada');
    await act(async () => boton('Cancelar').click());
    expect(api.cancelarPropuesta).toHaveBeenCalledWith(2);
    expect(api.confirmarPropuesta).not.toHaveBeenCalled();
    expect(tarjetas()[1].textContent).toContain('Cancelada');
  });

  it('Enter manda y Shift+Enter no', async () => {
    api.preguntarAlAsistente.mockImplementation(async ({ alEvento }) => alEvento({ tipo: 'texto', texto: 'Listo.' }));
    await montar();
    escribir('hola');
    await act(async () => campo().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true })));
    expect(api.preguntarAlAsistente).not.toHaveBeenCalled();
    await act(async () => campo().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(api.preguntarAlAsistente).toHaveBeenCalledTimes(1);
  });

  it('el teclado (27/11): en el celular no se abre solo; Enviar no lo cierra; al cerrar el cajón, se va', async () => {
    const antes = window.matchMedia;
    try {
      // Celular (dedo): al abrir, el cursor no va a la caja (no salta el teclado).
      window.matchMedia = vi.fn(() => ({ matches: false }));
      await montar();
      expect(document.activeElement).not.toBe(campo());
      const aside = contenedor.querySelector('[data-testid="panel-asistente"]');
      expect(aside.className).toContain('sigue-teclado');
      expect(campo().getAttribute('enterkeyhint')).toBe('send');
      // Tocar Enviar no le saca el cursor a la caja.
      const toque = new Event('pointerdown', { bubbles: true, cancelable: true });
      enviarBoton().dispatchEvent(toque);
      expect(toque.defaultPrevented).toBe(true);
      // Al cerrar el cajón, la caja pierde el cursor (se cierra el teclado).
      campo().focus();
      expect(document.activeElement).toBe(campo());
      await montar(false);
      expect(document.activeElement).not.toBe(campo());
      // En la compu (mouse), al abrir el cursor va a la caja.
      window.matchMedia = vi.fn(() => ({ matches: true }));
      await montar(true);
      expect(document.activeElement).toBe(campo());
    } finally {
      window.matchMedia = antes;
    }
  });

  it('los errores se ven en la respuesta', async () => {
    api.preguntarAlAsistente
      .mockImplementationOnce(async ({ alEvento }) => alEvento({ tipo: 'error', mensaje: 'Se terminó el saldo de Anthropic.' }))
      .mockRejectedValueOnce(Object.assign(new Error('x'), { status: 401 }));
    await montar();
    escribir('uno');
    await act(async () => enviarBoton().click());
    expect(respuestas()[0]).toContain('Se terminó el saldo de Anthropic.');
    escribir('dos');
    await act(async () => enviarBoton().click());
    expect(respuestas()[1]).toContain('Tu sesión venció');
  });

  it('sin configurar, lo dice y no muestra dónde escribir', async () => {
    api.estadoAsistente.mockResolvedValue({ configurado: false });
    await montar();
    expect(contenedor.textContent).toContain('todavía no está configurado');
    expect(campo()).toBeNull();
  });
});
