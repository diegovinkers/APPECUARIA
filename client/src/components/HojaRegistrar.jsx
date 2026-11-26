import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEstancia } from '../context/EstanciaContext';
import usePotreros from '../hooks/usePotreros';
import { getTiposMovimiento } from '../api/pecuaria';
import { getErrorMessages } from '../api/axios';
import { rutaEvento, rutaPasto } from '../navegacion/menu';
import { ErrorList } from './ui';
import { formatNumero, queHayYUso } from './pecuaria';
import { ListaEventos } from './HojaEventos';
import Icono from './Icono';

const sinTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// El "+" en secciones, como en el boceto de los eventos (20/11): MOVER arriba
// (el primero, grande), ENTRA y SALE en dos columnas, y lo demás abajo, chico.
function Acciones({ acciones, onElegir }) {
  const de = (seccion) => acciones.filter((a) => (a.seccion ?? 'mover') === seccion);
  const [entra, sale, otro] = [de('entra'), de('sale'), de('otro')];
  const chico = (a) => (
    <li key={a.clave}>
      <button type="button" onClick={() => onElegir(a)} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-suelo-100">
        <span className={TONO[a.tono] ?? 'text-campo-600'}>
          <Icono nombre={a.icono} className="h-5 w-5" />
        </span>
        <span className="font-medium">{a.texto}</span>
      </button>
    </li>
  );
  return (
    <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
      <p className="px-1 text-xs font-semibold uppercase tracking-wide text-suelo-500">Mover</p>
      <ul className="mt-1 space-y-1">
        {de('mover').map((a) => (
          <li key={a.clave}>
            <button
              type="button"
              onClick={() => onElegir(a)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 text-left ${a.grande ? 'min-h-14 border border-campo-200 bg-campo-50 py-3 hover:bg-campo-100' : 'min-h-11 py-2 hover:bg-suelo-100'}`}
            >
              <span className={TONO[a.tono] ?? 'text-campo-600'}>
                <Icono nombre={a.icono} className={a.grande ? 'h-7 w-7' : 'h-6 w-6'} />
              </span>
              <span>
                <span className={`block font-medium ${a.grande ? 'text-base' : ''}`}>{a.texto}</span>
                {a.detalle && <span className="block text-xs text-suelo-500">{a.detalle}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {(entra.length > 0 || sale.length > 0) && (
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-suelo-200 pt-3">
          <div>
            <p className="px-1 text-xs font-semibold uppercase tracking-wide text-emerald-800">Entra</p>
            <ul className="mt-1">{entra.map(chico)}</ul>
          </div>
          <div>
            <p className="px-1 text-xs font-semibold uppercase tracking-wide text-red-700">Sale</p>
            <ul className="mt-1">{sale.map(chico)}</ul>
          </div>
        </div>
      )}
      {otro.length > 0 && <ul className="mt-2 border-t border-suelo-200 pt-2">{otro.map(chico)}</ul>}
    </div>
  );
}

const TONO = {
  salida: 'text-red-700',
  correccion: 'text-tierra-600',
};

// Los eventos del "+" (24/11): los tipos del catálogo se piden la primera vez
// que se abre la pestaña Eventos. Arriba, fijo, "Pasto de los potreros" (26/11):
// no es un tipo del catálogo (no se le hace nada a los animales).
function EventosDelMas({ contexto, onElegir }) {
  const [tipos, setTipos] = useState(null);
  const [errors, setErrors] = useState([]);
  useEffect(() => {
    getTiposMovimiento()
      .then(({ data }) => setTipos(data))
      .catch((error) => setErrors(getErrorMessages(error, 'No se pudieron cargar los eventos')));
  }, []);
  return (
    <>
      <button
        type="button"
        onClick={() => onElegir(rutaPasto(contexto))}
        className="mb-3 flex min-h-12 w-full shrink-0 items-center gap-3 rounded-lg border border-suelo-300 px-3 py-2 text-left hover:border-campo-500 hover:bg-campo-50"
      >
        <span className="text-campo-600">
          <Icono nombre="pasto" className="h-6 w-6" />
        </span>
        <span>
          <span className="block font-medium">Pasto de los potreros</span>
          <span className="block text-xs text-suelo-500">Bajo, medio o alto, sin mover ganado</span>
        </span>
      </button>
      <ErrorList errors={errors} />
      {!tipos && !errors.length && <p className="py-4 text-sm text-suelo-600">Cargando…</p>}
      {tipos && <ListaEventos tipos={tipos} onElegir={(t) => onElegir(rutaEvento(t.id, contexto))} />}
    </>
  );
}

const VISTAS = [
  { clave: 'mover', texto: 'Movimientos', ayuda: 'Cambian de lugar, entran o salen.' },
  { clave: 'eventos', texto: 'Eventos', ayuda: 'Les hiciste algo y siguen donde estaban.' },
];

// La hoja del botón "+": todo lo que se registra, en un solo lugar (24/11).
// Arriba, Movimientos / Eventos. Movimientos: qué → en qué potrero → (si hace
// falta) qué lote, y lleva a la pantalla que ya existe para eso. Eventos: el
// tipo, y el camino de 4 pasos (arranca con el potrero o el lote de la ficha
// donde estabas: `contexto`). `inicial`: con qué pestaña abre.
// En el celular sube desde abajo; en la compu es una ventana al medio.
export default function HojaRegistrar({ acciones, onCerrar, eventos = false, contexto = {}, inicial = 'mover' }) {
  const navigate = useNavigate();
  const [vista, setVista] = useState(eventos ? inicial : 'mover');
  const estancia = useEstancia();
  // Con "Todas las estancias" o "Todos los feedlots" elegido, primero se pide
  // cuál (de ese grupo).
  const [elegida, setElegida] = useState(null);
  const campoId = estancia.todas ? elegida?.id : estancia.campoId;
  const campo = estancia.todas ? elegida : estancia.campo;
  const [accion, setAccion] = useState(null);
  const [potrero, setPotrero] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const { potreros, errors } = usePotreros(accion ? campoId : null);

  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && onCerrar();
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [onCerrar]);

  const lista = useMemo(() => {
    if (!potreros) return [];
    const q = sinTildes(busqueda.trim());
    return potreros
      .filter((p) => accion?.pide !== 'lote' || (p.stock?.lotes ?? []).length >= (accion.minLotes ?? 1))
      .filter((p) => !q || sinTildes(p.nombre).includes(q) || (p.stock?.lotes ?? []).some((l) => sinTildes(l.lote).includes(q)));
  }, [potreros, busqueda, accion]);

  function elegirPotrero(p) {
    const lotes = p.stock?.lotes ?? [];
    if (accion.pide === 'potrero') return navigate(accion.destino(p.id));
    if (lotes.length === 1 && !accion.minLotes) return navigate(accion.destino(p.id, lotes[0].loteId));
    setPotrero(p);
  }

  function volver() {
    if (potrero) setPotrero(null);
    else if (estancia.todas && elegida) {
      setElegida(null);
      setBusqueda('');
    } else {
      setAccion(null);
      setBusqueda('');
    }
  }

  const pideEstancia = accion && estancia.todas && !elegida;
  let titulo = 'Registrar';
  if (pideEstancia) titulo = estancia.esFeedlot ? '¿En qué feedlot?' : '¿En qué estancia?';
  else if (accion && !potrero) titulo = accion.pregunta;
  if (potrero) titulo = accion.pideLote ?? `¿Qué lote de ${potrero.nombre}?`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center">
      <button type="button" aria-label="Cerrar" onClick={onCerrar} className="absolute inset-0 bg-black/40" />
      <div
        role="dialog"
        aria-label={titulo}
        className="relative flex max-h-[85vh] w-full flex-col rounded-t-2xl bg-superficie px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 lg:max-w-md lg:rounded-2xl lg:pb-5"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-suelo-300 lg:hidden" aria-hidden="true" />
        <div className="mb-2 flex items-center gap-2">
          {accion && (
            <button type="button" onClick={volver} aria-label="Volver" className="-ml-1 rounded-md p-1 text-campo-600 hover:bg-campo-50">
              <Icono nombre="atras" />
            </button>
          )}
          <h2 className="flex-1 text-base font-semibold">{titulo}</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-md p-1 text-suelo-500 hover:bg-suelo-200/70">
            <Icono nombre="cerrar" />
          </button>
        </div>

        {!accion && eventos && (
          <>
            <nav aria-label="Qué registrar" className="flex gap-1 rounded-lg bg-suelo-200/70 p-1">
              {VISTAS.map((v) => (
                <button
                  key={v.clave}
                  type="button"
                  onClick={() => setVista(v.clave)}
                  aria-pressed={vista === v.clave}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold ${vista === v.clave ? 'bg-boton text-white shadow-sm' : 'text-suelo-700 hover:bg-suelo-300/60'}`}
                >
                  {v.texto}
                </button>
              ))}
            </nav>
            <p className="mb-2 mt-1.5 px-1 text-xs text-suelo-500">{VISTAS.find((v) => v.clave === vista).ayuda}</p>
          </>
        )}

        {!accion && vista === 'mover' && <Acciones acciones={acciones} onElegir={(a) => (a.pide ? setAccion(a) : navigate(a.destino()))} />}
        {!accion && vista === 'eventos' && <EventosDelMas contexto={contexto} onElegir={(ruta) => navigate(ruta)} />}

        {pideEstancia && (
          <ul className="-mx-1 divide-y divide-suelo-200">
            {(estancia.camposDelGrupo ?? estancia.campos ?? []).map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setElegida(c)} className="w-full px-2 py-3 text-left font-medium hover:bg-suelo-100">
                  {c.nombre}
                </button>
              </li>
            ))}
          </ul>
        )}

        {accion && !pideEstancia && !potrero && (
          <>
            <ErrorList errors={errors} />
            {!campoId && <p className="py-4 text-sm text-suelo-600">Todavía no hay estancias cargadas.</p>}
            {campoId && (
              <>
                <label className="mb-2 flex items-center gap-2 rounded-md border border-suelo-300 bg-superficie px-3 py-2">
                  <Icono nombre="buscar" className="h-4 w-4 text-suelo-500" />
                  <input
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder={`Buscar potrero en ${campo?.nombre ?? 'la estancia'}`}
                    aria-label="Buscar potrero"
                    className="w-full bg-transparent text-sm outline-none placeholder:text-suelo-400"
                  />
                </label>
                {!potreros && !errors.length && <p className="py-4 text-sm text-suelo-600">Cargando…</p>}
                {potreros && lista.length === 0 && (
                  <p className="py-4 text-sm text-suelo-600">
                    {busqueda ? 'Ningún potrero coincide.' : 'No hay potreros con animales.'}
                  </p>
                )}
                <ul className="-mx-1 min-h-0 flex-1 divide-y divide-suelo-200 overflow-y-auto">
                  {lista.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => elegirPotrero(p)} className="flex w-full items-baseline justify-between gap-3 px-2 py-2.5 text-left hover:bg-suelo-100">
                        <span className="min-w-0">
                          <span className="block font-medium">{p.nombre}</span>
                          {/* Cabezas de qué (por categoría) y el uso del potrero. */}
                          <span className="block text-xs text-suelo-500">{queHayYUso(p)}</span>
                        </span>
                        <span className="shrink-0 text-sm text-suelo-500">{formatNumero(p.stock?.cabezas ?? 0)} cab</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}

        {potrero && (
          <ul className="-mx-1 min-h-0 flex-1 divide-y divide-suelo-200 overflow-y-auto">
            {potrero.stock.lotes.map((l) => (
              <li key={l.loteId}>
                <button
                  type="button"
                  onClick={() => navigate(accion.destino(potrero.id, l.loteId))}
                  className="flex w-full items-center justify-between gap-3 px-2 py-2.5 text-left hover:bg-suelo-100"
                >
                  <span>
                    <span className="block font-medium">{l.lote}</span>
                    <span className="block text-xs text-suelo-500">{l.categoria}</span>
                  </span>
                  <span className="text-sm text-suelo-500">{formatNumero(l.cabezas)} cab</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
