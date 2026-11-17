import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { CAMBIAR_PASSWORD } from '../components/ProtectedRoute';

const formatDate = (value) => (value ? new Date(value).toLocaleString('es-UY') : '—');

export default function ProfilePage() {
  const { user } = useAuth();

  const fields = [
    ['Usuario', user.usuario],
    ['Nombre', user.nombre],
    ['Email', user.email || '—'],
    ['Código CIGAM', user.codigoCigam || '—'],
    ['Roles', user.esSuperadmin ? 'Superadministrador' : user.roles.map((r) => r.nombre).join(', ') || 'Sin roles'],
    ['Último acceso', formatDate(user.ultimoAcceso)],
    ['Usuario creado', formatDate(user.creadoEn)],
  ];

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-6 text-3xl font-bold">Mi perfil</h1>
      <dl className="grid gap-5 rounded-lg border border-zinc-800 bg-zinc-800/50 p-6 sm:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm text-zinc-500">{label}</dt>
            <dd className="mt-1 break-all text-lg font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <Link
        to={CAMBIAR_PASSWORD}
        className="mt-6 inline-block rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:border-sky-500 hover:text-white"
      >
        Cambiar contraseña
      </Link>
    </main>
  );
}
