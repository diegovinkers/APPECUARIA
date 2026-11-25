// La hoja "Eventos" (diseño docs/superpowers/specs/2026-11-20-eventos-design.md):
// lo que se les hace a los animales sin moverlos. Los tipos y sus nombres
// salen del catálogo (efecto REGISTRO y activos); el grupo de cada uno se
// define acá, por su clave. Un tipo nuevo creado en Configuración va a "Otros".
// Pesada y Recuento van arriba y grandes (lo más usado).

export const GRUPO_EVENTO = {
  PESADA: 'Peso',
  RECUENTO: 'Control',
  VACUNA_AFTOSA: 'Sanidad',
  VACUNA_CARBUNCLO: 'Sanidad',
  TRATAMIENTO: 'Sanidad',
  ECOGRAFIA: 'Reproducción',
  INSEMINACION: 'Reproducción',
  ENTORE: 'Reproducción',
  ABORTO: 'Reproducción',
  FIN_SERVICIO: 'Reproducción',
  DESTETE: 'Reproducción',
  CASTRACION: 'Manejo',
  IDENTIFICACION: 'Manejo',
  // En el boceto aprobado, la alimentación va con el manejo.
  ALIMENTACION: 'Manejo',
};

// Los grupos de abajo, en orden, con su título.
export const GRUPOS = [
  { grupo: 'Sanidad', titulo: 'Sanidad' },
  { grupo: 'Reproducción', titulo: 'Reproducción (hembras)' },
  { grupo: 'Manejo', titulo: 'Manejo' },
  { grupo: 'Otros', titulo: 'Otros' },
];

// Los grandes de arriba.
export const DESTACADOS = ['Peso', 'Control'];

// Nombres cortos para los botones (el del catálogo va en el título del camino).
const CORTO = {
  VACUNA_CARBUNCLO: 'Carbunclo',
  TRATAMIENTO: 'Otro tratamiento',
  IDENTIFICACION: 'Caravaneo',
  ENTORE: 'Entore',
  FIN_SERVICIO: 'Fin del servicio',
};

export const ICONO_EVENTO = { PESADA: 'pesada', RECUENTO: 'recuento' };

export const grupoDe = (tipo) => GRUPO_EVENTO[tipo.clave] ?? 'Otros';
export const nombreCorto = (tipo) => CORTO[tipo.clave] ?? tipo.nombre;

// Los eventos que se pueden anotar: efecto REGISTRO y activos. La parición no:
// mueve animales y se carga desde su proceso (Procesos). El destete
// sí, aunque mueve (pedido de Diego, 24/11: salió del "+"): pregunta de qué
// proceso es y, si es suelto, va a la pantalla del destete (no al camino).
export const esDestete = (tipo) => tipo?.clave === 'DESTETE';
export const tiposDeEvento = (tipos = []) =>
  tipos.filter((t) => (t.efecto === 'REGISTRO' || esDestete(t)) && t.activo !== false && t.clave !== 'PARICION');

// Destete suelto: los potreros con las madres al lado de los terneros (dos
// lotes o más), y a dónde va después de elegir el lote de los terneros.
export const potrerosParaDestete = (potreros = []) => potreros.filter((p) => (p.stock?.lotes ?? []).filter((l) => l.cabezas > 0).length >= 2);
export const rutaDestete = (potreroId, loteId) => `/pecuaria/mover?potrero=${potreroId}&lote=${loteId}&destete=1`;

// { destacados: [tipos], grupos: [{ grupo, titulo, tipos }] } (los vacíos no van).
export function agruparEventos(tipos = []) {
  const lista = tiposDeEvento(tipos).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.nombre.localeCompare(b.nombre));
  return {
    destacados: lista.filter((t) => DESTACADOS.includes(grupoDe(t))),
    grupos: GRUPOS.map((g) => ({ ...g, tipos: lista.filter((t) => grupoDe(t) === g.grupo) })).filter((g) => g.tipos.length),
  };
}

// ¿El tipo se le puede aplicar a una categoría de ese sexo? (sin sexo: sí)
export const sexoCorresponde = (tipo, sexo) => !tipo?.sexo || tipo.sexo === 'CUALQUIERA' || !sexo || sexo === tipo.sexo;

// Qué datos pide cada tipo en el paso 3 (además de la fecha y la nota).
//   'pesada' · 'recuento' · 'ecografia' · 'producto' · 'alimentacion' · 'cabezas'
export function formularioDe(tipo) {
  switch (tipo?.clave) {
    case 'PESADA':
      return 'pesada';
    case 'RECUENTO':
      return 'recuento';
    case 'ECOGRAFIA':
      return 'ecografia';
    case 'VACUNA_AFTOSA':
    case 'VACUNA_CARBUNCLO':
    case 'TRATAMIENTO':
      return 'producto';
    case 'ALIMENTACION':
      return 'alimentacion';
    default:
      return 'cabezas';
  }
}

// --- Usados hace poco (en este celular) ---
// Lo último que se eligió en "a quién": potreros y lotes. Se guarda en este
// navegador; si no se puede (modo privado), simplemente no hay recientes.

const CLAVE_RECIENTES = 'sapsa.eventos.recientes';
const MAX_RECIENTES = 6;

export function leerRecientes() {
  try {
    const lista = JSON.parse(localStorage.getItem(CLAVE_RECIENTES) ?? '[]');
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

// items: [{ tipo: 'lote' | 'potrero', id, campoId }]. Los más nuevos primero, sin repetir.
export function guardarRecientes(items) {
  const clave = (x) => `${x.tipo}-${x.id}`;
  const nuevos = new Set(items.map(clave));
  const lista = [...items, ...leerRecientes().filter((x) => !nuevos.has(clave(x)))].slice(0, MAX_RECIENTES);
  try {
    localStorage.setItem(CLAVE_RECIENTES, JSON.stringify(lista));
  } catch {
    // Sin almacenamiento: no quedan recientes.
  }
  return lista;
}
