import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEstancia } from '../context/EstanciaContext';
import usePotreros from '../hooks/usePotreros';
import { ErrorList } from './ui';
import { formatNumero } from './pecuaria';
import Icono from './Icono';

const sinTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const TONO = {
  salida: 'text-red-700',
  correccion: 'text-tierra-600',
};

// La hoja del botón "+": qué registrar → en qué potrero → (si hace falta) qué
// lote. Después lleva a la pantalla que ya existe para eso.
// En el celular sube desde abajo; en la compu es una ventana al medio.
export default function HojaRegistrar({ acciones, onCerrar }) {
  const navigate = useNavigate();
  const estancia = useEstancia();
  // Con "Todas las estancias" elegido, primero se pide cuál.
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
      .filter((p) => accion?.pide !== 'lote' || (p.stock?.lotes ?? []).length > 0)
      .filter((p) => !q || sinTildes(p.nombre).includes(q) || (p.stock?.lotes ?? []).some((l) => sinTildes(l.lote).includes(q)));
  }, [potreros, busqueda, accion]);

  function elegirPotrero(p) {
    const lotes = p.stock?.lotes ?? [];
    if (accion.pide === 'potrero') return navigate(accion.destino(p.id));
    if (lotes.length === 1) return navigate(accion.destino(p.id, lotes[0].loteId));
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
  if (pideEstancia) titulo = '¿En qué estancia?';
  else if (accion && !potrero) titulo = accion.pregunta;
  if (potrero) titulo = `¿Qué lote de ${potrero.nombre}?`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center">
      <button type="button" aria-label="Cerrar" onClick={onCerrar} className="absolute inset-0 bg-black/40" />
      <div
        role="dialog"
        aria-label={titulo}
        className="relative flex max-h-[85vh] w-full flex-col rounded-t-2xl bg-white px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 lg:max-w-md lg:rounded-2xl lg:pb-5"
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

        {!accion && (
          <ul className="space-y-1">
            {acciones.map((a) => (
              <li key={a.clave}>
                <button
                  type="button"
                  onClick={() => setAccion(a)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-suelo-100"
                >
                  <span className={TONO[a.tono] ?? 'text-campo-600'}>
                    <Icono nombre={a.icono} className="h-6 w-6" />
                  </span>
                  <span>
                    <span className="block font-medium">{a.texto}</span>
                    {a.detalle && <span className="block text-xs text-suelo-500">{a.detalle}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {pideEstancia && (
          <ul className="-mx-1 divide-y divide-suelo-200">
            {(estancia.campos ?? []).map((c) => (
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
                <label className="mb-2 flex items-center gap-2 rounded-md border border-suelo-300 bg-white px-3 py-2">
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
                      <button type="button" onClick={() => elegirPotrero(p)} className="flex w-full items-center justify-between gap-3 px-2 py-2.5 text-left hover:bg-suelo-100">
                        <span className="font-medium">{p.nombre}</span>
                        <span className="text-sm text-suelo-500">{formatNumero(p.stock?.cabezas ?? 0)} cab</span>
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
