import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { anularCargaProceso, anularProceso, asociarSueltos, cerrarProceso, descartarSugerencia, editarProceso, getProceso, getSueltos } from '../../api/pecuaria';
import { NOMBRE_ETAPA, esEmbriones, porTandas } from '../../components/procesos';
import { getErrorMessages } from '../../api/axios';
import usePuede from '../../hooks/usePuede';
import { ErrorList, Notice, inputClass } from '../../components/ui';
import { formatFecha, formatNumero } from '../../components/pecuaria';
import {
  ETAPAS_CON_PANTALLA,
  estiloSugerencia,
  formatoPorcentaje,
  lotesPorEstado,
  rutaRegistrar,
  sePuedeDescartar,
  textoBotonEtapa,
  textoTipo,
} from '../../components/procesos';

// Caracteres simples (no emoji: en el celular el ✔ y el ⚠ salen de colores).
const MARCA = { HECHA: '✓', PENDIENTE: '○', ATRASADA: '!' };
const COLOR_MARCA = { HECHA: 'bg-boton text-white', PENDIENTE: 'bg-suelo-200 text-suelo-500', ATRASADA: 'bg-amber-500 text-white' };
// Las etapas que se pueden cargar además de la que sigue (menú ⋯).
// Fase 8: las bajas (muerte de vacas o terneros) en cualquier etapa.
const OTRAS_ETAPAS = ['BAJA', 'ABORTO', 'REPASO', 'REVISION', 'FIN_PARICION'];

