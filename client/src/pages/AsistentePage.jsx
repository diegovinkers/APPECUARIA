// El asistente (docs/superpowers/specs/2026-11-27-asistente-design.md), fase 1:
// un chat que consulta. La respuesta llega de a poco; mientras usa una
// herramienta dice qué está buscando. La conversación vive en la pantalla:
// al salir se pierde (el servidor la guarda para seguirla mientras tanto).
import { useEffect, useRef, useState } from 'react';
import Icono from '../components/Icono';
import { TextoAsistente } from '../components/asistenteFormato';
import { EsqueletoLista } from '../components/Esqueleto';
import { estadoAsistente, preguntarAlAsistente } from '../api/asistente';

export const EJEMPLOS = [
  '¿Cuántas cabezas hay en cada estancia?',
  '¿Qué potreros están vacíos y hace cuánto?',
  '¿Qué se movió en los últimos 7 días?',
  '¿Qué procesos tienen algo atrasado?',
];

function mensajeDeError(error) {
  if (error.status === 401) return 'Tu sesión venció. Volvé a entrar para seguir.';
  return error.message;
}

function Burbuja({ mensaje }) {
  if (mensaje.rol === 'persona') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-sm bg-boton px-4 py-2 text-white">{mensaje.texto}</div>
      </div>
    );
  }
  return (
    <div className="flex justify-start" data-testid="respuesta">
      <div className="max-w-[95%] rounded-2xl rounded-bl-sm border border-suelo-200 bg-superficie px-4 py-3 text-suelo-900">
        {mensaje.texto && <TextoAsistente texto={mensaje.texto} />}
        {mensaje.enCurso && (
          <p className={`flex items-center gap-2 text-sm text-suelo-500 ${mensaje.texto ? 'mt-2' : ''}`} role="status">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-campo-500 motion-reduce:animate-none" />
            {mensaje.buscando ?? 'Pensando…'}
          </p>
        )}
        {mensaje.error && <p className="mt-1 text-sm text-red-700">{mensaje.error}</p>}
      </div>
    </div>
  );
}

