import { describe, expect, it, vi } from 'vitest';

vi.mock('./pecuaria', () => ({ opcionPotrero: (p) => p.nombre }));
const { faltaPotrero, listaParaApi, torosLibres } = await import('./TorosProceso.jsx');

describe('elegir toros (fase 6)', () => {
  it('listaParaApi: los elegidos, con su potrero si lo tienen', () => {
    expect(listaParaApi({ 14: '12', 22: '' })).toEqual([{ toroId: 14, potreroId: 12 }, { toroId: 22 }]);
    expect(listaParaApi({})).toEqual([]);
  });

  it('faltaPotrero: algún elegido sin potrero', () => {
    expect(faltaPotrero({ 14: '12', 22: '' })).toBe(true);
    expect(faltaPotrero({ 14: '12' })).toBe(false);
  });

  it('torosLibres: activos y sin otro proceso', () => {
    const toros = [
      { id: 1, activo: true, enProceso: null },
      { id: 2, activo: false, enProceso: null },
      { id: 3, activo: true, enProceso: { proceso: { id: 9 } } },
    ];
    expect(torosLibres(toros).map((t) => t.id)).toEqual([1]);
  });
});
