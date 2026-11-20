// Las plantillas de los procesos (diseño
// docs/superpowers/specs/2026-11-20-procesos-design.md §5): qué etapas tiene
// cada tipo, en orden, y qué evento del catálogo usa cada una. Un tipo de
// proceso nuevo (recría, ciclo de feedlot, plan sanitario) es otra entrada
// acá, sin cambiar el modelo. En la v1 solo está el reproductivo.
//
// Cada etapa:
//   clave   la que se guarda en evento_registro.etapa;
//   tipos   las claves de TipoMovimiento que usa su ancla (el primero, por defecto);
//   unica   una sola vez por proceso y lote (índice único parcial de la base);
//   linea   va en la línea de tiempo de la ficha (el aborto y la revisión no);
//   toma    los roles de los lotes a los que se aplica;
//   mueve   la carga puede hacer movimientos (separar, parir, destetar).

export const PLANTILLAS = {
  REPRODUCTIVO: {
    nombre: 'Servicio',
    etapas: [
      { clave: 'INICIO', nombre: 'Inicio del servicio', tipos: ['ENTORE', 'INSEMINACION'], unica: true, linea: true, toma: ['VIENTRES'] },
      { clave: 'REPASO', nombre: 'Repaso', tipos: ['ENTORE'], unica: true, linea: false, toma: ['VIENTRES'] },
      { clave: 'FIN_SERVICIO', nombre: 'Fin del servicio', tipos: ['FIN_SERVICIO'], unica: true, linea: true, toma: ['VIENTRES'] },
      { clave: 'DIAGNOSTICO', nombre: 'Diagnóstico', tipos: ['ECOGRAFIA'], unica: true, linea: true, toma: ['VIENTRES'], mueve: true },
      { clave: 'REVISION', nombre: 'Revisión del diagnóstico', tipos: ['ECOGRAFIA'], unica: true, linea: false, toma: ['VACIAS', 'PRENADAS'], mueve: true },
      { clave: 'ABORTO', nombre: 'Aborto', tipos: ['ABORTO'], unica: false, linea: false, toma: ['PRENADAS', 'VIENTRES'], mueve: true },
      { clave: 'PARICION', nombre: 'Parición', tipos: ['PARICION'], unica: false, linea: true, toma: ['PRENADAS', 'VIENTRES'], mueve: true },
      { clave: 'FIN_PARICION', nombre: 'Fin de la parición', tipos: ['PARICION'], unica: true, linea: false, toma: ['PRENADAS', 'VIENTRES'], mueve: true },
      { clave: 'DESTETE', nombre: 'Destete', tipos: ['DESTETE'], unica: true, linea: true, toma: ['CRIAS'], mueve: true },
    ],
  },
};

// Las etapas que van una sola vez por proceso y lote: las mismas del índice
// evento_registro_proceso_etapa_unica (migración `procesos`).
export const ETAPAS_UNICAS = new Set(PLANTILLAS.REPRODUCTIVO.etapas.filter((e) => e.unica).map((e) => e.clave));

export const etapaDePlantilla = (clave, tipo = 'REPRODUCTIVO') => PLANTILLAS[tipo].etapas.find((e) => e.clave === clave) ?? null;

// Los tipos de evento que se cuelgan solos de un proceso abierto del lote.
export const TIPOS_REPRODUCCION = new Set(['ENTORE', 'INSEMINACION', 'FIN_SERVICIO', 'ECOGRAFIA', 'ABORTO']);

// Qué etapa le toca a un evento de reproducción de un lote que ya tiene
// `hechas` (las etapas vigentes de ese lote en el proceso). null si el tipo
// no es de reproducción.
export function etapaDe(tipoClave, hechas = []) {
  const ya = new Set(hechas);
  switch (tipoClave) {
    case 'ENTORE':
      return ya.has('INICIO') ? 'REPASO' : 'INICIO';
    case 'INSEMINACION':
      return 'INICIO';
    case 'FIN_SERVICIO':
      return 'FIN_SERVICIO';
    case 'ECOGRAFIA':
      return ya.has('DIAGNOSTICO') ? 'REVISION' : 'DIAGNOSTICO';
    case 'ABORTO':
      return 'ABORTO';
    default:
      return null;
  }
}
