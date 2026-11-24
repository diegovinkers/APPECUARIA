// Lo que no se ve de los procesos (diseño
// docs/superpowers/specs/2026-11-20-procesos-design.md): nombres, textos de
// los botones, el filtro de campañas, cuándo se ofrece "Empieza un servicio"
// y el cuerpo para crear un proceso. Todo puro.

// Con "Todas las estancias", la sigla adelante (como los potreros).
export const nombreProceso = (p, todas) => (todas && p.campo?.sigla ? `${p.campo.sigla} ${p.nombre}` : p.nombre);

const BOTON_ETAPA = {
  INSEMINACION: 'Anotar otro día de inseminación',
  FIN_INSEMINACION: 'Terminar la inseminación',
  DECISION: 'Decidir qué se hace con las vacías',
  FIN_SERVICIO: 'Registrar fin del servicio',
  REPASO: 'Registrar repaso',
  DIAGNOSTICO: 'Registrar diagnóstico',
  REVISION: 'Revisar el diagnóstico',
  ABORTO: 'Registrar abortos',
  PARICION: 'Registrar parición',
  FIN_PARICION: 'Terminó la parición',
  DESTETE: 'Registrar destete',
  TOROS: 'Toros: sacar o traer',
  TANDA: 'Sumar otra tanda',
  BAJA: 'Registrar una baja (muerte)',
};
export const textoBotonEtapa = (clave) => BOTON_ETAPA[clave] ?? 'Registrar';

// Las etapas que ya tienen su pantalla (las demás llegan en los pasos siguientes).
export const ETAPAS_CON_PANTALLA = new Set(['INSEMINACION', 'FIN_INSEMINACION', 'FIN_SERVICIO', 'REPASO', 'ABORTO', 'DIAGNOSTICO', 'REVISION', 'DECISION', 'PARICION', 'FIN_PARICION', 'DESTETE', 'TOROS', 'BAJA']);

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
//     reparto: { [loteId]: [{ potreroId, cabezas, toros }] } (repartirlas en potreros).
//     destinos: { [loteId]: potreroId } (IATF: a dónde van las inseminadas).
//   Uno en curso: los números de antes (enCurso) y el rol de cada lote (roles).
//   toroIds: los toros uno por uno (fase 6), van al potrero de las vacas.
export function cuerpoProceso({ modalidad, campoId, elegidos, cabezas = {}, fecha, nombre, toros, nota, enCurso, roles = {}, reparto = {}, destinos = {}, toroIds = [] }) {
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
    toros: modalidad === 'TOROS' && !toroIds.length ? entero(toros) : undefined,
    asignarToros: modalidad === 'TOROS' && toroIds.length ? toroIds.map((toroId) => ({ toroId })) : undefined,
    lineas: elegidos.map((l) => {
      const n = entero(cabezas[l.loteId]);
      const filas = (reparto[l.loteId] ?? [])
        .filter((r) => r.potreroId && entero(r.cabezas))
        .map((r) => sinIndefinidos({ potreroId: Number(r.potreroId), cabezas: entero(r.cabezas), toros: modalidad === 'TOROS' ? entero(r.toros) : undefined }));
      return sinIndefinidos({
        loteId: l.loteId,
        cabezas: n != null && n !== l.cabezas ? n : undefined,
        potreroId: modalidad === 'IATF' && destinos[l.loteId] ? Number(destinos[l.loteId]) : undefined,
        reparto: filas.length ? filas : undefined,
      });
    }),
  });
}

// --- Diagnóstico y decisión (diseño de procesos §8) ---

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const nombreMes = (mes) => MESES[Number(mes.slice(5, 7)) - 1];
const numero = (t) => entero(t) ?? 0;

// Lo cargado de un lote ({ prenadas: { [mes | 'sin']: texto }, vacias: texto })
// como grupos: uno por mes con preñadas (en orden) y las vacías.
export function gruposDiagnostico(d = {}) {
  const grupos = Object.entries(d.prenadas ?? {})
    .filter(([, t]) => numero(t) > 0)
    .sort(([a], [b]) => (a === 'sin' ? 1 : b === 'sin' ? -1 : a.localeCompare(b)))
    .map(([clave, t]) => ({ clave, cabezas: numero(t), nombre: clave === 'sin' ? 'Preñadas (sin mes)' : `Preñadas ${nombreMes(clave)}` }));
  if (numero(d.vacias) > 0) grupos.push({ clave: 'vacias', cabezas: numero(d.vacias), nombre: 'Vacías' });
  return grupos;
}

export const totalDiagnostico = (d = {}) => Object.values(d.prenadas ?? {}).reduce((s, t) => s + numero(t), 0) + numero(d.vacias);

