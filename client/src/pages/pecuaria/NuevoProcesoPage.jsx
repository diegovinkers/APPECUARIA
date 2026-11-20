import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { crearProceso, getProcesos, vistaPreviaProceso } from '../../api/pecuaria';
import { getErrorMessages } from '../../api/axios';
import { useEstancia } from '../../context/EstanciaContext';
import usePotreros from '../../hooks/usePotreros';
import Camino from '../../components/Camino';
import { ErrorList, inputClass } from '../../components/ui';
import { formatNumero } from '../../components/pecuaria';
import { indexarLotes } from '../../components/eventos';
import { cuerpoProceso } from '../../components/procesos';
import { ElegirEstancia } from './comun';

const hoy = () => new Date().toLocaleDateString('sv-SE');
const etiqueta = 'block text-sm text-suelo-600';
const inputChico = `${inputClass} min-h-11 px-3`;
const PASOS = ['Qué', 'A quién', 'Datos', 'Revisar'];
const MODALIDADES = [
  ['TOROS', 'Entore con toros', 'Se echan los toros con las hembras'],
  ['IA', 'Inseminación', 'Inseminación artificial'],
  ['IATF', 'IATF', 'Inseminación a tiempo fijo (un solo día)'],
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
//   1. Qué: con toros, inseminación o IATF, o "ya está en curso".
//   2. A quién: los lotes de hembras de la estancia que no están en otro proceso.
//   3. Datos: la fecha (o las fechas y los números de antes), los toros, el nombre.
//   4. Revisar y confirmar. Después, a la ficha del proceso.
export default function NuevoProcesoPage() {
  const navigate = useNavigate();
  const { campoId, todas } = useEstancia();
  const { potreros } = usePotreros(campoId);
  const [paso, setPaso] = useState(0);
  const [modalidad, setModalidad] = useState('TOROS');
  const [conCurso, setConCurso] = useState(false);
  const [elegidos, setElegidos] = useState([]);
  const [enProceso, setEnProceso] = useState(() => new Set());
  const [datos, setDatos] = useState({ fecha: hoy(), toros: '', nombre: '', nota: '' });
  const [cabezas, setCabezas] = useState({});
  const [curso, setCurso] = useState({ etapa: 'PARIENDO', inicio: '', fin: '', servidas: '', prenadas: '', vacias: '' });
  const [roles, setRoles] = useState({});
  const [previa, setPrevia] = useState(null);
  const [errors, setErrors] = useState([]);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!campoId) return;
    getProcesos(campoId, { estado: 'ABIERTO' })
      .then(({ data }) => setEnProceso(new Set(data.flatMap((p) => p.loteIds ?? []))))
      .catch(() => setEnProceso(new Set()));
  }, [campoId]);

  const hembras = useMemo(() => indexarLotes(potreros ?? []).filter((l) => l.sexo !== 'MACHO' && !enProceso.has(l.loteId)), [potreros, enProceso]);
  const lotes = hembras.filter((l) => elegidos.includes(l.loteId));
  const cuerpo = () => cuerpoProceso({ modalidad, campoId, elegidos: lotes, cabezas, ...datos, ...(conCurso && { enCurso: curso, roles }) });
  const poner = (set) => (campo) => (e) => set((d) => ({ ...d, [campo]: e.target.value }));

  async function seguir() {
    setErrors([]);
    if (paso < 2) return setPaso(paso + 1);
    setOcupado(true);
    try {
      if (paso === 2) {
        const { data } = await vistaPreviaProceso(cuerpo());
        setPrevia(data);
        setPaso(3);
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

  if (!campoId && todas) {
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
      titulo="Nuevo proceso"
      pasos={PASOS}
      actual={paso}
      onIr={(i) => {
        setErrors([]);
        setPaso(i);
      }}
      onSeguir={seguir}
      textoSeguir={paso === 3 ? 'Confirmar' : paso === 2 ? 'Revisar' : 'Seguir'}
      puedeSeguir={paso === 0 || lotes.length > 0}
      ocupado={ocupado}
      ayuda={lotes.length ? `${lotes.length} ${lotes.length === 1 ? 'lote' : 'lotes'} · ${formatNumero(lotes.reduce((s, l) => s + l.cabezas, 0))} cab` : null}
    >
      <div className="mt-2">
        <ErrorList errors={errors} />
      </div>

      {paso === 0 && (
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

      {paso === 1 && (
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
                    </span>
                  </span>
                  <span className="shrink-0 text-suelo-600">{formatNumero(l.cabezas)} cab</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      {paso === 2 && !conCurso && (
        <section aria-label="Datos" className="space-y-4">
          <label className={etiqueta}>
            Fecha de inicio
            <input type="date" value={datos.fecha} max={hoy()} onChange={poner(setDatos)('fecha')} className={`${inputChico} mt-1`} />
          </label>
          {modalidad === 'TOROS' && (
            <label className={etiqueta}>
              Toros (opcional)
              <input inputMode="numeric" value={datos.toros} onChange={poner(setDatos)('toros')} className={`${inputChico} mt-1`} />
            </label>
          )}
          {lotes.map((l) => (
            <label key={l.loteId} className={etiqueta}>
              Cabezas que se sirven ({l.lote}, por defecto {formatNumero(l.cabezas)})
              <input inputMode="numeric" value={cabezas[l.loteId] ?? ''} onChange={(e) => setCabezas((c) => ({ ...c, [l.loteId]: e.target.value }))} className={`${inputChico} mt-1`} />
            </label>
          ))}
          <Nombre datos={datos} onCambiar={poner(setDatos)} />
        </section>
      )}

      {paso === 2 && conCurso && (
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

      {paso === 3 && previa && (
        <section aria-label="Revisar">
          <p className="rounded-lg border border-campo-200 bg-campo-50 px-4 py-3 text-base font-medium text-campo-900" data-testid="oracion">
            {previa.oracion}.
          </p>
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
