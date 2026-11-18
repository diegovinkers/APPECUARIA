import { useSyncExternalStore } from 'react';

// true si el navegador cree que hay conexión. Se actualiza solo cuando se
// corta o vuelve la señal (eventos online/offline).
function suscribir(avisar) {
  window.addEventListener('online', avisar);
  window.addEventListener('offline', avisar);
  return () => {
    window.removeEventListener('online', avisar);
    window.removeEventListener('offline', avisar);
  };
}

const leer = () => navigator.onLine;

export function useEnLinea() {
  return useSyncExternalStore(suscribir, leer, () => true);
}
