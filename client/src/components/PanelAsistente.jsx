// El asistente (docs/superpowers/specs/2026-11-27-asistente-design.md), como un
// cajón que se abre desde la derecha con el botón "IA" de la barra de arriba
// (pedido de Diego, 27/11: como el panel de filtros de la izquierda).
// Un chat por persona: al abrirlo se ve el historial de sus consultas. Queda
// armado aunque se cierre o se cambie de pantalla (vive en el Marco).
import { useCallback, useEffect, useRef, useState } from 'react';
import Icono from './Icono';
import { TextoAsistente } from './asistenteFormato';
import { EsqueletoLista } from './Esqueleto';
import TarjetaPropuesta from './TarjetaPropuesta';
import { estadoAsistente, historialAsistente, preguntarAlAsistente } from '../api/asistente';

export const EJEMPLOS = [
  '¿Cuántas cabezas hay en cada estancia?',
  '¿Qué potreros están vacíos y hace cuánto?',
  '¿Qué se movió en los últimos 7 días?',
  '¿Qué procesos tienen algo atrasado?',
];
// Para quien puede registrar (fase 2): uno de acción.
export const EJEMPLO_ACCION = 'Anotá el pasto del 8.1: medio';

const diaIso = (fecha) => new Date(fecha).toLocaleDateString('sv-SE', { timeZone: 'America/Montevideo' });

// "Hoy", "Ayer" o la fecha: el separador del historial.
export function etiquetaDia(fecha, ahora = new Date()) {
  const dia = diaIso(fecha);
  const hoy = diaIso(ahora);
  const ayer = diaIso(new Date(ahora.getTime() - 24 * 60 * 60 * 1000));
  if (dia === hoy) return 'Hoy';
  if (dia === ayer) return 'Ayer';
  return dia.split('-').reverse().join('/');
}

// Las consultas guardadas, como mensajes del chat.
export function mensajesDeHistorial(consultas) {
  return consultas.flatMap((c) => [
    { clave: `p${c.id}`, rol: 'persona', texto: c.pregunta, fecha: c.creadaEn },
    { clave: `r${c.id}`, rol: 'asistente', texto: c.respuesta ?? '', error: c.error ?? undefined, propuestas: c.propuestas ?? [] },
  ]);
}

function mensajeDeError(error) {
  if (error.status === 401) return 'Tu sesión venció. Volvé a entrar para seguir.';
  return error.message;
}

// Cambia una propuesta (después de Confirmar o Cancelar) en los mensajes.
export function conPropuesta(mensajes, propuesta) {
  return mensajes.map((m) =>
    m.propuestas?.some((p) => p.id === propuesta.id) ? { ...m, propuestas: m.propuestas.map((p) => (p.id === propuesta.id ? { ...p, ...propuesta } : p)) } : m,
  );
}

function Burbuja({ mensaje, onPropuesta }) {
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
        {mensaje.error && <p className={`text-sm text-red-700 ${mensaje.texto ? 'mt-1' : ''}`}>{mensaje.error}</p>}
        {mensaje.propuestas?.map((p) => (
          <TarjetaPropuesta key={p.id} propuesta={p} onCambio={onPropuesta} />
        ))}
      </div>
    </div>
  );
}

// El botón de la barra de arriba.
export function BotonAsistente({ onClick, abierto }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Asistente (IA)"
      aria-expanded={abierto}
      title="Asistente"
      className="flex h-8 shrink-0 items-center gap-1 rounded-md border border-white/30 px-1.5 text-xs font-bold tracking-wide text-white hover:bg-white/15 lg:px-2.5 lg:text-sm"
      data-testid="boton-asistente"
    >
      <Icono nombre="asistente" className="hidden h-4 w-4 lg:block" />
      IA
    </button>
  );
}

