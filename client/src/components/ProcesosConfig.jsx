import { useCallback, useEffect, useMemo, useState } from 'react';
import { crearToro, editarToro, getConfiguracionProcesos, getPotreros, getToros, guardarConfiguracionProcesos } from '../api/pecuaria';
import { getErrorMessages } from '../api/axios';
import { useEstancia } from '../context/EstanciaContext';
import { separarGrupos } from '../navegacion/grupos';
import { ErrorList, Notice, inputClass } from './ui';

const boton = 'min-h-11 rounded-md bg-boton px-4 py-2 text-sm font-medium text-white hover:bg-boton-hover disabled:opacity-50';
const botonSecundario = 'min-h-11 rounded-md border border-suelo-300 px-3 py-2 text-sm font-medium text-suelo-800 hover:border-campo-500';
const corto = `${inputClass.replace('w-full', '')} w-20`;
const entero = (texto) => (/^\d+$/.test(String(texto).trim()) ? Number(texto) : null);

// Qué está mal en lo que se va a guardar (para avisar antes), o null.
export function problemaConfiguracion(etapas, estados, limites) {
  for (const e of etapas) {
    if (!e.nombre.trim()) return 'Cada etapa necesita un nombre';
    const plazo = entero(e.plazo);
    const { min, max } = limites[e.unidad];
    if (plazo == null || plazo < min || plazo > max) return `${e.nombre}: el plazo va de ${min} a ${max} ${e.unidad === 'MESES' ? 'meses' : 'días'}`;
    const aviso = entero(e.avisoDias);
    if (aviso == null || aviso < limites.aviso.min || aviso > limites.aviso.max) return `${e.nombre}: el aviso va de ${limites.aviso.min} a ${limites.aviso.max} días antes`;
  }
  const nombres = estados.map((e) => e.nombre.trim().toLowerCase());
  if (nombres.some((n) => !n)) return 'Cada estado necesita un nombre';
  if (new Set(nombres).size !== nombres.length) return 'Dos estados no pueden tener el mismo nombre';
  return null;
}

// Configuración → Procesos (docs/PECUARIA.md §9): cuándo se espera cada etapa,
// cuántos días antes se avisa y cómo se llaman los estados de las vacas. Todo
// se guarda junto.
export function ConfigProcesos() {
  const [datos, setDatos] = useState(null);
  const [etapas, setEtapas] = useState([]);
  const [estados, setEstados] = useState([]);
  const [errors, setErrors] = useState([]);
  const [aviso, setAviso] = useState(null);

  const poner = (data) => {
    setDatos(data);
    setEtapas(data.etapas.map((e) => ({ ...e, plazo: String(e.plazo), avisoDias: String(e.avisoDias) })));
    setEstados(data.estados.map((e) => ({ ...e })));
  };

  useEffect(() => {
    getConfiguracionProcesos()
      .then(({ data }) => poner(data))
      .catch((error) => setErrors(getErrorMessages(error, 'No se pudo cargar la configuración de los procesos')));
  }, []);

  if (!datos) return <ErrorList errors={errors} />;
  const problema = problemaConfiguracion(etapas, estados, datos.limites);
  const cambiarEtapa = (clave, campo, valor) => setEtapas((lista) => lista.map((e) => (e.clave === clave ? { ...e, [campo]: valor } : e)));

  async function guardar(ev) {
    ev.preventDefault();
    try {
      const { data } = await guardarConfiguracionProcesos({
        etapas: etapas.map((e) => ({ clave: e.clave, nombre: e.nombre.trim(), plazo: entero(e.plazo), avisoDias: entero(e.avisoDias) })),
        estados: estados.map((e) => ({ rol: e.rol, nombre: e.nombre.trim() })),
      });
      poner(data);
      setErrors([]);
      setAviso('Listo: se guardaron los plazos y los estados.');
    } catch (error) {
      setAviso(null);
      setErrors(getErrorMessages(error, 'No se pudo guardar'));
    }
  }

  return (
    <form onSubmit={guardar}>
      <ErrorList errors={errors} />
      <Notice tone="ok">{aviso}</Notice>
      <h3 className="mb-2 font-semibold">Plazos y avisos</h3>
      <ul className="space-y-3">
        {etapas.map((e) => (
          <li key={e.clave} className="rounded-md border border-suelo-200 bg-superficie p-3" data-testid={`etapa-${e.clave}`}>
            <input value={e.nombre} onChange={(x) => cambiarEtapa(e.clave, 'nombre', x.target.value)} aria-label={`Nombre de la etapa ${e.clave}`} className={`${inputClass} font-medium`} />
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <input inputMode="numeric" value={e.plazo} onChange={(x) => cambiarEtapa(e.clave, 'plazo', x.target.value)} aria-label={`Plazo de ${e.nombre}`} className={corto} />
              <span>
                {e.unidad === 'MESES' ? 'meses' : 'días'} {e.textoDesde}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span>Avisar</span>
              <input inputMode="numeric" value={e.avisoDias} onChange={(x) => cambiarEtapa(e.clave, 'avisoDias', x.target.value)} aria-label={`Aviso de ${e.nombre}`} className={corto} />
              <span>días antes</span>
            </div>
          </li>
        ))}
      </ul>
      <h3 className="mb-1 mt-5 font-semibold">Nombres de los estados</h3>
      <p className="mb-2 text-sm text-suelo-600">La categoría de la vaca no cambia: lo que cambia es su estado en el proceso.</p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {estados.map((e) => (
          <li key={e.rol}>
            <input
              value={e.nombre}
              onChange={(x) => setEstados((lista) => lista.map((s) => (s.rol === e.rol ? { ...s, nombre: x.target.value } : s)))}
              aria-label={`Estado ${e.rol}`}
              className={inputClass}
            />
          </li>
        ))}
      </ul>
      {problema && <p className="mt-3 text-sm text-amber-800">{problema}</p>}
      <button type="submit" className={`${boton} mt-4 w-full sm:w-auto`} disabled={Boolean(problema)}>
        Guardar plazos y estados
      </button>
    </form>
  );
}

