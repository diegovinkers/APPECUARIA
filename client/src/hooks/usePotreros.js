import { useEffect, useState } from 'react';
import { getPotreros } from '../api/pecuaria';
import { getErrorMessages } from '../api/axios';

// "8.1" antes que "10.2", y "P 2" antes que "P 10".
export const ordenNatural = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

// Los potreros de una estancia, en el orden de la planilla.
export default function usePotreros(campoId) {
  const [potreros, setPotreros] = useState(null);
  const [errors, setErrors] = useState([]);

  useEffect(() => {
    if (!campoId) return undefined;
    let vigente = true;
    setPotreros(null);
    getPotreros(campoId)
      .then(({ data }) => {
        if (vigente) setPotreros([...data].sort((a, b) => a.orden - b.orden || ordenNatural.compare(a.nombre, b.nombre)));
      })
      .catch((error) => vigente && setErrors(getErrorMessages(error, 'No se pudieron cargar los potreros')));
    return () => {
      vigente = false;
    };
  }, [campoId]);

  return { potreros, errors };
}