// El destino que se propone: las preñadas se quedan, con la categoría
// sugerida; las vacías, para decidir después.
export function destinoPorDefecto(lote, clase) {
  return clase === 'VACIAS'
    ? { tipo: 'DESPUES', categoriaId: String(lote.sugeridas?.VACIA ?? lote.categoriaId ?? '') }
    : // La preñez no cambia la categoría de la madre (fase 6, docs/PECUARIA.md §9).
      { tipo: 'QUEDAN', categoriaId: String(lote.categoriaId ?? '') };
}

// Un destino de la pantalla → lo que va a la API ({ destino, categoriaId? }).
//   tipo: QUEDAN · POTRERO · DESPUES · REENTORE · SALEN (y, de antes, INVERNADA · VENTA)
//   REENTORE: volver a intentar (a otro potrero, para el próximo servicio).
//   SALEN: solo moverlas (al potrero elegido; salen del proceso).
export function destinoParaApi(d, lote) {
  const cat = d.categoriaId ? { categoriaId: Number(d.categoriaId) } : {};
  switch (d.tipo) {
    case 'QUEDAN':
      return { destino: { potreroId: lote.potrero.id }, ...cat };
    case 'POTRERO':
      return { destino: { potreroId: Number(d.potreroId) }, ...cat };
    case 'INVERNADA':
      return { destino: { invernada: true }, ...cat };
    case 'REENTORE':
      return { destino: { reentore: true, ...(d.potreroId && { potreroId: Number(d.potreroId) }) } };
    case 'SALEN':
      return { destino: { salen: true, potreroId: Number(d.potreroId || lote.potrero.id) }, ...cat };
    case 'VENTA': {
      const precio = String(d.precio ?? '').trim() === '' ? null : Number(String(d.precio).trim().replace(',', '.'));
      return { destino: { venta: sinIndefinidos({ guia: texto(d.guia), ...(precio != null && { precioVentaUsd: precio, precioVentaPor: 'CABEZA' }) }) } };
    }
    default:
      return { destino: { despues: true } };
  }
}

// El cuerpo del diagnóstico: lo cargado de cada lote y la decisión de cada grupo.
//   datos: { [loteId]: { prenadas, vacias } } · destinos: { [loteId]: { [clave]: destino } }
export function cuerpoDiagnostico({ fecha, metodo, lotes, datos = {}, destinos = {}, nota }) {
  const lineas = lotes.map((l) => {
    const d = datos[l.loteId] ?? {};
    const prenadas = Object.fromEntries(Object.entries(d.prenadas ?? {}).filter(([, t]) => numero(t) > 0).map(([mes, t]) => [mes, numero(t)]));
    return { loteId: l.loteId, prenadas, vacias: numero(d.vacias) };
  });
  const decision = lotes.map((l) => ({
    loteId: l.loteId,
    grupos: gruposDiagnostico(datos[l.loteId]).map((g) => {
      const clase = g.clave === 'vacias' ? 'VACIAS' : 'PRENADAS';
      return { clave: g.clave, ...destinoParaApi(destinos[l.loteId]?.[g.clave] ?? destinoPorDefecto(l, clase), l) };
    }),
  }));
  return sinIndefinidos({ fecha, metodo, nota: texto(nota), lineas, decision });
}

// --- Eventos: "¿De qué proceso?" (pedido de Diego, 20/11) ---

// En qué etapa del proceso cae cada evento de reproducción, según la etapa
// en que está el proceso.
const ETAPA_DEL_EVENTO = {
  ENTORE: { SERVICIO: 'REPASO' },
  FIN_SERVICIO: { SERVICIO: 'FIN_SERVICIO' },
  ECOGRAFIA: { SERVICIO: 'DIAGNOSTICO', ESPERA_DIAGNOSTICO: 'DIAGNOSTICO', PRENEZ: 'REVISION', PARICION: 'REVISION' },
  ABORTO: { PRENEZ: 'ABORTO', PARICION: 'ABORTO' },
  // Con crías al pie (desde que empiezan a parir).
  DESTETE: { PARICION: 'DESTETE', CRIA: 'DESTETE' },
};
export const NOMBRE_ETAPA = {
  INICIO: 'inicio del servicio',
  INSEMINACION: 'día de inseminación',
  FIN_INSEMINACION: 'fin de la inseminación',
  REPASO: 'repaso',
  FIN_SERVICIO: 'fin del servicio',
  DIAGNOSTICO: 'diagnóstico',
  REVISION: 'revisión del diagnóstico',
  ABORTO: 'aborto',
  DESTETE: 'destete',
};

// Los procesos abiertos donde ese evento tiene sentido, con la etapa que le
// toca: [{ proceso, etapa }]. El del lote de donde se abrió, primero.
export function procesosParaEvento(clave, procesos = [], { loteId = null } = {}) {
  const mapa = ETAPA_DEL_EVENTO[clave];
  if (!mapa) return [];
  const lista = procesos.filter((p) => mapa[p.etapa]).map((p) => ({ proceso: p, etapa: mapa[p.etapa] }));
  if (loteId == null) return lista;
  return [...lista.filter((x) => x.proceso.loteIds?.includes(loteId)), ...lista.filter((x) => !x.proceso.loteIds?.includes(loteId))];
}

