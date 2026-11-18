import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { EstanciaProvider } from './context/EstanciaContext';
import AvisosApp from './components/AvisosApp';
import Marco from './components/Marco';
import ProtectedRoute from './components/ProtectedRoute';
import CambiarPasswordPage from './pages/CambiarPasswordPage';
import ConfiguracionPecuariaPage from './pages/ConfiguracionPecuariaPage';
import HomePage from './pages/HomePage';
import ImportarPlanillaPage from './pages/ImportarPlanillaPage';
import LoginPage from './pages/LoginPage';
import LotePage from './pages/LotePage';
import MoverPage from './pages/MoverPage';
import PotreroPage from './pages/PotreroPage';
import ProfilePage from './pages/ProfilePage';
import RegistrarPage from './pages/RegistrarPage';
import RolesPage from './pages/RolesPage';
import UsersPage from './pages/UsersPage';
import MovimientosPage from './pages/pecuaria/MovimientosPage';
import PotrerosPage from './pages/pecuaria/PotrerosPage';
import ResumenPage from './pages/pecuaria/ResumenPage';
import { RedirigirPecuaria } from './pages/pecuaria/comun';

// No hay página de registro: los usuarios los crea un administrador.
// Marco pone las barras y el panel (docs/DECISIONES.md §11).
export default function App() {
  return (
    <AuthProvider>
      <EstanciaProvider>
        <BrowserRouter>
          <AvisosApp />
          <Routes>
            <Route element={<Marco />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<LoginPage />} />

              {/* Cualquier usuario con sesión */}
              <Route element={<ProtectedRoute />}>
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/cambiar-password" element={<CambiarPasswordPage />} />
              </Route>

              {/* Cada grupo pide su permiso (el mismo que la API; docs/DECISIONES.md §11). */}
              <Route element={<ProtectedRoute permiso="pecuaria:VER" />}>
                <Route path="/pecuaria" element={<RedirigirPecuaria />} />
                <Route path="/pecuaria/resumen" element={<ResumenPage />} />
                <Route path="/pecuaria/potreros" element={<PotrerosPage />} />
                <Route path="/pecuaria/movimientos" element={<MovimientosPage />} />
                <Route path="/pecuaria/potreros/:id" element={<PotreroPage />} />
                <Route path="/pecuaria/lotes/:id" element={<LotePage />} />
              </Route>
              <Route element={<ProtectedRoute permiso="pecuaria:CREAR" />}>
                <Route path="/pecuaria/mover" element={<MoverPage />} />
                <Route path="/pecuaria/registrar" element={<RegistrarPage />} />
              </Route>
              <Route element={<ProtectedRoute permiso="pecuaria:EDITAR" />}>
                <Route path="/pecuaria/importar" element={<ImportarPlanillaPage />} />
                <Route path="/pecuaria/configuracion" element={<ConfiguracionPecuariaPage />} />
              </Route>
              <Route element={<ProtectedRoute permiso="usuarios:VER" />}>
                <Route path="/users" element={<UsersPage />} />
              </Route>
              <Route element={<ProtectedRoute permiso="roles:VER" />}>
                <Route path="/roles" element={<RolesPage />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </EstanciaProvider>
    </AuthProvider>
  );
}
