import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getLote, getPotrero, getProcesos, getTiposMovimiento, registrarEventoRegistro, vistaPreviaEventoRegistro } from '../../api/pecuaria';
import { EVENTOS_DE_PROCESO, NOMBRE_ETAPA, aplicaServicio, ofreceNuevoServicio, procesosParaEvento, textoSuelto } from '../../components/procesos';
import { getErrorMessages } from '../../api/axios';
import { useEstancia } from '../../context/EstanciaContext';
import usePotreros from '../../hooks/usePotreros';
import Camino from '../../components/Camino';
import { ListaEventos } from '../../components/HojaEventos';
import { ErrorList, Notice, inputClass } from '../../components/ui';
import { formatNumero } from '../../components/pecuaria';
import Icono from '../../components/Icono';
import { formularioDe, guardarRecientes, leerRecientes, tiposDeEvento } from '../../navegacion/eventos';
import {
  SIN_ELEGIR,
  buscar,
  cambiarSeleccion,
  cuerpoEvento,
  datosSugeridos,
  hayDiferencia,
  indexarLotes,
  loteElegido,
  lotesDelTipo,
  lotesElegidos,
  opcionesDe,
  potreroElegido,
  recientesDe,
  seleccionInicial,
} from '../../components/eventos';

const hoy = () => new Date().toLocaleDateString('sv-SE');
const etiqueta = 'block text-sm text-suelo-600';
const NOMBRE_SEXO = { HEMBRA: 'hembras', MACHO: 'machos' };
const OTRO_SEXO = { HEMBRA: 'machos', MACHO: 'hembras' };
const suma = (lotes) => lotes.reduce((s, l) => s + l.cabezas, 0);

