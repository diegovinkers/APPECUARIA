import { useAuth } from '../context/AuthContext';
import { puede } from '../navegacion/menu';

// const puedo = usePuede(); puedo('pecuaria:ANULAR') → muestra o no el botón.
// Es comodidad visual: quien controla de verdad es la API.
export default function usePuede() {
  const { user } = useAuth();
  return (requiere) => puede(user, requiere);
}
