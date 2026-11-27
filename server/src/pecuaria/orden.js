// El orden de los potreros en la lista (27/11, pedido de Diego): el de las
// filas de la planilla, salvo los pivots, que van abajo, después de los
// "Frente" (en La Gateada: … P 55, Frente A, Frente B, Pivot 1 … 7, Olivera,
// Pastoreo). Si la estancia no tiene "Frente", los pivots van al final.
// La misma regla está en la migración `pivots_abajo` (para lo ya cargado).

export const esPivot = (nombre) => /^pivot\b/i.test(String(nombre).trim());
const esFrente = (nombre) => /^frente\b/i.test(String(nombre).trim());

// potreros: [{ nombre, … }] en el orden de la planilla → los mismos, en el orden de la lista.
export function ordenDeLaLista(potreros) {
  const pivots = potreros.filter((p) => esPivot(p.nombre));
  if (!pivots.length) return potreros;
  const resto = potreros.filter((p) => !esPivot(p.nombre));
  const ultimoFrente = resto.findLastIndex((p) => esFrente(p.nombre));
  const donde = ultimoFrente === -1 ? resto.length : ultimoFrente + 1;
  return [...resto.slice(0, donde), ...pivots, ...resto.slice(donde)];
}
