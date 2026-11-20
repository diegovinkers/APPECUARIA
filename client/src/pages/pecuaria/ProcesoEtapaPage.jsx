import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getProceso, registrarEtapa, vistaPreviaEtapa } from '../../api/pecuaria';
import { getErrorMessages } from '../../api/axios';
import Camino from '../../components/Camino';
import { ErrorList, Notice, inputClass } from '../../components/ui';
import { formatNumero } from '../../components/pecuaria';
import { ETAPAS_CON_PANTALLA, textoBotonEtapa } from '../../components/procesos';

const hoy = () => new Date().toLocaleDateString('sv-SE');
const etiqueta = 'block text-sm text-suelo-600';
const inputChico = `${inputClass} min-h-11 px-3`;
const PASOS = ['A quién', 'Datos', 'Revisar'];

// Qué lotes toma cada etapa (como la plantilla del servidor) y si pide cabezas.
const TOMA = { FIN_SERVICIO: ['VIENTRES'], REPASO: ['VIENTRES'], ABORTO: ['PRENADAS', 'VIENTRES'] };
const PIDE_CABEZAS = { REPASO: true, ABORTO: true };
const UNICA = { FIN_SERVICIO: true, REPASO: true };

// Cargar una etapa de un proceso, con el camino de pasos (diseño de procesos
// §12): a quién (los lotes del proceso que la toman, ya elegidos) → datos →
// revisar y confirmar. Por ahora, las etapas que solo anotan: fin del
// servicio, repaso y abortos.
export default function ProcesoEtapaPage() {
  const { id, etapa } = useParams();
  const navigate = useNavigate();
  const [ficha, setFicha] = useState(null);
  const [paso, setPaso] = useState(0);
  const [elegidos, setElegidos] = useState(null);
  const [cabezas, setCabezas] = useState({});
  const [fecha, setFecha] = useState(hoy());
  const [nota, setNota] = useState('');
  const [previa, setPrevia] = useState(null);
  const [errors, setErrors] = useState([]);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    getProceso(id)
      .then(({ data }) => setFicha(data))
      .catch((error) => setErrors(getErrorMessages(error, 'No se pudo cargar el proceso')));
  }, [id]);

  // Los lotes que la toman (y, si va una sola vez, que todavía no la tienen).
  const posibles = useMemo(() => {
    if (!ficha) return [];
    const ya = new Set(
      (ficha.etapas.find((e) => e.clave === etapa)?.cargas ?? []).filter((c) => !c.anulada).flatMap((c) => c.lineas.map((l) => l.loteId)),
    );
    return ficha.lotes.filter((l) => l.activo && l.cabezas > 0 && (TOMA[etapa] ?? []).includes(l.rol) && !(UNICA[etapa] && ya.has(l.loteId)));
  }, [ficha, etapa]);
  const elegidosIds = elegidos ?? posibles.map((l) => l.loteId);
  const lotes = posibles.filter((l) => elegidosIds.includes(l.loteId));

  const cuerpo = () => ({
    fecha,
    ...(nota.trim() && { nota: nota.trim() }),
    lineas: lotes.map((l) => {
      const n = String(cabezas[l.loteId] ?? '').trim();
      return n ? { loteId: l.loteId, cabezas: n } : { loteId: l.loteId };
    }),
  });

  async function seguir() {
    setErrors([]);
    if (paso === 0) return setPaso(1);
    setOcupado(true);
    try {
      if (paso === 1) {
        const { data } = await vistaPreviaEtapa(id, etapa, cuerpo());
        setPrevia(data);
        setPaso(2);
      } else {
        const { data } = await registrarEtapa(id, etapa, cuerpo());
        navigate(`/pecuaria/procesos/${id}`, { state: { aviso: `${data.oracion}.` } });
      }
    } catch (error) {
      setErrors(getErrorMessages(error, 'No se pudo guardar'));
    } finally {
      setOcupado(false);
    }
  }

  const titulo = textoBotonEtapa(etapa);
  if (!ETAPAS_CON_PANTALLA.has(etapa)) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Notice>Esta etapa todavía no se puede cargar desde acá.</Notice>
      </main>
    );
  }

  return (
    <Camino
      titulo={ficha ? `${titulo} · ${ficha.proceso.nombre}` : titulo}
      pasos={PASOS}
      actual={paso}
      onIr={(i) => {
        setErrors([]);
        setPaso(i);
      }}
      onSeguir={ficha ? seguir : null}
      textoSeguir={paso === 2 ? 'Confirmar' : paso === 1 ? 'Revisar' : 'Seguir'}
      puedeSeguir={lotes.length > 0}
      ocupado={ocupado}
      ayuda={lotes.length ? `${lotes.length} ${lotes.length === 1 ? 'lote' : 'lotes'} · ${formatNumero(lotes.reduce((s, l) => s + l.cabezas, 0))} cab` : 'Elegí los lotes'}
    >
      <div className="mt-2">
        <ErrorList errors={errors} />
      </div>
      {!ficha && !errors.length && <p className="text-suelo-600">Cargando…</p>}

      {ficha && paso === 0 && (
        <section aria-label="A quién" className="space-y-2">
          {posibles.length === 0 && <p className="text-suelo-600">No hay lotes del proceso para esto.</p>}
          <ul className="divide-y divide-suelo-100 rounded-lg border border-suelo-200 bg-white">
            {posibles.map((l) => (
              <li key={l.loteId}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={elegidosIds.includes(l.loteId)}
                    onChange={() => setElegidos(elegidosIds.includes(l.loteId) ? elegidosIds.filter((x) => x !== l.loteId) : [...elegidosIds, l.loteId])}
                    className="h-5 w-5 accent-campo-600"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{l.nombre}</span>
                    <span className="block text-xs text-suelo-500">
                      {l.potrero?.nombre} · {l.categoria}
                    </span>
                  </span>
                  <span className="shrink-0 text-suelo-600">{formatNumero(l.cabezas)} cab</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      {ficha && paso === 1 && (
        <section aria-label="Datos" className="space-y-4">
          <label className={etiqueta}>
            Fecha
            <input type="date" value={fecha} max={hoy()} onChange={(e) => setFecha(e.target.value)} className={`${inputChico} mt-1`} />
          </label>
          {PIDE_CABEZAS[etapa] &&
            lotes.map((l) => (
              <label key={l.loteId} className={etiqueta}>
                {etapa === 'ABORTO' ? `¿Cuántas abortaron? (${l.nombre})` : `Cabezas (${l.nombre}, por defecto ${formatNumero(l.cabezas)})`}
                <input inputMode="numeric" value={cabezas[l.loteId] ?? ''} onChange={(e) => setCabezas((c) => ({ ...c, [l.loteId]: e.target.value }))} className={`${inputChico} mt-1`} />
              </label>
            ))}
          <label className={etiqueta}>
            Nota (opcional)
            <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={255} className={`${inputChico} mt-1`} />
          </label>
        </section>
      )}

      {paso === 2 && previa && (
        <section aria-label="Revisar" className="space-y-3">
          <p className="rounded-lg border border-campo-200 bg-campo-50 px-4 py-3 text-base font-medium text-campo-900" data-testid="oracion">
            {previa.oracion}.
          </p>
          {previa.avisos.map((a) => (
            <Notice key={a}>{a}</Notice>
          ))}
        </section>
      )}
    </Camino>
  );
}
