import { useCallback, useEffect, useMemo, useState } from 'react';
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
import Icono from './Icono';

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
const NOMBRE_EVENTO = { MULTIPLE: 'Múltiple', ENTRE_CAMPOS: 'Entre campos', REVERSION: 'Reversión', PROCESO: 'Proceso' };

// Las columnas (25/11, recomendación aprobada por Diego: pocas y claras; el
// resto va al detalle que se abre al tocar la fila).
// [clave, título, dónde se ve: 'ambos' | 'compu' | 'celular'].
// Celular: Fecha | Movimiento (debajo, la categoría) | Dónde (potreros) | Cab.
// Compu:   suma Categoría, Origen y Destino (con el lote), Peso y Usuario.
const COLUMNAS = [
  ['fecha', 'Fecha', 'ambos'],
  ['tipo', 'Movimiento', 'ambos'],
  ['categoria', 'Categoría', 'compu'],
  ['donde', 'Dónde', 'celular'],
  ['origen', 'Origen', 'compu'],
  ['destino', 'Destino', 'compu'],
  ['cabezas', 'Cab.', 'ambos'],
  ['peso', 'Peso', 'compu'],
  ['usuario', 'Usuario', 'compu'],
];
// La pestaña Eventos: un evento no va de un lado a otro, se anota en un lugar.
// Debajo del nombre, el dato que importa (el peso, el producto, el resultado).
const COLUMNAS_EVENTOS = [
  ['fecha', 'Fecha', 'ambos'],
  ['tipo', 'Evento', 'ambos'],
  ['categoria', 'Categoría', 'compu'],
  ['origen', 'Dónde', 'ambos'],
  ['cabezas', 'Cab.', 'ambos'],
  ['usuario', 'Usuario', 'compu'],
];
const VISTA = { ambos: '', compu: 'hidden md:table-cell', celular: 'md:hidden' };
// Los tipos del filtro de cada pestaña: en Movimientos, los que mueven, entran
// o salen, más el recuento (que puede cambiar las cabezas); en Eventos, los
// que se anotan.
export const tiposDe = (tipos, ver) =>
  tipos.filter((t) => (ver === 'eventos' ? t.efecto === 'REGISTRO' : t.efecto !== 'REGISTRO' || t.clave === 'RECUENTO'));
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

const tramo = (o, d) => (o !== '—' && d !== '—' ? `${o} → ${d}` : o !== '—' ? `${o} →` : d !== '—' ? `→ ${d}` : '—');

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
    donde: unicos(eventos.map((x) => lugarEvento(x, campoId, true))).join(', ') || '—',
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
        donde: tramo(lado(m, 'origen', campoId, true), lado(m, 'destino', campoId, true)),
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
      donde: unicos(pasos.map((m) => tramo(lado(m, 'origen', campoId, true), lado(m, 'destino', campoId, true)))).join(', ') || '—',
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
        className="mt-1 block w-full min-w-0 rounded-md border border-suelo-300 bg-superficie px-2 py-2 text-sm text-suelo-800"
      >
        {children}
      </select>
    </label>
  );
}

