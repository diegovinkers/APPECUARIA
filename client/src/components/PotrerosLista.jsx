import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { UsoBadge, cabezasPorCategoria, formatNumero } from './pecuaria';
import { Paginador, TituloOrdenable, celda, paginar } from './tabla';
import PanelFiltros from './PanelFiltros';

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

// Columnas de la tabla: [clave, título, derecha, valor para ordenar, solo en la compu].
// Las de números se ordenan primero de mayor a menor. En el celular la tabla
// tiene que entrar sin scroll de costado: las "solo en la compu" se esconden y
// su dato va como segunda línea, chica, debajo del nombre del potrero.
const COLUMNAS = [
  ['potrero', 'Potrero', false, null, false],
  ['uso', 'Uso', false, (p) => p.usoActual?.nombre ?? null, true],
  ['hectareas', 'ha', true, (p) => (p.hectareasAConfirmar ? null : p.hectareas), true],
  ['cabezas', 'Cabezas', true, (p) => p.stock?.cabezas ?? 0, false],
  ['categorias', 'Categorías', false, (p) => (p.stock?.cabezas ? cabezasPorCategoria(p.stock.lotes) : null), true],
  ['cabHa', 'cab/ha', true, (p) => p.stock?.cabHa ?? null, true],
  ['ugHa', 'UG/ha', true, (p) => p.stock?.ugHa ?? null, false],
];
const SOLO_COMPU = 'hidden md:table-cell';
const NUMERICAS = new Set(['hectareas', 'cabezas', 'cabHa', 'ugHa']);
// Las direcciones viejas (?orden=carga) siguen andando.
const ALIAS_ORDEN = { nombre: 'potrero', carga: 'ugHa' };

const grupoDe = (p) => (p.tipo === 'CORRAL' ? 'CORRAL' : (p.usoActual?.grupo ?? 'OTRO'));
const incompleto = (p) => p.hectareasAConfirmar || (p.stock && !p.stock.kilosCompletos);

