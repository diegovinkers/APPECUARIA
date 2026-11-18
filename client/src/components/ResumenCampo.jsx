import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getResumen } from '../api/pecuaria';
import { getErrorMessages } from '../api/axios';
import { ErrorList } from './ui';
import { formatFecha, formatNumero } from './pecuaria';

const NOMBRE_GRUPO = { CN: 'CN', VERDEO: 'Verdeos', CORRAL: 'Corral', OTRO: 'Otro' };

// Tocar una categoría, un número o un grupo lleva a Potreros con ese filtro.
const aPotreros = ({ categoriaId, grupo } = {}) => {
  const q = new URLSearchParams();
  if (categoriaId) q.set('categoria', String(categoriaId));
  if (grupo) q.set('grupo', grupo);
  return `/pecuaria/potreros${q.size ? `?${q}` : ''}`;
};
const linkCelda = 'block rounded px-1 -mx-1 hover:bg-campo-50 hover:text-campo-700 hover:underline';

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
  if (!resumen) return <p className="text-suelo-600">Cargando…</p>;
  return <TablaResumen resumen={resumen} />;
}

// La tabla y la carga por grupo, de una estancia o de todas juntas.
export function TablaResumen({ resumen }) {
  if (!resumen.filas.length) return <p className="text-suelo-600">Todavía no hay animales cargados.</p>;

  // CN y Verdeos siempre; Corral y Otro, solo si tienen animales (en el celular no sobra lugar).
  const columnas = ['CN', 'VERDEO', ...['CORRAL', 'OTRO'].filter((g) => resumen.totales[g] > 0)];
  const celda = (n, filtro) =>
    n ? (
      <Link to={aPotreros(filtro)} className={linkCelda}>
        {formatNumero(n)}
      </Link>
    ) : (
      <span className="text-suelo-400">—</span>
    );

  return (
    <div className="space-y-6">
      <div className="text-sm text-suelo-600">
        <p>Último dato: {formatFecha(resumen.fecha)}</p>
        <p className="text-xs text-suelo-500">
          CN: campo natural · Verdeos: pasturas sembradas (raigrás, avena, sorgo…). Tocá una categoría o un número para ver esos potreros.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-suelo-200">
        <table className="w-full text-right text-xs tabular-nums sm:text-sm">
          <thead className="bg-suelo-200/70 text-suelo-600">
            <tr>
              <th className="px-2 py-2 sm:px-3 text-left">Categoría</th>
              {columnas.map((g) => (
                <th key={g} className="px-2 py-2 sm:px-3">
                  {NOMBRE_GRUPO[g]}
                </th>
              ))}
              <th className="px-2 py-2 sm:px-3 text-suelo-900">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-suelo-200">
            {resumen.filas.map((f) => (
              <tr key={f.categoriaId}>
                <td className="px-2 py-2 sm:px-3 text-left font-medium">
                  <Link to={aPotreros({ categoriaId: f.categoriaId })} className={`${linkCelda} text-campo-700`}>
                    {f.categoria}
                  </Link>
                </td>
                {columnas.map((g) => (
                  <td key={g} className="px-2 py-2 sm:px-3">
                    {celda(f[g], { categoriaId: f.categoriaId, grupo: g })}
                  </td>
                ))}
                <td className="px-2 py-2 sm:px-3 font-semibold">{celda(f.total, { categoriaId: f.categoriaId })}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-suelo-300 bg-suelo-50 font-bold">
            <tr>
              <td className="px-2 py-2 sm:px-3 text-left">Total</td>
              {columnas.map((g) => (
                <td key={g} className="px-2 py-2 sm:px-3">
                  {celda(resumen.totales[g], { grupo: g })}
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
              <Link key={g.grupo} to={aPotreros({ grupo: g.grupo })} className="block rounded-lg border border-suelo-200 bg-white px-4 py-3 hover:border-campo-400">
                <div className="flex items-baseline justify-between">
                  <p className="font-semibold">{NOMBRE_GRUPO[g.grupo]}</p>
                  <p className="text-xl font-bold">{formatNumero(g.cabezas)} cab</p>
                </div>
                <p className="mt-1 text-sm text-suelo-600">
                  {g.potreros} {g.potreros === 1 ? 'potrero' : 'potreros'} · {formatNumero(g.hectareas)} ha conocidas
                </p>
                <p className="mt-1 text-sm">
                  {g.cabHa == null ? (
                    <span className="text-suelo-500">Sin hectáreas: no se calcula la carga</span>
                  ) : (
                    <>
                      {formatNumero(g.cabHa, 2)} cab/ha ·{' '}
                      {g.kilosCompletos ? `${formatNumero(g.ugHa, 2)} UG/ha` : <span className="text-amber-800">UG incompletas (faltan pesos)</span>}
                    </>
                  )}
                </p>
              </Link>
            ))}
        </div>
        <p className="mt-2 text-xs text-suelo-500">
          La carga se calcula solo con los potreros que tienen hectáreas confirmadas. 1 UG = {formatNumero(resumen.kgPorUg)} kg de peso vivo.
        </p>
      </section>
    </div>
  );
}
