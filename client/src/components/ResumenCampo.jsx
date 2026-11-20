import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getResumen } from '../api/pecuaria';
import { getErrorMessages } from '../api/axios';
import { ErrorList } from './ui';
import { formatFecha, formatNumero, formatUsd, formatUsdCorto } from './pecuaria';

const NOMBRE_GRUPO = { CN: 'CN', VERDEO: 'Verdeos', CORRAL: 'Corral', OTRO: 'Otro' };

// Las columnas de la tabla las manda el servidor (resumen.columnas): en una
// estancia, CN / Verdeos / Corral / Otro; en un feedlot, las etapas del
// encierre. Cada una: { clave, nombre, corto?, detalle?, grupo? (sus números
// llevan a Potreros con ese grupo), soloSiHay?, compu? (solo en la compu),
// celular? (solo en el celular), suma? (las columnas que junta) }.
// Si no vienen (un servidor viejo), las de la estancia.
export const COLUMNAS_ESTANCIA = [
  { clave: 'CN', nombre: 'CN', detalle: 'campo natural', grupo: true },
  { clave: 'VERDEO', nombre: 'Verdeos', detalle: 'pasturas sembradas (raigrás, avena, sorgo…)', grupo: true },
  { clave: 'CORRAL', nombre: 'Corral', soloSiHay: true, grupo: true },
  { clave: 'OTRO', nombre: 'Otro', soloSiHay: true, grupo: true },
];

// Las columnas que se muestran: Corral y Otro (en la estancia), solo si tienen animales.
export const columnasDe = (resumen) => (resumen.columnas ?? COLUMNAS_ESTANCIA).filter((c) => !c.soloSiHay || resumen.totales[c.clave] > 0);

// El número de una fila (o de los totales) en una columna: si junta otras, la suma.
export const valorColumna = (fila, c) => (c.suma ? c.suma.reduce((s, k) => s + (fila[k] ?? 0), 0) : (fila[c.clave] ?? 0));

// En el celular (375 px) no entran todas: las "solo en la compu" se esconden
// y las "solo en el celular" (Adaptación + Engorde juntas) aparecen.
const claseColumna = (c) => (c.compu ? 'hidden md:table-cell' : c.celular ? 'md:hidden' : '');

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

// El valor del ganado (con los precios de cada categoría, en Configuración).
export function ValorGanado({ valor }) {
  if (!valor) return null;
  return (
    <div className="rounded-lg border border-trigo-400 bg-trigo-100 px-4 py-3" data-testid="valor-ganado">
      <p className="text-xs text-suelo-600">Valor del ganado</p>
      {valor.usd > 0 ? (
        <>
          <p className="text-2xl font-bold tabular-nums">{formatUsd(valor.usd)}</p>
          {!valor.completo && <p className="text-xs text-amber-800">Incompleto: hay categorías sin precio o sin peso.</p>}
        </>
      ) : (
        <p className="text-sm text-suelo-600">
          Cargá el precio de cada categoría en{' '}
          <Link to="/pecuaria/configuracion" className="text-campo-700 hover:underline">
            Configuración
          </Link>{' '}
          para verlo.
        </p>
      )}
    </div>
  );
}

// Una celda de la columna Valor: arriba lo que vale la categoría entera y,
// abajo en chico, lo que vale cada cabeza (pedido de Diego, 19/11).
function Valor({ usd, cabezas, completo }) {
  if (!(usd > 0)) return <span className="text-suelo-400" title="Sin precio en Configuración">—</span>;
  return (
    <span className="whitespace-nowrap" data-testid="valor-categoria">
      {formatUsdCorto(usd)}
      {!completo && <span className="text-amber-800" title="Hay lotes sin precio o sin peso">*</span>}
      {cabezas > 0 && <span className="block text-[11px] font-normal leading-4 text-suelo-500">{formatNumero(usd / cabezas)}/cab</span>}
    </span>
  );
}