// Los lotes de toros de la estancia, para elegir dónde está cada toro.
export function lotesDeToros(potreros = []) {
  return potreros
    .flatMap((p) => (p.stock?.lotes ?? []).filter((l) => /toro/i.test(l.categoria)).map((l) => ({ id: l.loteId, texto: `${l.lote} · ${p.nombre} (${l.cabezas} cab)` })))
    .sort((a, b) => a.texto.localeCompare(b.texto));
}

const VACIO = { identificacion: '', raza: '', genetica: '', loteId: '', nota: '' };

function FormToro({ inicial = VACIO, lotes, onGuardar, onCancelar, texto }) {
  const [f, setF] = useState(inicial);
  const campo = (k) => ({ value: f[k], onChange: (e) => setF((x) => ({ ...x, [k]: e.target.value })) });
  return (
    <form
      className="space-y-2 rounded-md border border-campo-300 bg-campo-50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onGuardar({ identificacion: f.identificacion.trim(), raza: f.raza, genetica: f.genetica, nota: f.nota, loteId: f.loteId ? Number(f.loteId) : null });
      }}
    >
      <input {...campo('identificacion')} placeholder="Caravana o nombre (ej. T-014)" aria-label="Identificación del toro" className={inputClass} />
      <div className="grid gap-2 sm:grid-cols-2">
        <input {...campo('raza')} placeholder="Raza" aria-label="Raza" className={inputClass} />
        <input {...campo('genetica')} placeholder="Genética (padre, cabaña...)" aria-label="Genética" className={inputClass} />
      </div>
      <select {...campo('loteId')} aria-label="Lote de toros" className={inputClass}>
        <option value="">Sin lote (todavía)</option>
        {lotes.map((l) => (
          <option key={l.id} value={l.id}>
            {l.texto}
          </option>
        ))}
      </select>
      <input {...campo('nota')} placeholder="Nota (opcional)" aria-label="Nota del toro" className={inputClass} />
      <div className="flex gap-2">
        <button type="submit" className={boton} disabled={!f.identificacion.trim()}>
          {texto}
        </button>
        {onCancelar && (
          <button type="button" onClick={onCancelar} className={botonSecundario}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

// Configuración → Toros: cada toro de la estancia, por su identificación y su
// genética, y en qué lote de toros está (cuenta como una cabeza de ese lote).
export function ConfigToros() {
  const { campos, campoId: elegido } = useEstancia();
  const estancias = useMemo(() => separarGrupos(campos ?? []).estancias, [campos]);
  const [campoId, setCampoId] = useState(null);
  const actual = campoId ?? (estancias.some((c) => c.id === elegido) ? elegido : estancias[0]?.id ?? null);
  const [toros, setToros] = useState(null);
  const [lotes, setLotes] = useState([]);
  const [editando, setEditando] = useState(null);
  const [alta, setAlta] = useState(false);
  const [errors, setErrors] = useState([]);
  const [aviso, setAviso] = useState(null);

  const cargar = useCallback(async () => {
    if (!actual) return;
    const [t, p] = await Promise.all([getToros(actual, { todos: true }), getPotreros(actual)]);
    setToros(t.data);
    setLotes(lotesDeToros(p.data));
  }, [actual]);

  useEffect(() => {
    setToros(null);
    cargar().catch((error) => setErrors(getErrorMessages(error, 'No se pudieron cargar los toros')));
  }, [cargar]);

  async function hacer(accion, mensaje) {
    try {
      await accion();
      setErrors([]);
      setAviso(mensaje);
      setEditando(null);
      setAlta(false);
      await cargar();
    } catch (error) {
      setAviso(null);
      setErrors(getErrorMessages(error, 'No se pudo guardar'));
    }
  }

  if (!estancias.length) return <p className="text-sm text-suelo-600">Todavía no hay estancias.</p>;
  return (
    <div>
      {estancias.length > 1 && (
        <select value={actual ?? ''} onChange={(e) => setCampoId(Number(e.target.value))} aria-label="Estancia de los toros" className={`${inputClass} mb-3`}>
          {estancias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      )}
      <ErrorList errors={errors} />
      <Notice tone="ok">{aviso}</Notice>
      {!toros && <p className="text-sm text-suelo-600">Cargando…</p>}
      {toros?.length === 0 && <p className="mb-3 text-sm text-suelo-600">Todavía no hay toros cargados en esta estancia.</p>}
      <ul className="space-y-2">
        {toros?.map((t) =>
          editando === t.id ? (
            <li key={t.id}>
              <FormToro
                inicial={{ identificacion: t.identificacion, raza: t.raza ?? '', genetica: t.genetica ?? '', nota: t.nota ?? '', loteId: t.lote?.id ? String(t.lote.id) : '' }}
                lotes={lotes}
                texto="Guardar"
                onCancelar={() => setEditando(null)}
                onGuardar={(datos) => hacer(() => editarToro(t.id, datos), `Listo: se guardó el toro ${datos.identificacion}.`)}
              />
            </li>
          ) : (
            <li key={t.id} className={`rounded-md border border-suelo-200 bg-superficie p-3 ${t.activo ? '' : 'opacity-60'}`} data-testid="toro">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {t.identificacion}
                    {!t.activo && <span className="ml-2 text-xs font-normal text-suelo-600">dado de baja</span>}
                  </p>
                  <p className="text-sm text-suelo-600">{[t.raza, t.genetica].filter(Boolean).join(' · ') || 'Sin raza ni genética'}</p>
                  <p className="text-sm text-suelo-600">{t.lote ? `En ${t.lote.nombre} (${t.lote.potrero.nombre})` : 'Sin lote'}</p>
                  {t.enProceso && <p className="text-sm text-campo-700">En el proceso {t.enProceso.proceso.nombre}</p>}
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <button type="button" onClick={() => setEditando(t.id)} className={botonSecundario}>
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => hacer(() => editarToro(t.id, { activo: !t.activo }), t.activo ? `Listo: ${t.identificacion} quedó dado de baja.` : `Listo: ${t.identificacion} volvió.`)}
                    className={botonSecundario}
                  >
                    {t.activo ? 'Dar de baja' : 'Reactivar'}
                  </button>
                </div>
              </div>
            </li>
          ),
        )}
      </ul>
      <div className="mt-3">
        {alta ? (
          <FormToro lotes={lotes} texto="Agregar" onCancelar={() => setAlta(false)} onGuardar={(datos) => hacer(() => crearToro(actual, datos), `Listo: se agregó el toro ${datos.identificacion}.`)} />
        ) : (
          <button type="button" onClick={() => setAlta(true)} className={boton}>
            + Agregar toro
          </button>
        )}
      </div>
    </div>
  );
}
