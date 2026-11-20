import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  anularEventoRegistro,
  anularGrupoEventos,
  getMovimientos,
  getMovimientosTodas,
  getTiposMovimiento,
  revertirEvento,
  revertirMovimiento,
} from '../api/pecuaria';
import { getErrorMessages } from '../api/axios';
import { ErrorList, Notice } from './ui';
import { formatFecha, formatNumero, nombreConSigla, textoVenta } from './pecuaria';
import usePuede from '../hooks/usePuede';
import { Paginador, TituloOrdenable, celda, paginar } from './tabla';
import PanelFiltros from './PanelFiltros';

const ordenNatural = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
const iso = (d) => d.toLocaleDateString('sv-SE');
const hace = (dias) => {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return iso(d);
};
const inicioDeMes = () => {
  const d = new Date();
  return iso(new Date(d.getFullYear(), d.getMonth(), 1));
};

const PERIODOS = [
  ['', 'Todo'],
  ['hoy', 'Hoy'],
  ['7', 'Últimos 7 días'],
  ['mes', 'Este mes'],
  ['rango', 'Entre fechas'],
];

const NOMBRE_MODO = {
  SUMAR: 'Entre lotes',
  NUEVO: 'Lote nuevo',
  ENTERO: 'Lote entero',
  CATEGORIA: 'Cambio de categoría',
  REVERSION: 'Reversión',
};
const NOMBRE_EVENTO = { MULTIPLE: 'Múltiple', ENTRE_CAMPOS: 'Entre campos', REVERSION: 'Reversión' };

// Qué se lista (eventos, 20/11). Por defecto, los movimientos (como antes).
export const VER = [
  ['todo', 'Todo'],
  ['movimientos', 'Movimientos'],
  ['eventos', 'Eventos'],
];

// [clave, título, solo en la compu]. En el celular la tabla tiene que entrar
// sin scroll de costado: las "solo en la compu" se esconden y su dato va como
// segunda línea, chica, debajo del tipo.
const COLUMNAS = [
  ['fecha', 'Fecha', false],
  ['tipo', 'Movimiento', false],
  ['categoria', 'Categoría', true],
  ['cabezas', 'Cab.', false],
  ['peso', 'Peso', true],
  ['origen', 'Origen', true],
  ['destino', 'Destino', true],
  ['usuario', 'Usuario', true],
];
const SOLO_COMPU = 'hidden md:table-cell';
// "13/11/2026" → "13/11" (en el celular, para que entre).
const fechaCorta = (f) => formatFecha(f).slice(0, 5);

// "potrero · lote" de un lado del movimiento. Si el potrero es de otra
// estancia (movimiento entre campos), con su estancia: "← La Gateada · 10.3".
// Sin campoId ("Todas las estancias"), cada potrero con su sigla: "EG 10.3".
// corto: solo el potrero (para la segunda línea del celular).
function lado(m, cual, campoId, corto = false) {
  const potrero = cual === 'origen' ? m.potreroOrigen : m.potreroDestino;
  const lote = cual === 'origen' ? m.loteOrigen : m.loteDestino;
  if (!potrero) return '—';
  const sigla = campoId == null && potrero.campo?.sigla ? `${potrero.campo.sigla} ` : '';
  // Los lotes que armó la planilla ya llevan el potrero en el nombre
  // ("10.3 · Terneros"): no se repite.
  const texto =
    sigla +
    (!lote || corto ? potrero.nombre : lote.nombre.startsWith(`${potrero.nombre} · `) ? lote.nombre : `${potrero.nombre} · ${lote.nombre}`);
  if (campoId == null || potrero.campoId == null || potrero.campoId === campoId) return texto;
  const campo = [m.campo, m.campoOtro].find((c) => c?.id === potrero.campoId);
  return `${cual === 'origen' ? '←' : '→'} ${campo?.nombre ?? 'otro campo'} · ${texto}`;
}

const categoriaDe = (m) =>
  m.categoriaOrigen && m.categoriaDestino && m.categoriaOrigen !== m.categoriaDestino
    ? `${m.categoriaOrigen} → ${m.categoriaDestino}`
    : (m.categoriaOrigen ?? m.categoriaDestino ?? '—');

