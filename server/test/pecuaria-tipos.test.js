// Paso 1 del "libro del rodeo": catálogo de tipos de movimiento y causas,
// sexo de las categorías y vínculo de los movimientos con su tipo.
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/db.js';
import { seedPecuaria } from '../src/seed/seed.js';
import { deducirSexo } from '../src/pecuaria/sexo.js';
import { useTestDatabase } from './helpers.js';
import { auditoria, prepararCampo } from './pecuaria-helpers.js';

useTestDatabase();

const quiet = () => {};
const API = '/api/pecuaria';

async function agente() {
  const { agent, ...resto } = await prepararCampo();
  return { agent, ...resto };
}

const tipos = async (agent) => (await agent.get(`${API}/tipos-movimiento`).expect(200)).body;
const porClave = async (agent) => Object.fromEntries((await tipos(agent)).map((t) => [t.clave, t]));

describe('acceso', () => {
  it('sin sesión responde 401', async () => {
    await request(app).get(`${API}/tipos-movimiento`).expect(401);
    await request(app).get(`${API}/causas`).expect(401);
  });
});

describe('catálogo inicial (seed)', () => {
  it('crea los tipos de la propuesta con su efecto y su número de CIGAM', async () => {
    const { agent } = await agente();
    const t = await porClave(agent);

    expect(Object.keys(t)).toHaveLength(27);
    const cigam = Object.fromEntries(Object.values(t).filter((x) => x.idTipoEventoCigam).map((x) => [x.nombre, x.idTipoEventoCigam]));
    expect(cigam).toEqual({
      'Caravaneo o señalada': '1',
      Inseminación: '2',
      Pesada: '3',
      'Mover el lote entero': '4',
      'Sumar a otro lote': '5',
      'Formar un lote nuevo': '5',
      Muerte: '6',
      Consumo: '7',
      'Vacuna carbunclo': '8',
      'Vacuna aftosa': '9',
      Ecografía: '11',
      'Nacimiento / parto': '12',
      Alimentación: '13',
    });
    expect(t.MUERTE).toMatchObject({ efecto: 'SALE', pideCausa: true, pideGuia: false, sexo: 'CUALQUIERA', activo: true });
    expect(t.CONSUMO).toMatchObject({ efecto: 'SALE', pideCausa: true });
    expect(t.VENTA).toMatchObject({ efecto: 'SALE', pideGuia: true });
    expect(t.COMPRA).toMatchObject({ efecto: 'ENTRA', pideGuia: true });
    expect(t.NACIMIENTO).toMatchObject({ efecto: 'ENTRA', pideGuia: false });
    expect(t.TRASLADO_ENTRADA).toMatchObject({ efecto: 'ENTRA', pideGuia: true });
    expect(t.TRASLADO_SALIDA).toMatchObject({ efecto: 'SALE', pideGuia: true });
    expect(t.CAMBIO_CATEGORIA).toMatchObject({ efecto: 'CATEGORIA' });
    expect(t.SUMAR_LOTE).toMatchObject({ efecto: 'MUEVE', sistema: true });
    expect(t.PESADA).toMatchObject({ efecto: 'REGISTRO', sistema: false });
    expect(t.ECOGRAFIA.sexo).toBe('HEMBRA');
    expect(t.CASTRACION.sexo).toBe('MACHO');
  });

  it('los niveles siguen la tabla de la propuesta (sección 5)', async () => {
    const { agent } = await agente();
    const t = await porClave(agent);
    expect(t.MUERTE.niveles).toEqual(['LOTE', 'PARTE_LOTE']);
    expect(t.CONSUMO.niveles).toEqual(['PARTE_LOTE']);
    expect(t.COMPRA.niveles).toEqual(['LOTE']);
    expect(t.VACUNA_AFTOSA.niveles).toEqual(['CAMPO', 'POTRERO', 'CATEGORIA', 'LOTE', 'PARTE_LOTE']);
    expect(t.CAMBIO_CATEGORIA.niveles).toEqual(['POTRERO', 'CATEGORIA', 'LOTE', 'PARTE_LOTE']);
    expect(t.ALIMENTACION.niveles).toEqual(['POTRERO', 'CATEGORIA', 'LOTE']);
  });

  it('crea las causas de CIGAM vinculadas a muerte y consumo', async () => {
    const { agent } = await agente();
    const causas = (await agent.get(`${API}/causas`).expect(200)).body;
    const t = await porClave(agent);
    expect(causas.map((c) => [c.codigo, c.nombre])).toEqual([
      ['CA-001', 'Cobra'],
      ['MO-001', 'Mordida'],
      ['CO-001', 'Después de 3 días'],
      ['CO-002', 'Después de 7 días'],
    ]);
    const cobra = causas.find((c) => c.codigo === 'CA-001');
    expect(cobra.tipos.map((x) => x.id)).toEqual([t.MUERTE.id]);
    const co1 = causas.find((c) => c.codigo === 'CO-001');
    expect(co1.tipos.map((x) => x.id)).toEqual([t.CONSUMO.id]);
  });

  it('se puede repetir sin duplicar ni pisar lo que se editó', async () => {
    await seedPecuaria(prisma, quiet);
    const pesada = await prisma.tipoMovimiento.findUnique({ where: { clave: 'PESADA' } });
    await prisma.tipoMovimiento.update({ where: { id: pesada.id }, data: { nombre: 'Pesaje', activo: false } });
    await prisma.causaMovimiento.update({ where: { codigo: 'CA-001' }, data: { nombre: 'Víbora' } });
    const antes = { tipos: await prisma.tipoMovimiento.count(), causas: await prisma.causaMovimiento.count() };

    await seedPecuaria(prisma, quiet);

    expect(await prisma.tipoMovimiento.count()).toBe(antes.tipos);
    expect(await prisma.causaMovimiento.count()).toBe(antes.causas);
    expect(await prisma.tipoMovimiento.findUnique({ where: { clave: 'PESADA' } })).toMatchObject({ nombre: 'Pesaje', activo: false });
    expect((await prisma.causaMovimiento.findUnique({ where: { codigo: 'CA-001' } })).nombre).toBe('Víbora');
  });

  it('si la base ya tiene los tipos que usa la app (los crea la migración), agrega los que faltan', async () => {
    await prisma.tipoMovimiento.create({
      data: { clave: 'SUMAR_LOTE', nombre: 'Sumar a otro lote', efecto: 'MUEVE', niveles: ['LOTE'] },
    });
    await seedPecuaria(prisma, quiet);
    expect(await prisma.tipoMovimiento.count()).toBe(27);
    // El que ya estaba no se toca.
    expect((await prisma.tipoMovimiento.findUnique({ where: { clave: 'SUMAR_LOTE' } })).niveles).toEqual(['LOTE']);
  });
});