// Los eventos que pueden ser de un proceso.
export const EVENTOS_DE_PROCESO = new Set(Object.keys(ETAPA_DEL_EVENTO));

export const ofreceNuevoServicio = (tipo) => tipo?.clave === 'ENTORE' || tipo?.clave === 'INSEMINACION';

// "Anotarla suelta" / "Anotarlo suelto", según el evento.
export const textoSuelto = (tipo) =>
  tipo?.clave === 'DESTETE' ? 'Destetar sin proceso' : ['ECOGRAFIA', 'INSEMINACION', 'PESADA'].includes(tipo?.clave) ? 'Anotarla suelta' : 'Anotarlo suelto';

// --- Sugerencias y cronograma (docs/PECUARIA.md §9, fase 5) ---

// Entore o inseminación (la modalidad del proceso; IA es la de antes de los ajustes).
export const textoTipo = (modalidad) => (modalidad === 'IATF' || modalidad === 'IA' ? 'Inseminación' : 'Entore');

// Cómo se ve cada estado de una sugerencia: la tarjeta, el punto del
// cronograma y la etiqueta corta.
export const ESTILO_SUGERENCIA = {
  PENDIENTE: { tarjeta: 'border-suelo-300 bg-superficie', punto: 'bg-suelo-200 text-suelo-600', etiqueta: 'Pendiente', marca: '○' },
  PROXIMA: { tarjeta: 'border-trigo-500 bg-trigo-100', punto: 'bg-trigo-500 text-trigo-900', etiqueta: 'Se acerca', marca: '•' },
  HOY: { tarjeta: 'border-campo-600 bg-campo-50', punto: 'bg-boton text-white', etiqueta: 'Hoy', marca: '●' },
  ATRASADA: { tarjeta: 'border-red-500 bg-red-50', punto: 'bg-red-600 text-white', etiqueta: 'Atrasada', marca: '!' },
  HECHA: { tarjeta: 'border-campo-300 bg-superficie', punto: 'bg-boton text-white', etiqueta: 'Hecha', marca: '✓' },
  DESCARTADA: { tarjeta: 'border-suelo-200 bg-suelo-50', punto: 'bg-suelo-200 text-suelo-400', etiqueta: 'Descartada', marca: '–' },
};
export const estiloSugerencia = (estado) => ESTILO_SUGERENCIA[estado] ?? ESTILO_SUGERENCIA.PENDIENTE;

// Lo corto que va en la lista: "faltan 5 días", "hoy", "atrasada 3 días".
export function diasCorto(item) {
  if (!item) return '';
  if (item.estado === 'HOY') return item.hasta ? 'en curso' : 'hoy';
  if (item.estado === 'ATRASADA') {
    const n = item.hasta ? null : -item.dias;
    return n ? `atrasada ${n === 1 ? '1 día' : `${n} días`}` : 'atrasada';
  }
  if (item.dias == null) return '';
  return item.dias === 1 ? 'falta 1 día' : `faltan ${item.dias} días`;
}

// A dónde lleva "Registrar" de una sugerencia: la pantalla de su etapa (que
// ya trae los lotes del proceso elegidos), o "+ Nuevo proceso" enganchado a
// este para el nuevo entore. null si todavía no tiene pantalla.
export function rutaRegistrar(procesoId, item) {
  if (!item) return null;
  if (item.etapa === 'NUEVO_ENTORE') return `/pecuaria/procesos/nuevo?desde=${procesoId}`;
  return ETAPAS_CON_PANTALLA.has(item.etapa) ? `/pecuaria/procesos/${procesoId}/etapa/${item.etapa}` : null;
}

// Se puede descartar lo abierto (no el inicio, ni lo hecho).
export const sePuedeDescartar = (item) => item.clave !== 'INICIO' && !['HECHA', 'DESCARTADA'].includes(item.estado);

// Los lotes del proceso agrupados por estado (en el orden de los estados),
// con el nombre de Configuración y el total de cabezas de los que siguen.
const ORDEN_ROL = ['SIN_SERVIR', 'VIENTRES', 'PRENADAS', 'VACIAS', 'PARIDAS', 'CRIAS', 'LIBRES'];
export function lotesPorEstado(lotes = [], nombres = {}) {
  const grupos = new Map();
  for (const l of lotes) {
    const rol = l.activo ? l.rol : 'LIBRES';
    if (!grupos.has(rol)) grupos.set(rol, { rol, nombre: nombres[rol] ?? rol, cabezas: 0, lotes: [] });
    const g = grupos.get(rol);
    g.lotes.push(l);
    if (l.activo) g.cabezas += l.cabezas ?? 0;
  }
  return [...grupos.values()].sort((a, b) => ORDEN_ROL.indexOf(a.rol) - ORDEN_ROL.indexOf(b.rol));
}
