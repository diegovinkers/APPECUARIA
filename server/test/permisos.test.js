// Paso 3 del rediseño: permisos por rol y alcance por estancia
// (docs/superpowers/plans/2026-11-18-permisos.md).
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/db.js';
import { requirePermission } from '../src/auth/permisos.js';
import pecuariaRoutes from '../src/pecuaria/pecuaria.routes.js';
import usersRoutes from '../src/users/users.routes.js';
import rolesRoutes from '../src/roles/roles.routes.js';
import asistenteRoutes from '../src/asistente/asistente.routes.js';
import { BOB, PECUARIA_TODO, loggedAgent, rolConPermisos, superAgent, useTestDatabase, usuarioCon } from './helpers.js';
import { dia, prepararCampo } from './pecuaria-helpers.js';

useTestDatabase();

const CAPATAZ = { usuario: 'capataz.test', nombre: 'Capataz Test', password: 'capataz-password' };
const DIRECCION = { usuario: 'direccion.test', nombre: 'Direccion Test', password: 'direccion-password' };
const ADMIN = { usuario: 'admin.test', nombre: 'Admin Test', password: 'admin-password' };

const auditoria = (accion) => prisma.auditoria.findMany({ where: { accion }, orderBy: { id: 'asc' } });

// La estancia EJ de prepararCampo (con ALICE, que ve todas) y otra, OT, con un
// potrero y un lote: lo que un usuario de EJ no tiene que ver ni tocar.
async function dosEstancias() {
  const base = await prepararCampo();
  const { potrero: P1, lote: l1 } = await base.potrero('1', { hectareas: 50, lotes: [['A', 'Terneros', 100, 180]] });
  const { potrero: P2, lote: l2 } = await base.potrero('2', { hectareas: 40, lotes: [['B', 'Terneros', 50, 200]] });
  const otra = await prisma.campo.create({ data: { sigla: 'OT', nombre: 'Otra Estancia' } });
  const PO = await prisma.potrero.create({ data: { campoId: otra.id, nombre: 'O1', hectareas: 30 } });
  const LO = await prisma.lote.create({ data: { campoId: otra.id, potreroId: PO.id, categoriaId: base.cat.Terneros, nombre: 'O1 · Terneros' } });
  await prisma.versionStock.create({
    data: {
      potreroId: PO.id,
      fecha: dia('2026-11-13'),
      origen: 'PLANILLA',
      lineas: { create: [{ loteId: LO.id, categoriaId: base.cat.Terneros, cabezas: 30, pesoPromedioKg: 190 }] },
    },
  });
  return { ...base, P1, P2, A: l1.A, B: l2.B, otra, PO, LO };
}

describe('cada ruta declara su permiso', () => {
  // Si alguien suma una ruta sin requirePermission (o soloSesion), este test falla.
  it.each([
    ['pecuaria', pecuariaRoutes],
    ['usuarios', usersRoutes],
    ['roles', rolesRoutes],
    ['asistente', asistenteRoutes],
  ])('%s', (nombre, router) => {
    const rutas = router.stack.filter((capa) => capa.route);
    expect(rutas.length).toBeGreaterThan(0);
    const sinPermiso = rutas
      .filter((capa) => !capa.route.stack.some((l) => l.handle.permiso))
      .map((capa) => `${Object.keys(capa.route.methods)[0].toUpperCase()} ${capa.route.path}`);
    expect(sinPermiso).toEqual([]);
  });

  it('un módulo o una acción mal escritos fallan al arrancar, no al usarlos', () => {
    expect(() => requirePermission('pecuria', 'VER')).toThrow(/pecuria/);
    expect(() => requirePermission('pecuaria', 'MIRAR')).toThrow(/MIRAR/);
  });
});

describe('/verify trae los permisos y las estancias', () => {
  it('la suma de los permisos de sus roles, sin repetir', async () => {
    const otro = await rolConPermisos('Otro', ['pecuaria:VER', 'auditoria:VER']);
    const user = await usuarioCon(CAPATAZ, { permisos: ['pecuaria:VER', 'pecuaria:CREAR'], campoIds: [] });
    await prisma.usuarioRol.create({ data: { usuarioId: user.id, rolId: otro.id } });
    const agent = await loggedAgent(CAPATAZ);
    const { body } = await agent.get('/api/verify').expect(200);
    expect(body.permisos).toEqual(['auditoria:VER', 'pecuaria:CREAR', 'pecuaria:VER']);
    expect(body).toMatchObject({ todasLasEstancias: false, campoIds: [] });
  });

  it('un módulo desactivado no da permisos', async () => {
    await usuarioCon(CAPATAZ, { permisos: ['pecuaria:VER'] });
    await prisma.modulo.update({ where: { clave: 'pecuaria' }, data: { activo: false } });
    const agent = await loggedAgent(CAPATAZ);
    expect((await agent.get('/api/verify')).body.permisos).toEqual([]);
    await agent.get('/api/pecuaria/campos').expect(403);
  });
});

