import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getPotrero, registrarRecorridaPasto } from '../../api/pecuaria';
import { getErrorMessages } from '../../api/axios';
import { useEstancia } from '../../context/EstanciaContext';
import usePotreros from '../../hooks/usePotreros';
import { ErrorList, Notice, buttonClass, inputClass } from '../../components/ui';
import { UsoBadge } from '../../components/pecuaria';
import { PastoMarca, PastoSelector } from '../../components/PastoSelector';
import { ALTURAS, hace, lecturasDe, textoDescanso } from '../../components/pasto';
import Icono from '../../components/Icono';
import { EsqueletoLista } from '../../components/Esqueleto';
import { cerrarTecladoConEnter } from '../../hooks/useTeclado';

const hoy = () => new Date().toLocaleDateString('sv-SE');
const sinTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Recorrida de pasto (docs/superpowers/plans/2026-11-26-pasto.md): la altura de
// varios potreros de una estancia de una vez, sin mover ganado. Se llega desde
// el "+" → Eventos → "Pasto de los potreros", o desde la ficha de un potrero
// (?potrero=: ese va primero y marcado). Solo se guardan los que tienen altura.
export default function PastoPage() {
  const [params] = useSearchParams();
  const inicial = Number(params.get('potrero')) || null;
  const estancia = useEstancia();
  const [campoInicial, setCampoInicial] = useState(null);
  const [elegida, setElegida] = useState(null);
  const [errors, setErrors] = useState([]);

  // Desde la ficha de un potrero: su estancia, aunque arriba diga "Todas".
  useEffect(() => {
    if (!inicial) return;
    getPotrero(inicial)
      .then(({ data }) => setCampoInicial(data.campo))
      .catch((error) => setErrors(getErrorMessages(error, 'No se pudo cargar el potrero')));
  }, [inicial]);

  const campo = campoInicial ?? (estancia.todas ? elegida : estancia.campo);
  const esperando = inicial && !campoInicial && !errors.length;

  return (
    <main className="mx-auto max-w-3xl px-4 py-4 sm:py-8">
      <Link to={inicial ? `/pecuaria/potreros/${inicial}` : '/pecuaria/potreros'} className="text-sm text-campo-600 hover:underline">
        ← {inicial ? 'Volver al potrero' : 'Potreros'}
      </Link>
      <h1 className="mt-1 text-2xl font-bold">Pasto de los potreros</h1>
      {campo && <p className="text-sm font-medium text-suelo-700">{campo.nombre}</p>}
      <p className="mt-1 text-sm text-suelo-600">Una recorrida: marcá la altura de los potreros que viste. Los que dejes sin marcar no se guardan.</p>
      <div className="mt-3">
        <ErrorList errors={errors} />
      </div>

      {esperando && <EsqueletoLista testId="esqueleto-potreros-elegir" />}
      {!esperando && !campo && estancia.esFeedlot && <Notice>Los feedlots no llevan pasto. Elegí una estancia arriba.</Notice>}
      {!esperando && !campo && !estancia.esFeedlot && estancia.todas && (
        <section aria-label="Elegí la estancia">
          <h2 className="mb-1 text-sm font-semibold text-suelo-700">¿En qué estancia?</h2>
          <ul className="divide-y divide-suelo-200 rounded-lg border border-suelo-200 bg-superficie">
            {(estancia.camposDelGrupo ?? []).map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setElegida(c)} className="w-full px-3 py-3 text-left font-medium hover:bg-suelo-100">
                  {c.nombre}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {campo && <Recorrida key={campo.id} campo={campo} inicial={inicial} onCambiarEstancia={!campoInicial && estancia.todas ? () => setElegida(null) : null} />}
    </main>
  );
}

function Recorrida({ campo, inicial, onCambiarEstancia }) {
  const { potreros, errors: errorsLista } = usePotreros(campo.id);
  const [marcas, setMarcas] = useState({});
  const [busqueda, setBusqueda] = useState('');
  const [fecha, setFecha] = useState(hoy());
  const [nota, setNota] = useState('');
  const [errors, setErrors] = useState([]);
  const [ocupado, setOcupado] = useState(false);
  const [listo, setListo] = useState(null); // cuántos se guardaron

  // Los corrales no llevan pasto. El de la ficha, primero.
  const lista = useMemo(() => {
    if (!potreros) return [];
    const q = sinTildes(busqueda.trim());
    const con = potreros.filter((p) => p.llevaPasto !== false && p.tipo !== 'CORRAL');
    const filtrados = con.filter((p) => !q || sinTildes(p.nombre).includes(q) || p.id === inicial);
    return [...filtrados.filter((p) => p.id === inicial), ...filtrados.filter((p) => p.id !== inicial)];
  }, [potreros, busqueda, inicial]);

  const lecturas = lecturasDe(marcas);

  async function guardar() {
    setOcupado(true);
    setErrors([]);
    try {
      await registrarRecorridaPasto({ fecha, lecturas, nota });
      setListo(lecturas.length);
      setMarcas({});
      setNota('');
    } catch (error) {
      setErrors(getErrorMessages(error, 'No se pudo guardar el pasto'));
    } finally {
      setOcupado(false);
    }
  }

  if (listo != null) {
    return (
      <section className="mt-2 space-y-3" data-testid="recorrida-lista">
        <Notice tone="ok">
          Pasto anotado en {listo} {listo === 1 ? 'potrero' : 'potreros'}.
        </Notice>
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={() => setListo(null)} className={buttonClass}>
            Anotar otra recorrida
          </button>
          <Link to={inicial ? `/pecuaria/potreros/${inicial}` : '/pecuaria/potreros'} className="rounded-md border border-suelo-300 px-3 py-2 text-center text-sm font-medium text-suelo-800 hover:border-campo-500">
            {inicial ? 'Volver al potrero' : 'Ver los potreros'}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm text-suelo-600">
          Fecha
          <input type="date" required value={fecha} max={hoy()} onChange={(e) => setFecha(e.target.value)} className={`${inputClass} mt-1`} />
        </label>
        {onCambiarEstancia && (
          <button type="button" onClick={onCambiarEstancia} className="self-end text-left text-sm text-campo-600 hover:underline sm:text-right">
            Cambiar de estancia
          </button>
        )}
      </div>
      {/* La escala, una sola vez. */}
      <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-suelo-600" data-testid="escala-pasto">
        {ALTURAS.map((a) => (
          <span key={a.valor}>
            <strong className="text-suelo-800">{a.nombre}</strong>: {a.ayuda}
          </span>
        ))}
      </p>

      <label className="mt-3 flex items-center gap-2 rounded-md border border-suelo-300 bg-superficie px-3 py-2">
        <Icono nombre="buscar" className="h-4 w-4 text-suelo-500" />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          enterKeyHint="search"
          onKeyDown={cerrarTecladoConEnter}
          placeholder="Buscar potrero"
          aria-label="Buscar potrero"
          className="w-full bg-transparent text-sm outline-none placeholder:text-suelo-400"
        />
      </label>

      <ErrorList errors={[...errorsLista, ...errors]} />
      {!potreros && !errorsLista.length && <EsqueletoLista testId="esqueleto-potreros-elegir" />}
      {potreros && lista.length === 0 && <p className="py-4 text-sm text-suelo-600">{busqueda ? 'Ningún potrero coincide.' : 'Esta estancia no tiene potreros.'}</p>}

      <ul className="mt-2 space-y-2" data-testid="lista-recorrida">
        {lista.map((p) => (
          <li
            key={p.id}
            className={`rounded-lg border bg-superficie p-3 ${p.id === inicial ? 'border-campo-500 ring-1 ring-campo-500' : 'border-suelo-200'}`}
            data-testid={`recorrida-${p.id}`}
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold">{p.nombre}</span>
              <UsoBadge uso={p.usoActual} />
              {p.pasto && (
                <span className="flex items-center gap-1 text-xs text-suelo-500">
                  última: <PastoMarca valor={p.pasto.altura} /> {hace(p.pasto.fecha, hoy())}
                </span>
              )}
            </div>
            {/* El descanso en su renglón (si no, a veces arrancaba con un "·" suelto). */}
            {p.descanso && <p className={`mt-0.5 text-xs ${p.descanso.conGanado ? 'text-suelo-500' : 'font-medium text-campo-700'}`}>{textoDescanso(p.descanso)}</p>}
            <div className="mt-2">
              <PastoSelector
                valor={marcas[p.id] ?? ''}
                onCambiar={(a) => setMarcas((m) => ({ ...m, [p.id]: a }))}
                etiqueta={`Pasto en ${p.nombre}`}
                compacto
              />
            </div>
          </li>
        ))}
      </ul>

      {potreros && lista.length > 0 && (
        <>
          <label className="mt-4 block text-sm text-suelo-600">
            Nota (opcional)
            <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={255} placeholder="Por ejemplo: después de la lluvia" className={`${inputClass} mt-1`} />
          </label>
          {/* El botón queda a mano mientras se baja por la lista. */}
          <div className="sticky bottom-0 -mx-4 mt-3 bg-suelo-50/95 px-4 py-3 backdrop-blur">
            <button type="button" disabled={!lecturas.length || ocupado} onClick={guardar} className={buttonClass}>
              {ocupado ? 'Guardando…' : lecturas.length ? `Guardar (${lecturas.length} ${lecturas.length === 1 ? 'potrero' : 'potreros'})` : 'Marcá al menos un potrero'}
            </button>
          </div>
        </>
      )}
    </>
  );
}
