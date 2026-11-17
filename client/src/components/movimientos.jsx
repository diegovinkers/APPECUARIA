import { Link } from 'react-router-dom';
import { formatFecha, formatNumero } from './pecuaria';

const TIPO = {
  SUMAR: ['Entre lotes', 'bg-sky-500/15 text-sky-300'],
  NUEVO: ['Lote nuevo', 'bg-emerald-500/15 text-emerald-300'],
  ENTERO: ['Lote entero', 'bg-violet-500/15 text-violet-300'],
  CATEGORIA: ['Categoría', 'bg-amber-500/15 text-amber-300'],
  REVERSION: ['Reversión', 'bg-zinc-600/40 text-zinc-300'],
};

const LoteLink = ({ lote }) => (
  <Link to={`/pecuaria/lotes/${lote.id}`} className="text-sky-300 hover:underline">
    {lote.nombre}
  </Link>
);

const peso = (m) => (m.pesoPromedioKg ? ` de ${formatNumero(m.pesoPromedioKg)} kg` : '');

// Lo que agregan las entradas y salidas: causa, guía, otro campo, madres.
function Extras({ m }) {
  const partes = [
    m.causa && `Causa: ${m.causa.codigo} · ${m.causa.nombre}`,
    m.guia && `Guía ${m.guia}`,
    m.campoOtro && `${m.modo === 'ENTRADA' ? 'Desde' : 'Hacia'} ${m.campoOtro.sigla} (${m.campoOtro.nombre})`,
    m.loteMadres && `Madres: ${m.loteMadres.nombre}`,
  ].filter(Boolean);
  return partes.length ? <p className="mt-1 text-zinc-400">{partes.join(' · ')}</p> : null;
}

// Un movimiento, contado en una línea. onRevertir: si se pasa y se puede, muestra el botón.
export function MovimientoItem({ m, onRevertir }) {
  // Las entradas y salidas muestran su tipo (Muerte, Compra...).
  const [tipo, color] =
    m.modo === 'ENTRADA'
      ? [m.tipo.nombre, 'bg-emerald-500/15 text-emerald-300']
      : m.modo === 'SALIDA'
        ? [m.tipo.nombre, 'bg-red-500/15 text-red-300']
        : (TIPO[m.modo] ?? [m.modo, '']);
  const cambiaCategoria = m.categoriaOrigen !== m.categoriaDestino;
  let texto;
  if (m.modo === 'ENTRADA') {
    texto = (
      <>
        <strong className="text-emerald-300">+{formatNumero(m.cabezas)}</strong> {m.categoriaDestino}
        {peso(m)} → {m.potreroDestino.nombre} (<LoteLink lote={m.loteDestino} />)
      </>
    );
  } else if (m.modo === 'SALIDA') {
    texto = (
      <>
        <strong className="text-red-300">−{formatNumero(m.cabezas)}</strong> {m.categoriaOrigen}
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
        {cambiaCategoria && <span className="text-amber-300"> · pasan a {m.categoriaDestino}</span>}
      </>
    );
  }
  return (
    <li className={`rounded-lg border border-zinc-800 px-4 py-3 text-sm ${m.revertido ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{formatFecha(m.fecha)}</span>
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${color}`}>{tipo}</span>
        {m.revertido && <span className="rounded bg-red-500/15 px-2 py-0.5 text-xs text-red-300">revertido</span>}
        {m.usuario && <span className="text-xs text-zinc-500">{m.usuario}</span>}
      </div>
      <p className="mt-1">{texto}</p>
      <Extras m={m} />
      {m.nota && <p className="mt-1 text-zinc-400">{m.modo === 'ENTRADA' || m.modo === 'SALIDA' ? 'Comentario' : 'Motivo'}: {m.nota}</p>}
      {onRevertir && m.puedeRevertir && (
        <button type="button" onClick={() => onRevertir(m)} className="mt-2 text-xs text-red-300 hover:underline">
          Revertir
        </button>
      )}
    </li>
  );
}
