import api from './axios';

export const loginRequest = (data) => api.post('/login', data);
export const logoutRequest = () => api.post('/logout');
export const verifyRequest = () => api.get('/verify');
export const changePasswordRequest = (data) => api.put('/password', data);
