// Configuración del "libro del rodeo": tipos de movimiento y causas.
// Cada guardado pasa por `guardar(accion, mensaje)` de la página, que muestra
// el aviso o el error y recarga los datos.
import { useState } from 'react';
import { crearCausa, crearTipoMovimiento, editarCausa, editarTipoMovimiento } from '../api/pecuaria';
import { inputClass } from './ui';

export const EFECTOS = [
  ['ENTRA', 'Entradas', 'Suman animales al campo'],
  ['SALE', 'Salidas', 'Restan animales del campo'],
  ['MUEVE', 'Cambian dónde están o con quién', 'Potrero o lote'],
  ['CATEGORIA', 'Cambian qué son', 'Categoría'],
  ['REGISTRO', 'Registros', 'Anotan un dato sin mover animales'],
];
const NIVELES = [
  ['CAMPO', 'Campo'],
  ['POTRERO', 'Potrero'],
  ['CATEGORIA', 'Categoría'],
  ['LOTE', 'Lote'],
  ['PARTE_LOTE', 'Parte de un lote'],
];
const SEXOS = [
  ['CUALQUIERA', 'Machos y hembras'],
  ['HEMBRA', 'Solo hembras'],
  ['MACHO', 'Solo machos'],
];

const boton = 'rounded-md bg-campo-600 px-4 py-2 text-sm font-medium text-white hover:bg-campo-700 disabled:opacity-50';
const selectClass = 'rounded-md border border-suelo-300 bg-white px-2 py-2 text-sm text-suelo-900';
const chip = 'rounded px-2 py-0.5 text-xs';

