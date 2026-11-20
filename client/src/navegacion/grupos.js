// Los dos grupos del selector de arriba (feedlots, 19/11): las estancias (y
// granjas) y los feedlots (confinamientos). Se analizan distinto y no se
// suman entre sí. Sin React: lo usan el contexto, el selector y los tests.
export const TODAS = 'todas';
export const FEEDLOTS = 'feedlots';

// El grupo de un campo: 'feedlots' (confinamiento) o 'estancias' (lo demás).
export const grupoDeCampo = (campo) => (campo?.tipo === 'CONFINAMIENTO' ? 'feedlots' : 'estancias');

// Los campos de cada grupo, en el orden en que llegan.
export function separarGrupos(campos = []) {
  return {
    estancias: campos.filter((c) => grupoDeCampo(c) === 'estancias'),
    feedlots: campos.filter((c) => grupoDeCampo(c) === 'feedlots'),
  };
}

// Lo guardado sigue valiendo si existe ("Todas" y "Todos", si el grupo tiene
// más de un campo); si no, el primer campo.
export function seleccionValida(actual, campos) {
  const grupos = separarGrupos(campos);
  if (actual === TODAS && grupos.estancias.length > 1) return TODAS;
  if (actual === FEEDLOTS && grupos.feedlots.length > 1) return FEEDLOTS;
  return campos.some((c) => c.id === actual) ? actual : (campos[0]?.id ?? null);
}

// Cómo se llama lo elegido arriba cuando es un grupo entero.
export const nombreGrupo = (grupo) => (grupo === 'feedlots' ? 'Todos los feedlots' : 'Todas las estancias');
