import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getProcesos, getProcesosTodas } from '../api/pecuaria';
import { getErrorMessages } from '../api/axios';
import usePuede from '../hooks/usePuede';
import { ErrorList } from './ui';
import Icono from './Icono';
import { formatFecha, formatNumero } from './pecuaria';
import { diasCorto, estiloSugerencia, nombreProceso, textoTipo } from './procesos';
import { SECCIONES_TABLERO, TEXTO_GRUPO, accionDeGrupo, armarTablero, avance } from './tablero';

const hoyIso = () => new Date().toLocaleDateString('sv-SE');

// El tablero de Procesos (24/11). Los datos son la lista de procesos
// abiertos (cada uno trae sus grupos).
export function useTablero({ campoId, todas, grupo }) {
  const [datos, setDatos] = useState(null);
  const [errors, setErrors] = useState([]);
  useEffect(() => {
    let vigente = true;
    setDatos(null);
    setErrors([]);
    if (!campoId && !todas) return undefined;
    const filtros = { estado: 'ABIERTO' };
    (todas ? getProcesosTodas(filtros, grupo) : getProcesos(campoId, filtros))
      .then(({ data }) => vigente && setDatos(data))
      .catch((error) => vigente && setErrors(getErrorMessages(error, 'No se pudieron cargar los procesos')));
    return () => {
      vigente = false;
    };
  }, [campoId, todas, grupo]);
  const tablero = useMemo(() => (datos ? armarTablero(datos) : null), [datos]);
  return { tablero, errors };
}

// Las secciones plegadas se recuerdan en este navegador (solo una comodidad:
// sin el dato, arrancan todas abiertas).
const CLAVE_PLEGADAS = 'procesos-plegadas';
function leerPlegadas() {
  try {
    return new Set(JSON.parse(localStorage.getItem(CLAVE_PLEGADAS) ?? '[]'));
  } catch {
    return new Set();
  }
}
function guardarPlegadas(plegadas) {
  try {
    localStorage.setItem(CLAVE_PLEGADAS, JSON.stringify([...plegadas]));
  } catch {
    // Sin almacenamiento (ventana privada): no se recuerda, nada más.
  }
}

