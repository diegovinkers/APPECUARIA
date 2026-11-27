import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getProcesos, getProcesosTodas } from '../api/pecuaria';
import { getErrorMessages } from '../api/axios';
import usePuede from '../hooks/usePuede';
import { ErrorList } from './ui';
import { formatFecha, formatNumero } from './pecuaria';
import { Paginador, paginar } from './tabla';
import PanelFiltros from './PanelFiltros';
import { campaniasParaFiltro, diasCorto, estiloSugerencia, nombreProceso, textoTipo } from './procesos';

const ESTADOS = [
  ['ABIERTO', 'Abiertos'],
  ['CERRADO', 'Cerrados'],
  ['ANULADO', 'Anulados'],
  ['TODOS', 'Todos'],
];
const ETAPAS = [
  ['SERVICIO', 'En servicio'],
  ['ESPERA_DIAGNOSTICO', 'Esperando el diagnóstico'],
  ['PRENEZ', 'Diagnosticado'],
  ['PARICION', 'Pariendo'],
  ['CRIA', 'Con cría al pie'],
  ['TERMINADO', 'Terminado'],
];
const hoy = () => new Date().toLocaleDateString('sv-SE');
const selector = 'mt-1 block w-full rounded-md border border-suelo-300 bg-superficie px-2 py-2 text-sm';