// Las entradas, las salidas y el destete muestran el nombre de su tipo.
const tipoDe = (m) =>
  m.modo === 'ENTRADA' || m.modo === 'SALIDA' || m.tipo?.clave === 'DESTETE' ? m.tipo.nombre : (NOMBRE_MODO[m.modo] ?? m.tipo?.nombre ?? m.modo);

// Dónde se anotó un evento: "potrero · lote" (con la sigla si son todas).
function lugarEvento(e, campoId, corto = false) {
  if (!e.potrero) return e.campo?.nombre ?? '—';
  const sigla = campoId == null && e.potrero.campo?.sigla ? `${e.potrero.campo.sigla} ` : '';
  if (!e.lote || corto) return sigla + e.potrero.nombre;
  return sigla + (e.lote.nombre.startsWith(`${e.potrero.nombre} · `) ? e.lote.nombre : `${e.potrero.nombre} · ${e.lote.nombre}`);
}

// Una fila por carga de eventos (lo que se anotó junto: una vacuna a 30 lotes
// es una fila que se despliega con sus lotes).
function filaEventos(lista, campoId) {
  const eventos = [...lista].sort((a, b) => a.id - b.id);
  const [e] = eventos;
  const vigentes = eventos.filter((x) => !x.anulado);
  const n = eventos.length;
  return {
    clave: `g${e.grupoId}`,
    eventos,
    fecha: e.fecha,
    creadoEn: e.creadoEn,
    tipo: `${e.tipo.nombre}${n > 1 ? ` · ${n} lotes` : ''}`,
    categoria: unicos(eventos.map((x) => x.categoria)).join(', ') || '—',
    cabezas: eventos.reduce((s, x) => s + x.cabezas, 0),
    signo: '',
    peso: e.tipo.clave === 'PESADA' && n === 1 ? (e.datos?.pesoPromedioKg ?? null) : null,
    origen: unicos(eventos.map((x) => lugarEvento(x, campoId))).join(', ') || '—',
    destino: '—',
    origenCorto: unicos(eventos.map((x) => lugarEvento(x, campoId, true))).join(', ') || '—',
    destinoCorto: '—',
    usuario: e.usuario ?? '',
    revertido: vigentes.length === 0,
    // Se anula la carga entera si ninguno de sus lotes tuvo cambios después.
    puedeRevertir: vigentes.length > 0 && vigentes.every((x) => x.puedeAnular),
    nota: e.nota,
    guia: '',
    venta: null,
    detalle: unicos(eventos.map((x) => x.texto)).join(' · '),
  };
}

const unicos = (lista) => [...new Set(lista.filter((x) => x && x !== '—'))];

