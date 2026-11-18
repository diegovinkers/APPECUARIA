import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/db.js';
import { seedPecuaria } from '../src/seed/seed.js';
import { ALICE, PECUARIA_TODO, loggedAgent, useTestDatabase, usuarioCon } from './helpers.js';
import { ENCABEZADO, HOJA_EJ, crearPlanilla, fila } from './planilla-fixture.js';

useTestDatabase();

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function preparar() {
  await seedPecuaria(prisma, () => {});
  await usuarioCon(ALICE, { permisos: PECUARIA_TODO, todas: true });
  return loggedAgent(ALICE);
}

// Sube una planilla (campo ficticio EJ) y devuelve la respuesta. `hojas` es
// el contenido, o un archivo ya armado (para subir el mismo archivo dos veces).
async function subir(agent, hojas, { archivo = 'cargas.xlsx', hoja, esperado = 201 } = {}) {
  const query = new URLSearchParams({ archivo, campo: 'EJ', ...(hoja && { hoja }) });
  return agent
    .post(`/api/pecuaria/importaciones/planilla?${query}`)
    .set('Content-Type', XLSX)
    .send(Buffer.isBuffer(hojas) ? hojas : await crearPlanilla(hojas))
    .expect(esperado);
}

const potrerosDe = async (agent, sigla = 'EJ') => {
  const campos = (await agent.get('/api/pecuaria/campos')).body;
  const campo = campos.find((c) => c.sigla === sigla);
  return (await agent.get(`/api/pecuaria/campos/${campo.id}/potreros`).expect(200)).body;
};

describe('vista previa de la planilla', () => {
  it('sin sesión responde 401', async () => {
    await request(app).post('/api/pecuaria/importaciones/planilla').set('Content-Type', XLSX).send(Buffer.from('x')).expect(401);
  });

  it('muestra lo que se va a cargar, con los catálogos ya resueltos, sin guardar nada todavía', async () => {
    const agent = await preparar();
    const { body } = await subir(agent, { '13.11.2026': HOJA_EJ });

    expect(body).toMatchObject({
      estado: 'PENDIENTE',
      archivo: 'cargas.xlsx',
      hoja: '13.11.2026',
      fechaDatos: '2026-11-13',
      campo: { sigla: 'EJ', existe: false },
      resumen: { potreros: 6, potrerosNuevos: 6, cabezas: 420 },
      errores: [],
      puedeConfirmar: true,
      otrosCampos: { OT: 1 },
    });
    const p = Object.fromEntries(body.potreros.map((x) => [x.nombre, x]));
    expect(p['2.2/3/4'].uso.nombre).toBe('Festuca nueva');
    expect(p['2.2/3/4'].lineas[0]).toMatchObject({ categoria: 'Terneros chicos', categoriaTexto: 'Ternero chicos', cabezas: 80 });
    expect(p['P 7'].uso.nombre).toBe('Campo natural');
    expect(p['Pivot 9'].uso.nombre).toBe('Sin uso cargado');
    expect(body.resumen.porCategoria).toContainEqual({ categoria: 'Vacas', cabezas: 150 });

    expect(await prisma.campo.count()).toBe(0);
    expect(await prisma.versionStock.count()).toBe(0);
    expect((await agent.get(`/api/pecuaria/importaciones/${body.id}`).expect(200)).body.resumen.cabezas).toBe(420);
  });

  it('usos o categorías que no están en el catálogo son errores y no se puede confirmar', async () => {
    const agent = await preparar();
    const { body } = await subir(agent, {
      '13.11.2026': [ENCABEZADO, fila('EJ', 'Alfalfa', '1', 10, 'Toritos', 5, 300), fila('EJ', 'Alfalfa', '2', 10, null, 0, null)],
    });

    expect(body.puedeConfirmar).toBe(false);
    expect(body.errores).toEqual([
      expect.stringMatching(/uso de suelo "Alfalfa" \(potreros 1, 2\) no está en el catálogo/),
      expect.stringMatching(/categoría "Toritos" \(potrero 1\) no está en el catálogo/),
    ]);
    const res = await agent.post(`/api/pecuaria/importaciones/${body.id}/confirmar`).send({}).expect(400);
    expect(res.body.errors[0]).toMatch(/errores/);
  });

  it('rechaza un archivo vacío o que no es Excel', async () => {
    const agent = await preparar();
    const vacio = await agent.post('/api/pecuaria/importaciones/planilla').set('Content-Type', XLSX).send(Buffer.alloc(0)).expect(400);
    expect(vacio.body.errors).toEqual(['Elegí el archivo de la planilla']);
    const malo = await agent
      .post('/api/pecuaria/importaciones/planilla')
      .set('Content-Type', XLSX)
      .send(Buffer.from('no soy un excel'))
      .expect(400);
    expect(malo.body.errors[0]).toMatch(/no es una planilla de Excel/);
  });
});

