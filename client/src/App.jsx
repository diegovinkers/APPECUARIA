import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { EstanciaProvider } from './context/EstanciaContext';
import { TemaProvider } from './context/TemaContext';
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
import RegistroPage from './pages/pecuaria/RegistroPage';
import MoverEntreCamposPage from './pages/pecuaria/MoverEntreCamposPage';
import MovimientoMultiplePage from './pages/pecuaria/MovimientoMultiplePage';
import EventoPage from './pages/pecuaria/EventoPage';
import PastoPage from './pages/pecuaria/PastoPage';
import ProcesoPage from './pages/pecuaria/ProcesoPage';
import ProcesosPage from './pages/pecuaria/ProcesosPage';
import ProcesoEtapaPage from './pages/pecuaria/ProcesoEtapaPage';
import NuevoProcesoPage from './pages/pecuaria/NuevoProcesoPage';
import PotrerosPage from './pages/pecuaria/PotrerosPage';
import ResumenPage from './pages/pecuaria/ResumenPage';
import { RedirigirA, RedirigirPecuaria } from './pages/pecuaria/comun';

// No hay página de registro: los usuarios los crea un administrador.
// Marco pone las barras y el panel (docs/DECISIONES.md §11).
export default function App() {
  return (
    <TemaProvider>
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
                  <Route path="/pecuaria/historial" element={<RegistroPage />} />
                  {/* "Registro" pasó a llamarse "Historial" (25/11): la dirección vieja sigue andando. */}
                  <Route path="/pecuaria/registro" element={<RedirigirA ruta="/pecuaria/historial" />} />
                  <Route path="/pecuaria/procesos" element={<ProcesosPage />} />
                  {/* La dirección vieja (antes de las pestañas, 20/11) sigue andando. */}
                  <Route path="/pecuaria/movimientos" element={<RedirigirA ruta="/pecuaria/historial" />} />
                  <Route path="/pecuaria/potreros/:id" element={<PotreroPage />} />
                  <Route path="/pecuaria/lotes/:id" element={<LotePage />} />
                  <Route path="/pecuaria/procesos/:id" element={<ProcesoPage />} />
                </Route>
                <Route element={<ProtectedRoute permiso="pecuaria:CREAR" />}>
                  <Route path="/pecuaria/mover" element={<MoverPage />} />
                  <Route path="/pecuaria/registrar" element={<RegistrarPage />} />
                  <Route path="/pecuaria/mover-entre-campos" element={<MoverEntreCamposPage />} />
                  <Route path="/pecuaria/movimiento-multiple" element={<MovimientoMultiplePage />} />
                  {/* Eventos (pesada, vacuna...): el camino de 4 pasos. */}
                  <Route path="/pecuaria/eventos/nuevo" element={<EventoPage />} />
                  <Route path="/pecuaria/pasto/nuevo" element={<PastoPage />} />
                  <Route path="/pecuaria/procesos/nuevo" element={<NuevoProcesoPage />} />
                  <Route path="/pecuaria/procesos/:id/etapa/:etapa" element={<ProcesoEtapaPage />} />
                  {/* Otra tanda que entra al servicio (fase 6): la misma pantalla de empezar. */}
                  <Route path="/pecuaria/procesos/:id/tanda" element={<NuevoProcesoPage />} />
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
    </TemaProvider>
  );
}