describe('permisos de Pecuaria por rol', () => {
  it('sin rol no se ve nada de Pecuaria', async () => {
    const { campo } = await dosEstancias();
    await usuarioCon(CAPATAZ, { permisos: [], campoIds: [campo.id] });
    const agent = await loggedAgent(CAPATAZ);
    await agent.get('/api/pecuaria/campos').expect(403);
    await agent.get(`/api/pecuaria/campos/${campo.id}/potreros`).expect(403);
  });

  it('Dirección (VER) mira pero no registra, no revierte, no importa ni configura', async () => {
    const { campo, P2, A } = await dosEstancias();
    await usuarioCon(DIRECCION, { permisos: ['pecuaria:VER'], todas: true });
    const agent = await loggedAgent(DIRECCION);
    await agent.get(`/api/pecuaria/campos/${campo.id}/resumen`).expect(200);
    await agent.post('/api/pecuaria/movimientos').send({ loteOrigenId: A.id, cabezas: 10, destinoPotreroId: P2.id, modo: 'NUEVO', nuevoLote: { categoriaId: A.categoriaId } }).expect(403);
    await agent.put('/api/pecuaria/parametros/KG_POR_UG').send({ valor: 400 }).expect(403);
    await agent.post('/api/pecuaria/importaciones/planilla?archivo=x.xlsx').send(Buffer.from('x')).expect(403);
  });

  it('el capataz (VER, CREAR) registra pero no revierte ni configura', async () => {
    const { agent: jefe, campo, P2, A, B } = await dosEstancias();
    await usuarioCon(CAPATAZ, { permisos: ['pecuaria:VER', 'pecuaria:CREAR'], campoIds: [campo.id] });
    const capataz = await loggedAgent(CAPATAZ);
    const { body } = await capataz
      .post('/api/pecuaria/movimientos')
      .send({ loteOrigenId: A.id, cabezas: 10, destinoPotreroId: P2.id, modo: 'SUMAR', loteDestinoId: B.id })
      .expect(201);
    const id = body.movimiento?.id ?? body.id ?? (await prisma.movimiento.findFirst({ select: { id: true } })).id;
    await capataz.post(`/api/pecuaria/movimientos/${id}/revertir`).expect(403);
    await capataz.post('/api/pecuaria/categorias').send({ nombre: 'Nueva' }).expect(403);
    // El que tiene ANULAR sí.
    await jefe.post(`/api/pecuaria/movimientos/${id}/revertir`).expect(201);
  });
});

