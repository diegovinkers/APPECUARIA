import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getFeedlot, getFeedlots, getResumen, getResumenTodas } from '../../api/pecuaria';
import { getErrorMessages } from '../../api/axios';
import { useEstancia } from '../../context/EstanciaContext';
import usePotreros from '../../hooks/usePotreros';
import { ErrorList, Notice } from '../../components/ui';
import { formatFecha, formatNumero, formatUsdCorto } from '../../components/pecuaria';
import { AYUDA_CARGA, Cabecera, CargaPorGrupo, Seccion, TablaResumen, ayudaTabla } from '../../components/ResumenCampo';
import FeedlotAnalisis from '../../components/FeedlotAnalisis';
import { BotonOjo, Plata, PlataProvider } from '../../components/Plata';
import { Encabezado, SinEstancia } from './comun';

// Lo primero que se ve al entrar. Ordenado en zonas (26/11, pedido de Diego):
// - la cabecera: cabezas, potreros y hectáreas, y el valor del ganado;
// - con "Todas las estancias", una fila por estancia (tocarla la elige);
// - la tabla por categoría (CN / Verdeos / Corral / Otro);
// - la carga por grupo.
// La plata arranca tapada: se ve al tocar el ojito (PlataProvider).
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
    <PlataProvider>
      <main className="mx-auto max-w-5xl px-4 pb-10 pt-5 sm:pt-8">
        <Notice tone="ok">{location.state?.aviso}</Notice>
        {contenido ?? (
          <>
            <Encabezado titulo="Resumen" />
            <SinEstancia />
          </>
        )}
      </main>
    </PlataProvider>
  );
}

// "al 13/11/2026", a la derecha del título.
function AlDia({ fecha }) {
  if (!fecha) return null;
  return <span className="text-sm text-suelo-500">al {formatFecha(fecha)}</span>;
}

const Cargando = () => <p className="text-suelo-600">Cargando…</p>;

const plural = (n, uno, varios) => `${formatNumero(n)} ${n === 1 ? uno : varios}`;

function ResumenUna({ campoId }) {
  const { potreros, errors: errorsPotreros } = usePotreros(campoId);
  const [resumen, setResumen] = useState(null);
  const [errors, setErrors] = useState([]);

  useEffect(() => {
    setResumen(null);
    setErrors([]);
    let vigente = true;
    getResumen(campoId)
      .then(({ data }) => vigente && setResumen(data))
      .catch((error) => vigente && setErrors(getErrorMessages(error, 'No se pudo cargar el resumen')));
    return () => {
      vigente = false;
    };
  }, [campoId]);

  const totales = useMemo(() => {
    const lista = potreros ?? [];
    return {
      cabezas: lista.reduce((s, p) => s + (p.stock?.cabezas ?? 0), 0),
      hectareas: lista.reduce((s, p) => s + (p.hectareasAConfirmar ? 0 : (p.hectareas ?? 0)), 0),
      aConfirmar: lista.filter((p) => p.hectareasAConfirmar).length,
    };
  }, [potreros]);

  const detalle = potreros
    ? `${plural(potreros.length, 'potrero', 'potreros')} · ${formatNumero(totales.hectareas)} ha${totales.aConfirmar ? ` (${totales.aConfirmar} a confirmar)` : ''}`
    : null;

  return (
    <>
      <Encabezado titulo="Resumen">
        <AlDia fecha={resumen?.fecha} />
      </Encabezado>
      <ErrorList errors={[...errorsPotreros, ...errors]} />
      <Cabecera cabezas={resumen ? formatNumero(resumen.totales.total) : potreros ? formatNumero(totales.cabezas) : '…'} detalle={detalle} valor={resumen?.valor} />

      {!resumen && !errors.length && (
        <div className="mt-8">
          <Cargando />
        </div>
      )}
      {resumen && (
        <>
          <Seccion titulo="Por categoría" ayuda={resumen.filas.length ? ayudaTabla(resumen) : null}>
            <TablaResumen resumen={resumen} />
          </Seccion>
          {resumen.porGrupo?.some((g) => g.potreros > 0 && g.cabezas > 0) && (
            <Seccion titulo="Carga por grupo" ayuda={AYUDA_CARGA}>
              <CargaPorGrupo porGrupo={resumen.porGrupo} />
            </Seccion>
          )}
        </>
      )}
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
        <span className="flex items-center gap-1">
          <AlDia fecha={analisis?.fecha} />
          {analisis?.totales.valorUsd > 0 && <BotonOjo />}
        </span>
      </Encabezado>
      <ErrorList errors={errors} />
      {!analisis && !errors.length && <Cargando />}
      {analisis && <FeedlotAnalisis analisis={analisis} todas={todas} onElegir={setCampoId} />}
      {resumen && resumen.filas.length > 0 && (
        <Seccion titulo="Por categoría y etapa" ayuda={ayudaTabla(resumen)}>
          <TablaResumen resumen={resumen} />
        </Seccion>
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
        <AlDia fecha={resumen?.fecha} />
      </Encabezado>
      <ErrorList errors={errors} />
      {!resumen && !errors.length && <Cargando />}
      {resumen && (
        <>
          <Cabecera
            cabezas={formatNumero(resumen.totales.total)}
            detalle={`${plural(resumen.estancias.length, 'estancia', 'estancias')} · ${plural(potreros, 'potrero', 'potreros')} · ${formatNumero(hectareas)} ha conocidas`}
            valor={resumen.valor}
          />

          <Seccion titulo="Por estancia" ayuda="Tocá una estancia para ver solo la suya.">
            <ul className="divide-y divide-suelo-200 overflow-hidden rounded-xl border border-suelo-200 bg-superficie" data-testid="por-estancia">
              {resumen.estancias.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setCampoId(e.id)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-campo-50"
                  >
                    <span className="min-w-0">
                      <span className="block font-semibold">{e.nombre}</span>
                      <span className="block text-sm text-suelo-600">
                        {plural(e.potreros, 'potrero', 'potreros')} · {formatNumero(e.hectareas)} ha
                        {e.valorUsd > 0 && (
                          <>
                            {' · '}
                            <span className="whitespace-nowrap"><Plata>USD {formatUsdCorto(e.valorUsd)}</Plata></span>
                          </>
                        )}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-lg font-bold tabular-nums">{formatNumero(e.cabezas)}</span>
                      <span className="block text-sm text-suelo-600">cabezas</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Seccion>

          <Seccion titulo="Por categoría" ayuda={resumen.filas.length ? ayudaTabla(resumen) : null}>
            <TablaResumen resumen={resumen} />
          </Seccion>

          {resumen.porGrupo?.some((g) => g.potreros > 0 && g.cabezas > 0) && (
            <Seccion titulo="Carga por grupo" ayuda={AYUDA_CARGA}>
              <CargaPorGrupo porGrupo={resumen.porGrupo} />
            </Seccion>
          )}
        </>
      )}
    </>
  );
}
