import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getProcesos, getProcesosTodas } from '../api/pecuaria';
import { getErrorMessages } from '../api/axios';
import usePuede from '../hooks/usePuede';
import { ErrorList } from './ui';
import Icono from './Icono';
import { formatFecha, formatNumero } from './pecuaria';
import { diasCorto, estiloSugerencia, nombreProceso, textoTipo } from './procesos';
import { SECCIONES_TABLERO, TEXTO_GRUPO, accionDeGrupo, armarTablero, avance, avisoDeSeccion, ordenarGrupos } from './tablero';
import { TituloOrdenable, celda } from './tabla';

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

// Las 4 secciones una debajo de la otra, como un acordeón (el dibujo de
// Diego: todo el ciclo a la vista). Arrancan cerradas. Pedido del 25/11 (con
// captura): cada sección mide lo que mide su contenido (cerrada, el
// encabezado; abierta, el encabezado y la tabla entera), no un pedazo fijo de
// la pantalla: con dos abiertas no quedan chicas. Si no entra todo, se baja
// con el dedo el tablero entero (la barra de abajo de Procesos queda fija).
export default function TableroProcesos({ tablero, errors, todas }) {
  const [abiertas, setAbiertas] = useState(() => new Set());
  const alternar = (clave) =>
    setAbiertas((antes) => {
      const nuevas = new Set(antes);
      nuevas.has(clave) ? nuevas.delete(clave) : nuevas.add(clave);
      return nuevas;
    });
  if (errors.length) return <ErrorList errors={errors} />;
  if (!tablero) return <p className="text-suelo-600">Cargando…</p>;
  return (
    <div className="-mx-1 min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-1" data-testid="tablero">
      <div className="flex flex-col gap-2">
        {SECCIONES_TABLERO.map((s, i) => {
          const abierta = abiertas.has(s.clave);
          const grupos = tablero[s.clave];
          // Cerrada: debajo del nombre, lo más urgente (abierta, ya se ve en la tabla).
          const aviso = abierta ? null : avisoDeSeccion(grupos);
          return (
            <section key={s.clave} aria-label={s.nombre} className="rounded-lg border border-suelo-300 bg-superficie" data-testid={`seccion-${s.clave}`}>
              <h2>
                <button
                  type="button"
                  onClick={() => alternar(s.clave)}
                  aria-expanded={abierta}
                  aria-controls={`seccion-${s.clave}-contenido`}
                  className={`flex w-full items-center gap-3 bg-suelo-100 px-3 py-2.5 text-left hover:bg-suelo-200/70 ${abierta ? 'rounded-t-lg' : 'rounded-lg'}`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-boton font-bold text-white">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold leading-tight">{s.nombre}</span>
                    {aviso ? (
                      <span className={`block truncate text-xs font-semibold ${colorDias(aviso.estado)}`} data-testid={`aviso-${s.clave}`}>
                        {aviso.estado === 'ATRASADA' && '! '}
                        {aviso.texto}
                      </span>
                    ) : (
                      <span className="block truncate text-xs text-suelo-500">{grupos.length ? s.sub : 'Sin vacas'}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-right leading-tight">
                    <span className="block text-xl font-bold tabular-nums" data-testid={`total-${s.clave}`}>
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
                <div id={`seccion-${s.clave}-contenido`} data-testid={`contenido-${s.clave}`}>
                  {grupos.length === 0 ? (
                    <p className="px-2 py-3 text-center text-sm text-suelo-500">{s.vacio}</p>
                  ) : (
                    <TablaGrupos grupos={grupos} todas={todas} />
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

// La tabla de una sección (25/11, Diego: "un Excel, no tarjetas"): una fila
// por grupo (proceso × estado), con líneas como en Excel, los títulos fijos
// arriba y orden por columna (por defecto, lo que vence primero).
//   Celular: Proceso (debajo, qué grupo y dónde) | Cab. | Lo que sigue (los
//            días y la fecha debajo) | el botón.
//   Compu:   suma Estado, Potreros y Fecha en sus columnas.
// Lo que viene de una IATF y pasó al toro va en color trigo, con "IATF".
function TablaGrupos({ grupos, todas }) {
  const puedo = usePuede();
  const [orden, setOrden] = useState({ col: 'proxima', dir: 'asc' });
  const ordenar = (col) => setOrden((o) => ({ col, dir: o.col === col && o.dir === 'asc' ? 'desc' : 'asc' }));
  const filas = useMemo(() => ordenarGrupos(grupos, orden), [grupos, orden]);
  const hoy = hoyIso();
  const conAccion = puedo('pecuaria:CREAR');
  const titulo = 'sticky top-0 z-10 border-b border-r border-suelo-300 bg-suelo-100 px-1.5 py-1.5 font-medium last:border-r-0 md:px-2';
  return (
    <table className="w-full table-fixed border-collapse text-sm" data-testid="tabla-grupos">
      <thead className="text-left text-xs text-suelo-600">
        <tr>
          <TituloOrdenable col="proceso" titulo="Proceso" orden={orden} onOrdenar={ordenar} />
          <th scope="col" className={`${titulo} hidden w-36 md:table-cell`}>
            Estado
          </th>
          <TituloOrdenable col="potreros" titulo="Potreros" orden={orden} onOrdenar={ordenar} className="hidden w-32 md:table-cell" />
          <TituloOrdenable col="cabezas" titulo="Cab." orden={orden} onOrdenar={ordenar} derecha className="w-12 md:w-16" />
          <TituloOrdenable col="proxima" titulo="Lo que sigue" orden={orden} onOrdenar={ordenar} className="w-24 md:w-40" />
          <th scope="col" className={`${titulo} hidden w-36 md:table-cell`}>
            Fecha
          </th>
          {conAccion && (
            <th scope="col" className={`${titulo} w-20 md:w-32`}>
              <span className="sr-only">Registrar</span>
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {filas.map((g) => (
          <FilaGrupo key={g.clave} g={g} todas={todas} hoy={hoy} conAccion={conAccion} />
        ))}
      </tbody>
    </table>
  );
}

const fechaDe = (prox) => (prox ? (prox.hasta ? `${formatFecha(prox.fecha)} a ${formatFecha(prox.hasta)}` : formatFecha(prox.fecha)) : '');
const colorDias = (estado) =>
  estado === 'ATRASADA' ? 'text-red-700' : estado === 'PROXIMA' || estado === 'HOY' ? 'text-campo-700' : 'text-suelo-600';

function FilaGrupo({ g, todas, hoy, conAccion }) {
  const p = g.proceso;
  const prox = g.proxima;
  const estilo = estiloSugerencia(prox?.estado);
  const parte = avance(g.desde, prox?.fecha, hoy);
  const accion = conAccion ? accionDeGrupo(p.id, g) : null;
  // El botón resalta cuando ya toca (hoy, atrasada) o cuando no hay fecha (vacías).
  const urgente = !prox || prox.estado === 'ATRASADA' || prox.estado === 'HOY';
  const estado = `${TEXTO_GRUPO[g.tipo]}${g.tipo === 'VIENTRES' ? ` · ${textoTipo(p.modalidad)}` : ''}`;
  const potreros = g.potreros.join(', ');
  return (
    <tr
      className={`h-14 ${g.deIatf ? 'bg-trigo-100' : 'odd:bg-superficie even:bg-suelo-50'}`}
      data-testid="fila-grupo"
      data-tipo={g.tipo}
      data-de-iatf={g.deIatf ? 'true' : undefined}
    >
      <td className={`${celda} ${g.deIatf ? 'border-l-4 border-l-trigo-500' : ''}`}>
        <Link to={`/pecuaria/procesos/${p.id}`} className="block truncate font-semibold text-campo-800 hover:underline">
          {nombreProceso(p, todas)}
        </Link>
        {/* En el celular, el estado y los potreros van debajo del nombre. */}
        <p className="truncate text-xs text-suelo-600 md:hidden">
          {g.deIatf && <span className="mr-1 rounded bg-trigo-500 px-1 text-[10px] font-semibold text-trigo-900">viene de IATF</span>}
          {estado}
          {potreros ? ` · ${potreros}` : ''}
        </p>
        {g.deIatf && (
          <span className="mt-0.5 hidden rounded bg-trigo-500 px-1.5 text-[11px] font-semibold text-trigo-900 md:inline-block">viene de IATF</span>
        )}
      </td>
      <td className={`${celda} hidden text-suelo-700 md:table-cell`}>{estado}</td>
      <td className={`${celda} hidden truncate text-suelo-700 md:table-cell`}>{potreros || '—'}</td>
      <td className={`${celda} text-right tabular-nums`}>
        <span className="font-bold">{formatNumero(g.cabezas)}</span>
        {g.terneros ? <span className="block text-xs text-suelo-500">{formatNumero(g.terneros)} ter.</span> : null}
      </td>
      <td className={celda} data-estado={prox?.estado}>
        {prox ? (
          <>
            <span className="block truncate text-suelo-800">{prox.nombre}</span>
            <span className={`block truncate text-xs font-semibold ${colorDias(prox.estado)}`}>
              {diasCorto(prox) || prox.texto}
              <span className="font-normal text-suelo-500 md:hidden"> · {fechaDe(prox)}</span>
            </span>
            {parte != null && (
              <span className="mt-1 block h-1 overflow-hidden rounded-full bg-suelo-200/70" aria-hidden="true" data-testid="barra-tiempo">
                <span className={`block h-full rounded-full ${prox.estado === 'ATRASADA' ? 'bg-red-600' : 'bg-campo-500'}`} style={{ width: `${Math.round(parte * 100)}%` }} />
              </span>
            )}
          </>
        ) : (
          <span className="text-xs text-suelo-500">Sin fecha</span>
        )}
      </td>
      <td className={`${celda} hidden text-suelo-700 md:table-cell`}>{prox ? (prox.hasta ? fechaDe(prox) : `Estimado ${fechaDe(prox)}`) : '—'}</td>
      {conAccion && (
        <td className={`${celda} align-middle`}>
          {accion && (
            <Link
              to={accion.ruta}
              className={`block rounded-md px-1.5 py-1.5 text-center text-xs font-semibold leading-tight ${urgente ? 'bg-boton text-white hover:bg-boton-hover' : `border ${estilo.tarjeta} text-campo-700 hover:border-campo-500`}`}
            >
              {accion.texto}
            </Link>
          )}
        </td>
      )}
    </tr>
  );
}
