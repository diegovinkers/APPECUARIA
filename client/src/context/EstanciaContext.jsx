import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getCampos } from '../api/pecuaria';
import { getErrorMessages } from '../api/axios';
import { useAuth } from './AuthContext';
import { puede } from '../navegacion/menu';

// La estancia (campo) que se está mirando. La elige el selector de la barra de
// arriba y la usan Resumen, Potreros, Movimientos y el botón "+".
// Quien tiene más de una puede elegir "Todas": el Resumen las suma, y Potreros,
// Movimientos y el "+" piden elegir una (todas = true, campoId = null).
// Se recuerda en este celular; si no se puede (modo privado), arranca en la primera.
const CLAVE = 'sapsa.estancia';
export const TODAS = 'todas';

function leerGuardada() {
  try {
    const v = localStorage.getItem(CLAVE);
    return v === TODAS ? TODAS : Number(v) || null;
  } catch {
    return null;
  }
}

const EstanciaContext = createContext(null);

export function EstanciaProvider({ children }) {
  const { user } = useAuth();
  // Solo quien ve Pecuaria (un administrador de usuarios, por ejemplo, no).
  const habilitado = puede(user, 'pecuaria:VER');
  const [campos, setCampos] = useState(null);
  const [seleccion, setSeleccion] = useState(leerGuardada);
  const [errors, setErrors] = useState([]);

  useEffect(() => {
    if (!habilitado) {
      setCampos(null);
      return;
    }
    getCampos()
      .then(({ data }) => {
        setCampos(data);
        setSeleccion((actual) => {
          if (actual === TODAS && data.length > 1) return TODAS;
          return data.some((c) => c.id === actual) ? actual : (data[0]?.id ?? null);
        });
      })
      .catch((error) => setErrors(getErrorMessages(error, 'No se pudieron cargar las estancias')));
  }, [habilitado]);

  // id de una estancia, o TODAS.
  function setCampoId(valor) {
    setSeleccion(valor);
    try {
      localStorage.setItem(CLAVE, String(valor));
    } catch {
      // Sin almacenamiento: se elige de nuevo la próxima vez.
    }
  }

  const value = useMemo(() => {
    const todas = seleccion === TODAS;
    const campoId = todas ? null : seleccion;
    return { campos, campoId, todas, campo: campos?.find((c) => c.id === campoId) ?? null, setCampoId, errors };
  }, [campos, seleccion, errors]);
  return <EstanciaContext.Provider value={value}>{children}</EstanciaContext.Provider>;
}

export function useEstancia() {
  const context = useContext(EstanciaContext);
  if (!context) throw new Error('useEstancia debe usarse dentro de <EstanciaProvider>');
  return context;
}
