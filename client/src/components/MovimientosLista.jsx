import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getMovimientos, getTiposMovimiento, revertirEvento, revertirMovimiento } from '../api/pecuaria';
import { getErrorMessages } from '../api/axios';
import { ErrorList, Notice } from './ui';
import { formatFecha, formatNumero } from './pecuaria';
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
// corto: solo el potrero (para la segunda línea del celular).
function lado(m, cual, campoId, corto = false) {
  const potrero = cual === 'origen' ? m.potreroOrigen : m.potreroDestino;
  const lote = cual === 'origen' ? m.loteOrigen : m.loteDestino;
  if (!potrero) return '—';
  // Los lotes que armó la planilla ya llevan el potrero en el nombre
  // ("10.3 · Terneros"): no se repite.
  const texto = !lote || corto ? potrero.nombre : lote.nombre.startsWith(`${potrero.nombre} · `) ? lote.nombre : `${potrero.nombre} · ${lote.nombre}`;
  if (potrero.campoId == null || potrero.campoId === campoId) return texto;
  const campo = [m.campo, m.campoOtro].find((c) => c?.id === potrero.campoId);
  return `${cual === 'origen' ? '←' : '→'} ${campo?.nombre ?? 'otro campo'} · ${texto}`;
}

const categoriaDe = (m) =>
  m.categoriaOrigen && m.categoriaDestino && m.categoriaOrigen !== m.categoriaDestino
    ? `${m.categoriaOrigen} → ${m.categoriaDestino}`
    : (m.categoriaOrigen ?? m.categoriaDestino ?? '—');

const tipoDe = (m) => (m.modo === 'ENTRADA' || m.modo === 'SALIDA' ? m.tipo.nombre : (NOMBRE_MODO[m.modo] ?? m.tipo?.nombre ?? m.modo));

const unicos = (lista) => [...new Set(lista.filter((x) => x && x !== '—'))];

// Una fila de la tabla: un movimiento suelto o un evento (múltiple, entre
// campos, o su reversión) con sus pasos adentro.
export function armarFilas(movimientos, campoId) {
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
  return filas.map((f, i) => {
    if (f.m) {
      const { m } = f;
      return {
        ...f,
        i,
        fecha: m.fecha,
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
      };
    }
    const pasos = [...f.pasos].sort((a, b) => a.id - b.id);
    const multiple = f.evento.tipo === 'MULTIPLE' || pasos.length > 1;
    return {
      ...f,
      pasos,
      i,
      fecha: pasos[0].fecha,
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
    };
  });
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
export default function MovimientosLista({ campoId, potreros }) {
  const puedo = usePuede();
  const [params, setParams] = useSearchParams();
  const f = {
    periodo: params.get('periodo') ?? '',
    desde: params.get('desde') ?? '',
    hasta: params.get('hasta') ?? '',
    potreroId: params.get('mpotrero') ?? '',
    categoriaId: params.get('mcategoria') ?? '',
    tipoId: params.get('mtipo') ?? '',
  };
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
    return { desde, hasta, potreroId: f.potreroId, categoriaId: f.categoriaId, tipoId: f.tipoId };
  }, [f.periodo, f.desde, f.hasta, f.potreroId, f.categoriaId, f.tipoId]);

  const cargar = useCallback(
    () =>
      getMovimientos(campoId, filtrosApi)
        .then(({ data }) => setDatos(data))
        .catch((error) => setErrors(getErrorMessages(error, 'No se pudieron cargar los movimientos'))),
    [campoId, filtrosApi],
  );
  useEffect(() => {
    cargar();
  }, [cargar]);
  useEffect(() => {
    getTiposMovimiento()
      .then(({ data }) => setTipos(data))
      .catch(() => setTipos([]));
  }, []);

  const ordenados = useMemo(() => [...potreros].sort((a, b) => ordenNatural.compare(a.nombre, b.nombre)), [potreros]);
  const categorias = useMemo(() => {
    const m = new Map();
    for (const p of potreros) for (const l of p.stock?.lotes ?? []) m.set(String(l.categoriaId), l.categoria);
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [potreros]);

  const filas = useMemo(() => (datos ? ordenarFilas(armarFilas(datos.movimientos, campoId), orden) : []), [datos, campoId, orden]);
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

  async function onRevertir(fila) {
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

  const activos = [f.periodo, f.potreroId, f.categoriaId, f.tipoId].filter(Boolean).length;
  const hayFiltros = activos > 0;
  const limpiar = () => poner({ periodo: '', desde: '', hasta: '', mpotrero: '', mcategoria: '', mtipo: '' });
  const conRevertir = puedo('pecuaria:ANULAR');
  const columnas = conRevertir ? COLUMNAS.length + 1 : COLUMNAS.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelFiltros activos={activos} onLimpiar={limpiar}>
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
                {p.nombre}
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
      ) : datos.movimientos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-suelo-300 p-6 text-center text-suelo-600">
          {hayFiltros ? 'No hay movimientos con esos filtros.' : 'Todavía no hay movimientos. Se registran con el botón +.'}
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
                        <Paso key={m.id} m={m} n={n + 1} campoId={campoId} conRevertir={conRevertir} />
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={columnas} className="sticky bottom-0 left-0 z-20 whitespace-normal border-t-2 border-suelo-300 bg-suelo-50 px-3 py-2 text-sm">
                  <span className="sticky left-3">
                    <strong>Total{hayFiltros ? ' filtrado' : ''}:</strong> {datos.resumen.movimientos} {datos.resumen.movimientos === 1 ? 'movimiento' : 'movimientos'} ·{' '}
                    <strong>{formatNumero(datos.resumen.cabezas)}</strong> cabezas movidas ·{' '}
                    <strong className="text-emerald-800">+{formatNumero(datos.resumen.entradas)}</strong> entraron ·{' '}
                    <strong className="text-red-700">−{formatNumero(datos.resumen.salidas)}</strong> salieron
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
        {fila.pasos ? (
          <button type="button" onClick={onAlternar} aria-expanded={abierto} aria-label={abierto ? 'Cerrar los pasos' : 'Ver los pasos'} className="mr-1 text-campo-600">
            {abierto ? '▾' : '▸'}
          </button>
        ) : null}
        <span className="md:hidden">{fechaCorta(fila.fecha)}</span>
        <span className="hidden md:inline">{formatFecha(fila.fecha)}</span>
      </td>
      <td className={celda}>
        {fila.tipo}
        {fila.revertido && <span className="ml-1 rounded bg-red-500/15 px-1.5 py-0.5 text-xs text-red-700">revertido</span>}
        {/* En el celular: categoría, de dónde a dónde, peso y quién, debajo del tipo. */}
        <span className="block text-xs text-suelo-600 md:hidden">
          {fila.categoria}
          {fila.origenCorto !== '—' || fila.destinoCorto !== '—' ? ` · ${fila.origenCorto} → ${fila.destinoCorto}` : ''}
          {fila.peso ? ` · ${formatNumero(fila.peso)} kg` : ''}
          {fila.usuario ? ` · ${fila.usuario}` : ''}
        </span>
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
              Revertir
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
