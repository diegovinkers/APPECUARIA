// La tabla de la ficha del potrero (pedido del jefe, 24/11): una fila por
// cambio del stock, la más nueva arriba, con las mismas columnas que la tabla
// de Potreros (cabezas, peso, kg/ha, cab/ha). Cada número es el de después del
// cambio y, chico debajo, cuánto cambió contra la fila anterior. Tocar una
// fila la despliega: los lotes de ese momento, la nota y quién lo cargó.
import { Fragment, useState } from 'react';
import { aprox, formatDiaMes, formatFecha, formatNumero } from './pecuaria';
import { celda } from './tabla';
import { altura } from './pasto';

export const FILAS_INICIALES = 15;
const SOLO_COMPU = 'hidden md:table-cell';
const titulo = 'sticky top-0 z-10 border-b border-r border-suelo-300 bg-suelo-100 px-1.5 py-1.5 font-medium last:border-r-0 md:px-2';

// "+5", "−100", "+0,06". Sin cambio (o sin dato), null: no se muestra nada.
export function textoCambio(n, decimales = 0) {
  if (n == null) return null;
  const redondeado = Number(n.toFixed(decimales));
  if (redondeado === 0) return null;
  return `${redondeado > 0 ? '+' : '−'}${formatNumero(Math.abs(redondeado), decimales)}`;
}

// El título ("Entraron 5", "Salieron 5") lleva el mismo color que el cambio de
// cabezas: verde si entraron, tierra si salieron. Sin cambio de cabezas (una
// pesada, un cambio de categoría, la planilla), sin color.
export function colorTitulo(v) {
  const n = v.cambio?.cabezas;
  if (!n) return '';
  return n > 0 ? 'text-campo-700' : 'text-tierra-600';
}

// Las columnas de números: [clave, título, título corto, decimales].
export const COLUMNAS = [
  ['cabezas', 'Cabezas', 'Cab.', 0],
  ['pesoPromedio', 'Peso prom.', 'Peso', 0],
  ['kgPvHa', 'kg/ha', 'kg/ha', 0],
  ['cabHa', 'cab/ha', 'cab/ha', 2],
];