// Ordena los potreros por una columna. "Potrero" sigue el orden de la planilla
// (y el nombre); en las demás, a igualdad, por nombre. Los que no tienen el
// dato van siempre al final.
export function ordenarPotreros(lista, { col, dir }) {
  const porNombre = (a, b) => a.orden - b.orden || ordenNatural.compare(a.nombre, b.nombre);
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
// filtros arriba, totales abajo y paginador. Los filtros, el orden y la página
// viven en la dirección (?grupo=VERDEO&orden=cabezas&pagina=2): al volver de
// un potrero siguen puestos.
export default function PotrerosLista({ potreros }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const ordenUrl = params.get('orden') ?? 'potrero';
  const col = ALIAS_ORDEN[ordenUrl] ?? ordenUrl;
  const f = {
    q: params.get('q') ?? '',
    grupo: params.get('grupo') ?? '',
    animales: params.get('animales') ?? '',
    categoria: params.get('categoria') ?? '',
    incompletos: params.get('incompletos') === '1',
    orden: { col, dir: params.get('dir') ?? (NUMERICAS.has(col) ? 'desc' : 'asc') },
    pagina: Number(params.get('pagina')) || 1,
  };
  // Cambiar un filtro o el orden vuelve a la página 1.
  const poner = (cambios) =>
    setParams(
      (actual) => {
        const nuevo = new URLSearchParams(actual);
        if (!('pagina' in cambios)) nuevo.delete('pagina');
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
  const activos = [f.q, f.grupo, f.animales, f.categoria, f.incompletos].filter(Boolean).length;
  const hayFiltros = activos > 0;
  const limpiar = () => setParams({}, { replace: true });

  // Las categorías que hay hoy en el campo, para el filtro.
  const categorias = useMemo(() => {
    const m = new Map();
    for (const p of potreros) for (const l of p.stock?.lotes ?? []) m.set(String(l.categoriaId), l.categoria);
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [potreros]);

  const visibles = useMemo(() => {
    const q = sinTildes(f.q.trim());
    const lista = potreros.filter((p) => {
      const lotes = p.stock?.lotes ?? [];
      const cabezas = p.stock?.cabezas ?? 0;
      if (q && !sinTildes(p.nombre).includes(q) && !lotes.some((l) => sinTildes(l.lote).includes(q))) return false;
      if (f.grupo && grupoDe(p) !== f.grupo) return false;
      if (f.animales === 'con' && cabezas === 0) return false;
      if (f.animales === 'vacios' && cabezas > 0) return false;
      if (f.categoria && !lotes.some((l) => String(l.categoriaId) === f.categoria)) return false;
      if (f.incompletos && !incompleto(p)) return false;
      return true;
    });
    return ordenarPotreros(lista, f.orden);
  }, [potreros, f.q, f.grupo, f.animales, f.categoria, f.incompletos, f.orden.col, f.orden.dir]);

  // Lo que suma lo filtrado. Con una categoría elegida, cuenta solo esa.
  const resumen = useMemo(() => {
    const deCategoria = (p) =>
      (p.stock?.lotes ?? []).filter((l) => !f.categoria || String(l.categoriaId) === f.categoria).reduce((s, l) => s + l.cabezas, 0);
    const cabezas = visibles.reduce((s, p) => s + deCategoria(p), 0);
    const hectareas = visibles.reduce((s, p) => s + (p.hectareasAConfirmar ? 0 : (p.hectareas ?? 0)), 0);
    return { cabezas, hectareas, cabHa: hectareas > 0 ? cabezas / hectareas : null };
  }, [visibles, f.categoria]);
  const nombreCategoria = categorias.find(([id]) => id === f.categoria)?.[1];
  const pagina = paginar(visibles, f.pagina);
  const pie = `${celda} sticky bottom-0 border-t-2 border-t-suelo-300 bg-suelo-100`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelFiltros activos={activos} onLimpiar={limpiar}>
        <input
          type="search"
          value={f.q}
          onChange={(e) => poner({ q: e.target.value })}
          placeholder="Buscar potrero o lote…"
          aria-label="Buscar potrero o lote"
          className="w-full rounded-md border border-suelo-300 bg-white px-3 py-2 text-sm text-suelo-900 placeholder-suelo-400 outline-none focus:ring-2 focus:ring-campo-500"
        />
        {/* Los grupos bajan de renglón si no entran (nada de scroll de costado). */}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Grupo de uso de suelo">
          {GRUPOS.map(([valor, texto]) => (
            <Chip key={texto} activo={f.grupo === valor} onClick={() => poner({ grupo: valor })}>
              {texto}
            </Chip>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-2">
          <Select etiqueta="Categoría" valor={f.categoria} onChange={(v) => poner({ categoria: v })} opciones={[['', 'Todas'], ...categorias]} />
          <Select etiqueta="Animales" valor={f.animales} onChange={(v) => poner({ animales: v })} opciones={ANIMALES} />
        </div>
        <label className="flex items-center gap-2 text-sm text-suelo-700">
          <input type="checkbox" checked={f.incompletos} onChange={(e) => poner({ incompletos: e.target.checked ? '1' : '' })} />
          Solo con datos incompletos (sin hectáreas o sin peso)
        </label>
      </PanelFiltros>

      {visibles.length === 0 ? (
        <p className="rounded-lg border border-dashed border-suelo-300 p-6 text-center text-suelo-600">Ningún potrero cumple esos filtros.</p>
      ) : (
        <>
          {/* Se achica para que entre en la pantalla; lo que no entra, scrollea adentro. */}
          <div className="min-h-0 overflow-auto rounded-lg border border-suelo-300 bg-white" data-testid="tabla-potreros">
            <table className="w-full border-separate md:min-w-[44rem] border-spacing-0 text-left text-sm">
              <thead className="text-xs text-suelo-600">
                <tr>
                  {COLUMNAS.map(([c, titulo, derecha, , soloCompu], i) => (
                    <TituloOrdenable
                      key={c}
                      col={c}
                      titulo={titulo}
                      orden={f.orden}
                      onOrdenar={ordenarPor}
                      derecha={derecha}
                      fija={i === 0}
                      className={soloCompu ? SOLO_COMPU : ''}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagina.filas.map((p, n) => (
                  <PotreroFila key={p.id} potrero={p} par={n % 2 === 1} onAbrir={() => navigate(`/pecuaria/potreros/${p.id}`)} />
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className={`${pie} left-0 z-20`}>
                    Total{hayFiltros ? ' filtrado' : ''}
                    <span className="block text-xs font-normal text-suelo-600 md:hidden">
                      {visibles.length} de {potreros.length} potreros · {formatNumero(resumen.hectareas)} ha
                      {nombreCategoria && ` · con ${nombreCategoria}`}
                    </span>
                  </td>
                  <td className={`${pie} ${SOLO_COMPU} z-10 whitespace-nowrap font-normal text-suelo-600`}>{visibles.length} de {potreros.length} potreros</td>
                  <td className={`${pie} ${SOLO_COMPU} z-10 text-right tabular-nums`}>{formatNumero(resumen.hectareas)}</td>
                  <td className={`${pie} z-10 text-right tabular-nums`}>{formatNumero(resumen.cabezas)}</td>
                  <td className={`${pie} ${SOLO_COMPU} z-10 font-normal text-suelo-600`}>{nombreCategoria ?? 'cabezas'}</td>
                  <td className={`${pie} ${SOLO_COMPU} z-10 text-right tabular-nums`}>{resumen.cabHa == null ? '—' : formatNumero(resumen.cabHa, 2)}</td>
                  <td className={`${pie} z-10`} />
                </tr>
              </tfoot>
            </table>
          </div>
          <Paginador {...pagina} de={visibles.length} onCambiar={(n) => poner({ pagina: n > 1 ? String(n) : '' })} />
        </>
      )}
    </div>
  );
}

function Chip({ activo, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`shrink-0 rounded-full px-3 py-1 text-sm ${activo ? 'bg-campo-600 text-white' : 'bg-suelo-200/70 text-suelo-700 hover:bg-suelo-300/60'}`}
    >
      {children}
    </button>
  );
}

function Select({ etiqueta, valor, onChange, opciones }) {
  return (
    <label className="block min-w-0 text-xs text-suelo-500">
      {etiqueta}
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 block w-full min-w-0 rounded-md border border-suelo-300 bg-white px-2 py-2 text-sm text-suelo-800"
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
function PotreroFila({ potrero: p, par, onAbrir }) {
  const cabezas = p.stock?.cabezas ?? 0;
  const vacio = cabezas === 0;
  const fondo = par ? 'bg-suelo-50' : 'bg-white';
  const sinPeso = p.stock && cabezas > 0 && !p.stock.kilosCompletos;
  return (
    <tr onClick={onAbrir} className={`cursor-pointer hover:[&>td]:bg-campo-50 ${vacio ? 'text-suelo-500' : ''}`}>
      <td className={`${celda} ${fondo} sticky left-0 z-[5] font-semibold md:whitespace-nowrap`}>
        <Link to={`/pecuaria/potreros/${p.id}`} onClick={(e) => e.stopPropagation()} className="text-campo-700 hover:underline">
          {p.nombre}
        </Link>
        {p.tipo === 'CORRAL' && <span className="ml-1.5 text-xs font-medium text-amber-800">corral</span>}
        {/* En el celular: uso, hectáreas y categorías, debajo del nombre. */}
        <span className="mt-0.5 block text-xs font-normal text-suelo-600 md:hidden">
          {p.usoActual?.nombre ?? 'Sin uso'} · {p.hectareasAConfirmar ? 'ha a confirmar' : `${formatNumero(p.hectareas, 2)} ha`}
          {!vacio && <span className="block">{cabezasPorCategoria(p.stock.lotes)}</span>}
        </span>
      </td>
      <td className={`${celda} ${fondo} ${SOLO_COMPU} whitespace-nowrap`}>
        <UsoBadge uso={p.usoActual} />
      </td>
      <td className={`${celda} ${fondo} ${SOLO_COMPU} whitespace-nowrap text-right tabular-nums`}>
        {p.hectareasAConfirmar ? <span className="text-xs text-amber-800">a confirmar</span> : formatNumero(p.hectareas, 2)}
      </td>
      <td className={`${celda} ${fondo} text-right font-semibold tabular-nums`}>{vacio ? '—' : formatNumero(cabezas)}</td>
      <td className={`${celda} ${fondo} ${SOLO_COMPU} min-w-[12rem]`}>{vacio ? <span className="text-suelo-400">vacío</span> : cabezasPorCategoria(p.stock.lotes)}</td>
      <td className={`${celda} ${fondo} ${SOLO_COMPU} text-right tabular-nums`}>{vacio || p.stock?.cabHa == null ? '—' : formatNumero(p.stock.cabHa, 2)}</td>
      <td className={`${celda} ${fondo} whitespace-nowrap text-right tabular-nums`}>
        {sinPeso ? <span className="text-xs text-amber-800">sin peso</span> : vacio || p.stock?.ugHa == null ? '—' : formatNumero(p.stock.ugHa, 2)}
      </td>
    </tr>
  );
}
