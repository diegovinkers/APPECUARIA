import { Link } from 'react-router-dom';
import { BotonOjo, Plata } from './Plata';
import { formatNumero, formatUsd, formatUsdCorto } from './pecuaria';

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

// --- El Resumen ordenado en zonas (26/11, pedido de Diego) ---
// Arriba, la cabecera (cabezas, potreros y hectáreas, y el valor del ganado
// con el ojito); después, una sección por cosa (por estancia, por categoría,
// carga por grupo), cada una con su título chico y su ayuda abajo.

// Una sección del Resumen: título chico arriba, el contenido y la ayuda abajo.
export function Seccion({ titulo, ayuda, children, testid }) {
  return (
    <section className="mt-8" data-testid={testid}>
      <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-suelo-500">{titulo}</h2>
      {children}
      {ayuda && <p className="mt-2 text-xs leading-relaxed text-suelo-500">{ayuda}</p>}
    </section>
  );
}

// La cabecera: el número grande de cabezas, lo de debajo (potreros, ha) y,
// pegado abajo, el valor del ganado con el ojito.
export function Cabecera({ cabezas, detalle, valor }) {
  return (
    <div className="overflow-hidden rounded-xl border border-suelo-200 bg-superficie" data-testid="cabecera-resumen">
      <div className="px-4 py-4 sm:px-5">
        <p className="flex items-baseline gap-2">
          <span className="text-4xl font-bold leading-none tabular-nums">{cabezas}</span>
          <span className="text-base text-suelo-600">cabezas</span>
        </p>
        {detalle && <p className="mt-2 text-sm text-suelo-600">{detalle}</p>}
      </div>
      {valor && <ValorGanado valor={valor} />}
    </div>
  );
}

