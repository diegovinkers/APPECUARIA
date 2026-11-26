import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { UsoBadge, aprox, cabezasPorCategoria, formatDiaMes, formatNumero, nombreConSigla } from './pecuaria';
import { PastoMarca } from './PastoSelector';
import { diasCortos, ordenDescanso, ordenPasto } from './pasto';
import { porEstanciaYPlanilla } from '../hooks/usePotreros';
import { TituloOrdenable, celda } from './tabla';
import PanelFiltros, { DestinoBotonFiltros } from './PanelFiltros';
import Icono from './Icono';

const ordenNatural = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
const sinTildes = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const GRUPOS = [
  ['', 'Todos'],
  ['CN', 'CN'],
  ['VERDEO', 'Verdeos'],
  ['CORRAL', 'Corral'],
  ['OTRO', 'Otros'],
];
const ANIMALES = [
  ['', 'Todos'],
  ['con', 'Con animales'],
  ['vacios', 'Vacíos'],
];
// El último pasto anotado (26/11).
const PASTOS = [
  ['', 'Todos'],
  ['BAJO', 'Bajo'],
  ['MEDIO', 'Medio'],
  ['ALTO', 'Alto'],
  ['sin', 'Sin dato'],
];
const hoyISO = () => new Date().toLocaleDateString('sv-SE');

// Columnas de la tabla: [clave, título, derecha, valor para ordenar, solo en la compu].
// Las de números se ordenan primero de mayor a menor. En el celular la tabla
// tiene que entrar sin scroll de costado: las "solo en la compu" se esconden y
// su dato va como segunda línea, chica, debajo del nombre del potrero.
const COLUMNAS = [
  ['potrero', 'Potrero', false, null, false],
  ['uso', 'Uso', false, (p) => p.usoActual?.nombre ?? null, true],
  ['hectareas', 'ha', true, (p) => (p.hectareasAConfirmar ? null : p.hectareas), false],
  ['cabezas', 'Cabezas', true, (p) => p.stock?.cabezas ?? 0, false],
  ['categorias', 'Categorías', false, (p) => (p.stock?.cabezas ? cabezasPorCategoria(p.stock.lotes) : null), true],
  // Pasto (26/11): el último anotado y los días de descanso (o con ganado). En
  // el celular, el pasto va como una marca en el renglón del uso y el descanso
  // en la celda de cabezas de un potrero vacío.
  ['pasto', 'Pasto', false, (p) => ordenPasto(p.pasto), true],
  ['descanso', 'Descanso', true, (p) => ordenDescanso(p.descanso), true],
  ['peso', 'Peso prom.', true, (p) => pesoPromedio(p), false],
  ['kgHa', 'kg/ha', true, (p) => (p.stock?.kilosCompletos && p.stock?.cabezas ? (p.stock.kgPvHa ?? null) : null), false],
  // cab/ha va al final, con la barra de carga (reemplazó a UG/ha: pedido de Diego, 24/11).
  ['cabHa', 'cab/ha', true, (p) => (p.stock?.cabezas ? (p.stock.cabHa ?? null) : null), false],
];
// En el celular, títulos cortos para que entren.
const TITULO_CORTO = { cabezas: 'Cab.', peso: 'Peso' };
const SOLO_COMPU = 'hidden md:table-cell';
// Las filas, todas del mismo alto y con todo centrado (pedido de Diego, 19/11):
// en el celular tres líneas (nombre, uso y qué hay; lo que no entra se corta
// con "…"), en la compu una.
const celdaFila = celda.replace('align-top', 'align-middle');
const ALTO_FILA = 'h-[4.5rem] md:h-10';
// En el celular la tabla tiene ancho fijo: Cabezas y cab/ha con su ancho, y
// Potrero lo que queda (así el "…" corta adentro de la celda).
const ANCHO_CELULAR = {
  hectareas: 'w-11 md:w-auto',
  cabezas: 'w-[3.25rem] md:w-auto',
  peso: 'w-11 md:w-auto',
  kgHa: 'w-12 md:w-auto',
  cabHa: 'w-[3.25rem] md:w-auto',
};
const NUMERICAS = new Set(['hectareas', 'cabezas', 'peso', 'kgHa', 'cabHa', 'descanso']);
// Las direcciones viejas (?orden=carga, ?orden=ugHa) siguen andando.
const ALIAS_ORDEN = { nombre: 'potrero', carga: 'cabHa', ugHa: 'cabHa' };

