import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  createUser,
  getRoles,
  getUsers,
  resetUserPassword,
  setUserActive,
  unlockUser,
  updateUserRoles,
} from '../api/users';
import { getErrorMessages } from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { ErrorList, FieldError, Notice, buttonClass, inputClass } from '../components/ui';
import { newPasswordRules, passwordProblem } from '../utils/password';

const formatHora = (value) => new Date(value).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' });
const estaBloqueado = (user) => user.bloqueadoHasta && new Date(user.bloqueadoHasta) > new Date();

// Panel provisorio: listar, crear, asignar roles, activar/desactivar,
// desbloquear y restablecer la contraseña.
// Los usuarios no se borran: se desactivan, así la auditoría conserva el "quién".
export default function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [errors, setErrors] = useState([]);
  const [aviso, setAviso] = useState(null);
  const { register, handleSubmit, reset, formState } = useForm({ defaultValues: { rolIds: [] } });

  async function load() {
    const [usersRes, rolesRes] = await Promise.all([getUsers(), getRoles()]);
    setUsers(usersRes.data);
    setRoles(rolesRes.data);
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
  }, []);

  const onCreate = handleSubmit((data) =>
    run(
      async () => {
        await createUser({ ...data, rolIds: toIds(data.rolIds) });
        reset();
      },
      'No se pudo crear el usuario',
      `Usuario ${data.usuario.trim().toLowerCase()} creado. Pasale la contraseña temporal: la va a tener que cambiar al entrar.`,
    ),
  );

  const onUnlock = (user) =>
    run(() => unlockUser(user.id), 'No se pudo desbloquear el usuario', `${user.usuario} ya puede volver a entrar.`);

  const onResetPassword = (user, password) =>
    run(
      () => resetUserPassword(user.id, password),
      'No se pudo restablecer la contraseña',
      `Contraseña de ${user.usuario} restablecida y sus sesiones cerradas. Pasale la temporal: la va a tener que cambiar al entrar.`,
    );

  const onToggleActive = (user) => {
    const verbo = user.activo ? 'Desactivar' : 'Activar';
    if (window.confirm(`¿${verbo} a ${user.usuario}?`)) {
      run(() => setUserActive(user.id, !user.activo), `No se pudo ${verbo.toLowerCase()} el usuario`);
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="mb-6 text-3xl font-bold">Usuarios</h1>
      <ErrorList errors={errors} />
      <Notice tone="ok">{aviso}</Notice>

      <section className="mb-10 rounded-lg border border-zinc-800 bg-zinc-800/50 p-6">
        <h2 className="mb-4 text-lg font-semibold">Crear usuario</h2>
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
            <input
              placeholder="Nombre y apellido"
              className={inputClass}
              {...register('nombre', { required: 'El nombre es obligatorio' })}
            />
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
          <fieldset className="sm:col-span-2">
            <legend className="mb-2 text-sm text-zinc-400">Roles</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {roles.map((rol) => (
                <label key={rol.id} className="flex items-center gap-2 text-sm" title={rol.descripcion ?? ''}>
                  <input type="checkbox" value={rol.id} {...register('rolIds')} />
                  {rol.nombre}
                </label>
              ))}
            </div>
          </fieldset>
          <button type="submit" disabled={formState.isSubmitting} className={`${buttonClass} sm:col-span-2`}>
            Crear
          </button>
        </form>
      </section>

      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-800 text-zinc-400">
            <tr>
              <th className="px-4 py-3">Usuario</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Roles</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {users.map((user) => {
              const isMe = user.id === me.id;
              return (
                <tr key={user.id} className={user.activo ? '' : 'text-zinc-500'}>
                  <td className="px-4 py-3 align-top">
                    {user.usuario} {isMe && <span className="text-zinc-500">(vos)</span>}
                    {user.email && <div className="break-all text-xs text-zinc-500">{user.email}</div>}
                  </td>
                  <td className="px-4 py-3 align-top">{user.nombre}</td>
                  <td className="px-4 py-3 align-top">
                    {user.esSuperadmin ? (
                      <span className="text-amber-300">Superadministrador</span>
                    ) : (
                      <RolesEditor
                        user={user}
                        roles={roles}
                        disabled={isMe}
                        onSave={(rolIds) => run(() => updateUserRoles(user.id, rolIds), 'No se pudieron guardar los roles')}
                      />
                    )}
                  </td>
                  <td className="space-y-1 px-4 py-3 align-top">
                    <div className={user.activo ? 'text-emerald-400' : 'text-zinc-500'}>
                      {user.activo ? 'Activo' : 'Inactivo'}
                    </div>
                    {estaBloqueado(user) && (
                      <div className="text-xs text-red-300">Bloqueado hasta las {formatHora(user.bloqueadoHasta)}</div>
                    )}
                    {user.debeCambiarPassword && <div className="text-xs text-amber-300">Contraseña temporal</div>}
                  </td>
                  <td className="px-4 py-3 align-top">
                    {!isMe && !user.esSuperadmin && (
                      <div className="flex flex-col items-start gap-1">
                        <button
                          type="button"
                          onClick={() => onToggleActive(user)}
                          className={`text-xs hover:underline ${user.activo ? 'text-red-400' : 'text-sky-400'}`}
                        >
                          {user.activo ? 'Desactivar' : 'Activar'}
                        </button>
                        {estaBloqueado(user) && (
                          <button type="button" onClick={() => onUnlock(user)} className="text-xs text-sky-400 hover:underline">
                            Desbloquear
                          </button>
                        )}
                        <ResetPassword onSave={(password) => onResetPassword(user, password)} />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}

// react-hook-form devuelve los checkbox marcados como textos (o false si no hay).
const toIds = (values) => [].concat(values || []).filter(Boolean).map(Number);

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
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-sky-400 hover:underline">
        Restablecer contraseña
      </button>
    );
  }

  return (
    <form onSubmit={save} className="w-56 space-y-2">
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
      {problem && <p className="text-xs text-red-400">{problem}</p>}
      <div className="flex gap-3">
        <button type="submit" className="text-xs font-medium text-sky-400 hover:underline">
          Guardar
        </button>
        <button type="button" onClick={close} className="text-xs text-zinc-400 hover:underline">
          Cancelar
        </button>
      </div>
    </form>
  );
}

function RolesEditor({ user, roles, disabled, onSave }) {
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState([]);

  function start() {
    setSelected(user.roles.map((r) => r.id));
    setEditing(true);
  }

  async function save() {
    if (await onSave(selected)) setEditing(false);
  }

  const toggle = (id) => setSelected((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {user.roles.length === 0 && <span className="text-zinc-500">Sin roles</span>}
        {user.roles.map((rol) => (
          <span key={rol.id} className="rounded bg-zinc-700 px-2 py-0.5 text-xs">
            {rol.nombre}
          </span>
        ))}
        {!disabled && (
          <button type="button" onClick={start} className="text-xs text-sky-400 hover:underline">
            Editar
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {roles.map((rol) => (
        <label key={rol.id} className="flex items-center gap-2">
          <input type="checkbox" checked={selected.includes(rol.id)} onChange={() => toggle(rol.id)} />
          {rol.nombre}
        </label>
      ))}
      <div className="flex gap-3 pt-1">
        <button type="button" onClick={save} className="text-xs font-medium text-sky-400 hover:underline">
          Guardar
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-xs text-zinc-400 hover:underline">
          Cancelar
        </button>
      </div>
    </div>
  );
}