// Una fila de la tabla: un movimiento suelto o un evento (múltiple, entre
// campos, o su reversión) con sus pasos adentro.
// registros: los eventos (pesada, vacuna...) de la lista, uno por lote.
export function armarFilas(movimientos, campoId, registros = []) {
  const filas = [];
  const eventos = new Map();
  for (const m of movimientos) {
    if (m.evento) {
      let fila = eventos.get(m.evento.id);
      if (!fila) {
        fila = { clave: `e${m.evento.id}`, evento: m.evento, pasos: [] };
        eventos.set(m.evento.id, fila);
        filas.push(fila);
      }
      fila.pasos.push(m);
    } else {
      filas.push({ clave: `m${m.id}`, m });
    }
  }
  const grupos = new Map();
  for (const e of registros) grupos.set(e.grupoId, [...(grupos.get(e.grupoId) ?? []), e]);
  const deEventos = [...grupos.values()].map((lista) => filaEventos(lista, campoId));
  const deMovimientos = filas.map((f) => {
    if (f.m) {
      const { m } = f;
      return {
        ...f,
        fecha: m.fecha,
        creadoEn: m.creadoEn,
        tipo: tipoDe(m),
        categoria: categoriaDe(m),
        cabezas: m.cabezas,
        signo: m.modo === 'ENTRADA' ? '+' : m.modo === 'SALIDA' ? '−' : '',
        peso: m.pesoPromedioKg,
        origen: lado(m, 'origen', campoId),
        destino: lado(m, 'destino', campoId),
        origenCorto: lado(m, 'origen', campoId, true),
        destinoCorto: lado(m, 'destino', campoId, true),
        usuario: m.usuario ?? '',
        revertido: m.revertido,
        puedeRevertir: m.puedeRevertir,
        nota: m.nota,
        guia: m.guia ?? '',
        // Una venta con precio: el valor en dólares ("USD 11.520 · USD 3,2/kg").
        venta: textoVenta(m),
      };
    }
    const pasos = [...f.pasos].sort((a, b) => a.id - b.id);
    const multiple = f.evento.tipo === 'MULTIPLE' || pasos.length > 1;
    return {
      ...f,
      pasos,
      fecha: pasos[0].fecha,
      creadoEn: pasos[0].creadoEn,
      tipo: `${NOMBRE_EVENTO[f.evento.tipo] ?? f.evento.tipo}${multiple ? ` · ${pasos.length} pasos` : ''}`,
      categoria: unicos(pasos.map(categoriaDe)).join(', '),
      cabezas: pasos.reduce((s, m) => s + m.cabezas, 0),
      signo: '',
      peso: pasos.length === 1 ? pasos[0].pesoPromedioKg : null,
      origen: unicos(pasos.map((m) => lado(m, 'origen', campoId))).join(', ') || '—',
      destino: unicos(pasos.map((m) => lado(m, 'destino', campoId))).join(', ') || '—',
      origenCorto: unicos(pasos.map((m) => lado(m, 'origen', campoId, true))).join(', ') || '—',
      destinoCorto: unicos(pasos.map((m) => lado(m, 'destino', campoId, true))).join(', ') || '—',
      usuario: pasos[0].usuario ?? '',
      revertido: Boolean(f.evento.revertido),
      puedeRevertir: Boolean(f.evento.puedeRevertir),
      nota: f.evento.nota,
      guia: unicos(pasos.map((m) => m.guia)).join(', '),
      venta: null,
    };
  });
  // Movimientos y eventos juntos, del más nuevo al más viejo (por fecha y por
  // cuándo se cargó). `i` es ese orden: el de los empates al ordenar.
  const juntos = deEventos.length
    ? [...deMovimientos, ...deEventos].sort(
        (a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? '') || String(b.creadoEn ?? '').localeCompare(String(a.creadoEn ?? '')),
      )
    : deMovimientos;
  return juntos.map((f, i) => ({ ...f, i }));
}

// Ordena por una columna; a igualdad, como vinieron (del más nuevo al más viejo).
export function ordenarFilas(filas, { col, dir }) {
  const signo = dir === 'asc' ? 1 : -1;
  return [...filas].sort((a, b) => {
    const x = a[col];
    const y = b[col];
    let c;
    if (x == null && y == null) c = 0;
    else if (x == null) c = 1;
    else if (y == null) c = -1;
    else if (typeof x === 'number' && typeof y === 'number') c = (x - y) * signo;
    else c = ordenNatural.compare(String(x), String(y)) * signo;
    return c || a.i - b.i;
  });
}

function Selector({ etiqueta, valor, onChange, children }) {
  return (
    <label className="block min-w-0 text-xs text-suelo-500">
      {etiqueta}
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full min-w-0 rounded-md border border-suelo-300 bg-white px-2 py-2 text-sm text-suelo-800"
      >
        {children}
      </select>
    </label>
  );
}

