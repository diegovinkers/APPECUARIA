import { describe, expect, it } from 'vitest';
import { EVENTOS, PANEL, PRINCIPAL, REGISTRAR, inicioPara, menuPara, puede, rutaEvento } from './menu.js';

const PECUARIA_TODO = ['pecuaria:ANULAR', 'pecuaria:CREAR', 'pecuaria:EDITAR', 'pecuaria:VER'];
const superadmin = { nombre: 'Superadmin', esSuperadmin: true, roles: [], permisos: [] };
const encargado = { nombre: 'Encargado', esSuperadmin: false, permisos: PECUARIA_TODO };
const capataz = { nombre: 'Capataz', esSuperadmin: false, permisos: ['pecuaria:CREAR', 'pecuaria:VER'] };
const direccion = { nombre: 'Dirección', esSuperadmin: false, permisos: ['auditoria:VER', 'pecuaria:VER'] };
const admin = { nombre: 'Admin', esSuperadmin: false, permisos: ['roles:VER', 'usuarios:CREAR', 'usuarios:EDITAR', 'usuarios:VER'] };
const sinRol = { nombre: 'Sin rol', esSuperadmin: false, permisos: [] };
const claves = (items) => items.map((i) => i.clave);
const panel = (user) => Object.fromEntries(menuPara(user).panel.map((g) => [g.grupo, claves(g.items)]));

describe('menuPara', () => {
  it('el superadmin ve todo: lo diario, el panel completo y todo el "+"', () => {
    const m = menuPara(superadmin);
    expect(claves(m.principal)).toEqual(['resumen', 'potreros', 'movimientos']);
    expect(panel(superadmin)).toEqual({
      Campo: ['pecuaria', 'parcelas'],
      Pecuaria: ['importar', 'configuracion'],
      Administración: ['usuarios', 'roles'],
    });
    expect(claves(m.registrar)).toEqual(claves(REGISTRAR));
  });

  it('el encargado: todo Pecuaria, nada de Administración', () => {
    expect(panel(encargado)).toEqual({ Campo: ['pecuaria', 'parcelas'], Pecuaria: ['importar', 'configuracion'] });
    expect(menuPara(encargado).registrar).toHaveLength(REGISTRAR.length);
  });

  it('el capataz: ve y registra, pero no importa ni configura', () => {
    expect(panel(capataz)).toEqual({ Campo: ['pecuaria', 'parcelas'] });
    expect(claves(menuPara(capataz).principal)).toEqual(['resumen', 'potreros', 'movimientos']);
    expect(menuPara(capataz).registrar).toHaveLength(REGISTRAR.length);
  });

  it('Dirección: mira, sin el "+"', () => {
    expect(claves(menuPara(direccion).principal)).toEqual(['resumen', 'potreros', 'movimientos']);
    expect(menuPara(direccion).registrar).toEqual([]);
  });

  it('un administrador sin Pecuaria ve solo Administración', () => {
    const m = menuPara(admin);
    expect(m.principal).toEqual([]);
    expect(panel(admin)).toEqual({ Administración: ['usuarios', 'roles'] });
  });

  it('sin sesión, con la contraseña por cambiar o sin rol, no hay menú', () => {
    for (const user of [null, { ...superadmin, debeCambiarPassword: true }, sinRol]) {
      const m = menuPara(user);
      expect(m.principal).toEqual([]);
      expect(m.panel).toEqual([]);
      expect(m.registrar).toEqual([]);
    }
  });

  it('"Parcelas · pronto" se muestra pero sin dirección', () => {
    const parcelas = PANEL.flatMap((g) => g.items).find((i) => i.clave === 'parcelas');
    expect(parcelas.pronto).toBe(true);
    expect(parcelas.ruta).toBeUndefined();
  });
});

describe('inicioPara', () => {
  it('la primera pantalla que puede usar', () => {
    expect(inicioPara(capataz)).toBe('/pecuaria/resumen');
    expect(inicioPara(admin)).toBe('/users');
    expect(inicioPara(sinRol)).toBe('/profile');
  });
});

describe('puede', () => {
  it('el superadmin puede todo; los demás, lo que den sus roles', () => {
    expect(puede(null, undefined)).toBe(true);
    expect(puede(null, 'pecuaria:VER')).toBe(false);
    expect(puede(superadmin, 'usuarios:ANULAR')).toBe(true);
    expect(puede(capataz, 'pecuaria:CREAR')).toBe(true);
    expect(puede(capataz, 'pecuaria:ANULAR')).toBe(false);
    expect(puede(direccion, 'pecuaria:CREAR')).toBe(false);
  });
});

