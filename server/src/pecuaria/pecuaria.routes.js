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
  getParametros,
  getPotrero,
  getResumen,
  listPotreros,
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
  loteSchema,
  movimientoSchema,
  parametroSchema,
  stockSchema,
  usoSchema,
} from './pecuaria.schema.js';
import { authRequired } from '../auth/auth.middleware.js';
import { validateBody } from '../middlewares/validate.js';

const router = Router();

// v1 (DECISIONES §10): la fase 4 está postergada, así que cualquier usuario
// con sesión puede hacer todo. Cada cambio queda en la auditoría.
router.use(authRequired);

router.get('/usos-suelo', usosSueloController.list);
router.post('/usos-suelo', validateBody(crearUsoSchema), usosSueloController.create);
router.patch('/usos-suelo/:id', validateBody(editarUsoSchema), usosSueloController.update);

router.get('/categorias', categoriasController.list);
router.post('/categorias', validateBody(crearCategoriaSchema), categoriasController.create);
router.patch('/categorias/:id', validateBody(editarCategoriaSchema), categoriasController.update);

// Catálogo del "libro del rodeo".
router.get('/tipos-movimiento', tiposMovimientoController.list);
router.post('/tipos-movimiento', validateBody(crearTipoSchema), tiposMovimientoController.create);
router.patch('/tipos-movimiento/:id', validateBody(editarTipoSchema), tiposMovimientoController.update);

router.get('/causas', causasController.list);
router.post('/causas', validateBody(crearCausaSchema), causasController.create);
router.patch('/causas/:id', validateBody(editarCausaSchema), causasController.update);

router.get('/parametros', getParametros);
router.put('/parametros/:clave', validateBody(parametroSchema), putParametro);

router.get('/campos', camposController.list);
router.post('/campos', validateBody(crearCampoSchema), camposController.create);
router.patch('/campos/:id', validateBody(editarCampoSchema), camposController.update);

router.get('/campos/:campoId/potreros', listPotreros);
router.get('/campos/:campoId/resumen', getResumen);
router.post('/campos/:campoId/potreros', validateBody(crearPotreroSchema), createPotrero);
router.get('/potreros/:id', getPotrero);
router.patch('/potreros/:id', validateBody(editarPotreroSchema), updatePotrero);
router.get('/potreros/:id/historial', getHistorial);
router.put('/potreros/:id/stock', validateBody(stockSchema), putStock);
router.put('/potreros/:id/uso', validateBody(usoSchema), putUso);

router.get('/lotes/:id', getLote);
router.patch('/lotes/:id', validateBody(loteSchema), patchLote);
router.get('/campos/:campoId/movimientos', getMovimientos);
router.post('/movimientos/vista-previa', validateBody(movimientoSchema), postVistaPreviaMovimiento);
router.post('/movimientos', validateBody(movimientoSchema), postMovimiento);
router.post('/movimientos/:id/revertir', postRevertirMovimiento);
// Entradas (nacimiento, compra...) y salidas (muerte, venta...). Quedan en la
// misma lista que los movimientos y se revierten igual.
router.post('/entradas-salidas/vista-previa', validateBody(entradaSalidaSchema), postVistaPreviaEntradaSalida);
router.post('/entradas-salidas', validateBody(entradaSalidaSchema), postEntradaSalida);

// La planilla llega como el archivo tal cual en el cuerpo (sin JSON), con el
// nombre en ?archivo=. Opcionales: ?hoja= y ?campo= (por defecto EG).
router.post('/importaciones/planilla', express.raw({ type: () => true, limit: '5mb' }), subirPlanilla);
router.get('/importaciones/:id', getImportacion);
router.post('/importaciones/:id/confirmar', validateBody(confirmarImportacionSchema), confirmarImportacion);
router.post('/importaciones/:id/descartar', descartarImportacion);

export default router;
