import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getFeedlot, getFeedlots, getResumen, getResumenTodas } from '../../api/pecuaria';
import { getErrorMessages } from '../../api/axios';
import { useEstancia } from '../../context/EstanciaContext';
import usePotreros from '../../hooks/usePotreros';
import { ErrorList, Notice } from '../../components/ui';
import { Dato, formatFecha, formatNumero } from '../../components/pecuaria';
import ResumenCampo, { TablaResumen } from '../../components/ResumenCampo';
import FeedlotAnalisis from '../../components/FeedlotAnalisis';
import { Encabezado, SinEstancia } from './comun';

// Lo primero que se ve al entrar: los totales de la estancia y el resumen por
// categoría (CN / Verdeos / Corral / Otro). Con "Todas las estancias", las
// suma y muestra una fila por estancia (tocarla la elige).
// Con un feedlot o "Todos los feedlots", la vista del feedlot: una tabla por
// corral (FeedlotAnalisis) y, abajo, las categorías por etapa del encierre
// (TablaResumen con las columnas que manda el servidor). No se mezcla con las
// estancias.
export default function ResumenPage() {
  const location = useLocation();
  const { campoId, todas, esFeedlot } = useEstancia();

  let contenido;
  if (esFeedlot && (todas || campoId)) contenido = <ResumenFeedlot campoId={campoId} todas={todas} />;
  else if (todas) contenido = <ResumenTodas />;
  else if (campoId) contenido = <ResumenUna campoId={campoId} />;

  return (
    <main className="mx-auto max-w-5xl px-4 py-5 sm:py-8">
      <Notice tone="ok">{location.state?.aviso}</Notice>
      {contenido ?? (
        <>
          <Encabezado titulo="Resumen" />
          <SinEstancia />
        </>
      )}
    </main>
  );
}

function ResumenUna({ campoId }) {
  const { potreros, errors } = usePotreros(campoId);
  const totales = useMemo(() => {
    const lista = potreros ?? [];
    return {
      cabezas: lista.reduce((s, p) => s + (p.stock?.cabezas ?? 0), 0),
      hectareas: lista.reduce((s, p) => s + (p.hectareasAConfirmar ? 0 : (p.hectareas ?? 0)), 0),
      aConfirmar: lista.filter((p) => p.hectareasAConfirmar).length,
      fecha: lista.map((p) => p.stock?.fecha).filter(Boolean).sort().at(-1),
    };
  }, [potreros]);

  return (
    <>
      <Encabezado titulo="Resumen">
        {totales.fecha && <span className="text-sm text-suelo-500">dato al {formatFecha(totales.fecha)}</span>}
      </Encabezado>
      <ErrorList errors={errors} />
      <div className="mb-6 grid grid-cols-3 gap-2 sm:gap-3">
        <Dato valor={potreros ? formatNumero(totales.cabezas) : '…'} etiqueta="cabezas" />
        <Dato valor={potreros ? potreros.length : '…'} etiqueta="potreros" />
        <Dato
          valor={potreros ? formatNumero(totales.hectareas) : '…'}
          etiqueta={totales.aConfirmar ? `ha (${totales.aConfirmar} a confirmar)` : 'ha'}
        />
      </div>
      <ResumenCampo campoId={campoId} />
    </>
  );
}

// La vista del feedlot: de uno, o de todos los del usuario.
export function ResumenFeedlot({ campoId, todas }) {
  const { setCampoId } = useEstancia();
  const [analisis, setAnalisis] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [errors, setErrors] = useState([]);

  useEffect(() => {
    setAnalisis(null);
    setResumen(null);
    setErrors([]);
    let vigente = true;
    Promise.all([todas ? getFeedlots() : getFeedlot(campoId), todas ? getResumenTodas('feedlots') : getResumen(campoId)])
      .then(([a, r]) => {
        if (!vigente) return;
        setAnalisis(a.data);
        setResumen(r.data);
      })
      .catch((error) => vigente && setErrors(getErrorMessages(error, 'No se pudo cargar el feedlot')));
    return () => {
      vigente = false;
    };
  }, [campoId, todas]);

  return (
    <>
      <Encabezado titulo="Resumen">
        {analisis?.fecha && <span className="text-sm text-suelo-500">dato al {formatFecha(analisis.fecha)}</span>}
      </Encabezado>
      <ErrorList errors={errors} />
      {!analisis && !errors.length && <p className="text-suelo-600">Cargando…</p>}
      {analisis && <FeedlotAnalisis analisis={analisis} todas={todas} onElegir={setCampoId} />}
      {resumen && resumen.filas.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 font-semibold">Por categoría y etapa</h2>
          <TablaResumen resumen={resumen} />
        </section>
      )}
    </>
  );
}

function ResumenTodas() {
  const { setCampoId } = useEstancia();
  const [resumen, setResumen] = useState(null);
  const [errors, setErrors] = useState([]);

  useEffect(() => {
    getResumenTodas('estancias')
      .then(({ data }) => setResumen(data))
      .catch((error) => setErrors(getErrorMessages(error, 'No se pudo cargar el resumen')));
  }, []);

  const potreros = resumen?.estancias.reduce((s, e) => s + e.potreros, 0);
  const hectareas = resumen?.estancias.reduce((s, e) => s + e.hectareas, 0);

  return (
    <>
      <Encabezado titulo="Resumen">
        {resumen?.fecha && <span className="text-sm text-suelo-500">último dato al {formatFecha(resumen.fecha)}</span>}
      </Encabezado>
      <ErrorList errors={errors} />
      {!resumen && !errors.length && <p className="text-suelo-600">Cargando…</p>}
      {resumen && (
        <>
          <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
            <Dato valor={formatNumero(resumen.totales.total)} etiqueta="cabezas" />
            <Dato valor={potreros} etiqueta="potreros" />
            <Dato valor={formatNumero(hectareas)} etiqueta="ha conocidas" />
          </div>

          <h2 className="mb-2 font-semibold">Por estancia</h2>
          <ul className="mb-6 divide-y divide-suelo-200 overflow-hidden rounded-lg border border-suelo-200 bg-white">
            {resumen.estancias.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => setCampoId(e.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-campo-50"
                >
                  <span>
                    <span className="block font-medium">{e.nombre}</span>
                    <span className="block text-xs text-suelo-500">
                      {e.potreros} {e.potreros === 1 ? 'potrero' : 'potreros'} · {formatNumero(e.hectareas)} ha conocidas
                      {e.valorUsd > 0 && ` · USD ${formatNumero(e.valorUsd)}`}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-lg font-bold tabular-nums">{formatNumero(e.cabezas)}</span>
                    <span className="block text-xs text-suelo-500">cabezas</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <h2 className="mb-2 font-semibold">Por categoría</h2>
          <TablaResumen resumen={resumen} />
        </>
      )}
    </>
  );
}