// El valor del ganado (con los precios de cada categoría, en Configuración),
// tapado hasta tocar el ojito.
export function ValorGanado({ valor }) {
  if (!valor) return null;
  return (
    <div className="flex items-center gap-3 border-t border-trigo-300 bg-trigo-100 px-4 py-3 sm:px-5" data-testid="valor-ganado">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-suelo-600">Valor del ganado</p>
        {valor.usd > 0 ? (
          <>
            <p className="text-2xl font-bold tabular-nums">
              <Plata>{formatUsd(valor.usd)}</Plata>
            </p>
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
      {valor.usd > 0 && <BotonOjo className="shrink-0" />}
    </div>
  );
}

// Una celda de la columna Valor: arriba lo que vale la categoría entera y,
// abajo en chico, lo que vale cada cabeza (pedido de Diego, 19/11).
function Valor({ usd, cabezas, completo }) {
  if (!(usd > 0)) return <span className="text-suelo-400" title="Sin precio en Configuración">—</span>;
  return (
    <span className="whitespace-nowrap" data-testid="valor-categoria">
      <Plata>
        {formatUsdCorto(usd)}
        {!completo && <span className="text-amber-800" title="Hay lotes sin precio o sin peso">*</span>}
        {cabezas > 0 && <span className="block text-xs font-normal leading-4 text-suelo-500">{formatNumero(usd / cabezas)}/cab</span>}
      </Plata>
    </span>
  );
}

// La ayuda de la tabla: qué es cada columna.
export function ayudaTabla(resumen) {
  if (resumen.tipo === 'FEEDLOT') {
    const etapas = columnasDe(resumen)
      .filter((c) => !c.celular)
      .map((c) => `${c.nombre}, ${c.detalle}`)
      .join(' · ');
    return `Por días de encierre: ${etapas}. El valor usa el peso estimado de hoy (≈), como la tabla por corral.`;
  }
  return 'CN: campo natural · Verdeos: pasturas sembradas (raigrás, avena, sorgo…). Tocá una categoría o un número para ver esos potreros.';
}

// La tabla del encargado: categorías × CN / Verdeos / Corral / Otro (o las
// etapas del feedlot), el valor y el total.
export function TablaResumen({ resumen }) {
  if (!resumen.filas.length) return <p className="text-suelo-600">Todavía no hay animales cargados.</p>;

  // CN y Verdeos siempre; Corral y Otro, solo si tienen animales (en el celular
  // no sobra lugar). En un feedlot, las etapas del encierre.
  const columnas = columnasDe(resumen);
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
  const td = 'px-2 py-2.5 sm:px-3';

  return (
    <div className="overflow-x-auto rounded-xl border border-suelo-200 bg-superficie">
      <table className="w-full text-right text-sm tabular-nums">
        <thead className="border-b border-suelo-200 bg-suelo-100 text-xs font-semibold text-suelo-600">
          <tr>
            <th className={`${td} text-left`}>Categoría</th>
            {columnas.map((c) => (
              <th key={c.clave} className={`${td} ${claseColumna(c)}`} title={c.detalle}>
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
            {conValor && <th className={td}>Valor USD</th>}
            <th className={`${td} text-suelo-900`}>Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-suelo-200">
          {resumen.filas.map((f) => (
            <tr key={f.categoriaId}>
              <td className={`${td} text-left font-medium`}>
                <Link to={aPotreros({ categoriaId: f.categoriaId })} className={`${linkCelda} text-campo-700`}>
                  {f.categoria}
                </Link>
              </td>
              {columnas.map((c) => (
                <td key={c.clave} className={`${td} ${claseColumna(c)}`}>
                  {c.grupo ? celda(valorColumna(f, c), { categoriaId: f.categoriaId, grupo: c.clave }) : numero(valorColumna(f, c))}
                </td>
              ))}
              {conValor && (
                <td className={td}>
                  <Valor usd={f.valorUsd} cabezas={f.total} completo={f.valorCompleto} />
                </td>
              )}
              <td className={`${td} font-semibold`}>{celda(f.total, { categoriaId: f.categoriaId })}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-suelo-300 bg-suelo-50 font-bold">
          <tr>
            <td className={`${td} text-left`}>Total</td>
            {columnas.map((c) => (
              <td key={c.clave} className={`${td} ${claseColumna(c)}`}>
                {c.grupo ? celda(valorColumna(resumen.totales, c), { grupo: c.clave }) : numero(valorColumna(resumen.totales, c))}
              </td>
            ))}
            {conValor && (
              <td className={td}>
                <Valor usd={resumen.valor.usd} cabezas={resumen.totales.total} completo={resumen.valor.completo} />
              </td>
            )}
            <td className={`${td} text-lg`}>{formatNumero(resumen.totales.total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// La carga de cada grupo de uso (CN, Verdeos…): una lista en un solo cuadro;
// cada renglón lleva a Potreros con ese grupo.
export function CargaPorGrupo({ porGrupo }) {
  // Sin animales (por ejemplo, "Otro" con potreros vacíos), no se lista.
  const grupos = (porGrupo ?? []).filter((g) => g.potreros > 0 && g.cabezas > 0);
  if (!grupos.length) return null;
  return (
    <ul className="divide-y divide-suelo-200 overflow-hidden rounded-xl border border-suelo-200 bg-superficie" data-testid="carga-por-grupo">
      {grupos.map((g) => (
        <li key={g.grupo}>
          <Link to={aPotreros({ grupo: g.grupo })} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-campo-50">
            <span className="min-w-0">
              <span className="block font-semibold">{NOMBRE_GRUPO[g.grupo]}</span>
              <span className="block text-sm text-suelo-600">
                {g.potreros} {g.potreros === 1 ? 'potrero' : 'potreros'} · {formatNumero(g.hectareas)} ha
                {g.valorUsd > 0 && (
                  <>
                    {' · '}
                    <span className="whitespace-nowrap">
                      <Plata>USD {formatUsdCorto(g.valorUsd)}</Plata>
                    </span>
                  </>
                )}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-lg font-bold tabular-nums">{formatNumero(g.cabezas)}</span>
              <span className="block text-sm text-suelo-600">{g.cabHa == null ? 'sin ha' : `${formatNumero(g.cabHa, 2)} cab/ha`}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export const AYUDA_CARGA = 'Cabezas por hectárea de cada grupo. Se calcula solo con los potreros que tienen hectáreas confirmadas.';
