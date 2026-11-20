import { Link } from 'react-router-dom';
import { formatFecha, formatNumero, textoVenta } from './pecuaria';

const TIPO = {
  SUMAR: ['Entre lotes', 'bg-campo-100 text-campo-700'],
  NUEVO: ['Lote nuevo', 'bg-emerald-500/15 text-emerald-800'],
  ENTERO: ['Lote entero', 'bg-violet-500/15 text-violet-800'],
  CATEGORIA: ['Categoría', 'bg-amber-500/15 text-amber-800'],
  REVERSION: ['Reversión', 'bg-suelo-200 text-suelo-700'],
};

const LoteLink = ({ lote }) => (
  <Link to={`/pecuaria/lotes/${lote.id}`} className="text-campo-700 hover:underline">
    {lote.nombre}
  </Link>
);

const peso = (m) => (m.pesoPromedioKg ? ` de ${formatNumero(m.pesoPromedioKg)} kg` : '');

const NOMBRE_EVENTO = { MULTIPLE: 'movimiento múltiple', ENTRE_CAMPOS: 'movimiento entre campos', REVERSION: 'reversión' };

// Entre campos: "La Gateada → La Seda" (el campo de cada potrero).
function entreCampos(m) {
  const nombre = (potrero) => [m.campo, m.campoOtro].find((c) => c?.id === potrero?.campoId)?.nombre;
  return `Entre campos: ${nombre(m.potreroOrigen) ?? '?'} → ${nombre(m.potreroDestino) ?? '?'}`;
}

// Lo que agregan las entradas, salidas y eventos: causa, guía, otro campo,
// madres, y si es un paso de un movimiento múltiple o entre campos.
function Extras({ m }) {
  const deOtroCampo = m.campoOtro && m.potreroOrigen && m.potreroDestino;
  const partes = [
    m.evento && `Parte de un ${NOMBRE_EVENTO[m.evento.tipo] ?? 'evento'} (#${m.evento.id}): se revierte entero, desde Movimientos`,
    m.causa && `Causa: ${m.causa.codigo} · ${m.causa.nombre}`,
    m.guia && `Guía ${m.guia}`,
    textoVenta(m) && `Venta: ${textoVenta(m)}`,
    deOtroCampo ? entreCampos(m) : m.campoOtro && `${m.modo === 'ENTRADA' ? 'Desde' : 'Hacia'} ${m.campoOtro.sigla} (${m.campoOtro.nombre})`,
    m.loteMadres && `Madres: ${m.loteMadres.nombre}`,
  ].filter(Boolean);
  return partes.length ? <p className="mt-1 text-suelo-600">{partes.join(' · ')}</p> : null;
}

