// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const estado = vi.hoisted(() => ({ user: null }));
const api = vi.hoisted(() => ({
  getRoles: vi.fn(),
  getCatalogoPermisos: vi.fn(),
  setRolPermisos: vi.fn(),
  createRol: vi.fn(),
  updateRol: vi.fn(),
  deleteRol: vi.fn(),
  getUsers: vi.fn(),
  getEstancias: vi.fn(),
  createUser: vi.fn(),
  updateUserRoles: vi.fn(),
  updateUserEstancias: vi.fn(),
  setUserActive: vi.fn(),
  resetUserPassword: vi.fn(),
  unlockUser: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: estado.user }) }));
vi.mock('../api/users', () => api);

const { default: RolesPage } = await import('./RolesPage.jsx');
const { default: UsersPage } = await import('./UsersPage.jsx');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let contenedor;
let root;

const ROLES = [
  { id: 1, nombre: 'Administrador', descripcion: null, permisos: ['roles:VER', 'usuarios:EDITAR', 'usuarios:VER'], usuarios: 1 },
  { id: 2, nombre: 'Capataz', descripcion: 'Ve y registra', permisos: ['pecuaria:CREAR', 'pecuaria:VER'], usuarios: 0 },
];
const CATALOGO = {
  modulos: [
    { clave: 'pecuaria', nombre: 'Pecuaria', esAdministracion: false },
    { clave: 'usuarios', nombre: 'Usuarios', esAdministracion: true },
  ],
  acciones: ['VER', 'CREAR', 'EDITAR', 'APROBAR', 'ANULAR'],
};
const superadmin = { id: 1, esSuperadmin: true, permisos: [] };
const admin = { id: 2, esSuperadmin: false, permisos: ['roles:VER', 'usuarios:EDITAR', 'usuarios:VER'] };

const texto = () => contenedor.textContent;
const botones = (nombre) => [...contenedor.querySelectorAll('button')].filter((b) => b.textContent.trim() === nombre);
const esperar = () => act(async () => {});

beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset();
  api.getRoles.mockResolvedValue({ data: ROLES });
  api.getCatalogoPermisos.mockResolvedValue({ data: CATALOGO });
  api.setRolPermisos.mockResolvedValue({ data: {} });
  api.getEstancias.mockResolvedValue({ data: [{ id: 5, sigla: 'EG', nombre: 'La Gateada' }] });
  api.getUsers.mockResolvedValue({
    data: [
      { id: 2, usuario: 'admin.test', nombre: 'Admin', activo: true, esSuperadmin: false, roles: [{ id: 1, nombre: 'Administrador' }], todasLasEstancias: false, campoIds: [] },
      { id: 3, usuario: 'capataz.test', nombre: 'Capataz', activo: true, esSuperadmin: false, roles: [], todasLasEstancias: false, campoIds: [5] },
    ],
  });
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  root = createRoot(contenedor);
});

afterEach(() => {
  act(() => root.unmount());
  contenedor.remove();
});

describe('Roles y permisos', () => {
  it('resume los permisos de cada rol en palabras', async () => {
    estado.user = superadmin;
    act(() => root.render(<RolesPage />));
    await esperar();
    expect(texto()).toContain('Pecuaria: Ver, Registrar');
    expect(texto()).toContain('Para borrarlo, primero sacáselo a sus usuarios.');
  });

  it('el superadmin edita la matriz y la guarda', async () => {
    estado.user = superadmin;
    act(() => root.render(<RolesPage />));
    await esperar();
    act(() => botones('Permisos')[1].click());
    const revertir = [...contenedor.querySelectorAll('label')].find((l) => l.textContent === 'Revertir');
    act(() => revertir.querySelector('input').click());
    await act(async () => botones('Guardar permisos')[0].click());
    expect(api.setRolPermisos).toHaveBeenCalledWith(2, ['pecuaria:CREAR', 'pecuaria:VER', 'pecuaria:ANULAR']);
  });

  it('quien solo ve roles no ve los botones de editar', async () => {
    estado.user = { id: 9, esSuperadmin: false, permisos: ['roles:VER'] };
    act(() => root.render(<RolesPage />));
    await esperar();
    expect(botones('Permisos')).toHaveLength(0);
    expect(botones('Renombrar')).toHaveLength(0);
    expect(botones('+ Nuevo rol')).toHaveLength(0);
  });
});

describe('Usuarios', () => {
  it('muestra roles y estancias de cada uno', async () => {
    estado.user = superadmin;
    act(() => root.render(<UsersPage />));
    await esperar();
    expect(texto()).toContain('Sin roles: no ve nada');
    expect(texto()).toContain('La Gateada');
  });

  it('un administrador no superadmin no puede marcar roles de administración', async () => {
    estado.user = admin;
    act(() => root.render(<UsersPage />));
    await esperar();
    // El primero es el propio admin (no se edita); el "Editar" de roles del capataz.
    act(() => botones('Editar')[0].click());
    const cajas = [...contenedor.querySelectorAll('label')].filter((l) => ['Administrador', 'Capataz'].some((n) => l.textContent.startsWith(n)));
    const administrador = cajas.find((l) => l.textContent.startsWith('Administrador')).querySelector('input');
    const capataz = cajas.find((l) => l.textContent.startsWith('Capataz')).querySelector('input');
    expect(administrador.disabled).toBe(true);
    expect(capataz.disabled).toBe(false);
  });

  it('sin permiso de alta no aparece "Nuevo usuario"', async () => {
    estado.user = admin;
    act(() => root.render(<UsersPage />));
    await esperar();
    expect(botones('+ Nuevo usuario')).toHaveLength(0);
  });
});
