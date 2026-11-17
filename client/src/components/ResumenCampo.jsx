import { useEffect, useState } from 'react';
import { getResumen } from '../api/pecuaria';
import { getErrorMessages } from '../api/axios';
import { ErrorList } from './ui';
import { formatFecha, formatNumero } from './pecuaria';

const NOMBRE_GRUPO = { CN: 'CN', VERDEO: 'Verdeos', CORRAL: 'Corral', OTRO: 'Otro' };

// La tabla del encargado: categorías × CN / Verdeos / Corral / Total, y la
// carga de cada grupo.
export default function ResumenCampo({ campoId }) {
  const [resumen, setResumen] = useState(null);
  const [errors, setErrors] = useState([]);

  useEffect(() => {
    setResumen(null);
    getResumen(campoId)
      .then(({ data }) => setResumen(data))
      .catch((error) => setErrors(getErrorMessages(error, 'No se pudo cargar el resumen')));
  }, [campoId]);

  if (errors.length) return <ErrorList errors={errors} />;
  if (!resumen) return <p className="text-zinc-400">Cargando…</p>;
  if (!resumen.filas.length) return <p className="text-zinc-400">Todavía no hay animales cargados en este campo.</p>;

  // CN y Verdeos siempre; Corral y Otro, solo si tienen animales (en el celular no sobra lugar).
  const columnas = ['CN', 'VERDEO', ...['CORRAL', 'OTRO'].filter((g) => resumen.totales[g] > 0)];
  const celda = (n) => (n ? formatNumero(n) : <span className="text-zinc-600">—</span>);

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-400">Último dato: {formatFecha(resumen.fecha)}</p>

      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-right text-xs tabular-nums sm:text-sm">
          <thead className="bg-zinc-800 text-zinc-400">
            <tr>
              <th className="px-2 py-2 sm:px-3 text-left">Categoría</th>
              {columnas.map((g) => (
                <th key={g} className="px-2 py-2 sm:px-3">
                  {NOMBRE_GRUPO[g]}
                </th>
              ))}
              <th className="px-2 py-2 sm:px-3 text-white">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {resumen.filas.map((f) => (
              <tr key={f.categoriaId}>
                <td className="px-2 py-2 sm:px-3 text-left font-medium">{f.categoria}</td>
                {columnas.map((g) => (
                  <td key={g} className="px-2 py-2 sm:px-3">
                    {celda(f[g])}
                  </td>
                ))}
                <td className="px-2 py-2 sm:px-3 font-semibold">{formatNumero(f.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-zinc-700 bg-zinc-800/60 font-bold">
            <tr>
              <td className="px-2 py-2 sm:px-3 text-left">Total</td>
              {columnas.map((g) => (
                <td key={g} className="px-2 py-2 sm:px-3">
                  {formatNumero(resumen.totales[g])}
                </td>
              ))}
              <td className="px-2 py-2 sm:px-3 text-lg">{formatNumero(resumen.totales.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <section>
        <h3 className="mb-2 font-semibold">Carga por grupo</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {resumen.porGrupo
            .filter((g) => g.potreros > 0)
            .map((g) => (
              <div key={g.grupo} className="rounded-lg bg-zinc-800 px-4 py-3">
                <div className="flex items-baseline justify-between">
                  <p className="font-semibold">{NOMBRE_GRUPO[g.grupo]}</p>
                  <p className="text-xl font-bold">{formatNumero(g.cabezas)} cab</p>
                </div>
                <p className="mt-1 text-sm text-zinc-400">
                  {g.potreros} {g.potreros === 1 ? 'potrero' : 'potreros'} · {formatNumero(g.hectareas)} ha conocidas
                </p>
                <p className="mt-1 text-sm">
                  {g.cabHa == null ? (
                    <span className="text-zinc-500">Sin hectáreas: no se calcula la carga</span>
                  ) : (
                    <>
                      {formatNumero(g.cabHa, 2)} cab/ha ·{' '}
                      {g.kilosCompletos ? `${formatNumero(g.ugHa, 2)} UG/ha` : <span className="text-amber-300">UG incompletas (faltan pesos)</span>}
                    </>
                  )}
                </p>
              </div>
            ))}
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          La carga se calcula solo con los potreros que tienen hectáreas confirmadas. 1 UG = {formatNumero(resumen.kgPorUg)} kg de peso vivo.
        </p>
      </section>
    </div>
  );
}