// Una pestaña de Registro como una tabla tipo Excel (pedido de Diego, 18/11).
// ver = 'movimientos': una fila por movimiento (los múltiples y entre campos,
// una fila que se despliega con sus pasos) y los eventos que cambiaron las
// cabezas. ver = 'eventos': una fila por carga de eventos. Se ordena tocando
// el título de la columna; abajo, los totales de lo filtrado.
export default function MovimientosLista({ campoId, potreros, todas = false, grupo = 'estancias', ver = 'movimientos' }) {
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
  const deEventos = ver === 'eventos';
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
  // La fila tocada: su detalle se abre en un modal.
  const [detalle, setDetalle] = useState(null);
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
      setDetalle(null);
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
      setDetalle(null);
      await cargar();
    } catch (error) {
      setAviso(null);
      setErrors(getErrorMessages(error, 'No se pudo revertir'));
    }
  }

  const activos = [f.periodo, f.potreroId, f.categoriaId, f.tipoId].filter(Boolean).length;
  const hayFiltros = activos > 0;
  const limpiar = () => poner({ periodo: '', desde: '', hasta: '', mpotrero: '', mcategoria: '', mtipo: '' });
  const nombreLista = deEventos ? 'eventos' : 'movimientos';
  const conRevertir = puedo('pecuaria:ANULAR');
  const titulos = deEventos ? COLUMNAS_EVENTOS : COLUMNAS;
  const columnas = conRevertir ? titulos.length + 1 : titulos.length;
  const cuantosEventos = datos?.resumen.eventos ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelFiltros activos={activos} onLimpiar={limpiar} compacto>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Período">
          {PERIODOS.map(([valor, texto]) => (
            <button
              key={texto}
              type="button"
              onClick={() => poner({ periodo: valor, ...(valor !== 'rango' && { desde: '', hasta: '' }) })}
              aria-pressed={f.periodo === valor}
              className={`rounded-full px-3 py-1 text-sm ${f.periodo === valor ? 'bg-boton text-white' : 'bg-suelo-200/70 text-suelo-700 hover:bg-suelo-300/60'}`}
            >
              {texto}
            </button>
          ))}
        </div>
        {f.periodo === 'rango' && (
          <div className="grid grid-cols-2 gap-2">
            <label className="block min-w-0 text-xs text-suelo-500">
              Desde
              <input type="date" value={f.desde} onChange={(e) => poner({ desde: e.target.value })} className="mt-1 block w-full min-w-0 rounded-md border border-suelo-300 bg-superficie px-2 py-2 text-sm" />
            </label>
            <label className="block min-w-0 text-xs text-suelo-500">
              Hasta
              <input type="date" value={f.hasta} onChange={(e) => poner({ hasta: e.target.value })} className="mt-1 block w-full min-w-0 rounded-md border border-suelo-300 bg-superficie px-2 py-2 text-sm" />
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
            {tiposDe(tipos, ver).map((t) => (
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
          {hayFiltros
            ? `No hay ${nombreLista} con esos filtros.`
            : deEventos
              ? 'Todavía no hay eventos. Se anotan con el botón + (Eventos).'
              : 'Todavía no hay movimientos. Se registran con el botón +.'}
        </p>
      ) : (
        // Se achica para que entre en la pantalla; lo que no entra, scrollea adentro.
        <div className="min-h-0 overflow-auto rounded-lg border border-suelo-300 bg-superficie" data-testid="tabla-movimientos">
          <table className="w-full border-separate border-spacing-0 text-left text-sm md:min-w-[56rem]">
            <thead className="text-xs text-suelo-600">
              <tr>
                {titulos.map(([col, titulo, vista], i) => (
                  <TituloOrdenable
                    key={col}
                    col={col}
                    titulo={titulo}
                    orden={orden}
                    onOrdenar={ordenarPor}
                    derecha={col === 'cabezas' || col === 'peso'}
                    fija={i === 0}
                    className={VISTA[vista]}
                  />
                ))}
                {conRevertir && (
                  <th scope="col" className="sticky top-0 z-10 w-9 border-b border-suelo-300 bg-suelo-100 px-1 py-1.5">
                    <span className="sr-only">{deEventos ? 'Anular' : 'Revertir'}</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {pag.filas.map((fila, n) => (
                <Fila
                  key={fila.clave}
                  fila={fila}
                  titulos={titulos}
                  par={n % 2 === 1}
                  onAbrir={() => setDetalle(fila)}
                  conRevertir={conRevertir}
                  onRevertir={() => onRevertir(fila)}
                />
              ))}
            </tbody>
            <tfoot className="acostado:hidden">
              <tr>
                <td colSpan={columnas} className="sticky bottom-0 left-0 z-20 whitespace-normal border-t-2 border-suelo-300 bg-suelo-50 px-3 py-2 text-sm">
                  <span className="sticky left-3">
                    <strong>Total{hayFiltros ? ' filtrado' : ''}:</strong>{' '}
                    {deEventos ? (
                      <>
                        <strong>{formatNumero(cuantosEventos)}</strong> {cuantosEventos === 1 ? 'evento' : 'eventos'} (uno por lote)
                      </>
                    ) : (
                      <>
                        {datos.resumen.movimientos} {datos.resumen.movimientos === 1 ? 'movimiento' : 'movimientos'} ·{' '}
                        <strong>{formatNumero(datos.resumen.cabezas)}</strong> cabezas movidas ·{' '}
                        <strong className="text-emerald-800">+{formatNumero(datos.resumen.entradas)}</strong> entraron ·{' '}
                        <strong className="text-red-700">−{formatNumero(datos.resumen.salidas)}</strong> salieron
                        {cuantosEventos > 0 && ` · ${cuantosEventos} ${cuantosEventos === 1 ? 'recuento' : 'recuentos'} con diferencia`}
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
      {detalle && (
        <Detalle
          fila={detalle}
          campoId={lugar}
          conRevertir={conRevertir}
          onRevertir={() => onRevertir(detalle)}
          onAnular={(e) => onAnular(detalle, e)}
          onCerrar={() => setDetalle(null)}
        />
      )}
    </div>
  );
}

// Una fila: lo justo (25/11). Tocarla abre el detalle; el ícono de la
// derecha revierte (o anula) sin abrirlo.
function Fila({ fila, titulos, par, onAbrir, conRevertir, onRevertir }) {
  const colorCabezas = fila.signo === '+' ? 'text-emerald-800' : fila.signo === '−' ? 'text-red-700' : '';
  // Filas alternadas, como en Excel.
  const fondo = par ? '[&>td]:bg-suelo-50' : '[&>td]:bg-superficie';
  // Debajo del tipo: en un evento, el dato (o la categoría); en un movimiento, la categoría.
  const debajo = fila.eventos ? fila.detalle || fila.categoria : fila.categoria;
  const celdas = {
    fecha: (
      <>
        <span className="md:hidden">{fechaCorta(fila.fecha)}</span>
        <span className="hidden md:inline">{formatFecha(fila.fecha)}</span>
      </>
    ),
    tipo: (
      <>
        {fila.eventos && <span className="mr-1 rounded bg-sky-500/15 px-1.5 py-0.5 text-[11px] font-medium text-sky-800">evento</span>}
        <span className={`font-medium ${fila.eventos && fila.revertido ? 'line-through' : ''}`}>{fila.tipo}</span>
        {fila.revertido && <span className="ml-1 rounded bg-red-500/15 px-1.5 py-0.5 text-xs text-red-700">{fila.eventos ? 'anulado' : 'revertido'}</span>}
        {debajo && debajo !== '—' && <span className="block truncate text-xs text-suelo-600">{debajo}</span>}
      </>
    ),
    categoria: fila.categoria,
    donde: fila.donde,
    origen: fila.eventos ? (
      <>
        <span className="md:hidden">{fila.origenCorto}</span>
        <span className="hidden md:inline">{fila.origen}</span>
      </>
    ) : (
      fila.origen
    ),
    destino: fila.destino,
    cabezas: (
      <span className={`font-semibold ${colorCabezas}`}>
        {fila.signo}
        {formatNumero(fila.cabezas)}
      </span>
    ),
    peso: fila.peso ? `${formatNumero(fila.peso)} kg` : '—',
    usuario: <span className="text-suelo-600">{fila.usuario}</span>,
  };
  return (
    <tr
      className={`${fondo} cursor-pointer hover:[&>td]:bg-campo-50 ${fila.revertido ? 'text-suelo-400' : ''}`}
      onClick={onAbrir}
      data-testid="fila-historial"
    >
      {titulos.map(([col, , vista], i) => (
        <td
          key={col}
          className={`${celda} ${VISTA[vista]} ${i === 0 ? 'sticky left-0 z-[5] whitespace-nowrap font-medium' : ''} ${col === 'cabezas' || col === 'peso' ? 'text-right tabular-nums' : ''} ${col === 'usuario' ? 'whitespace-nowrap' : ''}`}
        >
          {col === 'tipo' ? (
            // El tipo es el botón (para el teclado y los lectores de pantalla).
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAbrir();
              }}
              className="block w-full min-w-0 text-left"
              aria-label={`Ver el detalle: ${fila.tipo}`}
            >
              {celdas.tipo}
            </button>
          ) : (
            celdas[col]
          )}
        </td>
      ))}
      {conRevertir && (
        <td className={`${celda} w-9 px-1 text-center align-middle`}>
          {fila.puedeRevertir && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRevertir();
              }}
              aria-label={fila.eventos ? 'Anular' : 'Revertir'}
              title={fila.eventos ? 'Anular' : 'Revertir'}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-red-700 hover:bg-red-500/10"
            >
              <Icono nombre={fila.eventos ? 'anular' : 'deshacer'} className="h-4 w-4" />
            </button>
          )}
        </td>
      )}
    </tr>
  );
}

// El potrero y el lote de un lado, con el lote como link a su historial.
function LadoConLink({ texto, lote }) {
  if (!lote) return texto;
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

function Dato({ titulo, children }) {
  if (children == null || children === '' || children === '—') return null;
  return (
    <div className="flex gap-3 py-1.5">
      <dt className="w-24 shrink-0 text-suelo-500">{titulo}</dt>
      <dd className="min-w-0 flex-1 text-suelo-900">{children}</dd>
    </div>
  );
}

const fechaHora = (iso) => (iso ? new Date(iso).toLocaleString('es-UY', { dateStyle: 'short', timeStyle: 'short' }) : '');

// El detalle de una fila (25/11): todo lo que no entra en la tabla, grande y
// a la vista. Abajo, revertir o anular con la palabra (y pide confirmación).
// En el celular sube desde abajo; en la compu es una ventana al medio.
export function Detalle({ fila, campoId, conRevertir, onRevertir, onAnular, onCerrar }) {
  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && onCerrar();
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [onCerrar]);
  const { m } = fila;
  const colorCabezas = fila.signo === '+' ? 'text-emerald-800' : fila.signo === '−' ? 'text-red-700' : '';
  const accion = fila.eventos ? 'Anular' : 'Revertir';
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center">
      <button type="button" aria-label="Cerrar" onClick={onCerrar} className="absolute inset-0 bg-black/40" />
      <div
        role="dialog"
        aria-label={`Detalle: ${fila.tipo}`}
        className="relative flex max-h-[85vh] w-full flex-col rounded-t-2xl bg-superficie px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 lg:max-w-lg lg:rounded-2xl lg:pb-5"
        data-testid="detalle-historial"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-suelo-300 lg:hidden" aria-hidden="true" />
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-suelo-500">
              {formatFecha(fila.fecha)}
              {fila.eventos && <span className="ml-1.5 rounded bg-sky-500/15 px-1.5 py-0.5 text-[11px] font-medium text-sky-800">evento</span>}
            </p>
            <h2 className={`text-lg font-bold leading-tight ${fila.revertido ? 'text-suelo-400 line-through' : ''}`}>{fila.tipo}</h2>
            {fila.revertido && <p className="mt-0.5 text-sm font-semibold text-red-700">{fila.eventos ? 'Anulado' : 'Revertido'}</p>}
          </div>
          <p className={`shrink-0 text-right leading-tight ${colorCabezas}`}>
            <span className="block text-3xl font-bold tabular-nums">
              {fila.signo}
              {formatNumero(fila.cabezas)}
            </span>
            <span className="text-xs text-suelo-500">cabezas</span>
          </p>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="-mr-1 rounded-md p-1 text-suelo-500 hover:bg-suelo-200/70">
            <Icono nombre="cerrar" />
          </button>
        </div>

        <div className="-mx-1 mt-3 min-h-0 flex-1 overflow-y-auto px-1 text-sm">
          <dl className="divide-y divide-suelo-200 border-y border-suelo-200">
            <Dato titulo="Categoría">{fila.categoria}</Dato>
            {m && (
              <>
                <Dato titulo="De">{m.potreroOrigen ? <LadoConLink texto={lado(m, 'origen', campoId)} lote={m.loteOrigen} /> : null}</Dato>
                <Dato titulo="A">{m.potreroDestino ? <LadoConLink texto={lado(m, 'destino', campoId)} lote={m.loteDestino} /> : null}</Dato>
                <Dato titulo="Peso">{m.pesoPromedioKg ? `${formatNumero(m.pesoPromedioKg)} kg promedio` : null}</Dato>
                <Dato titulo="Causa">{m.causa?.nombre}</Dato>
              </>
            )}
            {fila.eventos && <Dato titulo="Dato">{fila.detalle}</Dato>}
            <Dato titulo="Venta">{fila.venta}</Dato>
            <Dato titulo="Guía">{fila.guia}</Dato>
            <Dato titulo="Nota">{fila.nota}</Dato>
            <Dato titulo="Lo cargó">
              {fila.usuario ? `${fila.usuario}${fila.creadoEn ? ` · ${fechaHora(fila.creadoEn)}` : ''}` : null}
            </Dato>
          </dl>

          {fila.pasos && (
            <section className="mt-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-suelo-500">
                {fila.pasos.length === 1 ? 'El movimiento' : `Los ${fila.pasos.length} pasos`}
              </h3>
              <ol className="mt-1 divide-y divide-suelo-200 rounded-lg border border-suelo-200">
                {fila.pasos.map((p, n) => (
                  <li key={p.id} className="flex items-start gap-2 px-2.5 py-2" data-testid="paso">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-campo-100 text-[11px] font-bold text-campo-800">{n + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">
                        {tipoDe(p)} · {categoriaDe(p)}
                      </span>
                      <span className="block text-xs text-suelo-600">
                        {p.potreroOrigen ? <LadoConLink texto={lado(p, 'origen', campoId)} lote={p.loteOrigen} /> : '—'} →{' '}
                        {p.potreroDestino ? <LadoConLink texto={lado(p, 'destino', campoId)} lote={p.loteDestino} /> : '—'}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">{formatNumero(p.cabezas)}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {fila.eventos && (
            <section className="mt-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-suelo-500">
                {fila.eventos.length === 1 ? 'Dónde' : `En ${fila.eventos.length} lotes`}
              </h3>
              <ul className="mt-1 divide-y divide-suelo-200 rounded-lg border border-suelo-200">
                {fila.eventos.map((e) => (
                  <li key={e.id} className={`flex items-start gap-2 px-2.5 py-2 ${e.anulado ? 'text-suelo-400' : ''}`} data-testid="lote-evento">
                    <span className="min-w-0 flex-1">
                      <span className={`block font-medium ${e.anulado ? 'line-through' : ''}`}>
                        {e.lote ? <LadoConLink texto={lugarEvento(e, campoId)} lote={e.lote} /> : lugarEvento(e, campoId)}
                      </span>
                      <span className="block text-xs text-suelo-600">
                        {e.categoria}
                        {e.texto ? ` · ${e.texto}` : ''}
                        {e.anulado ? ' · anulado' : ''}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">{formatNumero(e.cabezas)}</span>
                    {conRevertir && fila.eventos.length > 1 && e.puedeAnular && (
                      <button
                        type="button"
                        onClick={() => onAnular(e)}
                        aria-label={`Anular solo ${e.lote?.nombre ?? 'este lote'}`}
                        title="Anular solo este lote"
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-red-700 hover:bg-red-500/10"
                      >
                        <Icono nombre="anular" className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {conRevertir && fila.puedeRevertir && (
          <button
            type="button"
            onClick={onRevertir}
            className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-red-600 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-500/10"
          >
            <Icono nombre={fila.eventos ? 'anular' : 'deshacer'} className="h-4 w-4" />
            {accion}
            {fila.pasos?.length > 1 ? ' todo' : ''}
            {fila.eventos?.length > 1 ? ` (los ${fila.eventos.length} lotes)` : ''}
          </button>
        )}
      </div>
    </div>
  );
}
