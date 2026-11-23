import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { editarLote, getLote } from '../api/pecuaria';
import { getErrorMessages } from '../api/axios';
import { ErrorList, Notice, inputClass } from '../components/ui';
import { formatFecha, formatNumero, EnProceso } from '../components/pecuaria';
import { EventoItem, MovimientoItem } from '../components/movimientos';
import usePuede from '../hooks/usePuede';
import BotonEventos from '../components/BotonEventos';

const hoy = () => new Date().toLocaleDateString('sv-SE');
const aNumero = (texto) => (String(texto).trim() === '' ? null : Number(String(texto).replace(',', '.')));

// Feedlot: cuándo entró el lote al corral y con cuánto peso promedio. Con eso
// el Resumen del feedlot calcula los días de encierre, el peso de hoy y la
// salida probable. Se edita con el permiso de registrar (como el nombre).
export function EntradaCorral({ lote, puedeEditar, onGuardar }) {
  const [editando, setEditando] = useState(false);
  const [fecha, setFecha] = useState(lote.fechaEntrada ?? '');
  const [peso, setPeso] = useState(lote.pesoEntradaKg == null ? '' : String(lote.pesoEntradaKg));
  const [ocupado, setOcupado] = useState(false);
  const pesoNum = aNumero(peso);
  const pesoMal = pesoNum != null && !(pesoNum > 0);

  async function guardar(e) {
    e.preventDefault();
    setOcupado(true);
    try {
      if (await onGuardar({ fechaEntrada: fecha || null, pesoEntradaKg: pesoNum })) setEditando(false);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3" aria-label="Entrada al corral">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">Entrada al corral</p>
        {puedeEditar && !editando && (
          <button type="button" onClick={() => setEditando(true)} className="text-sm text-campo-600 hover:underline">
            Editar
          </button>
        )}
      </div>
      {!editando ? (
        <p className="mt-1 text-sm text-suelo-700">
          {lote.fechaEntrada ? `Entró el ${formatFecha(lote.fechaEntrada)}` : 'Sin fecha de entrada'}
          {' · '}
          {lote.pesoEntradaKg != null ? `${formatNumero(lote.pesoEntradaKg)} kg promedio` : 'sin peso de entrada'}
        </p>
      ) : (
        <form onSubmit={guardar} className="mt-2 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-suelo-600">
              Fecha de entrada
              <input type="date" value={fecha} max={hoy()} onChange={(e) => setFecha(e.target.value)} className={`${inputClass} mt-1`} />
            </label>
            <label className="text-sm text-suelo-600">
              Peso de entrada (kg promedio)
              <input inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} aria-label="Peso de entrada" className={`${inputClass} mt-1`} />
            </label>
          </div>
          {pesoMal && <p className="text-sm text-red-700">El peso tiene que ser mayor que cero.</p>}
          <div className="flex gap-3">
            <button type="button" onClick={() => setEditando(false)} className="rounded-md border border-suelo-300 px-3 py-2 text-sm">
              Cancelar
            </button>
            <button type="submit" disabled={ocupado || pesoMal} className="rounded-md bg-campo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {ocupado ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

// Un lote repartido en varios potreros (familia de lotes): sus partes, con
// las cabezas de cada una y el total.
function Familia({ familia, loteId }) {
  const potreros = new Set(familia.partes.map((p) => p.potrero.id)).size;
  return (
    <section className="mt-4 rounded-lg border border-campo-200 bg-campo-50/60 px-4 py-3" aria-label="Lote repartido">
      <p className="font-semibold">
        Repartido en {potreros} potrero{potreros === 1 ? '' : 's'} · {formatNumero(familia.cabezas)} cab en total
      </p>
      <ul className="mt-2 space-y-1 text-sm">
        {familia.partes.map((p) => (
          <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
            {p.id === loteId ? (
              <span className="font-medium">{p.nombre} (este)</span>
            ) : (
              <Link to={`/pecuaria/lotes/${p.id}`} className="text-campo-700 hover:underline">
                {p.nombre}
              </Link>
            )}
            <span className="text-suelo-600">
              {p.potrero.nombre} · {formatNumero(p.cabezas)} cab{p.categoria ? ` · ${p.categoria}` : ''}
            </span>
          </li>
        ))}
      </ul>
      {familia.otrasEstancias > 0 && (
        <p className="mt-2 text-xs text-suelo-600">
          Y {familia.otrasEstancias} parte{familia.otrasEstancias === 1 ? '' : 's'} en otra{familia.otrasEstancias === 1 ? '' : 's'} estancia
          {familia.otrasEstancias === 1 ? '' : 's'}.
        </p>
      )}
    </section>
  );
}

// Historial de un lote: dónde está, qué tiene y por dónde pasó.
export default function LotePage() {
  const { id } = useParams();
  const puedo = usePuede();
  const location = useLocation();
  const [datos, setDatos] = useState(null);
  const [errors, setErrors] = useState([]);
  // Lo que se acaba de anotar (un evento abierto desde acá).
  const [aviso, setAviso] = useState(location.state?.aviso ?? null);

  const cargar = useCallback(
    () =>
      getLote(id)
        .then(({ data }) => setDatos(data))
        .catch((error) => setErrors(getErrorMessages(error, 'No se pudo cargar el lote'))),
    [id],
  );
  useEffect(() => {
    cargar();
  }, [cargar]);

  // Devuelve true si se guardó.
  async function guardarEntrada(cambio) {
    try {
      await editarLote(id, cambio);
      setErrors([]);
      setAviso('Entrada al corral guardada.');
      await cargar();
      return true;
    } catch (error) {
      setAviso(null);
      setErrors(getErrorMessages(error, 'No se pudo guardar'));
      return false;
    }
  }

  if (!datos) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <ErrorList errors={errors} />
        {!errors.length && <p className="text-suelo-600">Cargando…</p>}
      </main>
    );
  }
  const { lote, actual, familia, movimientos, eventos = [], procesos = [] } = datos;
  // La entrada al corral se ve en un corral, o si ya tiene datos (un lote que salió del feedlot).
  const conEntrada = lote.potrero.tipo === 'CORRAL' || lote.fechaEntrada || lote.pesoEntradaKg != null;
  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <Link to="/pecuaria/registro" className="text-sm text-campo-600 hover:underline">
        ← Registro
      </Link>
      <h1 className="mt-2 text-3xl font-bold">
        {lote.nombre}
        {!lote.activo && <span className="ml-2 align-middle text-sm font-medium text-suelo-600">cerrado</span>}
      </h1>
      <p className="text-suelo-600">
        {lote.categoria} · {lote.activo ? 'está en' : 'estuvo por última vez en'}{' '}
        <Link to={`/pecuaria/potreros/${lote.potrero.id}`} className="text-campo-700 hover:underline">
          {lote.potrero.nombre}
        </Link>
      </p>
      <EnProceso procesos={procesos} />
      {lote.activo && <BotonEventos contexto={{ lote: lote.id }} className="mt-3" />}

      {actual ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-suelo-200 bg-white px-4 py-3">
          <p>
            <strong className="text-2xl">{formatNumero(actual.cabezas)}</strong> cab
            {actual.pesoPromedioKg ? ` · ${formatNumero(actual.pesoPromedioKg)} kg promedio` : ''}
            <span className="ml-2 text-xs text-suelo-500">al {formatFecha(actual.fecha)}</span>
          </p>
        </div>
      ) : (
        <p className="mt-4 text-suelo-600">Hoy no tiene animales.</p>
      )}

      <div className="mt-3">
        <ErrorList errors={errors} />
        <Notice tone="ok">{aviso}</Notice>
      </div>
      {conEntrada && <EntradaCorral key={`${lote.fechaEntrada}-${lote.pesoEntradaKg}`} lote={lote} puedeEditar={puedo('pecuaria:CREAR')} onGuardar={guardarEntrada} />}

      {familia && <Familia familia={familia} loteId={lote.id} />}

      <h2 className="mb-2 mt-8 text-lg font-semibold">Movimientos</h2>
      {movimientos.length === 0 ? (
        <p className="text-suelo-600">Este lote todavía no tuvo movimientos.</p>
      ) : (
        <ul className="space-y-2">
          {movimientos.map((m) => (
            <MovimientoItem key={m.id} m={m} />
          ))}
        </ul>
      )}

      {/* Lo que se le hizo sin moverlo (pesadas, vacunas...): botón Eventos. */}
      <h2 className="mb-2 mt-8 text-lg font-semibold">Eventos</h2>
      {eventos.length === 0 ? (
        <p className="text-suelo-600">Todavía no tiene eventos (pesadas, vacunas…). Se anotan con el botón Eventos.</p>
      ) : (
        <ul className="space-y-2" data-testid="eventos-lote">
          {eventos.map((e) => (
            <EventoItem key={e.id} e={e} />
          ))}
        </ul>
      )}
    </main>
  );
}
