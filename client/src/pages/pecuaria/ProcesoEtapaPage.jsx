import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getCategorias, getCausas, getProceso, getToros, registrarEtapa, vistaPreviaEtapa } from '../../api/pecuaria';
import { ListaToros, faltaPotrero, listaParaApi, torosLibres } from '../../components/TorosProceso';
import { getErrorMessages } from '../../api/axios';
import usePotreros from '../../hooks/usePotreros';
import Camino from '../../components/Camino';
import { ErrorList, Notice, inputClass } from '../../components/ui';
import { formatNumero, opcionPotrero } from '../../components/pecuaria';
import {
  ETAPAS_CON_PANTALLA,
  cuerpoDiagnostico,
  destinoParaApi,
  destinoPorDefecto,
  faltaDestete,
  faltaEcografia,
  nombreMes,
  opcionesEcografia,
  quienesSeVan,
  separarIatf,
  textoBotonEtapa,
  totalDiagnostico,
} from '../../components/procesos';

const hoy = () => new Date().toLocaleDateString('sv-SE');
const etiqueta = 'block text-sm text-suelo-600';
const inputChico = `${inputClass} min-h-11 px-3`;
const texto = (t) => String(t ?? '').trim();
const entero = (t) => Number.parseInt(texto(t), 10);
const opcionClase = (activa) => `flex min-h-11 flex-col rounded-lg border px-3 py-2 text-left text-sm ${activa ? 'border-campo-500 bg-campo-50' : 'border-suelo-300 bg-superficie'}`;

// Cada etapa: sus pasos, qué lotes toma (como la plantilla del servidor), si
// va una sola vez por lote y si pide cabezas.
const ETAPAS = {
  // IATF por días (ajustes del 20/11).
  INSEMINACION: { pasos: ['A quién', 'Datos', 'Revisar'], toma: ['SIN_SERVIR'] },
  FIN_INSEMINACION: { pasos: ['A quién', 'Datos', 'Revisar'], toma: ['SIN_SERVIR'] },
  FIN_SERVICIO: { pasos: ['A quién', 'Datos', 'Revisar'], toma: ['VIENTRES'], unica: true },
  REPASO: { pasos: ['A quién', 'Datos', 'Revisar'], toma: ['VIENTRES'], unica: true, pideCabezas: true },
  ABORTO: { pasos: ['A quién', 'Datos', 'Revisar'], toma: ['PRENADAS', 'VIENTRES'], pideCabezas: true },
  // La ecografía va por partes, en varios días (fase 6): no es única.
  DIAGNOSTICO: { pasos: ['A quién', 'Datos', 'Destino', 'Revisar'], toma: ['VIENTRES'] },
  REVISION: { pasos: ['A quién', 'Datos', 'Revisar'], toma: ['VACIAS', 'PRENADAS'], unica: true },
  DECISION: { pasos: ['A quién', 'Destino', 'Revisar'], toma: ['VACIAS'], pendientes: true },
  PARICION: { pasos: ['A quién', 'Datos', 'Revisar'], toma: ['PRENADAS', 'VIENTRES'] },
  FIN_PARICION: { pasos: ['A quién', 'Datos', 'Revisar'], toma: ['PRENADAS', 'VIENTRES'], unica: true },
  DESTETE: { pasos: ['A quién', 'Datos', 'Revisar'], toma: ['CRIAS'], unica: true },
  // Toros que salen o entran (fase 6): no toma lotes del proceso.
  TOROS: { pasos: ['Toros', 'Revisar'], toma: [], sinLotes: true },
  // Fase 8: una baja (muerte) de cualquier lote del proceso; no arranca con
  // ninguno elegido.
  BAJA: { pasos: ['A quién', 'Datos', 'Revisar'], toma: ['VIENTRES', 'SIN_SERVIR', 'PRENADAS', 'VACIAS', 'PARIDAS', 'CRIAS'], ninguno: true },
};

// Los datos de la parición de cada lote (diseño §9). Los terneros, todos
// juntos, sin el sexo; tampoco las caravanas (24/11, Diego: se cargan
// después, en otro evento).
const CAMPOS_PARICION = [
  ['madres', 'madres que parieron', 'Madres que parieron'],
  ['terneros', 'terneros vivos', 'Terneros vivos (machos y hembras)'],
  ['muertos', 'nacidos muertos', 'Nacidos muertos'],
  ['madresMuertas', 'madres muertas al parto', 'Madres muertas al parto'],
];