// Lo que hay en el potrero, para la línea de abajo del celular: con una sola
// categoría, el nombre (el número ya está en Cabezas); con varias, cuántas de
// cada una.
export function categoriasCortas(lotes = []) {
  const categorias = new Set(lotes.filter((l) => l.cabezas > 0).map((l) => l.categoria));
  if (categorias.size === 0) return '';
  if (categorias.size === 1) return [...categorias][0];
  return cabezasPorCategoria(lotes);
}

// Peso promedio del potrero (kilos ÷ cabezas). Si a algún lote le falta el
// peso, no hay promedio.
export const pesoPromedio = (p) => (p.stock?.cabezas && p.stock.kilosCompletos && p.stock.kilos != null ? p.stock.kilos / p.stock.cabezas : null);

// Un corral (feedlot) sin uso de suelo cargado se muestra como "Corral".
const usoDe = (p) => p.usoActual ?? (p.tipo === 'CORRAL' ? { nombre: 'Corral', grupo: 'CORRAL' } : null);
const grupoDe = (p) => (p.tipo === 'CORRAL' ? 'CORRAL' : (p.usoActual?.grupo ?? 'OTRO'));
const incompleto = (p) => p.hectareasAConfirmar || (p.stock && !p.stock.kilosCompletos);

// Ordena los potreros por una columna. "Potrero" sigue el orden de la planilla
// (con "Todas las estancias", primero por estancia); en las demás, a igualdad,
// por nombre. Los que no tienen el dato van siempre al final.
export function ordenarPotreros(lista, { col, dir }) {
  const porNombre = porEstanciaYPlanilla;
  const signo = dir === 'asc' ? 1 : -1;
  const valor = COLUMNAS.find(([c]) => c === col)?.[3];
  if (!valor) return [...lista].sort((a, b) => porNombre(a, b) * signo);
  return [...lista].sort((a, b) => {
    const x = valor(a);
    const y = valor(b);
    if (x == null || y == null) return (x == null) - (y == null) || porNombre(a, b);
    const c = typeof x === 'number' ? x - y : ordenNatural.compare(x, y);
    return c * signo || porNombre(a, b);
  });
}

