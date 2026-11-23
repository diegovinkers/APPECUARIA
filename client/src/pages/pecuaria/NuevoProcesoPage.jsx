import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { crearProceso, getProceso, getProcesos, getToros, registrarEtapa, vistaPreviaEtapa, vistaPreviaProceso } from '../../api/pecuaria';
import { getErrorMessages } from '../../api/axios';
import { useEstancia } from '../../context/EstanciaContext';
import usePotreros from '../../hooks/usePotreros';
import Camino from '../../components/Camino';
import { ErrorList, inputClass } from '../../components/ui';
import { formatNumero, opcionPotrero } from '../../components/pecuaria';
import { indexarLotes } from '../../components/eventos';
import { cuerpoProceso } from '../../components/procesos';
import { ElegirEstancia } from './comun';
import { ListaToros, torosLibres } from '../../components/TorosProceso';

const hoy = () => new Date().toLocaleDateString('sv-SE');
const etiqueta = 'block text-sm text-suelo-600';
const inputChico = `${inputClass} min-h-11 px-3`;
const PASOS = ['Qué', 'A quién', 'Datos', 'Dónde', 'Revisar'];
const PASOS_EN_CURSO = ['Qué', 'A quién', 'Datos', 'Revisar'];
// Otra tanda de un proceso que ya está (fase 6): sin elegir el tipo.
const PASOS_TANDA = ['A quién', 'Datos', 'Dónde', 'Revisar'];
// Solo entore e IATF (ajustes del 20/11: la inseminación "común" es lo mismo para ellos).
const MODALIDADES = [
  ['TOROS', 'Entore con toros', 'Se echan los toros con las hembras'],
  ['IATF', 'IATF', 'Inseminación a tiempo fijo. Si se hace en varios días, cada día se anota aparte.'],
];
const ROLES = [
  ['PRENADAS', 'Preñadas (sin parir)'],
  ['PARIDAS', 'Paridas (con cría al pie)'],
  ['VACIAS', 'Vacías'],
  ['CRIAS', 'Crías (terneros o terneras)'],
];

