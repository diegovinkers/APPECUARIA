// @vitest-environment jsdom
// El asistente (27/11): la respuesta llega de a poco, dice qué está buscando,
// los enlaces van a las fichas y la conversación sigue con su id.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  estadoAsistente: vi.fn(),
  preguntarAlAsistente: vi.fn(),
}));
vi.mock('../api/asistente', () => api);

const { default: AsistentePage, EJEMPLOS } = await import('./AsistentePage.jsx');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('la pantalla del asistente', () => {
  let contenedor;
  let root;
  beforeEach(() => {
    contenedor = document.createElement('div');
    document.body.appendChild(contenedor);
    root = createRoot(contenedor);
    api.estadoAsistente.mockReset().mockResolvedValue({ configurado: true, modelo: 'claude-haiku-5-5' });
    api.preguntarAlAsistente.mockReset();
  });
  afterEach(() => {
    act(() => root.unmount());
    contenedor.remove();
  });

  const montar = async () => {
    act(() =>
      root.render(
        <MemoryRouter initialEntries={['/asistente']}>
          <Routes>
            <Route path="/asistente" element={<AsistentePage />} />
          </Routes>
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

  it('sin mensajes muestra los ejemplos; tocar uno lo pregunta', async () => {
    api.preguntarAlAsistente.mockImplementation(async ({ alEvento }) => {
      alEvento({ tipo: 'conversacion', id: 'c1' });
      alEvento({ tipo: 'texto', texto: 'Hay 6 estancias.' });
      alEvento({ tipo: 'fin' });
    });
    await montar();
    const botones = [...contenedor.querySelectorAll('button')].filter((b) => EJEMPLOS.includes(b.textContent));
    expect(botones).toHaveLength(EJEMPLOS.length);
    await act(async () => botones[0].click());
    expect(api.preguntarAlAsistente).toHaveBeenCalledWith(expect.objectContaining({ pregunta: EJEMPLOS[0], conversacionId: null }));
    expect(respuestas()).toEqual(['Hay 6 estancias.']);
  });

  it('muestra qué busca mientras tanto, arma la respuesta de a poco y la conversación sigue', async () => {
    let terminar;
    api.preguntarAlAsistente.mockImplementationOnce(
      ({ alEvento }) =>
        new Promise((resolve) => {
          alEvento({ tipo: 'conversacion', id: 'c1' });
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
    expect(contenedor.textContent).toContain('¿Qué hay en el 8.1?');
    expect(contenedor.querySelector('[role="status"]').textContent).toBe('Buscando el potrero 8.1…');
    expect(enviarBoton().disabled).toBe(true);

    await act(async () => terminar());
    expect(respuestas()).toEqual(['En EG 8.1 hay 272 terneros chicos.']);
    const enlace = contenedor.querySelector('[data-testid="respuesta"] a');
    expect(enlace.getAttribute('href')).toBe('/pecuaria/potreros/8');
    expect(contenedor.querySelector('[data-testid="respuesta"] strong').textContent).toBe('272 terneros chicos');
    expect(contenedor.querySelector('[role="status"]')).toBeNull();

    api.preguntarAlAsistente.mockImplementationOnce(async ({ alEvento }) => alEvento({ tipo: 'texto', texto: 'De nada.' }));
    escribir('Gracias');
    await act(async () => enviarBoton().click());
    expect(api.preguntarAlAsistente).toHaveBeenLastCalledWith(expect.objectContaining({ conversacionId: 'c1', pregunta: 'Gracias' }));
    expect(respuestas()).toEqual(['En EG 8.1 hay 272 terneros chicos.', 'De nada.']);
  });

  it('Enter manda y Shift+Enter no; "Nueva conversación" empieza de cero', async () => {
    api.preguntarAlAsistente.mockImplementation(async ({ alEvento }) => {
      alEvento({ tipo: 'conversacion', id: 'c9' });
      alEvento({ tipo: 'texto', texto: 'Listo.' });
    });
    await montar();
    escribir('hola');
    await act(async () => campo().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true })));
    expect(api.preguntarAlAsistente).not.toHaveBeenCalled();
    await act(async () => campo().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(api.preguntarAlAsistente).toHaveBeenCalledTimes(1);

    const nueva = [...contenedor.querySelectorAll('button')].find((b) => b.textContent === 'Nueva conversación');
    await act(async () => nueva.click());
    expect(respuestas()).toEqual([]);
    escribir('otra');
    await act(async () => enviarBoton().click());
    expect(api.preguntarAlAsistente).toHaveBeenLastCalledWith(expect.objectContaining({ conversacionId: null }));
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
