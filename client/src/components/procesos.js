// Lo que no se ve de los procesos (diseño
// docs/superpowers/specs/2026-11-20-procesos-design.md): nombres, textos de
// los botones, el filtro de campañas, cuándo se ofrece "Empieza un servicio"
// y el cuerpo para crear un proceso. Todo puro.

// Las formas de servicio (proceso.datos.modalidad), como en el servidor
// (procesos.modalidad.js): TOROS (entore), IATF (IA: la de antes de los
// ajustes del 20/11) y TE (transferencia de embriones, 26/11: como la IATF,
// por tandas; las no aptas van al toro).
export const porTandas = (modalidad) => modalidad === 'IATF' || modalidad === 'IA' || modalidad === 'TE';
export const esEmbriones = (modalidad) => modalidad === 'TE';
export const normalizarModalidad = (modalidad) => (modalidad === 'TE' ? 'TE' : porTandas(modalidad) ? 'IATF' : 'TOROS');

// Las palabras de cada forma de servicio, para las pantallas de crear y de otra tanda.
export function palabrasServicio(modalidad) {
  if (esEmbriones(modalidad)) {
    return {
      verbo: 'se transfieren',
      hechas: 'transferidas',
      sin: 'no aptas',
      aServir: 'a transferir',
      fecha: 'Fecha de la transferencia',
      pregunta: '¿A cuántas se les transfirió?',
      ayuda: 'Dejalo vacío si se transfirió a todo el lote. Las que no (no aptas) van al toro: quedan en otro potrero que las transferidas.',
    };
  }
  if (porTandas(modalidad)) {
    return {
      verbo: 'se inseminan',
      hechas: 'inseminadas',
      sin: 'sin inseminar',
      aServir: 'a inseminar',
      fecha: 'Fecha de la inseminación',
      pregunta: '¿Cuántas se van a inseminar?',
      ayuda: 'Dejalo vacío si se insemina todo el lote. Las que no, quedan aparte como "sin inseminar", para otro día (en otro potrero que las inseminadas).',
    };
  }
  return { verbo: 'entran', hechas: 'servidas', sin: 'no entran', aServir: 'entran', fecha: 'Fecha de inicio', pregunta: '¿Cuántas entran al servicio?', ayuda: 'Dejalo vacío si entran todas.' };
}

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

// Los tipos de evento que empiezan un servicio (entore, IATF o transferencia).
const EMPIEZAN_SERVICIO = new Set(['ENTORE', 'INSEMINACION', 'TRANSFERENCIA_EMBRIONES']);

// ¿Se ofrece "Empieza un servicio"? Un entore, una inseminación o una
// transferencia de embriones, lote por lote, de hembras (o sin sexo) que no
// estén ya en un proceso abierto.
export function aplicaServicio({ tipo, sel, elegidos, enProceso }) {
  if (!EMPIEZAN_SERVICIO.has(tipo?.clave)) return false;
  if (sel?.nivel !== 'LOTE' || !elegidos?.length) return false;
  return elegidos.every((l) => l.sexo !== 'MACHO' && !enProceso.has(l.loteId));
}

const entero = (t) => (String(t ?? '').trim() === '' ? undefined : Number.parseInt(t, 10));
const texto = (t) => (String(t ?? '').trim() === '' ? undefined : String(t).trim());
const sinIndefinidos = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