describe('tipos de movimiento', () => {
  const nuevo = { nombre: 'Dosificación', efecto: 'REGISTRO', niveles: ['LOTE', 'POTRERO'] };

  it('crea un tipo, genera la clave del nombre si no viene, y lo audita', async () => {
    const { agent } = await agente();
    const res = await agent.post(`${API}/tipos-movimiento`).send(nuevo).expect(201);
    expect(res.body).toMatchObject({
      nombre: 'Dosificación',
      clave: 'DOSIFICACION',
      efecto: 'REGISTRO',
      pideCausa: false,
      pideGuia: false,
      sexo: 'CUALQUIERA',
      idTipoEventoCigam: null,
      activo: true,
      sistema: false,
      // Siempre en el orden de la tabla: campo → parte de un lote.
      niveles: ['POTRERO', 'LOTE'],
    });
    const [fila] = await auditoria('TIPO_MOVIMIENTO_CREADO');
    expect(fila).toMatchObject({ entidad: 'tipo_movimiento', entidadId: String(res.body.id), detalle: { nombre: 'Dosificación' } });
  });

  it('valida efecto, sexo, niveles y clave', async () => {
    const { agent } = await agente();
    const casos = [
      [{ ...nuevo, efecto: 'BORRA' }, /efecto/i],
      [{ ...nuevo, sexo: 'AMBOS' }, /sexo/i],
      [{ ...nuevo, niveles: [] }, /nivel/i],
      [{ ...nuevo, niveles: ['ANIMAL'] }, /nivel/i],
      [{ ...nuevo, clave: 'con espacios' }, /clave/i],
      [{ ...nuevo, nombre: '  ' }, /nombre/i],
    ];
    for (const [body, error] of casos) {
      const res = await agent.post(`${API}/tipos-movimiento`).send(body).expect(400);
      expect(res.body.errors.join(' '), JSON.stringify(body)).toMatch(error);
    }
  });

  it('rechaza un nombre o una clave repetidos', async () => {
    const { agent } = await agente();
    const nombre = await agent.post(`${API}/tipos-movimiento`).send({ ...nuevo, nombre: 'Muerte' }).expect(409);
    expect(nombre.body.errors[0]).toMatch(/Muerte/);
    const clave = await agent.post(`${API}/tipos-movimiento`).send({ ...nuevo, clave: 'MUERTE' }).expect(409);
    expect(clave.body.errors[0]).toMatch(/MUERTE/);
  });

  it('edita y audita solo lo que cambió; la clave no se cambia', async () => {
    const { agent } = await agente();
    const { MUERTE } = await porClave(agent);
    const res = await agent
      .patch(`${API}/tipos-movimiento/${MUERTE.id}`)
      .send({ nombre: 'Muerte', pideGuia: true, niveles: ['PARTE_LOTE'], idTipoEventoCigam: '6', clave: 'OTRA' })
      .expect(200);
    expect(res.body).toMatchObject({ clave: 'MUERTE', pideGuia: true, niveles: ['PARTE_LOTE'] });
    const [fila] = await auditoria('TIPO_MOVIMIENTO_EDITADO');
    expect(fila.detalle).toEqual({
      antes: { pideGuia: false, niveles: ['LOTE', 'PARTE_LOTE'] },
      despues: { pideGuia: true, niveles: ['PARTE_LOTE'] },
    });
  });

  it('los tipos que usa la app para mover no se desactivan ni cambian de efecto', async () => {
    const { agent } = await agente();
    const { SUMAR_LOTE, PESADA } = await porClave(agent);
    const off = await agent.patch(`${API}/tipos-movimiento/${SUMAR_LOTE.id}`).send({ activo: false }).expect(409);
    expect(off.body.errors[0]).toMatch(/lo usa la app/);
    await agent.patch(`${API}/tipos-movimiento/${SUMAR_LOTE.id}`).send({ efecto: 'SALE' }).expect(409);
    // Cambiarle el nombre sí se puede.
    await agent.patch(`${API}/tipos-movimiento/${SUMAR_LOTE.id}`).send({ nombre: 'Juntar con otro lote' }).expect(200);
    // Los demás sí se desactivan.
    await agent.patch(`${API}/tipos-movimiento/${PESADA.id}`).send({ activo: false }).expect(200);
  });

  it('un tipo que ya tiene movimientos no cambia de efecto', async () => {
    const { agent, potrero, cat } = await agente();
    const { lote } = await potrero('P1', { hectareas: 10, lotes: [['Lote A', 'Terneros', 20, 200]] });
    const { body: m } = await agent
      .post(`${API}/movimientos`)
      .send({ loteOrigenId: lote['Lote A'].id, cabezas: 20, destinoPotreroId: lote['Lote A'].potreroId, modo: 'CATEGORIA', categoriaId: cat.Terneras })
      .expect(201);
    // Hasta el paso 2 solo la app registra movimientos: se simula uno de un tipo propio.
    const { body: propio } = await agent.post(`${API}/tipos-movimiento`).send({ nombre: 'Reclasificación', efecto: 'CATEGORIA', niveles: ['LOTE'] });
    await prisma.movimiento.update({ where: { id: m.movimiento.id }, data: { tipoId: propio.id } });

    const res = await agent.patch(`${API}/tipos-movimiento/${propio.id}`).send({ efecto: 'REGISTRO' }).expect(409);
    expect(res.body.errors[0]).toMatch(/ya tiene movimientos/);
    // Lo demás sí se edita.
    await agent.patch(`${API}/tipos-movimiento/${propio.id}`).send({ activo: false }).expect(200);
  });

  it('responde 404 para ids inexistentes o mal formados', async () => {
    const { agent } = await agente();
    for (const id of ['9999', 'abc']) await agent.patch(`${API}/tipos-movimiento/${id}`).send({ orden: 1 }).expect(404);
  });
});

