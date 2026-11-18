import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getMovimientos, revertirMovimiento } from '../api/pecuaria';
import { getErrorMessages } from '../api/axios';
import { ErrorList, Notice } from './ui';
import { formatNumero } from './pecuaria';
import { MovimientoItem } from './movimientos';
import usePuede from '../hooks/usePuede';

const ordenNatural = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
const iso = (d) => d.toLocaleDateString('sv-SE');
const hace = (dias) => {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return iso(d);
};
const PERIODOS = [
  ['', 'Todo'],
  ['7', 'Últimos 7 días'],
  ['30', 'Últimos 30 días'],
  ['rango', 'Entre fechas'],
];
const selectClass = 'min-w-0 rounded-md border border-suelo-300 bg-white px-2 py-2 text-sm text-suelo-800';

// Pestaña Movimientos: todos los movimientos del campo (también las entradas y
// salidas), con filtros (en la URL), un resumen de lo filtrado, los botones
// para mover, registrar una entrada o una salida, y la opción de revertir.
export default function MovimientosLista({ campoId, potreros }) {
  const navigate = useNavigate();
  const puedo = usePuede();
  const [params, setParams] = useSearchParams();
  const f = {
    periodo: params.get('periodo') ?? '',
    desde: params.get('desde') ?? '',
    hasta: params.get('hasta') ?? '',
    potreroId: params.get('mpotrero') ?? '',
    categoriaId: params.get('mcategoria') ?? '',
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
  const [errors, setErrors] = useState([]);
  const [aviso, setAviso] = useState(null);
  // accion: MOVER, ENTRA o SALE (null: cerrado).
  const [nuevo, setNuevo] = useState({ accion: null, potreroId: '', loteId: '' });

  const filtrosApi = useMemo(() => {
    const desde = f.periodo === 'rango' ? f.desde : f.periodo ? hace(Number(f.periodo)) : '';
    const hasta = f.periodo === 'rango' ? f.hasta : '';
    return { desde, hasta, potreroId: f.potreroId, categoriaId: f.categoriaId };
  }, [f.periodo, f.desde, f.hasta, f.potreroId, f.categoriaId]);

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

  const ordenados = useMemo(() => [...potreros].sort((a, b) => ordenNatural.compare(a.nombre, b.nombre)), [potreros]);
  const categorias = useMemo(() => {
    const m = new Map();
    for (const p of potreros) for (const l of p.stock?.lotes ?? []) m.set(String(l.categoriaId), l.categoria);
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [potreros]);
  const lotesDelPotrero = ordenados.find((p) => String(p.id) === nuevo.potreroId)?.stock?.lotes ?? [];

  async function onRevertir(m) {
    const ok = window.confirm(
      `¿Revertir este movimiento? Los potreros vuelven a como estaban antes. Queda registrado: el movimiento original y la reversión.`,
    );
    if (!ok) return;
    try {
      await revertirMovimiento(m.id);
      setErrors([]);
      setAviso('Movimiento revertido.');
      await cargar();
    } catch (error) {
      setAviso(null);
      setErrors(getErrorMessages(error, 'No se pudo revertir'));
    }
  }

  const hayFiltros = f.periodo || f.potreroId || f.categoriaId;

  return (
    <div>
      {puedo('pecuaria:CREAR') && (
      <div className="mb-4">
        {!nuevo.accion ? (
          <div className="grid grid-cols-3 gap-2">
            {[
              ['MOVER', 'Mover', 'bg-campo-600 hover:bg-campo-700'],
              ['ENTRA', '+ Entrada', 'bg-emerald-700 hover:bg-emerald-600'],
              ['SALE', '− Salida', 'bg-red-700 hover:bg-red-800'],
            ].map(([accion, texto, color]) => (
              <button
                key={accion}
                type="button"
                onClick={() => setNuevo({ accion, potreroId: '', loteId: '' })}
                className={`rounded-md px-3 py-2 font-medium text-white ${color}`}
              >
                {texto}
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-2 rounded-lg border border-campo-200 bg-suelo-50 p-3">
            <p className="text-sm font-semibold">
              {nuevo.accion === 'ENTRA' ? '¿A qué potrero entran los animales?' : '¿De dónde salen los animales?'}
            </p>
            <select
              value={nuevo.potreroId}
              onChange={(e) => setNuevo({ ...nuevo, potreroId: e.target.value, loteId: '' })}
              className={`${selectClass} w-full`}
              aria-label="Potrero"
            >
              <option value="">Elegí el potrero…</option>
              {ordenados
                .filter((p) => nuevo.accion === 'ENTRA' || (p.stock?.cabezas ?? 0) > 0)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} · {formatNumero(p.stock?.cabezas ?? 0)} cab
                  </option>
                ))}
            </select>
            {nuevo.potreroId && nuevo.accion !== 'ENTRA' && (
              <select
                value={nuevo.loteId}
                onChange={(e) => setNuevo({ ...nuevo, loteId: e.target.value })}
                className={`${selectClass} w-full`}
                aria-label="Lote de origen"
              >
                <option value="">Elegí el lote…</option>
                {lotesDelPotrero.map((l) => (
                  <option key={l.loteId} value={l.loteId}>
                    {l.lote} · {l.categoria} · {formatNumero(l.cabezas)} cab
                  </option>
                ))}
              </select>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={nuevo.accion === 'ENTRA' ? !nuevo.potreroId : !nuevo.loteId}
                onClick={() =>
                  navigate(
                    nuevo.accion === 'MOVER'
                      ? `/pecuaria/mover?potrero=${nuevo.potreroId}&lote=${nuevo.loteId}`
                      : `/pecuaria/registrar?efecto=${nuevo.accion}&potrero=${nuevo.potreroId}${nuevo.loteId ? `&lote=${nuevo.loteId}` : ''}`,
                  )
                }
                className="rounded-md bg-campo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Seguir
              </button>
              <button type="button" onClick={() => setNuevo({ accion: null, potreroId: '', loteId: '' })} className="px-3 text-sm text-suelo-600">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      <div className="mb-3 space-y-2 rounded-lg border border-suelo-200 p-3">
        <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Período">
          {PERIODOS.map(([valor, texto]) => (
            <button
              key={texto}
              type="button"
              onClick={() => poner({ periodo: valor, ...(valor !== 'rango' && { desde: '', hasta: '' }) })}
              aria-pressed={f.periodo === valor}
              className={`shrink-0 rounded-full px-3 py-1 text-sm ${f.periodo === valor ? 'bg-campo-600 text-white' : 'bg-suelo-200/70 text-suelo-700 hover:bg-suelo-300/60'}`}
            >
              {texto}
            </button>
          ))}
        </div>
        {f.periodo === 'rango' && (
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={f.desde} onChange={(e) => poner({ desde: e.target.value })} aria-label="Desde" className={selectClass} />
            <input type="date" value={f.hasta} onChange={(e) => poner({ hasta: e.target.value })} aria-label="Hasta" className={selectClass} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <select value={f.potreroId} onChange={(e) => poner({ mpotrero: e.target.value })} aria-label="Potrero" className={selectClass}>
            <option value="">Todos los potreros</option>
            {ordenados.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
          <select value={f.categoriaId} onChange={(e) => poner({ mcategoria: e.target.value })} aria-label="Categoría" className={selectClass}>
            <option value="">Todas las categorías</option>
            {categorias.map(([id, nombre]) => (
              <option key={id} value={id}>
                {nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      <ErrorList errors={errors} />
      <Notice tone="ok">{aviso}</Notice>

      {datos && (
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <p>
            <strong>{datos.resumen.movimientos}</strong> {datos.resumen.movimientos === 1 ? 'movimiento' : 'movimientos'} ·{' '}
            <strong>{formatNumero(datos.resumen.cabezas)}</strong> cabezas movidas
            {datos.resumen.entradas > 0 && (
              <>
                {' '}· <strong className="text-emerald-800">+{formatNumero(datos.resumen.entradas)}</strong> entraron
              </>
            )}
            {datos.resumen.salidas > 0 && (
              <>
                {' '}· <strong className="text-red-700">−{formatNumero(datos.resumen.salidas)}</strong> salieron
              </>
            )}
          </p>
          {hayFiltros && (
            <button
              type="button"
              onClick={() => poner({ periodo: '', desde: '', hasta: '', mpotrero: '', mcategoria: '' })}
              className="text-campo-600 hover:underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {!datos ? (
        <p className="text-suelo-600">Cargando…</p>
      ) : datos.movimientos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-suelo-300 p-6 text-center text-suelo-600">
          {hayFiltros ? 'No hay movimientos con esos filtros.' : 'Todavía no hay movimientos. Empezá con Mover, Entrada o Salida.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {datos.movimientos.map((m) => (
            <MovimientoItem key={m.id} m={m} onRevertir={puedo('pecuaria:ANULAR') ? onRevertir : undefined} />
          ))}
        </ul>
      )}
    </div>
  );
}