function Check({ checked, onChange, children, disabled = false }) {
  return (
    <label className={`flex items-center gap-2 text-sm ${disabled ? 'opacity-50' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
      {children}
    </label>
  );
}

function Botones({ onCancelar, deshabilitado, texto = 'Guardar' }) {
  return (
    <div className="flex gap-2">
      <button type="submit" className={boton} disabled={deshabilitado}>
        {texto}
      </button>
      <button type="button" onClick={onCancelar} className="px-3 text-sm text-suelo-600">
        Cancelar
      </button>
    </div>
  );
}

// --- Tipos de movimiento ---

const VACIO = { nombre: '', efecto: 'REGISTRO', pideCausa: false, pideGuia: false, sexo: 'CUALQUIERA', niveles: ['LOTE'], idTipoEventoCigam: '' };

function FormTipo({ inicial, sistema = false, onGuardar, onCancelar, texto }) {
  const [t, setT] = useState(inicial);
  const set = (campo) => (valor) => setT((x) => ({ ...x, [campo]: valor }));
  const nivel = (n) => (marcado) => set('niveles')(marcado ? [...t.niveles, n] : t.niveles.filter((x) => x !== n));

  return (
    <form
      className="space-y-3 rounded-lg bg-suelo-50 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onGuardar({ ...t, nombre: t.nombre.trim(), idTipoEventoCigam: t.idTipoEventoCigam?.trim() || null });
      }}
    >
      <input value={t.nombre} onChange={(e) => set('nombre')(e.target.value)} placeholder="Nombre (por ejemplo, Dosificación)" aria-label="Nombre" className={inputClass} />
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-suelo-600">
          Qué hace
          <select value={t.efecto} disabled={sistema} onChange={(e) => set('efecto')(e.target.value)} className={`${selectClass} mt-1 w-full`}>
            {EFECTOS.map(([valor, titulo, ayuda]) => (
              <option key={valor} value={valor}>
                {titulo} ({ayuda.toLowerCase()})
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-suelo-600">
          A qué animales
          <select value={t.sexo} onChange={(e) => set('sexo')(e.target.value)} className={`${selectClass} mt-1 w-full`}>
            {SEXOS.map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </select>
        </label>
      </div>
      {sistema && <p className="text-xs text-suelo-500">Lo usa la app para mover animales: no se cambia qué hace ni se desactiva.</p>}
      <fieldset>
        <legend className="mb-1 text-xs text-suelo-600">Se puede registrar por</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {NIVELES.map(([valor, texto]) => (
            <Check key={valor} checked={t.niveles.includes(valor)} onChange={nivel(valor)}>
              {texto}
            </Check>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <Check checked={t.pideCausa} onChange={set('pideCausa')}>
          Pide causa
        </Check>
        <Check checked={t.pideGuia} onChange={set('pideGuia')}>
          Pide número de guía
        </Check>
      </div>
      <label className="block text-xs text-suelo-600">
        Evento de CIGAM (número, si lo hay)
        <input
          value={t.idTipoEventoCigam ?? ''}
          onChange={(e) => set('idTipoEventoCigam')(e.target.value)}
          inputMode="numeric"
          className={`${inputClass} mt-1`}
          aria-label="Evento de CIGAM"
        />
      </label>
      <Botones onCancelar={onCancelar} deshabilitado={!t.nombre.trim() || t.niveles.length === 0} texto={texto} />
    </form>
  );
}

const etiquetaNiveles = (niveles) => NIVELES.filter(([v]) => niveles.includes(v)).map(([, t]) => t).join(' · ');

function Tipo({ tipo: t, guardar }) {
  const [editando, setEditando] = useState(false);

  if (editando) {
    return (
      <li className="px-2 py-2">
        <FormTipo
          inicial={{ ...t, idTipoEventoCigam: t.idTipoEventoCigam ?? '' }}
          sistema={t.sistema}
          onCancelar={() => setEditando(false)}
          onGuardar={async ({ nombre, efecto, pideCausa, pideGuia, sexo, niveles, idTipoEventoCigam }) => {
            const datos = { nombre, pideCausa, pideGuia, sexo, niveles, idTipoEventoCigam, ...(!t.sistema && { efecto }) };
            if (await guardar(() => editarTipoMovimiento(t.id, datos), `"${nombre}" guardado.`)) setEditando(false);
          }}
        />
      </li>
    );
  }
  return (
    <li className={`flex flex-wrap items-start justify-between gap-2 px-4 py-3 ${t.activo ? '' : 'opacity-50'}`}>
      <div className="min-w-0 space-y-1">
        <p className="font-medium">
          {t.nombre}
          {t.idTipoEventoCigam && <span className="ml-2 text-xs font-normal text-suelo-500">CIGAM {t.idTipoEventoCigam}</span>}
        </p>
        <p className="text-xs text-suelo-600">{etiquetaNiveles(t.niveles)}</p>
        <div className="flex flex-wrap gap-1">
          {t.sexo !== 'CUALQUIERA' && <span className={`${chip} bg-fuchsia-500/15 text-fuchsia-300`}>{t.sexo === 'HEMBRA' ? 'Solo hembras' : 'Solo machos'}</span>}
          {t.pideCausa && (
            <span className={`${chip} bg-amber-500/15 text-amber-800`}>
              Pide causa{t.causas.length ? ` (${t.causas.length})` : ' · sin causas cargadas'}
            </span>
          )}
          {t.pideGuia && <span className={`${chip} bg-campo-100 text-campo-700`}>Pide guía</span>}
          {t.sistema && <span className={`${chip} bg-suelo-200 text-suelo-700`}>Lo usa la app</span>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setEditando(true)} className="text-sm text-campo-600 hover:underline">
          Editar
        </button>
        <label className={`flex items-center gap-1 text-xs text-suelo-600 ${t.sistema ? 'opacity-50' : ''}`}>
          <input
            type="checkbox"
            checked={t.activo}
            disabled={t.sistema}
            onChange={(e) => guardar(() => editarTipoMovimiento(t.id, { activo: e.target.checked }), `${t.nombre}: ${e.target.checked ? 'activado' : 'desactivado'}.`)}
          />
          activo
        </label>
      </div>
    </li>
  );
}

export function TiposMovimiento({ tipos, guardar }) {
  const [agregando, setAgregando] = useState(false);
  return (
    <section className="mb-8">
      <h2 className="mb-1 text-lg font-semibold">Tipos de movimiento</h2>
      <p className="mb-3 text-sm text-suelo-600">
        Todo cambio en el ganado queda registrado con uno de estos tipos. Los niveles dicen a qué se puede aplicar: los grandes (campo, potrero, categoría)
        son atajos que por dentro se registran lote por lote.
      </p>
      <div className="space-y-4">
        {EFECTOS.map(([efecto, titulo, ayuda]) => {
          const delGrupo = tipos.filter((t) => t.efecto === efecto);
          if (!delGrupo.length) return null;
          return (
            <div key={efecto}>
              <h3 className="mb-1 text-sm font-semibold text-suelo-700">
                {titulo} <span className="font-normal text-suelo-500">· {ayuda}</span>
              </h3>
              <ul className="divide-y divide-suelo-200 rounded-lg border border-suelo-200">
                {delGrupo.map((t) => (
                  <Tipo key={t.id} tipo={t} guardar={guardar} />
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {agregando ? (
        <div className="mt-3">
          <FormTipo
            inicial={VACIO}
            texto="Agregar"
            onCancelar={() => setAgregando(false)}
            onGuardar={async (datos) => {
              if (await guardar(() => crearTipoMovimiento(datos), `Tipo "${datos.nombre}" agregado.`)) setAgregando(false);
            }}
          />
        </div>
      ) : (
        <button type="button" onClick={() => setAgregando(true)} className="mt-3 text-sm text-campo-600 hover:underline">
          + Agregar tipo de movimiento
        </button>
      )}
    </section>
  );
}

// --- Causas ---

function FormCausa({ inicial, tipos, onGuardar, onCancelar, texto }) {
  const [c, setC] = useState(inicial);
  // Se ofrecen los tipos que piden causa y los que la causa ya tiene.
  const opciones = tipos.filter((t) => t.pideCausa || c.tipoIds.includes(t.id));
  const marcar = (id) => (si) => setC((x) => ({ ...x, tipoIds: si ? [...x.tipoIds, id] : x.tipoIds.filter((y) => y !== id) }));

  return (
    <form
      className="space-y-3 rounded-lg bg-suelo-50 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onGuardar({ codigo: c.codigo.trim(), nombre: c.nombre.trim(), tipoIds: c.tipoIds });
      }}
    >
      <div className="grid gap-2 sm:grid-cols-[8rem_1fr]">
        <input value={c.codigo} onChange={(e) => setC({ ...c, codigo: e.target.value })} placeholder="Código" aria-label="Código" className={inputClass} />
        <input value={c.nombre} onChange={(e) => setC({ ...c, nombre: e.target.value })} placeholder="Nombre" aria-label="Nombre" className={inputClass} />
      </div>
      <fieldset>
        <legend className="mb-1 text-xs text-suelo-600">Se usa en</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {opciones.map((t) => (
            <Check key={t.id} checked={c.tipoIds.includes(t.id)} onChange={marcar(t.id)}>
              {t.nombre}
            </Check>
          ))}
          {!opciones.length && <p className="text-sm text-suelo-500">Ningún tipo pide causa.</p>}
        </div>
      </fieldset>
      <Botones onCancelar={onCancelar} deshabilitado={!c.codigo.trim() || !c.nombre.trim()} texto={texto} />
    </form>
  );
}

function Causa({ causa: c, tipos, guardar }) {
  const [editando, setEditando] = useState(false);
  if (editando) {
    return (
      <li className="px-2 py-2">
        <FormCausa
          inicial={{ codigo: c.codigo, nombre: c.nombre, tipoIds: c.tipoIds }}
          tipos={tipos}
          onCancelar={() => setEditando(false)}
          onGuardar={async (datos) => {
            if (await guardar(() => editarCausa(c.id, datos), `Causa ${datos.codigo} guardada.`)) setEditando(false);
          }}
        />
      </li>
    );
  }
  return (
    <li className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 ${c.activo ? '' : 'opacity-50'}`}>
      <div className="min-w-0">
        <p className="font-medium">
          <span className="mr-2 font-mono text-xs text-suelo-600">{c.codigo}</span>
          {c.nombre}
        </p>
        <p className="text-xs text-suelo-500">{c.tipos.length ? `Se usa en: ${c.tipos.map((t) => t.nombre).join(', ')}` : 'Sin tipos asignados'}</p>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setEditando(true)} className="text-sm text-campo-600 hover:underline">
          Editar
        </button>
        <label className="flex items-center gap-1 text-xs text-suelo-600">
          <input
            type="checkbox"
            checked={c.activo}
            onChange={(e) => guardar(() => editarCausa(c.id, { activo: e.target.checked }), `${c.codigo}: ${e.target.checked ? 'activada' : 'desactivada'}.`)}
          />
          activa
        </label>
      </div>
    </li>
  );
}

