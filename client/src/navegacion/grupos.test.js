import { describe, expect, it } from 'vitest';
import { FEEDLOTS, TODAS, grupoDeCampo, nombreGrupo, seleccionValida, separarGrupos } from './grupos.js';

const E1 = { id: 1, nombre: 'Estancia Uno', tipo: 'ESTANCIA' };
const E2 = { id: 2, nombre: 'Granja Dos', tipo: 'GRANJA' };
const F1 = { id: 3, nombre: 'Feedlot Uno', tipo: 'CONFINAMIENTO' };
const F2 = { id: 4, nombre: 'Feedlot Dos', tipo: 'CONFINAMIENTO' };

describe('grupos del selector', () => {
  it('las estancias y granjas por un lado, los confinamientos por otro', () => {
    expect(grupoDeCampo(F1)).toBe('feedlots');
    expect(grupoDeCampo(E2)).toBe('estancias');
    // Sin tipo (datos viejos): estancia.
    expect(grupoDeCampo({ id: 9 })).toBe('estancias');
    expect(separarGrupos([E1, F1, E2, F2])).toEqual({ estancias: [E1, E2], feedlots: [F1, F2] });
  });

  it('lo guardado sigue valiendo si existe; "Todas" y "Todos" solo si el grupo tiene más de uno', () => {
    expect(seleccionValida(TODAS, [E1, E2, F1])).toBe(TODAS);
    expect(seleccionValida(FEEDLOTS, [E1, E2, F1, F2])).toBe(FEEDLOTS);
    expect(seleccionValida(FEEDLOTS, [E1, E2, F1])).toBe(1);
    expect(seleccionValida(TODAS, [E1, F1, F2])).toBe(1);
    expect(seleccionValida(3, [E1, F1])).toBe(3);
    expect(seleccionValida(99, [E1, F1])).toBe(1);
    expect(seleccionValida(null, [])).toBeNull();
  });

  it('cómo se llama cada grupo entero', () => {
    expect(nombreGrupo('estancias')).toBe('Todas las estancias');
    expect(nombreGrupo('feedlots')).toBe('Todos los feedlots');
  });
});
