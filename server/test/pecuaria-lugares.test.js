import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { ALICE, PECUARIA_TODO, loggedAgent, useTestDatabase, usuarioCon } from './helpers.js';

useTestDatabase();

// Datos ficticios: los campos y potreros reales entran importando la planilla (fase 2).
const CAMPO = { sigla: 'EJ', nombre: 'Estancia Ejemplo' };

async function agente() {
  await usuarioCon(ALICE, { permisos: PECUARIA_TODO, todas: true });
  return loggedAgent(ALICE);
}

const auditoria = (accion) => prisma.auditoria.findMany({ where: { accion }, orderBy: { id: 'asc' } });

describe('campos', () => {
  it('crea un campo (estancia por defecto) con la sigla en mayúsculas y lo lista', async () => {
    const agent = await agente();
    const res = await agent.post('/api/pecuaria/campos').send({ ...CAMPO, sigla: ' ej ' }).expect(201);
    expect(res.body).toMatchObject({ sigla: 'EJ', nombre: 'Estancia Ejemplo', tipo: 'ESTANCIA', idFazendaCigam: null, activo: true });

    const lista = (await agent.get('/api/pecuaria/campos').expect(200)).body;
    expect(lista.map((c) => c.sigla)).toEqual(['EJ']);
    expect(await auditoria('CAMPO_CREADO')).toHaveLength(1);
  });

  it('rechaza una sigla repetida', async () => {
    const agent = await agente();
    await agent.post('/api/pecuaria/campos').send(CAMPO).expect(201);
    const res = await agent.post('/api/pecuaria/campos').send({ sigla: 'ej', nombre: 'Otro' }).expect(409);
    expect(res.body.errors).toEqual(['Ya existe un campo con la sigla EJ']);
  });

  it('edita el campo, incluida la clave de CIGAM, y lo audita', async () => {
    const agent = await agente();
    const { body: campo } = await agent.post('/api/pecuaria/campos').send(CAMPO);

    const res = await agent.patch(`/api/pecuaria/campos/${campo.id}`).send({ idFazendaCigam: '123' }).expect(200);
    expect(res.body.idFazendaCigam).toBe('123');
    const [fila] = await auditoria('CAMPO_EDITADO');
    expect(fila.detalle).toEqual({ antes: { idFazendaCigam: null }, despues: { idFazendaCigam: '123' } });
  });
});

describe('potreros', () => {
  async function conCampo() {
    const agent = await agente();
    const { body: campo } = await agent.post('/api/pecuaria/campos').send(CAMPO);
    return { agent, campo };
  }

  it('crea un potrero con hectáreas como número y sus subdivisiones', async () => {
    const { agent, campo } = await conCampo();
    const res = await agent
      .post(`/api/pecuaria/campos/${campo.id}/potreros`)
      .send({ nombre: '8.2/3/4/5', hectareas: '171,73', subdivisiones: ['8.2', '8.3', '8.4', '8.5'] })
      .expect(201);

    expect(res.body).toMatchObject({
      nombre: '8.2/3/4/5',
      tipo: 'POTRERO',
      hectareas: 171.73,
      hectareasAConfirmar: false,
      campoId: campo.id,
    });
    expect(res.body.subdivisiones.map((s) => s.codigo)).toEqual(['8.2', '8.3', '8.4', '8.5']);
    expect(await auditoria('POTRERO_CREADO')).toHaveLength(1);
  });

  it('el corral es un potrero especial, sin hectáreas', async () => {
    const { agent, campo } = await conCampo();
    const res = await agent
      .post(`/api/pecuaria/campos/${campo.id}/potreros`)
      .send({ nombre: 'Feedlot', tipo: 'CORRAL' })
      .expect(201);
    expect(res.body).toMatchObject({ tipo: 'CORRAL', hectareas: null });
  });

  it('lista los potreros del campo en orden, con sus subdivisiones', async () => {
    const { agent, campo } = await conCampo();
    await agent.post(`/api/pecuaria/campos/${campo.id}/potreros`).send({ nombre: 'B', orden: 2 });
    await agent.post(`/api/pecuaria/campos/${campo.id}/potreros`).send({ nombre: 'A', orden: 1, subdivisiones: ['A.1'] });

    const res = await agent.get(`/api/pecuaria/campos/${campo.id}/potreros`).expect(200);
    expect(res.body.map((p) => p.nombre)).toEqual(['A', 'B']);
    expect(res.body[0].subdivisiones.map((s) => s.codigo)).toEqual(['A.1']);
  });

  it('marca hectáreas a confirmar, las corrige después y lo audita', async () => {
    const { agent, campo } = await conCampo();
    const { body: p } = await agent
      .post(`/api/pecuaria/campos/${campo.id}/potreros`)
      .send({ nombre: 'P 1', hectareas: 1, hectareasAConfirmar: true });

    const res = await agent.patch(`/api/pecuaria/potreros/${p.id}`).send({ hectareas: 85.5, hectareasAConfirmar: false }).expect(200);
    expect(res.body).toMatchObject({ hectareas: 85.5, hectareasAConfirmar: false });

    const [fila] = await auditoria('POTRERO_EDITADO');
    expect(fila.detalle).toEqual({
      antes: { hectareas: 1, hectareasAConfirmar: true },
      despues: { hectareas: 85.5, hectareasAConfirmar: false },
    });
  });

  it('editar un dato no borra los demás (clave de CIGAM, subdivisiones)', async () => {
    const { agent, campo } = await conCampo();
    const { body: p } = await agent
      .post(`/api/pecuaria/campos/${campo.id}/potreros`)
      .send({ nombre: '72.1/2', idAreaManejoCigam: '55', subdivisiones: ['72.1', '72.2'] });

    const res = await agent.patch(`/api/pecuaria/potreros/${p.id}`).send({ orden: 4 }).expect(200);
    expect(res.body).toMatchObject({ orden: 4, idAreaManejoCigam: '55' });
    expect(res.body.subdivisiones.map((s) => s.codigo)).toEqual(['72.1', '72.2']);
  });

  it('no repite el nombre dentro del mismo campo, pero sí en otro campo', async () => {
    const { agent, campo } = await conCampo();
    const { body: otro } = await agent.post('/api/pecuaria/campos').send({ sigla: 'OT', nombre: 'Otro campo' });
    await agent.post(`/api/pecuaria/campos/${campo.id}/potreros`).send({ nombre: '42' }).expect(201);

    const res = await agent.post(`/api/pecuaria/campos/${campo.id}/potreros`).send({ nombre: '42' }).expect(409);
    expect(res.body.errors).toEqual(['Ya existe el potrero "42" en este campo']);
    await agent.post(`/api/pecuaria/campos/${otro.id}/potreros`).send({ nombre: '42' }).expect(201);
  });

  it('valida hectáreas y tipo, y responde 404 si el campo o el potrero no existen', async () => {
    const { agent, campo } = await conCampo();
    const res = await agent
      .post(`/api/pecuaria/campos/${campo.id}/potreros`)
      .send({ nombre: 'X', hectareas: -3, tipo: 'PIQUETE' })
      .expect(400);
    expect(res.body.errors).toHaveLength(2);

    await agent.post('/api/pecuaria/campos/9999/potreros').send({ nombre: 'X' }).expect(404);
    await agent.get('/api/pecuaria/campos/9999/potreros').expect(404);
    await agent.patch('/api/pecuaria/potreros/9999').send({ nombre: 'X' }).expect(404);
  });
});
