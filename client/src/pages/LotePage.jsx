import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getLote } from '../api/pecuaria';
import { getErrorMessages } from '../api/axios';
import { ErrorList } from '../components/ui';
import { formatFecha, formatNumero } from '../components/pecuaria';
import { MovimientoItem } from '../components/movimientos';

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
  const { lote, actual, movimientos } = datos;
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
          <div className="flex gap-2">
            <Link
              to={`/pecuaria/mover?potrero=${lote.potrero.id}&lote=${lote.id}`}
              className="rounded-md border border-campo-300 px-3 py-1.5 text-sm font-medium text-campo-700 hover:bg-campo-100"
            >
              Mover
            </Link>
            <Link
              to={`/pecuaria/registrar?efecto=SALE&potrero=${lote.potrero.id}&lote=${lote.id}`}
              className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Salida
            </Link>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-suelo-600">Hoy no tiene animales.</p>
      )}

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