describe('causas', () => {
  it('crea una causa con su código en mayúsculas, la vincula a tipos y la audita', async () => {
    const { agent } = await agente();
    const { MUERTE, CONSUMO } = await porClave(agent);
    const res = await agent
      .post(`${API}/causas`)
      .send({ codigo: ' en-001 ', nombre: 'Enfermedad', tipoIds: [MUERTE.id, CONSUMO.id, MUERTE.id] })
      .expect(201);
    expect(res.body).toMatchObject({ codigo: 'EN-001', nombre: 'Enfermedad', activo: true });
    expect(res.body.tipos.map((t) => t.clave).sort()).toEqual(['CONSUMO', 'MUERTE']);
    expect(await auditoria('CAUSA_CREADA')).toHaveLength(1);
  });

  it('rechaza un código repetido y tipos que no existen', async () => {
    const { agent } = await agente();
    const dup = await agent.post(`${API}/causas`).send({ codigo: 'ca-001', nombre: 'Otra' }).expect(409);
    expect(dup.body.errors[0]).toMatch(/CA-001/);
    const malos = await agent.post(`${API}/causas`).send({ codigo: 'X-1', nombre: 'X', tipoIds: [9999] }).expect(400);
    expect(malos.body.errors[0]).toMatch(/tipo/i);
    await agent.post(`${API}/causas`).send({ nombre: 'Sin código' }).expect(400);
  });

  it('edita nombre, estado y tipos (reemplaza la lista) y audita los cambios', async () => {
    const { agent } = await agente();
    const { CONSUMO } = await porClave(agent);
    const cobra = (await agent.get(`${API}/causas`)).body.find((c) => c.codigo === 'CA-001');
    const res = await agent
      .patch(`${API}/causas/${cobra.id}`)
      .send({ nombre: 'Cobra (víbora)', activo: false, tipoIds: [CONSUMO.id] })
      .expect(200);
    expect(res.body).toMatchObject({ nombre: 'Cobra (víbora)', activo: false });
    expect(res.body.tipos.map((t) => t.clave)).toEqual(['CONSUMO']);
    const [fila] = await auditoria('CAUSA_EDITADA');
    expect(fila.detalle).toEqual({
      antes: { nombre: 'Cobra', activo: true, tipoIds: [cobra.tipos[0].id] },
      despues: { nombre: 'Cobra (víbora)', activo: false, tipoIds: [CONSUMO.id] },
    });
  });

  it('cada tipo muestra sus causas', async () => {
    const { agent } = await agente();
    const { MUERTE, PESADA } = await porClave(agent);
    expect(MUERTE.causas.map((c) => c.codigo)).toEqual(['CA-001', 'MO-001']);
    expect(PESADA.causas).toEqual([]);
  });

  it('responde 404 para ids inexistentes', async () => {
    const { agent } = await agente();
    await agent.patch(`${API}/causas/9999`).send({ nombre: 'X' }).expect(404);
  });
});

