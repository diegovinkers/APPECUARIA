import { useEffect, useState } from 'react';
import { createRol, deleteRol, getCatalogoPermisos, getRoles, setRolPermisos, updateRol } from '../api/users';
import { getErrorMessages } from '../api/axios';
import { useAuth } from '../context/AuthContext';
import usePuede from '../hooks/usePuede';
import { etiquetaAccion } from '../navegacion/permisos';
import { ErrorList, Notice, buttonClass, inputClass } from '../components/ui';

// Roles y permisos (DECISIONES §3 y §11). Un rol es un conjunto de permisos
// módulo + acción; las estancias no van en el rol, se asignan a cada usuario.
// Crear, renombrar y borrar: según el permiso de Roles. La matriz de permisos
// la cambia solo el superadmin (los demás la ven).
export default function RolesPage() {
  const { user: me } = useAuth();
  const puedo = usePuede();
  const [roles, setRoles] = useState([]);
  const [catalogo, setCatalogo] = useState(null);
  const [errors, setErrors] = useState([]);
  const [aviso, setAviso] = useState(null);

  async function load() {
    const [r, c] = await Promise.all([getRoles(), getCatalogoPermisos()]);
    setRoles(r.data);
    setCatalogo(c.data);
  }

  async function run(action, fallback, okMessage = null) {
    try {
      await action();
      setErrors([]);
      setAviso(okMessage);
      await load();
      return true;
    } catch (error) {
      setAviso(null);
      setErrors(getErrorMessages(error, fallback));
      return false;
    }
  }

  useEffect(() => {
    load().catch((error) => setErrors(getErrorMessages(error, 'No se pudieron cargar los roles')));
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-4 py-5 sm:py-8">
      <h1 className="text-2xl font-bold sm:text-3xl">Roles y permisos</h1>
      <p className="mb-4 mt-1 text-sm text-suelo-600">
        El rol dice qué puede hacer cada uno. Dónde (en qué estancias) se asigna a cada usuario, en Usuarios.
      </p>
      <ErrorList errors={errors} />
      <Notice tone="ok">{aviso}</Notice>

      {puedo('roles:CREAR') && <NuevoRol onCrear={(data) => run(() => createRol(data), 'No se pudo crear el rol', `Rol ${data.nombre} creado.`)} />}

      <ul className="space-y-3">
        {roles.map((rol) => (
          <RolTarjeta
            key={rol.id}
            rol={rol}
            catalogo={catalogo}
            puedeEditar={puedo('roles:EDITAR')}
            puedeBorrar={puedo('roles:ANULAR')}
            puedeMatriz={me.esSuperadmin}
            run={run}
          />
        ))}
      </ul>
    </main>
  );
}

function NuevoRol({ onCrear }) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className={`${buttonClass} mb-4 sm:w-auto`}>
        + Nuevo rol
      </button>
    );
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (await onCrear({ nombre: nombre.trim(), descripcion: descripcion.trim() })) {
          setNombre('');
          setDescripcion('');
          setAbierto(false);
        }
      }}
      className="mb-6 space-y-3 rounded-lg border border-suelo-200 bg-superficie p-4"
    >
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre (por ejemplo: Veterinario)" aria-label="Nombre del rol" className={inputClass} />
      <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Para qué es (opcional)" aria-label="Descripción del rol" className={inputClass} />
      <p className="text-xs text-suelo-500">Se crea sin permisos. Después marcás qué puede hacer.</p>
      <div className="flex gap-2">
        <button type="submit" disabled={nombre.trim().length < 2} className={`${buttonClass} sm:w-auto`}>
          Crear
        </button>
        <button type="button" onClick={() => setAbierto(false)} className="px-4 text-sm text-suelo-600">
          Cancelar
        </button>
      </div>
    </form>
  );
}

// "Pecuaria: Ver, Registrar · Auditoría: Ver"
function resumenPermisos(rol, catalogo) {
  if (!rol.permisos.length) return 'Sin permisos';
  const porModulo = new Map();
  for (const p of rol.permisos) {
    const [modulo, accion] = p.split(':');
    porModulo.set(modulo, [...(porModulo.get(modulo) ?? []), accion]);
  }
  const orden = catalogo?.acciones ?? [];
  return [...porModulo]
    .map(([modulo, acciones]) => {
      const nombre = catalogo?.modulos.find((m) => m.clave === modulo)?.nombre ?? modulo;
      const lista = acciones.sort((a, b) => orden.indexOf(a) - orden.indexOf(b)).map((a) => etiquetaAccion(modulo, a));
      return `${nombre}: ${lista.join(', ')}`;
    })
    .join(' · ');
}

