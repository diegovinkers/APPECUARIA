import { Link } from 'react-router-dom';
import { Dato, aprox, formatDiaMes, formatFecha, formatMetros, formatNumero, formatUsd, formatUsdCorto, textoFaltan } from './pecuaria';
import { celda } from './tabla';

// La vista del feedlot en el Resumen (pedido de Diego, 19/11): una tabla por
// corral con los días de encierre, el peso estimado de hoy, la salida
// probable, los metros de comedero por cabeza y el valor. Los cálculos vienen
// hechos del servidor (feedlot.service.js); acá solo se muestran. Lo que no se
// puede calcular (falta la fecha o el peso de entrada) va con "—".
// Pensada para el celular (375 px): las columnas "solo en la compu" se
// esconden y su dato va como segunda línea, chica, como en Potreros.

const SOLO_COMPU = 'hidden md:table-cell';
const segundaBase = 'block text-[11px] font-normal leading-4';
const segunda = `${segundaBase} text-suelo-500`;
const AMBAR = 'text-amber-800';

// El nombre del corral, con la sigla del feedlot adelante si son todos.
export const nombreCorral = (fila, todas) => (todas && fila.campo?.sigla ? `${fila.campo.sigla} ${fila.corral}` : fila.corral);

export default function FeedlotAnalisis({ analisis, todas = false, onElegir }) {
  const { filas, vacios, totales } = analisis;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3">
        <Dato valor={formatNumero(totales.cabezas)} etiqueta="cabezas" />
        <Dato valor={formatNumero(totales.corrales)} etiqueta={totales.corrales === 1 ? 'corral' : 'corrales'} />
        <Dato valor={totales.diasPromedio == null ? '—' : formatNumero(totales.diasPromedio)} etiqueta="días promedio" />
        <Dato valor={totales.valorUsd > 0 ? formatUsdCorto(totales.valorUsd) : '—'} etiqueta={totales.valorCompleto ? 'USD de valor' : 'USD (incompleto)'} />
        <Dato valor={formatNumero(totales.salenEn30)} etiqueta="salen en 30 días" />
      </div>

      {todas && analisis.feedlots?.length > 0 && (
        <ul className="divide-y divide-suelo-200 overflow-hidden rounded-lg border border-suelo-200 bg-white">
          {analisis.feedlots.map((f) => (
            <li key={f.id}>
              <button type="button" onClick={() => onElegir?.(f.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-campo-50">
                <span>
                  <span className="block font-medium">{f.nombre}</span>
                  <span className="block text-xs text-suelo-500">
                    {f.corrales} {f.corrales === 1 ? 'corral' : 'corrales'}
                    {f.valorUsd > 0 && ` · ${formatUsd(f.valorUsd)}`}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-lg font-bold tabular-nums">{formatNumero(f.cabezas)}</span>
                  <span className="block text-xs text-suelo-500">cabezas</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {filas.length === 0 ? (
        <p className="text-suelo-600">Todavía no hay animales en los corrales.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-suelo-200 bg-white">
          <table className="w-full text-xs tabular-nums sm:text-sm" data-testid="tabla-feedlot">
            <thead className="bg-suelo-200/70 text-suelo-600">
              <tr>
                <th className={`${celda} text-left`}>Corral</th>
                <th className={`${celda} ${SOLO_COMPU} text-left`}>Categoría</th>
                <th className={`${celda} text-right`}>
                  <span className="md:hidden">Cab.</span>
                  <span className="hidden md:inline">Cabezas</span>
                </th>
                <th className={`${celda} text-right`} title="Días de encierre">
                  Días
                </th>
                <th className={`${celda} ${SOLO_COMPU} text-right`}>Peso entrada</th>
                <th className={`${celda} text-right`} title="Peso estimado hoy: entrada + días × ganancia diaria">
                  <span className="md:hidden">Peso hoy</span>
                  <span className="hidden md:inline">Peso estimado hoy</span>
                </th>
                <th className={`${celda} text-right`}>
                  <span className="md:hidden">Salida</span>
                  <span className="hidden md:inline">Salida probable</span>
                </th>
                <th className={`${celda} ${SOLO_COMPU} text-right`}>m comedero/cab</th>
                <th className={`${celda} ${SOLO_COMPU} text-right`}>Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-suelo-200">
              {filas.map((f) => (
                <FilaCorral key={f.loteId} f={f} todas={todas} hoy={analisis.hoy} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {vacios.length > 0 && (
        <p className="text-sm text-suelo-600" data-testid="corrales-vacios">
          Vacíos: {vacios.map((v) => nombreCorral(v, todas)).join(', ')}
        </p>
      )}
      <p className="text-xs text-suelo-500">
        Datos al {formatFecha(analisis.fecha)}. Peso estimado = peso de entrada + días × {formatNumero(analisis.gmdKg, 2)} kg por día (≈). Salida probable = entrada +{' '}
        {formatNumero(analisis.cicloDias)} días; en ámbar si ya pasó o falta menos de una semana. Se cambian en{' '}
        <Link to="/pecuaria/configuracion" className="text-campo-700 hover:underline">
          Configuración
        </Link>
        .
      </p>
    </div>
  );
}

function FilaCorral({ f, todas, hoy }) {
  const valor = f.valorUsd > 0 ? aprox(f.valorAprox, formatUsdCorto(f.valorUsd)) : '—';
  return (
    <tr data-testid="fila-corral">
      <td className={`${celda} text-left`}>
        <Link to={`/pecuaria/potreros/${f.corralId}`} className="font-medium text-campo-700 hover:underline">
          {nombreCorral(f, todas)}
        </Link>
        {/* En el celular: la categoría y los metros de comedero por cabeza. */}
        <span className={`${segunda} md:hidden`}>
          {f.categoria}
          {f.mComederoPorCabeza != null && ` · ${formatMetros(f.mComederoPorCabeza)}/cab`}
        </span>
      </td>
      <td className={`${celda} ${SOLO_COMPU} text-left`}>{f.categoria}</td>
      <td className={`${celda} text-right`}>{formatNumero(f.cabezas)}</td>
      <td className={`${celda} text-right`}>{formatNumero(f.diasEncierre)}</td>
      <td className={`${celda} ${SOLO_COMPU} text-right`}>{f.pesoEntradaKg == null ? '—' : formatNumero(f.pesoEntradaKg)}</td>
      <td className={`${celda} text-right`}>
        {f.pesoEstimadoKg == null ? '—' : `≈${formatNumero(f.pesoEstimadoKg)}`}
        {f.pesoEntradaKg != null && <span className={`${segunda} md:hidden`}>de {formatNumero(f.pesoEntradaKg)}</span>}
      </td>
      <td className={`${celda} text-right ${f.salidaCerca ? `${AMBAR} font-semibold` : ''}`} data-testid="salida">
        <span className="md:hidden">{formatDiaMes(f.salidaProbable, hoy)}</span>
        <span className="hidden md:inline">{formatFecha(f.salidaProbable)}</span>
        {f.diasParaSalida != null && <span className={f.salidaCerca ? `${segundaBase} ${AMBAR}` : segunda}>{textoFaltan(f.diasParaSalida)}</span>}
      </td>
      <td className={`${celda} ${SOLO_COMPU} text-right`}>{formatMetros(f.mComederoPorCabeza)}</td>
      <td className={`${celda} ${SOLO_COMPU} text-right`}>
        {valor}
        {f.valorUsd > 0 && !f.valorCompleto && <span className={AMBAR}>*</span>}
      </td>
    </tr>
  );
}
