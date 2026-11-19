import express, { Router } from 'express';
import {
  camposController,
  categoriasController,
  causasController,
  confirmarImportacion,
  createPotrero,
  descartarImportacion,
  getHistorial,
  getImportacion,
  getLote,
  getMovimientos,
  getMovimientosTodas,
  getParametros,
  getPotrero,
  getResumen,
  getResumenTodas,
  getDestinosEntreCampos,
  postEntreCampos,
  postMultiple,
  postRevertirEvento,
  postVistaPreviaEntreCampos,
  postVistaPreviaMultiple,
  listPotreros,
  listPotrerosTodas,
  patchLote,
  postEntradaSalida,
  postMovimiento,
  postRevertirMovimiento,
  postVistaPreviaEntradaSalida,
  postVistaPreviaMovimiento,
  putParametro,
  putStock,
  putUso,
  subirPlanilla,
  tiposMovimientoController,
  updatePotrero,
  usosSueloController,
} from './pecuaria.controller.js';
import {
  confirmarImportacionSchema,
  crearCampoSchema,
  crearCategoriaSchema,
  crearCausaSchema,
  crearPotreroSchema,
  crearTipoSchema,
  crearUsoSchema,
  editarCampoSchema,
  editarCategoriaSchema,
  editarCausaSchema,
  editarPotreroSchema,
  editarTipoSchema,
  editarUsoSchema,
  entradaSalidaSchema,
  entreCamposSchema,
  multipleSchema,
  loteSchema,
  movimientoSchema,
  parametroSchema,
  stockSchema,
  usoSchema,
} from './pecuaria.schema.js';
import { authRequired } from '../auth/auth.middleware.js';
import { requirePermission } from '../auth/permisos.js';
import { validateBody } from '../middlewares/validate.js';
import {
  alcance,
  alcanceEntradaSalida,
  alcanceEntreCampos,
  alcanceEvento,
  alcanceMultiple,
  alcanceOrigenQuery,
  alcanceImportacion,
  alcanceMovimiento,
  alcanceSubirPlanilla,
  soloTodas,
} from './alcance.js';

const router = Router();

// Permisos (paso 3 del rediseño, docs/superpowers/plans/2026-11-18-permisos.md):
//   VER: mirar · CREAR: registrar (mover, entradas, salidas, corrección, uso)
//   ANULAR: revertir · EDITAR: importar la planilla y la Configuración.
// Además, cada ruta que toca una estancia controla que sea del usuario
// (alcance.js); la Configuración (catálogos, parámetros) es común a todas.
const ver = requirePermission('pecuaria', 'VER');
const registrar = requirePermission('pecuaria', 'CREAR');
const revertir = requirePermission('pecuaria', 'ANULAR');
const configurar = requirePermission('pecuaria', 'EDITAR');

router.use(authRequired);

router.get('/usos-suelo', ver, usosSueloController.list);
router.post('/usos-suelo', configurar, validateBody(crearUsoSchema), usosSueloController.create);
router.patch('/usos-suelo/:id', configurar, validateBody(editarUsoSchema), usosSueloController.update);

router.get('/categorias', ver, categoriasController.list);
router.post('/categorias', configurar, validateBody(crearCategoriaSchema), categoriasController.create);
router.patch('/categorias/:id', configurar, validateBody(editarCategoriaSchema), categoriasController.update);

// Catálogo del "libro del rodeo".
router.get('/tipos-movimiento', ver, tiposMovimientoController.list);
router.post('/tipos-movimiento', configurar, validateBody(crearTipoSchema), tiposMovimientoController.create);
router.patch('/tipos-movimiento/:id', configurar, validateBody(editarTipoSchema), tiposMovimientoController.update);

router.get('/causas', ver, causasController.list);
router.post('/causas', configurar, validateBody(crearCausaSchema), causasController.create);
router.patch('/causas/:id', configurar, validateBody(editarCausaSchema), causasController.update);

router.get('/parametros', ver, getParametros);
router.put('/parametros/:clave', configurar, validateBody(parametroSchema), putParametro);