// Anotar un evento (diseño docs/superpowers/specs/2026-11-20-eventos-design.md):
// el mismo camino de 4 pasos para todos.
//   1. Qué: el tipo (viene elegido desde la hoja "Eventos"; se puede cambiar).
//   2. A quién: buscador, usados hace poco, y según los niveles del tipo la
//      estancia entera, potreros enteros, una categoría o lotes. Arranca con
//      el potrero o lote de donde se abrió. Respeta el sexo del tipo.
//   3. Datos: la fecha, la nota y lo propio del tipo, con valores sugeridos.
//   4. Revisar y confirmar: la oración, y el antes y el después si cambia
//      números (pesada, recuento). Después: "Hacer otro igual" o "Listo".
// Se puede volver a cualquier paso anterior sin perder lo cargado.
export default function EventoPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const estancia = useEstancia();
  const contexto = useMemo(() => ({ potrero: Number(params.get('potrero')) || null, lote: Number(params.get('lote')) || null }), [params]);

  const [tipos, setTipos] = useState(null);
  const [tipoId, setTipoId] = useState(Number(params.get('tipo')) || null);
  // La estancia: la del potrero o lote de donde se abrió; si no, la de arriba
  // (con "Todas", se elige acá).
  const [campoContexto, setCampoContexto] = useState(contexto.potrero || contexto.lote ? undefined : null);
  const [elegida, setElegida] = useState(null);
  const [paso, setPaso] = useState(params.get('tipo') ? 1 : 0);
  const [sel, setSel] = useState(SIN_ELEGIR);
  const [conInicial, setConInicial] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [datosLote, setDatosLote] = useState({});
  const [comunes, setComunes] = useState({});
  const [fecha, setFecha] = useState(hoy());
  const [nota, setNota] = useState('');
  const [previa, setPrevia] = useState(null);
  const [errors, setErrors] = useState([]);
  const [ocupado, setOcupado] = useState(false);
  const [hecho, setHecho] = useState(null);
  const [recientes, setRecientes] = useState(leerRecientes);
  // Procesos: los lotes que ya están en un proceso abierto, y si este entore
  // (o inseminación) empieza un servicio.
  const [enProceso, setEnProceso] = useState(() => new Set());
  const [abiertos, setAbiertos] = useState(null);
  const [empezar, setEmpezar] = useState(true);
  // "¿De qué proceso?" (pedido de Diego, 20/11): null = todavía no se eligió;
  // 'suelto' o 'nuevo' = sigue el camino de siempre.
  const [deProceso, setDeProceso] = useState(null);

  useEffect(() => {
    getTiposMovimiento()
      .then(({ data }) => setTipos(tiposDeEvento(data)))
      .catch((error) => setErrors(getErrorMessages(error, 'No se pudieron cargar los eventos')));
  }, []);

  useEffect(() => {
    if (contexto.potrero) getPotrero(contexto.potrero).then(({ data }) => setCampoContexto(data.campoId)).catch(() => setCampoContexto(null));
    else if (contexto.lote) getLote(contexto.lote).then(({ data }) => setCampoContexto(data.lote.campoId)).catch(() => setCampoContexto(null));
  }, [contexto.potrero, contexto.lote]);

  const tipo = tipos?.find((t) => t.id === tipoId) ?? null;
  const campoId = campoContexto ?? (estancia.todas ? (elegida?.id ?? null) : estancia.campoId);
  const campo = (estancia.campos ?? []).find((c) => c.id === campoId) ?? null;
  const { potreros, errors: errorsPotreros } = usePotreros(campoContexto === undefined ? null : campoId);
  const opciones = opcionesDe(tipo);
  const todos = useMemo(() => indexarLotes(potreros ?? []), [potreros]);
  const { lotes, omitidos } = useMemo(() => lotesDelTipo(todos, tipo), [todos, tipo]);
  const elegidos = useMemo(() => lotesElegidos(sel, lotes), [sel, lotes]);
  const formulario = formularioDe(tipo);
  const ofreceServicio = aplicaServicio({ tipo, sel, elegidos, enProceso });

  useEffect(() => {
    if (!campoId) return;
    getProcesos(campoId, { estado: 'ABIERTO' })
      .then(({ data }) => {
        setAbiertos(data);
        setEnProceso(new Set(data.flatMap((p) => p.loteIds ?? [])));
      })
      .catch(() => {
        setAbiertos([]);
        setEnProceso(new Set());
      });
  }, [campoId]);

  // Los procesos donde este evento tiene sentido. Si hay, se pregunta primero.
  const opcionesProceso = useMemo(() => procesosParaEvento(tipo?.clave, abiertos ?? [], { loteId: contexto.lote }), [tipo, abiertos, contexto.lote]);
  const preguntaProceso = paso === 1 && deProceso == null && opcionesProceso.length > 0;
  // Mientras se cargan los procesos, no se muestran los lotes (después puede venir la pregunta).
  const cargandoProcesos = paso === 1 && deProceso == null && abiertos == null && Boolean(campoId) && EVENTOS_DE_PROCESO.has(tipo?.clave);

  // Arranca donde estás: la primera vez, lo de la ficha de donde se abrió.
  useEffect(() => {
    if (conInicial || !potreros || !tipo) return;
    setSel(seleccionInicial(contexto, lotes, opciones));
    setConInicial(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [potreros, tipo, conInicial]);

  function elegirTipo(t) {
    if (t.id !== tipoId) {
      setTipoId(t.id);
      setDeProceso(null);
      setDatosLote({});
      setComunes({});
      setPrevia(null);
      // Lo elegido se vuelve a armar con los niveles y el sexo del tipo nuevo.
      setConInicial(false);
      setParams(
        (actual) => {
          const nuevo = new URLSearchParams(actual);
          nuevo.set('tipo', String(t.id));
          return nuevo;
        },
        { replace: true },
      );
    }
    setErrors([]);
    setPaso(1);
  }

  const cuerpo = () => ({
    ...cuerpoEvento({ tipo, sel, campoId, lotes, datosLote, comunes, fecha, nota }),
    ...(ofreceServicio && empezar && { empezarServicio: {} }),
  });

  async function seguir() {
    setErrors([]);
    if (paso === 1) {
      // Lo sugerido para los lotes que todavía no tienen datos.
      setDatosLote((d) => Object.fromEntries(elegidos.map((l) => [l.loteId, d[l.loteId] ?? datosSugeridos(tipo, l)])));
      setPaso(2);
    } else if (paso === 2) {
      setOcupado(true);
      try {
        const { data } = await vistaPreviaEventoRegistro(cuerpo());
        setPrevia(data);
        setPaso(3);
      } catch (error) {
        setErrors(getErrorMessages(error, 'No se pudo revisar el evento'));
      } finally {
        setOcupado(false);
      }
    } else if (paso === 3) {
      setOcupado(true);
      try {
        const { data } = await registrarEventoRegistro(cuerpo());
        setRecientes(guardarRecientes(recientesDe(sel, lotes, campoId)));
        setHecho(data);
      } catch (error) {
        setErrors(getErrorMessages(error, 'No se pudo anotar el evento'));
      } finally {
        setOcupado(false);
      }
    }
  }

  // Mismo tipo y fecha (y el producto, para seguir la campaña), sin elegir a quién.
  function otroIgual() {
    setSel(SIN_ELEGIR);
    setDatosLote({});
    setNota('');
    setPrevia(null);
    setHecho(null);
    setBusqueda('');
    setErrors([]);
    setPaso(1);
  }

  function listo() {
    const aviso = hecho?.oracion;
    if (hecho?.proceso) navigate(`/pecuaria/procesos/${hecho.proceso.id}`, { state: { aviso } });
    else if (contexto.potrero) navigate(`/pecuaria/potreros/${contexto.potrero}`, { state: { aviso } });
    else if (contexto.lote) navigate(`/pecuaria/lotes/${contexto.lote}`, { state: { aviso } });
    else navigate('/pecuaria/registro?ver=eventos', { state: { aviso } });
  }

  const irA = (i) => {
    setErrors([]);
    setPaso(i);
  };

  if (hecho) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-campo-100 text-campo-700">
          <Icono nombre="check" className="h-8 w-8" />
        </span>
        <h1 className="mt-3 text-xl font-bold">Listo</h1>
        <p className="mt-1 text-suelo-700" data-testid="hecho">
          {hecho.oracion}.
        </p>
        <div className="mx-auto mt-6 grid max-w-sm gap-2">
          <button type="button" onClick={otroIgual} className="min-h-11 rounded-md bg-boton px-4 font-semibold text-white hover:bg-boton-hover">
            Hacer otro igual
          </button>
          <button type="button" onClick={listo} className="min-h-11 rounded-md border border-suelo-300 px-4 font-medium text-suelo-800">
            Listo
          </button>
        </div>
      </main>
    );
  }

  const textoElegidos = elegidos.length ? `${formatNumero(elegidos.length)} ${elegidos.length === 1 ? 'lote' : 'lotes'} · ${formatNumero(suma(elegidos))} cab` : 'Elegí a quién';
  const seguirDeshabilitado = (paso === 1 && !elegidos.length) || !tipo;

  return (
    <Camino
      titulo={tipo?.nombre ?? 'Anotar un evento'}
      actual={paso}
      onIr={irA}
      onSeguir={paso === 0 || preguntaProceso ? null : seguir}
      textoSeguir={paso === 3 ? 'Confirmar' : paso === 2 ? 'Revisar' : 'Seguir'}
      puedeSeguir={!seguirDeshabilitado}
      ocupado={ocupado}
      ayuda={paso >= 1 ? textoElegidos : null}
    >
      <div className="mt-2">
        <ErrorList errors={[...errors, ...errorsPotreros]} />
      </div>
      {!tipos && !errors.length && <p className="text-suelo-600">Cargando…</p>}

      {paso === 0 && tipos && (
        <section aria-label="Qué">
          <p className="mb-3 text-sm text-suelo-600">¿Qué les hiciste? Siguen donde estaban.</p>
          <ListaEventos tipos={tipos} onElegir={elegirTipo} />
        </section>
      )}

      {preguntaProceso && (
        <section aria-label="De qué proceso" data-testid="de-proceso" className="space-y-2">
          <p className="text-sm text-suelo-600">¿De qué proceso es?</p>
          {opcionesProceso.map(({ proceso, etapa }) => (
            <button
              key={proceso.id}
              type="button"
              onClick={() => navigate(`/pecuaria/procesos/${proceso.id}/etapa/${etapa}`)}
              className="flex min-h-11 w-full flex-col rounded-lg border border-suelo-300 bg-superficie px-4 py-3 text-left hover:border-campo-500 hover:bg-campo-50"
            >
              <span className="font-semibold">{proceso.nombre}</span>
              <span className="text-xs text-suelo-500">
                {proceso.textoEtapa} · {NOMBRE_ETAPA[etapa]}
                {proceso.cabezas != null ? ` · ${formatNumero(proceso.cabezas)} cab.` : ''}
              </span>
            </button>
          ))}
          {ofreceNuevoServicio(tipo) && (
            <button
              type="button"
              onClick={() => {
                setDeProceso('nuevo');
                setEmpezar(true);
              }}
              className="flex min-h-11 w-full items-center rounded-lg border border-campo-200 bg-campo-50 px-4 py-3 text-left font-semibold text-campo-900"
            >
              Empezar un ciclo reproductivo
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setDeProceso('suelto');
              setEmpezar(false);
            }}
            className="min-h-11 px-1 text-sm text-campo-700 hover:underline"
          >
            {textoSuelto(tipo)}
          </button>
        </section>
      )}

      {cargandoProcesos && <p className="text-suelo-600">Cargando…</p>}
      {paso === 1 && tipo && !preguntaProceso && !cargandoProcesos && (
        <PasoAQuien
          tipo={tipo}
          estancia={estancia}
          campo={campo}
          sinCampo={!campoId && campoContexto !== undefined}
          onElegirEstancia={(c) => {
            setElegida(c);
            setSel(SIN_ELEGIR);
          }}
          potreros={potreros}
          lotes={lotes}
          omitidos={omitidos}
          opciones={opciones}
          sel={sel}
          onCambiar={(accion) => setSel((s) => cambiarSeleccion(s, accion, lotes, opciones))}
          busqueda={busqueda}
          onBuscar={setBusqueda}
          recientes={recientes.filter((r) => r.campoId === campoId)}
        />
      )}

      {paso === 2 && tipo && (
        <PasoDatos
          tipo={tipo}
          formulario={formulario}
          elegidos={elegidos}
          datosLote={datosLote}
          onDato={(loteId, campoDato, valor) => setDatosLote((d) => ({ ...d, [loteId]: { ...d[loteId], [campoDato]: valor } }))}
          comunes={comunes}
          onComun={(campoDato, valor) => setComunes((c) => ({ ...c, [campoDato]: valor }))}
          fecha={fecha}
          onFecha={setFecha}
          nota={nota}
          onNota={setNota}
        />
      )}
      {paso === 2 && ofreceServicio && (
        <label data-testid="empezar-servicio" className="mt-4 flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-campo-200 bg-campo-50 px-3 py-3 text-sm">
          <input type="checkbox" checked={empezar} onChange={(e) => setEmpezar(e.target.checked)} className="mt-0.5 h-5 w-5 accent-campo-600" />
          <span>
            <span className="block font-semibold text-campo-900">Empieza un ciclo reproductivo (proceso)</span>
            <span className="block text-xs text-suelo-600">Queda como un proceso, para seguir el diagnóstico, la parición y el destete (Registro → Procesos).</span>
          </span>
        </label>
      )}

      {paso === 3 && previa && <PasoRevisar previa={previa} />}
    </Camino>
  );
}

