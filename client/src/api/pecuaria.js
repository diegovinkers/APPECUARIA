import api from './axios';

export const getCampos = () => api.get('/pecuaria/campos');
export const getPotreros = (campoId) => api.get(`/pecuaria/campos/${campoId}/potreros`);
// "Todas las estancias" (grupo 'estancias') o "Todos los feedlots" ('feedlots'):
// los potreros y los movimientos de todos los del usuario en ese grupo.
export const getPotrerosTodas = (grupo = 'estancias') => api.get('/pecuaria/potreros', { params: { grupo } });
export const getMovimientosTodas = (filtros = {}, grupo = 'estancias') => api.get('/pecuaria/movimientos', { params: { ...filtros, grupo } });

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
// Todas las estancias del usuario, sumadas (con una fila por estancia). Con
// grupo 'feedlots', los feedlots.
export const getResumenTodas = (grupo = 'estancias') => api.get('/pecuaria/resumen', { params: { grupo } });
// El análisis del feedlot, corral por corral: uno, o todos los del usuario.
export const getFeedlot = (campoId) => api.get(`/pecuaria/campos/${campoId}/feedlot`);
export const getFeedlots = () => api.get('/pecuaria/feedlots');

export const getParametros = () => api.get('/pecuaria/parametros');
export const setParametro = (clave, valor) => api.put(`/pecuaria/parametros/${clave}`, { valor });
// Varios juntos ({ CLAVE: valor }): se controlan juntos (las etapas del feedlot).
export const setParametros = (valores) => api.put('/pecuaria/parametros', { valores });
export const crearUso = (datos) => api.post('/pecuaria/usos-suelo', datos);
export const editarUso = (id, datos) => api.patch(`/pecuaria/usos-suelo/${id}`, datos);
export const crearCategoria = (datos) => api.post('/pecuaria/categorias', datos);

export const renombrarLote = (id, nombre) => api.patch(`/pecuaria/lotes/${id}`, { nombre });
// El nombre y, en el feedlot, la entrada al corral (fechaEntrada, pesoEntradaKg).
export const editarLote = (id, datos) => api.patch(`/pecuaria/lotes/${id}`, datos);
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

// Eventos (pesada, recuento, vacuna...): no mueven animales. Se anotan lote por
// lote (con atajos: la estancia, un potrero, una categoría). En la lista de
// movimientos van con ?ver=eventos o ?ver=todo.
export const vistaPreviaEventoRegistro = (datos) => api.post('/pecuaria/eventos-registro/vista-previa', datos);
export const registrarEventoRegistro = (datos) => api.post('/pecuaria/eventos-registro', datos);
export const anularEventoRegistro = (id) => api.post(`/pecuaria/eventos-registro/${id}/anular`);
export const anularGrupoEventos = (grupoId) => api.post(`/pecuaria/eventos-registro/grupo/${grupoId}/anular`);

// Procesos (ciclo reproductivo): docs/superpowers/specs/2026-11-20-procesos-design.md.
export const getProcesos = (campoId, filtros = {}) => api.get(`/pecuaria/campos/${campoId}/procesos`, { params: filtros });
export const getProcesosTodas = (filtros = {}, grupo = 'estancias') => api.get('/pecuaria/procesos', { params: { ...filtros, grupo } });
export const getProceso = (id) => api.get(`/pecuaria/procesos/${id}`);
export const vistaPreviaProceso = (datos) => api.post('/pecuaria/procesos/vista-previa', datos);
export const crearProceso = (datos) => api.post('/pecuaria/procesos', datos);
export const editarProceso = (id, datos) => api.patch(`/pecuaria/procesos/${id}`, datos);
export const vistaPreviaEtapa = (id, etapa, datos) => api.post(`/pecuaria/procesos/${id}/etapas/${etapa}/vista-previa`, datos);
export const registrarEtapa = (id, etapa, datos) => api.post(`/pecuaria/procesos/${id}/etapas/${etapa}`, datos);
export const anularCargaProceso = (id, grupoId) => api.post(`/pecuaria/procesos/${id}/cargas/${grupoId}/anular`);
// Plazos, avisos y nombres de los estados de los procesos (docs/PECUARIA.md §9).
// Descartar una sugerencia del cronograma (o volver a activarla). Devuelve la ficha.
export const descartarSugerencia = (id, clave, descartada) => api.post(`/pecuaria/procesos/${id}/sugerencias`, { clave, descartada });
export const getConfiguracionProcesos = () => api.get('/pecuaria/procesos/configuracion');
export const guardarConfiguracionProcesos = (datos) => api.put('/pecuaria/procesos/configuracion', datos);
// Los toros, uno por uno.
export const getToros = (campoId, { todos = false } = {}) => api.get(`/pecuaria/campos/${campoId}/toros`, { params: todos ? { todos: 1 } : {} });
export const crearToro = (campoId, datos) => api.post(`/pecuaria/campos/${campoId}/toros`, datos);
export const editarToro = (id, datos) => api.patch(`/pecuaria/toros/${id}`, datos);
export const cerrarProceso = (id, datos = {}) => api.post(`/pecuaria/procesos/${id}/cerrar`, datos);
export const anularProceso = (id) => api.post(`/pecuaria/procesos/${id}/anular`);
export const getSueltos = (id) => api.get(`/pecuaria/procesos/${id}/sueltos`);
export const asociarSueltos = (id, registroIds) => api.post(`/pecuaria/procesos/${id}/asociar`, { registroIds });