// La ficha de un proceso (fase 5, docs/PECUARIA.md §9; primero el celular):
// - la tarjeta "Próximo evento", del color de su estado, con Registrar;
// - el cronograma: cada etapa con su fecha estimada y la real (descartar);
// - el stock del proceso: los lotes por estado (nombres de Configuración);
// - el embudo y lo que se cargó (con Anular);
// - el menú ⋯ "Más opciones" (renombrar, otras etapas, sumar sueltos, cerrar, anular).
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
  // Eventos sueltos de los lotes del proceso, para sumarlos (diseño §13).
  const [sueltos, setSueltos] = useState(null);
  const [elegidosSueltos, setElegidosSueltos] = useState([]);

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
    const movidos = carga.movimientos?.length ? ' Sus movimientos se deshacen (los potreros vuelven a como estaban).' : '';
    if (!window.confirm(`¿Anular ${etapa.nombre.toLowerCase()} del ${formatFecha(carga.fecha)}?${movidos} Queda registrado, tachado, y se puede volver a cargar.`)) return;
    try {
      await anularCargaProceso(Number(id), carga.grupoId);
      setErrors([]);
      setAviso('Anulado.');
      await cargar();
    } catch (error) {
      setAviso(null);
      setErrors(getErrorMessages(error, 'No se pudo anular'));
    }
  }

  async function descartar(item, descartada) {
    try {
      const { data } = await descartarSugerencia(Number(id), item.clave, descartada);
      setDatos(data);
      setErrors([]);
      setAviso(descartada ? `Listo: ${item.nombre.toLowerCase()} quedó descartada.` : `Listo: ${item.nombre.toLowerCase()} volvió al cronograma.`);
    } catch (error) {
      setAviso(null);
      setErrors(getErrorMessages(error, 'No se pudo cambiar la sugerencia'));
    }
  }

  async function verSueltos() {
    setMenu(false);
    try {
      const { data } = await getSueltos(Number(id));
      setSueltos(data);
      setElegidosSueltos([]);
    } catch (error) {
      setErrors(getErrorMessages(error, 'No se pudieron cargar los eventos sueltos'));
    }
  }

  async function sumarSueltos() {
    try {
      await asociarSueltos(Number(id), elegidosSueltos);
      setSueltos(null);
      setErrors([]);
      setAviso('Listo: los eventos quedaron en el proceso.');
      await cargar();
    } catch (error) {
      setErrors(getErrorMessages(error, 'No se pudieron sumar'));
    }
  }

  async function cerrar() {
    setMenu(false);
    const nota = window.prompt('¿Por qué se cierra? (opcional; por ejemplo, "se vendió todo")', '');
    if (nota === null) return;
    try {
      await cerrarProceso(Number(id), nota.trim() ? { nota: nota.trim() } : {});
      setErrors([]);
      setAviso('Listo: el proceso quedó cerrado.');
      await cargar();
    } catch (error) {
      setErrors(getErrorMessages(error, 'No se pudo cerrar'));
    }
  }

  async function anularTodo() {
    setMenu(false);
    if (!window.confirm('¿Anular el proceso entero? Queda registrado, tachado. Solo se puede si ninguna carga movió animales.')) return;
    try {
      await anularProceso(Number(id));
      setErrors([]);
      setAviso('El proceso quedó anulado.');
      await cargar();
    } catch (error) {
      setErrors(getErrorMessages(error, 'No se pudo anular el proceso'));
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

  const {
    proceso,
    embudo,
    etapas,
    lotes,
    proxima,
    pendientes,
    cronograma = [],
    estados = {},
    toros = [],
    anterior = null,
    siguientes = [],
    paraEnganchar = [],
    // Reglas del campo (25/11): el diagnóstico a medias, los avisos, las
    // vacías que pasaron de una IATF a un entore (R6) y cada potrero (R8).
    aMedias = null,
    avisos = [],
    enlaces = { van: [], vienen: [] },
    porPotrero = [],
  } = datos;
  const esEntore = !porTandas(proceso.datos?.modalidad);
  // Transferencia de embriones (26/11): las no aptas van al toro con las vacías.
  const embriones = esEmbriones(proceso.datos?.modalidad);
  const abierto = proceso.estado === 'ABIERTO';
  const registra = abierto && puedo('pecuaria:CREAR');
  const conAnular = puedo('pecuaria:ANULAR');
  // Lo que se cargó: solo las etapas con cargas.
  const cargadas = etapas.filter((e) => e.cargas.length);
  const activos = lotes.filter((l) => l.activo);

  return (
    <main className="mx-auto flex min-h-full max-w-3xl flex-col px-4 pt-6 sm:pt-10">
      <Link to="/pecuaria/procesos" className="text-sm text-campo-600 hover:underline">
        ← Procesos
      </Link>
      <div className="mt-2 flex items-start gap-2">
        <h1 className="min-w-0 flex-1 text-2xl font-bold leading-tight sm:text-3xl">{proceso.nombre}</h1>
        {registra && (
          <div className="relative">
            <button type="button" aria-label="Más opciones" aria-expanded={menu} onClick={() => setMenu((m) => !m)} className="min-h-11 min-w-11 rounded-md text-xl text-suelo-600 hover:bg-suelo-200/70">
              ⋯
            </button>
            {menu && (
              <div className="absolute right-0 z-20 mt-1 w-60 rounded-lg border border-suelo-200 bg-superficie py-1 shadow-lg" role="menu" aria-label="Más opciones">
                <p className="px-4 pb-1 pt-2 text-xs text-suelo-500">Más opciones</p>
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
                {/* Fase 6: otra tanda que entra al servicio, y los toros (sacar, el mismo u otro). */}
                <Link to={`/pecuaria/procesos/${proceso.id}/tanda`} className="flex min-h-11 items-center border-t border-suelo-100 px-4 text-sm hover:bg-suelo-100">
                  {textoBotonEtapa('TANDA')}
                </Link>
                {(esEntore || toros.length > 0) && (
                  <Link to={`/pecuaria/procesos/${proceso.id}/etapa/TOROS`} className="flex min-h-11 items-center px-4 text-sm hover:bg-suelo-100">
                    {textoBotonEtapa('TOROS')}
                  </Link>
                )}
                <button type="button" onClick={verSueltos} className="block min-h-11 w-full border-t border-suelo-100 px-4 text-left text-sm hover:bg-suelo-100">
                  Sumar eventos sueltos
                </button>
                <button type="button" onClick={cerrar} className="block min-h-11 w-full px-4 text-left text-sm hover:bg-suelo-100">
                  Cerrar el proceso
                </button>
                {conAnular && (
                  <button type="button" onClick={anularTodo} className="block min-h-11 w-full px-4 text-left text-sm text-red-700 hover:bg-red-50">
                    Anular el proceso
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <p className="text-sm text-suelo-600">
        {textoTipo(proceso.datos?.modalidad)} · {proceso.campo.nombre} · campaña {proceso.campania} ·{' '}
        <span data-testid="etapa">{abierto ? (aMedias?.texto ?? datos.textoEtapa).toLowerCase() : proceso.estado === 'CERRADO' ? 'cerrado' : 'anulado'}</span>
      </p>

      {renombrando && (
        <form onSubmit={renombrar} className="mt-3 flex flex-wrap gap-2">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} aria-label="Nombre del proceso" maxLength={120} className={`${inputClass} min-h-11 flex-1`} />
          <button type="submit" disabled={!nombre.trim()} className="min-h-11 rounded-md bg-boton px-4 text-sm font-semibold text-white disabled:opacity-50">
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
        {avisos.map((a) => (
          <Notice key={a}>{a}</Notice>
        ))}
      </div>

      {sueltos && (
        <section aria-label="Eventos sueltos" className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm">
          <p className="mb-2 font-medium">Eventos de reproducción sueltos de los lotes del proceso</p>
          {sueltos.length === 0 && <p className="text-suelo-600">No hay eventos sueltos para sumar.</p>}
          <ul className="space-y-1">
            {sueltos.map((e) => (
              <li key={e.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={elegidosSueltos.includes(e.id)}
                    onChange={() => setElegidosSueltos((x) => (x.includes(e.id) ? x.filter((y) => y !== e.id) : [...x, e.id]))}
                    className="h-5 w-5 accent-campo-600"
                  />
                  <span>
                    {e.tipo.nombre} del {formatFecha(e.fecha)} · {e.lote.nombre}
                    {e.texto ? ` · ${e.texto}` : ''}
                    <span className="block text-xs text-suelo-500">entra como {NOMBRE_ETAPA[e.etapa] ?? e.etapa?.toLowerCase()}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            {sueltos.length > 0 && (
              <button type="button" disabled={!elegidosSueltos.length} onClick={sumarSueltos} className="min-h-11 rounded-md bg-boton px-4 text-sm font-semibold text-white disabled:opacity-50">
                Sumar al proceso
              </button>
            )}
            <button type="button" onClick={() => setSueltos(null)} className="min-h-11 rounded-md border border-suelo-300 px-4 text-sm">
              Cerrar
            </button>
          </div>
        </section>
      )}

      {abierto && <ProximoEvento proceso={proceso} item={proxima} registra={registra} onDescartar={(item) => descartar(item, true)} />}

      {pendientes.map((p) => (
        <p key={p.loteId} className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-900" data-testid="pendiente">
          <span>
            ⚠ Falta decidir qué se hace con {formatNumero(p.cabezas)} vacías ({p.lote}).
          </span>
          {registra && (
            <Link to={`/pecuaria/procesos/${proceso.id}/etapa/DECISION`} className="min-h-11 rounded-md bg-amber-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-amber-700">
              Decidir
            </Link>
          )}
        </p>
      ))}

      {/* Fase 8: las vacías que quedaron para volver a servir empiezan un proceso enganchado a este. */}
      {paraEnganchar.length > 0 && puedo('pecuaria:CREAR') && (
        <p className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-campo-500/10 px-3 py-2 text-sm text-campo-900" data-testid="para-enganchar">
          <span>
            {formatNumero(paraEnganchar.reduce((s, l) => s + l.cabezas, 0))} {embriones ? 'van al toro, no aptas o vacías' : 'vacías para volver a servir'} ({paraEnganchar.map((l) => l.lote).join(', ')}).
          </span>
          <Link to={`/pecuaria/procesos/nuevo?desde=${proceso.id}`} className="min-h-11 rounded-md bg-boton px-3 py-2.5 text-sm font-semibold text-white hover:bg-boton-hover">
            {embriones ? 'Empezar el entore' : 'Empezar con ellas'}
          </Link>
        </p>
      )}

      <Cronograma items={cronograma} registra={registra} onDescartar={descartar} />

      <Enganchados anterior={anterior} siguientes={siguientes} enlaces={enlaces} />

      <StockProceso lotes={lotes} estados={embriones ? { ...estados, VACIAS: `${estados.VACIAS ?? 'Vacía'} o no apta (al toro)` } : estados} total={activos.reduce((s, l) => s + (l.cabezas ?? 0), 0)} porPotrero={porPotrero} />

      <TorosDelProceso toros={toros} />

      <Embudo embudo={embudo} embriones={embriones} />

      {cargadas.length > 0 && (
        <>
          <h2 className="mb-2 mt-6 text-lg font-semibold">Lo que se cargó</h2>
          <ol className="mb-6 space-y-1" aria-label="Línea de tiempo">
            {cargadas.map((e) => (
              <li key={e.clave} data-etapa={e.clave} data-estado={e.estado} className="flex gap-3">
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${COLOR_MARCA[e.estado]}`} aria-hidden="true">
                  {MARCA[e.estado]}
                </span>
                <div className="min-w-0 flex-1 border-b border-suelo-100 pb-2">
                  <p className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="font-medium">{e.nombre}</span>
                    <span className="text-xs text-suelo-500">{e.fecha ? formatFecha(e.fecha) : ''}</span>
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
                      {c.movimientos?.map((m) => (
                        <span key={m.id} className={`block pl-3 text-xs ${m.revertido ? 'line-through' : 'text-suelo-600'}`}>
                          · {m.texto}
                        </span>
                      ))}
                      {c.inicial && <span className="mr-2 rounded bg-sky-500/15 px-1.5 py-0.5 text-xs text-sky-800 no-underline">dato inicial</span>}
                      {c.anulada && <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-xs text-red-700">anulado</span>}
                      {conAnular && c.puedeAnular && !c.anulada && (
                        <button type="button" onClick={() => anular(c, e)} className="min-h-8 text-xs text-red-700 hover:underline">
                          Anular
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </main>
  );
}

// La tarjeta "Próximo evento": lo que sigue, del color de su estado, con el
// botón Registrar (abre la etapa con los lotes del proceso ya elegidos).
function ProximoEvento({ proceso, item, registra, onDescartar }) {
  if (!item) {
    return (
      <section aria-label="Próximo evento" className="mt-4 rounded-xl border border-campo-300 bg-superficie p-4 text-suelo-700">
        No hay nada pendiente en el cronograma.
      </section>
    );
  }
  const estilo = estiloSugerencia(item.estado);
  const ruta = rutaRegistrar(proceso.id, item);
  return (
    <section aria-label="Próximo evento" data-estado={item.estado} className={`mt-4 rounded-xl border-2 p-4 ${estilo.tarjeta}`}>
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-suelo-600">
        Próximo evento
        <span className={`rounded-full px-2 py-0.5 text-xs normal-case tracking-normal ${estilo.punto}`}>{estilo.etiqueta}</span>
      </p>
      <p className="mt-1 text-xl font-bold leading-tight">{item.nombre}</p>
      <p className={`mt-0.5 ${item.estado === 'ATRASADA' ? 'font-semibold text-red-700' : 'text-suelo-700'}`}>{item.texto}</p>
      {registra && (
        <div className="mt-3 flex flex-col gap-2">
          {ruta ? (
            <Link data-testid="registrar" to={ruta} className="flex min-h-12 items-center justify-center rounded-lg bg-boton px-4 text-lg font-semibold text-white hover:bg-boton-hover">
              Registrar
            </Link>
          ) : (
            <span data-testid="registrar" className="flex min-h-12 items-center justify-center rounded-lg bg-suelo-200 px-4 text-sm text-suelo-600">
              Registrar (muy pronto)
            </span>
          )}
          {/* IATF por días: además de otro día, terminar (las que quedan, al repaso o afuera). */}
          {item.etapa === 'INSEMINACION' && (
            <Link
              data-testid="terminar-inseminacion"
              to={`/pecuaria/procesos/${proceso.id}/etapa/FIN_INSEMINACION`}
              className="flex min-h-11 items-center justify-center rounded-lg border border-campo-600 bg-superficie px-4 font-semibold text-campo-700 hover:bg-campo-50"
            >
              {textoBotonEtapa('FIN_INSEMINACION')}
            </Link>
          )}
          {sePuedeDescartar(item) && (
            <button type="button" onClick={() => onDescartar(item)} className="min-h-11 text-sm text-suelo-600 underline-offset-2 hover:underline">
              No va a pasar: descartar
            </button>
          )}
        </div>
      )}
    </section>
  );
}

const fechaCorta = (iso) => (iso ? formatFecha(iso) : '—');

// El cronograma: cada etapa con su fecha estimada (o la ventana) y la real.
function Cronograma({ items, registra, onDescartar }) {
  if (!items.length) return null;
  return (
    <>
      <h2 className="mb-2 mt-6 text-lg font-semibold">Cronograma</h2>
      <ol className="space-y-2" aria-label="Cronograma">
        {items.map((i) => {
          const estilo = estiloSugerencia(i.estado);
          return (
            <li key={i.clave} data-clave={i.clave} data-estado={i.estado} className="flex gap-3">
              <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${estilo.punto}`} aria-hidden="true">
                {estilo.marca}
              </span>
              <div className={`min-w-0 flex-1 border-b border-suelo-100 pb-2 ${i.estado === 'DESCARTADA' ? 'text-suelo-400' : ''}`}>
                <p className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span className={`font-medium ${i.estado === 'DESCARTADA' ? 'line-through' : ''}`}>{i.nombre}</span>
                  <span className={`text-xs ${i.estado === 'ATRASADA' ? 'font-semibold text-red-700' : 'text-suelo-500'}`}>{estilo.etiqueta}</span>
                </p>
                <p className="text-sm text-suelo-600">
                  Estimada: {i.hasta ? `${fechaCorta(i.fecha)} al ${fechaCorta(i.hasta)}` : fechaCorta(i.fecha)}
                  {i.real && <span className="ml-2 font-medium text-campo-700">Real: {fechaCorta(i.real)}</span>}
                </p>
                {i.avance && !i.real && i.estado !== 'DESCARTADA' && <p className="text-xs text-suelo-600">{i.avance}</p>}
                {registra && i.estado === 'DESCARTADA' && (
                  <button type="button" onClick={() => onDescartar(i, false)} className="min-h-8 text-xs text-campo-700 hover:underline">
                    Volver a tenerla en cuenta
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

// Los toros del proceso, uno por uno: dónde están y desde cuándo; los que
// salieron, abajo y más claros.
function TorosDelProceso({ toros }) {
  if (!toros.length) return null;
  const dentro = toros.filter((t) => !t.hasta);
  const orden = [...dentro, ...toros.filter((t) => t.hasta)];
  return (
    <>
      <h2 className="mb-2 mt-6 flex items-baseline justify-between text-lg font-semibold">
        Toros <span className="text-sm font-normal text-suelo-600">{dentro.length} en el proceso</span>
      </h2>
      <ul className="divide-y divide-suelo-100 rounded-lg border border-suelo-200 bg-superficie text-sm" aria-label="Toros del proceso">
        {orden.map((t) => (
          <li key={t.id} data-toro={t.identificacion} className={`flex items-baseline justify-between gap-3 px-3 py-2 ${t.hasta ? 'text-suelo-400' : ''}`}>
            <span className="min-w-0">
              <span className="font-medium">{t.identificacion}</span>
              <span className="block text-xs text-suelo-500">{[t.raza, t.genetica].filter(Boolean).join(' · ') || 'Sin raza ni genética'}</span>
            </span>
            <span className="shrink-0 text-right text-xs">
              {t.hasta ? `salió el ${formatFecha(t.hasta)}` : `en ${t.potrero.nombre} desde ${formatFecha(t.desde)}`}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

// El stock del proceso: los lotes por estado, con el nombre de Configuración.
function StockProceso({ lotes, estados, total, porPotrero = [] }) {
  const grupos = lotesPorEstado(lotes, estados);
  if (!grupos.length) return null;
  return (
    <>
      <h2 className="mb-2 mt-6 flex items-baseline justify-between text-lg font-semibold">
        Stock del proceso <span className="text-sm font-normal text-suelo-600">{formatNumero(total)} cab hoy</span>
      </h2>
      {/* R8: cuántas vacas y terneros hay en cada potrero. */}
      {porPotrero.length > 0 && (
        <ul className="mb-3 space-y-0.5 rounded-lg border border-suelo-200 bg-suelo-50 px-3 py-2 text-sm text-suelo-700" aria-label="Por potrero">
          {porPotrero.map((p) => (
            <li key={p.potreroId ?? p.texto}>{p.texto}</li>
          ))}
        </ul>
      )}
      <div className="space-y-3" aria-label="Stock del proceso">
        {grupos.map((g) => (
          <section key={g.rol} data-rol={g.rol} className={`rounded-lg border border-suelo-200 bg-superficie ${g.rol === 'LIBRES' ? 'opacity-70' : ''}`}>
            <p className="flex items-baseline justify-between border-b border-suelo-100 px-3 py-2">
              <span className="font-semibold">{g.nombre}</span>
              {g.rol !== 'LIBRES' && <span className="tabular-nums">{formatNumero(g.cabezas)} cab</span>}
            </p>
            <ul className="divide-y divide-suelo-100 text-sm">
              {g.lotes.map((l) => (
                <li key={l.loteId} className="flex items-baseline justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <Link to={`/pecuaria/lotes/${l.loteId}`} className="font-medium text-campo-800 hover:underline">
                      {l.nombre}
                    </Link>
                    <span className="block text-xs text-suelo-500">
                      {l.potrero?.nombre} · {l.categoria}
                      {!l.activo && ' · salió del proceso'}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums">{formatNumero(l.cabezas)} cab</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

// Los procesos enganchados (fase 8): de cuál viene este y cuáles siguieron
// (las vacías que volvieron a servirse, las paridas que entraron a otro entore).
//   enlaces (R6): las vacías de una IATF que pasaron a un entore, en los dos
//   ("12 vacías → entore X (desde el 10/01)" / "12 vienen de la IATF Y").
function Enganchados({ anterior, siguientes, enlaces = { van: [], vienen: [] } }) {
  const hayEnlaces = enlaces.van.length > 0 || enlaces.vienen.length > 0;
  if (!anterior && !siguientes.length && !hayEnlaces) return null;
  return (
    <section aria-label="Procesos enganchados" className="mt-4 rounded-lg border border-suelo-200 bg-superficie p-3 text-sm">
      {hayEnlaces && (
        <ul className="mb-2 space-y-1" aria-label="Vacías entre procesos">
          {[...enlaces.vienen, ...enlaces.van].map((e) => (
            <li key={`${e.procesoId}-${e.texto}`}>
              <Link to={`/pecuaria/procesos/${e.procesoId}`} className="font-medium text-campo-700 hover:underline">
                {e.texto}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {anterior && (
        <p>
          Viene de{' '}
          <Link to={`/pecuaria/procesos/${anterior.id}`} className="font-medium text-campo-700 hover:underline">
            {anterior.nombre}
          </Link>
        </p>
      )}
      {siguientes.length > 0 && (
        <div className={anterior ? 'mt-2' : ''}>
          <p className="text-suelo-600">Siguen en</p>
          <ul className="mt-1 space-y-1">
            {siguientes.map((s) => (
              <li key={s.id}>
                <Link to={`/pecuaria/procesos/${s.id}`} className="font-medium text-campo-700 hover:underline">
                  {s.nombre}
                </Link>
                <span className="text-xs text-suelo-500"> · desde el {formatFecha(s.fechaInicio)}{s.estado !== 'ABIERTO' ? ` · ${s.estado === 'CERRADO' ? 'cerrado' : 'anulado'}` : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// El embudo: servidas → preñadas → paridas → destetados, con el porcentaje
// sobre las servidas y una barra.
// En una transferencia de embriones, la primera fila son las transferidas, con
// los embriones usados y las no aptas.
function Embudo({ embudo: e, embriones = false }) {
  const deEmbriones = [
    e.embriones != null ? `${formatNumero(e.embriones)} ${e.embriones === 1 ? 'embrión' : 'embriones'}` : null,
    e.noAptas ? `${formatNumero(e.noAptas)} no ${e.noAptas === 1 ? 'apta' : 'aptas'}` : null,
  ].filter(Boolean);
  const filas = [
    [embriones ? 'Transferidas' : 'Servidas', e.servidas, null, embriones && deEmbriones.length ? deEmbriones.join(' · ') : null],
    ['Preñadas', e.prenadas, e.porcentajes.prenez, null],
    ['Paridas', e.paridas, e.porcentajes.paricion, e.ternerosVivos != null ? `${formatNumero(e.ternerosVivos)} terneros vivos` : null],
    ['Destetados', e.destetados, e.porcentajes.destete, e.kgDestetados != null ? `${formatNumero(e.kgDestetados)} kg` : null],
  ];
  // Fase 8: las bajas, debajo (solo si hubo).
  const bajas = [e.muertesMadres ? `${formatNumero(e.muertesMadres)} ${e.muertesMadres === 1 ? 'vaca muerta' : 'vacas muertas'}` : null, e.muertesCrias ? `${formatNumero(e.muertesCrias)} ${e.muertesCrias === 1 ? 'cría muerta' : 'crías muertas'}` : null].filter(Boolean);
  return (
    <section aria-label="Embudo" className="mt-4 rounded-lg border border-suelo-200 bg-superficie p-3">
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
      {bajas.length > 0 && <p className="mt-2 text-xs text-suelo-600" data-testid="bajas">Bajas: {bajas.join(' · ')}</p>}
    </section>
  );
}
