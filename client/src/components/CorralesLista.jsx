import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { aprox, cabezasPorCategoria, formatDiaMes, formatFecha, formatNumero, formatUsdCorto, nombreConSigla } from './pecuaria';
import { porEstanciaYPlanilla } from '../hooks/usePotreros';
import { TituloOrdenable, celda } from './tabla';
import PanelFiltros from './PanelFiltros';
import { BarraBuscar, Chip, Select, categoriasCortas } from './PotrerosLista';
import { textoSalida } from './FeedlotAnalisis';

// La tabla de Corrales (feedlot, fase 1, 25/11; docs/FEEDLOT.md §4). En un
// feedlot las hectáreas no dicen nada: se mira cuánto hace que entraron, cuánto
// engordan por día, si entran bien en el comedero y cuándo salen. Los números
// vienen calculados del servidor (p.feedlot, de feedlot.service.js
// resumenCorral); acá solo se muestran, ordenan y filtran.
// Celular: Corral (debajo la categoría y la etapa) | Cab. | Días (debajo lo que
// falta para salir) | Peso hoy (debajo la ganancia diaria) | cm/cab (con la
// barra contra el objetivo). La compu suma Categorías, Peso de entrada, GMD,
// kg ganados, Salida y Valor.

export const NOMBRE_ETAPA = {
  ADAPTACION: 'Adaptación',
  ENGORDE: 'Engorde',
  TERMINACION: 'Terminación',
  PARA_SALIR: 'Para salir',
  SIN_FECHA: 'Sin fecha',
};
const SALIDAS = [
  ['', 'Todas'],
  ['atrasados', 'Atrasados'],
  ['30', 'Salen en 30 días'],
];
const ANIMALES = [
  ['', 'Todos'],
  ['con', 'Con animales'],
  ['vacios', 'Vacíos'],
];

const SOLO_COMPU = 'hidden md:table-cell';
const celdaFila = celda.replace('align-top', 'align-middle');
const ALTO_FILA = 'h-[4.5rem] md:h-10';
const segunda = 'block text-[11px] font-normal leading-4 text-suelo-500';
const ordenNatural = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
const sinTildes = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const fl = (p) => p.feedlot ?? null;
// Hoy, en la hora del celular: la salida de otro año lleva el año ("23/02/27").
const hoyLocal = () => new Date().toLocaleDateString('sv-SE');
// La ganancia diaria: "1,75 kg/d" (de las pesadas) o "≈1,5 kg/d" (la esperada).
export const textoGmd = (f) => (f?.gmdKg == null ? '—' : `${aprox(!f.gmdReal, formatNumero(f.gmdKg, 2))} kg/d`);
// Atrasado: ámbar fuerte. Sale en menos de una semana: ámbar.
const colorSalida = (f) => (f?.atrasado ? 'font-semibold text-amber-900' : f?.salidaCerca ? 'text-amber-800' : 'text-suelo-500');

// Columnas: clave, título, corto (en el celular), derecha, valor para ordenar,
// solo en la compu, orden por defecto, ancho en el celular.
const COLUMNAS = [
  { c: 'corral', titulo: 'Corral', dir: 'asc' },
  { c: 'categorias', titulo: 'Categorías', compu: true, valor: (p) => (p.stock?.cabezas ? cabezasPorCategoria(p.stock.lotes) : null), dir: 'asc' },
  { c: 'cabezas', titulo: 'Cabezas', corto: 'Cab.', derecha: true, valor: (p) => p.stock?.cabezas ?? 0, ancho: 'w-[3.25rem]' },
  { c: 'dias', titulo: 'Días', derecha: true, valor: (p) => fl(p)?.diasEncierre ?? null, ancho: 'w-[3.75rem]' },
  { c: 'pesoEntrada', titulo: 'Peso entrada', compu: true, derecha: true, valor: (p) => fl(p)?.pesoEntradaKg ?? null },
  { c: 'pesoHoy', titulo: 'Peso hoy', derecha: true, valor: (p) => fl(p)?.pesoHoyKg ?? null, ancho: 'w-[4.25rem]' },
  { c: 'gmd', titulo: 'GMD', compu: true, derecha: true, valor: (p) => fl(p)?.gmdKg ?? null },
  { c: 'ganados', titulo: 'kg ganados', compu: true, derecha: true, valor: (p) => fl(p)?.kgGanadosCab ?? null },
  { c: 'salida', titulo: 'Salida', compu: true, derecha: true, valor: (p) => fl(p)?.diasParaSalida ?? null, dir: 'asc' },
  // Los más apretados primero.
  { c: 'cm', titulo: 'cm/cab', derecha: true, valor: (p) => fl(p)?.cmPorCabeza ?? null, dir: 'asc', ancho: 'w-[3.25rem]' },
  { c: 'valor', titulo: 'Valor', compu: true, derecha: true, valor: (p) => fl(p)?.valorUsd ?? null },
];
const dirPorDefecto = (c) => COLUMNAS.find((x) => x.c === c)?.dir ?? 'desc';

