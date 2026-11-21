import { useForm } from 'react-hook-form';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { CAMBIAR_PASSWORD } from '../components/ProtectedRoute';
import { CampoPassword, Card, ErrorList, FieldError, Notice, buttonClass, inputClass } from '../components/ui';

export default function LoginPage() {
  const { register, handleSubmit, formState } = useForm();
  const { user, signin, errors, notice } = useAuth();
  const location = useLocation();

  // Ya logueado (o recién logueado): primero el cambio de contraseña si es
  // obligatorio; si no, vuelve a la página que pidió el login.
  if (user) {
    const destino = user.debeCambiarPassword ? CAMBIAR_PASSWORD : location.state?.from?.pathname || '/';
    return <Navigate to={destino} replace />;
  }

  return (
    <Card title="Iniciar sesión">
      {errors.length === 0 && <Notice>{notice}</Notice>}
      <ErrorList errors={errors} />
      <form onSubmit={handleSubmit(signin)} className="space-y-4">
        <div>
          <input
            type="text"
            placeholder="Usuario"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            className={inputClass}
            {...register('usuario', { required: 'Ingresá tu usuario' })}
          />
          <FieldError error={formState.errors.usuario} />
        </div>
        <div>
          <CampoPassword
            placeholder="Contraseña"
            autoComplete="current-password"
            {...register('password', { required: 'Ingresá tu contraseña' })}
          />
          <FieldError error={formState.errors.password} />
        </div>
        <button type="submit" disabled={formState.isSubmitting} className={buttonClass}>
          Entrar
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-suelo-600">¿No tenés usuario? Pedíselo a un administrador.</p>
    </Card>
  );
}