export default function AsistentePage() {
  const [estado, setEstado] = useState(null);
  const [mensajes, setMensajes] = useState([]);
  const [conversacionId, setConversacionId] = useState(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const corte = useRef(null);
  const fondo = useRef(null);
  const campo = useRef(null);

  useEffect(() => {
    estadoAsistente()
      .then(setEstado)
      .catch(() => setEstado({ configurado: false, error: true }));
    return () => corte.current?.abort();
  }, []);

  useEffect(() => {
    fondo.current?.scrollIntoView?.({ block: 'end' });
  }, [mensajes]);

  // Cambia el último mensaje (la respuesta en curso).
  const cambiarUltimo = (cambio) => setMensajes((ms) => [...ms.slice(0, -1), { ...ms.at(-1), ...cambio(ms.at(-1)) }]);

  async function enviar(pregunta) {
    const limpia = pregunta.trim();
    if (!limpia || enviando) return;
    setTexto('');
    setEnviando(true);
    setMensajes((ms) => [...ms, { rol: 'persona', texto: limpia }, { rol: 'asistente', texto: '', enCurso: true }]);
    corte.current = new AbortController();
    try {
      await preguntarAlAsistente({
        conversacionId,
        pregunta: limpia,
        signal: corte.current.signal,
        alEvento(e) {
          if (e.tipo === 'conversacion') setConversacionId(e.id);
          else if (e.tipo === 'buscando') cambiarUltimo(() => ({ buscando: e.texto }));
          else if (e.tipo === 'texto') cambiarUltimo((m) => ({ texto: m.texto + e.texto, buscando: m.texto + e.texto ? undefined : m.buscando }));
          else if (e.tipo === 'error') cambiarUltimo(() => ({ error: e.mensaje }));
        },
      });
      cambiarUltimo(() => ({ enCurso: false, buscando: undefined }));
    } catch (error) {
      if (error.name === 'AbortError') return;
      if (error.code === 'CONVERSACION_LARGA') setConversacionId(null);
      cambiarUltimo(() => ({ enCurso: false, error: mensajeDeError(error) }));
    } finally {
      setEnviando(false);
      corte.current = null;
      campo.current?.focus();
    }
  }

  function nuevaConversacion() {
    corte.current?.abort();
    setMensajes([]);
    setConversacionId(null);
    setEnviando(false);
    setTexto('');
  }

  const alTeclear = (e) => {
    // Enter manda; Shift+Enter, renglón nuevo.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      enviar(texto);
    }
  };

  if (!estado) {
    return (
      <main className="mx-auto max-w-3xl px-4 pt-4">
        <EsqueletoLista filas={4} testId="esqueleto-asistente" />
      </main>
    );
  }

  return (
    // data-sin-tirar: tirar para actualizar borraría la conversación.
    <main data-sin-tirar className="mx-auto flex h-full max-w-3xl flex-col px-4 pt-3 lg:pb-4">
      <div className="flex shrink-0 items-center justify-between gap-2 pb-2">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-suelo-900">
          <Icono nombre="asistente" className="h-5 w-5 text-campo-600" />
          Asistente
        </h1>
        {mensajes.length > 0 && (
          <button type="button" onClick={nuevaConversacion} className="rounded-md border border-suelo-300 px-3 py-1.5 text-sm text-suelo-700 hover:border-campo-500">
            Nueva conversación
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-3" aria-live="polite">
        {!estado.configurado ? (
          <p className="rounded-lg border border-dashed border-suelo-300 bg-superficie p-6 text-center text-suelo-600">
            {estado.error ? 'No se pudo abrir el asistente. Probá de nuevo en un rato.' : 'El asistente todavía no está configurado.'}
          </p>
        ) : mensajes.length === 0 ? (
          <div className="space-y-3 pt-2">
            <p className="text-suelo-700">
              Preguntame por los potreros, el ganado, los movimientos, los procesos o los feedlots. Por ahora solo consulto: para registrar, usá el
              botón “+” (en la compu, “Registrar”).
            </p>
            <div className="flex flex-wrap gap-2">
              {EJEMPLOS.map((ejemplo) => (
                <button
                  key={ejemplo}
                  type="button"
                  onClick={() => enviar(ejemplo)}
                  className="rounded-full border border-suelo-300 bg-superficie px-3 py-1.5 text-left text-sm text-suelo-800 hover:border-campo-500"
                >
                  {ejemplo}
                </button>
              ))}
            </div>
          </div>
        ) : (
          mensajes.map((m, i) => <Burbuja key={i} mensaje={m} />)
        )}
        <div ref={fondo} />
      </div>

      {estado.configurado && (
        <form
          className="shrink-0 border-t border-suelo-200 pt-2 pb-2"
          onSubmit={(e) => {
            e.preventDefault();
            enviar(texto);
          }}
        >
          <div className="flex items-end gap-2">
            <label htmlFor="pregunta" className="sr-only">
              Tu pregunta
            </label>
            <textarea
              id="pregunta"
              ref={campo}
              rows={1}
              value={texto}
              maxLength={2000}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={alTeclear}
              placeholder="Escribí o dictá tu pregunta…"
              className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-suelo-300 bg-superficie px-4 py-2.5 text-suelo-900 placeholder-suelo-400 outline-none focus:ring-2 focus:ring-campo-500"
            />
            <button
              type="submit"
              disabled={enviando || !texto.trim()}
              aria-label="Enviar"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-boton text-white transition hover:bg-boton-hover disabled:opacity-40"
            >
              <Icono nombre="enviar" className="h-5 w-5" />
            </button>
          </div>
          <p className="mt-1 text-xs text-suelo-500">Puede equivocarse: los números importantes, miralos en la ficha.</p>
        </form>
      )}
    </main>
  );
}
