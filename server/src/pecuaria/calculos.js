// Cálculos de carga de un potrero. Nunca se guardan: se calculan cada vez,
// así no quedan totales viejos como en la planilla.
//   Kilos     = cabezas × peso promedio (las líneas sin peso no suman)
//   Cab./ha   = cabezas / hectáreas
//   Kg PV/ha  = kilos / hectáreas
//   UG/ha     = Kg PV/ha / kg por UG (parámetro, hoy 380)
// Sin hectáreas, o con hectáreas "a confirmar", no hay valores por hectárea.

const r2 = (n) => Math.round(n * 100) / 100;

export function calcularPotrero({ hectareas, hectareasAConfirmar, lineas }, kgPorUg) {
  const cabezas = lineas.reduce((s, l) => s + l.cabezas, 0);
  const kilos = lineas.reduce((s, l) => s + (l.pesoPromedioKg ? l.cabezas * l.pesoPromedioKg : 0), 0);
  const kilosCompletos = lineas.every((l) => l.pesoPromedioKg || l.cabezas === 0);
  const ha = !hectareasAConfirmar && hectareas > 0 ? hectareas : null;
  return {
    cabezas,
    kilos: r2(kilos),
    kilosCompletos,
    cabHa: ha ? r2(cabezas / ha) : null,
    kgPvHa: ha ? r2(kilos / ha) : null,
    ugHa: ha ? r2(kilos / ha / kgPorUg) : null,
  };
}

export const kilosLinea = (l) => (l.pesoPromedioKg ? r2(l.cabezas * l.pesoPromedioKg) : null);