describe('alcance por estancia', () => {
  async function encargadoDeEJ() {
    const datos = await dosEstancias();
    await usuarioCon(CAPATAZ, { permisos: PECUARIA_TODO, campoIds: [datos.campo.id] });
    return { ...datos, encargado: await loggedAgent(CAPATAZ) };
  }

  it('la lista de estancias trae solo las suyas; el superadmin y "todas" ven todas', async () => {
    const { encargado, agent: jefe, campo } = await encargadoDeEJ();
    expect((await encargado.get('/api/pecuaria/campos').expect(200)).body.map((c) => c.sigla)).toEqual([campo.sigla]);
    expect((await jefe.get('/api/pecuaria/campos').expect(200)).body.map((c) => c.sigla).sort()).toEqual(['EJ', 'OT']);
    const sa = await superAgent();
    expect((await sa.get('/api/pecuaria/campos').expect(200)).body).toHaveLength(2);
  });

  it('lo de otra estancia contesta 404, por campo, potrero, lote o movimiento', async () => {
    const { encargado, otra, PO, LO, campo, P1 } = await encargadoDeEJ();
    await encargado.get(`/api/pecuaria/campos/${otra.id}/potreros`).expect(404);
    await encargado.get(`/api/pecuaria/campos/${otra.id}/resumen`).expect(404);
    await encargado.get(`/api/pecuaria/campos/${otra.id}/movimientos`).expect(404);
    await encargado.get(`/api/pecuaria/potreros/${PO.id}`).expect(404);
    await encargado.get(`/api/pecuaria/potreros/${PO.id}/historial`).expect(404);
    await encargado.get(`/api/pecuaria/lotes/${LO.id}`).expect(404);
    await encargado.patch(`/api/pecuaria/lotes/${LO.id}`).send({ nombre: 'Otro nombre' }).expect(404);
    await encargado.put(`/api/pecuaria/potreros/${PO.id}/stock`).send({ fecha: '2026-11-14', lineas: [] }).expect(404);
    await encargado.post(`/api/pecuaria/campos/${otra.id}/potreros`).send({ nombre: 'Corral X', tipo: 'CORRAL' }).expect(404);
    // Lo suyo, sí.
    await encargado.get(`/api/pecuaria/campos/${campo.id}/potreros`).expect(200);
    await encargado.get(`/api/pecuaria/potreros/${P1.id}`).expect(200);
  });

  it('no mueve desde ni hacia otra estancia', async () => {
    const { encargado, LO, PO, A, P1 } = await encargadoDeEJ();
    await encargado.post('/api/pecuaria/movimientos').send({ loteOrigenId: LO.id, cabezas: 5, destinoPotreroId: P1.id, modo: 'NUEVO', nuevoLote: { categoriaId: A.categoriaId } }).expect(404);
    await encargado.post('/api/pecuaria/movimientos/vista-previa').send({ loteOrigenId: A.id, cabezas: 5, destinoPotreroId: PO.id, modo: 'NUEVO', nuevoLote: { categoriaId: A.categoriaId } }).expect(404);
    expect(await prisma.movimiento.count()).toBe(0);
  });

  it('no registra entradas ni salidas en otra estancia', async () => {
    const { encargado, LO, PO } = await encargadoDeEJ();
    const tipo = await prisma.tipoMovimiento.findFirst({ where: { efecto: 'SALE', activo: true }, select: { id: true } });
    await encargado.post('/api/pecuaria/entradas-salidas').send({ tipoId: tipo.id, fecha: '2026-11-14', loteId: LO.id, cabezas: 1 }).expect(404);
    await encargado.post('/api/pecuaria/entradas-salidas/vista-previa').send({ tipoId: tipo.id, fecha: '2026-11-14', loteId: LO.id, cabezas: 1 }).expect(404);
    expect(PO.campoId).not.toBe(undefined);
  });

  it('no revierte un movimiento de otra estancia', async () => {
    const { encargado, agent: jefe, PO, LO } = await encargadoDeEJ();
    const P2 = await prisma.potrero.create({ data: { campoId: PO.campoId, nombre: 'O2', hectareas: 20 } });
    const { body } = await jefe
      .post('/api/pecuaria/movimientos')
      .send({ loteOrigenId: LO.id, cabezas: 5, destinoPotreroId: P2.id, modo: 'NUEVO', nuevoLote: { categoriaId: LO.categoriaId } })
      .expect(201);
    const id = body.movimiento?.id ?? body.id ?? (await prisma.movimiento.findFirst({ select: { id: true } })).id;
    await encargado.post(`/api/pecuaria/movimientos/${id}/revertir`).expect(404);
  });

  it('importa solo la planilla de su estancia; una estancia nueva pide "todas"', async () => {
    const { encargado } = await encargadoDeEJ();
    await encargado.post('/api/pecuaria/importaciones/planilla?archivo=x.xlsx&campo=OT').send(Buffer.from('x')).expect(404);
    await encargado.post('/api/pecuaria/importaciones/planilla?archivo=x.xlsx&campo=NUEVA').send(Buffer.from('x')).expect(404);
    // La suya pasa el control (y después falla porque el archivo no es una planilla).
    await encargado.post('/api/pecuaria/importaciones/planilla?archivo=x.xlsx&campo=EJ').send(Buffer.from('x')).expect(400);
    // Crear una estancia también es de alcance general.
    await encargado.post('/api/pecuaria/campos').send({ sigla: 'NV', nombre: 'Nueva' }).expect(404);
  });

  it('el resumen de "todas" suma solo las estancias que puede ver', async () => {
    const { encargado, agent: jefe } = await encargadoDeEJ();
    const todas = (await jefe.get('/api/pecuaria/resumen').expect(200)).body;
    expect(todas.estancias.map((e) => [e.sigla, e.cabezas])).toEqual([
      ['EJ', 150],
      ['OT', 30],
    ]);
    expect(todas.totales.total).toBe(180);
    const suyas = (await encargado.get('/api/pecuaria/resumen').expect(200)).body;
    expect(suyas.estancias.map((e) => e.sigla)).toEqual(['EJ']);
    expect(suyas.totales.total).toBe(150);
  });

  it('la Configuración es común: el encargado la usa aunque tenga una sola estancia', async () => {
    const { encargado } = await encargadoDeEJ();
    await encargado.get('/api/pecuaria/categorias').expect(200);
    await encargado.post('/api/pecuaria/categorias').send({ nombre: 'Categoría nueva' }).expect(201);
  });
});

