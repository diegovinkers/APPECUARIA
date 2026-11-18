import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getCampos } from '../api/pecuaria';
import { getErrorMessages } from '../api/axios';
import { useAuth } from './AuthContext';

// La estancia (campo) que se está mirando. La elige el selector de la barra de
// arriba y la usan Resumen, Potreros, Movimientos y el botón "+".
// Se recuerda en este celular; si no se puede (modo privado), arranca en la primera.
const CLAVE = 'sapsa.estancia';

function leerGuardada() {
  try {
    return Number(localStorage.getItem(CLAVE)) || null;
  } catch {
    return null;
  }
}

const EstanciaContext = createContext(null);

export function EstanciaProvider({ children }) {
  const { user } = useAuth();
  const habilitado = Boolean(user && !user.debeCambiarPassword);
  const [campos, setCampos] = useState(null);
  const [campoId, setCampoIdState] = useState(leerGuardada);
  const [errors, setErrors] = useState([]);

  useEffect(() => {
    if (!habilitado) {
      setCampos(null);
      return;
    }
    getCampos()
      .then(({ data }) => {
        setCampos(data);
        setCampoIdState((actual) => (data.some((c) => c.id === actual) ? actual : (data[0]?.id ?? null)));
      })
      .catch((error) => setErrors(getErrorMessages(error, 'No se pudieron cargar las estancias')));
  }, [habilitado]);

  function setCampoId(id) {
    setCampoIdState(id);
    try {
      localStorage.setItem(CLAVE, String(id));
    } catch {
      // Sin almacenamiento: se elige de nuevo la próxima vez.
    }
  }

  const value = useMemo(
    () => ({ campos, campoId, campo: campos?.find((c) => c.id === campoId) ?? null, setCampoId, errors }),
    [campos, campoId, errors],
  );
  return <EstanciaContext.Provider value={value}>{children}</EstanciaContext.Provider>;
}

export function useEstancia() {
  const context = useContext(EstanciaContext);
  if (!context) throw new Error('useEstancia debe usarse dentro de <EstanciaProvider>');
  return context;
}