describe('sexo de las categorías', () => {
  it('se deduce del nombre (como en la planilla y en CIGAM)', () => {
    const casos = {
      Terneros: 'MACHO',
      'Terneros chicos': 'MACHO',
      TERNEIRO: 'MACHO',
      'NOVILLO 1-2': 'MACHO',
      'TORO PURO ANGUS': 'MACHO',
      Borrego: 'MACHO',
      Carnero: 'MACHO',
      Cordero: 'MACHO',
      Padrillo: 'MACHO',
      Potrillo: 'MACHO',
      'Caballo domado': 'MACHO',
      Capón: 'MACHO',
      Terneras: 'HEMBRA',
      'Terneras chicas': 'HEMBRA',
      TERNEIRA: 'HEMBRA',
      Vacas: 'HEMBRA',
      'Vacas CUT': 'HEMBRA',
      'VACA CRIA WAGYU': 'HEMBRA',
      'Vaquillonas paridas': 'HEMBRA',
      'VAQUILLONA +2 PRENA': 'HEMBRA',
      Borrega: 'HEMBRA',
      'OVEJA CRIA': 'HEMBRA',
      Cordera: 'HEMBRA',
      Yegua: 'HEMBRA',
      Potranca: 'HEMBRA',
      Mixtos: null,
      Bueyes: null,
      '': null,
    };
    for (const [nombre, sexo] of Object.entries(casos)) expect(deducirSexo(nombre), nombre).toBe(sexo);
  });

  it('el seed y el alta lo deducen; se puede editar y queda en la auditoría', async () => {
    const { agent } = await agente();
    const categorias = (await agent.get(`${API}/categorias`).expect(200)).body;
    const sexo = Object.fromEntries(categorias.map((c) => [c.nombre, c.sexo]));
    expect(sexo).toMatchObject({ Terneros: 'MACHO', Terneras: 'HEMBRA', Vacas: 'HEMBRA', 'Vaquillonas paridas': 'HEMBRA' });

    const toros = (await agent.post(`${API}/categorias`).send({ nombre: 'Toros' }).expect(201)).body;
    expect(toros.sexo).toBe('MACHO');
    const mixtos = (await agent.post(`${API}/categorias`).send({ nombre: 'Mixtos' }).expect(201)).body;
    expect(mixtos.sexo).toBeNull();
    const elegido = (await agent.post(`${API}/categorias`).send({ nombre: 'Bueyes', sexo: 'MACHO' }).expect(201)).body;
    expect(elegido.sexo).toBe('MACHO');

    const res = await agent.patch(`${API}/categorias/${toros.id}`).send({ sexo: null }).expect(200);
    expect(res.body.sexo).toBeNull();
    const filas = await auditoria('CATEGORIA_EDITADA');
    expect(filas.at(-1).detalle).toEqual({ antes: { sexo: 'MACHO' }, despues: { sexo: null } });

    await agent.patch(`${API}/categorias/${toros.id}`).send({ sexo: 'TORO' }).expect(400);
  });
});

