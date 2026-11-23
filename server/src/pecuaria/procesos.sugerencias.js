// El motor de sugerencias de los procesos (docs/PECUARIA.md §9, fase 4): el
// cronograma de un proceso con la fecha esperada y la real de cada etapa, y
// lo que sigue ("Fin del entore: faltan 5 días (01/03/2027)"). Puro, para
// probarlo sin base. Reemplaza a proximas() de procesos.calculos.js.
//
// La fecha real manda: cada fecha esperada se cuenta desde lo que pasó de
// verdad (el fin del entore cargado, las tandas de inseminación, las tandas
// de parición). La app propone; si la realidad se sale del plan, avisa
// (atrasada) pero no bloquea.
//
// Estados de una sugerencia:
//   PENDIENTE  todavía falta (más que los días de aviso)
//   PROXIMA    falta poco (dentro de los días de aviso)
//   HOY        es hoy (o, en una ventana como la parición, está en curso)
//   ATRASADA   la fecha (o la ventana) ya pasó y no se cargó
//   HECHA      se cargó (la fecha real)
//   DESCARTADA el usuario la descartó (no va a pasar en este proceso)
import { embudo, etapaActual } from './procesos.calculos.js';
import { PLAZOS_INICIALES, fechaPlazo } from './procesos.plazos.js';

export const ESTADOS_SUGERENCIA = ['PENDIENTE', 'PROXIMA', 'HOY', 'ATRASADA', 'HECHA', 'DESCARTADA'];
const ABIERTOS = new Set(['PENDIENTE', 'PROXIMA', 'HOY', 'ATRASADA']);

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fechaUY = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const nombreMes = (mes) => MESES[Number(mes.slice(5, 7)) - 1];
const num = (v) => (v == null || v === '' ? 0 : Number(v));
const minimo = (lista) => [...lista].filter(Boolean).sort()[0] ?? null;
const maximo = (lista) => [...lista].filter(Boolean).sort().at(-1) ?? null;
const fmt = (n) => n.toLocaleString('es-UY');

// Días de `desde` a `hasta` (negativo si `hasta` es antes).
export const diasEntre = (desde, hasta) => Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000);

// El estado de una sugerencia. Con `hasta` es una ventana (la parición).
export function estadoDe({ fecha, hasta = null, avisoDias = 7, real = null, descartada = false, hoy }) {
  if (real) return 'HECHA';
  if (descartada) return 'DESCARTADA';
  if (!fecha) return 'PENDIENTE';
  if (hasta) {
    if (hoy > hasta) return 'ATRASADA';
    if (hoy >= fecha) return 'HOY';
  } else {
    if (hoy > fecha) return 'ATRASADA';
    if (hoy === fecha) return 'HOY';
  }
  return diasEntre(hoy, fecha) <= avisoDias ? 'PROXIMA' : 'PENDIENTE';
}

const faltan = (n) => (n === 1 ? 'falta 1 día' : `faltan ${n} días`);
const dias = (n) => (n === 1 ? '1 día' : `${n} días`);

// Lo que se muestra al lado del nombre.
export function textoDe({ estado, fecha, hasta, real, hoy }) {
  if (estado === 'HECHA') return `hecha el ${fechaUY(real)}`;
  if (estado === 'DESCARTADA') return 'descartada';
  if (!fecha) return 'sin fecha todavía';
  if (hasta) {
    if (estado === 'HOY') return `en curso hasta el ${fechaUY(hasta)}`;
    if (estado === 'ATRASADA') return `se pasó la fecha hace ${dias(diasEntre(hasta, hoy))} (${fechaUY(fecha)} al ${fechaUY(hasta)})`;
    return `${faltan(diasEntre(hoy, fecha))} (${fechaUY(fecha)} al ${fechaUY(hasta)})`;
  }
  if (estado === 'HOY') return `es hoy (${fechaUY(fecha)})`;
  if (estado === 'ATRASADA') return `atrasada ${dias(diasEntre(fecha, hoy))} (${fechaUY(fecha)})`;
  return `${faltan(diasEntre(hoy, fecha))} (${fechaUY(fecha)})`;
}

const de = (anclas, etapa) => anclas.filter((a) => a.etapa === etapa);
const prenadasDe = (datos) => {
  const p = datos?.prenadas;
  return p != null && typeof p === 'object' ? Object.values(p).reduce((s, n) => s + num(n), 0) : num(p);
};
const diagnosticadas = (diags) => diags.reduce((s, d) => s + prenadasDe(d.datos) + num(d.datos?.vacias), 0);

// Las tandas de servicio: cada fecha en que entraron animales (el inicio, cada
// día de IATF y las que pasan al repaso con toro), con sus lotes y cabezas.
function tandasDeServicio(a) {
  const deServicio = [...de(a, 'INICIO'), ...de(a, 'TANDA'), ...de(a, 'INSEMINACION'), ...de(a, 'FIN_INSEMINACION').filter((x) => x.datos?.destino === 'REPASO')];
  const porFecha = new Map();
  for (const x of deServicio) {
    const t = porFecha.get(x.fecha) ?? { fecha: x.fecha, loteIds: new Set(), cabezas: 0, repaso: false };
    if (x.etapa === 'FIN_INSEMINACION') t.repaso = true;
    if (x.loteId != null) t.loteIds.add(x.loteId);
    t.cabezas += num(x.cabezas);
    porFecha.set(x.fecha, t);
  }
  return [...porFecha.values()].sort((x, y) => x.fecha.localeCompare(y.fecha));
}