// Lista de potreros como una tabla tipo Excel (pedido de Diego, 19/11), con
// filtros, totales abajo y todos los potreros juntos (sin paginado: pedido de
// Diego, 24/11; se baja con el dedo). Los filtros y el orden viven en la
// dirección (?grupo=VERDEO&orden=cabezas): al volver de
// un potrero siguen puestos. todas: "Todas las estancias" elegido arriba (cada
// potrero con la sigla de su estancia).
export default function PotrerosLista({ potreros, todas = false }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const ordenUrl = params.get('orden') ?? 'potrero';
  const col = ALIAS_ORDEN[ordenUrl] ?? ordenUrl;
  const f = {
    q: params.get('q') ?? '',
    grupo: params.get('grupo') ?? '',
    uso: params.get('uso') ?? '',
    animales: params.get('animales') ?? '',
    categoria: params.get('categoria') ?? '',
    pasto: params.get('pasto') ?? '',
    incompletos: params.get('incompletos') === '1',
    orden: { col, dir: params.get('dir') ?? (NUMERICAS.has(col) ? 'desc' : 'asc') },
  };
  const poner = (cambios) =>
    setParams(
      (actual) => {
        const nuevo = new URLSearchParams(actual);
        // ?pagina= de cuando había paginado: ya no se usa.
        nuevo.delete('pagina');
        for (const [k, v] of Object.entries(cambios)) v ? nuevo.set(k, v) : nuevo.delete(k);
        return nuevo;
      },
      { replace: true },
    );
  const ordenarPor = (c) => {
    const porDefecto = NUMERICAS.has(c) ? 'desc' : 'asc';
    const dir = f.orden.col === c ? (f.orden.dir === 'asc' ? 'desc' : 'asc') : porDefecto;
    poner({ orden: c === 'potrero' ? '' : c, dir: dir === porDefecto ? '' : dir });
  };
  // Al cambiar de grupo, el uso elegido sigue solo si es de ese grupo.
  const usoDelGrupo = (grupo) =>
    f.uso && (!grupo || potreros.some((p) => p.usoActual?.nombre === f.uso && grupoDe(p) === grupo)) ? f.uso : '';
  const activos = [f.q, f.grupo, f.uso, f.animales, f.categoria, f.pasto, f.incompletos].filter(Boolean).length;
  const hayFiltros = activos > 0;
  // El buscador está a la vista (arriba de la tabla): el número del botón
  // Filtros y "Limpiar filtros" son solo los del panel (la búsqueda queda).
  const activosPanel = activos - (f.q ? 1 : 0);
  const limpiar = () => setParams(f.q ? { q: f.q } : {}, { replace: true });

  // Las categorías que hay hoy en el campo, para el filtro.
  const categorias = useMemo(() => {
    const m = new Map();
    for (const p of potreros) for (const l of p.stock?.lotes ?? []) m.set(String(l.categoriaId), l.categoria);
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [potreros]);

  // Los usos de suelo que hay hoy (Sorgo, Raigrás, Avena…), para el filtro.
  // Con un grupo elegido, solo los de ese grupo.
  const usos = useMemo(() => {
    const nombres = new Set(potreros.filter((p) => p.usoActual?.nombre && (!f.grupo || grupoDe(p) === f.grupo)).map((p) => p.usoActual.nombre));
    return [...nombres].sort(ordenNatural.compare).map((n) => [n, n]);
  }, [potreros, f.grupo]);

  const visibles = useMemo(() => {
    const q = sinTildes(f.q.trim());
    const lista = potreros.filter((p) => {
      const lotes = p.stock?.lotes ?? [];
      const cabezas = p.stock?.cabezas ?? 0;
      if (q && !sinTildes(nombreConSigla(p, todas)).includes(q) && !lotes.some((l) => sinTildes(l.lote).includes(q))) return false;
      if (f.grupo && grupoDe(p) !== f.grupo) return false;
      if (f.uso && p.usoActual?.nombre !== f.uso) return false;
      if (f.animales === 'con' && cabezas === 0) return false;
      if (f.animales === 'vacios' && cabezas > 0) return false;
      if (f.categoria && !lotes.some((l) => String(l.categoriaId) === f.categoria)) return false;
      if (f.pasto === 'sin' && p.pasto) return false;
      if (f.pasto && f.pasto !== 'sin' && p.pasto?.altura !== f.pasto) return false;
      if (f.incompletos && !incompleto(p)) return false;
      return true;
    });
    return ordenarPotreros(lista, f.orden);
  }, [potreros, todas, f.q, f.grupo, f.uso, f.animales, f.categoria, f.pasto, f.incompletos, f.orden.col, f.orden.dir]);

  // Lo que suma lo filtrado. Con una categoría elegida, cuenta solo esa.
  const resumen = useMemo(() => {
    const deCategoria = (p) =>
      (p.stock?.lotes ?? []).filter((l) => !f.categoria || String(l.categoriaId) === f.categoria).reduce((s, l) => s + l.cabezas, 0);
    const cabezas = visibles.reduce((s, p) => s + deCategoria(p), 0);
    const hectareas = visibles.reduce((s, p) => s + (p.hectareasAConfirmar ? 0 : (p.hectareas ?? 0)), 0);
    // La carga usa el área utilizable de cada potrero (si no tiene, sus hectáreas).
    const haCarga = visibles.reduce((s, p) => s + (p.areaUtilizable ?? (p.hectareasAConfirmar ? 0 : (p.hectareas ?? 0))), 0);
    // Peso promedio de lo filtrado: solo los lotes que tienen peso.
    let conPeso = 0;
    let kilos = 0;
    for (const p of visibles)
      for (const l of p.stock?.lotes ?? [])
        if (l.pesoPromedioKg && (!f.categoria || String(l.categoriaId) === f.categoria)) {
          conPeso += l.cabezas;
          kilos += l.cabezas * l.pesoPromedioKg;
        }
    return { cabezas, hectareas, cabHa: haCarga > 0 ? cabezas / haCarga : null, peso: conPeso ? kilos / conPeso : null };
  }, [visibles, f.categoria]);
  const nombreCategoria = categorias.find(([id]) => id === f.categoria)?.[1];
  // La barra de carga (cab/ha) se llena según el potrero más cargado de la estancia.
  const cargaMaxima = useMemo(
    () => Math.max(0, ...potreros.filter((p) => p.stock?.cabezas && p.stock?.cabHa != null).map((p) => p.stock.cabHa)),
    [potreros],
  );
  const pie = `${celda} sticky bottom-0 border-t-2 border-t-suelo-300 bg-suelo-100`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelFiltros activos={activosPanel} onLimpiar={limpiar} compacto>
        {/* Los grupos bajan de renglón si no entran (nada de scroll de costado). */}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Grupo de uso de suelo">
          {GRUPOS.map(([valor, texto]) => (
            <Chip key={texto} activo={f.grupo === valor} onClick={() => poner({ grupo: valor, uso: usoDelGrupo(valor) })}>
              {texto}
            </Chip>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-2">
          <Select etiqueta="Uso" valor={f.uso} onChange={(v) => poner({ uso: v })} opciones={[['', 'Todos'], ...usos]} />
          <Select etiqueta="Categoría" valor={f.categoria} onChange={(v) => poner({ categoria: v })} opciones={[['', 'Todas'], ...categorias]} />
          <Select etiqueta="Animales" valor={f.animales} onChange={(v) => poner({ animales: v })} opciones={ANIMALES} />
          <Select etiqueta="Pasto (el último anotado)" valor={f.pasto} onChange={(v) => poner({ pasto: v })} opciones={PASTOS} />
        </div>
        <label className="flex items-center gap-2 text-sm text-suelo-700">
          <input type="checkbox" checked={f.incompletos} onChange={(e) => poner({ incompletos: e.target.checked ? '1' : '' })} />
          Solo con datos incompletos (sin hectáreas o sin peso)
        </label>
      </PanelFiltros>

      {visibles.length === 0 ? (
        <p className="rounded-lg border border-dashed border-suelo-300 p-6 text-center text-suelo-600">Ningún potrero cumple esos filtros.</p>
      ) : (
        // La caja ocupa el alto libre; la tabla scrollea adentro (títulos y Total fijos).
        <div className="flex min-h-0 flex-1 flex-col" data-testid="caja-potreros">
          <div className="min-h-0 overflow-auto rounded-lg border border-suelo-300 bg-superficie" data-testid="tabla-potreros">
            <table className="w-full table-fixed border-separate border-spacing-0 text-left text-sm md:min-w-[44rem] md:table-auto">
              <thead className="text-xs text-suelo-600">
                <tr>
                  {COLUMNAS.map(([c, titulo, derecha, , soloCompu], i) => (
                    <TituloOrdenable
                      key={c}
                      col={c}
                      titulo={
                        TITULO_CORTO[c] ? (
                          <>
                            <span className="hidden md:inline">{titulo}</span>
                            <span className="md:hidden">{TITULO_CORTO[c]}</span>
                          </>
                        ) : (
                          titulo
                        )
                      }
                      orden={f.orden}
                      onOrdenar={ordenarPor}
                      derecha={derecha}
                      fija={i === 0}
                      className={soloCompu ? SOLO_COMPU : (ANCHO_CELULAR[c] ?? '')}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibles.map((p, n) => (
                  <PotreroFila key={p.id} potrero={p} todas={todas} par={n % 2 === 1} cargaMaxima={cargaMaxima} onAbrir={() => navigate(`/pecuaria/potreros/${p.id}`)} />
                ))}
              </tbody>
              {/* Acostado, sin el Total: más lugar para los potreros. */}
              <tfoot className="acostado:hidden">
                <tr className="font-semibold">
                  <td className={`${pie} left-0 z-20`}>
                    Total{hayFiltros ? ' filtrado' : ''}
                    <span className="text-xs font-normal text-suelo-600 md:hidden">
                      {' · '}
                      {hayFiltros ? `${visibles.length} de ${potreros.length}` : visibles.length}
                      {nombreCategoria && ` · ${nombreCategoria}`}
                    </span>
                  </td>
                  <td className={`${pie} ${SOLO_COMPU} z-10 whitespace-nowrap font-normal text-suelo-600`}>{visibles.length} de {potreros.length} potreros</td>
                  <td className={`${pie} z-10 text-right tabular-nums`}>{formatNumero(resumen.hectareas)}</td>
                  <td className={`${pie} z-10 text-right tabular-nums`}>{formatNumero(resumen.cabezas)}</td>
                  <td className={`${pie} ${SOLO_COMPU} z-10 font-normal text-suelo-600`}>{nombreCategoria ?? 'cabezas'}</td>
                  <td className={`${pie} ${SOLO_COMPU} z-10`} />
                  <td className={`${pie} ${SOLO_COMPU} z-10`} />
                  <td className={`${pie} z-10 text-right tabular-nums`}>{resumen.peso == null ? '—' : formatNumero(resumen.peso, 0)}</td>
                  <td className={`${pie} z-10`} />
                  <td className={`${pie} z-10 text-right tabular-nums`}>{resumen.cabHa == null ? '—' : formatNumero(resumen.cabHa, 2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
      <BarraBuscar valor={f.q} onCambiar={(q) => poner({ q })} placeholder="Buscar potrero o lote…" />
    </div>
  );
}

// Abajo de la tabla, cerca del pulgar (pedido de Diego, 24/11): el buscador
// ocupa el ancho y el botón Filtros va a la derecha. Con pocas filas (o
// ninguna) queda igual abajo de todo (mt-auto). En la compu el panel está fijo
// a la izquierda y el botón no aparece. También la usa la tabla de Corrales.
export function BarraBuscar({ valor, onCambiar, placeholder }) {
  return (
    <div className="mt-auto flex shrink-0 items-center gap-2 pt-2 acostado:hidden" data-testid="barra-potreros">
      <div className="relative min-w-0 flex-1">
        <Icono nombre="buscar" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-suelo-400" />
        <input
          type="text"
          inputMode="search"
          enterKeyHint="search"
          value={valor}
          onChange={(e) => onCambiar(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder.replace('…', '')}
          className="block w-full rounded-md border border-suelo-300 bg-superficie py-1.5 pl-8 pr-8 text-sm text-suelo-900 placeholder-suelo-400 outline-none focus:border-campo-500 focus:ring-2 focus:ring-campo-500/40"
        />
        {valor && (
          <button
            type="button"
            onClick={() => onCambiar('')}
            aria-label="Borrar la búsqueda"
            className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-suelo-500 hover:bg-suelo-100 hover:text-suelo-800"
          >
            <Icono nombre="cerrar" className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <DestinoBotonFiltros />
    </div>
  );
}

export function Chip({ activo, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`shrink-0 rounded-full px-3 py-1 text-sm ${activo ? 'bg-boton text-white' : 'bg-suelo-200/70 text-suelo-700 hover:bg-suelo-300/60'}`}
    >
      {children}
    </button>
  );
}

export function Select({ etiqueta, valor, onChange, opciones }) {
  return (
    <label className="block min-w-0 text-xs text-suelo-500">
      {etiqueta}
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 block w-full min-w-0 rounded-md border border-suelo-300 bg-superficie px-2 py-2 text-sm text-suelo-800"
      >
        {opciones.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </label>
  );
}

// Una fila: tocarla abre la ficha del potrero.
function PotreroFila({ potrero: p, todas, par, cargaMaxima, onAbrir }) {
  const cabezas = p.stock?.cabezas ?? 0;
  const vacio = cabezas === 0;
  const fondo = par ? 'bg-suelo-50' : 'bg-superficie';
  const sinPeso = p.stock && cabezas > 0 && !p.stock.kilosCompletos;
  const celda = celdaFila;
  return (
    <tr onClick={onAbrir} className={`${ALTO_FILA} cursor-pointer hover:[&>td]:bg-campo-50 ${vacio ? 'text-suelo-500' : ''}`}>
      <td className={`${celda} ${fondo} sticky left-0 z-[5] font-semibold md:whitespace-nowrap`}>
        {/* Arriba el nombre; abajo, en el celular, el uso y qué hay. Lo que no entra se corta con "…". */}
        <div className="flex min-w-0 items-center gap-1.5">
          <Link to={`/pecuaria/potreros/${p.id}`} onClick={(e) => e.stopPropagation()} className="shrink-0 text-campo-700 hover:underline">
            {todas && p.campo?.sigla && <span className="mr-1 font-normal text-suelo-500">{p.campo.sigla}</span>}
            {p.nombre}
          </Link>
          {p.tipo === 'CORRAL' && <span className="shrink-0 text-xs font-medium text-amber-800">corral</span>}
        </div>
        {/* Debajo, en renglones propios: el uso y lo que hay (pedido de Diego, 19/11). */}
        <div className="mt-0.5 text-xs font-normal leading-4 text-suelo-600 md:hidden" data-testid="linea-celular">
          <div className="flex min-w-0 items-center gap-1">
            <UsoBadge uso={usoDe(p)} chico />
            {p.pasto && <PastoMarca valor={p.pasto.altura} corta />}
          </div>
          <span className="mt-0.5 block truncate">{vacio ? (p.usoActual?.grupo === 'OTRO' ? '' : 'vacío') : categoriasCortas(p.stock.lotes)}</span>
        </div>
      </td>
      <td className={`${celda} ${fondo} ${SOLO_COMPU} whitespace-nowrap`}>
        <UsoBadge uso={usoDe(p)} />
      </td>
      {/* Hectáreas, también en el celular (pedido de Diego, 24/11): ahí sin decimales. */}
      <td className={`${celda} ${fondo} whitespace-nowrap text-right tabular-nums`} data-testid="celda-ha">
        {p.hectareasAConfirmar ? (
          <span className="text-xs text-amber-800">
            <span className="hidden md:inline">a confirmar</span>
            <span className="md:hidden">?</span>
          </span>
        ) : p.areaUtilizable != null ? (
          // Con área utilizable: "40 de 50" (la carga se calcula sobre 40). En el celular, "de 50" abajo.
          <span title="Área utilizable de las hectáreas del potrero">
            <Ha valor={p.areaUtilizable} />{' '}
            <span className="block text-xs text-suelo-500 md:inline">
              de <Ha valor={p.hectareas} />
            </span>
          </span>
        ) : (
          <Ha valor={p.hectareas} />
        )}
      </td>
      <td className={`${celda} ${fondo} whitespace-nowrap text-right font-semibold tabular-nums`}>
        {!vacio ? (
          formatNumero(cabezas)
        ) : p.llevaPasto !== false && p.descanso && !p.descanso.conGanado ? (
          // Vacío: en el celular, cuánto hace que descansa (en la compu va en su columna).
          <>
            <span className="hidden md:inline">—</span>
            <span className="block text-xs font-normal leading-4 text-campo-700 md:hidden" title="Días de descanso" data-testid="descanso-celular">
              desc.
              <br />
              {diasCortos(p.descanso)}
            </span>
          </>
        ) : (
          '—'
        )}
      </td>
      <td className={`${celda} ${fondo} ${SOLO_COMPU} min-w-[10rem]`}>
        <div className="max-w-[16rem] truncate" title={vacio ? undefined : cabezasPorCategoria(p.stock.lotes)}>
          {vacio ? <span className="text-suelo-400">vacío</span> : cabezasPorCategoria(p.stock.lotes)}
        </div>
      </td>
      <td className={`${celda} ${fondo} ${SOLO_COMPU} whitespace-nowrap`} data-testid="celda-pasto">
        {p.pasto ? (
          // La fecha, al pasar el mouse; a la vista solo en pantallas anchas (si no, la tabla no entra).
          <span className="flex items-center gap-1.5" title={`Anotado el ${formatDiaMes(p.pasto.fecha, hoyISO())}`}>
            <PastoMarca valor={p.pasto.altura} title={`Pasto ${p.pasto.altura.toLowerCase()}, anotado el ${formatDiaMes(p.pasto.fecha, hoyISO())}`} />
            <span className="hidden text-xs text-suelo-500 2xl:inline">{formatDiaMes(p.pasto.fecha, hoyISO())}</span>
          </span>
        ) : (
          <span className="text-suelo-400">—</span>
        )}
      </td>
      <td className={`${celda} ${fondo} ${SOLO_COMPU} whitespace-nowrap text-right text-xs`} data-testid="celda-descanso">
        {/* Corto, para que la tabla entre sin scroll de costado: vacío, los días
            de descanso en verde; con ganado, "en uso" y los días. */}
        {!p.descanso || p.llevaPasto === false ? (
          <span className="text-suelo-400">—</span>
        ) : p.descanso.conGanado ? (
          <span className="text-suelo-500" title="Días con ganado">en uso {diasCortos(p.descanso)}</span>
        ) : (
          <span className="font-medium text-campo-700" title="Días de descanso">{diasCortos(p.descanso)}</span>
        )}
      </td>
      <td className={`${celda} ${fondo} whitespace-nowrap text-right tabular-nums`}>
        {pesoPromedio(p) == null ? '—' : aprox(p.stock.kilosEstimados, formatNumero(pesoPromedio(p), 0))}
      </td>
      <td className={`${celda} ${fondo} whitespace-nowrap text-right tabular-nums`}>
        {vacio || sinPeso || p.stock?.kgPvHa == null ? '—' : aprox(p.stock.kilosEstimados, formatNumero(p.stock.kgPvHa, 0))}
      </td>
      <td className={`${celda} ${fondo} text-right tabular-nums`}>
        {/* En el celular el número y debajo la barra de carga; en la compu, al lado. */}
        <span className="flex flex-col items-end gap-1.5 md:flex-row md:items-center md:justify-end">
          {vacio || p.stock?.cabHa == null ? '—' : formatNumero(p.stock.cabHa, 2)}
          {!vacio && p.stock?.cabHa != null && cargaMaxima > 0 && (
            <span className="block h-1.5 w-full max-w-12 overflow-hidden rounded-full bg-suelo-200/70 md:w-10" aria-hidden="true" data-testid="barra-carga">
              <span className="block h-full rounded-full bg-campo-500" style={{ width: `${Math.min(100, (p.stock.cabHa / cargaMaxima) * 100)}%` }} />
            </span>
          )}
        </span>
      </td>
    </tr>
  );
}

// Hectáreas: con dos decimales en la compu y sin decimales en el celular.
function Ha({ valor }) {
  return (
    <>
      <span className="hidden md:inline">{formatNumero(valor, 2)}</span>
      <span className="md:hidden">{formatNumero(valor, 0)}</span>
    </>
  );
}
