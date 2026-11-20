import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getCampos } from '../api/pecuaria';
import { getErrorMessages } from '../api/axios';
import { useAuth } from './AuthContext';
import { puede } from '../navegacion/menu';
import { FEEDLOTS, TODAS, grupoDeCampo, seleccionValida, separarGrupos } from '../navegacion/grupos';

// La estancia (campo) que se está mirando. La elige el selector de la barra de
// arriba y la usan Resumen, Potreros, Movimientos y el botón "+".
// Hay dos grupos (feedlots, 19/11): las estancias (y granjas) y los feedlots
// (confinamientos), que se analizan distinto y no se suman entre sí.
// Quien tiene más de un campo en un grupo puede elegir "Todas las estancias"
// o "Todos los feedlots": el Resumen los suma, Potreros y Movimientos los
// listan juntos, y el "+" pide elegir uno (todas = true, campoId = null).
// Se recuerda en este celular; si no se puede (modo privado), arranca en el primero.
const CLAVE = 'sapsa.estancia';
export { TODAS, FEEDLOTS, grupoDeCampo, separarGrupos } from '../navegacion/grupos';

function leerGuardada() {
  try {
    const v = localStorage.getItem(CLAVE);
    return v === TODAS || v === FEEDLOTS ? v : Number(v) || null;
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
        setSeleccion((actual) => seleccionValida(actual, data));
      })
      .catch((error) => setErrors(getErrorMessages(error, 'No se pudieron cargar las estancias')));
  }, [habilitado]);

  // id de un campo, TODAS o FEEDLOTS.
  function setCampoId(valor) {
    setSeleccion(valor);
    try {
      localStorage.setItem(CLAVE, String(valor));
    } catch {
      // Sin almacenamiento: se elige de nuevo la próxima vez.
    }
  }

  const value = useMemo(() => {
    const todas = seleccion === TODAS || seleccion === FEEDLOTS;
    const campoId = todas ? null : seleccion;
    const campo = campos?.find((c) => c.id === campoId) ?? null;
    const grupo = seleccion === FEEDLOTS ? 'feedlots' : seleccion === TODAS ? 'estancias' : grupoDeCampo(campo);
    // Los campos del grupo elegido (lo que ofrece el "+" con "Todos").
    const camposDelGrupo = separarGrupos(campos ?? [])[grupo];
    return { campos, campoId, todas, campo, grupo, esFeedlot: grupo === 'feedlots', camposDelGrupo, setCampoId, errors };
  }, [campos, seleccion, errors]);
  return <EstanciaContext.Provider value={value}>{children}</EstanciaContext.Provider>;
}

export function useEstancia() {
  const context = useContext(EstanciaContext);
  if (!context) throw new Error('useEstancia debe usarse dentro de <EstanciaProvider>');
  return context;
}
