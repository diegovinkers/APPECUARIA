// La tarjeta de una propuesta del asistente (fase 2,
// docs/superpowers/plans/2026-11-27-asistente-fase2.md): lo que se va a
// registrar, con la vista previa de siempre, y los botones Confirmar y
// Cancelar. Nada se registra hasta que la persona toca Confirmar; el servidor
// lo registra una sola vez, con la misma ruta que las pantallas.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { cancelarPropuesta, confirmarPropuesta } from '../api/asistente';

// El estado que se ve: una PENDIENTE que pasó la hora ya venció (el servidor
// también lo sabe, pero la pantalla puede haber quedado abierta).
export function estadoVisible(propuesta, ahora = new Date()) {
  if (propuesta.estado === 'PENDIENTE' && propuesta.venceEn && new Date(propuesta.venceEn) <= ahora) return 'VENCIDA';
  return propuesta.estado;
}

const hora = (fecha) => new Date(fecha).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Montevideo' });

// Lo que se muestra debajo cuando ya no está pendiente.
export function textoEstado(propuesta, ahora = new Date()) {
  switch (estadoVisible(propuesta, ahora)) {
    case 'CONFIRMADA':
      return '✓ Registrado';
    case 'CANCELADA':
      return 'Cancelada';
    case 'VENCIDA':
      return 'Venció sin confirmar: pedila de nuevo.';
    case 'CONFIRMANDO':
      return 'Registrando…';
    case 'ERROR':
      return propuesta.error ?? 'No se pudo registrar.';
    default:
      return `Para confirmar hasta las ${hora(propuesta.venceEn)}`;
  }
}

const BORDE = {
  CONFIRMADA: 'border-campo-500',
  ERROR: 'border-red-400',
  CANCELADA: 'border-suelo-300 opacity-75',
  VENCIDA: 'border-suelo-300 opacity-75',
};

export default function TarjetaPropuesta({ propuesta, onCambio }) {
  const [enviando, setEnviando] = useState(null); // 'confirmar' | 'cancelar' | null
  const [error, setError] = useState(null);
  const estado = estadoVisible(propuesta);
  const { titulo, renglones = [], avisos = [], link } = propuesta.tarjeta ?? {};
  const pendiente = estado === 'PENDIENTE';

  async function decidir(accion) {
    if (enviando) return;
    setEnviando(accion);
    setError(null);
    try {
      const nueva = await (accion === 'confirmar' ? confirmarPropuesta : cancelarPropuesta)(propuesta.id);
      onCambio?.(nueva);
    } catch (e) {
      setError(e.response?.data?.errors?.[0] ?? 'No se pudo. Probá de nuevo.');
      // Si ya no estaba pendiente (otro celular, venció), lo que dijo el servidor manda.
      const code = e.response?.data?.code;
      if (code?.startsWith('PROPUESTA_')) onCambio?.({ ...propuesta, estado: code.replace('PROPUESTA_', '') });
    } finally {
      setEnviando(null);
    }
  }

  return (
    <div className={`mt-3 rounded-xl border-2 bg-superficie p-3 ${BORDE[estado] ?? 'border-trigo-400'}`} data-testid="tarjeta-propuesta">
      <p className="text-xs font-semibold tracking-wide text-suelo-500 uppercase">Para confirmar</p>
      <p className="mt-0.5 font-semibold text-suelo-900">{titulo}</p>
      {renglones.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-sm text-suelo-800">
          {renglones.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {avisos.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-sm text-amber-800" data-testid="avisos-propuesta">
          {avisos.map((a) => (
            <li key={a}>! {a}</li>
          ))}
        </ul>
      )}

      {pendiente ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => decidir('confirmar')}
            disabled={Boolean(enviando)}
            className="flex-1 rounded-lg bg-boton px-3 py-2 font-semibold text-white hover:bg-boton-hover disabled:opacity-50"
          >
            {enviando === 'confirmar' ? 'Registrando…' : 'Confirmar'}
          </button>
          <button
            type="button"
            onClick={() => decidir('cancelar')}
            disabled={Boolean(enviando)}
            className="rounded-lg border border-suelo-300 px-3 py-2 text-suelo-700 hover:bg-suelo-100 disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <p
          className={`mt-2 text-sm font-medium ${estado === 'CONFIRMADA' ? 'text-campo-700' : estado === 'ERROR' ? 'text-red-700' : 'text-suelo-600'}`}
          data-testid="estado-propuesta"
        >
          {textoEstado(propuesta)}
          {estado === 'CONFIRMADA' && link && (
            <>
              {' · '}
              <Link to={link} className="underline">
                Ver
              </Link>
            </>
          )}
        </p>
      )}
      {pendiente && <p className="mt-1.5 text-xs text-suelo-500">{textoEstado(propuesta)}</p>}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