// Ordena los corrales por una columna. "Corral" sigue el orden de la planilla;
// en las demás, a igualdad, por nombre. Los que no tienen el dato, al final.
export function ordenarCorrales(lista, { col, dir }) {
  const signo = dir === 'asc' ? 1 : -1;
  const valor = COLUMNAS.find((x) => x.c === col)?.valor;
  if (!valor) return [...lista].sort((a, b) => porEstanciaYPlanilla(a, b) * signo);
  return [...lista].sort((a, b) => {
    const x = valor(a);
    const y = valor(b);
    if (x == null || y == null) return (x == null) - (y == null) || porEstanciaYPlanilla(a, b);
    const c = typeof x === 'number' ? x - y : ordenNatural.compare(x, y);
    return c * signo || porEstanciaYPlanilla(a, b);
  });
}

// Lo que suma lo filtrado: cabezas, y días, pesos y ganancia ponderados por
// cabezas (con los corrales que tienen el dato); cm por cabeza del total
// (metros ÷ cabezas de los corrales con metros); atrasados; valor.
export function totalesCorrales(corrales) {
  const ponderado = (valor) => {
    let cab = 0;
    let suma = 0;
    for (const p of corrales) {
      const v = valor(fl(p));
      const c = fl(p)?.cabezas ?? 0;
      if (v == null || !c) continue;
      cab += c;
      suma += v * c;
    }
    return cab ? suma / cab : null;
  };
  const conMetros = corrales.filter((p) => p.metrosComedero != null && p.stock?.cabezas);
  const cabMetros = conMetros.reduce((s, p) => s + p.stock.cabezas, 0);
  const conValor = corrales.filter((p) => fl(p)?.valorUsd);
  return {
    cabezas: corrales.reduce((s, p) => s + (p.stock?.cabezas ?? 0), 0),
    dias: ponderado((f) => f?.diasEncierre),
    pesoEntrada: ponderado((f) => f?.pesoEntradaKg),
    pesoHoy: ponderado((f) => f?.pesoHoyKg),
    gmd: ponderado((f) => f?.gmdKg),
    ganados: ponderado((f) => f?.kgGanadosCab),
    cm: cabMetros ? Math.round((conMetros.reduce((s, p) => s + p.metrosComedero, 0) * 100) / cabMetros) : null,
    atrasados: corrales.filter((p) => fl(p)?.atrasado).length,
    valor: conValor.length ? conValor.reduce((s, p) => s + fl(p).valorUsd, 0) : null,
  };
}

