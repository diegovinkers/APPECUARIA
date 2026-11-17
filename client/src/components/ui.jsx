// Piezas visuales compartidas. Todo es Tailwind: cambialo por tu propio estilo.

export const inputClass =
  'w-full rounded-md bg-zinc-700 px-4 py-2 text-white placeholder-zinc-400 outline-none focus:ring-2 focus:ring-sky-500';

export const buttonClass =
  'w-full rounded-md bg-sky-600 px-4 py-2 font-medium text-white transition hover:bg-sky-500 disabled:opacity-50';

export function Card({ title, children }) {
  return (
    <div className="mx-auto mt-16 w-full max-w-md rounded-lg bg-zinc-800 p-8 shadow-lg">
      <h1 className="mb-6 text-2xl font-bold">{title}</h1>
      {children}
    </div>
  );
}

export function ErrorList({ errors }) {
  if (!errors?.length) return null;
  return (
    <div className="mb-4 space-y-2">
      {errors.map((error) => (
        <p key={error} className="rounded-md bg-red-500/90 px-3 py-2 text-sm text-white">
          {error}
        </p>
      ))}
    </div>
  );
}

// Aviso que no es un error: tone "info" (ámbar) u "ok" (verde).
export function Notice({ children, tone = 'info' }) {
  if (!children) return null;
  const colors = tone === 'ok' ? 'bg-emerald-500/15 text-emerald-200' : 'bg-amber-500/15 text-amber-200';
  return (
    <p role="status" className={`mb-4 rounded-md px-3 py-2 text-sm ${colors}`}>
      {children}
    </p>
  );
}

export function FieldError({ error }) {
  return error ? <p className="mt-1 text-sm text-red-400">{error.message}</p> : null;
}
