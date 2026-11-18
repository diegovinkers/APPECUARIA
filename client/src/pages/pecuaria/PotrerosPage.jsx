import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { crearPotrero } from '../../api/pecuaria';
import { getErrorMessages } from '../../api/axios';
import { useEstancia } from '../../context/EstanciaContext';
import usePotreros from '../../hooks/usePotreros';
import { ErrorList, inputClass } from '../../components/ui';
import PotrerosLista from '../../components/PotrerosLista';
import { Encabezado, SinEstancia } from './comun';

// Los potreros de la estancia con su uso, cabezas, lotes y carga, con filtros.
// Tocar un potrero abre su ficha.
export default function PotrerosPage() {
  const navigate = useNavigate();
  const { campoId } = useEstancia();
  const { potreros, errors: erroresCarga } = usePotreros(campoId);
  const [nuevoCorral, setNuevoCorral] = useState(null);
  const [errors, setErrors] = useState([]);

  async function agregarCorral(e) {
    e.preventDefault();
    try {
      const { data } = await crearPotrero(campoId, { nombre: nuevoCorral.trim(), tipo: 'CORRAL' });
      navigate(`/pecuaria/potreros/${data.id}`);
    } catch (error) {
      setErrors(getErrorMessages(error, 'No se pudo agregar el corral'));
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-5 sm:py-8">
      <Encabezado titulo="Potreros" />
      <ErrorList errors={[...erroresCarga, ...errors]} />
      {!campoId && <SinEstancia />}
      {campoId && !potreros && !erroresCarga.length && <p className="text-suelo-600">Cargando…</p>}
      {potreros && (
        <>
          <PotrerosLista potreros={potreros} />
          <div className="mt-6">
            {nuevoCorral == null ? (
              <button type="button" onClick={() => setNuevoCorral('Feedlot')} className="text-sm text-campo-600 hover:underline">
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
                <button
                  type="submit"
                  disabled={!nuevoCorral.trim()}
                  className="rounded-md bg-campo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Agregar
                </button>
                <button type="button" onClick={() => setNuevoCorral(null)} className="px-3 py-2 text-sm text-suelo-600">
                  Cancelar
                </button>
              </form>
            )}
          </div>
        </>
      )}
    </main>
  );
}