// La tabla y la carga por grupo, de una estancia o de todas juntas.
export function TablaResumen({ resumen }) {
  if (!resumen.filas.length) return <p className="text-suelo-600">Todavía no hay animales cargados.</p>;

  // CN y Verdeos siempre; Corral y Otro, solo si tienen animales (en el celular
  // no sobra lugar). En un feedlot, las etapas del encierre.
  const columnas = columnasDe(resumen);
  const feedlot = resumen.tipo === 'FEEDLOT';
  // La columna Valor (entre los grupos y el Total), solo si hay precios cargados.
  const conValor = resumen.valor?.usd > 0;
  const celda = (n, filtro) =>
    n ? (
      <Link to={aPotreros(filtro)} className={linkCelda}>
        {formatNumero(n)}
      </Link>
    ) : (
      <span className="text-suelo-400">—</span>
    );
  // Las etapas del feedlot no son un filtro de Potreros: el número, sin link.
  const numero = (n) => (n ? formatNumero(n) : <span className="text-suelo-400">—</span>);

  return (
    <div className="space-y-6">
      <ValorGanado valor={resumen.valor} />

      <div className="text-sm text-suelo-600">
        <p>Último dato: {formatFecha(resumen.fecha)}</p>
        {feedlot ? (
          <p className="text-xs text-suelo-500" data-testid="leyenda-etapas">
            Por días de encierre:{' '}
            {columnas
              .filter((c) => !c.celular)
              .map((c) => `${c.nombre}, ${c.detalle}`)
              .join(' · ')}
            . El valor usa el peso estimado de hoy (≈), como la tabla por corral.
          </p>
        ) : (
          <p className="text-xs text-suelo-500">
            CN: campo natural · Verdeos: pasturas sembradas (raigrás, avena, sorgo…). Tocá una categoría o un número para ver esos potreros.
          </p>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-suelo-200">
        <table className="w-full text-right text-xs tabular-nums sm:text-sm">
          <thead className="bg-suelo-200/70 text-suelo-600">
            <tr>
              <th className="px-2 py-2 sm:px-3 text-left">Categoría</th>
              {columnas.map((c) => (
                <th key={c.clave} className={`px-2 py-2 sm:px-3 ${claseColumna(c)}`} title={c.detalle}>
                  {c.corto ? (
                    <>
                      <span className="md:hidden">{c.corto}</span>
                      <span className="hidden md:inline">{c.nombre}</span>
                    </>
                  ) : (
                    c.nombre
                  )}
                </th>
              ))}
              {conValor && <th className="px-2 py-2 sm:px-3">Valor USD</th>}
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
                {columnas.map((c) => (
                  <td key={c.clave} className={`px-2 py-2 sm:px-3 ${claseColumna(c)}`}>
                    {c.grupo ? celda(valorColumna(f, c), { categoriaId: f.categoriaId, grupo: c.clave }) : numero(valorColumna(f, c))}
                  </td>
                ))}
                {conValor && (
                  <td className="px-2 py-2 sm:px-3">
                    <Valor usd={f.valorUsd} cabezas={f.total} completo={f.valorCompleto} />
                  </td>
                )}
                <td className="px-2 py-2 sm:px-3 font-semibold">{celda(f.total, { categoriaId: f.categoriaId })}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-suelo-300 bg-suelo-50 font-bold">
            <tr>
              <td className="px-2 py-2 sm:px-3 text-left">Total</td>
              {columnas.map((c) => (
                <td key={c.clave} className={`px-2 py-2 sm:px-3 ${claseColumna(c)}`}>
                  {c.grupo ? celda(valorColumna(resumen.totales, c), { grupo: c.clave }) : numero(valorColumna(resumen.totales, c))}
                </td>
              ))}
              {conValor && (
                <td className="px-2 py-2 sm:px-3">
                  <Valor usd={resumen.valor.usd} cabezas={resumen.totales.total} completo={resumen.valor.completo} />
                </td>
              )}
              <td className="px-2 py-2 sm:px-3 text-lg">{formatNumero(resumen.totales.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {resumen.porGrupo?.length > 0 && (
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
                    {g.valorUsd > 0 && ` · ${formatUsd(g.valorUsd)}`}
                  </p>
                  <p className="mt-1 text-sm">
                    {g.cabHa == null ? (
                      <span className="text-suelo-500">Sin hectáreas: no se calcula la carga</span>
                    ) : (
                      <>
                        {formatNumero(g.cabHa, 2)} cab/ha ·{' '}
                        {g.kilosCompletos ? (
                          `${g.kilosEstimados ? '≈' : ''}${formatNumero(g.ugHa, 2)} UG/ha`
                        ) : (
                          <span className="text-amber-800">UG incompletas (faltan pesos)</span>
                        )}
                      </>
                    )}
                  </p>
                </Link>
              ))}
          </div>
          <p className="mt-2 text-xs text-suelo-500">
            La carga se calcula solo con los potreros que tienen hectáreas confirmadas. 1 UG = {formatNumero(resumen.kgPorUg)} kg de peso vivo. ≈: algunos
            lotes no tienen peso y se usa el peso promedio de su categoría.
          </p>
        </section>
      )}
    </div>
  );
}
