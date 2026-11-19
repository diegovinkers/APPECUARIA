import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getLote } from '../api/pecuaria';
import { getErrorMessages } from '../api/axios';
import { ErrorList } from '../components/ui';
import { formatFecha, formatNumero } from '../components/pecuaria';
import { MovimientoItem } from '../components/movimientos';

// Un lote repartido en varios potreros (familia de lotes): sus partes, con
// las cabezas de cada una y el total.
function Familia({ familia, loteId }) {
  const potreros = new Set(familia.partes.map((p) => p.potrero.id)).size;
  return (
    <section className="mt-4 rounded-lg border border-campo-200 bg-campo-50/60 px-4 py-3" aria-label="Lote repartido">
      <p className="font-semibold">
        Repartido en {potreros} potrero{potreros === 1 ? '' : 's'} · {formatNumero(familia.cabezas)} cab en total
      </p>
      <ul className="mt-2 space-y-1 text-sm">
        {familia.partes.map((p) => (
          <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
            {p.id === loteId ? (
              <span className="font-medium">{p.nombre} (este)</span>
            ) : (
              <Link to={`/pecuaria/lotes/${p.id}`} className="text-campo-700 hover:underline">
                {p.nombre}
              </Link>
            )}
            <span className="text-suelo-600">
              {p.potrero.nombre} · {formatNumero(p.cabezas)} cab{p.categoria ? ` · ${p.categoria}` : ''}
            </span>
          </li>
        ))}
      </ul>
      {familia.otrasEstancias > 0 && (
        <p className="mt-2 text-xs text-suelo-600">
          Y {familia.otrasEstancias} parte{familia.otrasEstancias === 1 ? '' : 's'} en otra{familia.otrasEstancias === 1 ? '' : 's'} estancia
          {familia.otrasEstancias === 1 ? '' : 's'}.
        </p>
      )}
    </section>
  );
}

// Historial de un lote: dónde está, qué tiene y por dónde pasó.
export default function LotePage() {
  const { id } = useParams();
  const [datos, setDatos] = useState(null);
  const [errors, setErrors] = useState([]);

  useEffect(() => {
    getLote(id)
      .then(({ data }) => setDatos(data))
      .catch((error) => setErrors(getErrorMessages(error, 'No se pudo cargar el lote')));
  }, [id]);

  if (!datos) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <ErrorList errors={errors} />
        {!errors.length && <p className="text-suelo-600">Cargando…</p>}
      </main>
    );
  }
  const { lote, actual, familia, movimientos } = datos;
  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <Link to="/pecuaria/movimientos" className="text-sm text-campo-600 hover:underline">
        ← Movimientos
      </Link>
      <h1 className="mt-2 text-3xl font-bold">
        {lote.nombre}
        {!lote.activo && <span className="ml-2 align-middle text-sm font-medium text-suelo-600">cerrado</span>}
      </h1>
      <p className="text-suelo-600">
        {lote.categoria} · {lote.activo ? 'está en' : 'estuvo por última vez en'}{' '}
        <Link to={`/pecuaria/potreros/${lote.potrero.id}`} className="text-campo-700 hover:underline">
          {lote.potrero.nombre}
        </Link>
      </p>

      {actual ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-suelo-200 bg-white px-4 py-3">
          <p>
            <strong className="text-2xl">{formatNumero(actual.cabezas)}</strong> cab
            {actual.pesoPromedioKg ? ` · ${formatNumero(actual.pesoPromedioKg)} kg promedio` : ''}
            <span className="ml-2 text-xs text-suelo-500">al {formatFecha(actual.fecha)}</span>
          </p>
        </div>
      ) : (
        <p className="mt-4 text-suelo-600">Hoy no tiene animales.</p>
      )}

      {familia && <Familia familia={familia} loteId={lote.id} />}

      <h2 className="mb-2 mt-8 text-lg font-semibold">Movimientos</h2>
      {movimientos.length === 0 ? (
        <p className="text-suelo-600">Este lote todavía no tuvo movimientos.</p>
      ) : (
        <ul className="space-y-2">
          {movimientos.map((m) => (
            <MovimientoItem key={m.id} m={m} />
          ))}
        </ul>
      )}
    </main>
  );
}
