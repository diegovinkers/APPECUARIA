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
  setParametros,
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
const boton = 'rounded-md bg-campo-600 px-4 py-2 text-sm font-medium text-white hover:bg-campo-700 disabled:opacity-50';
const selectClass = 'rounded-md border border-suelo-300 bg-white px-2 py-1.5 text-sm text-suelo-900';
// "1,5" o "1.5" → 1.5 (vacío: null).
const aNumero = (texto) => (String(texto).trim() === '' ? null : Number(String(texto).trim().replace(',', '.')));
// Las etapas del encierre tienen que ir en orden: adaptación < engorde < ciclo.
// Devuelve el problema (para mostrarlo antes de guardar), o null.
export function problemaEtapas(adaptacion, engorde, ciclo) {
  if ([adaptacion, engorde, ciclo].some((n) => !(n > 0))) return 'Completá los días de cada etapa';
  if (!(adaptacion < engorde)) return 'La adaptación tiene que ser más corta que el engorde';
  if (!(engorde < ciclo)) return 'El engorde tiene que terminar antes que el ciclo';
  return null;
}

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
  const [gmd, setGmd] = useState('');
  const [ciclo, setCiclo] = useState('');
  const [adaptacion, setAdaptacion] = useState('');
  const [engorde, setEngorde] = useState('');
  const [usos, setUsos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [causas, setCausas] = useState([]);
  const [errors, setErrors] = useState([]);
  const [aviso, setAviso] = useState(null);

  const cargar = useCallback(async () => {
    const [p, u, c, t, ca] = await Promise.all([getParametros(), getUsosSuelo(), getCategorias(), getTiposMovimiento(), getCausas()]);
    const valor = (clave) => String(p.data.find((x) => x.clave === clave)?.valor ?? '').replace('.', ',');
    setKgPorUg(valor('KG_POR_UG'));
    setGmd(valor('GMD_FEEDLOT_KG'));
    setCiclo(valor('CICLO_FEEDLOT_DIAS'));
    setAdaptacion(valor('FEEDLOT_ADAPTACION_DIAS'));
    setEngorde(valor('FEEDLOT_ENGORDE_DIAS'));
    setUsos(u.data);
    setCategorias(c.data);
    setTipos(t.data);
    setCausas(ca.data);
  }, []);

  useEffect(() => {
    cargar().catch((error) => setErrors(getErrorMessages(error, 'No se pudo cargar la configuración')));
  }, [cargar]);

  const etapasMal = problemaEtapas(aNumero(adaptacion), aNumero(engorde), aNumero(ciclo));

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
      <Link to="/pecuaria/resumen" className="text-sm text-campo-600 hover:underline">
        ← Resumen
      </Link>
      <h1 className="mb-6 mt-2 text-3xl font-bold">Configuración</h1>
      <ErrorList errors={errors} />
      <Notice tone="ok">{aviso}</Notice>

      <section className="mb-8 rounded-lg border border-suelo-200 p-4">
        <h2 className="mb-1 text-lg font-semibold">Unidad ganadera</h2>
        <p className="mb-3 text-sm text-suelo-600">Cuántos kilos de peso vivo son 1 UG. Cambia todos los cálculos de UG/ha.</p>
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

      <section className="mb-8 rounded-lg border border-suelo-200 p-4" aria-label="Feedlot">
        <h2 className="mb-1 text-lg font-semibold">Feedlot</h2>
        <p className="mb-3 text-sm text-suelo-600">
          Para el Resumen del feedlot: el peso estimado de hoy (peso de entrada + días × ganancia diaria), la salida probable (entrada + días del
          ciclo) y las etapas del encierre (adaptación, engorde, terminación y, pasado el ciclo, para salir). La ganancia y el ciclo son los de
          CIGAM; las etapas, valores de arranque para ajustar.
        </p>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            guardar(
              () =>
                setParametros({
                  GMD_FEEDLOT_KG: aNumero(gmd),
                  CICLO_FEEDLOT_DIAS: aNumero(ciclo),
                  FEEDLOT_ADAPTACION_DIAS: aNumero(adaptacion),
                  FEEDLOT_ENGORDE_DIAS: aNumero(engorde),
                }),
              `Listo: ${gmd} kg por día; adaptación hasta ${adaptacion} días, engorde hasta ${engorde} y ciclo de ${ciclo}.`,
            );
          }}
        >
          <label className="flex items-center gap-2 text-sm">
            Ganancia diaria
            <input inputMode="decimal" value={gmd} onChange={(e) => setGmd(e.target.value)} aria-label="Ganancia diaria (kg por día)" className={`${inputClass.replace('w-full', '')} w-20`} />
            kg por día
          </label>
          <label className="flex items-center gap-2 text-sm">
            Ciclo
            <input inputMode="numeric" value={ciclo} onChange={(e) => setCiclo(e.target.value)} aria-label="Días del ciclo" className={`${inputClass.replace('w-full', '')} w-20`} />
            días
          </label>
          <label className="flex items-center gap-2 text-sm">
            Adaptación hasta
            <input
              inputMode="numeric"
              value={adaptacion}
              onChange={(e) => setAdaptacion(e.target.value)}
              aria-label="Días de adaptación"
              className={`${inputClass.replace('w-full', '')} w-20`}
            />
            días
          </label>
          <label className="flex items-center gap-2 text-sm">
            Engorde hasta
            <input
              inputMode="numeric"
              value={engorde}
              onChange={(e) => setEngorde(e.target.value)}
              aria-label="Días hasta el final del engorde"
              className={`${inputClass.replace('w-full', '')} w-20`}
            />
            días
          </label>
          <button type="submit" className={boton} disabled={!(aNumero(gmd) > 0) || Boolean(etapasMal)}>
            Guardar
          </button>
        </form>
        {etapasMal && <p className="mt-2 text-sm text-amber-800">{etapasMal}</p>}
      </section>

      <section className="mb-8">
        <h2 className="mb-1 text-lg font-semibold">Usos de suelo</h2>
        <p className="mb-3 text-sm text-suelo-600">
          El grupo dice en qué columna del resumen caen los animales de ese potrero. Hasta que lo confirme el encargado, es un supuesto.
        </p>
        <ul className="divide-y divide-suelo-200 rounded-lg border border-suelo-200">
          {usos.map((u) => (
            <li key={u.id} className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 ${u.activo ? '' : 'opacity-50'}`}>
              <div className="min-w-0">
                <p className="font-medium">{u.nombre}</p>
                <p className="text-xs text-suelo-500">En la planilla: {u.alias.join(', ')}</p>
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
                <label className="flex items-center gap-1 text-xs text-suelo-600">
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
        <p className="mb-3 text-sm text-suelo-600">
          Los alias son las otras formas en que la planilla escribe la categoría (por ejemplo "Ternero" para "Terneros"). El sexo se deduce del nombre
          (CIGAM no lo tiene); corregilo si hace falta.
        </p>
        <ul className="divide-y divide-suelo-200 rounded-lg border border-suelo-200">
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

// "190" o "2,5" → número; vacío → null (sin dato).
const numeroONull = (texto) => (String(texto ?? '').trim() === '' ? null : Number(String(texto).replace(',', '.')));
const aTexto = (n) => (n == null ? '' : String(n).replace('.', ','));
const formatoNumero = (n, d = 2) => Number(n).toLocaleString('es-UY', { maximumFractionDigits: d });

// Peso promedio y precio de la categoría, en una línea: "≈190 kg · USD 2,5/kg".
export function textoPesoPrecio(c) {
  const partes = [];
  if (c.pesoPromedioKg != null) partes.push(`≈${formatoNumero(c.pesoPromedioKg, 0)} kg`);
  if (c.precioUsd != null) partes.push(`USD ${formatoNumero(c.precioUsd)}/${c.precioPor === 'CABEZA' ? 'cabeza' : 'kg'}`);
  return partes.length ? partes.join(' · ') : 'Sin peso promedio ni precio';
}

function Categoria({ categoria: c, guardar }) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(c.nombre);
  const [alias, setAlias] = useState('');
  const [peso, setPeso] = useState('');
  const [precio, setPrecio] = useState('');
  const [precioPor, setPrecioPor] = useState('KG');

  const pesoN = numeroONull(peso);
  const precioN = numeroONull(precio);
  const numerosMal = (pesoN != null && !(pesoN > 0)) || (precioN != null && !(precioN > 0));

  const abrir = () => {
    setNombre(c.nombre);
    setPeso(aTexto(c.pesoPromedioKg));
    setPrecio(aTexto(c.precioUsd));
    setPrecioPor(c.precioPor ?? 'KG');
    // El nombre siempre es alias: no hace falta mostrarlo.
    setAlias(c.alias.filter((a) => a !== c.nombre.toLowerCase()).join(', '));
    setEditando(true);
  };

  if (editando) {
    return (
      <li className="space-y-2 bg-suelo-50 px-4 py-3">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} aria-label="Nombre" className={inputClass} />
        <input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Alias, separados por coma" aria-label="Alias" className={inputClass} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <label className="block text-xs text-suelo-600">
            Peso promedio (kg)
            <input inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} placeholder="Ej. 190" aria-label="Peso promedio" className={`${inputClass} mt-1`} />
          </label>
          <label className="block text-xs text-suelo-600">
            Precio (USD)
            <input inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="Ej. 2,5" aria-label="Precio" className={`${inputClass} mt-1`} />
          </label>
          <label className="block text-xs text-suelo-600">
            El precio es
            <select value={precioPor} onChange={(e) => setPrecioPor(e.target.value)} aria-label="El precio es por" className={`${inputClass} mt-1`}>
              <option value="KG">por kilo</option>
              <option value="CABEZA">por cabeza</option>
            </select>
          </label>
        </div>
        <p className="text-xs text-suelo-500">
          El peso promedio se usa para los lotes que no tienen su peso cargado (se ve con "≈"). Con el precio se calcula el valor del ganado.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className={boton}
            disabled={!nombre.trim() || numerosMal}
            onClick={async () => {
              const ok = await guardar(
                () =>
                  editarCategoria(c.id, {
                    nombre: nombre.trim(),
                    alias: separarAlias(alias),
                    pesoPromedioKg: pesoN,
                    precioUsd: precioN,
                    precioPor,
                  }),
                'Categoría guardada.',
              );
              if (ok) setEditando(false);
            }}
          >
            Guardar
          </button>
          <button type="button" onClick={() => setEditando(false)} className="px-3 text-sm text-suelo-600">
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
        <p className="text-xs text-suelo-500">En la planilla: {c.alias.join(', ')}</p>
        <p className="text-xs text-suelo-600" data-testid="peso-precio">
          {textoPesoPrecio(c)}
        </p>
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
        <button type="button" onClick={abrir} className="text-sm text-campo-600 hover:underline">
          Editar
        </button>
        <label className="flex items-center gap-1 text-xs text-suelo-600">
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
      <button type="button" onClick={() => setAbierto(true)} className="mt-3 text-sm text-campo-600 hover:underline">
        + Agregar {etiqueta}
      </button>
    );
  }
  return (
    <form
      className="mt-3 space-y-2 rounded-lg bg-suelo-50 p-4"
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
        <button type="button" onClick={() => setAbierto(false)} className="px-3 text-sm text-suelo-600">
          Cancelar
        </button>
      </div>
    </form>
  );
}
