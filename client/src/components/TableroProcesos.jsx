import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getProcesos, getProcesosTodas } from '../api/pecuaria';
import { getErrorMessages } from '../api/axios';
import usePuede from '../hooks/usePuede';
import { ErrorList } from './ui';
import { formatFecha, formatNumero } from './pecuaria';
import { diasCorto, estiloSugerencia, nombreProceso, textoTipo } from './procesos';
import { SECCIONES_TABLERO, TEXTO_GRUPO, accionDeGrupo, armarTablero, avance } from './tablero';

const hoyIso = () => new Date().toLocaleDateString('sv-SE');

// El tablero de Procesos (24/11): en el celular, una sección por vez (la
// elige la pestaña de ProcesosPage); en la compu, las 4 columnas juntas.
// Los datos son la lista de procesos abiertos (cada uno trae sus grupos).
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

export default function TableroProcesos({ tablero, errors, seccion, todas }) {
  if (errors.length) return <ErrorList errors={errors} />;
  if (!tablero) return <p className="text-suelo-600">Cargando…</p>;
  return (
    <div className="min-h-0 flex-1 overflow-auto pb-4 md:grid md:grid-cols-4 md:gap-3" data-testid="tablero">
      {SECCIONES_TABLERO.map((s) => (
        <section key={s.clave} aria-label={s.nombre} className={`${s.clave === seccion ? 'block' : 'hidden'} min-w-0 md:block`} data-testid={`seccion-${s.clave}`}>
          {/* El título de la columna, solo en la compu (en el celular lo dice la pestaña). */}
          <header className="mb-2 hidden rounded-md bg-suelo-100 px-2.5 py-1.5 md:block">
            <p className="flex items-baseline justify-between gap-2 font-semibold">
              {s.nombre}
              <span className="text-sm tabular-nums text-suelo-600">{formatNumero(tablero.totales[s.clave])}</span>
            </p>
            <p className="text-xs text-suelo-500">{s.sub}</p>
          </header>
          <p className="mb-2 text-xs text-suelo-500 md:hidden">{s.sub}</p>
          {tablero[s.clave].length === 0 ? (
            <p className="rounded-lg border border-dashed border-suelo-300 p-4 text-center text-sm text-suelo-500">{s.vacio}</p>
          ) : (
            <ul className="space-y-2">
              {tablero[s.clave].map((g) => (
                <li key={g.clave}>
                  <TarjetaGrupo g={g} todas={todas} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
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
  return (
    <article className="rounded-lg border border-suelo-300 bg-superficie p-3" data-testid="tarjeta-grupo" data-tipo={g.tipo}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Link to={`/pecuaria/procesos/${p.id}`} className="block truncate font-semibold text-campo-800 hover:underline">
            {nombreProceso(p, todas)}
          </Link>
          <p className="truncate text-sm text-suelo-600">
            {TEXTO_GRUPO[g.tipo]}
            {g.tipo === 'VIENTRES' && ` · ${textoTipo(p.modalidad)}`}
            {g.potreros.length ? ` · ${g.potreros.join(', ')}` : ''}
          </p>
        </div>
        <p className="shrink-0 text-right leading-tight">
          <span className="block text-lg font-bold tabular-nums">{formatNumero(g.cabezas)}</span>
          <span className="text-xs text-suelo-500">{g.terneros ? `+ ${formatNumero(g.terneros)} terneros` : 'cab'}</span>
        </p>
      </div>
      {prox && (
        <div className="mt-2" data-estado={prox.estado}>
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
          <p className="mt-0.5 text-xs text-suelo-500">
            {g.desde ? `Desde ${formatFecha(g.desde)} · ` : ''}
            {prox.hasta ? `entre ${formatFecha(prox.fecha)} y ${formatFecha(prox.hasta)}` : `estimado ${formatFecha(prox.fecha)}`}
          </p>
        </div>
      )}
      {accion && (
        <Link
          to={accion.ruta}
          className={`mt-2 block rounded-md px-3 py-2 text-center text-sm font-semibold ${prox?.estado === 'ATRASADA' || prox?.estado === 'HOY' || !prox ? 'bg-boton text-white hover:bg-boton-hover' : `border ${estilo.tarjeta} text-campo-700 hover:border-campo-500`}`}
        >
          {accion.texto}
        </Link>
      )}
    </article>
  );
}