describe('los movimientos quedan vinculados a su tipo', () => {
  async function preparar() {
    const base = await agente();
    const p1 = await base.potrero('P1', { hectareas: 100, lotes: [['Lote A', 'Terneros', 300, 250]] });
    const p2 = await base.potrero('P2', { hectareas: 50, lotes: [['Lote B', 'Terneros', 100, 300]] });
    const p3 = await base.potrero('P3', { hectareas: 40 });
    return { ...base, P1: p1.potrero, P2: p2.potrero, P3: p3.potrero, A: p1.lote['Lote A'], B: p2.lote['Lote B'] };
  }
  const mover = async (agent, body) => (await agent.post(`${API}/movimientos`).send(body).expect(201)).body.movimiento;
  const claveDe = async (id) => (await prisma.movimiento.findUnique({ where: { id }, include: { tipo: true } })).tipo.clave;

  it('SUMAR, NUEVO, ENTERO, CATEGORIA y REVERSION tienen su tipo del catálogo', async () => {
    const { agent, cat, P1, P2, P3, A, B } = await preparar();
    const sumar = await mover(agent, { loteOrigenId: A.id, cabezas: 10, destinoPotreroId: P2.id, modo: 'SUMAR', loteDestinoId: B.id });
    const nuevo = await mover(agent, { loteOrigenId: A.id, cabezas: 10, destinoPotreroId: P3.id, modo: 'NUEVO', nuevoLote: { nombre: 'Lote C', categoriaId: cat.Terneros } });
    const entero = await mover(agent, { loteOrigenId: B.id, cabezas: 110, destinoPotreroId: P1.id, modo: 'ENTERO' });
    const categoria = await mover(agent, { loteOrigenId: B.id, cabezas: 110, destinoPotreroId: P1.id, modo: 'CATEGORIA', categoriaId: cat.Terneras });
    const reversion = (await agent.post(`${API}/movimientos/${categoria.id}/revertir`).expect(201)).body;
    const reversionId = reversion.movimiento?.id ?? reversion.id;

    expect(await claveDe(sumar.id)).toBe('SUMAR_LOTE');
    expect(await claveDe(nuevo.id)).toBe('LOTE_NUEVO');
    expect(await claveDe(entero.id)).toBe('LOTE_ENTERO');
    expect(await claveDe(categoria.id)).toBe('CAMBIO_CATEGORIA');
    expect(await claveDe(reversionId)).toBe('REVERSION');
  });

  it('la lista de movimientos trae el tipo', async () => {
    const { agent, campo, P2, A, B } = await preparar();
    await mover(agent, { loteOrigenId: A.id, cabezas: 10, destinoPotreroId: P2.id, modo: 'SUMAR', loteDestinoId: B.id });
    const { movimientos } = (await agent.get(`${API}/campos/${campo.id}/movimientos`).expect(200)).body;
    expect(movimientos[0].tipo).toMatchObject({ clave: 'SUMAR_LOTE', nombre: 'Sumar a otro lote' });
  });

  it('funciona aunque el catálogo esté vacío (crea el tipo que falta)', async () => {
    const { agent, P2, A, B } = await preparar();
    await prisma.causaTipoMovimiento.deleteMany();
    await prisma.tipoMovimiento.deleteMany();
    const m = await mover(agent, { loteOrigenId: A.id, cabezas: 10, destinoPotreroId: P2.id, modo: 'SUMAR', loteDestinoId: B.id });
    expect(await claveDe(m.id)).toBe('SUMAR_LOTE');
  });
});
