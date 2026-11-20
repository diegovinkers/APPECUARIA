import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getProcesos, getProcesosTodas } from '../api/pecuaria';
import { getErrorMessages } from '../api/axios';
import usePuede from '../hooks/usePuede';
import { ErrorList } from './ui';
import { formatFecha, formatNumero } from './pecuaria';
import { Paginador, celda, paginar } from './tabla';
import PanelFiltros from './PanelFiltros';
import { campaniasParaFiltro, nombreProceso } from './procesos';

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
const SOLO_COMPU = 'hidden md:table-cell';
const hoy = () => new Date().toLocaleDateString('sv-SE');
const selector = 'mt-1 block w-full rounded-md border border-suelo-300 bg-white px-2 py-2 text-sm';

// La pestaña Procesos de Registro (diseño de procesos §12): una fila por
// proceso con su etapa, lo que sigue (en ámbar si se atrasó) y el embudo
// corto. Filtros en el panel (estado, campaña, etapa), en la URL. Tocar la
// fila abre la ficha. Con "Todas las estancias", la sigla adelante.
export default function ProcesosLista({ campoId, todas = false, grupo = 'estancias' }) {
  const puedo = usePuede();
  const navigate = useNavigate();
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
              className={`rounded-full px-3 py-1 text-sm ${f.estado === valor ? 'bg-campo-600 text-white' : 'bg-suelo-200/70 text-suelo-700 hover:bg-suelo-300/60'}`}
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

      {puedo('pecuaria:CREAR') && (
        <div className="mb-2 flex shrink-0 justify-end">
          <Link to="/pecuaria/procesos/nuevo" className="min-h-11 rounded-md bg-campo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-campo-700">
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
        <div className="min-h-0 overflow-auto rounded-lg border border-suelo-300 bg-white">
          <table className="w-full border-separate border-spacing-0 text-left text-sm">
            <thead className="text-xs text-suelo-600">
              <tr>
                {[
                  ['Proceso', ''],
                  ['Etapa', ''],
                  ['Inicio', SOLO_COMPU],
                  ['Lotes', SOLO_COMPU],
                  ['Embudo', ''],
                ].map(([titulo, clase]) => (
                  <th key={titulo} scope="col" className={`sticky top-0 z-10 border-b border-r border-suelo-300 bg-suelo-100 px-1.5 py-1.5 font-medium last:border-r-0 md:px-2 ${clase}`}>
                    {titulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pag.filas.map((p, n) => (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/pecuaria/procesos/${p.id}`)}
                  className={`cursor-pointer hover:[&>td]:bg-campo-50 ${n % 2 ? '[&>td]:bg-suelo-50' : '[&>td]:bg-white'}`}
                >
                  <td className={celda}>
                    <Link to={`/pecuaria/procesos/${p.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-campo-800 hover:underline">
                      {nombreProceso(p, todas)}
                    </Link>
                    {p.estado !== 'ABIERTO' && <span className="ml-1 rounded bg-suelo-200 px-1.5 py-0.5 text-[11px] text-suelo-700">{p.estado === 'CERRADO' ? 'cerrado' : 'anulado'}</span>}
                    <span className="block text-xs text-suelo-500 md:hidden">
                      {formatNumero(p.lotes)} {p.lotes === 1 ? 'lote' : 'lotes'} · desde {formatFecha(p.fechaInicio).slice(0, 5)}
                    </span>
                  </td>
                  <td className={celda}>
                    {p.textoEtapa}
                    {p.proxima?.etapa && (
                      <span data-atrasada={p.proxima.atrasada ? 'true' : undefined} className={`block text-xs ${p.proxima.atrasada ? 'font-medium text-amber-700' : 'text-suelo-500'}`}>
                        {p.proxima.atrasada ? '⚠ ' : ''}
                        {p.proxima.texto}
                      </span>
                    )}
                    {p.pendientes > 0 && <span className="block text-xs font-medium text-amber-700">⚠ decidir {p.pendientes === 1 ? '1 grupo de vacías' : `${p.pendientes} grupos de vacías`}</span>}
                  </td>
                  <td className={`${celda} ${SOLO_COMPU} whitespace-nowrap`}>{formatFecha(p.fechaInicio)}</td>
                  <td className={`${celda} ${SOLO_COMPU} whitespace-nowrap`}>
                    {formatNumero(p.lotes)} · {formatNumero(p.cabezas)} cab
                  </td>
                  <td className={`${celda} whitespace-nowrap tabular-nums`}>{p.embudoCorto}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} className="sticky bottom-0 border-t-2 border-suelo-300 bg-suelo-50 px-3 py-2 text-sm">
                  <strong>Total:</strong> {formatNumero(datos.length)} {datos.length === 1 ? 'proceso' : 'procesos'} · {formatNumero(cabezas)} cabezas hoy
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {datos && <Paginador {...pag} onCambiar={setPagina} de={datos.length} />}
    </div>
  );
}
