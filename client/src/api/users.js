import api from './axios';

export const getUsers = () => api.get('/users');
export const createUser = (data) => api.post('/users', data);
export const updateUserRoles = (id, rolIds) => api.put(`/users/${id}/roles`, { rolIds });
export const setUserActive = (id, activo) => api.patch(`/users/${id}/estado`, { activo });
export const resetUserPassword = (id, password) => api.put(`/users/${id}/password`, { password });
export const unlockUser = (id) => api.post(`/users/${id}/desbloquear`);

export const getRoles = () => api.get('/roles');