export default function PanelAsistente({ abierto, onCerrar }) {
  const [estado, setEstado] = useState(null);
  const [mensajes, setMensajes] = useState(null); // null = todavía no se cargó
  const [hayMas, setHayMas] = useState(false);
  const [masViejoId, setMasViejoId] = useState(null);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [errorCarga, setErrorCarga] = useState(null);
  const corte = useRef(null);
  const lista = useRef(null);
  const campo = useRef(null);
  const alFondo = useRef(true);
  const panel = useRef(null);
  // Cuánto faltaba para el final de la lista (para el teclado, abajo).
  const hastaElFondo = useRef(0);

  const cargar = useCallback(async () => {
    setErrorCarga(null);
    try {
      const [e, h] = await Promise.all([estadoAsistente(), historialAsistente()]);
      setEstado(e);
      setMensajes(mensajesDeHistorial(h.consultas));
      setHayMas(h.hayMas);
      setMasViejoId(h.consultas[0]?.id ?? null);
      alFondo.current = true;
    } catch (error) {
      setErrorCarga(error.response?.status === 401 ? 'Tu sesión venció. Volvé a entrar para seguir.' : 'No se pudo abrir el asistente. Probá de nuevo.');
    }
  }, []);

  // La primera vez que se abre: el estado y el historial.
  useEffect(() => {
    if (abierto && mensajes === null && !errorCarga) cargar();
  }, [abierto, mensajes, errorCarga, cargar]);

  useEffect(() => () => corte.current?.abort(), []);

  // Al llegar algo nuevo, abajo de todo (no al traer las anteriores).
  useEffect(() => {
    if (alFondo.current && lista.current) lista.current.scrollTop = lista.current.scrollHeight;
  }, [mensajes, abierto]);

  // Al abrirlo, el cursor en la caja de escribir solo en la compu: en el
  // celular abriría el teclado sin que lo pidan (como WhatsApp, se abre al
  // tocar la caja).
  useEffect(() => {
    if (abierto && estado?.configurado && window.matchMedia?.('(pointer: fine)').matches) campo.current?.focus({ preventScroll: true });
  }, [abierto, estado]);

  // Al cerrarlo, se cierra el teclado (si no, queda abierto sobre la pantalla).
  useEffect(() => {
    if (!abierto && panel.current?.contains(document.activeElement)) document.activeElement.blur();
  }, [abierto]);

  // Como WhatsApp (27/11): cuando el teclado achica la lista, lo que se veía
  // abajo sigue abajo (el último mensaje sube con el teclado, no queda tapado).
  useEffect(() => {
    const caja = lista.current;
    if (!caja || typeof ResizeObserver === 'undefined') return undefined;
    const observador = new ResizeObserver(() => {
      caja.scrollTop = caja.scrollHeight - caja.clientHeight - hastaElFondo.current;
    });
    observador.observe(caja);
    return () => observador.disconnect();
  }, []);
  const alScrollear = (e) => {
    const c = e.currentTarget;
    hastaElFondo.current = Math.max(0, c.scrollHeight - c.scrollTop - c.clientHeight);
  };

  async function verAnteriores() {
    if (!masViejoId || cargandoMas) return;
    setCargandoMas(true);
    const caja = lista.current;
    const altoAntes = caja?.scrollHeight ?? 0;
    try {
      const h = await historialAsistente(masViejoId);
      alFondo.current = false;
      setMensajes((ms) => [...mensajesDeHistorial(h.consultas), ...ms]);
      setHayMas(h.hayMas);
      setMasViejoId(h.consultas[0]?.id ?? null);
      // Que lo que se estaba viendo quede en el mismo lugar.
      requestAnimationFrame(() => {
        if (caja) caja.scrollTop += caja.scrollHeight - altoAntes;
      });
    } catch {
      // Se puede volver a tocar.
    } finally {
      setCargandoMas(false);
    }
  }

  // Cambia el último mensaje (la respuesta en curso).
  const cambiarUltimo = (cambio) => setMensajes((ms) => [...ms.slice(0, -1), { ...ms.at(-1), ...cambio(ms.at(-1)) }]);

  async function enviar(pregunta) {
    const limpia = pregunta.trim();
    if (!limpia || enviando) return;
    setTexto('');
    setEnviando(true);
    alFondo.current = true;
    const n = Date.now();
    setMensajes((ms) => [
      ...(ms ?? []),
      { clave: `np${n}`, rol: 'persona', texto: limpia, fecha: new Date().toISOString() },
      { clave: `nr${n}`, rol: 'asistente', texto: '', enCurso: true },
    ]);
    corte.current = new AbortController();
    try {
      await preguntarAlAsistente({
        pregunta: limpia,
        signal: corte.current.signal,
        alEvento(e) {
          if (e.tipo === 'buscando') cambiarUltimo(() => ({ buscando: e.texto }));
          else if (e.tipo === 'texto') cambiarUltimo((m) => ({ texto: m.texto + e.texto, buscando: undefined }));
          else if (e.tipo === 'error') cambiarUltimo(() => ({ error: e.mensaje }));
          else if (e.tipo === 'propuesta') cambiarUltimo((m) => ({ propuestas: [...(m.propuestas ?? []), e.propuesta] }));
        },
      });
      cambiarUltimo(() => ({ enCurso: false, buscando: undefined }));
    } catch (error) {
      if (error.name === 'AbortError') return;
      cambiarUltimo(() => ({ enCurso: false, buscando: undefined, error: mensajeDeError(error) }));
    } finally {
      setEnviando(false);
      corte.current = null;
    }
  }

  const alCambiarPropuesta = (propuesta) => setMensajes((ms) => conPropuesta(ms ?? [], propuesta));

  const alTeclear = (e) => {
    // Enter manda; Shift+Enter, renglón nuevo.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      enviar(texto);
    }
  };

  // En el celular, tocar un enlace (un potrero, un lote) cierra el cajón para ver la ficha.
  const alTocar = (e) => {
    if (!e.target.closest?.('a')) return;
    if (!window.matchMedia?.('(min-width: 1024px)').matches) onCerrar();
  };

  // Separador de día antes de la primera pregunta de cada día.
  let ultimoDia = null;
  const conDias = (mensajes ?? []).map((m) => {
    if (m.rol !== 'persona' || !m.fecha) return { m };
    const dia = etiquetaDia(m.fecha);
    const separador = dia !== ultimoDia ? dia : null;
    ultimoDia = dia;
    return { m, separador };
  });

  return (
    <>
      {abierto && (
        <button type="button" aria-label="Cerrar el asistente" onClick={onCerrar} className="fixed inset-0 z-40 bg-black/40 lg:hidden" data-testid="fondo-asistente" />
      )}
      <aside
        ref={panel}
        aria-label="Asistente"
        aria-hidden={!abierto}
        inert={!abierto}
        data-sin-tirar
        className={`sigue-teclado fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col bg-suelo-50 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] teclado:pb-0 shadow-2xl transition-transform sm:w-[92%] lg:w-[28rem] lg:border-l lg:border-suelo-200 ${
          abierto ? 'translate-x-0' : 'translate-x-full'
        }`}
        data-testid="panel-asistente"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-suelo-200 bg-superficie px-4 py-3">
          <p className="flex items-center gap-2 font-semibold text-suelo-900">
            <Icono nombre="asistente" className="h-5 w-5 text-campo-600" />
            Asistente
          </p>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-md p-1.5 text-suelo-600 hover:bg-suelo-200/70">
            <Icono nombre="cerrar" className="h-6 w-6" />
          </button>
        </div>

        <div ref={lista} onClick={alTocar} onScroll={alScrollear} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite" data-testid="lista-asistente">
          {errorCarga ? (
            <div className="space-y-2 pt-4 text-center text-suelo-600">
              <p>{errorCarga}</p>
              <button type="button" onClick={cargar} className="text-sm text-campo-700 underline">
                Probar de nuevo
              </button>
            </div>
          ) : mensajes === null ? (
            <EsqueletoLista filas={4} testId="esqueleto-asistente" />
          ) : (
            <>
              {hayMas && (
                <div className="text-center">
                  <button type="button" onClick={verAnteriores} disabled={cargandoMas} className="text-sm text-campo-700 underline disabled:opacity-50">
                    {cargandoMas ? 'Trayendo…' : 'Ver anteriores'}
                  </button>
                </div>
              )}
              {mensajes.length === 0 && (
                <div className="space-y-3 pt-1">
                  <p className="text-suelo-700">
                    {estado?.puedeRegistrar
                      ? 'Preguntame por los potreros, el ganado, los movimientos, los procesos o los feedlots. También te armo movimientos, ventas, pesadas o el pasto: te muestro cómo quedaría y lo registrás vos con Confirmar.'
                      : 'Preguntame por los potreros, el ganado, los movimientos, los procesos o los feedlots.'}
                  </p>
                  {estado?.configurado && (
                    <div className="flex flex-wrap gap-2">
                      {[...EJEMPLOS, ...(estado.puedeRegistrar ? [EJEMPLO_ACCION] : [])].map((ejemplo) => (
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
                  )}
                </div>
              )}
              {conDias.map(({ m, separador }) => (
                <div key={m.clave} className="space-y-3">
                  {separador && <p className="pt-1 text-center text-xs font-medium text-suelo-500">{separador}</p>}
                  <Burbuja mensaje={m} onPropuesta={alCambiarPropuesta} />
                </div>
              ))}
              {estado && !estado.configurado && (
                <p className="rounded-lg border border-dashed border-suelo-300 bg-superficie p-4 text-center text-sm text-suelo-600">
                  El asistente todavía no está configurado.
                </p>
              )}
            </>
          )}
        </div>

        {estado?.configurado && (
          <form
            className="shrink-0 border-t border-suelo-200 bg-superficie px-4 pt-2 pb-2"
            onSubmit={(e) => {
              e.preventDefault();
              enviar(texto);
            }}
          >
            <div className="flex items-end gap-2">
              <label htmlFor="pregunta-asistente" className="sr-only">
                Tu pregunta
              </label>
              <textarea
                id="pregunta-asistente"
                ref={campo}
                rows={1}
                value={texto}
                maxLength={2000}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={alTeclear}
                enterKeyHint="send"
                placeholder="Escribí o dictá tu pregunta…"
                className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-suelo-300 bg-superficie px-4 py-2.5 text-suelo-900 placeholder-suelo-400 outline-none focus:ring-2 focus:ring-campo-500"
              />
              <button
                type="submit"
                disabled={enviando || !texto.trim()}
                // Tocar Enviar no saca el cursor de la caja: el teclado queda
                // abierto para seguir preguntando (como WhatsApp).
                onPointerDown={(e) => e.preventDefault()}
                aria-label="Enviar"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-boton text-white transition hover:bg-boton-hover disabled:opacity-40"
              >
                <Icono nombre="enviar" className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-1 text-xs text-suelo-500">Puede equivocarse: los números importantes, miralos en la ficha.</p>
          </form>
        )}
      </aside>
    </>
  );
}
