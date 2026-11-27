import { describe, expect, it } from 'vitest';
import { coincide, prepararBusqueda } from './busqueda';

// Los potreros de La Gateada, en el orden de la lista.
const EG = [
  '8.1', '8.2/3/4/5', '8.8/9', '10.2', '10.3', '42', '42.1', '44.2a', '52.2/3/4', '72.1/2', '72.8', '72.10',
  '81.1/2/3/4', '91.1B', 'Cerro', 'P 1', 'P 10', 'P 15', 'P 55', 'Frente A', 'Frente B', 'Pivot 1', 'Pivot 7', 'Olivera',
];
const buscar = (texto, lista = EG) => lista.filter((n) => coincide(n, prepararBusqueda(texto)));

describe('el buscador de potreros (27/11, pedido de Diego)', () => {
  it('"p1", "P1" y "p 1" encuentran P 1 (y no P 10 ni P 15)', () => {
    for (const texto of ['p1', 'P1', 'p 1', ' P 1 ', 'p.1', 'p-1']) expect(buscar(texto), texto).toEqual(['P 1']);
    expect(buscar('p')).toEqual(['P 1', 'P 10', 'P 15', 'P 55', 'Pivot 1', 'Pivot 7']);
    expect(buscar('p5')).toEqual([]);
    expect(buscar('p55')).toEqual(['P 55']);
  });

  it('"8" trae todos los 8 (no 81 ni 72.8), con o sin punto, barra o espacio al final', () => {
    for (const texto of ['8', '8 ', '8.', '8/', ' 8.. ', '8-']) expect(buscar(texto), texto).toEqual(['8.1', '8.2/3/4/5', '8.8/9']);
  });

  it('las subdivisiones cuentan, y la barra o el espacio valen como punto', () => {
    for (const texto of ['8.3', '8/3', '8 3', '8.2', '8/2/3']) expect(buscar(texto), texto).toEqual(['8.2/3/4/5']);
    expect(buscar('8.9')).toEqual(['8.8/9']);
    expect(buscar('72.2')).toEqual(['72.1/2']);
    expect(buscar('72.1')).toEqual(['72.1/2']); // no 72.10
    expect(buscar('72.10')).toEqual(['72.10']);
    expect(buscar('81.3')).toEqual(['81.1/2/3/4']);
    expect(buscar('44.2')).toEqual(['44.2a']);
    expect(buscar('91.1b')).toEqual(['91.1B']);
  });

  it('las palabras, por su comienzo, sin mayúsculas ni tildes', () => {
    expect(buscar('frente')).toEqual(['Frente A', 'Frente B']);
    expect(buscar('frente b')).toEqual(['Frente B']);
    expect(buscar('PIVOT')).toEqual(['Pivot 1', 'Pivot 7']);
    expect(buscar('pivot 7')).toEqual(['Pivot 7']);
    expect(buscar('oli')).toEqual(['Olivera']);
    expect(coincide('10.3 · Vacas de cría', prepararBusqueda('cria'))).toBe(true);
    expect(coincide('10.3 · Vacas de cría', prepararBusqueda('vacas de'))).toBe(true);
    expect(coincide('Terneros', prepararBusqueda('Tern'))).toBe(true);
  });

  it('con "Todas las estancias", con la sigla adelante: "8" y "eg 8" encuentran "EG 8.1"', () => {
    const todas = ['EG 8.1', 'EG 81.1/2/3/4', 'ES 8', 'ELS P 1'];
    expect(buscar('8', todas)).toEqual(['EG 8.1', 'ES 8']);
    expect(buscar('eg 8', todas)).toEqual(['EG 8.1']);
    expect(buscar('eg8.', todas)).toEqual(['EG 8.1']);
    expect(buscar('p1', todas)).toEqual(['ELS P 1']);
  });

  it('sin texto (o solo espacios y puntos), todos', () => {
    expect(prepararBusqueda('  . ')).toBe('');
    expect(buscar('')).toEqual(EG);
  });
});
