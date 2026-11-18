import { describe, expect, it } from 'vitest';
import { PANEL, PRINCIPAL, REGISTRAR, menuPara, puede } from './menu.js';

const superadmin = { nombre: 'Superadmin', esSuperadmin: true, roles: [] };
const capataz = { nombre: 'Capataz', esSuperadmin: false, roles: [{ nombre: 'Capataz' }] };
const claves = (items) => items.map((i) => i.clave);

describe('menuPara', () => {
  it('el superadmin ve todo: lo diario, el panel completo y todo el "+"', () => {
    const m = menuPara(superadmin);
    expect(claves(m.principal)).toEqual(['resumen', 'potreros', 'movimientos']);
    expect(m.panel.map((g) => g.grupo)).toEqual(['Campo', 'Pecuaria', 'Administración']);
    expect(claves(m.panel.find((g) => g.grupo === 'Administración').items)).toEqual(['usuarios']);
    expect(claves(m.registrar)).toEqual(claves(REGISTRAR));
  });

  it('un usuario común no ve Administración (hoy: todo Pecuaria, fase 4 postergada)', () => {
    const m = menuPara(capataz);
    expect(m.panel.map((g) => g.grupo)).toEqual(['Campo', 'Pecuaria']);
    expect(claves(m.principal)).toEqual(['resumen', 'potreros', 'movimientos']);
    expect(m.registrar.length).toBe(REGISTRAR.length);
  });

  it('sin sesión, o con la contraseña por cambiar, no hay menú', () => {
    for (const user of [null, { ...superadmin, debeCambiarPassword: true }]) {
      const m = menuPara(user);
      expect(m.principal).toEqual([]);
      expect(m.panel).toEqual([]);
      expect(m.registrar).toEqual([]);
    }
  });

  it('"Parcelas · pronto" se muestra pero sin dirección', () => {
    const campo = menuPara(capataz).panel.find((g) => g.grupo === 'Campo');
    const parcelas = campo.items.find((i) => i.clave === 'parcelas');
    expect(parcelas.pronto).toBe(true);
    expect(parcelas.ruta).toBeUndefined();
  });
});

describe('puede', () => {
  it('lo que no pide nada lo puede cualquiera; "superadmin" solo el superadmin', () => {
    expect(puede(null, undefined)).toBe(true);
    expect(puede(capataz, 'superadmin')).toBe(false);
    expect(puede(superadmin, 'superadmin')).toBe(true);
    expect(puede(capataz, 'pecuaria.registrar')).toBe(true);
    expect(puede(null, 'pecuaria.ver')).toBe(false);
  });

  it('un permiso que no es de Pecuaria no se regala', () => {
    expect(puede(capataz, 'compras.ver')).toBe(false);
  });
});

describe('la lista', () => {
  it('cada ítem con dirección tiene un permiso declarado (salvo "pronto")', () => {
    const todos = [...PRINCIPAL, ...PANEL.flatMap((g) => g.items), ...REGISTRAR];
    for (const item of todos) if (!item.pronto) expect(item.requiere, item.clave).toBeTruthy();
  });

  it('las acciones del "+" arman la dirección de la pantalla que ya existe', () => {
    const por = Object.fromEntries(REGISTRAR.map((a) => [a.clave, a]));
    expect(por.mover.destino(3, 7)).toBe('/pecuaria/mover?potrero=3&lote=7');
    expect(por.categoria.destino(3, 7)).toBe('/pecuaria/mover?potrero=3&lote=7&cambio=categoria');
    expect(por.entrada.destino(3)).toBe('/pecuaria/registrar?efecto=ENTRA&potrero=3');
    expect(por.salida.destino(3, 7)).toBe('/pecuaria/registrar?efecto=SALE&potrero=3&lote=7');
    expect(por.correccion.destino(3)).toBe('/pecuaria/potreros/3');
  });
});