// El cronograma y lo que sigue.
//   proceso     { modalidad: TOROS | IATF, estado: ABIERTO | CERRADO | ANULADO }
//   anclas      los eventos de las etapas ({ etapa, loteId, fecha, cabezas, datos, anulado })
//   lotes       los lotes del proceso ({ loteId, rol, mes, activo })
//   plazos      los de Configuración (procesos.configuracion.js); si falta, los iniciales
//   hoy         AAAA-MM-DD
//   descartadas las claves que el usuario descartó (proceso.datos.descartadas)
//   siguientes  los procesos enganchados a este (nuevo entore): su fecha de inicio, o
//               { fecha, meses } si dicen de qué meses de parto son las paridas
// Devuelve { items, proxima }. Cada item:
//   { clave, etapa, nombre, fecha, hasta?, real, estado, dias, texto, titulo, avance? }
//   clave: la etapa, o etapa:fecha / etapa:mes si se repite (por tanda o por mes de parto).
//   dias: cuántos faltan (negativo: cuántos pasaron) hasta la fecha esperada.
export function sugerencias({ proceso = {}, anclas = [], lotes = [], plazos = PLAZOS_INICIALES, hoy, descartadas = [], siguientes = [] }) {
  const p = { ...PLAZOS_INICIALES, ...plazos };
  const a = anclas.filter((x) => !x.anulado);
  const iatf = ['IATF', 'IA'].includes(proceso.modalidad);
  const tandas = tandasDeServicio(a);
  const inicio = minimo(de(a, 'INICIO').map((x) => x.fecha)) ?? tandas[0]?.fecha ?? null;
  const items = [];
  const agregar = (item) => items.push({ avisoDias: p[item.etapa]?.avisoDias ?? 7, nombre: p[item.etapa]?.nombre ?? item.etapa, ...item });

  if (inicio) items.push({ clave: 'INICIO', etapa: 'INICIO', nombre: iatf ? 'Inicio de la inseminación' : 'Inicio del entore', fecha: inicio, real: inicio, avisoDias: 0 });

  // Servicio y ecografía.
  let finServicio = null;
  if (!iatf && inicio) {
    const finReal = maximo(de(a, 'FIN_SERVICIO').map((x) => x.fecha));
    agregar({ clave: 'FIN_SERVICIO', etapa: 'FIN_SERVICIO', fecha: fechaPlazo(inicio, p.FIN_SERVICIO), real: finReal });
    finServicio = finReal ?? fechaPlazo(inicio, p.FIN_SERVICIO);
    const diags = de(a, 'DIAGNOSTICO');
    const { servidas } = embudo(a);
    const hechas = diagnosticadas(diags);
    const falta = Math.max(servidas - hechas, 0);
    agregar({
      clave: 'DIAGNOSTICO',
      etapa: 'DIAGNOSTICO',
      fecha: fechaPlazo(finServicio, p.DIAGNOSTICO),
      real: diags.length && falta === 0 ? maximo(diags.map((x) => x.fecha)) : null,
      ...(diags.length && falta > 0 && { avance: `faltan ${fmt(falta)} por ecografiar` }),
    });
  } else if (iatf) {
    // IATF por días: si quedan vacas apartadas sin inseminar, lo primero es eso.
    if (lotes.some((l) => l.rol === 'SIN_SERVIR' && l.activo)) {
      agregar({ clave: 'INSEMINACION', etapa: 'INSEMINACION', nombre: 'Inseminación', fecha: hoy, real: null, avisoDias: 0, avance: 'quedan vacas sin inseminar' });
    }
    // Repaso con toros (las que no se inseminaron): los toros salen a los días
    // del fin del servicio contados desde que entraron, y la ecografía de esas
    // vacas se cuenta desde el fin.
    const repaso = minimo(tandas.filter((t) => t.repaso).map((t) => t.fecha));
    if (repaso) {
      const finReal = maximo(de(a, 'FIN_SERVICIO').map((x) => x.fecha));
      agregar({ clave: 'FIN_SERVICIO', etapa: 'FIN_SERVICIO', nombre: `${p.FIN_SERVICIO.nombre} (repaso)`, fecha: fechaPlazo(repaso, p.FIN_SERVICIO), real: finReal });
      finServicio = finReal ?? fechaPlazo(repaso, p.FIN_SERVICIO);
    }
    // Una ecografía por tanda (los lotes de cada tanda: "<lote> · IATF dd/mm").
    for (const t of tandas) {
      const diags = de(a, 'DIAGNOSTICO').filter((x) => t.loteIds.has(x.loteId));
      const falta = Math.max(t.cabezas - diagnosticadas(diags), 0);
      agregar({
        clave: tandas.length === 1 ? 'DIAGNOSTICO' : `DIAGNOSTICO:${t.fecha}`,
        etapa: 'DIAGNOSTICO',
        nombre: tandas.length === 1 ? p.DIAGNOSTICO.nombre : `${p.DIAGNOSTICO.nombre} (${t.repaso ? 'repaso' : `tanda del ${ddmm(t.fecha)}`})`,
        fecha: fechaPlazo(t.repaso ? finServicio : t.fecha, p.DIAGNOSTICO),
        real: diags.length && falta === 0 ? maximo(diags.map((x) => x.fecha)) : null,
        ...(diags.length && falta > 0 && { avance: `faltan ${fmt(falta)} por ecografiar` }),
      });
    }
  }

  // Parición: una ventana. Hecha cuando ya no quedan preñadas por parir.
  if (inicio) {
    const desde = fechaPlazo(minimo(tandas.map((t) => t.fecha)) ?? inicio, p.PARICION);
    const hasta = fechaPlazo(iatf ? (maximo([...tandas.map((t) => t.fecha), finServicio]) ?? inicio) : finServicio, p.PARICION);
    const partos = de(a, 'PARICION');
    const terminada = partos.length > 0 && ['CRIA', 'TERMINADO'].includes(etapaActual(a, lotes));
    const paridas = partos.reduce((s, x) => s + num(x.datos?.madres), 0);
    agregar({
      clave: 'PARICION',
      etapa: 'PARICION',
      fecha: desde,
      // Una ventana de un solo día (una IATF de una tanda) es una fecha.
      ...(hasta !== desde && { hasta }),
      real: terminada ? maximo([...partos, ...de(a, 'FIN_PARICION')].map((x) => x.fecha)) : null,
      ...(partos.length && !terminada && { avance: `${fmt(paridas)} ${paridas === 1 ? 'parida' : 'paridas'} hasta ahora` }),
    });
  }

  // Por cada mes de parición (los lotes de terneros van por mes): el nuevo
  // entore de las paridas y el destete, contados desde el primer parto del mes.
  const primerParto = new Map();
  for (const x of de(a, 'PARICION')) {
    const mes = x.fecha.slice(0, 7);
    if (!primerParto.has(mes) || x.fecha < primerParto.get(mes)) primerParto.set(mes, x.fecha);
  }
  const destetes = de(a, 'DESTETE');
  const criasConMes = lotes.filter((l) => l.rol === 'CRIAS' && l.mes);
  for (const [mes, parto] of [...primerParto.entries()].sort()) {
    // Un enganchado que dice de qué meses se llevó las paridas cuenta solo
    // para esos meses (fase 7); uno sin meses (datos viejos), para todos.
    const nuevo = minimo(siguientes.filter((x) => (typeof x === 'string' ? true : !x.meses?.length || x.meses.includes(mes))).map((x) => (typeof x === 'string' ? x : x.fecha)).filter((f) => f >= parto));
    agregar({ clave: `NUEVO_ENTORE:${mes}`, etapa: 'NUEVO_ENTORE', nombre: `${p.NUEVO_ENTORE.nombre} (paridas de ${nombreMes(mes)})`, fecha: fechaPlazo(parto, p.NUEVO_ENTORE), real: nuevo });
    const criasDelMes = new Set(criasConMes.filter((l) => l.mes === mes).map((l) => l.loteId));
    // Sin el mes en los lotes (datos viejos), cualquier destete cuenta.
    const delMes = criasConMes.length ? destetes.filter((x) => criasDelMes.has(x.loteId)) : destetes;
    agregar({ clave: `DESTETE:${mes}`, etapa: 'DESTETE', nombre: `${p.DESTETE.nombre} (terneros de ${nombreMes(mes)})`, fecha: fechaPlazo(parto, p.DESTETE), real: maximo(delMes.map((x) => x.fecha)) });
  }

  const descartada = new Set(descartadas);
  const terminado = proceso.estado && proceso.estado !== 'ABIERTO';
  const completos = items
    .map((item) => {
      const estado = estadoDe({ ...item, descartada: descartada.has(item.clave), hoy });
      const texto = textoDe({ ...item, estado, hoy });
      const conAvance = item.avance && ABIERTOS.has(estado) ? `${texto} · ${item.avance}` : texto;
      return {
        clave: item.clave,
        etapa: item.etapa,
        nombre: item.nombre,
        fecha: item.fecha ?? null,
        ...(item.hasta && { hasta: item.hasta }),
        real: item.real ?? null,
        avisoDias: item.avisoDias,
        estado,
        dias: item.fecha ? diasEntre(hoy, item.fecha) : null,
        texto: conAvance,
        titulo: `${item.nombre}: ${conAvance}`,
        ...(item.avance && { avance: item.avance }),
      };
    })
    .sort((x, y) => (x.fecha ?? '9999').localeCompare(y.fecha ?? '9999'));

  // Lo que sigue: lo abierto con la fecha más temprana (lo atrasado primero).
  const abierta = terminado ? null : (completos.find((i) => ABIERTOS.has(i.estado)) ?? null);
  return { items: completos, proxima: abierta && { ...abierta, atrasada: abierta.estado === 'ATRASADA' } };
}
