// Toda la navegación de la app sale de esta lista (docs/DECISIONES.md §11).
// Cada ítem dice qué permiso pide en `requiere`; menuPara(user) deja solo lo
// que ese usuario puede usar. Se diseña para el que ve todo y cada uno ve su
// parte.
//
// Hoy (fase 4 postergada) solo existe el superadmin: lo de Pecuaria lo puede
// usar cualquiera con sesión. Cuando lleguen los permisos por rol, cambia solo
// puede(); las pantallas no se tocan.
//
// Ocultar algo acá es comodidad visual: quien protege los datos es la API.

// Trabajo diario: barra de abajo en el celular, navbar en la compu.
export const PRINCIPAL = [
  { clave: 'resumen', texto: 'Resumen', ruta: '/pecuaria/resumen', icono: 'resumen', requiere: 'pecuaria.ver' },
  { clave: 'potreros', texto: 'Potreros', ruta: '/pecuaria/potreros', icono: 'potreros', requiere: 'pecuaria.ver' },
  { clave: 'movimientos', texto: 'Movimientos', ruta: '/pecuaria/movimientos', icono: 'movimientos', requiere: 'pecuaria.ver' },
];

// Panel izquierdo, por grupos. Un grupo sin ítems visibles no se muestra.
export const PANEL = [
  {
    grupo: 'Campo',
    items: [
      { clave: 'pecuaria', texto: 'Pecuaria', ruta: '/pecuaria/resumen', activoEn: '/pecuaria', icono: 'pecuaria', requiere: 'pecuaria.ver' },
      { clave: 'parcelas', texto: 'Parcelas', icono: 'parcelas', pronto: true },
    ],
  },
  {
    grupo: 'Pecuaria',
    items: [
      { clave: 'importar', texto: 'Importar planilla', ruta: '/pecuaria/importar', icono: 'importar', requiere: 'pecuaria.importar' },
      { clave: 'configuracion', texto: 'Configuración', ruta: '/pecuaria/configuracion', icono: 'configuracion', requiere: 'pecuaria.configurar' },
    ],
  },
  {
    grupo: 'Administración',
    items: [{ clave: 'usuarios', texto: 'Usuarios', ruta: '/users', icono: 'usuarios', requiere: 'superadmin' }],
  },
];

// Botón "+": todo lo que se registra. `pide` dice qué hay que elegir antes de
// ir a la pantalla: el potrero, o el potrero y el lote.
export const REGISTRAR = [
  {
    clave: 'mover',
    texto: 'Mover entre potreros',
    icono: 'movimientos',
    pide: 'lote',
    pregunta: '¿De qué potrero salen?',
    destino: (potreroId, loteId) => `/pecuaria/mover?potrero=${potreroId}&lote=${loteId}`,
    requiere: 'pecuaria.registrar',
  },
  {
    clave: 'categoria',
    texto: 'Cambio de categoría',
    icono: 'categoria',
    pide: 'lote',
    pregunta: '¿En qué potrero está el lote?',
    destino: (potreroId, loteId) => `/pecuaria/mover?potrero=${potreroId}&lote=${loteId}&cambio=categoria`,
    requiere: 'pecuaria.registrar',
  },
  {
    clave: 'entrada',
    texto: 'Entrada',
    detalle: 'nacimiento, compra, traslado…',
    icono: 'entrada',
    pide: 'potrero',
    pregunta: '¿A qué potrero entran?',
    destino: (potreroId) => `/pecuaria/registrar?efecto=ENTRA&potrero=${potreroId}`,
    requiere: 'pecuaria.registrar',
  },
  {
    clave: 'salida',
    texto: 'Salida',
    detalle: 'venta, muerte, consumo…',
    icono: 'salir',
    tono: 'salida',
    pide: 'lote',
    pregunta: '¿De qué potrero salen?',
    destino: (potreroId, loteId) => `/pecuaria/registrar?efecto=SALE&potrero=${potreroId}&lote=${loteId}`,
    requiere: 'pecuaria.registrar',
  },
  {
    clave: 'correccion',
    texto: 'Corrección de stock',
    detalle: 'cuando el conteo no coincide',
    icono: 'correccion',
    tono: 'correccion',
    pide: 'potrero',
    pregunta: '¿Qué potrero corregís?',
    destino: (potreroId) => `/pecuaria/potreros/${potreroId}`,
    requiere: 'pecuaria.registrar',
  },
];

// ¿Puede este usuario usar algo que pide `requiere`?
export function puede(user, requiere) {
  if (!requiere) return true;
  if (!user || user.debeCambiarPassword) return false;
  if (user.esSuperadmin) return true;
  if (requiere === 'superadmin') return false;
  // Pecuaria v1: cualquiera con sesión (DECISIONES §10). Fase 4: mirar los permisos.
  return requiere.startsWith('pecuaria.');
}

export function menuPara(user) {
  const visible = (item) => item.pronto || puede(user, item.requiere);
  return {
    principal: PRINCIPAL.filter(visible),
    panel: PANEL.map((g) => ({ ...g, items: g.items.filter(visible) })).filter((g) => g.items.some((i) => !i.pronto)),
    registrar: REGISTRAR.filter(visible),
  };
}