describe('confirmar la importación', () => {
  it('crea el campo, los potreros, su uso y una versión de stock por potrero, y lo audita', async () => {
    const agent = await preparar();
    const { body: previa } = await subir(agent, { '13.11.2026': HOJA_EJ });

    const { body } = await agent
      .post(`/api/pecuaria/importaciones/${previa.id}/confirmar`)
      .send({ nombreCampo: 'Estancia Ejemplo' })
      .expect(200);
    expect(body).toMatchObject({ estado: 'CONFIRMADA', fecha: '2026-11-13', potrerosNuevos: 6, versiones: 6, cabezas: 420 });

    const campo = await prisma.campo.findUnique({ where: { sigla: 'EJ' } });
    expect(campo.nombre).toBe('Estancia Ejemplo');
    const potreros = Object.fromEntries((await potrerosDe(agent)).map((p) => [p.nombre, p]));
    expect(potreros['2.2/3/4']).toMatchObject({ hectareas: 120.25, hectareasAConfirmar: false });
    expect(potreros['2.2/3/4'].subdivisiones.map((s) => s.codigo)).toEqual(['2.2', '2.3', '2.4']);
    expect(potreros['2.2/3/4'].usoActual).toMatchObject({ nombre: 'Festuca nueva', desde: '2026-11-13' });
    expect(potreros['2.2/3/4'].stock).toMatchObject({ fecha: '2026-11-13', cabezas: 80 });
    expect(potreros['P 7']).toMatchObject({ hectareas: 1, hectareasAConfirmar: true });
    // Un potrero sin animales también tiene su versión (vacía).
    expect(potreros['Pivot 9'].stock).toMatchObject({ fecha: '2026-11-13', cabezas: 0 });

    const [fila] = await prisma.auditoria.findMany({ where: { accion: 'IMPORTACION_CONFIRMADA' } });
    expect(fila).toMatchObject({ entidad: 'importacion', entidadId: String(previa.id) });
    expect(fila.detalle).toMatchObject({ archivo: 'cargas.xlsx', hoja: '13.11.2026', cabezas: 420 });
  });

  it('la fecha del dato se puede cambiar, pero no puede ser futura', async () => {
    const agent = await preparar();
    const { body: previa } = await subir(agent, { '13.11.2026': HOJA_EJ });

    await agent.post(`/api/pecuaria/importaciones/${previa.id}/confirmar`).send({ fecha: '2999-01-01' }).expect(400);
    await agent.post(`/api/pecuaria/importaciones/${previa.id}/confirmar`).send({ fecha: '2026-11-10' }).expect(200);
    const versiones = await prisma.versionStock.findMany();
    expect(versiones.every((v) => v.fecha.toISOString().startsWith('2026-11-10'))).toBe(true);
  });

  it('no se confirma dos veces, ni después de descartar', async () => {
    const agent = await preparar();
    const { body: a } = await subir(agent, { '13.11.2026': HOJA_EJ });
    await agent.post(`/api/pecuaria/importaciones/${a.id}/confirmar`).send({}).expect(200);
    await agent.post(`/api/pecuaria/importaciones/${a.id}/confirmar`).send({}).expect(409);

    const { body: b } = await subir(agent, { '20.11.2026': HOJA_EJ }, { archivo: 'otra.xlsx' });
    const res = await agent.post(`/api/pecuaria/importaciones/${b.id}/descartar`).expect(200);
    expect(res.body.estado).toBe('DESCARTADA');
    await agent.post(`/api/pecuaria/importaciones/${b.id}/confirmar`).send({}).expect(409);
    expect(await prisma.auditoria.count({ where: { accion: 'IMPORTACION_DESCARTADA' } })).toBe(1);
  });

  it('avisa si esa hoja de ese mismo archivo ya se importó', async () => {
    const agent = await preparar();
    const archivo = await crearPlanilla({ '13.11.2026': HOJA_EJ });
    const { body: a } = await subir(agent, archivo);
    await agent.post(`/api/pecuaria/importaciones/${a.id}/confirmar`).send({}).expect(200);

    const { body: b } = await subir(agent, archivo);
    expect(b.puedeConfirmar).toBe(false);
    expect(b.errores).toEqual([expect.stringMatching(/Esta hoja de este archivo ya se importó/)]);
  });

  it('una planilla nueva agrega historial: mantiene las hectáreas corregidas en la app y cambia el uso', async () => {
    const agent = await preparar();
    const { body: a } = await subir(agent, { '3.11.2026': HOJA_EJ });
    await agent.post(`/api/pecuaria/importaciones/${a.id}/confirmar`).send({}).expect(200);
    const p7 = (await potrerosDe(agent)).find((p) => p.nombre === 'P 7');
    await agent.patch(`/api/pecuaria/potreros/${p7.id}`).send({ hectareas: 85, hectareasAConfirmar: false }).expect(200);

    const nueva = HOJA_EJ.map((f) => (f[2] === '1.1' ? fila('EJ', 'Sorgo', '1.1', 50.5, 'Terneros', 60, 210) : f));
    const { body: b } = await subir(agent, { '13.11.2026': nueva }, { archivo: 'cargas-13.xlsx' });
    expect(b.resumen.potrerosNuevos).toBe(0);
    expect(b.advertencias).toContainEqual(expect.stringMatching(/P 7: la planilla dice 1 ha, en la app hay 85 ha: queda la de la app/));
    await agent.post(`/api/pecuaria/importaciones/${b.id}/confirmar`).send({}).expect(200);

    const potreros = Object.fromEntries((await potrerosDe(agent)).map((p) => [p.nombre, p]));
    expect(potreros['P 7']).toMatchObject({ hectareas: 85, hectareasAConfirmar: false });
    expect(potreros['1.1'].usoActual).toMatchObject({ nombre: 'Sorgo', desde: '2026-11-13' });
    expect(potreros['1.1'].stock).toMatchObject({ fecha: '2026-11-13', cabezas: 60 });

    const usos = await prisma.potreroUso.findMany({ where: { potreroId: potreros['1.1'].id }, orderBy: { desde: 'asc' } });
    expect(usos.map((u) => [u.desde.toISOString().slice(0, 10), u.hasta?.toISOString().slice(0, 10) ?? null])).toEqual([
      ['2026-11-03', '2026-11-13'],
      ['2026-11-13', null],
    ]);
    expect(await prisma.versionStock.count({ where: { potreroId: potreros['1.1'].id } })).toBe(2);
  });

  it('cada fila es un lote: la planilla siguiente usa el mismo lote, y cierra los que ya no trae', async () => {
    const agent = await preparar();
    const { body: a } = await subir(agent, { '3.11.2026': HOJA_EJ });
    await agent.post(`/api/pecuaria/importaciones/${a.id}/confirmar`).send({}).expect(200);

    const lotes = await prisma.lote.findMany({ include: { potrero: true }, orderBy: { id: 'asc' } });
    expect(lotes.map((l) => l.nombre)).toEqual(['1.1 · Terneros', '2.2/3/4 · Terneros chicos', 'P 7 · Vacas', 'P 8 · Vacas paridas']);
    const lote11 = lotes[0];

    // En la planilla nueva, el 1.1 sigue con Terneros y el P 7 pasa de Vacas a Vacas CUT.
    const nueva = HOJA_EJ.map((f) => (f[2] === 'P 7' ? fila('EJ', 'CN', 'P 7', 1, 'Vacas CUT', 150, 450) : f));
    const { body: b } = await subir(agent, { '13.11.2026': nueva }, { archivo: 'otra.xlsx' });
    await agent.post(`/api/pecuaria/importaciones/${b.id}/confirmar`).send({}).expect(200);

    const versiones11 = await prisma.versionStockLinea.findMany({ where: { version: { potreroId: lote11.potreroId } } });
    expect(new Set(versiones11.map((l) => l.loteId))).toEqual(new Set([lote11.id]));
    const p7 = await prisma.lote.findMany({ where: { potrero: { nombre: 'P 7' } }, orderBy: { id: 'asc' } });
    expect(p7.map((l) => [l.nombre, l.activo])).toEqual([
      ['P 7 · Vacas', false],
      ['P 7 · Vacas CUT', true],
    ]);
  });

  it('responde 404 para importaciones que no existen', async () => {
    const agent = await preparar();
    await agent.get('/api/pecuaria/importaciones/9999').expect(404);
    await agent.post('/api/pecuaria/importaciones/9999/confirmar').send({}).expect(404);
  });
});
