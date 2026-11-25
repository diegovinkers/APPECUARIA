// Partes puras de la importación de INAC: el enlace en la página, el Excel en
// CSV para Claude, Claude de respaldo (simulado) y la identificación.
import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { INAC, buscarEnlaceSerie, excelComoCsv, userAgent } from '../src/pecuaria/precios.inac.js';
import { MODELO_CLAUDE, crearClienteClaude, extraerConClaude, semanaDeClaude } from '../src/pecuaria/precios.claude.js';
import { hoyUruguay } from '../src/pecuaria/precios.service.js';
import { crearSerie, hojasInac } from './precios-fixture.js';

const PAGINA = new URL('./fixtures/inac/pagina-precios-2026-11-25.html', import.meta.url);

describe('buscarEnlaceSerie', () => {
  it('en la página real encuentra el Excel semanal por su título, no el mensual', async () => {
    const html = await readFile(PAGINA, 'utf8');
    expect(buscarEnlaceSerie(html)).toBe(INAC.EXCEL);
  });

  it('si INAC le cambia el nombre al archivo, lo sigue encontrando por el título', () => {
    const html = `
      <a href="/innovaportal/file/10953/1/serie-mensual.xlsx"><h5>Serie mensual precios de hacienda</h5></a>
      <a class="x" href="/innovaportal/file/99999/1/serie-semanal-precios-hacienda-2027.xlsx">
        <div><h5 class="list-title">Serie semanal precios de hacienda</h5><p>Evoluci&oacute;n semanal</p></div>
      </a>`;
    expect(buscarEnlaceSerie(html)).toBe('https://www.inac.uy/innovaportal/file/99999/1/serie-semanal-precios-hacienda-2027.xlsx');
  });

  it('sin el título: null', () => {
    expect(buscarEnlaceSerie('<a href="/a.xlsx">Serie mensual precios de hacienda</a>')).toBeNull();
    expect(buscarEnlaceSerie('')).toBeNull();
    expect(buscarEnlaceSerie(null)).toBeNull();
  });
});

describe('excelComoCsv (para Claude)', () => {
  it('cada hoja con sus títulos y las últimas semanas', async () => {
    const csv = await excelComoCsv(await crearSerie(hojasInac()));
    expect(csv).toContain('### Hoja NOVILLO');
    expect(csv).toContain('### Hoja OVEJA');
    expect(csv).toContain('VALORES CONTADO - PUESTO EN FRIGORIFICO');
    expect(csv).toMatch(/^2026-11-15,2026-11-21,.*3\.4/m);
    expect(csv.length).toBeLessThan(20_000);
  });
});

const respuesta = (parsed, stop = 'end_turn') => ({ stop_reason: stop, parsed_output: parsed });
const clienteSimulado = (resultado) => ({ messages: { parse: vi.fn(async () => resultado) } });
const LEIDO = {
  semanaDesde: '2026-11-15',
  semanaHasta: '2026-11-21',
  precios: [
    { indicador: 'NOVILLO_4TA', valor: 6.1351 },
    { indicador: 'VACA_4TA', valor: 5.698 },
    { indicador: 'NOVILLO_4TA', valor: 9 },
  ],
};

describe('extraerConClaude (con el cliente simulado)', () => {
  it('con el PDF: lo manda como documento, a Haiku, y devuelve la semana', async () => {
    const cliente = clienteSimulado(respuesta(LEIDO));
    const semana = await extraerConClaude({ cliente, pdf: Buffer.from('%PDF-1.4 prueba') });
    expect(semana).toEqual({ desde: '2026-11-15', hasta: '2026-11-21', valores: { NOVILLO_4TA: 6.135, VACA_4TA: 5.698 } });

    const [pedido] = cliente.messages.parse.mock.calls[0];
    expect(pedido.model).toBe(MODELO_CLAUDE);
    expect(pedido.model).toBe('claude-haiku-5-5');
    expect(pedido.output_config.format).toBeDefined();
    const [documento, texto] = pedido.messages[0].content;
    expect(documento).toEqual({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from('%PDF-1.4 prueba').toString('base64') } });
    expect(texto.text).toContain('NOVILLO_4TA');
  });

  it('con el CSV: lo manda como texto', async () => {
    const cliente = clienteSimulado(respuesta(LEIDO));
    await extraerConClaude({ cliente, csv: '### Hoja NOVILLO\n2026-11-15,...' });
    const [pedido] = cliente.messages.parse.mock.calls[0];
    expect(pedido.messages[0].content).toHaveLength(1);
    expect(pedido.messages[0].content[0].text).toContain('### Hoja NOVILLO');
  });

  it('si se niega, se corta o contesta otra cosa: error claro', async () => {
    await expect(extraerConClaude({ cliente: clienteSimulado(respuesta(null, 'refusal')), csv: 'x' })).rejects.toThrow('Claude no quiso leer el informe.');
    await expect(extraerConClaude({ cliente: clienteSimulado(respuesta(null, 'max_tokens')), csv: 'x' })).rejects.toThrow('quedó cortada');
    await expect(extraerConClaude({ cliente: clienteSimulado(respuesta({ semana: 'ayer' })), csv: 'x' })).rejects.toThrow('no tiene la forma esperada');
    await expect(extraerConClaude({ cliente: clienteSimulado(respuesta({ ...LEIDO, precios: [{ indicador: 'TERNERO', valor: 4 }] })), csv: 'x' }))
      .rejects.toThrow('no tiene la forma esperada');
    const caido = { messages: { parse: vi.fn(async () => { throw new Error('sin conexión'); }) } };
    await expect(extraerConClaude({ cliente: caido, csv: 'x' })).rejects.toThrow('Claude no contestó: sin conexión');
  });

  it('semanaDeClaude: el primero de cada indicador, con 3 decimales', () => {
    expect(semanaDeClaude(LEIDO).valores).toEqual({ NOVILLO_4TA: 6.135, VACA_4TA: 5.698 });
  });

  it('sin ANTHROPIC_API_KEY no hay cliente', () => {
    expect(crearClienteClaude({})).toBeNull();
    expect(crearClienteClaude({ ANTHROPIC_API_KEY: '  ' })).toBeNull();
    expect(crearClienteClaude({ ANTHROPIC_API_KEY: 'sk-ant-de-prueba' })).not.toBeNull();
  });
});

describe('userAgent y hoyUruguay', () => {
  it('la identificación lleva el contacto solo si hay', () => {
    expect(userAgent(null)).toBe('SAPSA-app (uso interno)');
    expect(userAgent('alguien@ejemplo.test')).toBe('SAPSA-app (uso interno; contacto: alguien@ejemplo.test)');
  });

  it('el día en Uruguay (UTC-3)', () => {
    expect(hoyUruguay(new Date('2026-11-26T02:00:00Z'))).toBe('2026-11-25');
    expect(hoyUruguay(new Date('2026-11-26T03:00:00Z'))).toBe('2026-11-26');
  });
});
