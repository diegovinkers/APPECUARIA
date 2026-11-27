// El Markdown chico de las respuestas del asistente (27/11).
import { describe, expect, it } from 'vitest';
import { bloquesDeTexto, trozos } from './asistenteFormato.jsx';

describe('bloquesDeTexto', () => {
  it('párrafos, listas y tablas', () => {
    const texto = [
      'En La Gateada hay **2.399 terneros**.',
      'Segundo renglón del mismo párrafo.',
      '',
      '- [EG Frente A](/pecuaria/potreros/55): 982',
      '- EG Cerro: 575',
      '',
      '1. primero',
      '2. segundo',
      '',
      '| Potrero | Cab. |',
      '|---|---:|',
      '| 8.1 | 272 |',
      '| 10.3 | 350 |',
      '## Un título',
    ].join('\n');
    expect(bloquesDeTexto(texto)).toEqual([
      { tipo: 'parrafo', texto: 'En La Gateada hay **2.399 terneros**.\nSegundo renglón del mismo párrafo.' },
      { tipo: 'lista', ordenada: false, items: ['[EG Frente A](/pecuaria/potreros/55): 982', 'EG Cerro: 575'] },
      { tipo: 'lista', ordenada: true, items: ['primero', 'segundo'] },
      { tipo: 'tabla', encabezado: ['Potrero', 'Cab.'], filas: [['8.1', '272'], ['10.3', '350']] },
      { tipo: 'parrafo', texto: 'Un título' },
    ]);
  });

  it('una tabla que todavía está llegando no rompe', () => {
    expect(bloquesDeTexto('| Potrero | Ca')).toEqual([{ tipo: 'tabla', encabezado: ['Potrero', 'Ca'], filas: [] }]);
    expect(bloquesDeTexto('')).toEqual([]);
  });
});

describe('trozos', () => {
  it('negrita y enlaces de la app', () => {
    expect(trozos('Hay **100** en [EG 8.1](/pecuaria/potreros/8).')).toEqual([
      { tipo: 'texto', texto: 'Hay ' },
      { tipo: 'negrita', texto: '100' },
      { tipo: 'texto', texto: ' en ' },
      { tipo: 'enlace', texto: 'EG 8.1', href: '/pecuaria/potreros/8' },
      { tipo: 'texto', texto: '.' },
    ]);
  });

  it('los escapes de Markdown se muestran sin la barra', () => {
    expect(trozos('\\* Hectáreas a confirmar')).toEqual([{ tipo: 'texto', texto: '* Hectáreas a confirmar' }]);
    expect(trozos('1,00\\* y **2.399**')).toEqual([
      { tipo: 'texto', texto: '1,00* y ' },
      { tipo: 'negrita', texto: '2.399' },
    ]);
  });

  it('un enlace a otro sitio queda como texto', () => {
    expect(trozos('[sitio](https://ejemplo.test)')).toEqual([{ tipo: 'texto', texto: 'sitio' }]);
    expect(trozos('[x](//ejemplo.test)')).toEqual([{ tipo: 'texto', texto: 'x' }]);
  });
});