describe('la lista', () => {
  it('cada ítem con dirección pide un permiso con el formato del servidor (modulo:ACCION)', () => {
    const todos = [...PRINCIPAL, ...PANEL.flatMap((g) => g.items), ...REGISTRAR];
    for (const item of todos) if (!item.pronto) expect(item.requiere, item.clave).toMatch(/^[a-z-]+:(VER|CREAR|EDITAR|APROBAR|ANULAR)$/);
  });

  it('las acciones del "+" arman la dirección de la pantalla que ya existe', () => {
    const por = Object.fromEntries(REGISTRAR.map((a) => [a.clave, a]));
    expect(por.mover.destino(3, 7)).toBe('/pecuaria/mover?potrero=3&lote=7');
    expect(por.categoria.destino(3, 7)).toBe('/pecuaria/mover?potrero=3&lote=7&cambio=categoria');
    // Cada entrada y cada salida, con su tipo ya elegido.
    expect(por.nacimiento.destino(3)).toBe('/pecuaria/registrar?efecto=ENTRA&potrero=3&tipo=NACIMIENTO');
    expect(por.trasladoEntrada.destino(3)).toBe('/pecuaria/registrar?efecto=ENTRA&potrero=3&tipo=TRASLADO_ENTRADA');
    expect(por.venta.destino(3, 7)).toBe('/pecuaria/registrar?efecto=SALE&potrero=3&lote=7&tipo=VENTA');
    expect(por.perdida.destino(3, 7)).toBe('/pecuaria/registrar?efecto=SALE&potrero=3&lote=7&tipo=PERDIDA');
    expect(por.correccion.destino(3)).toBe('/pecuaria/potreros/3');
    // Destete (eventos, paso 5): el lote de los terneros, en un potrero con las madres.
    expect(por.destete.destino(3, 7)).toBe('/pecuaria/mover?potrero=3&lote=7&destete=1');
    expect(por.destete.minLotes).toBe(2);
    // Paso 5: van directo a su pantalla (cada una pregunta lo suyo).
    expect(por.entreCampos.pide).toBeUndefined();
    expect(por.entreCampos.destino()).toBe('/pecuaria/mover-entre-campos');
    expect(por.multiple.destino()).toBe('/pecuaria/movimiento-multiple');
  });
});

describe('el "+" ordenado y el botón Eventos (20/11)', () => {
  it('el "+" en el orden del boceto: mover arriba (el primero grande), entra y sale, y la corrección abajo', () => {
    const de = (seccion) => REGISTRAR.filter((a) => a.seccion === seccion).map((a) => a.texto);
    expect(de('mover')).toEqual(['Mover de potrero', 'Cambio de categoría', 'Destete', 'Mover entre campos', 'Movimiento múltiple']);
    expect(de('entra')).toEqual(['Nacimiento', 'Compra', 'Traslado']);
    expect(de('sale')).toEqual(['Venta', 'Muerte', 'Traslado', 'Consumo', 'Pérdida']);
    expect(de('otro')).toEqual(['Corrección de stock']);
    expect(REGISTRAR.filter((a) => a.grande).map((a) => a.clave)).toEqual(['mover']);
  });

  it('"Eventos" pide registrar (pecuaria:CREAR): el capataz lo tiene, Dirección no', () => {
    expect(EVENTOS.requiere).toBe('pecuaria:CREAR');
    expect(menuPara(capataz).eventos).toBe(EVENTOS);
    expect(menuPara(superadmin).eventos).toBe(EVENTOS);
    expect(menuPara(direccion).eventos).toBeNull();
    expect(menuPara(null).eventos).toBeNull();
  });

  it('la dirección del camino de un evento, con lo de dónde se abrió', () => {
    expect(rutaEvento(5)).toBe('/pecuaria/eventos/nuevo?tipo=5');
    expect(rutaEvento(5, { potrero: 10 })).toBe('/pecuaria/eventos/nuevo?tipo=5&potrero=10');
    expect(rutaEvento(5, { lote: 7 })).toBe('/pecuaria/eventos/nuevo?tipo=5&lote=7');
  });
});