describe('usuarios: roles y estancias', () => {
  async function administrador() {
    await rolConPermisos('Administrador', ['usuarios:VER', 'usuarios:CREAR', 'usuarios:EDITAR', 'usuarios:ANULAR', 'roles:VER', 'auditoria:VER']);
    const rolAdmin = await prisma.rol.findUnique({ where: { nombre: 'Administrador' } });
    const admin = await usuarioCon(ADMIN, { permisos: [] });
    await prisma.usuarioRol.create({ data: { usuarioId: admin.id, rolId: rolAdmin.id } });
    return { agent: await loggedAgent(ADMIN), rolAdmin };
  }

  it('el administrador asigna roles comunes, pero no de administración', async () => {
    const { agent, rolAdmin } = await administrador();
    const capataz = await rolConPermisos('Capataz', ['pecuaria:VER', 'pecuaria:CREAR']);
    const res = await agent.post('/api/users').send({ ...BOB, rolIds: [capataz.id] }).expect(201);
    await agent.put(`/api/users/${res.body.id}/roles`).send({ rolIds: [capataz.id, rolAdmin.id] }).expect(403);
    await agent.post('/api/users').send({ usuario: 'otro', nombre: 'Otro Test', password: 'password789', rolIds: [rolAdmin.id] }).expect(403);
    const [a] = await auditoria('USUARIO_CREADO');
    expect(a.detalle).toMatchObject({ usuario: 'bob', roles: ['Capataz'] });
  });

  it('sin ser superadmin tampoco le saca a alguien un rol de administración', async () => {
    const { agent, rolAdmin } = await administrador();
    const otro = await usuarioCon(BOB, { permisos: [] });
    await prisma.usuarioRol.create({ data: { usuarioId: otro.id, rolId: rolAdmin.id } });
    await agent.put(`/api/users/${otro.id}/roles`).send({ rolIds: [] }).expect(403);
  });

  it('los roles asignados quedan en la auditoría con el antes y el después', async () => {
    const sa = await superAgent();
    const r1 = await rolConPermisos('Capataz', ['pecuaria:VER']);
    const r2 = await rolConPermisos('Dirección', ['pecuaria:VER']);
    const bob = await usuarioCon(BOB, { permisos: [] });
    await sa.put(`/api/users/${bob.id}/roles`).send({ rolIds: [r1.id, r2.id] }).expect(200);
    const [a] = await auditoria('ROLES_ASIGNADOS');
    expect(a.detalle).toEqual({ antes: ['Rol de bob'], despues: ['Capataz', 'Dirección'] });
  });

  it('asigna estancias: una lista, o "todas" (que vacía la lista); queda en la auditoría', async () => {
    const sa = await superAgent();
    const ej = await prisma.campo.create({ data: { sigla: 'EJ', nombre: 'Estancia Ejemplo' } });
    const ot = await prisma.campo.create({ data: { sigla: 'OT', nombre: 'Otra Estancia' } });
    const bob = await usuarioCon(BOB, { permisos: ['pecuaria:VER'] });
    let res = await sa.put(`/api/users/${bob.id}/estancias`).send({ todasLasEstancias: false, campoIds: [ot.id, ej.id] }).expect(200);
    expect(res.body).toMatchObject({ todasLasEstancias: false, campoIds: [ej.id, ot.id] });
    res = await sa.put(`/api/users/${bob.id}/estancias`).send({ todasLasEstancias: true, campoIds: [ej.id] }).expect(200);
    expect(res.body).toMatchObject({ todasLasEstancias: true, campoIds: [] });
    const registros = await auditoria('ESTANCIAS_ASIGNADAS');
    expect(registros.map((r) => r.detalle.despues)).toEqual([
      { todas: false, campos: ['EJ', 'OT'] },
      { todas: true, campos: [] },
    ]);
    await sa.put(`/api/users/${bob.id}/estancias`).send({ todasLasEstancias: false, campoIds: [9999] }).expect(400);
  });

  it('nadie cambia sus propias estancias', async () => {
    const sa = await superAgent();
    const me = (await sa.get('/api/verify')).body;
    await sa.put(`/api/users/${me.id}/estancias`).send({ todasLasEstancias: false, campoIds: [] }).expect(400);
  });

  it('el cambio de estancias vale al instante en la sesión del usuario', async () => {
    const sa = await superAgent();
    const ej = await prisma.campo.create({ data: { sigla: 'EJ', nombre: 'Estancia Ejemplo' } });
    const bob = await usuarioCon(BOB, { permisos: ['pecuaria:VER'] });
    const agent = await loggedAgent(BOB);
    expect((await agent.get('/api/pecuaria/campos')).body).toEqual([]);
    await sa.put(`/api/users/${bob.id}/estancias`).send({ todasLasEstancias: false, campoIds: [ej.id] }).expect(200);
    expect((await agent.get('/api/pecuaria/campos')).body.map((c) => c.sigla)).toEqual(['EJ']);
  });
});