// La lista de la página Procesos (fase 5, docs/PECUARIA.md §9): una tarjeta
// por proceso (primero el celular, sin tablas anchas) con el tipo, dónde
// están, las cabezas y el próximo evento con los días que faltan, del color
// de su estado. Filtros en el panel (estado, campaña, etapa), en la URL.
// Tocar la tarjeta abre la ficha. Con "Todas las estancias", la sigla adelante.
// conNuevo: el botón "+ Nuevo proceso" (en la página Procesos ya está en el encabezado).
export default function ProcesosLista({ campoId, todas = false, grupo = 'estancias', conNuevo = true }) {
  const puedo = usePuede();
  const [params, setParams] = useSearchParams();
  const f = { estado: params.get('pestado') || 'ABIERTO', campania: params.get('pcampania') ?? '', etapa: params.get('petapa') ?? '' };
  const poner = (cambios) =>
    setParams(
      (actual) => {
        const nuevo = new URLSearchParams(actual);
        for (const [k, v] of Object.entries(cambios)) v ? nuevo.set(k, v) : nuevo.delete(k);
        return nuevo;
      },
      { replace: true },
    );

  const [datos, setDatos] = useState(null);
  const [errors, setErrors] = useState([]);
  const [pagina, setPagina] = useState(1);
  const filtros = useMemo(() => ({ estado: f.estado, campania: f.campania, etapa: f.etapa }), [f.estado, f.campania, f.etapa]);

  useEffect(() => {
    let vigente = true;
    setDatos(null);
    (todas ? getProcesosTodas(filtros, grupo) : getProcesos(campoId, filtros))
      .then(({ data }) => vigente && setDatos(data))
      .catch((error) => vigente && setErrors(getErrorMessages(error, 'No se pudieron cargar los procesos')));
    setPagina(1);
    return () => {
      vigente = false;
    };
  }, [campoId, todas, grupo, filtros]);

  const activos = [f.estado !== 'ABIERTO' && f.estado, f.campania, f.etapa].filter(Boolean).length;
  const limpiar = () => poner({ pestado: '', pcampania: '', petapa: '' });
  const pag = paginar(datos ?? [], pagina);
  const cabezas = (datos ?? []).reduce((s, p) => s + (p.cabezas ?? 0), 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelFiltros activos={activos} onLimpiar={limpiar} compacto>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Estado">
          {ESTADOS.map(([valor, texto]) => (
            <button
              key={valor}
              type="button"
              onClick={() => poner({ pestado: valor === 'ABIERTO' ? '' : valor })}
              aria-pressed={f.estado === valor}
              className={`rounded-full px-3 py-1 text-sm ${f.estado === valor ? 'bg-boton text-white' : 'bg-suelo-200/70 text-suelo-700 hover:bg-suelo-300/60'}`}
            >
              {texto}
            </button>
          ))}
        </div>
        <label className="block text-xs text-suelo-500">
          Campaña
          <select value={f.campania} onChange={(e) => poner({ pcampania: e.target.value })} className={selector}>
            <option value="">Todas</option>
            {campaniasParaFiltro(hoy()).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-suelo-500">
          Etapa
          <select value={f.etapa} onChange={(e) => poner({ petapa: e.target.value })} className={selector}>
            <option value="">Todas</option>
            {ETAPAS.map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </select>
        </label>
      </PanelFiltros>

      {conNuevo && puedo('pecuaria:CREAR') && (
        <div className="mb-2 flex shrink-0 justify-end">
          <Link to="/pecuaria/procesos/nuevo" className="min-h-11 rounded-md bg-boton px-4 py-2.5 text-sm font-semibold text-white hover:bg-boton-hover">
            + Nuevo proceso
          </Link>
        </div>
      )}
      <ErrorList errors={errors} />

      {!datos ? (
        !errors.length && <p className="text-suelo-600">Cargando…</p>
      ) : datos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-suelo-300 p-6 text-center text-suelo-600">
          {activos ? 'No hay procesos con esos filtros.' : 'Todavía no hay procesos abiertos. Se empiezan con "+ Nuevo proceso" o desde Eventos → Entore o Inseminación.'}
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <ul className="space-y-2" aria-label="Procesos">
            {pag.filas.map((p) => (
              <li key={p.id}>
                <TarjetaProceso p={p} todas={todas} />
              </li>
            ))}
          </ul>
          <p className="mt-2 px-1 text-sm text-suelo-600">
            <strong>Total:</strong> {formatNumero(datos.length)} {datos.length === 1 ? 'proceso' : 'procesos'} · {formatNumero(cabezas)} cabezas hoy
          </p>
        </div>
      )}
      {datos && <Paginador {...pag} onCambiar={setPagina} de={datos.length} />}
    </div>
  );
}

// Una tarjeta de la lista. Toda la tarjeta es el link a la ficha.
function TarjetaProceso({ p, todas }) {
  const prox = p.proxima;
  const estilo = estiloSugerencia(prox?.estado);
  return (
    <Link
      to={`/pecuaria/procesos/${p.id}`}
      data-testid="proceso"
      className="block rounded-lg border border-suelo-300 bg-superficie p-3 hover:border-campo-500 active:bg-campo-50"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-campo-800">
            {nombreProceso(p, todas)}
            {p.estado !== 'ABIERTO' && <span className="ml-1 rounded bg-suelo-200 px-1.5 py-0.5 text-xs font-normal text-suelo-700">{p.estado === 'CERRADO' ? 'cerrado' : 'anulado'}</span>}
          </p>
          <p className="text-sm text-suelo-600">
            {textoTipo(p.modalidad)} · {p.aMedias?.texto ?? p.textoEtapa}
            {p.potreros?.length ? ` · ${p.potreros.join(', ')}` : ''}
          </p>
        </div>
        <p className="shrink-0 text-right">
          <span className="block text-lg font-bold tabular-nums leading-tight">{formatNumero(p.cabezas)}</span>
          <span className="text-xs text-suelo-500">cab</span>
        </p>
      </div>
      {prox && (
        <div data-atrasada={prox.atrasada ? 'true' : undefined} data-estado={prox.estado} className={`mt-2 flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm ${estilo.tarjeta}`}>
          <span className="min-w-0 flex-1 truncate">{prox.nombre ?? prox.titulo ?? prox.texto}</span>
          <span className={`shrink-0 font-semibold ${prox.estado === 'ATRASADA' ? 'text-red-700' : ''}`}>{diasCorto(prox) || prox.texto}</span>
        </div>
      )}
      {p.pendientes > 0 && <p className="mt-1 text-xs font-medium text-amber-800">⚠ decidir {p.pendientes === 1 ? '1 grupo de vacías' : `${p.pendientes} grupos de vacías`}</p>}
      <p className="mt-1 text-xs text-suelo-500">
        Desde {formatFecha(p.fechaInicio)} · {p.embudoCorto}
      </p>
    </Link>
  );
}
