import api from './axios';

// El asistente (docs/superpowers/specs/2026-11-27-asistente-design.md).

export const estadoAsistente = () => api.get('/asistente/estado').then((r) => r.data);

/**
 * Manda una pregunta y va pasando la respuesta a `alEvento` a medida que llega:
 *   { tipo: 'conversacion', id } · { tipo: 'buscando', texto } · { tipo: 'texto', texto }
 *   { tipo: 'fin' } · { tipo: 'error', mensaje }
 * La respuesta viene de a renglones (NDJSON), por eso no va con axios.
 * Si la API contesta con un error común (sesión vencida, sin clave…), lanza
 * un Error con el mensaje de la API y su `status`.
 */
export async function preguntarAlAsistente({ conversacionId, pregunta, alEvento, signal }) {
  const res = await fetch('/api/asistente', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...(conversacionId && { conversacionId }), pregunta }),
    signal,
  });
  if (!res.ok) {
    let datos = null;
    try {
      datos = await res.json();
    } catch {
      // Sin JSON.
    }
    const error = new Error(datos?.errors?.[0] ?? 'No se pudo hablar con el asistente. Probá de nuevo.');
    error.status = res.status;
    error.code = datos?.code;
    throw error;
  }
  const lector = res.body.getReader();
  const decodificador = new TextDecoder();
  let resto = '';
  for (;;) {
    const { value, done } = await lector.read();
    resto += decodificador.decode(value ?? new Uint8Array(), { stream: !done });
    const renglones = resto.split('\n');
    resto = renglones.pop();
    for (const renglon of renglones) if (renglon.trim()) alEvento(JSON.parse(renglon));
    if (done) break;
  }
  if (resto.trim()) alEvento(JSON.parse(resto));
}