export function Causas({ causas, tipos, guardar }) {
  const [agregando, setAgregando] = useState(false);
  return (
    <section className="mb-8">
      <h2 className="mb-1 text-lg font-semibold">Causas</h2>
      <p className="mb-3 text-sm text-suelo-600">
        Las que piden los tipos marcados con "Pide causa" (por ejemplo, la muerte). Las primeras vienen de CIGAM; falta completarlas con el encargado.
      </p>
      <ul className="divide-y divide-suelo-200 rounded-lg border border-suelo-200">
        {causas.map((c) => (
          <Causa key={c.id} causa={c} tipos={tipos} guardar={guardar} />
        ))}
        {!causas.length && <li className="px-4 py-3 text-sm text-suelo-500">Todavía no hay causas.</li>}
      </ul>
      {agregando ? (
        <div className="mt-3">
          <FormCausa
            inicial={{ codigo: '', nombre: '', tipoIds: [] }}
            tipos={tipos}
            texto="Agregar"
            onCancelar={() => setAgregando(false)}
            onGuardar={async (datos) => {
              if (await guardar(() => crearCausa(datos), `Causa ${datos.codigo.toUpperCase()} agregada.`)) setAgregando(false);
            }}
          />
        </div>
      ) : (
        <button type="button" onClick={() => setAgregando(true)} className="mt-3 text-sm text-campo-600 hover:underline">
          + Agregar causa
        </button>
      )}
    </section>
  );
}
