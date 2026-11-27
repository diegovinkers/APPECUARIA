import { Link } from 'react-router-dom';
import { Dato, aprox, formatDiaMes, formatFecha, formatNumero, formatUsd, formatUsdCorto, textoFaltan, textoPrecio } from './pecuaria';
import { celda } from './tabla';
import { Plata } from './Plata';
import { Seccion } from './ResumenCampo';

// La vista del feedlot en el Resumen (pedido de Diego, 19/11): una tabla por
// corral con los días de encierre, el peso estimado de hoy, la salida
// probable, los cm de comedero por cabeza y el valor. Los cálculos vienen
// hechos del servidor (feedlot.service.js); acá solo se muestran. Lo que no se
// puede calcular (falta la fecha o el peso de entrada) va con "—".
// Pensada para el celular (375 px): las columnas "solo en la compu" se
// esconden y su dato va como segunda línea, chica, como en Potreros.
// La salida: "atrasado N d" en ámbar fuerte si ya pasó; en ámbar suave si
// falta menos de una semana (20/11). Abajo, las últimas ventas de los corrales.
// Con una pesada (eventos, 20/11), el peso de hoy sale de la última pesada y se
// ve la ganancia diaria real (GMD real) entre la entrada (o la pesada anterior) y esa.

const SOLO_COMPU = 'hidden md:table-cell';
const segundaBase = 'block text-[11px] font-normal leading-4';
const segunda = `${segundaBase} text-suelo-500`;
const AMBAR = 'text-amber-800';
// Atrasado: la salida probable ya pasó.
const AMBAR_FUERTE = 'bg-amber-200/70 font-bold text-amber-900';

// "atrasado 12 d" (la salida ya pasó), o lo que falta: "en 20 d", "hoy".
export const textoSalida = (f) => (f.atrasado ? `atrasado ${formatNumero(-f.diasParaSalida)} d` : textoFaltan(f.diasParaSalida));

