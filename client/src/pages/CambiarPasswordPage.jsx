import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { getErrorMessages } from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { Card, ErrorList, FieldError, Notice, buttonClass, inputClass } from '../components/ui';
import { newPasswordRules } from '../utils/password';

// Cambio de la propia contraseña. Si la puso un administrador (usuario nuevo
// o contraseña restablecida), es obligatorio antes de usar la app.
export default function CambiarPasswordPage() {
  const { user, changePassword } = useAuth();
  const navigate = useNavigate();
  const [errors, setErrors] = useState([]);
  const { register, handleSubmit, formState } = useForm();
  const obligatorio = user.debeCambiarPassword;

  const onSubmit = handleSubmit(async ({ passwordActual, passwordNueva }) => {
    try {
      await changePassword({ passwordActual, passwordNueva });
      navigate('/', { replace: true, state: { aviso: 'Listo: cambiaste tu contraseña. Las otras sesiones abiertas se cerraron.' } });
    } catch (error) {
      setErrors(getErrorMessages(error, 'No se pudo cambiar la contraseña'));
    }
  });

  return (
    <Card title="Cambiar contraseña">
      {obligatorio && (
        <Notice>Antes de seguir, elegí una contraseña nueva: la que tenés la puso un administrador.</Notice>
      )}
      <ErrorList errors={errors} />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {/* Para que el administrador de contraseñas del navegador sepa de qué usuario es. */}
        <input type="text" autoComplete="username" value={user.usuario} readOnly hidden />
        <div>
          <input
            type="password"
            placeholder="Contraseña actual"
            autoComplete="current-password"
            className={inputClass}
            {...register('passwordActual', { required: 'Ingresá tu contraseña actual' })}
          />
          <FieldError error={formState.errors.passwordActual} />
        </div>
        <div>
          <input
            type="password"
            placeholder="Contraseña nueva"
            autoComplete="new-password"
            className={inputClass}
            {...register('passwordNueva', newPasswordRules)}
          />
          <FieldError error={formState.errors.passwordNueva} />
        </div>
        <div>
          <input
            type="password"
            placeholder="Repetí la contraseña nueva"
            autoComplete="new-password"
            className={inputClass}
            {...register('repetida', {
              required: 'Repetí la contraseña nueva',
              validate: (value, values) => value === values.passwordNueva || 'Las contraseñas no coinciden',
            })}
          />
          <FieldError error={formState.errors.repetida} />
        </div>
        <p className="text-sm text-suelo-600">
          Mínimo 10 caracteres. Mejor una frase larga y fácil de recordar que algo corto lleno de símbolos.
        </p>
        <button type="submit" disabled={formState.isSubmitting} className={buttonClass}>
          Guardar contraseña
        </button>
        {!obligatorio && (
          <button type="button" onClick={() => navigate('/profile')} className="w-full text-sm text-suelo-600 hover:underline">
            Cancelar
          </button>
        )}
      </form>
    </Card>
  );
}
