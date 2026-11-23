// Piezas visuales compartidas. Todo es Tailwind: cambialo por tu propio estilo.
import { useState } from 'react';
import Icono from './Icono';

export const inputClass =
  'w-full rounded-md border border-suelo-300 bg-superficie px-4 py-2 text-suelo-900 placeholder-suelo-400 outline-none focus:ring-2 focus:ring-campo-500';

export const buttonClass =
  'w-full rounded-md bg-boton px-4 py-2 font-medium text-white transition hover:bg-boton-hover disabled:opacity-50';

export function Card({ title, children }) {
  return (
    <div className="mx-4 mt-10 rounded-lg border border-suelo-200 bg-superficie p-6 shadow-sm sm:mx-auto sm:mt-16 sm:w-full sm:max-w-md sm:p-8">
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
        <p key={error} className="rounded-md bg-red-600 px-3 py-2 text-sm text-white">
          {error}
        </p>
      ))}
    </div>
  );
}

// Aviso que no es un error: tone "info" (ámbar) u "ok" (verde).
export function Notice({ children, tone = 'info' }) {
  if (!children) return null;
  const colors = tone === 'ok' ? 'bg-emerald-500/15 text-emerald-900' : 'bg-amber-500/15 text-amber-900';
  return (
    <p role="status" className={`mb-4 rounded-md px-3 py-2 text-sm ${colors}`}>
      {children}
    </p>
  );
}

export function FieldError({ error }) {
  return error ? <p className="mt-1 text-sm text-red-700">{error.message}</p> : null;
}

// Campo de contraseña con un botón de ojo para mostrarla u ocultarla.
// Acepta lo mismo que un <input> (también el register de react-hook-form).
export function CampoPassword({ className = inputClass, ...props }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={visible ? 'text' : 'password'} className={`${className} pr-11`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-suelo-500 hover:text-suelo-800"
      >
        <Icono nombre={visible ? 'ojoTachado' : 'ojo'} />
      </button>
    </div>
  );
}
