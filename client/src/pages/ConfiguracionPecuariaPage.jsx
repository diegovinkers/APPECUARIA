import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  crearCategoria,
  crearUso,
  editarCategoria,
  editarUso,
  getCategorias,
  getCausas,
  getParametros,
  getTiposMovimiento,
  getUsosSuelo,
  setParametro,
} from '../api/pecuaria';
import { getErrorMessages } from '../api/axios';
import { ErrorList, Notice, inputClass } from '../components/ui';
import { Causas, TiposMovimiento } from '../components/LibroRodeoConfig';

const GRUPOS = [
  ['CN', 'CN (campo natural)'],
  ['VERDEO', 'Verdeos'],
  ['CORRAL', 'Corral'],
  ['OTRO', 'Otro (solo suma al total)'],
];
const SEXOS = [
  ['', 'Sin sexo'],
  ['MACHO', 'Machos'],
  ['HEMBRA', 'Hembras'],
];
const boton = 'rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50';
const selectClass = 'rounded-md bg-zinc-700 px-2 py-1.5 text-sm text-white';
// "Ternero, Terneros" → ["Ternero", "Terneros"]
const separarAlias = (texto) =>
  texto
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);

// Configuración de Pecuaria: kg por UG, usos de suelo (y su columna en el
// resumen), categorías (con su sexo), tipos de movimiento y causas. Cada
// cambio queda en la auditoría.
export default function ConfiguracionPecuariaPage() {
  const [kgPorUg, setKgPorUg] = useState('');
  const [usos, setUsos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [causas, setCausas] = useState([]);
  const [errors, setErrors] = useState([]);
  const [aviso, setAviso] = useState(null);

  const cargar = useCallback(async () => {
    const [p, u, c, t, ca] = await Promise.all([getParametros(), getUsosSuelo(), getCategorias(), getTiposMovimiento(), getCausas()]);
    setKgPorUg(String(p.data.find((x) => x.clave === 'KG_POR_UG')?.valor ?? ''));
    setUsos(u.data);
    setCategorias(c.data);
    setTipos(t.data);
    setCausas(ca.data);
  }, []);

  useEffect(() => {
    cargar().catch((error) => setErrors(getErrorMessages(error, 'No se pudo cargar la configuración')));
  }, [cargar]);

  async function guardar(accion, mensaje) {
    try {
      await accion();
      setErrors([]);
      setAviso(mensaje);
      await cargar();
      return true;
    } catch (error) {
      setAviso(null);
      setErrors(getErrorMessages(error, 'No se pudo guardar'));
      return false;
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <Link to="/pecuaria" className="text-sm text-sky-400 hover:underline">
        ← Pecuaria
      </Link>
      <h1 className="mb-6 mt-2 text-3xl font-bold">Configuración</h1>
      <ErrorList errors={errors} />
      <Notice tone="ok">{aviso}</Notice>

      <section className="mb-8 rounded-lg border border-zinc-800 p-4">
        <h2 className="mb-1 text-lg font-semibold">Unidad ganadera</h2>
        <p className="mb-3 text-sm text-zinc-400">Cuántos kilos de peso vivo son 1 UG. Cambia todos los cálculos de UG/ha.</p>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            guardar(() => setParametro('KG_POR_UG', Number(kgPorUg.replace(',', '.'))), `Listo: 1 UG = ${kgPorUg} kg.`);
          }}
        >
          <span className="text-sm">1 UG =</span>
          <input
            inputMode="decimal"
            value={kgPorUg}
            onChange={(e) => setKgPorUg(e.target.value)}
            aria-label="Kilos por UG"
            className={`${inputClass.replace('w-full', '')} w-24`}
          />
          <span className="text-sm">kg de peso vivo</span>
          <button type="submit" className={boton} disabled={!(Number(kgPorUg.replace(',', '.')) > 0)}>
            Guardar
          </button>
        </form>
      </section>

      <section className="mb-8">
        <h2 className="mb-1 text-lg font-semibold">Usos de suelo</h2>
        <p className="mb-3 text-sm text-zinc-400">
          El grupo dice en qué columna del resumen caen los animales de ese potrero. Hasta que lo confirme el encargado, es un supuesto.
        </p>
        <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
          {usos.map((u) => (
            <li key={u.id} className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 ${u.activo ? '' : 'opacity-50'}`}>
              <div className="min-w-0">
                <p className="font-medium">{u.nombre}</p>
                <p className="text-xs text-zinc-500">En la planilla: {u.alias.join(', ')}</p>
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={u.grupo}
                  aria-label={`Grupo de ${u.nombre}`}
                  onChange={(e) => guardar(() => editarUso(u.id, { grupo: e.target.value }), `${u.nombre}: grupo cambiado.`)}
                  className={selectClass}
                >
                  {GRUPOS.map(([valor, texto]) => (
                    <option key={valor} value={valor}>
                      {texto}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-xs text-zinc-400">
                  <input
                    type="checkbox"
                    checked={u.activo}
                    onChange={(e) => guardar(() => editarUso(u.id, { activo: e.target.checked }), `${u.nombre}: ${e.target.checked ? 'activado' : 'desactivado'}.`)}
                  />
                  activo
                </label>
              </div>
            </li>
          ))}
        </ul>
        <NuevoItem
          etiqueta="uso de suelo"
          conGrupo
          onCrear={(datos) => guardar(() => crearUso(datos), `Uso "${datos.nombre}" agregado.`)}
        />
      </section>

      <section className="mb-8">
        <h2 className="mb-1 text-lg font-semibold">Categorías</h2>
        <p className="mb-3 text-sm text-zinc-400">
          Los alias son las otras formas en que la planilla escribe la categoría (por ejemplo "Ternero" para "Terneros"). El sexo se deduce del nombre
          (CIGAM no lo tiene); corregilo si hace falta.
        </p>
        <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
          {categorias.map((c) => (
            <Categoria key={c.id} categoria={c} guardar={guardar} />
          ))}
        </ul>
        <NuevoItem etiqueta="categoría" onCrear={(datos) => guardar(() => crearCategoria(datos), `Categoría "${datos.nombre}" agregada.`)} />
      </section>

      <TiposMovimiento tipos={tipos} guardar={guardar} />
      <Causas causas={causas} tipos={tipos} guardar={guardar} />
    </main>
  );
}

function Categoria({ categoria: c, guardar }) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(c.nombre);
  const [alias, setAlias] = useState('');

  const abrir = () => {
    setNombre(c.nombre);
    // El nombre siempre es alias: no hace falta mostrarlo.
    setAlias(c.alias.filter((a) => a !== c.nombre.toLowerCase()).join(', '));
    setEditando(true);
  };

  if (editando) {
    return (
      <li className="space-y-2 bg-zinc-800/50 px-4 py-3">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} aria-label="Nombre" className={inputClass} />
        <input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Alias, separados por coma" aria-label="Alias" className={inputClass} />
        <div className="flex gap-2">
          <button
            type="button"
            className={boton}
            disabled={!nombre.trim()}
            onClick={async () => {
              const ok = await guardar(() => editarCategoria(c.id, { nombre: nombre.trim(), alias: separarAlias(alias) }), 'Categoría guardada.');
              if (ok) setEditando(false);
            }}
          >
            Guardar
          </button>
          <button type="button" onClick={() => setEditando(false)} className="px-3 text-sm text-zinc-400">
            Cancelar
          </button>
        </div>
      </li>
    );
  }
  return (
    <li className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 ${c.activo ? '' : 'opacity-50'}`}>
      <div className="min-w-0">
        <p className="font-medium">{c.nombre}</p>
        <p className="text-xs text-zinc-500">En la planilla: {c.alias.join(', ')}</p>
      </div>
      <div className="flex items-center gap-3">
        <select
          value={c.sexo ?? ''}
          aria-label={`Sexo de ${c.nombre}`}
          onChange={(e) => guardar(() => editarCategoria(c.id, { sexo: e.target.value || null }), `${c.nombre}: sexo cambiado.`)}
          className={selectClass}
        >
          {SEXOS.map(([valor, texto]) => (
            <option key={valor} value={valor}>
              {texto}
            </option>
          ))}
        </select>
        <button type="button" onClick={abrir} className="text-sm text-sky-400 hover:underline">
          Editar
        </button>
        <label className="flex items-center gap-1 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={c.activo}
            onChange={(e) => guardar(() => editarCategoria(c.id, { activo: e.target.checked }), `${c.nombre}: ${e.target.checked ? 'activada' : 'desactivada'}.`)}
          />
          activa
        </label>
      </div>
    </li>
  );
}

function NuevoItem({ etiqueta, conGrupo = false, onCrear }) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [grupo, setGrupo] = useState('VERDEO');
  const [alias, setAlias] = useState('');

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="mt-3 text-sm text-sky-400 hover:underline">
        + Agregar {etiqueta}
      </button>
    );
  }
  return (
    <form
      className="mt-3 space-y-2 rounded-lg bg-zinc-800/50 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await onCrear({ nombre: nombre.trim(), alias: separarAlias(alias), ...(conGrupo && { grupo }) });
        if (ok) {
          setNombre('');
          setAlias('');
          setAbierto(false);
        }
      }}
    >
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={`Nombre del ${etiqueta}`} aria-label="Nombre" className={inputClass} />
      {conGrupo && (
        <select value={grupo} onChange={(e) => setGrupo(e.target.value)} aria-label="Grupo" className={`${selectClass} w-full py-2`}>
          {GRUPOS.map(([valor, texto]) => (
            <option key={valor} value={valor}>
              {texto}
            </option>
          ))}
        </select>
      )}
      <input
        value={alias}
        onChange={(e) => setAlias(e.target.value)}
        placeholder="Cómo lo escribe la planilla (opcional, separado por coma)"
        aria-label="Alias"
        className={inputClass}
      />
      <div className="flex gap-2">
        <button type="submit" className={boton} disabled={!nombre.trim()}>
          Agregar
        </button>
        <button type="button" onClick={() => setAbierto(false)} className="px-3 text-sm text-zinc-400">
          Cancelar
        </button>
      </div>
    </form>
  );
}
