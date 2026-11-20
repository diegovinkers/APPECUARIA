import { useEffect, useState } from 'react';
import { getPotreros, getPotrerosTodas } from '../api/pecuaria';
import { getErrorMessages } from '../api/axios';

// "8.1" antes que "10.2", y "P 2" antes que "P 10".
export const ordenNatural = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

// Por estancia (en el orden de las estancias) y, dentro de cada una, en el
// orden de la planilla.
export const porEstanciaYPlanilla = (a, b) =>
  (a.campo?.orden ?? 0) - (b.campo?.orden ?? 0) ||
  (a.campo?.sigla ?? '').localeCompare(b.campo?.sigla ?? '') ||
  a.orden - b.orden ||
  ordenNatural.compare(a.nombre, b.nombre);

// Los potreros de una estancia o, con todas = true, los de todas las del
// usuario en el grupo ('estancias': "Todas las estancias"; 'feedlots':
// "Todos los feedlots"). Al cambiar, lo anterior se borra enseguida
// (que no quede la tabla de otra estancia mientras carga).
export default function usePotreros(campoId, todas = false, grupo = 'estancias') {
  const [potreros, setPotreros] = useState(null);
  const [errors, setErrors] = useState([]);

  useEffect(() => {
    setPotreros(null);
    setErrors([]);
    if (!campoId && !todas) return undefined;
    let vigente = true;
    (todas ? getPotrerosTodas(grupo) : getPotreros(campoId))
      .then(({ data }) => {
        if (vigente) setPotreros([...data].sort(porEstanciaYPlanilla));
      })
      .catch((error) => vigente && setErrors(getErrorMessages(error, 'No se pudieron cargar los potreros')));
    return () => {
      vigente = false;
    };
  }, [campoId, todas, grupo]);

  return { potreros, errors };
}
