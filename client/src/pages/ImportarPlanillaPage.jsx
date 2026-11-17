import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { confirmarImportacion, descartarImportacion, subirPlanilla } from '../api/pecuaria';
import { getErrorMessages } from '../api/axios';
import { ErrorList, buttonClass, inputClass } from '../components/ui';
import { Dato, Hectareas, UsoBadge, formatFecha, formatNumero } from '../components/pecuaria';

const hoy = () => new Date().toLocaleDateString('sv-SE');

// Importar la planilla de cargas en dos pasos: subirla y ver la vista previa
// (no guarda nada), y después confirmarla o descartarla.
export default function ImportarPlanillaPage() {
  const navigate = useNavigate();
  const [archivo, setArchivo] = useState(null);
  const [previa, setPrevia] = useState(null);
  const [fecha, setFecha] = useState('');
  const [nombreCampo, setNombreCampo] = useState('');
  const [errors, setErrors] = useState([]);
  const [ocupado, setOcupado] = useState(false);

  async function ejecutar(accion, fallback) {
    setOcupado(true);
    setErrors([]);
    try {
      await accion();
    } catch (error) {
      setErrors(getErrorMessages(error, fallback));
    } finally {
      setOcupado(false);
    }
  }

  const leer = (hoja) =>
    ejecutar(async () => {
      // Si había una vista previa sin confirmar, se descarta antes de leer otra hoja.
      if (previa?.estado === 'PENDIENTE') await descartarImportacion(previa.id).catch(() => {});
      const { data } = await subirPlanilla(archivo, { hoja });
      setPrevia(data);
      setFecha(data.fechaDatos ?? hoy());
    }, 'No se pudo leer la planilla');

  const confirmar = () =>
    ejecutar(async () => {
      const { data } = await confirmarImportacion(previa.id, {
        fecha,
        ...(!previa.campo.existe && { nombreCampo }),
      });
      navigate('/pecuaria', {
        state: {
          aviso: `Planilla importada: ${formatNumero(data.cabezas)} cabezas en ${data.versiones} potreros (${data.potrerosNuevos} nuevos), al ${formatFecha(data.fecha)}.`,
        },
      });
    }, 'No se pudo confirmar la importación');

  const descartar = () =>
    ejecutar(async () => {
      await descartarImportacion(previa.id);
      setPrevia(null);
      setArchivo(null);
    }, 'No se pudo descartar');

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
      <Link to="/pecuaria" className="text-sm text-sky-400 hover:underline">
        ← Pecuaria
      </Link>
      <h1 className="mb-6 mt-2 text-3xl font-bold">Importar planilla de cargas</h1>
      <ErrorList errors={errors} />

      {!previa && (
        <section className="rounded-lg border border-zinc-800 bg-zinc-800/50 p-5">
          <p className="mb-4 text-sm text-zinc-400">
            Elegí la planilla (.xlsx). Se lee la hoja con la fecha más reciente y te muestro qué se va a cargar antes de guardar nada.
          </p>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            className="mb-4 block w-full text-sm text-zinc-300 file:mr-4 file:rounded-md file:border-0 file:bg-zinc-700 file:px-4 file:py-2 file:text-white"
          />
          <button type="button" disabled={!archivo || ocupado} onClick={() => leer()} className={buttonClass}>
            {ocupado ? 'Leyendo…' : 'Ver vista previa'}
          </button>
        </section>
      )}

      {previa && <VistaPrevia previa={previa} ocupado={ocupado} onHoja={leer} />}

      {previa && (
        <section className="sticky bottom-0 mt-6 space-y-3 border-t border-zinc-800 bg-zinc-900 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-zinc-400">
              Fecha del dato
              <input type="date" value={fecha} max={hoy()} onChange={(e) => setFecha(e.target.value)} className={`${inputClass} mt-1`} />
            </label>
            {!previa.campo.existe && (
              <label className="text-sm text-zinc-400">
                Nombre del campo {previa.campo.sigla} (es nuevo)
                <input
                  value={nombreCampo}
                  onChange={(e) => setNombreCampo(e.target.value)}
                  placeholder={`Por ejemplo: Estancia ${previa.campo.sigla}`}
                  className={`${inputClass} mt-1`}
                />
              </label>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={ocupado}
              onClick={descartar}
              className="rounded-md border border-zinc-700 px-4 py-2 font-medium text-zinc-300 hover:border-red-400 hover:text-red-300 disabled:opacity-50"
            >
              Descartar
            </button>
            <button type="button" disabled={ocupado || !previa.puedeConfirmar || !fecha} onClick={confirmar} className={buttonClass}>
              Confirmar e importar
            </button>
          </div>
          {!previa.puedeConfirmar && <p className="text-sm text-red-300">Hay errores: corregilos y volvé a subir la planilla.</p>}
        </section>
      )}
    </main>
  );
}

function VistaPrevia({ previa, ocupado, onHoja }) {
  const { resumen } = previa;
  const otros = Object.entries(previa.otrosCampos ?? {});
  return (
    <>
      <section className="mb-6 rounded-lg border border-zinc-800 p-4">
        <p className="text-sm text-zinc-400">
          {previa.archivo} · campo <strong className="text-zinc-200">{previa.campo.sigla}</strong>
          {previa.campo.existe ? ` (${previa.campo.nombre})` : ' (nuevo)'}
        </p>
        <label className="mt-2 flex items-center gap-2 text-sm text-zinc-400">
          Hoja
          <select
            value={previa.hoja}
            disabled={ocupado}
            onChange={(e) => onHoja(e.target.value)}
            className="rounded-md bg-zinc-700 px-3 py-1.5 text-white"
          >
            {previa.hojas.map((h) => (
              <option key={h}>{h}</option>
            ))}
          </select>
        </label>
        {otros.length > 0 && (
          <p className="mt-2 text-xs text-zinc-500">
            No se importan (solo {previa.campo.sigla} en esta versión): {otros.map(([c, n]) => `${c} (${n} filas)`).join(', ')}.
          </p>
        )}
      </section>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <Dato valor={formatNumero(resumen.cabezas)} etiqueta="cabezas" />
        <Dato valor={resumen.potreros} etiqueta="potreros" />
        <Dato valor={resumen.potrerosNuevos} etiqueta="potreros nuevos" />
      </div>

      {resumen.porCategoria.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {resumen.porCategoria.map((c) => (
            <span key={c.categoria} className="rounded-full bg-zinc-800 px-3 py-1 text-sm">
              {c.categoria} <strong>{formatNumero(c.cabezas)}</strong>
            </span>
          ))}
        </div>
      )}

      <ErrorList errors={previa.errores} />

      {previa.advertencias.length > 0 && (
        <details className="mb-6 rounded-lg bg-amber-500/10 p-4 text-sm text-amber-200" open>
          <summary className="cursor-pointer font-medium">
            {previa.advertencias.length} {previa.advertencias.length === 1 ? 'aviso' : 'avisos'} (se puede importar igual)
          </summary>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            {previa.advertencias.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </details>
      )}

      <ul className="divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800">
        {previa.potreros.map((p) => (
          <li key={p.nombre} className="bg-zinc-900 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {p.nombre}
                  {!p.existe && <span className="ml-2 text-xs text-sky-400">nuevo</span>}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <UsoBadge uso={p.uso} />
                  <Hectareas hectareas={p.hectareas} aConfirmar={p.hectareasAConfirmar} />
                  {p.subdivisiones.length > 0 && <span className="text-xs text-zinc-500">{p.subdivisiones.join(' · ')}</span>}
                </div>
              </div>
              <p className="shrink-0 text-xl font-semibold">{formatNumero(p.cabezas)}</p>
            </div>
            {p.lineas.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-sm text-zinc-400">
                {p.lineas.map((l) => (
                  <li key={l.categoriaTexto}>
                    {l.categoria ?? <span className="text-red-300">{l.categoriaTexto} (no reconocida)</span>} · {formatNumero(l.cabezas)} cab ·{' '}
                    {l.pesoPromedioKg ? `${formatNumero(l.pesoPromedioKg)} kg` : <span className="text-amber-300">sin peso</span>}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
