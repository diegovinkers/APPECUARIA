import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  createUser,
  getEstancias,
  getRoles,
  getUsers,
  resetUserPassword,
  setUserActive,
  unlockUser,
  updateUserEstancias,
  updateUserRoles,
} from '../api/users';
import { getErrorMessages } from '../api/axios';
import { useAuth } from '../context/AuthContext';
import usePuede from '../hooks/usePuede';
import { esRolDeAdministracion } from '../navegacion/permisos';
import { ErrorList, FieldError, Notice, buttonClass, inputClass } from '../components/ui';
import { newPasswordRules, passwordProblem } from '../utils/password';

const formatHora = (value) => new Date(value).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' });
const estaBloqueado = (user) => user.bloqueadoHasta && new Date(user.bloqueadoHasta) > new Date();
const linkClass = 'text-sm text-campo-600 hover:underline';

// Usuarios: alta, roles (qué puede hacer), estancias (dónde), activar o
// desactivar, desbloquear y restablecer la contraseña. Cada acción aparece
// solo si el que mira tiene el permiso (la API lo controla igual).
// Los usuarios no se borran: se desactivan, así la auditoría conserva el "quién".
export default function UsersPage() {
  const { user: me } = useAuth();
  const puedo = usePuede();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [estancias, setEstancias] = useState([]);
  const [errors, setErrors] = useState([]);
  const [aviso, setAviso] = useState(null);

  async function load() {
    const [usersRes, rolesRes, estanciasRes] = await Promise.all([
      getUsers(),
      puedo('roles:VER') ? getRoles() : Promise.resolve({ data: [] }),
      getEstancias(),
    ]);
    setUsers(usersRes.data);
    setRoles(rolesRes.data);
    setEstancias(estanciasRes.data);
  }

  // Ejecuta una acción, recarga la lista y muestra el aviso o el error.
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
    load().catch((error) => setErrors(getErrorMessages(error, 'No se pudo cargar la lista de usuarios')));
    // Solo al abrir la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onToggleActive = (user) => {
    const verbo = user.activo ? 'Desactivar' : 'Activar';
    if (window.confirm(`¿${verbo} a ${user.usuario}?`)) {
      run(() => setUserActive(user.id, !user.activo), `No se pudo ${verbo.toLowerCase()} el usuario`);
    }
  };

  // Un administrador que no es superadmin no asigna ni saca roles de administración.
  const rolBloqueado = (rol) => !me.esSuperadmin && esRolDeAdministracion(rol);

  return (
    <main className="mx-auto max-w-3xl px-4 py-5 sm:py-8">
      <h1 className="mb-4 text-2xl font-bold sm:text-3xl">Usuarios</h1>
      <ErrorList errors={errors} />
      <Notice tone="ok">{aviso}</Notice>

      {puedo('usuarios:CREAR') && (
        <CrearUsuario roles={roles} estancias={estancias} rolBloqueado={rolBloqueado} run={run} />
      )}

      <ul className="space-y-3">
        {users.map((user) => {
          const isMe = user.id === me.id;
          const editable = !isMe && !user.esSuperadmin;
          return (
            <li key={user.id} className={`rounded-lg border border-suelo-200 bg-superficie p-4 ${user.activo ? '' : 'opacity-70'}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {user.nombre} {isMe && <span className="font-normal text-suelo-500">(vos)</span>}
                  </p>
                  <p className="break-all text-sm text-suelo-600">
                    {user.usuario}
                    {user.email && ` · ${user.email}`}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p className={user.activo ? 'text-emerald-700' : 'text-suelo-500'}>{user.activo ? 'Activo' : 'Inactivo'}</p>
                  {estaBloqueado(user) && <p className="text-xs text-red-700">Bloqueado hasta las {formatHora(user.bloqueadoHasta)}</p>}
                  {user.debeCambiarPassword && <p className="text-xs text-amber-800">Contraseña temporal</p>}
                </div>
              </div>

              {user.esSuperadmin ? (
                <p className="mt-3 text-sm text-amber-800">Superadministrador: puede todo, en todas las estancias.</p>
              ) : (
                <div className="mt-3 space-y-3 border-t border-suelo-200 pt-3">
                  <RolesEditor
                    user={user}
                    roles={roles}
                    rolBloqueado={rolBloqueado}
                    editable={editable && puedo('usuarios:EDITAR') && puedo('roles:VER')}
                    onSave={(rolIds) => run(() => updateUserRoles(user.id, rolIds), 'No se pudieron guardar los roles', `Roles de ${user.usuario} guardados.`)}
                  />
                  <EstanciasEditor
                    user={user}
                    estancias={estancias}
                    editable={editable && puedo('usuarios:EDITAR')}
                    onSave={(todas, ids) =>
                      run(() => updateUserEstancias(user.id, todas, ids), 'No se pudieron guardar las estancias', `Estancias de ${user.usuario} guardadas.`)
                    }
                  />
                </div>
              )}

              {editable && (
                <div className="mt-3 flex flex-wrap items-start gap-x-4 gap-y-2 border-t border-suelo-200 pt-3">
                  {puedo('usuarios:ANULAR') && (
                    <button type="button" onClick={() => onToggleActive(user)} className={`text-sm hover:underline ${user.activo ? 'text-red-700' : 'text-campo-600'}`}>
                      {user.activo ? 'Desactivar' : 'Activar'}
                    </button>
                  )}
                  {puedo('usuarios:EDITAR') && estaBloqueado(user) && (
                    <button
                      type="button"
                      onClick={() => run(() => unlockUser(user.id), 'No se pudo desbloquear el usuario', `${user.usuario} ya puede volver a entrar.`)}
                      className={linkClass}
                    >
                      Desbloquear
                    </button>
                  )}
                  {puedo('usuarios:EDITAR') && (
                    <ResetPassword
                      onSave={(password) =>
                        run(
                          () => resetUserPassword(user.id, password),
                          'No se pudo restablecer la contraseña',
                          `Contraseña de ${user.usuario} restablecida y sus sesiones cerradas. Pasale la temporal: la va a tener que cambiar al entrar.`,
                        )
                      }
                    />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}

// react-hook-form devuelve los checkbox marcados como textos (o false si no hay).
const toIds = (values) => [].concat(values || []).filter(Boolean).map(Number);

function CrearUsuario({ roles, estancias, rolBloqueado, run }) {
  const [abierto, setAbierto] = useState(false);
  const { register, handleSubmit, reset, watch, formState } = useForm({
    defaultValues: { rolIds: [], campoIds: [], todasLasEstancias: false },
  });
  const todas = watch('todasLasEstancias');

  const onCreate = handleSubmit((data) =>
    run(
      async () => {
        await createUser({
          ...data,
          rolIds: toIds(data.rolIds),
          campoIds: data.todasLasEstancias ? [] : toIds(data.campoIds),
        });
        reset();
        setAbierto(false);
      },
      'No se pudo crear el usuario',
      `Usuario ${data.usuario.trim().toLowerCase()} creado. Pasale la contraseña temporal: la va a tener que cambiar al entrar.`,
    ),
  );

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className={`${buttonClass} mb-4 sm:w-auto`}>
        + Nuevo usuario
      </button>
    );
  }

  return (
    <section className="mb-6 rounded-lg border border-suelo-200 bg-superficie p-4 sm:p-6">
      <h2 className="mb-4 text-lg font-semibold">Nuevo usuario</h2>
      <form onSubmit={onCreate} className="grid gap-4 sm:grid-cols-2">
        <div>
          <input
            placeholder="Usuario (para iniciar sesión)"
            autoCapitalize="none"
            spellCheck={false}
            className={inputClass}
            {...register('usuario', { required: 'El nombre de usuario es obligatorio' })}
          />
          <FieldError error={formState.errors.usuario} />
        </div>
        <div>
          <input placeholder="Nombre y apellido" className={inputClass} {...register('nombre', { required: 'El nombre es obligatorio' })} />
          <FieldError error={formState.errors.nombre} />
        </div>
        <input type="email" placeholder="Email (opcional)" className={inputClass} {...register('email')} />
        <input placeholder="Código CIGAM (opcional)" className={inputClass} {...register('codigoCigam')} />
        <div className="sm:col-span-2">
          <input
            type="text"
            placeholder="Contraseña temporal (mínimo 10 caracteres; la cambia al entrar)"
            autoComplete="off"
            spellCheck={false}
            className={inputClass}
            {...register('password', newPasswordRules)}
          />
          <FieldError error={formState.errors.password} />
        </div>
        {roles.length > 0 && (
          <fieldset className="sm:col-span-2">
            <legend className="mb-2 text-sm text-suelo-600">Roles: qué puede hacer</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {roles.map((rol) => (
                <label key={rol.id} className={`flex items-center gap-2 text-sm ${rolBloqueado(rol) ? 'text-suelo-400' : ''}`} title={rol.descripcion ?? ''}>
                  <input type="checkbox" value={rol.id} disabled={rolBloqueado(rol)} {...register('rolIds')} />
                  {rol.nombre}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-sm text-suelo-600">Estancias: dónde trabaja</legend>
          <label className="mb-2 flex items-center gap-2 text-sm">
            <input type="checkbox" {...register('todasLasEstancias')} />
            Todas las estancias (también las que se sumen después)
          </label>
          {!todas && (
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {estancias.map((e) => (
                <label key={e.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" value={e.id} {...register('campoIds')} />
                  {e.nombre}
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <div className="flex gap-2 sm:col-span-2">
          <button type="submit" disabled={formState.isSubmitting} className={buttonClass}>
            Crear
          </button>
          <button type="button" onClick={() => setAbierto(false)} className="px-4 text-sm text-suelo-600">
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
}

// Restablecer la contraseña con una temporal que elige el administrador. Se
// ve mientras se escribe porque hay que pasársela al usuario.
function ResetPassword({ onSave }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState(null);

  function close() {
    setOpen(false);
    setPassword('');
    setProblem(null);
  }

  async function save(event) {
    event.preventDefault();
    const error = passwordProblem(password);
    if (error) return setProblem(error);
    if (await onSave(password)) close();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={linkClass}>
        Restablecer contraseña
      </button>
    );
  }

  return (
    <form onSubmit={save} className="w-full space-y-2 sm:w-64">
      <input
        type="text"
        autoComplete="off"
        spellCheck={false}
        placeholder="Contraseña temporal"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className={`${inputClass} py-1 text-sm`}
        autoFocus
      />
      {problem && <p className="text-xs text-red-700">{problem}</p>}
      <div className="flex gap-3">
        <button type="submit" className="text-sm font-medium text-campo-600 hover:underline">
          Guardar
        </button>
        <button type="button" onClick={close} className="text-sm text-suelo-600 hover:underline">
          Cancelar
        </button>
      </div>
    </form>
  );
}

function Chips({ items, vacio }) {
  if (!items.length) return <span className="text-sm text-suelo-500">{vacio}</span>;
  return items.map((texto) => (
    <span key={texto} className="rounded bg-suelo-200 px-2 py-0.5 text-xs">
      {texto}
    </span>
  ));
}

function RolesEditor({ user, roles, rolBloqueado, editable, onSave }) {
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState([]);
  const toggle = (id) => setSelected((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  return (
    <div>
      <p className="mb-1 text-xs text-suelo-500">Roles</p>
      {!editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <Chips items={user.roles.map((r) => r.nombre)} vacio="Sin roles: no ve nada" />
          {editable && (
            <button
              type="button"
              onClick={() => {
                setSelected(user.roles.map((r) => r.id));
                setEditing(true);
              }}
              className={linkClass}
            >
              Editar
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {roles.map((rol) => (
            <label key={rol.id} className={`flex items-center gap-2 text-sm ${rolBloqueado(rol) ? 'text-suelo-400' : ''}`}>
              <input type="checkbox" checked={selected.includes(rol.id)} disabled={rolBloqueado(rol)} onChange={() => toggle(rol.id)} />
              {rol.nombre}
              {rolBloqueado(rol) && <span className="text-xs">(solo el superadministrador)</span>}
            </label>
          ))}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={async () => (await onSave(selected)) && setEditing(false)} className="text-sm font-medium text-campo-600 hover:underline">
              Guardar
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-sm text-suelo-600 hover:underline">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EstanciasEditor({ user, estancias, editable, onSave }) {
  const [editing, setEditing] = useState(false);
  const [todas, setTodas] = useState(false);
  const [selected, setSelected] = useState([]);
  const toggle = (id) => setSelected((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const nombres = user.todasLasEstancias
    ? ['Todas']
    : user.campoIds.map((id) => estancias.find((e) => e.id === id)?.nombre ?? `#${id}`);

  return (
    <div>
      <p className="mb-1 text-xs text-suelo-500">Estancias</p>
      {!editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <Chips items={nombres} vacio="Ninguna" />
          {editable && (
            <button
              type="button"
              onClick={() => {
                setTodas(user.todasLasEstancias);
                setSelected(user.campoIds);
                setEditing(true);
              }}
              className={linkClass}
            >
              Editar
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} />
            Todas las estancias
          </label>
          {!todas &&
            estancias.map((e) => (
              <label key={e.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={selected.includes(e.id)} onChange={() => toggle(e.id)} />
                {e.nombre}
              </label>
            ))}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={async () => (await onSave(todas, todas ? [] : selected)) && setEditing(false)}
              className="text-sm font-medium text-campo-600 hover:underline"
            >
              Guardar
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-sm text-suelo-600 hover:underline">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
