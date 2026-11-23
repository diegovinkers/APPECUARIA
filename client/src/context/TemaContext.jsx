import { createContext, useContext, useEffect, useState } from 'react';
import { aplicarTema, escucharSistema, guardarPreferencia, leerPreferencia, resolverTema, sistemaOscuro } from '../tema';

// El tema de la app (claro / oscuro / auto), uno solo para toda la app.
const TemaContext = createContext(null);

export function TemaProvider({ children }) {
  const [preferencia, setPreferencia] = useState(leerPreferencia);
  const [oscuroSistema, setOscuroSistema] = useState(sistemaOscuro);
  const tema = resolverTema(preferencia, oscuroSistema);

  useEffect(() => escucharSistema(setOscuroSistema), []);
  useEffect(() => aplicarTema(tema), [tema]);

  const elegir = (valor) => {
    guardarPreferencia(valor);
    setPreferencia(valor);
  };

  return <TemaContext.Provider value={{ preferencia, tema, elegir }}>{children}</TemaContext.Provider>;
}

// Sin el provider (algunos tests) no rompe: queda en "auto" y no cambia nada.
export function useTema() {
  return useContext(TemaContext) ?? { preferencia: 'auto', tema: 'claro', elegir: () => {} };
}
