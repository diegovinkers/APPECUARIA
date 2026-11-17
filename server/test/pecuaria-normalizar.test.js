import { describe, expect, it } from 'vitest';
import { normalizarTexto } from '../src/pecuaria/normalizar.js';

describe('normalizarTexto (para comparar lo que dice la planilla con los catálogos)', () => {
  it('pasa a minúsculas y saca espacios de más', () => {
    expect(normalizarTexto('  FESTUCA   Nueva ')).toBe('festuca nueva');
  });

  it('saca las tildes, pero deja la puntuación', () => {
    expect(normalizarTexto('Campo Natúral')).toBe('campo natural');
    expect(normalizarTexto('VAQ. PARIDA')).toBe('vaq. parida');
    expect(normalizarTexto('pp+')).toBe('pp+');
  });

  it('vacío, solo espacios o null dan cadena vacía', () => {
    expect(normalizarTexto('   ')).toBe('');
    expect(normalizarTexto(null)).toBe('');
    expect(normalizarTexto(undefined)).toBe('');
  });

  it('convierte números a texto (la planilla a veces trae el potrero como número)', () => {
    expect(normalizarTexto(42.1)).toBe('42.1');
  });
});
