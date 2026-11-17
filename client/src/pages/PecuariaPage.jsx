import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { crearPotrero, getCampos, getPotreros } from '../api/pecuaria';
import { getErrorMessages } from '../api/axios';
import { ErrorList, Notice, inputClass } from '../components/ui';
import { Dato, formatFecha, formatNumero } from '../components/pecuaria';
import ResumenCampo from '../components/ResumenCampo';
import PotrerosLista from '../components/PotrerosLista';
import MovimientosLista from '../components/MovimientosLista';

// Potreros del campo con su uso de suelo vigente, las cabezas de su último
// dato y la carga (Cab./ha, UG/ha). Tocar un potrero abre su detalle.
// "8.1" antes que "10.2", y "P 2" antes que "P 10".
const ordenNatural = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

export default function PecuariaPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [nuevoCorral, setNuevoCorral] = useState(null);
  // La pestaña va en la dirección (?vista=potreros), junto con los filtros.
  const [params, setParams] = useSearchParams();
  const vista = params.get('vista') ?? 'resumen';
  const setVista = (v) => setParams(v === 'resumen' ? {} : { vista: v }, { replace: true });
  const [campos, setCampos] = useState(null);
  const [campoId, setCampoId] = useState(null);
  const [potreros, setPotreros] = useState([]);
  const [errors, setErrors] = useState([]);

  useEffect(() => {
    getCampos()
      .then(({ data }) => {
        setCampos(data);
        if (data.length) setCampoId(data[0].id);
      })
      .catch((error) => setErrors(getErrorMessages(error, 'No se pudieron cargar los campos')));
  }, []);

  useEffect(() => {
    if (!campoId) return;
    getPotreros(campoId)
      .then(({ data }) => setPotreros([...data].sort((a, b) => a.orden - b.orden || ordenNatural.compare(a.nombre, b.nombre))))
      .catch((error) => setErrors(getErrorMessages(error, 'No se pudieron cargar los potreros')));
  }, [campoId]);

  async function agregarCorral(e) {
    e.preventDefault();
    try {
      const { data } = await crearPotrero(campoId, { nombre: nuevoCorral.trim(), tipo: 'CORRAL' });
      navigate(`/pecuaria/potreros/${data.id}`);
    } catch (error) {
      setErrors(getErrorMessages(error, 'No se pudo agregar el corral'));
    }
  }

  const totales = useMemo(
    () => ({
      cabezas: potreros.reduce((s, p) => s + (p.stock?.cabezas ?? 0), 0),
      hectareas: potreros.reduce((s, p) => s + (p.hectareasAConfirmar ? 0 : p.hectareas ?? 0), 0),
      aConfirmar: potreros.filter((p) => p.hectareasAConfirmar).length,
      fecha: potreros.map((p) => p.stock?.fecha).filter(Boolean).sort().at(-1),
    }),
    [potreros],
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Pecuaria</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/pecuaria/configuracion" className="rounded-md px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800">
            Configuración
          </Link>
          <Link to="/pecuaria/importar" className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500">
            Importar planilla
          </Link>
        </div>
      </div>
      <Notice tone="ok">{location.state?.aviso}</Notice>
      <ErrorList errors={errors} />

      {campos && campos.length === 0 && (
        <div className="rounded-lg border border-dashed border-zinc-700 p-8 text-center text-zinc-400">
          Todavía no hay datos. Empezá importando la planilla de cargas del encargado.
        </div>
      )}

      {campos?.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {campos.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCampoId(c.id)}
              className={`rounded-md px-3 py-1.5 text-sm ${c.id === campoId ? 'bg-sky-600 text-white' : 'bg-zinc-800 text-zinc-300'}`}
            >
              {c.sigla} · {c.nombre}
            </button>
          ))}
        </div>
      )}

      {campoId && (
        <>
          <h2 className="mb-3 text-lg font-semibold text-zinc-300">
            {campos.find((c) => c.id === campoId)?.nombre}
            {totales.fecha && <span className="ml-2 text-sm font-normal text-zinc-500">dato al {formatFecha(totales.fecha)}</span>}
          </h2>
          <div className="mb-6 grid grid-cols-3 gap-3">
            <Dato valor={formatNumero(totales.cabezas)} etiqueta="cabezas" />
            <Dato valor={potreros.length} etiqueta="potreros" />
            <Dato valor={formatNumero(totales.hectareas)} etiqueta={`ha (${totales.aConfirmar} a confirmar)`} />
          </div>

          <div role="tablist" className="mb-4 grid grid-cols-3 rounded-lg bg-zinc-800 p-1 text-sm font-medium">
            {[
              ['resumen', 'Resumen'],
              ['potreros', 'Potreros'],
              ['movimientos', 'Movimientos'],
            ].map(([clave, texto]) => (
              <button
                key={clave}
                type="button"
                role="tab"
                aria-selected={vista === clave}
                onClick={() => setVista(clave)}
                className={`rounded-md py-2 ${vista === clave ? 'bg-sky-600 text-white' : 'text-zinc-300'}`}
              >
                {texto}
              </button>
            ))}
          </div>

          {vista === 'resumen' && <ResumenCampo campoId={campoId} />}

          {vista === 'movimientos' && <MovimientosLista campoId={campoId} potreros={potreros} />}

          {vista === 'potreros' && (
          <>
          <PotrerosLista potreros={potreros} />

          <div className="mt-6">
            {nuevoCorral == null ? (
              <button type="button" onClick={() => setNuevoCorral('Feedlot')} className="text-sm text-sky-400 hover:underline">
                + Agregar corral (feedlot)
              </button>
            ) : (
              <form onSubmit={agregarCorral} className="flex flex-wrap gap-2">
                <input
                  value={nuevoCorral}
                  onChange={(e) => setNuevoCorral(e.target.value)}
                  aria-label="Nombre del corral"
                  className={`${inputClass} max-w-xs`}
                />
                <button type="submit" disabled={!nuevoCorral.trim()} className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                  Agregar
                </button>
                <button type="button" onClick={() => setNuevoCorral(null)} className="px-3 py-2 text-sm text-zinc-400">
                  Cancelar
                </button>
              </form>
            )}
          </div>
          </>
          )}
        </>
      )}
    </main>
  );
}