describe('roles y su matriz de permisos', () => {
  it('crea, renombra y borra un rol (si nadie lo tiene); todo queda en la auditoría', async () => {
    const sa = await superAgent();
    const { body: rol } = await sa.post('/api/roles').send({ nombre: 'Veterinario', descripcion: 'Sanidad' }).expect(201);
    expect(rol).toMatchObject({ nombre: 'Veterinario', permisos: [], usuarios: 0 });
    await sa.post('/api/roles').send({ nombre: 'Veterinario' }).expect(409);
    await sa.patch(`/api/roles/${rol.id}`).send({ nombre: 'Sanidad' }).expect(200);
    await sa.delete(`/api/roles/${rol.id}`).expect(204);
    expect((await auditoria('ROL_CREADO')).length).toBe(1);
    expect((await auditoria('ROL_EDITADO'))[0].detalle).toEqual({ antes: { nombre: 'Veterinario' }, despues: { nombre: 'Sanidad' } });
    expect((await auditoria('ROL_BORRADO')).length).toBe(1);
  });

  it('no se borra un rol que alguien tiene', async () => {
    const sa = await superAgent();
    const bob = await usuarioCon(BOB, { permisos: ['pecuaria:VER'] });
    const rolId = (await prisma.usuarioRol.findFirst({ where: { usuarioId: bob.id } })).rolId;
    const res = await sa.delete(`/api/roles/${rolId}`).expect(409);
    expect(res.body.errors[0]).toMatch(/un usuario lo tiene/);
  });

  it('solo el superadmin cambia la matriz; el cambio vale al instante', async () => {
    const sa = await superAgent();
    const bob = await usuarioCon(BOB, { permisos: ['pecuaria:VER'], todas: true });
    const rolId = (await prisma.usuarioRol.findFirst({ where: { usuarioId: bob.id } })).rolId;
    const agentBob = await loggedAgent(BOB);
    await agentBob.post('/api/pecuaria/categorias').send({ nombre: 'X' }).expect(403);

    const { body } = await sa.put(`/api/roles/${rolId}/permisos`).send({ permisos: ['pecuaria:VER', 'pecuaria:EDITAR'] }).expect(200);
    expect(body.permisos).toEqual(['pecuaria:EDITAR', 'pecuaria:VER']);
    await agentBob.post('/api/pecuaria/categorias').send({ nombre: 'Categoría X' }).expect(201);
    const [a] = await auditoria('PERMISOS_CAMBIADOS');
    expect(a.detalle).toEqual({ rol: 'Rol de bob', antes: ['pecuaria:VER'], despues: ['pecuaria:EDITAR', 'pecuaria:VER'] });

    await sa.put(`/api/roles/${rolId}/permisos`).send({ permisos: ['pecuaria:VOLAR'] }).expect(400);

    // Un administrador con roles:EDITAR igual no puede.
    await usuarioCon(ADMIN, { permisos: ['roles:VER', 'roles:EDITAR'] });
    const admin = await loggedAgent(ADMIN);
    await admin.put(`/api/roles/${rolId}/permisos`).send({ permisos: [] }).expect(403);
  });

  it('el catálogo de la matriz trae los módulos activos y las acciones', async () => {
    const sa = await superAgent();
    await rolConPermisos('Cualquiera', []);
    const { body } = await sa.get('/api/roles/catalogo').expect(200);
    expect(body.modulos.map((m) => m.clave)).toContain('pecuaria');
    expect(body.acciones).toEqual(['VER', 'CREAR', 'EDITAR', 'APROBAR', 'ANULAR']);
  });
});