// Las 4 secciones una debajo de la otra, como un acordeón (el dibujo de
// Diego: todo el ciclo a la vista). Tocar el encabezado pliega o despliega.
export default function TableroProcesos({ tablero, errors, todas }) {
  const [plegadas, setPlegadas] = useState(leerPlegadas);
  const alternar = (clave) =>
    setPlegadas((antes) => {
      const nuevas = new Set(antes);
      nuevas.has(clave) ? nuevas.delete(clave) : nuevas.add(clave);
      guardarPlegadas(nuevas);
      return nuevas;
    });
  if (errors.length) return <ErrorList errors={errors} />;
  if (!tablero) return <p className="text-suelo-600">Cargando…</p>;
  return (
    <div className="min-h-0 flex-1 space-y-2 overflow-auto pb-4" data-testid="tablero">
      {SECCIONES_TABLERO.map((s, i) => {
        const abierta = !plegadas.has(s.clave);
        const grupos = tablero[s.clave];
        return (
          <section key={s.clave} aria-label={s.nombre} className="overflow-hidden rounded-lg border border-suelo-300 bg-superficie" data-testid={`seccion-${s.clave}`}>
            <h2>
              <button
                type="button"
                onClick={() => alternar(s.clave)}
                aria-expanded={abierta}
                aria-controls={`seccion-${s.clave}-contenido`}
                className="flex w-full items-center gap-3 bg-suelo-100 px-3 py-2.5 text-left hover:bg-suelo-200/70"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-boton text-sm font-bold text-white">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold leading-tight">{s.nombre}</span>
                  <span className="block truncate text-xs text-suelo-500">{s.sub}</span>
                </span>
                <span className="shrink-0 text-right leading-tight">
                  <span className="block font-bold tabular-nums" data-testid={`total-${s.clave}`}>
                    {formatNumero(tablero.totales[s.clave])}
                  </span>
                  <span className="text-xs text-suelo-500">
                    cab{grupos.length ? ` · ${grupos.length} ${grupos.length === 1 ? 'grupo' : 'grupos'}` : ''}
                  </span>
                  {tablero.deIatf[s.clave] > 0 && (
                    <span className="block text-xs font-medium text-trigo-600" data-testid={`de-iatf-${s.clave}`}>
                      {formatNumero(tablero.deIatf[s.clave])} de IATF
                    </span>
                  )}
                </span>
                <Icono nombre="abajo" className={`h-5 w-5 shrink-0 text-suelo-500 transition-transform ${abierta ? 'rotate-180' : ''}`} />
              </button>
            </h2>
            {abierta && (
              <div id={`seccion-${s.clave}-contenido`} className="p-2">
                {grupos.length === 0 ? (
                  <p className="px-2 py-3 text-center text-sm text-suelo-500">{s.vacio}</p>
                ) : (
                  <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {grupos.map((g) => (
                      <li key={g.clave}>
                        <TarjetaGrupo g={g} todas={todas} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

// Una tarjeta: qué proceso, qué grupo, dónde, cuántas, la barra del tiempo
// estimado y el botón de lo que sigue. El nombre lleva a la ficha del proceso
// (con todo su historial).
function TarjetaGrupo({ g, todas }) {
  const puedo = usePuede();
  const p = g.proceso;
  const prox = g.proxima;
  const estilo = estiloSugerencia(prox?.estado);
  const parte = avance(g.desde, prox?.fecha, hoyIso());
  const accion = puedo('pecuaria:CREAR') ? accionDeGrupo(p.id, g) : null;
  // El botón resalta cuando ya toca (hoy, atrasada) o cuando no hay fecha (vacías).
  const urgente = !prox || prox.estado === 'ATRASADA' || prox.estado === 'HOY';
  // Compacta (24/11, captura de Diego): nombre y cabezas; qué grupo y dónde;
  // lo que sigue con los días y la barra; las fechas y el botón, chico, al lado.
  return (
    // Lo que viene de una IATF y pasó al toro, en color trigo y con la etiqueta.
    <article
      className={`rounded-lg border px-3 py-2 ${g.deIatf ? 'border-trigo-500 bg-trigo-100' : 'border-suelo-300 bg-superficie'}`}
      data-testid="tarjeta-grupo"
      data-tipo={g.tipo}
      data-de-iatf={g.deIatf ? 'true' : undefined}
    >
      <div className="flex items-baseline gap-2">
        <Link to={`/pecuaria/procesos/${p.id}`} className="min-w-0 flex-1 truncate font-semibold text-campo-800 hover:underline">
          {nombreProceso(p, todas)}
        </Link>
        <span className="shrink-0 font-bold tabular-nums">
          {formatNumero(g.cabezas)} <span className="text-xs font-normal text-suelo-500">cab</span>
        </span>
      </div>
      <p className="truncate text-xs text-suelo-600">
        {g.deIatf && <span className="mr-1 rounded bg-trigo-500 px-1.5 py-px text-[11px] font-semibold text-trigo-900">viene de IATF</span>}
        {TEXTO_GRUPO[g.tipo]}
        {g.tipo === 'VIENTRES' && ` · ${textoTipo(p.modalidad)}`}
        {g.potreros.length ? ` · ${g.potreros.join(', ')}` : ''}
        {g.terneros ? ` · ${formatNumero(g.terneros)} terneros` : ''}
      </p>
      {prox && (
        <div className="mt-1.5" data-estado={prox.estado}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 truncate text-suelo-700">{prox.nombre}</span>
            <span className={`shrink-0 font-semibold ${prox.estado === 'ATRASADA' ? 'text-red-700' : prox.estado === 'PROXIMA' || prox.estado === 'HOY' ? 'text-campo-700' : 'text-suelo-700'}`}>
              {diasCorto(prox) || prox.texto}
            </span>
          </div>
          {parte != null && (
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-suelo-200/70" aria-hidden="true" data-testid="barra-tiempo">
              <div className={`h-full rounded-full ${prox.estado === 'ATRASADA' ? 'bg-red-600' : 'bg-campo-500'}`} style={{ width: `${Math.round(parte * 100)}%` }} />
            </div>
          )}
        </div>
      )}
      {(prox || accion) && (
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-xs text-suelo-500">
            {prox && (prox.hasta ? `${formatFecha(prox.fecha)} a ${formatFecha(prox.hasta)}` : `Estimado ${formatFecha(prox.fecha)}`)}
          </p>
          {accion && (
            <Link
              to={accion.ruta}
              className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold ${urgente ? 'bg-boton text-white hover:bg-boton-hover' : `border ${estilo.tarjeta} text-campo-700 hover:border-campo-500`}`}
            >
              {accion.texto}
            </Link>
          )}
        </div>
      )}
    </article>
  );
}
