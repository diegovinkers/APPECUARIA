import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Hectareas, UsoBadge, formatNumero } from './pecuaria';

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
  ['', 'Con y sin animales'],
  ['con', 'Con animales'],
  ['vacios', 'Vacíos'],
];
const ORDEN = [
  ['nombre', 'Ordenar: nombre'],
  ['cabezas', 'Ordenar: más cabezas'],
  ['carga', 'Ordenar: más carga'],
];

const grupoDe = (p) => (p.tipo === 'CORRAL' ? 'CORRAL' : (p.usoActual?.grupo ?? 'OTRO'));
const incompleto = (p) => p.hectareasAConfirmar || (p.stock && !p.stock.kilosCompletos);

// Lista de potreros con filtros. Los filtros viven en la dirección de la
// página (?grupo=VERDEO&categoria=…): al volver de un potrero siguen puestos.
export default function PotrerosLista({ potreros }) {
  const [params, setParams] = useSearchParams();
  const f = {
    q: params.get('q') ?? '',
    grupo: params.get('grupo') ?? '',
    animales: params.get('animales') ?? '',
    categoria: params.get('categoria') ?? '',
    incompletos: params.get('incompletos') === '1',
    orden: params.get('orden') ?? 'nombre',
  };
  const poner = (clave, valor) =>
    setParams(
      (actual) => {
        const nuevo = new URLSearchParams(actual);
        if (valor) nuevo.set(clave, valor);
        else nuevo.delete(clave);
        return nuevo;
      },
      { replace: true },
    );
  const hayFiltros = f.q || f.grupo || f.animales || f.categoria || f.incompletos;

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
    const porNombre = (a, b) => ordenNatural.compare(a.nombre, b.nombre);
    if (f.orden === 'cabezas') return lista.sort((a, b) => (b.stock?.cabezas ?? 0) - (a.stock?.cabezas ?? 0) || porNombre(a, b));
    if (f.orden === 'carga') return lista.sort((a, b) => (b.stock?.ugHa ?? -1) - (a.stock?.ugHa ?? -1) || porNombre(a, b));
    return lista.sort((a, b) => a.orden - b.orden || porNombre(a, b));
  }, [potreros, f.q, f.grupo, f.animales, f.categoria, f.incompletos, f.orden]);

  // Lo que suma lo filtrado. Con una categoría elegida, cuenta solo esa.
  const resumen = useMemo(() => {
    const deCategoria = (p) =>
      (p.stock?.lotes ?? []).filter((l) => !f.categoria || String(l.categoriaId) === f.categoria).reduce((s, l) => s + l.cabezas, 0);
    return {
      cabezas: visibles.reduce((s, p) => s + deCategoria(p), 0),
      hectareas: visibles.reduce((s, p) => s + (p.hectareasAConfirmar ? 0 : (p.hectareas ?? 0)), 0),
    };
  }, [visibles, f.categoria]);
  const nombreCategoria = categorias.find(([id]) => id === f.categoria)?.[1];
  const cargaMaxima = Math.max(1, ...potreros.map((p) => p.stock?.ugHa ?? 0));

  return (
    <div>
      <div className="mb-3 space-y-2 rounded-lg border border-suelo-200 p-3">
        <input
          type="search"
          value={f.q}
          onChange={(e) => poner('q', e.target.value)}
          placeholder="Buscar potrero o lote…"
          aria-label="Buscar potrero o lote"
          className="w-full rounded-md border border-suelo-300 bg-white px-3 py-2 text-sm text-suelo-900 placeholder-suelo-400 outline-none focus:ring-2 focus:ring-campo-500"
        />
        <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Grupo de uso de suelo">
          {GRUPOS.map(([valor, texto]) => (
            <Chip key={texto} activo={f.grupo === valor} onClick={() => poner('grupo', valor)}>
              {texto}
            </Chip>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Select etiqueta="Animales" valor={f.animales} onChange={(v) => poner('animales', v)} opciones={ANIMALES} />
          <Select
            etiqueta="Categoría"
            valor={f.categoria}
            onChange={(v) => poner('categoria', v)}
            opciones={[['', 'Todas las categorías'], ...categorias]}
          />
          <Select etiqueta="Ordenar" valor={f.orden} onChange={(v) => poner('orden', v === 'nombre' ? '' : v)} opciones={ORDEN} />
          <label className="flex items-center gap-2 rounded-md bg-suelo-200/70 px-3 py-2 text-sm text-suelo-700">
            <input type="checkbox" checked={f.incompletos} onChange={(e) => poner('incompletos', e.target.checked ? '1' : '')} />
            Datos incompletos
          </label>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <p>
          <strong>{visibles.length}</strong> de {potreros.length} potreros ·{' '}
          <strong>{formatNumero(resumen.cabezas)}</strong> {nombreCategoria ?? 'cabezas'} ·{' '}
          <strong>{formatNumero(resumen.hectareas)}</strong> ha
        </p>
        {hayFiltros && (
          <button type="button" onClick={() => setParams({}, { replace: true })} className="text-campo-600 hover:underline">
            Limpiar filtros
          </button>
        )}
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-lg border border-dashed border-suelo-300 p-6 text-center text-suelo-600">Ningún potrero cumple esos filtros.</p>
      ) : (
        <ul className="space-y-2">
          {visibles.map((p) => (
            <PotreroFila key={p.id} potrero={p} cargaMaxima={cargaMaxima} categoria={f.categoria} />
          ))}
        </ul>
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
    <select
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      aria-label={etiqueta}
      className="min-w-0 rounded-md border border-suelo-300 bg-white px-2 py-2 text-sm text-suelo-800"
    >
      {opciones.map(([v, t]) => (
        <option key={v} value={v}>
          {t}
        </option>
      ))}
    </select>
  );
}

function PotreroFila({ potrero: p, cargaMaxima, categoria }) {
  const lotes = p.stock?.lotes ?? [];
  const cabezas = p.stock?.cabezas ?? 0;
  const vacio = cabezas === 0;
  const ug = p.stock?.ugHa;
  return (
    <li>
      <Link
        to={`/pecuaria/potreros/${p.id}`}
        className={`block rounded-lg border px-4 py-3 transition hover:border-campo-400 ${vacio ? 'border-suelo-200 bg-suelo-50' : 'border-suelo-200 bg-white'}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={`font-semibold ${vacio ? 'text-suelo-600' : ''}`}>
              {p.nombre}
              {p.tipo === 'CORRAL' && <span className="ml-2 text-xs font-medium text-amber-800">corral</span>}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <UsoBadge uso={p.usoActual} />
              <Hectareas hectareas={p.hectareas} aConfirmar={p.hectareasAConfirmar} />
              {p.stock && !p.stock.kilosCompletos && (
                <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-800">sin peso</span>
              )}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className={`text-xl font-bold ${vacio ? 'text-suelo-400' : ''}`}>{vacio ? 'vacío' : formatNumero(cabezas)}</p>
            {!vacio && <p className="text-xs text-suelo-500">cabezas</p>}
          </div>
        </div>

        {lotes.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {lotes.map((l) => (
              <span
                key={l.loteId}
                title={`Lote ${l.lote}`}
                className={`rounded px-2 py-0.5 text-xs ${String(l.categoriaId) === categoria ? 'bg-campo-100 text-campo-800' : 'bg-suelo-200/70 text-suelo-700'}`}
              >
                {l.categoria} <strong>{formatNumero(l.cabezas)}</strong>
              </span>
            ))}
          </div>
        )}

        {!vacio && ug != null && (
          <div className="mt-2 flex items-center gap-2 text-xs text-suelo-600">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-suelo-200/70" aria-hidden="true">
              <div className="h-full rounded-full bg-campo-400" style={{ width: `${Math.min(100, (ug / cargaMaxima) * 100)}%` }} />
            </div>
            <span className="shrink-0">
              {formatNumero(p.stock.cabHa, 2)} cab/ha · {p.stock.kilosCompletos ? `${formatNumero(ug, 2)} UG/ha` : 'UG sin peso'}
            </span>
          </div>
        )}
      </Link>
    </li>
  );
}