export default function HistorialPotrero({ versiones, hoy = new Date().toLocaleDateString('sv-SE') }) {
  const [abierta, setAbierta] = useState(null);
  const [cuantas, setCuantas] = useState(FILAS_INICIALES);
  if (!versiones.length) {
    return <p className="rounded-lg border border-dashed border-suelo-300 p-4 text-center text-sm text-suelo-600">Todavía no hay movimientos.</p>;
  }
  const visibles = versiones.slice(0, cuantas);
  return (
    <>
      <div className="overflow-hidden rounded-lg border border-suelo-300 bg-superficie" data-testid="tabla-historial">
        <table className="w-full table-fixed border-separate border-spacing-0 text-left text-[15px] md:table-auto">
          <thead className="text-xs text-suelo-600">
            <tr>
              <th scope="col" className={titulo}>
                Qué pasó
              </th>
              <th scope="col" className={`${titulo} ${SOLO_COMPU}`}>
                Quién
              </th>
              {COLUMNAS.map(([clave, largo, corto]) => (
                <th key={clave} scope="col" className={`${titulo} text-right ${clave === 'cabezas' ? 'w-12' : clave === 'cabHa' ? 'w-[3.25rem]' : 'w-11'} md:w-auto`}>
                  <span className="hidden md:inline">{largo}</span>
                  <span className="md:hidden">{corto}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map((v, i) => (
              <Fragment key={v.id}>
                <Fila v={v} par={i % 2 === 1} hoy={hoy} abierta={abierta === v.id} onTocar={() => setAbierta(abierta === v.id ? null : v.id)} />
                {abierta === v.id && <Detalle v={v} />}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {versiones.length > cuantas && (
        <button type="button" onClick={() => setCuantas((n) => n + FILAS_INICIALES)} className="mt-2 w-full rounded-md py-2 text-sm text-campo-700 hover:bg-suelo-100">
          Ver más ({formatNumero(versiones.length - cuantas)} más)
        </button>
      )}
    </>
  );
}

function Fila({ v, par, hoy, abierta, onTocar }) {
  const fondo = abierta ? 'bg-campo-50' : par ? 'bg-suelo-50' : 'bg-superficie';
  const c = v.carga ?? {};
  return (
    <tr onClick={onTocar} aria-expanded={abierta} className="cursor-pointer hover:[&>td]:bg-campo-50" data-testid="fila-historial">
      <td className={`${celda} ${fondo} align-middle`}>
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="shrink-0 text-xs tabular-nums text-suelo-500">
            <span className="md:hidden">{formatDiaMes(v.fecha, hoy)}</span>
            <span className="hidden md:inline">{formatFecha(v.fecha)}</span>
          </span>
          <span className={`truncate font-semibold ${colorTitulo(v)}`} data-testid="titulo-historial">
            {v.titulo}
          </span>
        </div>
        {v.detalle && (
          <p className="truncate text-xs text-suelo-600 md:whitespace-normal" title={v.detalle}>
            {v.detalle}
          </p>
        )}
      </td>
      <td className={`${celda} ${fondo} ${SOLO_COMPU} align-middle text-xs text-suelo-600`}>{v.usuario ?? '—'}</td>
      {COLUMNAS.map(([clave, , , dec]) => {
        const valor = c[clave];
        const vacio = valor == null || (clave !== 'cabezas' && clave !== 'cabHa' && !c.cabezas);
        const cambio = textoCambio(v.cambio?.[clave], dec);
        const estimado = c.kilosEstimados && (clave === 'pesoPromedio' || clave === 'kgPvHa');
        return (
          <td key={clave} className={`${celda} ${fondo} align-middle whitespace-nowrap text-right tabular-nums ${clave === 'cabezas' ? 'font-semibold' : ''}`}>
            <span className="block">{vacio ? '—' : aprox(estimado, formatNumero(valor, dec))}</span>
            {cambio && (
              <span className={`block text-xs font-normal ${cambio.startsWith('+') ? 'text-campo-700' : 'text-tierra-600'}`} data-testid={`cambio-${clave}`}>
                {cambio}
              </span>
            )}
          </td>
        );
      })}
    </tr>
  );
}

// La fila desplegada: el texto completo, los lotes de ese momento, la nota y quién.
function Detalle({ v }) {
  return (
    <tr data-testid="detalle-historial">
      <td colSpan={6} className="border-b border-suelo-200 bg-campo-50 px-3 py-2 text-sm">
        {(v.movimiento || v.evento) && <p className="text-suelo-800">{v.movimiento ?? v.evento}</p>}
        {v.importacion && (
          <p className="text-suelo-700">
            Planilla {v.importacion.archivo} ({v.importacion.hoja})
          </p>
        )}
        <p className="mt-1 text-suelo-700">
          {v.lineas.length ? v.lineas.map((l) => `${l.lote}: ${formatNumero(l.cabezas)} ${l.categoria}`).join(' · ') : 'Quedó vacío'}
        </p>
        {v.pasto && (
          // El pasto anotado con el movimiento (26/11).
          <p className="mt-1 text-suelo-700" data-testid="pasto-historial">
            Pasto{' '}
            {[v.pasto.salida && `al salir: ${altura(v.pasto.salida)?.nombre}`, v.pasto.entrada && `al entrar: ${altura(v.pasto.entrada)?.nombre}`].filter(Boolean).join(' · ')}
          </p>
        )}
        {v.nota && <p className="mt-1 text-suelo-600">Nota: {v.nota}</p>}
        <p className="mt-1 text-xs text-suelo-500">
          {formatFecha(v.fecha)}
          {v.usuario ? ` · ${v.usuario}` : ''}
        </p>
      </td>
    </tr>
  );
}
