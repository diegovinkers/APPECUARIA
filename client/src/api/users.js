import api from './axios';

export const getUsers = () => api.get('/users');
export const createUser = (data) => api.post('/users', data);
export const updateUserRoles = (id, rolIds) => api.put(`/users/${id}/roles`, { rolIds });
export const updateUserEstancias = (id, todasLasEstancias, campoIds) => api.put(`/users/${id}/estancias`, { todasLasEstancias, campoIds });
export const setUserActive = (id, activo) => api.patch(`/users/${id}/estado`, { activo });
export const resetUserPassword = (id, password) => api.put(`/users/${id}/password`, { password });
export const unlockUser = (id) => api.post(`/users/${id}/desbloquear`);
// Todas las estancias, para asignarlas (no hace falta permiso de Pecuaria).
export const getEstancias = () => api.get('/users/estancias');

export const getRoles = () => api.get('/roles');
export const getCatalogoPermisos = () => api.get('/roles/catalogo');
export const createRol = (data) => api.post('/roles', data);
export const updateRol = (id, data) => api.patch(`/roles/${id}`, data);
export const deleteRol = (id) => api.delete(`/roles/${id}`);
export const setRolPermisos = (id, permisos) => api.put(`/roles/${id}/permisos`, { permisos });