// El cuerpo para crear un proceso.
//   Un servicio: los lotes elegidos (con menos cabezas, una parte), la fecha y los toros.
//     reparto: { [loteId]: [{ potreroId, cabezas, toros }] } (repartirlas en potreros).
//     destinos: { [loteId]: potreroId } (IATF o TE: a dónde van las inseminadas o transferidas).
//     sinInseminarA: { [loteId]: potreroId } (IATF o TE de una parte: a dónde van las sin inseminar o no aptas, R2).
//     embriones: { usados, detalle } (TE: cuántos embriones se usaron y de cuáles).
//   Uno en curso: los números de antes (enCurso) y el rol de cada lote (roles).
//   toroIds: los toros uno por uno (fase 6), van al potrero de las vacas.
export function cuerpoProceso({ modalidad, campoId, elegidos, cabezas = {}, fecha, nombre, toros, nota, enCurso, roles = {}, reparto = {}, destinos = {}, sinInseminarA = {}, toroIds = [], embriones = {} }) {
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
  const tandas = porTandas(modalidad);
  const deEmbriones = esEmbriones(modalidad) ? sinIndefinidos({ usados: entero(embriones.usados), detalle: texto(embriones.detalle) }) : {};
  return sinIndefinidos({
    ...base,
    fecha,
    embriones: Object.keys(deEmbriones).length ? deEmbriones : undefined,
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
        potreroId: tandas && destinos[l.loteId] ? Number(destinos[l.loteId]) : undefined,
        sinInseminarA: tandas && sinInseminarA[l.loteId] ? Number(sinInseminarA[l.loteId]) : undefined,
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

// El destino que se propone: las preñadas se quedan, con su categoría; las
// vacías no tienen destino hasta que se elige (reglas del campo: ya no hay
// "decidir después"), con la categoría de invernar sugerida para el engorde.
export function destinoPorDefecto(lote, clase) {
  return clase === 'VACIAS'
    ? { tipo: '', categoriaId: String(lote.sugeridas?.VACIA ?? lote.categoriaId ?? '') }
    : // La preñez no cambia la categoría de la madre (fase 6, docs/PECUARIA.md §9).
      { tipo: 'QUEDAN', categoriaId: String(lote.categoriaId ?? '') };
}

// Un destino de la pantalla → lo que va a la API ({ destino, categoriaId? }).
//   tipo: QUEDAN · POTRERO · ENTORE · ENGORDE (reglas del campo) y, de antes,
//   DESPUES · REENTORE · SALEN · INVERNADA · VENTA.
//   ENTORE: las vacías de una IATF, al entore con toros (una sola vez).
//   ENGORDE: salen del proceso, con la categoría de invernar.
export function destinoParaApi(d, lote) {
  const cat = d.categoriaId ? { categoriaId: Number(d.categoriaId) } : {};
  const potrero = d.potreroId ? { potreroId: Number(d.potreroId) } : {};
  switch (d.tipo) {
    case 'ENTORE':
      return { destino: { reentore: true, ...potrero } };
    case 'ENGORDE':
      return { destino: { invernada: true, ...potrero }, ...cat };
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

// --- La ecografía con las reglas del campo (R1/R4, 25/11) ---
//
// Preñadas y vacías se separan siempre: se van las vacías, las preñadas o las
// dos (a potreros distintos). Si hoy se ecografía solo una parte, las sin
// ecografiar se quedan y se van las dos. Las vacías tienen destino: entore
// con toros (solo las de una IATF) o engorde. Las preñadas de varios meses
// pueden separarse por mes, cada mes a su potrero.
//   e (lo elegido en la pantalla): { seVan: VACIAS | PRENADAS | DOS, vaciasA: ENTORE | ENGORDE,
//     potreroVacias, potreroPrenadas, porMes, potreroMes: { [mes]: id }, categoriaVacias }

// Lo que hay para decidir en un lote: los grupos, las sin ecografiar, si se
// pregunta quiénes se van y si se puede separar por mes.
export function opcionesEcografia(lote, d = {}) {
  const grupos = gruposDiagnostico(d);
  const prenadas = grupos.filter((g) => g.clave !== 'vacias');
  const vacias = grupos.find((g) => g.clave === 'vacias') ?? null;
  const sinEcografiar = Math.max(0, (lote.cabezas ?? 0) - totalDiagnostico(d));
  return {
    prenadas,
    vacias,
    sinEcografiar,
    // Solo se pregunta si hay los dos grupos y nadie más queda en el potrero.
    pregunta: Boolean(vacias && prenadas.length && !sinEcografiar),
    porMes: prenadas.length > 1,
  };
}

// Quiénes tienen que irse a otro potrero sí o sí: { prenadas, vacias }.
export function quienesSeVan(lote, d = {}, e = {}) {
  const o = opcionesEcografia(lote, d);
  if (o.sinEcografiar) return { prenadas: o.prenadas.length > 0, vacias: Boolean(o.vacias) };
  if (!o.pregunta) return { prenadas: false, vacias: false };
  const seVan = e.seVan ?? 'VACIAS';
  return { prenadas: seVan === 'PRENADAS' || seVan === 'DOS', vacias: seVan === 'VACIAS' || seVan === 'DOS' };
}

// El potrero final de cada grupo ({ [clave]: id }): el elegido o, si no se
// va, el del lote. Un grupo que se tiene que ir y no tiene potrero queda null.
function potrerosEcografia(lote, d, e = {}) {
  const o = opcionesEcografia(lote, d);
  const van = quienesSeVan(lote, d, e);
  const aca = lote.potrero?.id ?? null;
  const elegido = (v) => (v ? Number(v) : null);
  const r = {};
  for (const g of o.prenadas) {
    const p = o.porMes && e.porMes ? elegido(e.potreroMes?.[g.clave]) : elegido(e.potreroPrenadas);
    r[g.clave] = van.prenadas ? p : (p ?? aca);
  }
  if (o.vacias) r.vacias = van.vacias ? elegido(e.potreroVacias) : (elegido(e.potreroVacias) ?? aca);
  return r;
}

const mayuscula = (t) => `${t.charAt(0).toUpperCase()}${t.slice(1)}`;

// Lo que falta (o está mal) para seguir, en palabras; null si está todo.
export function faltaEcografia(lote, d = {}, e = {}, { iatf = false } = {}) {
  const o = opcionesEcografia(lote, d);
  if (!o.prenadas.length && !o.vacias) return 'Escribí las preñadas y las vacías';
  if (o.vacias && iatf && !e.vaciasA) return 'Elegí qué pasa con las vacías: entore con toros o engorde';
  const van = quienesSeVan(lote, d, e);
  const p = potrerosEcografia(lote, d, e);
  const aca = lote.potrero?.id ?? null;
  for (const [clave, id] of Object.entries(p)) {
    const seVa = clave === 'vacias' ? van.vacias : van.prenadas;
    if (seVa && (id == null || id === aca)) return `Elegí a qué potrero van las ${clave === 'vacias' ? 'vacías' : 'preñadas'}`;
  }
  // Ningún estado en el mismo potrero que otro (las sin ecografiar se quedan
  // en el del lote). Las preñadas sin separar por mes son un solo grupo.
  const ocupados = new Map();
  if (o.sinEcografiar) ocupados.set(aca, 'las sin ecografiar');
  const grupos = o.porMes && e.porMes ? o.prenadas.map((g) => [g.clave, `las ${g.nombre.toLowerCase()}`]) : o.prenadas.length ? [[o.prenadas[0].clave, 'las preñadas']] : [];
  if (o.vacias) grupos.push(['vacias', 'las vacías']);
  for (const [clave, nombre] of grupos) {
    const id = p[clave];
    if (ocupados.has(id)) return `${mayuscula(nombre)} y ${ocupados.get(id)} no pueden quedar en el mismo potrero`;
    ocupados.set(id, nombre);
  }
  return null;
}

// Los grupos para la API: [{ clave, destino, categoriaId? }].
export function gruposEcografia(lote, d = {}, e = {}, { iatf = false } = {}) {
  const o = opcionesEcografia(lote, d);
  const p = potrerosEcografia(lote, d, e);
  const grupos = o.prenadas.map((g) => ({ clave: g.clave, destino: { potreroId: p[g.clave] ?? lote.potrero?.id } }));
  if (o.vacias) {
    const aEntore = iatf && e.vaciasA === 'ENTORE';
    const potrero = p.vacias ? { potreroId: p.vacias } : {};
    const categoria = e.categoriaVacias ?? lote.sugeridas?.VACIA;
    grupos.push({
      clave: 'vacias',
      destino: aEntore ? { reentore: true, ...potrero } : { invernada: true, ...potrero },
      ...(!aEntore && categoria && { categoriaId: Number(categoria) }),
    });
  }
  return grupos;
}

// El cuerpo del diagnóstico: lo cargado de cada lote y la decisión de cada grupo.
//   datos: { [loteId]: { prenadas, vacias } } · elecciones: { [loteId]: e } · iatf: el proceso es una IATF
export function cuerpoDiagnostico({ fecha, metodo, lotes, datos = {}, elecciones = {}, nota, iatf = false }) {
  const lineas = lotes.map((l) => {
    const d = datos[l.loteId] ?? {};
    const prenadas = Object.fromEntries(Object.entries(d.prenadas ?? {}).filter(([, t]) => numero(t) > 0).map(([mes, t]) => [mes, numero(t)]));
    return { loteId: l.loteId, prenadas, vacias: numero(d.vacias) };
  });
  const decision = lotes.map((l) => ({ loteId: l.loteId, grupos: gruposEcografia(l, datos[l.loteId], elecciones[l.loteId], { iatf }) }));
  return sinIndefinidos({ fecha, metodo, nota: texto(nota), lineas, decision });
}

// --- IATF: inseminar una parte (R1/R2) ---
// Con menos inseminadas que el lote se va un grupo: las inseminadas
// (potreroId) o las sin inseminar (sinInseminarA). Con todas, se pueden quedar.
//   d: { cabezas (texto; vacío = todas), seVan: INSEMINADAS | SIN, potreroId }
//   modalidad: en una transferencia de embriones, "transferidas" y "no aptas".
export function separarIatf(lote, d = {}, modalidad = 'IATF') {
  const w = palabrasServicio(modalidad);
  const n = entero(d.cabezas) ?? lote.cabezas;
  const parte = n < lote.cabezas;
  const potrero = d.potreroId ? Number(d.potreroId) : null;
  const seVan = d.seVan ?? 'INSEMINADAS';
  let falta = null;
  if (!(n > 0)) falta = `Escribí cuántas ${w.verbo}`;
  else if (n > lote.cabezas) falta = `El lote tiene ${lote.cabezas}`;
  else if (parte && (!potrero || potrero === lote.potrero?.id)) {
    falta = `Elegí a qué potrero van las ${seVan === 'SIN' ? `${lote.cabezas - n} ${w.sin}` : `${n} ${w.hechas}`}`;
  }
  const api = !potrero || potrero === lote.potrero?.id ? {} : parte && seVan === 'SIN' ? { sinInseminarA: potrero } : { potreroId: potrero };
  return { n, parte, sinInseminar: lote.cabezas - n, falta, api };
}

// --- Destete (R9): terneros y vacas, cada uno con su destino ---
//   d: { potreroId (terneros), madresPotreroId (vacío = se quedan) }
export function faltaDestete(lote, d = {}) {
  if (!d.potreroId) return 'Elegí a qué potrero van los terneros';
  const vacas = d.madresPotreroId ? Number(d.madresPotreroId) : (lote.potrero?.id ?? null);
  if (Number(d.potreroId) === vacas) return 'Los terneros y las vacas no pueden quedar en el mismo potrero';
  return null;
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

export const ofreceNuevoServicio = (tipo) => EMPIEZAN_SERVICIO.has(tipo?.clave);

// "Anotarla suelta" / "Anotarlo suelto", según el evento.
export const textoSuelto = (tipo) =>
  tipo?.clave === 'DESTETE' ? 'Destetar sin proceso' : ['ECOGRAFIA', 'INSEMINACION', 'TRANSFERENCIA_EMBRIONES', 'PESADA'].includes(tipo?.clave) ? 'Anotarla suelta' : 'Anotarlo suelto';

// --- Sugerencias y cronograma (docs/PECUARIA.md §9, fase 5) ---

// Entore, inseminación o embriones (la modalidad del proceso; IA es la de antes de los ajustes).
export const textoTipo = (modalidad) => (esEmbriones(modalidad) ? 'Embriones' : porTandas(modalidad) ? 'Inseminación' : 'Entore');

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