// Un movimiento, contado en una línea. onRevertir: si se pasa y se puede, muestra el botón.
export function MovimientoItem({ m, onRevertir }) {
  // Las entradas y salidas muestran su tipo (Muerte, Compra...).
  const [tipo, color] =
    m.modo === 'ENTRADA'
      ? [m.tipo.nombre, 'bg-emerald-500/15 text-emerald-800']
      : m.modo === 'SALIDA'
        ? [m.tipo.nombre, 'bg-red-500/15 text-red-700']
        : m.tipo?.clave === 'DESTETE'
          ? [m.tipo.nombre, 'bg-sky-500/15 text-sky-800']
          : (TIPO[m.modo] ?? [m.modo, '']);
  const cambiaCategoria = m.categoriaOrigen !== m.categoriaDestino;
  let texto;
  if (m.modo === 'ENTRADA') {
    texto = (
      <>
        <strong className="text-emerald-800">+{formatNumero(m.cabezas)}</strong> {m.categoriaDestino}
        {peso(m)} → {m.potreroDestino.nombre} (<LoteLink lote={m.loteDestino} />)
      </>
    );
  } else if (m.modo === 'SALIDA') {
    texto = (
      <>
        <strong className="text-red-700">−{formatNumero(m.cabezas)}</strong> {m.categoriaOrigen}
        {peso(m)} de {m.potreroOrigen.nombre} (<LoteLink lote={m.loteOrigen} />)
      </>
    );
  } else if (m.modo === 'REVERSION' && !m.potreroOrigen) {
    texto = (
      <>
        Se deshizo una salida: vuelven {formatNumero(m.cabezas)} {m.categoriaDestino} a {m.potreroDestino.nombre} (lote <LoteLink lote={m.loteDestino} />)
      </>
    );
  } else if (m.modo === 'REVERSION' && !m.potreroDestino) {
    texto = (
      <>
        Se deshizo una entrada: se quitan {formatNumero(m.cabezas)} {m.categoriaOrigen} de {m.potreroOrigen.nombre} (lote <LoteLink lote={m.loteOrigen} />)
      </>
    );
  } else if (m.modo === 'CATEGORIA') {
    texto = (
      <>
        Lote <LoteLink lote={m.loteOrigen} /> ({formatNumero(m.cabezas)} cab, en {m.potreroOrigen.nombre}): {m.categoriaOrigen} → {m.categoriaDestino}
      </>
    );
  } else if (m.modo === 'REVERSION') {
    texto = (
      <>
        Se deshizo un movimiento: {formatNumero(m.cabezas)} {m.categoriaOrigen} vuelven de {m.potreroOrigen.nombre} a {m.potreroDestino.nombre} (lote{' '}
        <LoteLink lote={m.loteDestino} />)
      </>
    );
  } else {
    texto = (
      <>
        {formatNumero(m.cabezas)} {m.categoriaOrigen}
        {m.pesoPromedioKg ? ` de ${formatNumero(m.pesoPromedioKg)} kg` : ''}: {m.potreroOrigen.nombre} (<LoteLink lote={m.loteOrigen} />) →{' '}
        {m.potreroDestino.nombre} (<LoteLink lote={m.loteDestino} />)
        {cambiaCategoria && <span className="text-amber-800"> · pasan a {m.categoriaDestino}</span>}
      </>
    );
  }
  return (
    <li className={`rounded-lg border border-suelo-200 px-4 py-3 text-sm ${m.revertido ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{formatFecha(m.fecha)}</span>
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${color}`}>{tipo}</span>
        {m.revertido && <span className="rounded bg-red-500/15 px-2 py-0.5 text-xs text-red-700">revertido</span>}
        {m.usuario && <span className="text-xs text-suelo-500">{m.usuario}</span>}
      </div>
      <p className="mt-1">{texto}</p>
      <Extras m={m} />
      {m.nota && <p className="mt-1 text-suelo-600">{m.modo === 'ENTRADA' || m.modo === 'SALIDA' ? 'Comentario' : 'Motivo'}: {m.nota}</p>}
      {onRevertir && m.puedeRevertir && (
        <button type="button" onClick={() => onRevertir(m)} className="mt-2 text-xs text-red-700 hover:underline">
          Revertir
        </button>
      )}
    </li>
  );
}

// Un evento (pesada, vacuna...) en el historial de un lote o de un potrero.
// Anulado: queda, tachado.
export function EventoItem({ e, conPotrero = false }) {
  return (
    <li className={`rounded-lg border border-sky-200 bg-sky-50/40 px-4 py-3 text-sm ${e.anulado ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{formatFecha(e.fecha)}</span>
        <span className={`rounded bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-800 ${e.anulado ? 'line-through' : ''}`}>{e.tipo.nombre}</span>
        {e.anulado && <span className="rounded bg-red-500/15 px-2 py-0.5 text-xs text-red-700">anulado</span>}
        {e.usuario && <span className="text-xs text-suelo-500">{e.usuario}</span>}
      </div>
      <p className={`mt-1 ${e.anulado ? 'line-through' : ''}`}>
        {formatNumero(e.cabezas)} {e.categoria ?? 'cab'}
        {conPotrero && e.lote && (
          <>
            {' '}
            · lote <LoteLink lote={e.lote} />
          </>
        )}
        {e.texto ? ` · ${e.texto}` : ''}
      </p>
      {e.nota && <p className="mt-1 text-suelo-600">Nota: {e.nota}</p>}
    </li>
  );
}
