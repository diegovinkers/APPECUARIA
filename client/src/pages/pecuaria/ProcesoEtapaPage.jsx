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
  gruposDiagnostico,
  nombreMes,
  textoBotonEtapa,
  totalDiagnostico,
} from '../../components/procesos';

const hoy = () => new Date().toLocaleDateString('sv-SE');
const etiqueta = 'block text-sm text-suelo-600';
const inputChico = `${inputClass} min-h-11 px-3`;
const texto = (t) => String(t ?? '').trim();

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
  const [destinos, setDestinos] = useState({}); // { [loteId]: { [clave]: destino } }
  const [revision, setRevision] = useState({}); // { [loteId]: { cambian, aLoteId } }
  const [paricion, setParicion] = useState({}); // { [loteId]: { madres, machos, ..., categoriaId } }
  // En un aborto, la vaca vuelve a vacía (fase 8): arranca marcado.
  const [aVacias, setAVacias] = useState(true);
  const [causas, setCausas] = useState([]);
  const [causaId, setCausaId] = useState('');
  const [destete, setDestete] = useState({}); // { [loteId]: { potreroId, categoriaId, peso } }
  const [iatf, setIatf] = useState({}); // { [loteId]: { cabezas, potreroId, destino } }
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

  const destinoDe = (l, clave) => destinos[l.loteId]?.[clave] ?? (etapa === 'DECISION' ? { tipo: '' } : destinoPorDefecto(l, clave === 'vacias' ? 'VACIAS' : 'PRENADAS'));
  const ponerDestino = (l, clave, cambios) =>
    setDestinos((d) => ({ ...d, [l.loteId]: { ...d[l.loteId], [clave]: { ...destinoDe(l, clave), ...cambios } } }));

  function cuerpo() {
    const base = { fecha, ...(texto(nota) && { nota: texto(nota) }) };
    if (etapa === 'DIAGNOSTICO') return cuerpoDiagnostico({ fecha, metodo, lotes, datos, destinos, nota });
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
    if (etapa === 'FIN_PARICION') return { ...base, lineas: lotes.map((l) => ({ loteId: l.loteId })) };
    if (etapa === 'INSEMINACION' || etapa === 'FIN_INSEMINACION') {
      return {
        ...base,
        lineas: lotes.map((l) => {
          const d = iatf[l.loteId] ?? {};
          return {
            loteId: l.loteId,
            ...(etapa === 'INSEMINACION' ? { cabezas: texto(d.cabezas) } : { destino: d.destino }),
            ...(d.potreroId && { potreroId: Number(d.potreroId) }),
          };
        }),
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
      lineas: lotes.map((l) => (texto(cabezas[l.loteId]) ? { loteId: l.loteId, cabezas: texto(cabezas[l.loteId]) } : { loteId: l.loteId })),
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

  const desteteOk = etapa !== 'DESTETE' || lotes.every((l) => destete[l.loteId]?.potreroId);
  const iatfOk =
    (etapa !== 'INSEMINACION' || lotes.every((l) => Number.parseInt(texto(iatf[l.loteId]?.cabezas), 10) > 0)) &&
    (etapa !== 'FIN_INSEMINACION' || lotes.every((l) => iatf[l.loteId]?.destino));
  const bajaOk = etapa !== 'BAJA' || (causaId && lotes.every((l) => Number.parseInt(texto(cabezas[l.loteId]), 10) > 0));
  const datosOk = desteteOk && iatfOk && bajaOk && (etapa !== 'DIAGNOSTICO' || lotes.every((l) => totalDiagnostico(datos[l.loteId]) >= 1 && totalDiagnostico(datos[l.loteId]) <= l.cabezas));
  const destinoOk = etapa !== 'DECISION' || lotes.every((l) => destinoDe(l, 'vacias').tipo);
  const torosOk = !faltaPotrero(salenDe) && !faltaPotrero(entran);
  const cuantosToros = Object.keys(salenDe).length + Object.keys(entran).length;
  const puedeSeguir = cfg.sinLotes
    ? cuantosToros > 0 && torosOk
    : lotes.length > 0 && (nombrePaso !== 'Datos' || (datosOk && torosOk)) && (nombrePaso !== 'Destino' || destinoOk);
  const otrosPotreros = (l) => (potreros ?? []).filter((p) => p.id !== l.potrero?.id);
  const titulo = textoBotonEtapa(etapa);

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
            <p className="text-xs text-suelo-500">Si hoy ecografiás una parte, poné solo esas: el resto queda para otro día.</p>
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
                      <option value="">Se quedan en este lote</option>
                      {destinosPosibles.map((x) => (
                        <option key={x.loteId} value={x.loteId}>
                          {x.nombre} ({x.potrero?.nombre})
                        </option>
                      ))}
                    </select>
                  </label>
                </fieldset>
              );
            })}

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
                    Los terneros van al lote del mes en que nacieron (por ejemplo, &quot;Terneros/as sep-2027&quot;; se crea o se suma). El sexo y las caravanas se cargan después. La madre sigue en su categoría: pasa a estar parida. Para abortos: ⋯ → Registrar abortos.
                  </p>
                </fieldset>
              );
            })}

          {etapa === 'DESTETE' &&
            lotes.map((l) => {
              const d = destete[l.loteId] ?? {};
              const poner = (campo, valor) => setDestete((x) => ({ ...x, [l.loteId]: { ...x[l.loteId], [campo]: valor } }));
              return (
                <fieldset key={l.loteId} className="space-y-2 rounded-lg border border-suelo-200 bg-superficie p-3">
                  <legend className="px-1 text-sm font-semibold">
                    {l.nombre} · {formatNumero(l.cabezas)} cab (en {l.potrero?.nombre})
                  </legend>
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
                </fieldset>
              );
            })}
          {etapa === 'DESTETE' && <p className="text-xs text-suelo-500">Cuando a las madres ya no les quedan crías al pie, dejan este proceso (siguen en su categoría y en el entore nuevo, si entraron).</p>}

          {(etapa === 'INSEMINACION' || etapa === 'FIN_INSEMINACION') &&
            lotes.map((l) => {
              const d = iatf[l.loteId] ?? {};
              return (
                <fieldset key={l.loteId} className="space-y-2 rounded-lg border border-suelo-200 bg-superficie p-3">
                  <legend className="px-1 text-sm font-semibold">
                    {l.nombre} ({l.potrero?.nombre}) · {formatNumero(l.cabezas)} sin inseminar
                  </legend>
                  {etapa === 'INSEMINACION' ? (
                    <label className={etiqueta}>
                      ¿Cuántas se inseminaron hoy? ({l.nombre})
                      <input aria-label={`¿Cuántas se inseminaron hoy? (${l.nombre})`} inputMode="numeric" value={d.cabezas ?? ''} onChange={(e) => ponerIatf(l, { cabezas: e.target.value })} className={`${inputChico} mt-1`} />
                    </label>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label={`${l.nombre}: qué pasa con las sin inseminar`}>
                      {[
                        ['REPASO', 'Repaso con toro', 'Siguen en el proceso y cuentan como servidas.'],
                        ['SALEN', 'Salen del proceso', 'Vuelven a ser vacas libres.'],
                      ].map(([valor, titulo, detalle]) => (
                        <button
                          key={valor}
                          type="button"
                          onClick={() => ponerIatf(l, { destino: valor })}
                          aria-pressed={d.destino === valor}
                          className={`flex min-h-11 flex-col rounded-lg border px-3 py-2 text-left text-sm ${d.destino === valor ? 'border-campo-500 bg-campo-50' : 'border-suelo-300 bg-superficie'}`}
                        >
                          <span className="font-semibold">{titulo}</span>
                          <span className="text-xs text-suelo-500">{detalle}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <label className={etiqueta}>
                    {etapa === 'INSEMINACION' ? '¿A dónde van las inseminadas?' : '¿A dónde van?'}
                    <select aria-label={`${l.nombre}: a qué potrero`} value={d.potreroId ?? ''} onChange={(e) => ponerIatf(l, { potreroId: e.target.value })} className={`${inputChico} mt-1`}>
                      <option value="">Se quedan en {l.potrero?.nombre}</option>
                      {otrosPotreros(l).map((p) => (
                        <option key={p.id} value={p.id}>
                          {opcionPotrero(p, 'A ')}
                        </option>
                      ))}
                    </select>
                  </label>
                </fieldset>
              );
            })}
          {etapa === 'INSEMINACION' && <p className="text-xs text-suelo-500">Las inseminadas pasan a un lote aparte ("· IATF" con la fecha); las demás siguen sin inseminar, para otro día.</p>}

          {etapa === 'FIN_PARICION' && (
            <p className="text-sm text-suelo-600">Las que quedan sin parir en los lotes elegidos pasan a vacías (falladas): después decidís qué se hace con ellas.</p>
          )}

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
              Pasarlas a vacías (a un lote aparte, para decidir después)
            </label>
          )}
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
          <p className="text-sm text-suelo-600">¿Qué se hace con cada grupo?</p>
          {lotes.map((l) => {
            const grupos = etapa === 'DECISION' ? [{ clave: 'vacias', cabezas: l.cabezas, nombre: 'Vacías' }] : gruposDiagnostico(datos[l.loteId]);
            return (
              <fieldset key={l.loteId} className="space-y-2 rounded-lg border border-suelo-200 bg-superficie p-3">
                <legend className="px-1 text-sm font-semibold">
                  {l.nombre} ({l.potrero?.nombre}) · {formatNumero(l.cabezas)} cab
                </legend>
                {grupos.map((g) => (
                  <Grupo
                    key={g.clave}
                    lote={l}
                    grupo={g}
                    destino={destinoDe(l, g.clave)}
                    onCambiar={(cambios) => ponerDestino(l, g.clave, cambios)}
                    potreros={otrosPotreros(l)}
                    categorias={categorias}
                    conDespues={etapa !== 'DECISION'}
                  />
                ))}
              </fieldset>
            );
          })}
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

// Un grupo del diagnóstico (o las vacías a decidir): a dónde va y como qué.
function Grupo({ lote, grupo, destino, onCambiar, potreros, categorias, conDespues }) {
  const vacias = grupo.clave === 'vacias';
  const titulo = `${lote.nombre} · ${grupo.nombre}`;
  const valor = destino.tipo === 'POTRERO' ? `POTRERO:${destino.potreroId}` : destino.tipo;
  const cambiar = (v) => {
    const [tipo, potreroId] = v.split(':');
    // En las vacías, la categoría solo se elige si salen del proceso.
    const categoria = vacias ? { categoriaId: tipo === 'SALEN' ? String(lote.categoriaId ?? '') : '' } : {};
    onCambiar({ tipo, potreroId: potreroId ?? null, ...categoria });
  };
  // La categoría de la madre no cambia (docs/PECUARIA.md §9): solo se elige
  // para las vacías que salen del proceso.
  const conCategoria = vacias && destino.tipo === 'SALEN';
  const conPotrero = vacias && (destino.tipo === 'REENTORE' || destino.tipo === 'SALEN');
  return (
    <div data-grupo={grupo.clave} className="rounded-md border border-suelo-100 bg-suelo-50 p-2">
      <p className="text-sm font-medium">
        {grupo.nombre} · {formatNumero(grupo.cabezas)}
      </p>
      <div className="mt-1 grid gap-2 sm:grid-cols-2">
        <select aria-label={vacias ? `${titulo}: qué se hace` : `${titulo}: a dónde`} value={valor} onChange={(e) => cambiar(e.target.value)} className={inputChico}>
          {!conDespues && <option value="">Elegí…</option>}
          {vacias && conDespues && <option value="DESPUES">Decidir después (se quedan)</option>}
          {!vacias && <option value="QUEDAN">Se quedan en {lote.potrero?.nombre}</option>}
          {!vacias &&
            potreros.map((p) => (
              <option key={p.id} value={`POTRERO:${p.id}`}>
                {opcionPotrero(p, 'A ')}
              </option>
            ))}
          {vacias && <option value="REENTORE">Volver a intentar (próximo servicio)</option>}
          {vacias && <option value="SALEN">Solo moverlas (salen del proceso)</option>}
        </select>
        {conPotrero && (
          <select aria-label={`${titulo}: a qué potrero`} value={destino.potreroId ?? ''} onChange={(e) => onCambiar({ potreroId: e.target.value || null })} className={inputChico}>
            <option value="">Se quedan en {lote.potrero?.nombre}</option>
            {potreros.map((p) => (
              <option key={p.id} value={p.id}>
                {opcionPotrero(p, 'A ')}
              </option>
            ))}
          </select>
        )}
        {conCategoria && (
          <select aria-label={`${titulo}: categoría`} value={destino.categoriaId ?? ''} onChange={(e) => onCambiar({ categoriaId: e.target.value })} className={inputChico}>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        )}
      </div>
      {destino.tipo === 'VENTA' && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="block text-xs text-suelo-600">
            Número de guía
            <input aria-label={`${lote.nombre}: número de guía`} value={destino.guia ?? ''} onChange={(e) => onCambiar({ guia: e.target.value })} maxLength={30} className={`${inputChico} mt-1`} />
          </label>
          <label className="block text-xs text-suelo-600">
            Precio por cabeza (USD, opcional)
            <input aria-label={`${lote.nombre}: precio por cabeza`} inputMode="decimal" value={destino.precio ?? ''} onChange={(e) => onCambiar({ precio: e.target.value })} className={`${inputChico} mt-1`} />
          </label>
        </div>
      )}
    </div>
  );
}