// La diferencia entre el peso real y el estimado: "+16,5" o "−3".
export const textoDiferencia = (n) => (n == null ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatNumero(Math.abs(n), 1)}`);

// El nombre del corral, con la sigla del feedlot adelante si son todos.
export const nombreCorral = (fila, todas) => (todas && fila.campo?.sigla ? `${fila.campo.sigla} ${fila.corral}` : fila.corral);

export default function FeedlotAnalisis({ analisis, todas = false, onElegir }) {
  const { filas, vacios, totales } = analisis;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-3">
        <Dato valor={formatNumero(totales.cabezas)} etiqueta="cabezas" />
        <Dato valor={formatNumero(totales.corrales)} etiqueta={totales.corrales === 1 ? 'corral' : 'corrales'} />
        <Dato valor={totales.diasPromedio == null ? '—' : formatNumero(totales.diasPromedio)} etiqueta="días promedio" />
        <Dato valor={totales.valorUsd > 0 ? <Plata>{formatUsdCorto(totales.valorUsd)}</Plata> : '—'} etiqueta={totales.valorCompleto ? 'USD de valor' : 'USD (incompleto)'} />
        <Dato valor={formatNumero(totales.atrasados)} etiqueta={totales.atrasados === 1 ? 'atrasado' : 'atrasados'} />
        <Dato valor={formatNumero(totales.proximos)} etiqueta="salen en 30 días" />
      </div>

      {todas && analisis.feedlots?.length > 0 && (
        <ul className="divide-y divide-suelo-200 overflow-hidden rounded-lg border border-suelo-200 bg-superficie">
          {analisis.feedlots.map((f) => (
            <li key={f.id}>
              <button type="button" onClick={() => onElegir?.(f.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-campo-50">
                <span>
                  <span className="block font-medium">{f.nombre}</span>
                  <span className="block text-xs text-suelo-500">
                    {f.corrales} {f.corrales === 1 ? 'corral' : 'corrales'}
                    {f.valorUsd > 0 && (
                      <>
                        {' · '}
                        <Plata>{formatUsd(f.valorUsd)}</Plata>
                      </>
                    )}
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

      <h2 className="!mt-8 text-xs font-semibold uppercase tracking-wider text-suelo-500">Por corral</h2>
      {filas.length === 0 ? (
        <p className="text-suelo-600">Todavía no hay animales en los corrales.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-suelo-200 bg-superficie">
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
                <th className={`${celda} ${SOLO_COMPU} text-right`} title="Ganancia diaria real: entre la entrada (o la pesada anterior) y la última pesada">
                  GMD real
                </th>
                <th className={`${celda} ${SOLO_COMPU} text-right`}>cm comedero/cab</th>
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
      {totales.gmdRealPromedio != null && (
        <p className="text-sm text-suelo-700" data-testid="gmd-real">
          Ganancia diaria real de los lotes pesados: <strong>{formatNumero(totales.gmdRealPromedio, 2)} kg por día</strong> (la esperada es {formatNumero(analisis.gmdKg, 2)}).
        </p>
      )}
      <p className="text-xs text-suelo-500">
        Datos al {formatFecha(analisis.fecha)}. Peso estimado = peso de entrada (o de la última pesada) + días × {formatNumero(analisis.gmdKg, 2)} kg por día (≈). Salida probable = entrada +{' '}
        {formatNumero(analisis.cicloDias)} días: "atrasado" si ya pasó; en ámbar si falta menos de una semana. Se cambian en{' '}
        <Link to="/pecuaria/configuracion" className="text-campo-700 hover:underline">
          Configuración
        </Link>
        .
      </p>

      <UltimasVentas ventas={analisis.ventas ?? []} todas={todas} hoy={analisis.hoy} />
    </div>
  );
}

// Las ventas que salieron de los corrales en los últimos 90 días: el peso
// real contra el estimado a esa fecha, el precio y el valor real. "—" si falta.
function UltimasVentas({ ventas, todas, hoy }) {
  return (
    <Seccion titulo="Últimas ventas" testid="ultimas-ventas">
      {ventas.length === 0 ? (
        <p className="text-sm text-suelo-600">No hubo ventas desde los corrales en los últimos 90 días.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-suelo-200 bg-superficie">
          <table className="w-full text-xs tabular-nums sm:text-sm">
            <thead className="bg-suelo-200/70 text-suelo-600">
              <tr>
                <th className={`${celda} text-left`}>Fecha</th>
                <th className={`${celda} text-left`}>Corral</th>
                <th className={`${celda} ${SOLO_COMPU} text-left`}>Categoría</th>
                <th className={`${celda} text-right`}>Cab.</th>
                <th className={`${celda} text-right`} title="Peso de salida">
                  <span className="md:hidden">Peso</span>
                  <span className="hidden md:inline">Peso real</span>
                </th>
                <th className={`${celda} ${SOLO_COMPU} text-right`} title="Peso de entrada + días × ganancia diaria, a la fecha de la venta">
                  Peso estimado
                </th>
                <th className={`${celda} ${SOLO_COMPU} text-right`}>Diferencia</th>
                <th className={`${celda} ${SOLO_COMPU} text-right`}>Precio</th>
                <th className={`${celda} text-right`}>
                  <span className="md:hidden">USD</span>
                  <span className="hidden md:inline">Valor USD</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-suelo-200">
              {ventas.map((v) => (
                <tr key={v.movimientoId} data-testid="fila-venta">
                  <td className={`${celda} text-left`}>
                    <span className="md:hidden">{formatDiaMes(v.fecha, hoy)}</span>
                    <span className="hidden md:inline">{formatFecha(v.fecha)}</span>
                  </td>
                  <td className={`${celda} text-left`}>
                    {nombreCorral(v, todas)}
                    <span className={`${segunda} md:hidden`}>{v.categoria ?? '—'}</span>
                  </td>
                  <td className={`${celda} ${SOLO_COMPU} text-left`}>{v.categoria ?? '—'}</td>
                  <td className={`${celda} text-right`}>{formatNumero(v.cabezas)}</td>
                  <td className={`${celda} text-right`}>
                    {v.pesoRealKg == null ? '—' : formatNumero(v.pesoRealKg, 1)}
                    {/* En el celular: el estimado y la diferencia, debajo. */}
                    {v.pesoEstimadoKg != null && (
                      <span className={`${segunda} md:hidden`}>
                        ≈{formatNumero(v.pesoEstimadoKg, 1)}
                        {v.diferenciaKg != null && ` (${textoDiferencia(v.diferenciaKg)})`}
                      </span>
                    )}
                  </td>
                  <td className={`${celda} ${SOLO_COMPU} text-right`}>{v.pesoEstimadoKg == null ? '—' : `≈${formatNumero(v.pesoEstimadoKg, 1)}`}</td>
                  <td className={`${celda} ${SOLO_COMPU} text-right`}>{textoDiferencia(v.diferenciaKg)}</td>
                  <td className={`${celda} ${SOLO_COMPU} text-right`}>{textoPrecio(v.precioVentaUsd, v.precioVentaPor)}</td>
                  <td className={`${celda} text-right`}>
                    {v.valorVentaUsd == null ? '—' : <Plata>{formatUsdCorto(v.valorVentaUsd)}</Plata>}
                    {v.precioVentaUsd != null && <span className={`${segunda} md:hidden`}>{textoPrecio(v.precioVentaUsd, v.precioVentaPor)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-suelo-500">Ventas de los últimos 90 días, sin las revertidas. El precio se carga al registrar la salida.</p>
    </Seccion>
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
        {/* En el celular: la categoría y los cm de comedero por cabeza (25/11: en cm, como en Corrales). */}
        <span className={`${segunda} md:hidden`}>
          {f.categoria}
          {f.cmComederoPorCabeza != null && ` · ${formatNumero(f.cmComederoPorCabeza)} cm/cab`}
        </span>
      </td>
      <td className={`${celda} ${SOLO_COMPU} text-left`}>{f.categoria}</td>
      <td className={`${celda} text-right`}>{formatNumero(f.cabezas)}</td>
      <td className={`${celda} text-right`}>{formatNumero(f.diasEncierre)}</td>
      <td className={`${celda} ${SOLO_COMPU} text-right`}>{f.pesoEntradaKg == null ? '—' : formatNumero(f.pesoEntradaKg)}</td>
      <td className={`${celda} text-right`}>
        {f.pesoEstimadoKg == null ? '—' : `≈${formatNumero(f.pesoEstimadoKg)}`}
        {/* Con pesada: de cuándo es (y en el celular, la GMD real). Si no, el peso de entrada (celular). */}
        {f.ultimaPesada ? (
          <span className={segunda} data-testid="ultima-pesada">
            pesada {formatDiaMes(f.ultimaPesada.fecha, hoy)}
            {f.gmdRealKg != null && <span className="md:hidden"> · {formatNumero(f.gmdRealKg, 2)}/d</span>}
          </span>
        ) : (
          f.pesoEntradaKg != null && <span className={`${segunda} md:hidden`}>de {formatNumero(f.pesoEntradaKg)}</span>
        )}
      </td>
      <td className={`${celda} text-right ${f.atrasado ? AMBAR_FUERTE : f.salidaCerca ? `${AMBAR} font-semibold` : ''}`} data-testid="salida">
        <span className="md:hidden">{formatDiaMes(f.salidaProbable, hoy)}</span>
        <span className="hidden md:inline">{formatFecha(f.salidaProbable)}</span>
        {f.diasParaSalida != null && (
          <span className={f.atrasado ? `${segundaBase} font-bold text-amber-900` : f.salidaCerca ? `${segundaBase} ${AMBAR}` : segunda}>{textoSalida(f)}</span>
        )}
      </td>
      <td className={`${celda} ${SOLO_COMPU} text-right`}>{f.gmdRealKg == null ? '—' : `${formatNumero(f.gmdRealKg, 2)} kg`}</td>
      <td className={`${celda} ${SOLO_COMPU} text-right`}>{f.cmComederoPorCabeza == null ? '—' : formatNumero(f.cmComederoPorCabeza)}</td>
      <td className={`${celda} ${SOLO_COMPU} text-right`}>
        <Plata>
          {valor}
          {f.valorUsd > 0 && !f.valorCompleto && <span className={AMBAR}>*</span>}
        </Plata>
      </td>
    </tr>
  );
}