// Un botón grande que se prende y se apaga (lo elegido).
function Opcion({ activa, onClick, children, detalle }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm ${
        activa ? 'border-campo-500 bg-campo-50 font-semibold text-campo-800' : 'border-suelo-300 bg-superficie hover:border-suelo-400'
      }`}
    >
      <span>{children}</span>
      {detalle && <span className="shrink-0 text-xs font-normal text-suelo-500">{detalle}</span>}
    </button>
  );
}

const resumenLotes = (lotes) => `${formatNumero(lotes.length)} ${lotes.length === 1 ? 'lote' : 'lotes'} · ${formatNumero(suma(lotes))} cab`;

export function PasoAQuien({ tipo, estancia, campo, sinCampo, onElegirEstancia, potreros, lotes, omitidos, opciones, sel, onCambiar, busqueda, onBuscar, recientes }) {
  const resultado = useMemo(() => buscar(lotes, busqueda), [lotes, busqueda]);
  const porPotrero = useMemo(() => {
    const m = new Map();
    for (const l of lotes) m.set(l.potreroId, [...(m.get(l.potreroId) ?? []), l]);
    return m;
  }, [lotes]);

  if (sinCampo) {
    const lista = estancia.camposDelGrupo ?? estancia.campos ?? [];
    return (
      <section aria-label="A quién" className="space-y-2">
        <p className="text-sm text-suelo-700">{estancia.esFeedlot ? '¿En qué feedlot?' : '¿En qué estancia?'}</p>
        {lista.map((c) => (
          <Opcion key={c.id} activa={false} onClick={() => onElegirEstancia(c)}>
            {c.nombre}
          </Opcion>
        ))}
      </section>
    );
  }
  if (!potreros) return <p className="text-suelo-600">Cargando…</p>;

  const recientesVisibles = recientes
    .map((r) =>
      r.tipo === 'lote'
        ? (() => {
            const l = lotes.find((x) => x.loteId === r.id);
            // Los lotes de la planilla ya llevan el potrero en el nombre ("12 · Novillos").
            const texto = l && (l.lote.startsWith(`${l.potrero} · `) ? l.lote : `${l.potrero} · ${l.lote}`);
            return l && { ...r, texto, activo: loteElegido(sel, lotes, l.loteId) };
          })()
        : (() => {
            const ls = porPotrero.get(r.id);
            return ls && { ...r, texto: `Potrero ${ls[0].potrero}`, activo: potreroElegido(sel, lotes, r.id) };
          })(),
    )
    .filter(Boolean);

  return (
    <section aria-label="A quién" className="space-y-3">
      {omitidos > 0 && (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-900">
          No se muestran {formatNumero(omitidos)} {omitidos === 1 ? 'lote' : 'lotes'} de {OTRO_SEXO[tipo.sexo]}: {tipo.nombre} es solo para {NOMBRE_SEXO[tipo.sexo]}.
        </p>
      )}
      {lotes.length === 0 && <p className="text-suelo-600">No hay lotes con animales para esto{campo ? ` en ${campo.nombre}` : ''}.</p>}

      {opciones.campo && lotes.length > 0 && (
        <Opcion activa={sel.nivel === 'CAMPO'} onClick={() => onCambiar({ tipo: 'campo' })} detalle={resumenLotes(lotes)}>
          Toda la estancia{campo ? ` ${campo.nombre}` : ''}
        </Opcion>
      )}

      <label className="flex min-h-11 items-center gap-2 rounded-md border border-suelo-300 bg-superficie px-3">
        <Icono nombre="buscar" className="h-4 w-4 text-suelo-500" />
        <input
          value={busqueda}
          onChange={(e) => onBuscar(e.target.value)}
          placeholder='Buscar: "8.1", "terneros"…'
          aria-label="Buscar potrero, lote o categoría"
          className="w-full bg-transparent py-2 text-sm outline-none placeholder:text-suelo-400"
        />
      </label>

      {!busqueda && recientesVisibles.length > 0 && (
        <div>
          <p className="mb-1 text-xs text-suelo-500">Usados hace poco</p>
          <div className="flex flex-wrap gap-1.5" data-testid="recientes">
            {recientesVisibles.map((r) => (
              <button
                key={`${r.tipo}-${r.id}`}
                type="button"
                aria-pressed={r.activo}
                onClick={() => onCambiar({ tipo: r.tipo, id: r.id })}
                className={`min-h-11 rounded-full border px-3 text-sm ${r.activo ? 'border-campo-500 bg-campo-50 font-semibold text-campo-800' : 'border-suelo-300 bg-superficie'}`}
              >
                {r.texto}
              </button>
            ))}
          </div>
        </div>
      )}

      {opciones.categoria &&
        resultado.categorias.map((c) => (
          <Opcion key={c.categoriaId} activa={sel.nivel === 'CATEGORIA' && sel.categoriaId === c.categoriaId} onClick={() => onCambiar({ tipo: 'categoria', id: c.categoriaId })} detalle={resumenLotes(c.lotes)}>
            Todos los {c.categoria}
          </Opcion>
        ))}

      <ul className="space-y-2" data-testid="potreros-evento">
        {resultado.potreros.map((p) => {
          const delPotrero = porPotrero.get(p.potreroId) ?? [];
          const entero = potreroElegido(sel, lotes, p.potreroId);
          const conBoton = opciones.potrero || (opciones.lote && delPotrero.length > 1);
          return (
            <li key={p.potreroId} className="rounded-lg border border-suelo-200 bg-superficie">
              <div className="flex items-center justify-between gap-2 px-3 py-1.5">
                <span className="font-semibold">{p.potrero}</span>
                {conBoton && (
                  <button
                    type="button"
                    aria-pressed={entero}
                    onClick={() => onCambiar({ tipo: 'potrero', id: p.potreroId })}
                    className={`min-h-11 rounded-md px-3 text-xs font-medium ${entero ? 'bg-boton text-white' : 'bg-suelo-100 text-suelo-700 hover:bg-suelo-200'}`}
                  >
                    {opciones.potrero ? 'Todo el potrero' : 'Todos sus lotes'} · {formatNumero(suma(delPotrero))} cab
                  </button>
                )}
              </div>
              {opciones.lote && (
                <ul className="divide-y divide-suelo-100 border-t border-suelo-100">
                  {p.lotes.map((l) => (
                    <li key={l.loteId}>
                      <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-1.5 text-sm">
                        <input type="checkbox" checked={loteElegido(sel, lotes, l.loteId)} onChange={() => onCambiar({ tipo: 'lote', id: l.loteId })} className="h-5 w-5 accent-campo-600" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{l.lote}</span>
                          <span className="block text-xs text-suelo-500">{l.categoria}</span>
                        </span>
                        <span className="shrink-0 text-suelo-600">{formatNumero(l.cabezas)} cab</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {busqueda && !resultado.potreros.length && !resultado.categorias.length && <p className="text-sm text-suelo-600">Nada coincide con “{busqueda}”.</p>}
    </section>
  );
}

const inputChico = `${inputClass} min-h-11 px-3`;

export function PasoDatos({ tipo, formulario, elegidos, datosLote, onDato, comunes, onComun, fecha, onFecha, nota, onNota }) {
  const porLote = ['pesada', 'recuento', 'ecografia', 'cabezas'].includes(formulario);
  return (
    <section aria-label="Datos" className="space-y-4">
      <label className={etiqueta}>
        Fecha
        <input type="date" value={fecha} max={hoy()} onChange={(e) => onFecha(e.target.value)} className={`${inputChico} mt-1`} />
      </label>

      {formulario === 'producto' && (
        <label className={etiqueta}>
          Producto o detalle (opcional)
          <input value={comunes.producto ?? ''} onChange={(e) => onComun('producto', e.target.value)} maxLength={120} placeholder="Por ejemplo: la marca o la dosis" className={`${inputChico} mt-1`} />
        </label>
      )}
      {formulario === 'alimentacion' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={etiqueta}>
            Ración o detalle (opcional)
            <input value={comunes.racion ?? ''} onChange={(e) => onComun('racion', e.target.value)} maxLength={120} className={`${inputChico} mt-1`} />
          </label>
          <label className={etiqueta}>
            Kg por cabeza por día (opcional)
            <input inputMode="decimal" value={comunes.kgPorCabezaDia ?? ''} onChange={(e) => onComun('kgPorCabezaDia', e.target.value)} className={`${inputChico} mt-1`} />
          </label>
        </div>
      )}

      {porLote && (
        <ul className="space-y-2" data-testid="datos-lotes">
          {elegidos.map((l) => (
            <DatosLote key={l.loteId} formulario={formulario} lote={l} datos={datosLote[l.loteId] ?? datosSugeridos(tipo, l)} onDato={(campo, valor) => onDato(l.loteId, campo, valor)} />
          ))}
        </ul>
      )}
      {!porLote && (
        <p className="text-sm text-suelo-600">
          A {formatNumero(elegidos.length)} {elegidos.length === 1 ? 'lote' : 'lotes'}, {formatNumero(suma(elegidos))} cabezas.
        </p>
      )}

      <label className={etiqueta}>
        Nota (opcional)
        <input value={nota} onChange={(e) => onNota(e.target.value)} maxLength={255} className={`${inputChico} mt-1`} />
      </label>
    </section>
  );
}

function DatosLote({ formulario, lote: l, datos, onDato }) {
  const campo = (nombre, texto, props = {}) => (
    <label className="block min-w-0 text-xs text-suelo-600">
      {texto}
      <input value={datos[nombre] ?? ''} onChange={(e) => onDato(nombre, e.target.value)} aria-label={`${texto} · ${l.lote}`} className={`${inputChico} mt-1`} {...props} />
    </label>
  );
  return (
    <li className="rounded-lg border border-suelo-200 bg-superficie p-3">
      <p className="text-sm">
        <strong>{l.lote}</strong> <span className="text-suelo-500">· {l.potrero} · {l.categoria} · {formatNumero(l.cabezas)} cab</span>
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {formulario === 'pesada' && (
          <>
            {campo('pesoPromedioKg', 'Peso promedio (kg)', { inputMode: 'decimal', placeholder: l.pesoPromedioKg ? formatNumero(l.pesoPromedioKg) : 'kg' })}
            {campo('pesadas', `Cuántas se pesaron (de ${formatNumero(l.cabezas)})`, { inputMode: 'numeric' })}
          </>
        )}
        {formulario === 'recuento' && (
          <>
            {campo('contadas', `Contadas (la app dice ${formatNumero(l.cabezas)})`, { inputMode: 'numeric' })}
            {hayDiferencia(l, datos) && campo('motivo', 'Motivo de la diferencia', { maxLength: 120, placeholder: 'Obligatorio' })}
          </>
        )}
        {formulario === 'ecografia' && (
          <>
            {campo('prenadas', 'Preñadas', { inputMode: 'numeric' })}
            {campo('vacias', `Vacías (de ${formatNumero(l.cabezas)})`, { inputMode: 'numeric' })}
          </>
        )}
        {formulario === 'cabezas' && campo('cabezas', `Cabezas (de ${formatNumero(l.cabezas)})`, { inputMode: 'numeric' })}
      </div>
    </li>
  );
}

const pesoTexto = (p) => (p == null ? '—' : `${formatNumero(p, 1)} kg`);

export function PasoRevisar({ previa }) {
  // Un entore o una inseminación que empieza un servicio: la vista previa del proceso.
  if (previa.empezarServicio) {
    return (
      <section aria-label="Revisar" className="space-y-3">
        <p className="rounded-lg border border-campo-200 bg-campo-50 px-4 py-3 text-base font-medium text-campo-900" data-testid="oracion">
          {previa.empezarServicio.oracion}.
        </p>
        <p className="text-sm text-suelo-600">Después lo ves y lo seguís en Registro → Procesos.</p>
      </section>
    );
  }
  const procesos = [...new Map(previa.lineas.filter((l) => l.proceso).map((l) => [`${l.proceso.id}-${l.proceso.etapa}`, l.proceso])).values()];
  return (
    <section aria-label="Revisar" className="space-y-3">
      <p className="rounded-lg border border-campo-200 bg-campo-50 px-4 py-3 text-base font-medium text-campo-900" data-testid="oracion">
        {previa.oracion}.
      </p>
      {previa.avisos.map((a) => (
        <Notice key={a}>{a}</Notice>
      ))}
      {procesos.map((p) => (
        <p key={`${p.id}-${p.etapa}`} className="rounded-md bg-sky-500/10 px-3 py-2 text-sm text-sky-900">
          Va al proceso {p.nombre} ({NOMBRE_ETAPA[p.etapa] ?? p.etapa.toLowerCase()})
        </p>
      ))}
      {previa.cambiaStock ? (
        <div className="overflow-hidden rounded-lg border border-suelo-200 bg-superficie">
          <table className="w-full text-sm">
            <thead className="bg-suelo-100 text-xs text-suelo-600">
              <tr>
                <th className="px-3 py-2 text-left">Lote</th>
                <th className="px-3 py-2 text-right">Antes</th>
                <th className="px-3 py-2 text-right">Después</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-suelo-100">
              {previa.lineas.map((l) => (
                <tr key={l.loteId}>
                  <td className="px-3 py-2">
                    {l.lote}
                    <span className="block text-xs text-suelo-500">{l.potrero}</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {previa.tipo.clave === 'PESADA' ? pesoTexto(l.antes.pesoPromedioKg) : `${formatNumero(l.antes.cabezas)} cab`}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {!l.despues ? 'sin cambio' : previa.tipo.clave === 'PESADA' ? pesoTexto(l.despues.pesoPromedioKg) : `${formatNumero(l.despues.cabezas)} cab`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="divide-y divide-suelo-100 rounded-lg border border-suelo-200 bg-superficie text-sm">
          {previa.lineas.map((l) => (
            <li key={l.loteId} className="flex items-baseline justify-between gap-3 px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate font-medium">{l.lote}</span>
                <span className="block text-xs text-suelo-500">
                  {l.potrero}
                  {l.texto ? ` · ${l.texto}` : ''}
                </span>
              </span>
              <span className="shrink-0 text-suelo-600">{formatNumero(l.cabezas)} cab</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
