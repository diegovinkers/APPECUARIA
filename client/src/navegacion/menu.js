// Toda la navegación de la app sale de esta lista (docs/DECISIONES.md §11).
// Cada ítem dice qué permiso pide en `requiere`; menuPara(user) deja solo lo
// que ese usuario puede usar. Se diseña para el que ve todo y cada uno ve su
// parte.
//
// `requiere` es 'modulo:ACCION', igual que en el servidor (requirePermission).
// Los permisos del usuario llegan en /verify (user.permisos).
//
// Ocultar algo acá es comodidad visual: quien protege los datos es la API.

// Trabajo diario: barra de abajo en el celular, navbar en la compu.
export const PRINCIPAL = [
  { clave: 'resumen', texto: 'Resumen', ruta: '/pecuaria/resumen', icono: 'resumen', requiere: 'pecuaria:VER' },
  { clave: 'potreros', texto: 'Potreros', ruta: '/pecuaria/potreros', icono: 'potreros', requiere: 'pecuaria:VER' },
  { clave: 'movimientos', texto: 'Movimientos', ruta: '/pecuaria/movimientos', icono: 'movimientos', requiere: 'pecuaria:VER' },
];

// Panel izquierdo, por grupos. Un grupo sin ítems visibles no se muestra.
export const PANEL = [
  {
    grupo: 'Campo',
    items: [
      { clave: 'pecuaria', texto: 'Pecuaria', ruta: '/pecuaria/resumen', activoEn: '/pecuaria', icono: 'pecuaria', requiere: 'pecuaria:VER' },
      { clave: 'parcelas', texto: 'Parcelas', icono: 'parcelas', pronto: true },
    ],
  },
  {
    grupo: 'Pecuaria',
    items: [
      { clave: 'importar', texto: 'Importar planilla', ruta: '/pecuaria/importar', icono: 'importar', requiere: 'pecuaria:EDITAR' },
      { clave: 'configuracion', texto: 'Configuración', ruta: '/pecuaria/configuracion', icono: 'configuracion', requiere: 'pecuaria:EDITAR' },
    ],
  },
  {
    grupo: 'Administración',
    items: [
      { clave: 'usuarios', texto: 'Usuarios', ruta: '/users', icono: 'usuarios', requiere: 'usuarios:VER' },
      { clave: 'roles', texto: 'Roles y permisos', ruta: '/roles', icono: 'roles', requiere: 'roles:VER' },
    ],
  },
];

// Botón "+": todo lo que se registra, y solo desde acá (DECISIONES §11).
// `pide` dice qué hay que elegir antes de ir a la pantalla: el potrero, o el
// potrero y el lote. Sin `pide`, va directo (la pantalla pregunta lo suyo).
export const REGISTRAR = [
  {
    clave: 'mover',
    texto: 'Mover entre potreros',
    icono: 'movimientos',
    pide: 'lote',
    pregunta: '¿De qué potrero salen?',
    destino: (potreroId, loteId) => `/pecuaria/mover?potrero=${potreroId}&lote=${loteId}`,
    requiere: 'pecuaria:CREAR',
  },
  {
    clave: 'entreCampos',
    texto: 'Mover entre campos',
    detalle: 'a otra estancia, con su guía',
    icono: 'traslado',
    destino: () => '/pecuaria/mover-entre-campos',
    requiere: 'pecuaria:CREAR',
  },
  {
    clave: 'multiple',
    texto: 'Movimiento múltiple',
    detalle: 'A → B, B → C… todo junto',
    icono: 'multiple',
    destino: () => '/pecuaria/movimiento-multiple',
    requiere: 'pecuaria:CREAR',
  },
  {
    clave: 'categoria',
    texto: 'Cambio de categoría',
    icono: 'categoria',
    pide: 'lote',
    pregunta: '¿En qué potrero está el lote?',
    destino: (potreroId, loteId) => `/pecuaria/mover?potrero=${potreroId}&lote=${loteId}&cambio=categoria`,
    requiere: 'pecuaria:CREAR',
  },
  {
    clave: 'entrada',
    texto: 'Entrada',
    detalle: 'nacimiento, compra, traslado…',
    icono: 'entrada',
    pide: 'potrero',
    pregunta: '¿A qué potrero entran?',
    destino: (potreroId) => `/pecuaria/registrar?efecto=ENTRA&potrero=${potreroId}`,
    requiere: 'pecuaria:CREAR',
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
    requiere: 'pecuaria:CREAR',
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
    requiere: 'pecuaria:CREAR',
  },
];

// ¿Puede este usuario usar algo que pide `requiere` ('modulo:ACCION')?
// El superadmin puede todo; los demás, lo que den sus roles.
export function puede(user, requiere) {
  if (!requiere) return true;
  if (!user || user.debeCambiarPassword) return false;
  if (user.esSuperadmin) return true;
  return (user.permisos ?? []).includes(requiere);
}

export function menuPara(user) {
  const visible = (item) => item.pronto || puede(user, item.requiere);
  return {
    principal: PRINCIPAL.filter(visible),
    panel: PANEL.map((g) => ({ ...g, items: g.items.filter(visible) })).filter((g) => g.items.some((i) => !i.pronto)),
    registrar: REGISTRAR.filter(visible),
  };
}

// A dónde va al entrar: la primera pantalla que puede usar (para Dirección o
// un capataz, el Resumen; para un administrador sin Pecuaria, Usuarios).
export function inicioPara(user) {
  const m = menuPara(user);
  return m.principal[0]?.ruta ?? m.panel.flatMap((g) => g.items).find((i) => i.ruta)?.ruta ?? '/profile';
}