// Cargar una etapa de un proceso con el camino de pasos (diseño de procesos
// §8 y §12): a quién (los lotes del proceso que la toman, ya elegidos) →
// datos → (en el diagnóstico y la decisión) a dónde va cada grupo → revisar
// y confirmar. Al confirmar, vuelve a la ficha.
// Reglas del campo (25/11): al separar, una de las partes cambia de potrero
// (IATF de una parte, ecografía, aborto, falladas, destete); las vacías de una
// IATF van a entore con toros o a engorde, las de un entore solo a engorde.
export default function ProcesoEtapaPage() {
  const { id, etapa } = useParams();
  const navigate = useNavigate();
  const cfg = ETAPAS[etapa];
  const [ficha, setFicha] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [paso, setPaso] = useState(0);
  const [elegidos, setElegidos] = useState(null);
  const [cabezas, setCabezas] = useState({});
  const [fecha, setFecha] = useState(hoy());
  const [nota, setNota] = useState('');
  const [metodo, setMetodo] = useState('ECOGRAFIA');
  const [datos, setDatos] = useState({}); // diagnóstico: { [loteId]: { prenadas, vacias } }
  const [elecciones, setElecciones] = useState({}); // diagnóstico: { [loteId]: quiénes se van, a dónde, vacías a… }
  const [destinos, setDestinos] = useState({}); // decidir (lo viejo): { [loteId]: { vacias: destino } }
  const [revision, setRevision] = useState({}); // { [loteId]: { cambian, aLoteId } }
  const [paricion, setParicion] = useState({}); // { [loteId]: { madres, terneros, ..., potreroId } }
  // En un aborto, las que abortaron van a engorde (R7): arranca marcado.
  const [aVacias, setAVacias] = useState(true);
  const [aOtroPotrero, setAOtroPotrero] = useState({}); // aborto y falladas: { [loteId]: potreroId }
  const [causas, setCausas] = useState([]);
  const [causaId, setCausaId] = useState('');
  const [destete, setDestete] = useState({}); // { [loteId]: { potreroId, categoriaId, peso, madresPotreroId, categoriaMadresId } }
  const [iatf, setIatf] = useState({}); // { [loteId]: { cabezas, seVan, potreroId, destino } }
  const ponerIatf = (l, cambios) => setIatf((x) => ({ ...x, [l.loteId]: { ...x[l.loteId], ...cambios } }));
  // Toros (fase 6): los de la estancia, los que salen y los que entran ({ [toroId]: potreroId }).
  const [torosEstancia, setTorosEstancia] = useState([]);
  const [salen, setSalen] = useState(null);
  const [entran, setEntran] = useState({});
  const [previa, setPrevia] = useState(null);
  const [errors, setErrors] = useState([]);
  const [ocupado, setOcupado] = useState(false);
  const { potreros } = usePotreros(ficha?.proceso.campoId ?? null);

  useEffect(() => {
    getProceso(id)
      .then(({ data }) => setFicha(data))
      .catch((error) => setErrors(getErrorMessages(error, 'No se pudo cargar el proceso')));
    getCategorias()
      .then(({ data }) => setCategorias(data.filter((c) => c.activo !== false)))
      .catch(() => setCategorias([]));
  }, [id]);

  // La baja pide la causa (las de Muerte).
  useEffect(() => {
    if (etapa !== 'BAJA') return;
    getCausas()
      .then(({ data }) => setCausas(data.filter((c) => c.activo !== false && c.tipos.some((t) => t.clave === 'MUERTE'))))
      .catch(() => setCausas([]));
  }, [etapa]);

  // La etapa Toros ofrece traer toros de la estancia que no están en otro proceso.
  const campoDelProceso = ficha?.proceso.campoId ?? null;
  useEffect(() => {
    if (etapa !== 'TOROS' || !campoDelProceso) return;
    getToros(campoDelProceso)
      .then(({ data }) => setTorosEstancia(data))
      .catch(() => setTorosEstancia([]));
  }, [etapa, campoDelProceso]);

  // Los lotes que la toman (y, si va una sola vez, que todavía no la tienen).
  const posibles = useMemo(() => {
    if (!ficha || !cfg) return [];
    const ya = new Set(
      (ficha.etapas.find((e) => e.clave === etapa)?.cargas ?? []).filter((c) => !c.anulada).flatMap((c) => c.lineas.map((l) => l.loteId)),
    );
    return ficha.lotes.filter((l) => l.activo && l.cabezas > 0 && cfg.toma.includes(l.rol) && !(cfg.unica && ya.has(l.loteId)) && !(cfg.pendientes && l.destino));
  }, [ficha, etapa, cfg]);
  // Los toros que están en el proceso; al terminar el entore salen todos (si no se destilda).
  const torosDentro = (ficha?.toros ?? []).filter((t) => !t.hasta).map((t) => ({ ...t, id: t.toroId, donde: `en ${t.potrero.nombre}` }));
  const salenDe = salen ?? (etapa === 'FIN_SERVICIO' ? Object.fromEntries(torosDentro.map((t) => [t.toroId, ''])) : {});
  const potreroDeLasVacas = ficha?.lotes.find((l) => l.activo && l.rol === 'VIENTRES')?.potrero?.id ?? '';
  const elegidosIds = elegidos ?? (cfg?.ninguno ? [] : posibles.map((l) => l.loteId));
  const lotes = posibles.filter((l) => elegidosIds.includes(l.loteId));
  const nombrePaso = cfg?.pasos[paso];
  // Las vacías de una IATF pueden ir al entore (una vez); las de un entore, solo a engorde (R5).
  const esIatf = ['IATF', 'IA'].includes(ficha?.proceso.datos?.modalidad);
  // ¿Hay en el potrero del lote otros lotes del proceso? (las falladas no se pueden quedar con ellos).
  const conOtrosDelProceso = (l) => (ficha?.lotes ?? []).some((x) => x.activo && x.loteId !== l.loteId && x.potrero?.id === l.potrero?.id && x.rol !== 'LIBRES');

  const destinoDe = (l, clave) => destinos[l.loteId]?.[clave] ?? destinoPorDefecto(l, 'VACIAS');
  const ponerDestino = (l, clave, cambios) =>
    setDestinos((d) => ({ ...d, [l.loteId]: { ...d[l.loteId], [clave]: { ...destinoDe(l, clave), ...cambios } } }));
  const eleccionDe = (l) => elecciones[l.loteId] ?? {};
  const ponerEleccion = (l, cambios) => setElecciones((x) => ({ ...x, [l.loteId]: { ...x[l.loteId], ...cambios } }));

  function cuerpo() {
    const base = { fecha, ...(texto(nota) && { nota: texto(nota) }) };
    if (etapa === 'DIAGNOSTICO') return cuerpoDiagnostico({ fecha, metodo, lotes, datos, elecciones, nota, iatf: esIatf });
    if (etapa === 'DECISION') return { ...base, lineas: lotes.map((l) => ({ loteId: l.loteId, ...destinoParaApi(destinoDe(l, 'vacias'), l) })) };
    if (etapa === 'PARICION') {
      return {
        ...base,
        lineas: lotes.map((l) => {
          const d = paricion[l.loteId] ?? {};
          const numeros = Object.fromEntries(CAMPOS_PARICION.map(([campo]) => [campo, texto(d[campo])]).filter(([, v]) => v));
          // La madre no cambia de categoría (fase 7): su estado pasa a parida.
          return {
            loteId: l.loteId,
            ...numeros,
            ...(d.potreroId && { potreroId: Number(d.potreroId) }),
          };
        }),
      };
    }
    if (etapa === 'FIN_PARICION') return { ...base, lineas: lotes.map((l) => ({ loteId: l.loteId, ...(aOtroPotrero[l.loteId] && { potreroId: Number(aOtroPotrero[l.loteId]) }) })) };
    if (etapa === 'INSEMINACION') {
      return { ...base, lineas: lotes.map((l) => ({ loteId: l.loteId, cabezas: texto(iatf[l.loteId]?.cabezas), ...separarIatf(l, iatf[l.loteId]).api })) };
    }
    if (etapa === 'FIN_INSEMINACION') {
      // Solo se anotan las que salen; "las dejo para otro día" no es una carga.
      return {
        ...base,
        lineas: lotes
          .filter((l) => iatf[l.loteId]?.destino === 'SALEN')
          .map((l) => ({ loteId: l.loteId, destino: 'SALEN', ...(iatf[l.loteId]?.potreroId && { potreroId: Number(iatf[l.loteId].potreroId) }) })),
      };
    }
    if (etapa === 'TOROS') return { ...base, salen: listaParaApi(salenDe), entran: listaParaApi(entran) };
    if (etapa === 'BAJA') return { ...base, lineas: lotes.map((l) => ({ loteId: l.loteId, cabezas: texto(cabezas[l.loteId]), causaId: Number(causaId) })) };
    if (etapa === 'DESTETE') {
      return {
        ...base,
        lineas: lotes.map((l) => {
          const d = destete[l.loteId] ?? {};
          return {
            loteId: l.loteId,
            ...(d.potreroId && { destinoPotreroId: Number(d.potreroId) }),
            ...(d.categoriaId && { categoriaId: Number(d.categoriaId) }),
            ...(texto(d.peso) && { pesoPromedioKg: texto(d.peso) }),
            ...(d.madresPotreroId && { madresPotreroId: Number(d.madresPotreroId) }),
            ...(d.categoriaMadresId && { categoriaMadresId: Number(d.categoriaMadresId) }),
          };
        }),
      };
    }
    if (etapa === 'REVISION') {
      return {
        ...base,
        lineas: lotes.map((l) => {
          const r = revision[l.loteId] ?? {};
          const n = Number.parseInt(texto(r.cambian) || '0', 10);
          return { loteId: l.loteId, [l.rol === 'VACIAS' ? 'aPrenadas' : 'aVacias']: n, ...(r.aLoteId && { aLoteId: Number(r.aLoteId) }) };
        }),
      };
    }
    return {
      ...base,
      ...(etapa === 'ABORTO' && aVacias && { aVacias: true }),
      ...(etapa === 'FIN_SERVICIO' && Object.keys(salenDe).length && { salenToros: listaParaApi(salenDe) }),
      lineas: lotes.map((l) => ({
        loteId: l.loteId,
        ...(texto(cabezas[l.loteId]) && { cabezas: texto(cabezas[l.loteId]) }),
        ...(etapa === 'ABORTO' && aVacias && aOtroPotrero[l.loteId] && { potreroId: Number(aOtroPotrero[l.loteId]) }),
      })),
    };
  }

  async function seguir() {
    setErrors([]);
    if (nombrePaso !== 'Revisar' && cfg.pasos[paso + 1] !== 'Revisar') return setPaso(paso + 1);
    setOcupado(true);
    try {
      if (nombrePaso !== 'Revisar') {
        const { data } = await vistaPreviaEtapa(id, etapa, cuerpo());
        setPrevia(data);
        setPaso(paso + 1);
      } else {
        const { data } = await registrarEtapa(id, etapa, cuerpo());
        navigate(`/pecuaria/procesos/${id}`, { state: { aviso: `${data.oracion}.` } });
      }
    } catch (error) {
      setErrors(getErrorMessages(error, 'No se pudo guardar'));
    } finally {
      setOcupado(false);
    }
  }

  if (!cfg || !ETAPAS_CON_PANTALLA.has(etapa)) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Notice>Esta etapa todavía no se puede cargar desde acá.</Notice>
      </main>
    );
  }

  const desteteOk = etapa !== 'DESTETE' || lotes.every((l) => !faltaDestete(l, destete[l.loteId]));
  const otroDiaTodas = etapa === 'FIN_INSEMINACION' && lotes.length > 0 && lotes.every((l) => iatf[l.loteId]?.destino === 'OTRO_DIA');
  const iatfOk =
    (etapa !== 'INSEMINACION' || lotes.every((l) => entero(iatf[l.loteId]?.cabezas) > 0 && !separarIatf(l, iatf[l.loteId]).falta)) &&
    (etapa !== 'FIN_INSEMINACION' || (lotes.every((l) => iatf[l.loteId]?.destino) && lotes.some((l) => iatf[l.loteId]?.destino === 'SALEN')));
  const bajaOk = etapa !== 'BAJA' || (causaId && lotes.every((l) => entero(cabezas[l.loteId]) > 0));
  // Aborto a engorde: si abortó una parte, a otro potrero (no se quedan con las preñadas).
  const abortoOk =
    etapa !== 'ABORTO' ||
    !aVacias ||
    lotes.every((l) => !(entero(cabezas[l.loteId]) < l.cabezas) || (aOtroPotrero[l.loteId] && Number(aOtroPotrero[l.loteId]) !== l.potrero?.id));
  // Falladas a engorde: si en el potrero hay otros del proceso, a otro potrero.
  const finParicionOk = etapa !== 'FIN_PARICION' || lotes.every((l) => !conOtrosDelProceso(l) || (aOtroPotrero[l.loteId] && Number(aOtroPotrero[l.loteId]) !== l.potrero?.id));
  const datosOk =
    desteteOk &&
    iatfOk &&
    bajaOk &&
    abortoOk &&
    finParicionOk &&
    (etapa !== 'DIAGNOSTICO' || lotes.every((l) => totalDiagnostico(datos[l.loteId]) >= 1 && totalDiagnostico(datos[l.loteId]) <= l.cabezas));
  const destinoOk =
    (etapa !== 'DECISION' || lotes.every((l) => destinoDe(l, 'vacias').tipo)) &&
    (etapa !== 'DIAGNOSTICO' || lotes.every((l) => !faltaEcografia(l, datos[l.loteId], eleccionDe(l), { iatf: esIatf })));
  const torosOk = !faltaPotrero(salenDe) && !faltaPotrero(entran);
  const cuantosToros = Object.keys(salenDe).length + Object.keys(entran).length;
  const puedeSeguir = cfg.sinLotes
    ? cuantosToros > 0 && torosOk
    : lotes.length > 0 && (nombrePaso !== 'Datos' || (datosOk && torosOk)) && (nombrePaso !== 'Destino' || destinoOk);
  const otrosPotreros = (l) => (potreros ?? []).filter((p) => p.id !== l.potrero?.id);
  const titulo = textoBotonEtapa(etapa);
  // R8: cuántas vacas y terneros hay en cada potrero del proceso.
  const porPotrero = ficha?.porPotrero ?? [];

  return (
    <Camino
      titulo={ficha ? `${titulo} · ${ficha.proceso.nombre}` : titulo}
      pasos={cfg.pasos}
      actual={paso}
      onIr={(i) => {
        setErrors([]);
        setPaso(i);
      }}
      onSeguir={ficha ? seguir : null}
      textoSeguir={nombrePaso === 'Revisar' ? 'Confirmar' : cfg.pasos[paso + 1] === 'Revisar' ? 'Revisar' : 'Seguir'}
      puedeSeguir={puedeSeguir}
      ocupado={ocupado}
      ayuda={
        cfg.sinLotes
          ? cuantosToros
            ? `${cuantosToros} ${cuantosToros === 1 ? 'toro' : 'toros'}`
            : 'Elegí los toros'
          : lotes.length
            ? `${lotes.length} ${lotes.length === 1 ? 'lote' : 'lotes'} · ${formatNumero(lotes.reduce((s, l) => s + l.cabezas, 0))} cab`
            : 'Elegí los lotes'
      }
    >
      <div className="mt-2">
        <ErrorList errors={errors} />
      </div>
      {!ficha && !errors.length && <p className="text-suelo-600">Cargando…</p>}

      {ficha && nombrePaso === 'A quién' && (
        <section aria-label="A quién" className="space-y-2">
          {posibles.length === 0 && <p className="text-suelo-600">No hay lotes del proceso para esto.</p>}
          <ul className="divide-y divide-suelo-100 rounded-lg border border-suelo-200 bg-superficie">
            {posibles.map((l) => (
              <li key={l.loteId}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={elegidosIds.includes(l.loteId)}
                    onChange={() => setElegidos(elegidosIds.includes(l.loteId) ? elegidosIds.filter((x) => x !== l.loteId) : [...elegidosIds, l.loteId])}
                    className="h-5 w-5 accent-campo-600"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{l.nombre}</span>
                    <span className="block text-xs text-suelo-500">
                      {l.potrero?.nombre} · {l.categoria}
                    </span>
                  </span>
                  <span className="shrink-0 text-suelo-600">{formatNumero(l.cabezas)} cab</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      {ficha && nombrePaso === 'Toros' && (
        <section aria-label="Toros" className="space-y-5">
          <label className={etiqueta}>
            Fecha
            <input type="date" value={fecha} max={hoy()} onChange={(e) => setFecha(e.target.value)} className={`${inputChico} mt-1`} />
          </label>
          <ListaToros
            titulo="Sacar del proceso"
            toros={torosDentro}
            elegidos={salenDe}
            onCambiar={setSalen}
            potreros={potreros ?? []}
            vacio="No hay toros en el proceso."
          />
          <ListaToros
            titulo="Traer (el mismo u otro)"
            ayuda="Toros de la estancia que no están en otro proceso. Pasan de su lote al potrero elegido."
            toros={torosLibres(torosEstancia).map((t) => ({ ...t, donde: t.lote ? `en ${t.lote.potrero.nombre}` : 'sin lote' }))}
            elegidos={entran}
            onCambiar={setEntran}
            potreros={potreros ?? []}
            potreroPorDefecto={potreroDeLasVacas}
            vacio="No hay toros libres. Se cargan en Configuración → Toros."
          />
          <label className={etiqueta}>
            Nota (opcional)
            <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={255} className={`${inputChico} mt-1`} />
          </label>
        </section>
      )}

      {ficha && nombrePaso === 'Datos' && (
        <section aria-label="Datos" className="space-y-4">
          <label className={etiqueta}>
            Fecha
            <input type="date" value={fecha} max={hoy()} onChange={(e) => setFecha(e.target.value)} className={`${inputChico} mt-1`} />
          </label>

          {etapa === 'FIN_SERVICIO' && torosDentro.length > 0 && (
            <ListaToros
              titulo="Salen los toros"
              ayuda="Al terminar el entore, los toros salen. Destildá el que se quede."
              toros={torosDentro}
              elegidos={salenDe}
              onCambiar={setSalen}
              potreros={potreros ?? []}
            />
          )}
          {etapa === 'DIAGNOSTICO' && (
            <p className="text-xs text-suelo-500">Si hoy ecografiás una parte, poné solo esas: el resto queda sin ecografiar, para otro día.</p>
          )}

          {etapa === 'DIAGNOSTICO' && (
            <>
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Método">
                {[
                  ['ECOGRAFIA', 'Ecografía'],
                  ['TACTO', 'Tacto'],
                ].map(([valor, t]) => (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => setMetodo(valor)}
                    aria-pressed={metodo === valor}
                    className={`min-h-11 rounded-lg border px-3 text-sm font-medium ${metodo === valor ? 'border-campo-500 bg-campo-50 text-campo-900' : 'border-suelo-300 bg-superficie'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {lotes.map((l) => {
                const d = datos[l.loteId] ?? {};
                const poner = (campo, valor) => setDatos((x) => ({ ...x, [l.loteId]: { ...x[l.loteId], ...campo(valor, x[l.loteId] ?? {}) } }));
                const total = totalDiagnostico(d);
                return (
                  <fieldset key={l.loteId} className="rounded-lg border border-suelo-200 bg-superficie p-3">
                    <legend className="px-1 text-sm font-semibold">{l.nombre}</legend>
                    <p className="mb-2 text-xs text-suelo-500">Preñadas según cuándo van a parir (si el ecografista lo dice); si no, en "sin mes".</p>
                    <div className="grid grid-cols-3 gap-2">
                      {[...ficha.meses, 'sin'].map((mes) => (
                        <label key={mes} className="block text-xs text-suelo-600">
                          {mes === 'sin' ? 'Sin mes' : nombreMes(mes)}
                          <input
                            inputMode="numeric"
                            aria-label={`${l.nombre}: preñadas ${mes === 'sin' ? 'sin mes' : nombreMes(mes)}`}
                            value={d.prenadas?.[mes] ?? ''}
                            onChange={(e) => poner((v, prev) => ({ prenadas: { ...prev.prenadas, [mes]: v } }), e.target.value)}
                            className={`${inputChico} mt-1`}
                          />
                        </label>
                      ))}
                      <label className="block text-xs text-suelo-600">
                        Vacías
                        <input
                          inputMode="numeric"
                          aria-label={`${l.nombre}: vacías`}
                          value={d.vacias ?? ''}
                          onChange={(e) => poner((v) => ({ vacias: v }), e.target.value)}
                          className={`${inputChico} mt-1`}
                        />
                      </label>
                    </div>
                    <p className={`mt-2 text-xs ${total > l.cabezas ? 'font-medium text-red-700' : 'text-suelo-500'}`}>
                      {formatNumero(total)} de {formatNumero(l.cabezas)}
                      {total > 0 && total < l.cabezas && ` · quedan ${formatNumero(l.cabezas - total)} sin ecografiar`}
                    </p>
                  </fieldset>
                );
              })}
            </>
          )}

          {etapa === 'REVISION' &&
            lotes.map((l) => {
              const r = revision[l.loteId] ?? {};
              const opuesto = l.rol === 'VACIAS' ? 'PRENADAS' : 'VACIAS';
              const destinosPosibles = ficha.lotes.filter((x) => x.activo && x.rol === opuesto);
              return (
                <fieldset key={l.loteId} className="space-y-2 rounded-lg border border-suelo-200 bg-superficie p-3">
                  <legend className="px-1 text-sm font-semibold">{l.nombre}</legend>
                  <label className={etiqueta}>
                    {l.rol === 'VACIAS' ? '¿Cuántas estaban preñadas?' : '¿Cuántas estaban vacías?'}
                    <input
                      inputMode="numeric"
                      aria-label={`${l.nombre}: cambian`}
                      value={r.cambian ?? ''}
                      onChange={(e) => setRevision((x) => ({ ...x, [l.loteId]: { ...r, cambian: e.target.value } }))}
                      className={`${inputChico} mt-1`}
                    />
                  </label>
                  <label className={etiqueta}>
                    Pasan al lote
                    <select
                      aria-label={`${l.nombre}: pasan al lote`}
                      value={r.aLoteId ?? ''}
                      onChange={(e) => setRevision((x) => ({ ...x, [l.loteId]: { ...r, aLoteId: e.target.value } }))}
                      className={`${inputChico} mt-1`}
                    >
                      <option value="">Al de {opuesto === 'PRENADAS' ? 'preñadas' : 'vacías'} del proceso (el de su familia)</option>
                      {destinosPosibles.map((x) => (
                        <option key={x.loteId} value={x.loteId}>
                          {x.nombre} ({x.potrero?.nombre})
                        </option>
                      ))}
                    </select>
                    <span className="mt-1 block text-xs text-suelo-500">Se mueven a ese lote: no quedan juntas con las de antes.</span>
                  </label>
                </fieldset>
              );
            })}

          {etapa === 'PARICION' && porPotrero.length > 0 && (
            <ul className="space-y-0.5 rounded-lg border border-suelo-200 bg-suelo-50 px-3 py-2 text-xs text-suelo-700" aria-label="Por potrero">
              {porPotrero.map((p) => (
                <li key={p.potreroId}>{p.texto}</li>
              ))}
            </ul>
          )}
          {etapa === 'PARICION' &&
            lotes.map((l) => {
              const d = paricion[l.loteId] ?? {};
              const poner = (campo, valor) => setParicion((x) => ({ ...x, [l.loteId]: { ...x[l.loteId], [campo]: valor } }));
              return (
                <fieldset key={l.loteId} className="space-y-2 rounded-lg border border-suelo-200 bg-superficie p-3">
                  <legend className="px-1 text-sm font-semibold">
                    {l.nombre} ({l.potrero?.nombre}) · quedan {formatNumero(l.cabezas)} sin parir
                  </legend>
                  <div className="grid grid-cols-2 gap-2">
                    {CAMPOS_PARICION.map(([campo, aria, t]) => (
                      <label key={campo} className="block text-xs text-suelo-600">
                        {t}
                        <input inputMode="numeric" aria-label={`${l.nombre}: ${aria}`} value={d[campo] ?? ''} onChange={(e) => poner(campo, e.target.value)} className={`${inputChico} mt-1`} />
                      </label>
                    ))}
                  </div>
                  <label className="block text-xs text-suelo-600">
                    Las paridas y sus crías
                    <select aria-label={`${l.nombre}: a qué potrero van las paridas`} value={d.potreroId ?? ''} onChange={(e) => poner('potreroId', e.target.value)} className={`${inputChico} mt-1`}>
                      <option value="">Se quedan en {l.potrero?.nombre}</option>
                      {otrosPotreros(l).map((p) => (
                        <option key={p.id} value={p.id}>
                          Van a {opcionPotrero(p)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="text-xs text-suelo-500">
                    Los terneros van al lote del mes en que nacieron (por ejemplo, &quot;Terneros/as sep-2027&quot;; se crea o se suma). El sexo y las caravanas se cargan después. La madre sigue en su categoría: pasa a estar parida. Las paridas con su cría y las preñadas pueden seguir juntas hasta el destete.
                  </p>
                </fieldset>
              );
            })}

          {etapa === 'DESTETE' &&
            lotes.map((l) => {
              const d = destete[l.loteId] ?? {};
              const poner = (campo, valor) => setDestete((x) => ({ ...x, [l.loteId]: { ...x[l.loteId], [campo]: valor } }));
              const falta = d.potreroId ? faltaDestete(l, d) : null;
              return (
                <fieldset key={l.loteId} className="space-y-2 rounded-lg border border-suelo-200 bg-superficie p-3">
                  <legend className="px-1 text-sm font-semibold">
                    {l.nombre} · {formatNumero(l.cabezas)} cab (en {l.potrero?.nombre})
                  </legend>
                  <p className="text-sm font-medium">Los terneros</p>
                  <label className="block text-xs text-suelo-600">
                    Se van a
                    <select aria-label={`${l.nombre}: a qué potrero`} value={d.potreroId ?? ''} onChange={(e) => poner('potreroId', e.target.value)} className={`${inputChico} mt-1`}>
                      <option value="">Elegí el potrero…</option>
                      {otrosPotreros(l).map((p) => (
                        <option key={p.id} value={p.id}>
                          {opcionPotrero(p)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-xs text-suelo-600">
                      Categoría al llegar
                      <select aria-label={`${l.nombre}: categoría al llegar`} value={d.categoriaId ?? ''} onChange={(e) => poner('categoriaId', e.target.value)} className={`${inputChico} mt-1`}>
                        <option value="">La misma ({l.categoria})</option>
                        {categorias.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs text-suelo-600">
                      Peso promedio (kg, opcional)
                      <input inputMode="decimal" aria-label={`${l.nombre}: peso promedio`} value={d.peso ?? ''} onChange={(e) => poner('peso', e.target.value)} className={`${inputChico} mt-1`} />
                    </label>
                  </div>
                  <p className="pt-1 text-sm font-medium">Las vacas</p>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-xs text-suelo-600">
                      Dónde quedan
                      <select aria-label={`${l.nombre}: a qué potrero van las vacas`} value={d.madresPotreroId ?? ''} onChange={(e) => poner('madresPotreroId', e.target.value)} className={`${inputChico} mt-1`}>
                        <option value="">Se quedan en {l.potrero?.nombre}</option>
                        {otrosPotreros(l).map((p) => (
                          <option key={p.id} value={p.id}>
                            Van a {opcionPotrero(p)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs text-suelo-600">
                      Categoría de las vacas
                      <select aria-label={`${l.nombre}: categoría de las vacas`} value={d.categoriaMadresId ?? ''} onChange={(e) => poner('categoriaMadresId', e.target.value)} className={`${inputChico} mt-1`}>
                        <option value="">La misma</option>
                        {categorias.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {falta && <p className="text-xs font-medium text-red-700">{falta}</p>}
                </fieldset>
              );
            })}
          {etapa === 'DESTETE' && <p className="text-xs text-suelo-500">Terneros y vacas se separan: no pueden quedar en el mismo potrero. Las vacas que ya no tienen crías al pie dejan este proceso.</p>}

          {etapa === 'INSEMINACION' &&
            lotes.map((l) => {
              const d = iatf[l.loteId] ?? {};
              const s = separarIatf(l, d);
              const escrito = entero(d.cabezas) > 0;
              return (
                <fieldset key={l.loteId} className="space-y-2 rounded-lg border border-suelo-200 bg-superficie p-3">
                  <legend className="px-1 text-sm font-semibold">
                    {l.nombre}: en {l.potrero?.nombre} hay {formatNumero(l.cabezas)} sin inseminar
                  </legend>
                  <label className={etiqueta}>
                    ¿Cuántas se inseminaron hoy? ({l.nombre})
                    <input aria-label={`¿Cuántas se inseminaron hoy? (${l.nombre})`} inputMode="numeric" value={d.cabezas ?? ''} onChange={(e) => ponerIatf(l, { cabezas: e.target.value })} className={`${inputChico} mt-1`} />
                  </label>
                  {escrito && s.parte && (
                    <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label={`${l.nombre}: qué grupo se va`}>
                      {[
                        ['INSEMINADAS', `Las ${formatNumero(s.n)} inseminadas`],
                        ['SIN', `Las ${formatNumero(s.sinInseminar)} sin inseminar`],
                      ].map(([valor, t]) => (
                        <button key={valor} type="button" onClick={() => ponerIatf(l, { seVan: valor })} aria-pressed={(d.seVan ?? 'INSEMINADAS') === valor} className={opcionClase((d.seVan ?? 'INSEMINADAS') === valor)}>
                          <span className="font-semibold">{t}</span>
                          <span className="text-xs text-suelo-500">se van; las otras se quedan</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {escrito && (
                    <label className={etiqueta}>
                      {s.parte ? (d.seVan === 'SIN' ? '¿A dónde van las sin inseminar?' : '¿A dónde van las inseminadas?') : '¿Dónde quedan?'}
                      <select aria-label={`${l.nombre}: a qué potrero`} value={d.potreroId ?? ''} onChange={(e) => ponerIatf(l, { potreroId: e.target.value })} className={`${inputChico} mt-1`}>
                        <option value="">{s.parte ? 'Elegí el potrero…' : `Se quedan en ${l.potrero?.nombre}`}</option>
                        {otrosPotreros(l).map((p) => (
                          <option key={p.id} value={p.id}>
                            {opcionPotrero(p, s.parte ? '' : 'Moverlas a ')}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {escrito && s.falta && <p className="text-xs text-amber-800">{s.falta}: las inseminadas y las sin inseminar no pueden quedar juntas.</p>}
                </fieldset>
              );
            })}
          {etapa === 'INSEMINACION' && <p className="text-xs text-suelo-500">Las inseminadas pasan a un lote aparte ("· IATF" con la fecha); las demás siguen sin inseminar, para otro día.</p>}

          {etapa === 'FIN_INSEMINACION' &&
            lotes.map((l) => {
              const d = iatf[l.loteId] ?? {};
              return (
                <fieldset key={l.loteId} className="space-y-2 rounded-lg border border-suelo-200 bg-superficie p-3">
                  <legend className="px-1 text-sm font-semibold">
                    {l.nombre} ({l.potrero?.nombre}) · {formatNumero(l.cabezas)} sin inseminar
                  </legend>
                  <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label={`${l.nombre}: qué pasa con las sin inseminar`}>
                    {[
                      ['SALEN', 'Salen del proceso', 'Vuelven a ser vacas libres (se pueden mover).'],
                      ['OTRO_DIA', 'Las dejo para otro día', 'No se anota nada: siguen sin inseminar.'],
                    ].map(([valor, t, detalle]) => (
                      <button key={valor} type="button" onClick={() => ponerIatf(l, { destino: valor })} aria-pressed={d.destino === valor} className={opcionClase(d.destino === valor)}>
                        <span className="font-semibold">{t}</span>
                        <span className="text-xs text-suelo-500">{detalle}</span>
                      </button>
                    ))}
                  </div>
                  {d.destino === 'SALEN' && (
                    <label className={etiqueta}>
                      ¿A dónde van?
                      <select aria-label={`${l.nombre}: a qué potrero`} value={d.potreroId ?? ''} onChange={(e) => ponerIatf(l, { potreroId: e.target.value })} className={`${inputChico} mt-1`}>
                        <option value="">Se quedan en {l.potrero?.nombre}</option>
                        {otrosPotreros(l).map((p) => (
                          <option key={p.id} value={p.id}>
                            {opcionPotrero(p, 'A ')}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </fieldset>
              );
            })}
          {etapa === 'FIN_INSEMINACION' && <p className="text-xs text-suelo-500">Si meten un toro antes de la ecografía, se hace por fuera de la app.</p>}
          {otroDiaTodas && <Notice>No hay nada para anotar: las sin inseminar quedan para otro día.</Notice>}

          {etapa === 'FIN_PARICION' && <p className="text-sm text-suelo-600">Las que quedan sin parir en los lotes elegidos van a engorde: salen del proceso, con la categoría de invernar.</p>}
          {etapa === 'FIN_PARICION' &&
            lotes.map((l) => (
              <label key={l.loteId} className={etiqueta}>
                {l.nombre}: ¿a dónde van las {formatNumero(l.cabezas)} que no parieron?
                <select aria-label={`${l.nombre}: a qué potrero van a engorde`} value={aOtroPotrero[l.loteId] ?? ''} onChange={(e) => setAOtroPotrero((x) => ({ ...x, [l.loteId]: e.target.value }))} className={`${inputChico} mt-1`}>
                  <option value="">{conOtrosDelProceso(l) ? 'Elegí el potrero…' : `Se quedan en ${l.potrero?.nombre}`}</option>
                  {otrosPotreros(l).map((p) => (
                    <option key={p.id} value={p.id}>
                      {opcionPotrero(p, 'A ')}
                    </option>
                  ))}
                </select>
                {conOtrosDelProceso(l) && <span className="mt-1 block text-xs text-suelo-500">En {l.potrero?.nombre} hay paridas o preñadas del proceso: las falladas van a otro potrero.</span>}
              </label>
            ))}

          {ETAPAS[etapa].pideCabezas &&
            lotes.map((l) => (
              <label key={l.loteId} className={etiqueta}>
                {etapa === 'ABORTO' ? `¿Cuántas abortaron? (${l.nombre})` : `Cabezas (${l.nombre}, por defecto ${formatNumero(l.cabezas)})`}
                <input inputMode="numeric" value={cabezas[l.loteId] ?? ''} onChange={(e) => setCabezas((c) => ({ ...c, [l.loteId]: e.target.value }))} className={`${inputChico} mt-1`} />
              </label>
            ))}
          {etapa === 'BAJA' && (
            <>
              {lotes.map((l) => (
                <label key={l.loteId} className={etiqueta}>
                  ¿Cuántas murieron? ({l.nombre}, {formatNumero(l.cabezas)} cab)
                  <input
                    inputMode="numeric"
                    aria-label={`${l.nombre}: cuántas murieron`}
                    value={cabezas[l.loteId] ?? ''}
                    onChange={(e) => setCabezas((c) => ({ ...c, [l.loteId]: e.target.value }))}
                    className={`${inputChico} mt-1`}
                  />
                </label>
              ))}
              <label className={etiqueta}>
                Causa
                <select aria-label="Causa de la muerte" value={causaId} onChange={(e) => setCausaId(e.target.value)} className={`${inputChico} mt-1`}>
                  <option value="">Elegí la causa…</option>
                  {causas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.codigo} · {c.nombre}
                    </option>
                  ))}
                </select>
                {!causas.length && <span className="mt-1 block text-xs text-amber-800">No hay causas de muerte: cargalas en Configuración.</span>}
              </label>
              <p className="text-xs text-suelo-500">Salen del stock como una muerte. Si mueren todas las de un lote, el lote se cierra.</p>
            </>
          )}
          {etapa === 'ABORTO' && (
            <label data-testid="a-vacias" className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-suelo-200 bg-superficie px-3 text-sm">
              <input type="checkbox" checked={aVacias} onChange={(e) => setAVacias(e.target.checked)} className="h-5 w-5 accent-campo-600" />
              Sacarlas a engorde (salen del proceso, con la categoría de invernar)
            </label>
          )}
          {etapa === 'ABORTO' &&
            aVacias &&
            lotes.map((l) => {
              const parte = entero(cabezas[l.loteId]) < l.cabezas;
              return (
                <label key={l.loteId} className={etiqueta}>
                  ¿A dónde van las que abortaron? ({l.nombre})
                  <select aria-label={`${l.nombre}: a qué potrero van a engorde`} value={aOtroPotrero[l.loteId] ?? ''} onChange={(e) => setAOtroPotrero((x) => ({ ...x, [l.loteId]: e.target.value }))} className={`${inputChico} mt-1`}>
                    <option value="">{parte ? 'Elegí el potrero…' : `Se quedan en ${l.potrero?.nombre}`}</option>
                    {otrosPotreros(l).map((p) => (
                      <option key={p.id} value={p.id}>
                        {opcionPotrero(p, 'A ')}
                      </option>
                    ))}
                  </select>
                  {parte && <span className="mt-1 block text-xs text-suelo-500">No pueden quedar con las preñadas: van a otro potrero.</span>}
                </label>
              );
            })}
          <label className={etiqueta}>
            Nota (opcional)
            <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={255} className={`${inputChico} mt-1`} />
          </label>
        </section>
      )}

      {ficha && nombrePaso === 'Destino' && (
        <section aria-label="Destino" className="space-y-4">
          {etapa === 'DECISION' && (
            <label className={etiqueta}>
              Fecha
              <input type="date" value={fecha} max={hoy()} onChange={(e) => setFecha(e.target.value)} className={`${inputChico} mt-1`} />
            </label>
          )}
          {etapa === 'DIAGNOSTICO' &&
            lotes.map((l) => (
              <EcografiaLote
                key={l.loteId}
                lote={l}
                d={datos[l.loteId]}
                e={eleccionDe(l)}
                onCambiar={(cambios) => ponerEleccion(l, cambios)}
                potreros={otrosPotreros(l)}
                categorias={categorias}
                iatf={esIatf}
              />
            ))}
          {etapa === 'DECISION' &&
            lotes.map((l) => (
              <DecidirVacias
                key={l.loteId}
                lote={l}
                destino={destinoDe(l, 'vacias')}
                onCambiar={(cambios) => ponerDestino(l, 'vacias', cambios)}
                potreros={otrosPotreros(l)}
                categorias={categorias}
                iatf={esIatf}
              />
            ))}
        </section>
      )}

      {nombrePaso === 'Revisar' && previa && (
        <section aria-label="Revisar" className="space-y-3">
          <p className="rounded-lg border border-campo-200 bg-campo-50 px-4 py-3 text-base font-medium text-campo-900" data-testid="oracion">
            {previa.oracion}.
          </p>
          {previa.pasos?.length > 0 && (
            <ol className="list-decimal space-y-1 rounded-lg border border-suelo-200 bg-superficie py-2 pl-8 pr-3 text-sm">
              {previa.pasos.map((p) => (
                <li key={p.texto}>{p.texto}</li>
              ))}
            </ol>
          )}
          {previa.avisos.map((a) => (
            <Notice key={a}>{a}</Notice>
          ))}
          {previa.pasos?.length > 0 && <p className="text-xs text-suelo-500">Todo junto: si algo falla, no se guarda nada.</p>}
        </section>
      )}
    </Camino>
  );
}

// Un select de potrero: "Se quedan en …" (si no se tienen que ir) o "Elegí…".
function SelectPotrero({ aria, valor, onCambiar, potreros, lote, obligatorio, etiquetaTexto }) {
  return (
    <label className="block text-xs text-suelo-600">
      {etiquetaTexto}
      <select aria-label={aria} value={valor ?? ''} onChange={(e) => onCambiar(e.target.value)} className={`${inputChico} mt-1`}>
        <option value="">{obligatorio ? 'Elegí el potrero…' : `Se quedan en ${lote.potrero?.nombre}`}</option>
        {potreros.map((p) => (
          <option key={p.id} value={p.id}>
            {opcionPotrero(p, 'A ')}
          </option>
        ))}
      </select>
    </label>
  );
}

// La ecografía de un lote (reglas del campo, R1/R4): quiénes se van (si hay
// preñadas y vacías y no queda nadie sin ecografiar), las preñadas (juntas o
// por mes) y las vacías (entore con toros si es una IATF, o engorde).
function EcografiaLote({ lote, d, e, onCambiar, potreros, categorias, iatf }) {
  const o = opcionesEcografia(lote, d);
  const van = quienesSeVan(lote, d, e);
  const falta = faltaEcografia(lote, d, e, { iatf });
  const seVan = e.seVan ?? 'VACIAS';
  const vaciasA = iatf ? e.vaciasA : 'ENGORDE';
  const prenadas = o.prenadas.reduce((s, g) => s + g.cabezas, 0);
  const prenadasQuedan = o.pregunta && seVan === 'VACIAS';
  const vaciasQuedan = o.pregunta && seVan === 'PRENADAS';
  return (
    <fieldset data-lote={lote.loteId} className="space-y-3 rounded-lg border border-suelo-200 bg-superficie p-3">
      <legend className="px-1 text-sm font-semibold">
        {lote.nombre}: en {lote.potrero?.nombre} hay {formatNumero(lote.cabezas)}
      </legend>
      {o.sinEcografiar > 0 && (
        <p className="text-xs text-suelo-600" data-testid="sin-ecografiar">
          Las {formatNumero(o.sinEcografiar)} sin ecografiar se quedan en {lote.potrero?.nombre}: las ecografiadas van a otros potreros.
        </p>
      )}
      {o.pregunta && (
        <div>
          <p className="mb-1 text-sm text-suelo-700">¿Quiénes se van?</p>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label={`${lote.nombre}: quiénes se van`}>
            {[
              ['VACIAS', 'Las vacías'],
              ['PRENADAS', 'Las preñadas'],
              ['DOS', 'Las dos'],
            ].map(([valor, t]) => (
              <button key={valor} type="button" onClick={() => onCambiar({ seVan: valor })} aria-pressed={seVan === valor} className={`min-h-11 rounded-lg border px-2 text-sm font-medium ${seVan === valor ? 'border-campo-500 bg-campo-50 text-campo-900' : 'border-suelo-300 bg-superficie'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {o.prenadas.length > 0 && (
        <div data-grupo="prenadas" className="rounded-md border border-suelo-100 bg-suelo-50 p-2">
          <p className="text-sm font-medium">Preñadas · {formatNumero(prenadas)}</p>
          {o.porMes && (
            <div className="mt-1">
              <p className="text-xs text-suelo-600">¿Las separás por mes?</p>
              <div className="mt-1 grid grid-cols-2 gap-2" role="group" aria-label={`${lote.nombre}: separar por mes`}>
                {[
                  [false, 'No, todas juntas'],
                  [true, 'Sí, un lote por mes'],
                ].map(([valor, t]) => (
                  <button key={t} type="button" onClick={() => onCambiar({ porMes: valor })} aria-pressed={Boolean(e.porMes) === valor} className={`min-h-11 rounded-lg border px-2 text-sm ${Boolean(e.porMes) === valor ? 'border-campo-500 bg-campo-50' : 'border-suelo-300 bg-superficie'}`}>
                    {t}
                  </button>
                ))}
              </div>
              {!e.porMes && <p className="mt-1 text-xs text-suelo-500">Los meses quedan anotados para la parición esperada.</p>}
            </div>
          )}
          {o.porMes && e.porMes ? (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {o.prenadas.map((g) => (
                <SelectPotrero
                  key={g.clave}
                  aria={`${lote.nombre} · ${g.nombre}: a dónde`}
                  etiquetaTexto={`${g.nombre} · ${formatNumero(g.cabezas)}`}
                  valor={e.potreroMes?.[g.clave]}
                  onCambiar={(v) => onCambiar({ potreroMes: { ...e.potreroMes, [g.clave]: v } })}
                  potreros={potreros}
                  lote={lote}
                  obligatorio={van.prenadas}
                />
              ))}
            </div>
          ) : prenadasQuedan ? (
            <p className="mt-1 text-xs text-suelo-600">Se quedan en {lote.potrero?.nombre}.</p>
          ) : (
            <div className="mt-2">
              <SelectPotrero
                aria={`${lote.nombre} · Preñadas: a dónde`}
                etiquetaTexto="A dónde van"
                valor={e.potreroPrenadas}
                onCambiar={(v) => onCambiar({ potreroPrenadas: v })}
                potreros={potreros}
                lote={lote}
                obligatorio={van.prenadas}
              />
            </div>
          )}
        </div>
      )}

      {o.vacias && (
        <div data-grupo="vacias" className="rounded-md border border-suelo-100 bg-suelo-50 p-2">
          <p className="text-sm font-medium">Vacías · {formatNumero(o.vacias.cabezas)}</p>
          {iatf ? (
            <div className="mt-1 grid grid-cols-2 gap-2" role="group" aria-label={`${lote.nombre}: qué pasa con las vacías`}>
              {[
                ['ENTORE', 'Entore con toros', 'Una sola vez: si vuelven vacías, a engorde.'],
                ['ENGORDE', 'Engorde', 'Salen del proceso.'],
              ].map(([valor, t, detalle]) => (
                <button key={valor} type="button" onClick={() => onCambiar({ vaciasA: valor })} aria-pressed={vaciasA === valor} className={opcionClase(vaciasA === valor)}>
                  <span className="font-semibold">{t}</span>
                  <span className="text-xs text-suelo-500">{detalle}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-xs text-suelo-600">Van a engorde: las vacías de un entore no se vuelven a servir.</p>
          )}
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {vaciasQuedan ? (
              <p className="text-xs text-suelo-600">Se quedan en {lote.potrero?.nombre}.</p>
            ) : (
              <SelectPotrero
                aria={`${lote.nombre} · Vacías: a dónde`}
                etiquetaTexto="A dónde van"
                valor={e.potreroVacias}
                onCambiar={(v) => onCambiar({ potreroVacias: v })}
                potreros={potreros}
                lote={lote}
                obligatorio={van.vacias}
              />
            )}
            {vaciasA === 'ENGORDE' && (
              <label className="block text-xs text-suelo-600">
                Categoría
                <select aria-label={`${lote.nombre} · Vacías: categoría`} value={e.categoriaVacias ?? String(lote.sugeridas?.VACIA ?? lote.categoriaId ?? '')} onChange={(ev) => onCambiar({ categoriaVacias: ev.target.value })} className={`${inputChico} mt-1`}>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>
      )}
      {falta && <p className="text-xs font-medium text-amber-800" data-testid="falta">{falta}</p>}
    </fieldset>
  );
}

// Decidir lo de unas vacías cargadas antes de las reglas del campo (sin
// destino): entore con toros (solo si el proceso es una IATF) o engorde, y el potrero.
function DecidirVacias({ lote, destino, onCambiar, potreros, categorias, iatf }) {
  const titulo = `${lote.nombre} · Vacías`;
  return (
    <fieldset data-grupo="vacias" className="space-y-2 rounded-lg border border-suelo-200 bg-superficie p-3">
      <legend className="px-1 text-sm font-semibold">
        {lote.nombre} ({lote.potrero?.nombre}) · {formatNumero(lote.cabezas)} vacías
      </legend>
      <select aria-label={`${titulo}: qué se hace`} value={destino.tipo} onChange={(e) => onCambiar({ tipo: e.target.value })} className={inputChico}>
        <option value="">Elegí…</option>
        {iatf && <option value="ENTORE">Entore con toros (una sola vez)</option>}
        <option value="ENGORDE">Engorde (salen del proceso)</option>
      </select>
      {!iatf && <p className="text-xs text-suelo-500">Son de un entore: no se vuelven a servir.</p>}
      {destino.tipo && (
        <div className="grid gap-2 sm:grid-cols-2">
          <SelectPotrero aria={`${titulo}: a qué potrero`} etiquetaTexto="A dónde van" valor={destino.potreroId} onCambiar={(v) => onCambiar({ potreroId: v || null })} potreros={potreros} lote={lote} obligatorio={false} />
          {destino.tipo === 'ENGORDE' && (
            <label className="block text-xs text-suelo-600">
              Categoría
              <select aria-label={`${titulo}: categoría`} value={destino.categoriaId ?? ''} onChange={(e) => onCambiar({ categoriaId: e.target.value })} className={`${inputChico} mt-1`}>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </fieldset>
  );
}
