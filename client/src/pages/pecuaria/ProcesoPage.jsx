import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { anularGrupoEventos, editarProceso, getProceso } from '../../api/pecuaria';
import { getErrorMessages } from '../../api/axios';
import usePuede from '../../hooks/usePuede';
import { ErrorList, Notice, inputClass } from '../../components/ui';
import { formatFecha, formatNumero } from '../../components/pecuaria';
import { ETAPAS_CON_PANTALLA, formatoPorcentaje, textoBotonEtapa } from '../../components/procesos';

const NOMBRE_ROL = { VIENTRES: 'servidas', PRENADAS: 'preñadas', VACIAS: 'vacías', PARIDAS: 'paridas', CRIAS: 'crías', LIBRES: 'ya no siguen' };
const MARCA = { HECHA: '✔', PENDIENTE: '○', ATRASADA: '⚠' };
const COLOR_MARCA = { HECHA: 'bg-campo-600 text-white', PENDIENTE: 'bg-suelo-200 text-suelo-500', ATRASADA: 'bg-amber-500 text-white' };
// Las etapas que se pueden cargar además de la que sigue (menú ⋯).
const OTRAS_ETAPAS = ['REPASO', 'ABORTO'];

// La ficha de un proceso (diseño de procesos §12): el embudo, la línea de
// tiempo (cada etapa hecha, pendiente o atrasada, con sus cargas), los lotes
// y, abajo, el botón de la etapa que sigue.
export default function ProcesoPage() {
  const { id } = useParams();
  const location = useLocation();
  const puedo = usePuede();
  const [datos, setDatos] = useState(null);
  const [errors, setErrors] = useState([]);
  const [aviso, setAviso] = useState(location.state?.aviso ?? null);
  const [menu, setMenu] = useState(false);
  const [renombrando, setRenombrando] = useState(false);
  const [nombre, setNombre] = useState('');

  const cargar = useCallback(
    () =>
      getProceso(id)
        .then(({ data }) => setDatos(data))
        .catch((error) => setErrors(getErrorMessages(error, 'No se pudo cargar el proceso'))),
    [id],
  );
  useEffect(() => {
    cargar();
  }, [cargar]);

  async function renombrar(e) {
    e.preventDefault();
    try {
      await editarProceso(Number(id), { nombre: nombre.trim() });
      setRenombrando(false);
      setErrors([]);
      setAviso('Listo: cambió el nombre.');
      await cargar();
    } catch (error) {
      setErrors(getErrorMessages(error, 'No se pudo cambiar el nombre'));
    }
  }

  async function anular(carga, etapa) {
    if (!window.confirm(`¿Anular ${etapa.nombre.toLowerCase()} del ${formatFecha(carga.fecha)}? Queda registrado, tachado, y se puede volver a cargar.`)) return;
    try {
      await anularGrupoEventos(carga.grupoId);
      setErrors([]);
      setAviso('Anulado.');
      await cargar();
    } catch (error) {
      setAviso(null);
      setErrors(getErrorMessages(error, 'No se pudo anular'));
    }
  }

  if (!datos) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <ErrorList errors={errors} />
        {!errors.length && <p className="text-suelo-600">Cargando…</p>}
      </main>
    );
  }

  const { proceso, embudo, etapas, lotes, proxima, pendientes } = datos;
  const abierto = proceso.estado === 'ABIERTO';
  const registra = abierto && puedo('pecuaria:CREAR');
  const conAnular = puedo('pecuaria:ANULAR');
  const visibles = etapas.filter((e) => e.linea || e.estado === 'HECHA');
  const activos = lotes.filter((l) => l.activo);
  const siguiente = proxima?.etapa;

  return (
    <main className="mx-auto flex min-h-full max-w-3xl flex-col px-4 pt-6 sm:pt-10">
      <Link to="/pecuaria/registro?ver=procesos" className="text-sm text-campo-600 hover:underline">
        ← Procesos
      </Link>
      <div className="mt-2 flex items-start gap-2">
        <h1 className="min-w-0 flex-1 text-2xl font-bold leading-tight sm:text-3xl">{proceso.nombre}</h1>
        {registra && (
          <div className="relative">
            <button type="button" aria-label="Más acciones" aria-expanded={menu} onClick={() => setMenu((m) => !m)} className="min-h-11 min-w-11 rounded-md text-xl text-suelo-600 hover:bg-suelo-200/70">
              ⋯
            </button>
            {menu && (
              <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-suelo-200 bg-white py-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setNombre(proceso.nombre);
                    setRenombrando(true);
                    setMenu(false);
                  }}
                  className="block min-h-11 w-full px-4 text-left text-sm hover:bg-suelo-100"
                >
                  Renombrar
                </button>
                {OTRAS_ETAPAS.filter((e) => ETAPAS_CON_PANTALLA.has(e)).map((e) => (
                  <Link key={e} to={`/pecuaria/procesos/${proceso.id}/etapa/${e}`} className="flex min-h-11 items-center px-4 text-sm hover:bg-suelo-100">
                    {textoBotonEtapa(e)}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <p className="text-sm text-suelo-600">
        {proceso.campo.nombre} · campaña {proceso.campania} · {formatNumero(activos.length)} {activos.length === 1 ? 'lote' : 'lotes'} · {abierto ? datos.textoEtapa.toLowerCase() : proceso.estado === 'CERRADO' ? 'cerrado' : 'anulado'}
      </p>

      {renombrando && (
        <form onSubmit={renombrar} className="mt-3 flex flex-wrap gap-2">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} aria-label="Nombre del proceso" maxLength={120} className={`${inputClass} min-h-11 flex-1`} />
          <button type="submit" disabled={!nombre.trim()} className="min-h-11 rounded-md bg-campo-600 px-4 text-sm font-semibold text-white disabled:opacity-50">
            Guardar
          </button>
          <button type="button" onClick={() => setRenombrando(false)} className="min-h-11 rounded-md border border-suelo-300 px-4 text-sm">
            Cancelar
          </button>
        </form>
      )}

      <div className="mt-3">
        <ErrorList errors={errors} />
        <Notice tone="ok">{aviso}</Notice>
      </div>

      <Embudo embudo={embudo} />

      {pendientes.map((p) => (
        <p key={p.loteId} className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-900">
          ⚠ Falta decidir qué se hace con {formatNumero(p.cabezas)} vacías ({p.lote}).
        </p>
      ))}

      <h2 className="mb-2 mt-6 text-lg font-semibold">Etapas</h2>
      <ol className="space-y-1" aria-label="Línea de tiempo">
        {visibles.map((e) => (
          <li key={e.clave} data-etapa={e.clave} data-estado={e.estado} className="flex gap-3">
            <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${COLOR_MARCA[e.estado]}`} aria-hidden="true">
              {MARCA[e.estado]}
            </span>
            <div className="min-w-0 flex-1 border-b border-suelo-100 pb-2">
              <p className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className={`font-medium ${e.estado === 'PENDIENTE' ? 'text-suelo-500' : ''}`}>{e.nombre}</span>
                <span className="text-xs text-suelo-500">
                  {e.fecha ? formatFecha(e.fecha) : siguiente === e.clave ? <span className={proxima.atrasada ? 'font-medium text-amber-700' : ''}>{proxima.texto}</span> : ''}
                </span>
              </p>
              {e.cargas.map((c) => (
                <div key={c.grupoId} className={`mt-1 text-sm ${c.anulada ? 'text-suelo-400 line-through' : 'text-suelo-700'}`}>
                  {e.cargas.length > 1 && <span className="mr-1 text-xs text-suelo-500">{formatFecha(c.fecha)}:</span>}
                  {c.lineas.map((l) => (
                    <span key={l.registroId} className="block">
                      {l.lote ? `${l.lote}: ` : ''}
                      {l.texto}
                    </span>
                  ))}
                  {c.inicial && <span className="mr-2 rounded bg-sky-500/15 px-1.5 py-0.5 text-[11px] text-sky-800 no-underline">dato inicial</span>}
                  {c.anulada && <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[11px] text-red-700">anulado</span>}
                  {conAnular && c.puedeAnular && !c.anulada && (
                    <button type="button" onClick={() => anular(c, e)} className="text-xs text-red-700 hover:underline">
                      Anular
                    </button>
                  )}
                </div>
              ))}
            </div>
          </li>
        ))}
      </ol>

      <h2 className="mb-2 mt-6 text-lg font-semibold">Lotes</h2>
      <ul className="mb-6 divide-y divide-suelo-100 rounded-lg border border-suelo-200 bg-white text-sm">
        {lotes.map((l) => (
          <li key={l.loteId} className={`flex items-baseline justify-between gap-3 px-3 py-2 ${l.activo ? '' : 'text-suelo-400'}`}>
            <span className="min-w-0">
              <Link to={`/pecuaria/lotes/${l.loteId}`} className="font-medium text-campo-800 hover:underline">
                {l.nombre}
              </Link>
              <span className="block text-xs text-suelo-500">
                {l.potrero?.nombre} · {l.categoria} · {NOMBRE_ROL[l.rol] ?? l.rol}
                {!l.activo && ' · salió del proceso'}
              </span>
            </span>
            <span className="shrink-0 tabular-nums">{formatNumero(l.cabezas)} cab</span>
          </li>
        ))}
      </ul>

      {registra && siguiente && (
        // Fijo abajo, como la barra del camino de pasos.
        <div className="sticky bottom-0 -mx-4 mt-auto border-t border-suelo-200 bg-white px-4 py-3">
          <div>
            {ETAPAS_CON_PANTALLA.has(siguiente) ? (
              <Link
                data-testid="siguiente"
                to={`/pecuaria/procesos/${proceso.id}/etapa/${siguiente}`}
                className="flex min-h-11 items-center justify-center rounded-md bg-campo-600 px-4 font-semibold text-white hover:bg-campo-700"
              >
                {textoBotonEtapa(siguiente)}
              </Link>
            ) : (
              <span data-testid="siguiente" className="flex min-h-11 items-center justify-center rounded-md bg-suelo-200 px-4 text-sm text-suelo-600">
                {textoBotonEtapa(siguiente)} (muy pronto)
              </span>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

// El embudo: servidas → preñadas → paridas → destetados, con el porcentaje
// sobre las servidas y una barra.
function Embudo({ embudo: e }) {
  const filas = [
    ['Servidas', e.servidas, null, null],
    ['Preñadas', e.prenadas, e.porcentajes.prenez, null],
    ['Paridas', e.paridas, e.porcentajes.paricion, e.ternerosVivos != null ? `${formatNumero(e.ternerosVivos)} terneros vivos` : null],
    ['Destetados', e.destetados, e.porcentajes.destete, e.kgDestetados != null ? `${formatNumero(e.kgDestetados)} kg` : null],
  ];
  return (
    <section aria-label="Embudo" className="mt-4 rounded-lg border border-suelo-200 bg-white p-3">
      <dl className="space-y-1.5">
        {filas.map(([titulo, n, porcentaje, detalle]) => (
          <div key={titulo} className="grid grid-cols-[6.5rem_3.5rem_1fr] items-center gap-2 text-sm">
            <dt className="text-suelo-600">{titulo}</dt>
            <dd className="text-right font-semibold tabular-nums">{n == null ? '—' : formatNumero(n)}</dd>
            <dd className="flex items-center gap-2">
              {porcentaje != null && (
                <>
                  <span className="w-12 shrink-0 text-right text-xs tabular-nums text-suelo-700">{formatoPorcentaje(porcentaje)}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-suelo-100">
                    <span className="block h-full rounded-full bg-campo-500" style={{ width: `${Math.min(100, porcentaje)}%` }} />
                  </span>
                </>
              )}
              {detalle && <span className="text-xs text-suelo-500">{detalle}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
