import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import CambiarPasswordPage from './pages/CambiarPasswordPage';
import ConfiguracionPecuariaPage from './pages/ConfiguracionPecuariaPage';
import HomePage from './pages/HomePage';
import ImportarPlanillaPage from './pages/ImportarPlanillaPage';
import LoginPage from './pages/LoginPage';
import LotePage from './pages/LotePage';
import MoverPage from './pages/MoverPage';
import PecuariaPage from './pages/PecuariaPage';
import PotreroPage from './pages/PotreroPage';
import ProfilePage from './pages/ProfilePage';
import RegistrarPage from './pages/RegistrarPage';
import UsersPage from './pages/UsersPage';

// No hay página de registro: los usuarios los crea un administrador.
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Navbar />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />

          {/* Cualquier usuario con sesión */}
          <Route element={<ProtectedRoute />}>
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/cambiar-password" element={<CambiarPasswordPage />} />
            {/* Pecuaria v1: todos los usuarios con sesión (fase 4 postergada). */}
            <Route path="/pecuaria" element={<PecuariaPage />} />
            <Route path="/pecuaria/importar" element={<ImportarPlanillaPage />} />
            <Route path="/pecuaria/potreros/:id" element={<PotreroPage />} />
            <Route path="/pecuaria/configuracion" element={<ConfiguracionPecuariaPage />} />
            <Route path="/pecuaria/mover" element={<MoverPage />} />
            <Route path="/pecuaria/registrar" element={<RegistrarPage />} />
            <Route path="/pecuaria/lotes/:id" element={<LotePage />} />
          </Route>

          {/* TEMPORAL (fases 2 y 3): solo superadmin. En la fase 5, por permisos. */}
          <Route element={<ProtectedRoute superadmin />}>
            <Route path="/users" element={<UsersPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