// Estancias: cada uno ve las suyas. Crear una nueva es de alcance general.
router.get('/campos', ver, camposController.list);
router.post('/campos', configurar, soloTodas, validateBody(crearCampoSchema), camposController.create);
router.patch('/campos/:id', configurar, alcance('campo'), validateBody(editarCampoSchema), camposController.update);

router.get('/campos/:campoId/potreros', ver, alcance('campo', 'campoId'), listPotreros);
router.get('/campos/:campoId/resumen', ver, alcance('campo', 'campoId'), getResumen);
// Todas sus estancias juntas (cada uno, las que tiene).
router.get('/resumen', ver, getResumenTodas);
router.get('/potreros', ver, listPotrerosTodas);
router.get('/movimientos', ver, getMovimientosTodas);
// Agregar un corral (feedlot) es parte del trabajo diario.
router.post('/campos/:campoId/potreros', registrar, alcance('campo', 'campoId'), validateBody(crearPotreroSchema), createPotrero);
router.get('/potreros/:id', ver, alcance('potrero'), getPotrero);
router.patch('/potreros/:id', configurar, alcance('potrero'), validateBody(editarPotreroSchema), updatePotrero);
router.get('/potreros/:id/historial', ver, alcance('potrero'), getHistorial);
router.put('/potreros/:id/stock', registrar, alcance('potrero'), validateBody(stockSchema), putStock);
router.put('/potreros/:id/uso', registrar, alcance('potrero'), validateBody(usoSchema), putUso);

router.get('/lotes/:id', ver, alcance('lote'), getLote);
router.patch('/lotes/:id', registrar, alcance('lote'), validateBody(loteSchema), patchLote);
router.get('/campos/:campoId/movimientos', ver, alcance('campo', 'campoId'), getMovimientos);
// La vista previa no guarda nada, pero solo tiene sentido para quien registra.
router.post('/movimientos/vista-previa', registrar, validateBody(movimientoSchema), alcanceMovimiento, postVistaPreviaMovimiento);
router.post('/movimientos', registrar, validateBody(movimientoSchema), alcanceMovimiento, postMovimiento);
router.post('/movimientos/:id/revertir', revertir, alcance('movimiento'), postRevertirMovimiento);
// Paso 5 del rediseño: mover entre campos (el destino puede ser una estancia
// que el usuario no tiene) y movimiento múltiple. Los dos quedan como un
// evento con sus pasos, que se revierte entero.
router.get('/movimientos/entre-campos/destinos', registrar, alcanceOrigenQuery, getDestinosEntreCampos);
router.post('/movimientos/entre-campos/vista-previa', registrar, validateBody(entreCamposSchema), alcanceEntreCampos, postVistaPreviaEntreCampos);
router.post('/movimientos/entre-campos', registrar, validateBody(entreCamposSchema), alcanceEntreCampos, postEntreCampos);
router.post('/movimientos/multiple/vista-previa', registrar, validateBody(multipleSchema), alcanceMultiple, postVistaPreviaMultiple);
router.post('/movimientos/multiple', registrar, validateBody(multipleSchema), alcanceMultiple, postMultiple);
router.post('/eventos/:id/revertir', revertir, alcanceEvento, postRevertirEvento);
// Entradas (nacimiento, compra...) y salidas (muerte, venta...). Quedan en la
// misma lista que los movimientos y se revierten igual.
router.post('/entradas-salidas/vista-previa', registrar, validateBody(entradaSalidaSchema), alcanceEntradaSalida, postVistaPreviaEntradaSalida);
router.post('/entradas-salidas', registrar, validateBody(entradaSalidaSchema), alcanceEntradaSalida, postEntradaSalida);

// La planilla llega como el archivo tal cual en el cuerpo (sin JSON), con el
// nombre en ?archivo=. Opcionales: ?hoja= y ?campo= (por defecto EG).
router.post(
  '/importaciones/planilla',
  configurar,
  alcanceSubirPlanilla,
  express.raw({ type: () => true, limit: '5mb' }),
  subirPlanilla,
);
router.get('/importaciones/:id', configurar, alcanceImportacion, getImportacion);
router.post('/importaciones/:id/confirmar', configurar, alcanceImportacion, validateBody(confirmarImportacionSchema), confirmarImportacion);
router.post('/importaciones/:id/descartar', configurar, alcanceImportacion, descartarImportacion);

export default router;
