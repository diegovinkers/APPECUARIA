import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useEstancia } from '../../context/EstanciaContext';
import usePotreros from '../../hooks/usePotreros';
import { ErrorList, Notice } from '../../components/ui';
import { Dato, formatFecha, formatNumero } from '../../components/pecuaria';
import ResumenCampo from '../../components/ResumenCampo';
import { Encabezado, SinEstancia } from './comun';

// Lo primero que se ve al entrar: los totales de la estancia y el resumen por
// categoría (CN / Verdeos / Corral / Otro).
export default function ResumenPage() {
  const location = useLocation();
  const { campoId } = useEstancia();
  const { potreros, errors } = usePotreros(campoId);

  const totales = useMemo(() => {
    const lista = potreros ?? [];
    return {
      cabezas: lista.reduce((s, p) => s + (p.stock?.cabezas ?? 0), 0),
      hectareas: lista.reduce((s, p) => s + (p.hectareasAConfirmar ? 0 : (p.hectareas ?? 0)), 0),
      aConfirmar: lista.filter((p) => p.hectareasAConfirmar).length,
      fecha: lista.map((p) => p.stock?.fecha).filter(Boolean).sort().at(-1),
    };
  }, [potreros]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-5 sm:py-8">
      <Encabezado titulo="Resumen">
        {totales.fecha && <span className="text-sm text-suelo-500">dato al {formatFecha(totales.fecha)}</span>}
      </Encabezado>
      <Notice tone="ok">{location.state?.aviso}</Notice>
      <ErrorList errors={errors} />
      {!campoId && <SinEstancia />}
      {campoId && (
        <>
          <div className="mb-6 grid grid-cols-3 gap-2 sm:gap-3">
            <Dato valor={potreros ? formatNumero(totales.cabezas) : '…'} etiqueta="cabezas" />
            <Dato valor={potreros ? potreros.length : '…'} etiqueta="potreros" />
            <Dato
              valor={potreros ? formatNumero(totales.hectareas) : '…'}
              etiqueta={totales.aConfirmar ? `ha (${totales.aConfirmar} a confirmar)` : 'ha'}
            />
          </div>
          <ResumenCampo campoId={campoId} />
        </>
      )}
    </main>
  );
}
