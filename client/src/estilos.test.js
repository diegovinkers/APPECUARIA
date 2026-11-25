import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Las variantes propias de index.css (el navegador de los tests no mide
// pantallas: se controla que la regla esté escrita).
const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');

describe('index.css', () => {
  it('acostado: el celular horizontal y bajito', () => {
    expect(css).toMatch(/@custom-variant acostado \(@media \(orientation: landscape\) and \(max-height: 500px\)\);/);
  });

  it('md pide también más de 500 px de alto: el celular acostado sigue con el diseño del celular (25/11)', () => {
    expect(css).toMatch(/@custom-variant md \(@media \(min-width: 48rem\) and \(min-height: 501px\)\);/);
  });
});