// Empezar un proceso (diseño de procesos §12 y §14). Por ahora hay un tipo, el
// ciclo reproductivo: un servicio nuevo, o uno
// que ya está en curso (diagnosticado o pariendo) con sus números de antes.
//   1. Qué: entore con toros o IATF, o "ya está en curso".
//   2. A quién: los lotes de hembras de la estancia que no están en otro
//      proceso (las vacías para volver a servir, primero).
//   3. Datos: la fecha (o las fechas y los números de antes), cuántas entran
//      (en la IATF, cuántas se inseminaron hoy), los toros, el nombre.
//   4. Dónde (ajustes del 20/11): se quedan donde están, o repartirlas en
//      potreros (cada fila: potrero, cabezas y toros). No va si ya está en curso.
//   5. Revisar (con los movimientos que se harían) y confirmar.
// En /pecuaria/procesos/:id/tanda (fase 6) es otra tanda de ese proceso: los
// mismos pasos sin el tipo (sale del proceso), y se carga como etapa TANDA.
// En un entore, los toros se eligen uno por uno (van al potrero de las vacas).
export default function NuevoProcesoPage() {
  const navigate = useNavigate();
  const { id: tandaDe } = useParams();
  // Nuevo entore de las paridas de un proceso (fase 7): ?desde=<id del proceso>.
  const [params] = useSearchParams();
  const desde = tandaDe ? null : params.get('desde');
  const { campoId: campoElegido, todas } = useEstancia();
  const [proceso, setProceso] = useState(null);
  const campoId = tandaDe ? (proceso?.campoId ?? null) : campoElegido;
  const { potreros } = usePotreros(campoId);
  const [toros, setToros] = useState([]);
  const [toroIds, setToroIds] = useState({}); // { [toroId]: '' } (van al potrero de las vacas)
  const [paso, setPaso] = useState(0);
  const [modalidad, setModalidad] = useState('TOROS');
  const [conCurso, setConCurso] = useState(false);
  const [elegidos, setElegidos] = useState([]);
  const [enProceso, setEnProceso] = useState(() => new Set());
  const [paraServir, setParaServir] = useState(() => new Set());
  const [conCria, setConCria] = useState(() => new Map()); // loteId → nombre del proceso
  const [repartir, setRepartir] = useState(false);
  const [reparto, setReparto] = useState({}); // { [loteId]: [{ potreroId, cabezas, toros }] }
  const [datos, setDatos] = useState({ fecha: hoy(), toros: '', nombre: '', nota: '' });
  const [cabezas, setCabezas] = useState({});
  const [curso, setCurso] = useState({ etapa: 'PARIENDO', inicio: '', fin: '', servidas: '', prenadas: '', vacias: '' });
  const [roles, setRoles] = useState({});
  const [previa, setPrevia] = useState(null);
  const [errors, setErrors] = useState([]);
  const [ocupado, setOcupado] = useState(false);

  // Otra tanda: el proceso dice la estancia y si es entore o inseminación.
  useEffect(() => {
    if (!tandaDe) return;
    getProceso(tandaDe)
      .then(({ data }) => {
        setProceso(data.proceso);
        setModalidad(['IATF', 'IA'].includes(data.proceso.datos?.modalidad) ? 'IATF' : 'TOROS');
      })
      .catch((error) => setErrors(getErrorMessages(error, 'No se pudo cargar el proceso')));
  }, [tandaDe]);

  // Los toros de la estancia, para elegirlos uno por uno.
  useEffect(() => {
    if (!campoId) return;
    getToros(campoId)
      .then(({ data }) => setToros(data))
      .catch(() => setToros([]));
  }, [campoId]);

  useEffect(() => {
    if (!campoId) return;
    getProcesos(campoId, { estado: 'ABIERTO' })
      .then(({ data }) => {
        setEnProceso(new Set(data.flatMap((p) => p.loteIds ?? [])));
        setParaServir(new Set(data.flatMap((p) => p.reentoreIds ?? [])));
        setConCria(new Map(data.flatMap((p) => (p.conCriaIds ?? []).map((id) => [id, p.nombre]))));
        // Desde la sugerencia "Nuevo entore": las paridas de ese proceso, ya elegidas.
        const origen = desde && data.find((p) => String(p.id) === String(desde));
        if (origen?.conCriaIds?.length) setElegidos((e) => (e.length ? e : origen.conCriaIds));
      })
      .catch(() => setEnProceso(new Set()));
  }, [campoId, desde]);

  // Las vacías que quedaron para volver a servir y las paridas, primero.
  const hembras = useMemo(
    () =>
      indexarLotes(potreros ?? [])
        .filter((l) => l.sexo !== 'MACHO' && !enProceso.has(l.loteId))
        .sort((a, b) => Number(paraServir.has(b.loteId) || conCria.has(b.loteId)) - Number(paraServir.has(a.loteId) || conCria.has(a.loteId))),
    [potreros, enProceso, paraServir, conCria],
  );
  const lotes = hembras.filter((l) => elegidos.includes(l.loteId));
  const pasos = tandaDe ? PASOS_TANDA : conCurso ? PASOS_EN_CURSO : PASOS;
  const libres = torosLibres(toros);
  const elegidosToros = Object.keys(toroIds).map(Number);
  const nombrePaso = pasos[paso];
  const cuerpoCrear = () =>
    cuerpoProceso({
      modalidad,
      campoId,
      elegidos: lotes,
      cabezas,
      ...datos,
      toroIds: elegidosToros,
      ...(repartir && { reparto }),
      ...(conCurso && { enCurso: curso, roles }),
    });
  // Otra tanda: las líneas y los toros, como etapa TANDA del proceso.
  const cuerpo = () => {
    const c = cuerpoCrear();
    if (!tandaDe) return c;
    return { fecha: c.fecha, ...(c.nota && { nota: c.nota }), lineas: c.lineas, ...(c.asignarToros && { toros: c.asignarToros }) };
  };
  const poner = (set) => (campo) => (e) => set((d) => ({ ...d, [campo]: e.target.value }));
  const filasDe = (loteId) => reparto[loteId] ?? [{ potreroId: '', cabezas: '', toros: '' }];
  const ponerFila = (loteId, i, cambios) => setReparto((r) => ({ ...r, [loteId]: filasDe(loteId).map((f, k) => (k === i ? { ...f, ...cambios } : f)) }));
  const agregarFila = (loteId) => setReparto((r) => ({ ...r, [loteId]: [...filasDe(loteId), { potreroId: '', cabezas: '', toros: '' }] }));
  const sacarFila = (loteId, i) => setReparto((r) => ({ ...r, [loteId]: filasDe(loteId).filter((_, k) => k !== i) }));
  const entran = (l) => {
    const n = Number.parseInt(String(cabezas[l.loteId] ?? '').trim(), 10);
    return Number.isInteger(n) && n > 0 ? n : l.cabezas;
  };

  async function seguir() {
    setErrors([]);
    if (nombrePaso !== 'Revisar' && pasos[paso + 1] !== 'Revisar') return setPaso(paso + 1);
    setOcupado(true);
    try {
      if (nombrePaso !== 'Revisar') {
        const { data } = tandaDe ? await vistaPreviaEtapa(tandaDe, 'TANDA', cuerpo()) : await vistaPreviaProceso(cuerpo());
        setPrevia(data);
        setPaso(paso + 1);
      } else if (tandaDe) {
        const { data } = await registrarEtapa(tandaDe, 'TANDA', cuerpo());
        navigate(`/pecuaria/procesos/${tandaDe}`, { state: { aviso: `${data.oracion}.` } });
      } else {
        const { data } = await crearProceso(cuerpo());
        navigate(`/pecuaria/procesos/${data.proceso.id}`, { state: { aviso: `${data.oracion}.` } });
      }
    } catch (error) {
      setErrors(getErrorMessages(error, 'No se pudo guardar'));
    } finally {
      setOcupado(false);
    }
  }

  if (!tandaDe && !campoId && todas) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="mb-3 text-xl font-bold">Nuevo proceso</h1>
        <ElegirEstancia />
      </main>
    );
  }

  const opcion = (activa) => `flex min-h-11 w-full flex-col rounded-lg border px-4 py-3 text-left ${activa ? 'border-campo-500 bg-campo-50' : 'border-suelo-300 bg-white hover:border-campo-400'}`;
  return (
    <Camino
      titulo={tandaDe ? `Otra tanda${proceso ? ` · ${proceso.nombre}` : ''}` : 'Nuevo proceso'}
      pasos={pasos}
      actual={paso}
      onIr={(i) => {
        setErrors([]);
        setPaso(i);
      }}
      onSeguir={seguir}
      textoSeguir={nombrePaso === 'Revisar' ? 'Confirmar' : pasos[paso + 1] === 'Revisar' ? 'Revisar' : 'Seguir'}
      puedeSeguir={nombrePaso === 'Qué' || lotes.length > 0}
      ocupado={ocupado}
      ayuda={lotes.length ? `${lotes.length} ${lotes.length === 1 ? 'lote' : 'lotes'} · ${formatNumero(lotes.reduce((s, l) => s + l.cabezas, 0))} cab` : null}
    >
      <div className="mt-2">
        <ErrorList errors={errors} />
      </div>

      {nombrePaso === 'Qué' && (
        <section aria-label="Qué" className="space-y-2">
          <p className="text-sm text-suelo-600">Tipo de proceso</p>
          <div className={opcion(true)} aria-current="true">
            <span className="font-semibold">Ciclo reproductivo</span>
            <span className="text-xs text-suelo-500">Servicio → diagnóstico → parición → destete. Más adelante, otros tipos de proceso.</span>
          </div>
          <p className="pt-2 text-sm text-suelo-600">¿Cómo es el servicio?</p>
          {MODALIDADES.map(([valor, texto, detalle]) => (
            <button key={valor} type="button" onClick={() => setModalidad(valor)} aria-pressed={modalidad === valor} className={opcion(modalidad === valor)}>
              <span className="font-semibold">{texto}</span>
              <span className="text-xs text-suelo-500">{detalle}</span>
            </button>
          ))}
          <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-suelo-200 bg-suelo-50 px-3 py-3 text-sm">
            <input type="checkbox" checked={conCurso} onChange={(e) => setConCurso(e.target.checked)} className="mt-0.5 h-5 w-5 accent-campo-600" />
            <span>
              <span className="block font-semibold">Ya está en curso</span>
              <span className="block text-xs text-suelo-600">Un servicio que empezó antes de la app (ya diagnosticado o pariendo): cargás solo sus números.</span>
            </span>
          </label>
        </section>
      )}

      {nombrePaso === 'A quién' && (
        <section aria-label="A quién" className="space-y-2">
          {!potreros && <p className="text-suelo-600">Cargando…</p>}
          {potreros && hembras.length === 0 && <p className="text-suelo-600">No hay lotes de hembras libres (sin otro proceso abierto) en esta estancia.</p>}
          <ul className="divide-y divide-suelo-100 rounded-lg border border-suelo-200 bg-white">
            {hembras.map((l) => (
              <li key={l.loteId}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={elegidos.includes(l.loteId)}
                    onChange={() => setElegidos((e) => (e.includes(l.loteId) ? e.filter((x) => x !== l.loteId) : [...e, l.loteId]))}
                    className="h-5 w-5 accent-campo-600"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{l.lote}</span>
                    <span className="block text-xs text-suelo-500">
                      {l.potrero} · {l.categoria}
                      {paraServir.has(l.loteId) && <span className="ml-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-800">para volver a servir</span>}
                      {conCria.has(l.loteId) && (
                        <span className="ml-1 rounded bg-campo-500/15 px-1.5 py-0.5 text-[11px] text-campo-800" title={`Sigue en "${conCria.get(l.loteId)}" hasta el destete`}>
                          con cría al pie
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="shrink-0 text-suelo-600">{formatNumero(l.cabezas)} cab</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      {nombrePaso === 'Datos' && !conCurso && (
        <section aria-label="Datos" className="space-y-4">
          <label className={etiqueta}>
            {modalidad === 'IATF' ? 'Fecha de la inseminación' : 'Fecha de inicio'}
            <input type="date" value={datos.fecha} max={hoy()} onChange={poner(setDatos)('fecha')} className={`${inputChico} mt-1`} />
            <span className="mt-1 block text-xs text-suelo-500">Con esta fecha se calcula cuándo toca el diagnóstico y la parición.</span>
          </label>
          {modalidad === 'TOROS' &&
            (libres.length ? (
              <ListaToros
                titulo="Toros (opcional)"
                ayuda="Cada toro elegido pasa del lote de toros al potrero de las vacas."
                toros={libres.map((t) => ({ ...t, donde: t.lote ? `en ${t.lote.potrero.nombre}` : 'sin lote' }))}
                elegidos={toroIds}
                onCambiar={setToroIds}
                conPotrero={false}
              />
            ) : (
              !tandaDe && (
                <label className={etiqueta}>
                  Toros (opcional)
                  <input inputMode="numeric" value={datos.toros} onChange={poner(setDatos)('toros')} className={`${inputChico} mt-1`} />
                  <span className="mt-1 block text-xs text-suelo-500">Para elegirlos uno por uno, cargalos en Configuración → Toros.</span>
                </label>
              )
            ))}
          {lotes.map((l) => (
            <label key={l.loteId} className={etiqueta}>
              {modalidad === 'IATF' ? '¿Cuántas se inseminaron hoy?' : '¿Cuántas entran al servicio?'} ({l.lote}, tiene {formatNumero(l.cabezas)})
              <input inputMode="numeric" value={cabezas[l.loteId] ?? ''} onChange={(e) => setCabezas((c) => ({ ...c, [l.loteId]: e.target.value }))} className={`${inputChico} mt-1`} />
              <span className="mt-1 block text-xs text-suelo-500">
                {modalidad === 'IATF'
                  ? 'Dejalo vacío si se inseminaron todas. Las que no, quedan aparte como "sin inseminar", para otro día.'
                  : 'Dejalo vacío si entran todas.'}
              </span>
            </label>
          ))}
          {tandaDe ? (
            <label className={etiqueta}>
              Nota (opcional)
              <input value={datos.nota} onChange={poner(setDatos)('nota')} maxLength={255} className={`${inputChico} mt-1`} />
            </label>
          ) : (
            <Nombre datos={datos} onCambiar={poner(setDatos)} />
          )}
        </section>
      )}

      {nombrePaso === 'Datos' && conCurso && (
        <section aria-label="Datos" className="space-y-4">
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="En qué etapa está">
            {[
              ['DIAGNOSTICADO', 'Diagnosticado'],
              ['PARIENDO', 'Pariendo'],
            ].map(([valor, texto]) => (
              <button key={valor} type="button" onClick={() => setCurso((c) => ({ ...c, etapa: valor }))} aria-pressed={curso.etapa === valor} className={opcion(curso.etapa === valor)}>
                {texto}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className={etiqueta}>
              Inicio del servicio
              <input type="date" value={curso.inicio} max={hoy()} onChange={poner(setCurso)('inicio')} className={`${inputChico} mt-1`} />
            </label>
            <label className={etiqueta}>
              Fin del servicio
              <input type="date" value={curso.fin} max={hoy()} onChange={poner(setCurso)('fin')} className={`${inputChico} mt-1`} />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              ['servidas', 'Servidas'],
              ['prenadas', 'Preñadas'],
              ['vacias', 'Vacías'],
            ].map(([campo, texto]) => (
              <label key={campo} className={etiqueta}>
                {texto}
                <input inputMode="numeric" value={curso[campo]} onChange={poner(setCurso)(campo)} className={`${inputChico} mt-1`} />
              </label>
            ))}
          </div>
          {lotes.map((l) => (
            <label key={l.loteId} className={etiqueta}>
              {l.lote}: ¿qué son hoy?
              <select value={roles[l.loteId] ?? 'PRENADAS'} onChange={(e) => setRoles((r) => ({ ...r, [l.loteId]: e.target.value }))} className={`${inputChico} mt-1`}>
                {ROLES.map(([valor, texto]) => (
                  <option key={valor} value={valor}>
                    {texto}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <Nombre datos={datos} onCambiar={poner(setDatos)} />
        </section>
      )}

      {nombrePaso === 'Dónde' && (
        <section aria-label="Dónde" className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Dónde quedan">
            <button type="button" onClick={() => setRepartir(false)} aria-pressed={!repartir} className={opcion(!repartir)}>
              <span className="font-semibold">Se quedan donde están</span>
              <span className="text-xs text-suelo-500">Ya están en su potrero: no se mueve nada.</span>
            </button>
            <button type="button" onClick={() => setRepartir(true)} aria-pressed={repartir} className={opcion(repartir)}>
              <span className="font-semibold">Repartirlas en potreros</span>
              <span className="text-xs text-suelo-500">{modalidad === 'TOROS' ? 'Por ejemplo, 25 por potrero con un toro.' : 'Llevarlas a otros potreros.'}</span>
            </button>
          </div>
          {repartir &&
            lotes.map((l) => {
              const filas = filasDe(l.loteId);
              const repartidas = filas.reduce((s, f) => s + (Number.parseInt(f.cabezas, 10) || 0), 0);
              const otros = (potreros ?? []).filter((p) => p.id !== l.potreroId);
              return (
                <fieldset key={l.loteId} className="space-y-2 rounded-lg border border-suelo-200 bg-white p-3" data-reparto={l.loteId}>
                  <legend className="px-1 text-sm font-semibold">
                    {l.lote} ({l.potrero}) · entran {formatNumero(entran(l))}
                  </legend>
                  {filas.map((f, i) => (
                    <div key={i} className={`grid ${modalidad === 'TOROS' ? 'grid-cols-[1fr_5rem_4.5rem_auto]' : 'grid-cols-[1fr_5rem_auto]'} items-end gap-2`}>
                      <label className="block text-xs text-suelo-600">
                        Potrero
                        <select aria-label={`${l.lote}: potrero ${i + 1}`} value={f.potreroId} onChange={(e) => ponerFila(l.loteId, i, { potreroId: e.target.value })} className={`${inputChico} mt-1 w-full`}>
                          <option value="">Elegí…</option>
                          {otros.map((p) => (
                            <option key={p.id} value={p.id}>
                              {opcionPotrero(p)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-xs text-suelo-600">
                        Cabezas
                        <input aria-label={`${l.lote}: cabezas ${i + 1}`} inputMode="numeric" value={f.cabezas} onChange={(e) => ponerFila(l.loteId, i, { cabezas: e.target.value })} className={`${inputChico} mt-1 w-full`} />
                      </label>
                      {modalidad === 'TOROS' && (
                        <label className="block text-xs text-suelo-600">
                          Toros
                          <input aria-label={`${l.lote}: toros ${i + 1}`} inputMode="numeric" value={f.toros} onChange={(e) => ponerFila(l.loteId, i, { toros: e.target.value })} className={`${inputChico} mt-1 w-full`} />
                        </label>
                      )}
                      <button type="button" aria-label={`Sacar la fila ${i + 1}`} onClick={() => sacarFila(l.loteId, i)} className="min-h-11 min-w-11 rounded-md text-suelo-500 hover:bg-suelo-100">
                        ✕
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => agregarFila(l.loteId)} className="min-h-11 text-sm font-medium text-campo-700 hover:underline">
                    + Agregar potrero
                  </button>
                  <p className={`text-xs ${repartidas > entran(l) ? 'font-medium text-red-700' : 'text-suelo-500'}`} data-testid="quedan">
                    {repartidas > entran(l)
                      ? `Repartís ${formatNumero(repartidas)}, pero entran ${formatNumero(entran(l))}.`
                      : `Quedan en ${l.potrero}: ${formatNumero(l.cabezas - repartidas)}.`}
                  </p>
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
            <ol className="list-decimal space-y-1 rounded-lg border border-suelo-200 bg-white py-2 pl-8 pr-3 text-sm">
              {previa.pasos.map((p) => (
                <li key={p.texto}>{p.texto}</li>
              ))}
            </ol>
          )}
        </section>
      )}
    </Camino>
  );
}

function Nombre({ datos, onCambiar }) {
  return (
    <>
      <label className={etiqueta}>
        Nombre (opcional; si no, "Servicio 2026-27 · …")
        <input value={datos.nombre} onChange={onCambiar('nombre')} maxLength={120} className={`${inputChico} mt-1`} />
      </label>
      <label className={etiqueta}>
        Nota (opcional)
        <input value={datos.nota} onChange={onCambiar('nota')} maxLength={255} className={`${inputChico} mt-1`} />
      </label>
    </>
  );
}