// Movimientos de la estancia como una tabla tipo Excel (pedido de Diego,
// 18/11): una fila por movimiento; los múltiples y entre campos, una fila que
// se despliega con sus pasos. Se ordena tocando el título de la columna; abajo,
// los totales de lo filtrado. En el celular se desplaza de costado con la
// fecha fija. Registrar se hace desde el botón "+".
export default function MovimientosLista({ campoId, potreros, todas = false, grupo = 'estancias' }) {
  const puedo = usePuede();
  const [params, setParams] = useSearchParams();
  const f = {
    periodo: params.get('periodo') ?? '',
    desde: params.get('desde') ?? '',
    hasta: params.get('hasta') ?? '',
    potreroId: params.get('mpotrero') ?? '',
    categoriaId: params.get('mcategoria') ?? '',
    tipoId: params.get('mtipo') ?? '',
    ver: params.get('ver') ?? '',
  };
  const ver = VER.some(([v]) => v === f.ver) ? f.ver : 'movimientos';
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
  const [tipos, setTipos] = useState([]);
  const [errors, setErrors] = useState([]);
  const [aviso, setAviso] = useState(null);
  const [orden, setOrden] = useState({ col: 'fecha', dir: 'desc' });
  const [abiertos, setAbiertos] = useState(() => new Set());
  const [pagina, setPagina] = useState(1);

  const filtrosApi = useMemo(() => {
    const desde =
      f.periodo === 'rango' ? f.desde : f.periodo === 'hoy' ? iso(new Date()) : f.periodo === 'mes' ? inicioDeMes() : f.periodo ? hace(Number(f.periodo)) : '';
    const hasta = f.periodo === 'rango' ? f.hasta : '';
    return { desde, hasta, potreroId: f.potreroId, categoriaId: f.categoriaId, tipoId: f.tipoId, ver };
  }, [f.periodo, f.desde, f.hasta, f.potreroId, f.categoriaId, f.tipoId, ver]);

  const cargar = useCallback(
    () =>
      (todas ? getMovimientosTodas(filtrosApi, grupo) : getMovimientos(campoId, filtrosApi))
        .then(({ data }) => setDatos(data))
        .catch((error) => setErrors(getErrorMessages(error, 'No se pudieron cargar los movimientos'))),
    [campoId, todas, grupo, filtrosApi],
  );
  useEffect(() => {
    cargar();
  }, [cargar]);
  useEffect(() => {
    getTiposMovimiento()
      .then(({ data }) => setTipos(data))
      .catch(() => setTipos([]));
  }, []);

  const ordenados = useMemo(
    () => [...potreros].sort((a, b) => ordenNatural.compare(nombreConSigla(a, todas), nombreConSigla(b, todas))),
    [potreros, todas],
  );
  const categorias = useMemo(() => {
    const m = new Map();
    for (const p of potreros) for (const l of p.stock?.lotes ?? []) m.set(String(l.categoriaId), l.categoria);
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [potreros]);

  const lugar = todas ? null : campoId;
  const filas = useMemo(() => (datos ? ordenarFilas(armarFilas(datos.movimientos, lugar, datos.eventos ?? []), orden) : []), [datos, lugar, orden]);
  // Cambiar un filtro o el orden vuelve a la página 1.
  useEffect(() => setPagina(1), [filtrosApi, orden]);
  const pag = paginar(filas, pagina);

  const ordenarPor = (col) => setOrden((o) => ({ col, dir: o.col === col && o.dir === 'desc' ? 'asc' : 'desc' }));
  const alternar = (clave) =>
    setAbiertos((a) => {
      const nuevo = new Set(a);
      if (nuevo.has(clave)) nuevo.delete(clave);
      else nuevo.add(clave);
      return nuevo;
    });

  async function onAnular(fila, evento = null) {
    const texto = evento
      ? `¿Anular ${evento.tipo.nombre} del lote ${evento.lote?.nombre ?? ''}?`
      : `¿Anular ${fila.eventos[0].tipo.nombre}${fila.eventos.length > 1 ? ` en sus ${fila.eventos.length} lotes` : ''}?`;
    const stock = (evento ? [evento] : fila.eventos).some((e) => e.cambiaStock) ? ' El stock vuelve a como estaba.' : '';
    if (!window.confirm(`${texto}${stock} Queda registrado, tachado.`)) return;
    try {
      if (evento) await anularEventoRegistro(evento.id);
      else await anularGrupoEventos(fila.eventos[0].grupoId);
      setErrors([]);
      setAviso('Anulado.');
      await cargar();
    } catch (error) {
      setAviso(null);
      setErrors(getErrorMessages(error, 'No se pudo anular'));
    }
  }

  async function onRevertir(fila) {
    if (fila.eventos) return onAnular(fila);
    const texto = fila.evento
      ? `¿Revertir este ${fila.evento.tipo === 'MULTIPLE' ? 'movimiento múltiple entero' : 'movimiento entre campos'}? Todos sus pasos vuelven a como estaban.`
      : '¿Revertir este movimiento? Los potreros vuelven a como estaban antes.';
    if (!window.confirm(`${texto} Queda registrado: el original y la reversión.`)) return;
    try {
      if (fila.evento) await revertirEvento(fila.evento.id);
      else await revertirMovimiento(fila.m.id);
      setErrors([]);
      setAviso('Revertido.');
      await cargar();
    } catch (error) {
      setAviso(null);
      setErrors(getErrorMessages(error, 'No se pudo revertir'));
    }
  }

  const activos = [f.periodo, f.potreroId, f.categoriaId, f.tipoId, ver !== 'movimientos'].filter(Boolean).length;
  const hayFiltros = activos > 0;
  const limpiar = () => poner({ periodo: '', desde: '', hasta: '', mpotrero: '', mcategoria: '', mtipo: '', ver: '' });
  const conFiltrosDeDatos = Boolean(f.periodo || f.potreroId || f.categoriaId || f.tipoId);
  const nombreLista = ver === 'eventos' ? 'eventos' : ver === 'todo' ? 'movimientos ni eventos' : 'movimientos';
  const conRevertir = puedo('pecuaria:ANULAR');
  const columnas = conRevertir ? COLUMNAS.length + 1 : COLUMNAS.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelFiltros activos={activos} onLimpiar={limpiar}>
        <div className="flex gap-1.5" role="group" aria-label="Qué se ve">
          {VER.map(([valor, texto]) => (
            <button
              key={valor}
              type="button"
              onClick={() => poner({ ver: valor === 'movimientos' ? '' : valor })}
              aria-pressed={ver === valor}
              className={`min-h-9 flex-1 rounded-md px-2 py-1 text-sm font-medium ${ver === valor ? 'bg-campo-600 text-white' : 'bg-suelo-200/70 text-suelo-700 hover:bg-suelo-300/60'}`}
            >
              {texto}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Período">
          {PERIODOS.map(([valor, texto]) => (
            <button
              key={texto}
              type="button"
              onClick={() => poner({ periodo: valor, ...(valor !== 'rango' && { desde: '', hasta: '' }) })}
              aria-pressed={f.periodo === valor}
              className={`rounded-full px-3 py-1 text-sm ${f.periodo === valor ? 'bg-campo-600 text-white' : 'bg-suelo-200/70 text-suelo-700 hover:bg-suelo-300/60'}`}
            >
              {texto}
            </button>
          ))}
        </div>
        {f.periodo === 'rango' && (
          <div className="grid grid-cols-2 gap-2">
            <label className="block min-w-0 text-xs text-suelo-500">
              Desde
              <input type="date" value={f.desde} onChange={(e) => poner({ desde: e.target.value })} className="mt-1 block w-full min-w-0 rounded-md border border-suelo-300 bg-white px-2 py-2 text-sm" />
            </label>
            <label className="block min-w-0 text-xs text-suelo-500">
              Hasta
              <input type="date" value={f.hasta} onChange={(e) => poner({ hasta: e.target.value })} className="mt-1 block w-full min-w-0 rounded-md border border-suelo-300 bg-white px-2 py-2 text-sm" />
            </label>
          </div>
        )}
        <div className="grid grid-cols-1 gap-2">
          <Selector etiqueta="Potrero" valor={f.potreroId} onChange={(v) => poner({ mpotrero: v })}>
            <option value="">Todos</option>
            {ordenados.map((p) => (
              <option key={p.id} value={p.id}>
                {nombreConSigla(p, todas)}
              </option>
            ))}
          </Selector>
          <Selector etiqueta="Categoría" valor={f.categoriaId} onChange={(v) => poner({ mcategoria: v })}>
            <option value="">Todas</option>
            {categorias.map(([id, nombre]) => (
              <option key={id} value={id}>
                {nombre}
              </option>
            ))}
          </Selector>
          <Selector etiqueta="Tipo" valor={f.tipoId} onChange={(v) => poner({ mtipo: v })}>
            <option value="">Todos</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </Selector>
        </div>
      </PanelFiltros>

      <ErrorList errors={errors} />
      <Notice tone="ok">{aviso}</Notice>

      {!datos ? (
        <p className="text-suelo-600">Cargando…</p>
      ) : filas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-suelo-300 p-6 text-center text-suelo-600">
          {conFiltrosDeDatos
            ? `No hay ${nombreLista} con esos filtros.`
            : ver === 'eventos'
              ? 'Todavía no hay eventos. Se anotan con el botón Eventos.'
              : 'Todavía no hay movimientos. Se registran con el botón +.'}
        </p>
      ) : (
        // Se achica para que entre en la pantalla; lo que no entra, scrollea adentro.
        <div className="min-h-0 overflow-auto rounded-lg border border-suelo-300 bg-white" data-testid="tabla-movimientos">
          <table className="w-full border-separate md:min-w-[56rem] border-spacing-0 text-left text-sm">
            <thead className="text-xs text-suelo-600">
              <tr>
                {COLUMNAS.map(([col, titulo, soloCompu], i) => (
                  <TituloOrdenable
                    key={col}
                    col={col}
                    titulo={titulo}
                    orden={orden}
                    onOrdenar={ordenarPor}
                    derecha={col === 'cabezas' || col === 'peso'}
                    fija={i === 0}
                    className={soloCompu ? SOLO_COMPU : ''}
                  />
                ))}
                {conRevertir && <th scope="col" className="sticky top-0 z-10 border-b border-suelo-300 bg-suelo-100 px-2 py-1.5" aria-label="Acciones" />}
              </tr>
            </thead>
            <tbody>
              {pag.filas.map((fila, n) => {
                const abierto = abiertos.has(fila.clave);
                return (
                  <Fragment key={fila.clave}>
                    <Fila fila={fila} par={n % 2 === 1} abierto={abierto} onAlternar={() => alternar(fila.clave)} conRevertir={conRevertir} onRevertir={() => onRevertir(fila)} />
                    {fila.pasos &&
                      abierto &&
                      fila.pasos.map((m, n) => (
                        <Paso key={m.id} m={m} n={n + 1} campoId={lugar} conRevertir={conRevertir} />
                      ))}
                    {fila.eventos?.length > 1 &&
                      abierto &&
                      fila.eventos.map((e) => <LoteEvento key={e.id} e={e} campoId={lugar} conRevertir={conRevertir} onAnular={() => onAnular(fila, e)} />)}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={columnas} className="sticky bottom-0 left-0 z-20 whitespace-normal border-t-2 border-suelo-300 bg-suelo-50 px-3 py-2 text-sm">
                  <span className="sticky left-3">
                    <strong>Total{hayFiltros ? ' filtrado' : ''}:</strong>{' '}
                    {ver !== 'eventos' && (
                      <>
                        {datos.resumen.movimientos} {datos.resumen.movimientos === 1 ? 'movimiento' : 'movimientos'} ·{' '}
                        <strong>{formatNumero(datos.resumen.cabezas)}</strong> cabezas movidas ·{' '}
                        <strong className="text-emerald-800">+{formatNumero(datos.resumen.entradas)}</strong> entraron ·{' '}
                        <strong className="text-red-700">−{formatNumero(datos.resumen.salidas)}</strong> salieron
                      </>
                    )}
                    {ver !== 'movimientos' && (
                      <>
                        {ver === 'todo' ? ' · ' : ''}
                        <strong>{formatNumero(datos.resumen.eventos ?? 0)}</strong> {datos.resumen.eventos === 1 ? 'evento' : 'eventos'} (uno por lote)
                      </>
                    )}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {datos && <Paginador {...pag} onCambiar={setPagina} de={filas.length} />}
    </div>
  );
}

function Fila({ fila, par, abierto, onAlternar, conRevertir, onRevertir }) {
  const colorCabezas = fila.signo === '+' ? 'text-emerald-800' : fila.signo === '−' ? 'text-red-700' : '';
  // Filas alternadas, como en Excel.
  const fondo = par ? '[&>td]:bg-suelo-50' : '[&>td]:bg-white';
  return (
    <tr className={`${fondo} ${fila.revertido ? 'text-suelo-400' : ''}`}>
      <td className={`${celda} sticky left-0 z-[5] whitespace-nowrap font-medium`}>
        {fila.pasos || fila.eventos?.length > 1 ? (
          <button type="button" onClick={onAlternar} aria-expanded={abierto} aria-label={abierto ? 'Cerrar los pasos' : 'Ver los pasos'} className="mr-1 text-campo-600">
            {abierto ? '▾' : '▸'}
          </button>
        ) : null}
        <span className="md:hidden">{fechaCorta(fila.fecha)}</span>
        <span className="hidden md:inline">{formatFecha(fila.fecha)}</span>
      </td>
      <td className={celda}>
        {fila.eventos && <span className="mr-1 rounded bg-sky-500/15 px-1.5 py-0.5 text-[11px] font-medium text-sky-800">evento</span>}
        <span className={fila.eventos && fila.revertido ? 'line-through' : ''}>{fila.tipo}</span>
        {fila.revertido && <span className="ml-1 rounded bg-red-500/15 px-1.5 py-0.5 text-xs text-red-700">{fila.eventos ? 'anulado' : 'revertido'}</span>}
        {fila.detalle && <span className="block text-xs text-suelo-600">{fila.detalle}</span>}
        {/* En el celular: categoría, de dónde a dónde, peso y quién, debajo del tipo. */}
        <span className="block text-xs text-suelo-600 md:hidden">
          {fila.categoria}
          {fila.eventos
            ? ` · ${fila.origenCorto}`
            : fila.origenCorto !== '—' || fila.destinoCorto !== '—'
              ? ` · ${fila.origenCorto} → ${fila.destinoCorto}`
              : ''}
          {fila.peso ? ` · ${formatNumero(fila.peso)} kg` : ''}
          {fila.usuario ? ` · ${fila.usuario}` : ''}
          {fila.venta ? ` · ${fila.venta}` : ''}
        </span>
        {/* En la compu, el valor de la venta va como detalle debajo del tipo. */}
        {fila.venta && (
          <span className="hidden text-xs text-suelo-600 md:block" data-testid="venta">
            Venta: {fila.venta}
          </span>
        )}
        {fila.guia && <span className="block text-xs text-suelo-500">Guía {fila.guia}</span>}
        {fila.nota && <span className="block text-xs text-suelo-500">{fila.nota}</span>}
      </td>
      <td className={`${celda} ${SOLO_COMPU}`}>{fila.categoria}</td>
      <td className={`${celda} text-right font-semibold tabular-nums ${colorCabezas}`}>
        {fila.signo}
        {formatNumero(fila.cabezas)}
      </td>
      <td className={`${celda} ${SOLO_COMPU} text-right tabular-nums`}>{fila.peso ? `${formatNumero(fila.peso)} kg` : '—'}</td>
      <td className={`${celda} ${SOLO_COMPU}`}>{fila.m?.loteOrigen ? <LadoConLink m={fila.m} texto={fila.origen} lote={fila.m.loteOrigen} /> : fila.origen}</td>
      <td className={`${celda} ${SOLO_COMPU}`}>{fila.m?.loteDestino ? <LadoConLink m={fila.m} texto={fila.destino} lote={fila.m.loteDestino} /> : fila.destino}</td>
      <td className={`${celda} ${SOLO_COMPU} whitespace-nowrap text-suelo-600`}>{fila.usuario}</td>
      {conRevertir && (
        <td className={`${celda} whitespace-nowrap`}>
          {fila.puedeRevertir && (
            <button type="button" onClick={onRevertir} className="text-xs text-red-700 hover:underline">
              {fila.eventos ? 'Anular' : 'Revertir'}
            </button>
          )}
        </td>
      )}
    </tr>
  );
}

// El texto del lado, con el nombre del lote como link a su historial.
function LadoConLink({ texto, lote }) {
  const i = texto.lastIndexOf(lote.nombre);
  if (i < 0) return texto;
  return (
    <>
      {texto.slice(0, i)}
      <Link to={`/pecuaria/lotes/${lote.id}`} className="text-campo-700 hover:underline">
        {lote.nombre}
      </Link>
    </>
  );
}

function Paso({ m, n, campoId, conRevertir }) {
  return (
    <tr className="text-suelo-700 [&>td]:bg-campo-50">
      <td className={`${celda} sticky left-0 z-[5] whitespace-nowrap pl-7 text-xs text-suelo-500`}>Paso {n}</td>
      <td className={celda}>
        {tipoDe(m)}
        <span className="block text-xs text-suelo-600 md:hidden">
          {categoriaDe(m)} · {lado(m, 'origen', campoId, true)} → {lado(m, 'destino', campoId, true)}
        </span>
      </td>
      <td className={`${celda} ${SOLO_COMPU}`}>{categoriaDe(m)}</td>
      <td className={`${celda} text-right tabular-nums`}>{formatNumero(m.cabezas)}</td>
      <td className={`${celda} ${SOLO_COMPU} text-right tabular-nums`}>{m.pesoPromedioKg ? `${formatNumero(m.pesoPromedioKg)} kg` : '—'}</td>
      <td className={`${celda} ${SOLO_COMPU}`}>{lado(m, 'origen', campoId)}</td>
      <td className={`${celda} ${SOLO_COMPU}`}>{lado(m, 'destino', campoId)}</td>
      <td className={`${celda} ${SOLO_COMPU}`} />
      {conRevertir && <td className={celda} />}
    </tr>
  );
}

// Un lote de una carga de eventos (al desplegarla).
function LoteEvento({ e, campoId, conRevertir, onAnular }) {
  return (
    <tr className={`text-suelo-700 [&>td]:bg-sky-50 ${e.anulado ? 'text-suelo-400' : ''}`}>
      <td className={`${celda} sticky left-0 z-[5] whitespace-nowrap pl-7 text-xs text-suelo-500`}>Lote</td>
      <td className={celda}>
        <span className={e.anulado ? 'line-through' : ''}>{e.lote?.nombre ?? e.potrero?.nombre ?? '—'}</span>
        {e.anulado && <span className="ml-1 rounded bg-red-500/15 px-1.5 py-0.5 text-xs text-red-700">anulado</span>}
        <span className="block text-xs text-suelo-600">
          {e.texto || e.categoria}
          <span className="md:hidden"> · {lugarEvento(e, campoId, true)}</span>
        </span>
      </td>
      <td className={`${celda} ${SOLO_COMPU}`}>{e.categoria}</td>
      <td className={`${celda} text-right tabular-nums`}>{formatNumero(e.cabezas)}</td>
      <td className={`${celda} ${SOLO_COMPU} text-right tabular-nums`}>{e.tipo.clave === 'PESADA' && e.datos?.pesoPromedioKg ? `${formatNumero(e.datos.pesoPromedioKg)} kg` : '—'}</td>
      <td className={`${celda} ${SOLO_COMPU}`}>{lugarEvento(e, campoId)}</td>
      <td className={`${celda} ${SOLO_COMPU}`}>—</td>
      <td className={`${celda} ${SOLO_COMPU}`} />
      {conRevertir && (
        <td className={`${celda} whitespace-nowrap`}>
          {e.puedeAnular && (
            <button type="button" onClick={onAnular} className="text-xs text-red-700 hover:underline">
              Anular
            </button>
          )}
        </td>
      )}
    </tr>
  );
}