export default function CorralesLista({ potreros, todas = false }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const col = COLUMNAS.some((x) => x.c === params.get('orden')) ? params.get('orden') : 'corral';
  const f = {
    q: params.get('q') ?? '',
    etapa: params.get('etapa') ?? '',
    salida: params.get('salida') ?? '',
    categoria: params.get('categoria') ?? '',
    animales: params.get('animales') ?? '',
    apretado: params.get('apretado') === '1',
    incompletos: params.get('incompletos') === '1',
    orden: { col, dir: params.get('dir') ?? dirPorDefecto(col) },
  };
  const poner = (cambios) =>
    setParams(
      (actual) => {
        const nuevo = new URLSearchParams(actual);
        nuevo.delete('pagina');
        for (const [k, v] of Object.entries(cambios)) v ? nuevo.set(k, v) : nuevo.delete(k);
        return nuevo;
      },
      { replace: true },
    );
  const ordenarPor = (c) => {
    const porDefecto = dirPorDefecto(c);
    const dir = f.orden.col === c ? (f.orden.dir === 'asc' ? 'desc' : 'asc') : porDefecto;
    poner({ orden: c === 'corral' ? '' : c, dir: dir === porDefecto ? '' : dir });
  };
  const activosPanel = [f.etapa, f.salida, f.categoria, f.animales, f.apretado, f.incompletos].filter(Boolean).length;
  const hayFiltros = activosPanel > 0 || Boolean(f.q);
  const limpiar = () => setParams(f.q ? { q: f.q } : {}, { replace: true });

  const categorias = useMemo(() => {
    const m = new Map();
    for (const p of potreros) for (const l of p.stock?.lotes ?? []) m.set(String(l.categoriaId), l.categoria);
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [potreros]);
  // Las etapas que hay hoy, en su orden.
  const etapas = useMemo(() => {
    const hay = new Set(potreros.map((p) => fl(p)?.etapa).filter(Boolean));
    return Object.keys(NOMBRE_ETAPA).filter((e) => hay.has(e));
  }, [potreros]);

  const visibles = useMemo(() => {
    const q = sinTildes(f.q.trim());
    const lista = potreros.filter((p) => {
      const lotes = p.stock?.lotes ?? [];
      const cabezas = p.stock?.cabezas ?? 0;
      const d = fl(p);
      if (q && !sinTildes(nombreConSigla(p, todas)).includes(q) && !lotes.some((l) => sinTildes(l.lote).includes(q))) return false;
      if (f.etapa && d?.etapa !== f.etapa) return false;
      if (f.salida === 'atrasados' && !d?.atrasado) return false;
      if (f.salida === '30' && !(d && !d.atrasado && d.diasParaSalida != null && d.diasParaSalida <= 30)) return false;
      if (f.categoria && !lotes.some((l) => String(l.categoriaId) === f.categoria)) return false;
      if (f.animales === 'con' && cabezas === 0) return false;
      if (f.animales === 'vacios' && cabezas > 0) return false;
      if (f.apretado && !d?.apretado) return false;
      if (f.incompletos && !(d?.datosIncompletos || (cabezas > 0 && p.metrosComedero == null))) return false;
      return true;
    });
    return ordenarCorrales(lista, f.orden);
  }, [potreros, todas, f.q, f.etapa, f.salida, f.categoria, f.animales, f.apretado, f.incompletos, f.orden.col, f.orden.dir]);

  const t = useMemo(() => totalesCorrales(visibles), [visibles]);
  const cmObjetivo = potreros.find((p) => fl(p)?.cmObjetivo)?.feedlot.cmObjetivo ?? null;
  const pieBase = `${celda} sticky bottom-0 border-t-2 border-t-suelo-300 bg-suelo-100`;
  const pie = `${pieBase} text-right tabular-nums`;
  const num = (n, dec = 0) => (n == null ? '—' : formatNumero(n, dec));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelFiltros activos={activosPanel} onLimpiar={limpiar} compacto>
        {etapas.length > 0 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Etapa del encierre">
            {[['', 'Todas'], ...etapas.map((e) => [e, NOMBRE_ETAPA[e]])].map(([valor, texto]) => (
              <Chip key={texto} activo={f.etapa === valor} onClick={() => poner({ etapa: valor })}>
                {texto}
              </Chip>
            ))}
          </div>
        )}
        <div className="grid grid-cols-1 gap-2">
          <Select etiqueta="Salida" valor={f.salida} onChange={(v) => poner({ salida: v })} opciones={SALIDAS} />
          <Select etiqueta="Categoría" valor={f.categoria} onChange={(v) => poner({ categoria: v })} opciones={[['', 'Todas'], ...categorias]} />
          <Select etiqueta="Animales" valor={f.animales} onChange={(v) => poner({ animales: v })} opciones={ANIMALES} />
        </div>
        <label className="flex items-center gap-2 text-sm text-suelo-700">
          <input type="checkbox" checked={f.apretado} onChange={(e) => poner({ apretado: e.target.checked ? '1' : '' })} />
          Solo con el comedero apretado{cmObjetivo ? ` (menos de ${formatNumero(cmObjetivo)} cm por cabeza)` : ''}
        </label>
        <label className="flex items-center gap-2 text-sm text-suelo-700">
          <input type="checkbox" checked={f.incompletos} onChange={(e) => poner({ incompletos: e.target.checked ? '1' : '' })} />
          Solo con datos incompletos (sin fecha o peso de entrada, o sin metros de comedero)
        </label>
      </PanelFiltros>

      {visibles.length === 0 ? (
        <p className="rounded-lg border border-dashed border-suelo-300 p-6 text-center text-suelo-600">Ningún corral cumple esos filtros.</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col" data-testid="caja-potreros">
          <div className="min-h-0 overflow-auto rounded-lg border border-suelo-300 bg-superficie" data-testid="tabla-corrales">
            <table className="w-full table-fixed border-separate border-spacing-0 text-left text-sm md:min-w-[52rem] md:table-auto">
              <thead className="text-xs text-suelo-600">
                <tr>
                  {COLUMNAS.map((x, i) => (
                    <TituloOrdenable
                      key={x.c}
                      col={x.c}
                      titulo={
                        x.corto ? (
                          <>
                            <span className="hidden md:inline">{x.titulo}</span>
                            <span className="md:hidden">{x.corto}</span>
                          </>
                        ) : (
                          x.titulo
                        )
                      }
                      orden={f.orden}
                      onOrdenar={ordenarPor}
                      derecha={x.derecha}
                      fija={i === 0}
                      className={x.compu ? SOLO_COMPU : x.ancho ? `${x.ancho} md:w-auto` : ''}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibles.map((p, n) => (
                  <CorralFila key={p.id} potrero={p} todas={todas} par={n % 2 === 1} onAbrir={() => navigate(`/pecuaria/potreros/${p.id}`)} />
                ))}
              </tbody>
              <tfoot className="acostado:hidden">
                <tr className="font-semibold" data-testid="total-corrales">
                  <td className={`${pieBase} left-0 z-20`}>
                    Total{hayFiltros ? ' filtrado' : ''}
                    <span className="text-xs font-normal text-suelo-600"> · {hayFiltros ? `${visibles.length} de ${potreros.length}` : visibles.length}</span>
                  </td>
                  <td className={`${pieBase} ${SOLO_COMPU} z-10 font-normal text-suelo-600`}>{visibles.length === 1 ? 'corral' : 'corrales'}</td>
                  <td className={`${pie} z-10`}>{num(t.cabezas)}</td>
                  <td className={`${pie} z-10`}>{num(t.dias)}</td>
                  <td className={`${pie} ${SOLO_COMPU} z-10`}>{num(t.pesoEntrada)}</td>
                  <td className={`${pie} z-10`}>{t.pesoHoy == null ? '—' : `≈${formatNumero(t.pesoHoy, 0)}`}</td>
                  <td className={`${pie} ${SOLO_COMPU} z-10`}>{num(t.gmd, 2)}</td>
                  <td className={`${pie} ${SOLO_COMPU} z-10`}>{num(t.ganados)}</td>
                  <td className={`${pie} ${SOLO_COMPU} z-10 font-normal ${t.atrasados ? 'text-amber-900' : 'text-suelo-600'}`}>
                    {t.atrasados ? `${t.atrasados} ${t.atrasados === 1 ? 'atrasado' : 'atrasados'}` : ''}
                  </td>
                  <td className={`${pie} z-10`}>{num(t.cm)}</td>
                  <td className={`${pie} ${SOLO_COMPU} z-10`}>{t.valor == null ? '—' : formatUsdCorto(t.valor)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {cmObjetivo && (
            <p className="mt-1 hidden text-xs text-suelo-500 md:block">
              Peso hoy y GMD con "≈": estimados (peso de entrada o de la última pesada + días × ganancia esperada). cm/cab en ámbar: menos de {formatNumero(cmObjetivo)} cm por cabeza
              (se cambia en Configuración → Feedlot).
            </p>
          )}
        </div>
      )}
      <BarraBuscar valor={f.q} onCambiar={(q) => poner({ q })} placeholder="Buscar corral o lote…" />
    </div>
  );
}

// Una fila: tocarla abre la ficha del corral.
function CorralFila({ potrero: p, todas, par, onAbrir }) {
  const cabezas = p.stock?.cabezas ?? 0;
  const vacio = cabezas === 0;
  const d = fl(p);
  const fondo = par ? 'bg-suelo-50' : 'bg-superficie';
  const c = `${celdaFila} ${fondo}`;
  const n = `${c} whitespace-nowrap text-right tabular-nums`;
  const etapa = d && NOMBRE_ETAPA[d.etapa];
  return (
    <tr onClick={onAbrir} className={`${ALTO_FILA} cursor-pointer hover:[&>td]:bg-campo-50 ${vacio ? 'text-suelo-500' : ''}`} data-testid="fila-corral">
      <td className={`${c} sticky left-0 z-[5] font-semibold md:whitespace-nowrap`}>
        <div className="flex min-w-0 items-center gap-1.5">
          <Link to={`/pecuaria/potreros/${p.id}`} onClick={(e) => e.stopPropagation()} className="shrink-0 text-campo-700 hover:underline">
            {todas && p.campo?.sigla && <span className="mr-1 font-normal text-suelo-500">{p.campo.sigla}</span>}
            {p.nombre}
          </Link>
          {etapa && <span className={`hidden text-xs font-medium md:inline ${d.etapa === 'PARA_SALIR' ? 'text-amber-800' : 'text-suelo-500'}`}>{etapa}</span>}
        </div>
        {/* En el celular: lo que hay y la etapa, en renglones propios. */}
        <div className="mt-0.5 text-xs font-normal leading-4 text-suelo-600 md:hidden" data-testid="linea-celular">
          <span className="block truncate">{vacio ? 'vacío' : categoriasCortas(p.stock.lotes)}</span>
          {etapa && <span className={`block truncate ${d.etapa === 'PARA_SALIR' ? 'text-amber-800' : ''}`}>{etapa}</span>}
        </div>
      </td>
      <td className={`${c} ${SOLO_COMPU} min-w-[10rem]`}>
        <div className="max-w-[16rem] truncate" title={vacio ? undefined : cabezasPorCategoria(p.stock.lotes)}>
          {vacio ? <span className="text-suelo-400">vacío</span> : cabezasPorCategoria(p.stock.lotes)}
        </div>
      </td>
      <td className={`${n} font-semibold`}>{vacio ? '—' : formatNumero(cabezas)}</td>
      <td className={n} title={d?.fechaEntrada ? `Entraron el ${formatFecha(d.fechaEntrada)}` : undefined}>
        {d?.diasEncierre == null ? '—' : formatNumero(d.diasEncierre)}
        {d?.salidaProbable && <span className={`${segunda} whitespace-normal md:hidden ${colorSalida(d)}`}>{textoSalida(d)}</span>}
      </td>
      <td className={`${n} ${SOLO_COMPU}`}>{d?.pesoEntradaKg == null ? '—' : formatNumero(d.pesoEntradaKg, 0)}</td>
      <td className={n}>
        {d?.pesoHoyKg == null ? '—' : aprox(d.pesoHoyAprox, formatNumero(d.pesoHoyKg, 0))}
        {d?.gmdKg != null && <span className={`${segunda} md:hidden`}>{textoGmd(d)}</span>}
      </td>
      <td className={`${n} ${SOLO_COMPU}`} title={d?.gmdKg == null ? undefined : d.gmdReal ? 'De las pesadas' : 'La esperada (sin pesadas)'}>
        {d?.gmdKg == null ? '—' : aprox(!d.gmdReal, formatNumero(d.gmdKg, 2))}
      </td>
      <td className={`${n} ${SOLO_COMPU}`}>{d?.kgGanadosCab == null ? '—' : aprox(d.pesoHoyAprox, formatNumero(d.kgGanadosCab, 0))}</td>
      <td className={`${n} ${SOLO_COMPU}`}>
        {d?.salidaProbable ? (
          <>
            {formatDiaMes(d.salidaProbable, hoyLocal())} <span className={`text-xs ${colorSalida(d)}`}>{textoSalida(d)}</span>
          </>
        ) : (
          '—'
        )}
      </td>
      <td className={n}>
        <CmComedero d={d} />
      </td>
      <td className={`${n} ${SOLO_COMPU}`}>{d?.valorUsd ? aprox(d.valorAprox, formatUsdCorto(d.valorUsd)) : '—'}</td>
    </tr>
  );
}

// cm de comedero por cabeza, con la barra contra el objetivo: llena si alcanza;
// en ámbar si el corral está apretado.
function CmComedero({ d }) {
  if (d?.cmPorCabeza == null) return '—';
  const lleno = d.cmObjetivo > 0 ? Math.min(100, (d.cmPorCabeza / d.cmObjetivo) * 100) : 100;
  return (
    <span
      className="flex flex-col items-end gap-1.5 md:flex-row md:items-center md:justify-end"
      title={d.cmObjetivo ? `Objetivo: ${formatNumero(d.cmObjetivo)} cm por cabeza` : undefined}
    >
      <span className={d.apretado ? 'font-semibold text-amber-800' : ''}>{formatNumero(d.cmPorCabeza)}</span>
      <span className="block h-1.5 w-full max-w-12 overflow-hidden rounded-full bg-suelo-200/70 md:w-10" aria-hidden="true" data-testid="barra-comedero">
        <span className={`block h-full rounded-full ${d.apretado ? 'bg-amber-500' : 'bg-campo-500'}`} style={{ width: `${lleno}%` }} />
      </span>
    </span>
  );
}
