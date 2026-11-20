// Lo que no se ve de los procesos (diseño
// docs/superpowers/specs/2026-11-20-procesos-design.md): nombres, textos de
// los botones, el filtro de campañas, cuándo se ofrece "Empieza un servicio"
// y el cuerpo para crear un proceso. Todo puro.

// Con "Todas las estancias", la sigla adelante (como los potreros).
export const nombreProceso = (p, todas) => (todas && p.campo?.sigla ? `${p.campo.sigla} ${p.nombre}` : p.nombre);

const BOTON_ETAPA = {
  FIN_SERVICIO: 'Registrar fin del servicio',
  REPASO: 'Registrar repaso',
  DIAGNOSTICO: 'Registrar diagnóstico',
  REVISION: 'Revisar el diagnóstico',
  ABORTO: 'Registrar abortos',
  PARICION: 'Registrar parición',
  FIN_PARICION: 'Terminó la parición',
  DESTETE: 'Registrar destete',
};
export const textoBotonEtapa = (clave) => BOTON_ETAPA[clave] ?? 'Registrar';

// Las etapas que ya tienen su pantalla (las demás llegan en los pasos siguientes).
export const ETAPAS_CON_PANTALLA = new Set(['FIN_SERVICIO', 'REPASO', 'ABORTO']);

// La campaña de una fecha (de julio a junio), como en el servidor.
export function campaniaDe(iso) {
  const anio = Number(iso.slice(0, 4));
  const desde = Number(iso.slice(5, 7)) >= 7 ? anio : anio - 1;
  return `${desde}-${String((desde + 1) % 100).padStart(2, '0')}`;
}

// El filtro de campaña: la de hoy y las dos anteriores.
export function campaniasParaFiltro(hoyIso) {
  const actual = Number(campaniaDe(hoyIso).slice(0, 4));
  return [0, 1, 2].map((k) => `${actual - k}-${String((actual - k + 1) % 100).padStart(2, '0')}`);
}

export const formatoPorcentaje = (n) => (n == null ? '—' : `${n} %`);

// ¿Se ofrece "Empieza un servicio"? Un entore o una inseminación, lote por
// lote, de hembras (o sin sexo) que no estén ya en un proceso abierto.
export function aplicaServicio({ tipo, sel, elegidos, enProceso }) {
  if (tipo?.clave !== 'ENTORE' && tipo?.clave !== 'INSEMINACION') return false;
  if (sel?.nivel !== 'LOTE' || !elegidos?.length) return false;
  return elegidos.every((l) => l.sexo !== 'MACHO' && !enProceso.has(l.loteId));
}

const entero = (t) => (String(t ?? '').trim() === '' ? undefined : Number.parseInt(t, 10));
const texto = (t) => (String(t ?? '').trim() === '' ? undefined : String(t).trim());
const sinIndefinidos = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

// El cuerpo para crear un proceso.
//   Un servicio: los lotes elegidos (con menos cabezas, una parte), la fecha y los toros.
//   Uno en curso: los números de antes (enCurso) y el rol de cada lote (roles).
export function cuerpoProceso({ modalidad, campoId, elegidos, cabezas = {}, fecha, nombre, toros, nota, enCurso, roles = {} }) {
  const base = sinIndefinidos({ campoId, modalidad, nombre: texto(nombre), nota: texto(nota) });
  if (enCurso) {
    return {
      ...base,
      enCurso: sinIndefinidos({
        etapa: enCurso.etapa,
        inicio: enCurso.inicio,
        fin: enCurso.fin,
        servidas: entero(enCurso.servidas),
        prenadas: entero(enCurso.prenadas),
        vacias: entero(enCurso.vacias),
        lotes: elegidos.map((l) => ({ loteId: l.loteId, rol: roles[l.loteId] ?? 'PRENADAS' })),
      }),
    };
  }
  return sinIndefinidos({
    ...base,
    fecha,
    toros: modalidad === 'TOROS' ? entero(toros) : undefined,
    lineas: elegidos.map((l) => {
      const n = entero(cabezas[l.loteId]);
      return n != null && n !== l.cabezas ? { loteId: l.loteId, cabezas: n } : { loteId: l.loteId };
    }),
  });
}