function RolTarjeta({ rol, catalogo, puedeEditar, puedeBorrar, puedeMatriz, run }) {
  const [renombrando, setRenombrando] = useState(false);
  const [nombre, setNombre] = useState(rol.nombre);
  const [descripcion, setDescripcion] = useState(rol.descripcion ?? '');
  const [matriz, setMatriz] = useState(null); // los permisos que se están editando

  async function borrar() {
    if (window.confirm(`¿Borrar el rol ${rol.nombre}? No se puede deshacer.`)) {
      await run(() => deleteRol(rol.id), 'No se pudo borrar el rol', `Rol ${rol.nombre} borrado.`);
    }
  }

  return (
    <li className="rounded-lg border border-suelo-200 bg-superficie p-4">
      {renombrando ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(
              () => updateRol(rol.id, { nombre: nombre.trim(), descripcion: descripcion.trim() }),
              'No se pudo guardar el rol',
              'Rol guardado.',
            );
            if (ok) setRenombrando(false);
          }}
          className="space-y-2"
        >
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} aria-label="Nombre del rol" className={inputClass} />
          <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Para qué es (opcional)" aria-label="Descripción del rol" className={inputClass} />
          <div className="flex gap-3">
            <button type="submit" className="text-sm font-medium text-campo-600 hover:underline">
              Guardar
            </button>
            <button type="button" onClick={() => setRenombrando(false)} className="text-sm text-suelo-600 hover:underline">
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold">{rol.nombre}</p>
            {rol.descripcion && <p className="text-sm text-suelo-600">{rol.descripcion}</p>}
          </div>
          <span className="text-sm text-suelo-500">
            {rol.usuarios === 0 ? 'Nadie lo tiene' : rol.usuarios === 1 ? '1 usuario' : `${rol.usuarios} usuarios`}
          </span>
        </div>
      )}

      {!matriz && <p className="mt-2 text-sm">{resumenPermisos(rol, catalogo)}</p>}

      {matriz && catalogo && (
        <div className="mt-3 space-y-3">
          {catalogo.modulos.map((m) => (
            <fieldset key={m.clave} className="rounded-md bg-suelo-50 p-3">
              <legend className="px-1 text-sm font-medium">{m.nombre}</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {catalogo.acciones.map((a) => {
                  const clave = `${m.clave}:${a}`;
                  return (
                    <label key={a} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={matriz.includes(clave)}
                        onChange={() => setMatriz((p) => (p.includes(clave) ? p.filter((x) => x !== clave) : [...p, clave]))}
                      />
                      {etiquetaAccion(m.clave, a)}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={async () => {
                const ok = await run(() => setRolPermisos(rol.id, matriz), 'No se pudieron guardar los permisos', `Permisos de ${rol.nombre} guardados.`);
                if (ok) setMatriz(null);
              }}
              className="text-sm font-medium text-campo-600 hover:underline"
            >
              Guardar permisos
            </button>
            <button type="button" onClick={() => setMatriz(null)} className="text-sm text-suelo-600 hover:underline">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {!renombrando && !matriz && (puedeMatriz || puedeEditar || puedeBorrar) && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-suelo-200 pt-3">
          {puedeMatriz && (
            <button type="button" onClick={() => setMatriz(rol.permisos)} className="text-sm text-campo-600 hover:underline">
              Permisos
            </button>
          )}
          {puedeEditar && (
            <button type="button" onClick={() => setRenombrando(true)} className="text-sm text-campo-600 hover:underline">
              Renombrar
            </button>
          )}
          {puedeBorrar &&
            (rol.usuarios === 0 ? (
              <button type="button" onClick={borrar} className="text-sm text-red-700 hover:underline">
                Borrar
              </button>
            ) : (
              <span className="text-xs text-suelo-500">Para borrarlo, primero sacáselo a sus usuarios.</span>
            ))}
        </div>
      )}
    </li>
  );
}
