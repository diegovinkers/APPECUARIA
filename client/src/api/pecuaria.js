import api from './axios';

export const getCampos = () => api.get('/pecuaria/campos');
export const getPotreros = (campoId) => api.get(`/pecuaria/campos/${campoId}/potreros`);

// La planilla va tal cual en el cuerpo; el nombre y la hoja, en la URL.
export const subirPlanilla = (archivo, { hoja } = {}) =>
  api.post('/pecuaria/importaciones/planilla', archivo, {
    params: { archivo: archivo.name, ...(hoja && { hoja }) },
    headers: { 'Content-Type': archivo.type || 'application/octet-stream' },
  });

export const confirmarImportacion = (id, datos) => api.post(`/pecuaria/importaciones/${id}/confirmar`, datos);
export const descartarImportacion = (id) => api.post(`/pecuaria/importaciones/${id}/descartar`);

export const getCategorias = () => api.get('/pecuaria/categorias');
export const getUsosSuelo = () => api.get('/pecuaria/usos-suelo');

export const getPotrero = (id) => api.get(`/pecuaria/potreros/${id}`);
export const getHistorial = (id) => api.get(`/pecuaria/potreros/${id}/historial`);
export const guardarStock = (id, datos) => api.put(`/pecuaria/potreros/${id}/stock`, datos);
export const cambiarUso = (id, datos) => api.put(`/pecuaria/potreros/${id}/uso`, datos);
export const editarPotrero = (id, datos) => api.patch(`/pecuaria/potreros/${id}`, datos);
export const crearPotrero = (campoId, datos) => api.post(`/pecuaria/campos/${campoId}/potreros`, datos);

export const getResumen = (campoId) => api.get(`/pecuaria/campos/${campoId}/resumen`);
// Todas las estancias del usuario, sumadas (con una fila por estancia).
export const getResumenTodas = () => api.get('/pecuaria/resumen');

export const getParametros = () => api.get('/pecuaria/parametros');
export const setParametro = (clave, valor) => api.put(`/pecuaria/parametros/${clave}`, { valor });
export const crearUso = (datos) => api.post('/pecuaria/usos-suelo', datos);
export const editarUso = (id, datos) => api.patch(`/pecuaria/usos-suelo/${id}`, datos);
export const crearCategoria = (datos) => api.post('/pecuaria/categorias', datos);

export const renombrarLote = (id, nombre) => api.patch(`/pecuaria/lotes/${id}`, { nombre });
export const vistaPreviaMovimiento = (datos) => api.post('/pecuaria/movimientos/vista-previa', datos);
export const registrarMovimiento = (datos) => api.post('/pecuaria/movimientos', datos);
export const getMovimientos = (campoId, filtros = {}) => api.get(`/pecuaria/campos/${campoId}/movimientos`, { params: filtros });
export const revertirMovimiento = (id) => api.post(`/pecuaria/movimientos/${id}/revertir`);
export const getLote = (id) => api.get(`/pecuaria/lotes/${id}`);
export const editarCategoria = (id, datos) => api.patch(`/pecuaria/categorias/${id}`, datos);

// Catálogo del "libro del rodeo": tipos de movimiento y causas.
export const getTiposMovimiento = () => api.get('/pecuaria/tipos-movimiento');
export const crearTipoMovimiento = (datos) => api.post('/pecuaria/tipos-movimiento', datos);
export const editarTipoMovimiento = (id, datos) => api.patch(`/pecuaria/tipos-movimiento/${id}`, datos);
export const getCausas = () => api.get('/pecuaria/causas');
export const crearCausa = (datos) => api.post('/pecuaria/causas', datos);
export const editarCausa = (id, datos) => api.patch(`/pecuaria/causas/${id}`, datos);

// Entradas (nacimiento, compra...) y salidas (muerte, venta...).
export const vistaPreviaEntradaSalida = (datos) => api.post('/pecuaria/entradas-salidas/vista-previa', datos);
export const registrarEntradaSalida = (datos) => api.post('/pecuaria/entradas-salidas', datos);

// Paso 5 del rediseño: mover entre campos y movimiento múltiple. Los dos se
// guardan como un evento con sus pasos, que se revierte entero.
export const getDestinosEntreCampos = (origen) => api.get('/pecuaria/movimientos/entre-campos/destinos', { params: { origen } });
export const vistaPreviaEntreCampos = (datos) => api.post('/pecuaria/movimientos/entre-campos/vista-previa', datos);
export const registrarEntreCampos = (datos) => api.post('/pecuaria/movimientos/entre-campos', datos);
export const vistaPreviaMultiple = (datos) => api.post('/pecuaria/movimientos/multiple/vista-previa', datos);
export const registrarMultiple = (datos) => api.post('/pecuaria/movimientos/multiple', datos);
export const revertirEvento = (id) => api.post(`/pecuaria/eventos/${id}/revertir`);
