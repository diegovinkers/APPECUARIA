// La importación de INAC y la API de precios (docs/PRECIOS_INAC.md), con la
// web de INAC simulada (fetch) y Claude simulado. Nada sale a internet.
import { readFile } from 'node:fs/promises';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/app.js';
import { prisma } from '../src/db.js';
import { INAC } from '../src/pecuaria/precios.inac.js';
import * as servicio from '../src/pecuaria/precios.service.js';
import { PECUARIA_TODO, loggedAgent, useTestDatabase, usuarioCon } from './helpers.js';
import { VALORES_BASE, crearSerie, hojasInac } from './precios-fixture.js';

useTestDatabase();

const TOKEN = 'token-de-prueba-de-precios-0123456789abcdef';
const JEFE = { usuario: 'jefe.precios', nombre: 'Jefe Precios', password: 'jefe-password' };
const MIRADOR = { usuario: 'mirador.precios', nombre: 'Mirador Precios', password: 'mirador-password' };
const REAL = new URL('./fixtures/inac/serie-semanal-2026-11-21.xlsx', import.meta.url);
const LENTO = { timeout: 300_000 };

const S1 = { desde: '2026-11-01', hasta: '2026-11-07', valores: VALORES_BASE };
const S2 = { desde: '2026-11-08', hasta: '2026-11-14', valores: VALORES_BASE };
const S3 = (valores = VALORES_BASE) => ({ desde: '2026-11-15', hasta: '2026-11-21', valores });
const serie = (semanas, cambiar) => {
  const hojas = hojasInac(semanas);
  cambiar?.(hojas);
  return crearSerie(hojas);
};

const PAGINA = `<html><body>
  <a href="${INAC.EXCEL}" class="text-decoration-none"><h5 class="list-title">Serie semanal precios de hacienda</h5></a>
</body></html>`;

// La web de INAC de mentira: lo que no se le da contesta 404.
function webInac({ pagina = PAGINA, excel = null, pdf = null } = {}) {
  return vi.fn(async (url) => {
    const u = String(url);
    if (u === INAC.PAGINA && pagina != null) return new Response(pagina);
    if (u === INAC.EXCEL && excel) return new Response(excel);
    if (u === INAC.PDF && pdf) return new Response(pdf);
    return new Response('no encontrado', { status: 404 });
  });
}
const claudeQueContesta = (parsed) => ({ messages: { parse: vi.fn(async () => ({ stop_reason: 'end_turn', parsed_output: parsed })) } });

let restaurar;
const usar = (deps) => {
  restaurar?.();
  restaurar = servicio._usarDependencias({ claude: () => null, ...deps });
};
afterEach(async () => {
  await servicio._enSegundoPlano;
  restaurar?.();
  restaurar = null;
});

const conToken = (token = TOKEN) => request(app).post('/api/pecuaria/precios/actualizar').set('Authorization', `Bearer ${token}`);
const importar = async (excel, extra = {}) => {
  usar({ fetch: webInac({ excel, ...extra }) });
  const { body } = await conToken().expect(200);
  return body;
};
const filas = (where = {}) => prisma.precioMercado.count({ where });
const auditoria = (accion) => prisma.auditoria.findMany({ where: { accion }, orderBy: { id: 'asc' } });

let jefe;
let mirador;
beforeEach(async () => {
  await usuarioCon(JEFE, { permisos: PECUARIA_TODO, todas: true });
  await usuarioCon(MIRADOR, { permisos: ['pecuaria:VER'], todas: true });
  jefe = await loggedAgent(JEFE);
  mirador = await loggedAgent(MIRADOR);
});

describe('POST /precios/actualizar con el token (GitHub Actions)', () => {
  it('con el token: baja el Excel, guarda y publica las semanas', async () => {
    const excel = await serie([S1, S2]);
    const fetch = webInac({ excel });
    usar({ fetch });
    const { body } = await conToken().expect(200);
    expect(body).toMatchObject({ estado: 'OK', origen: 'EXCEL', disparadoPor: 'PROGRAMADO', semanaDesde: '2026-11-08', semanaHasta: '2026-11-14', usuario: null });
    expect(body.detalle).toMatchObject({ semanasNuevas: 2, ultima: { desde: '2026-11-08', hasta: '2026-11-14' }, url: INAC.EXCEL, errores: [] });
    expect(await filas({ publicado: true })).toBe(34);

    // Una sola descarga del Excel, con la identificación de la app.
    const urls = fetch.mock.calls.map(([u]) => u);
    expect(urls).toEqual([INAC.PAGINA, INAC.EXCEL]);
    expect(fetch.mock.calls[1][1].headers['User-Agent']).toBe('SAPSA-app (uso interno)');

    const [a] = await auditoria('PRECIOS_IMPORTADOS');
    expect(a).toMatchObject({ usuarioId: null, entidad: 'importacion_precio', entidadId: String(body.id) });
    expect(a.detalle).toMatchObject({ estado: 'OK', origen: 'EXCEL', semana: '2026-11-08', semanasNuevas: 2, disparadoPor: 'PROGRAMADO' });
  });

  it('con otro token: 401 y no corre nada', async () => {
    usar({ fetch: webInac({ excel: await serie([S1]) }) });
    const { body } = await conToken('otro-token-cualquiera-que-no-es-el-bueno').expect(401);
    expect(body.errors).toEqual(['Token inválido']);
    await request(app).post('/api/pecuaria/precios/actualizar').set('Authorization', 'Basic abc').expect(401);
    expect(await prisma.importacionPrecio.count()).toBe(0);
  });

  it('sin token ni sesión: 401; el token no abre ninguna otra ruta', async () => {
    await request(app).post('/api/pecuaria/precios/actualizar').expect(401);
    await request(app).get('/api/pecuaria/precios/ultimos').set('Authorization', `Bearer ${TOKEN}`).expect(401);
    await request(app).post('/api/pecuaria/precios').set('Authorization', `Bearer ${TOKEN}`).send({}).expect(401);
  });
});

describe('POST /precios/actualizar desde la pantalla (botón)', () => {
  it('con CREAR: corre y queda a su nombre; con solo VER: 403', async () => {
    usar({ fetch: webInac({ excel: await serie([S1]) }) });
    await mirador.post('/api/pecuaria/precios/actualizar').expect(403);
    const { body } = await jefe.post('/api/pecuaria/precios/actualizar').expect(200);
    expect(body).toMatchObject({ estado: 'OK', disparadoPor: 'BOTON', usuario: { nombre: 'Jefe Precios' } });
  });
});

describe('idempotencia', () => {
  it('el mismo archivo: SIN_CAMBIOS sin leerlo; otro archivo sin semanas nuevas: también', async () => {
    const excel = await serie([S1, S2]);
    await importar(excel);
    const segunda = await importar(excel);
    expect(segunda).toMatchObject({ estado: 'SIN_CAMBIOS', semanaDesde: '2026-11-08' });
    expect(segunda.detalle.semanasNuevas).toBeUndefined();

    // Otro archivo (una fila de más al final), con las mismas semanas.
    const tercera = await importar(await serie([S1, S2], (hojas) => { hojas.NOVILLO.filasExtra = [[null, 'nota al pie']]; }));
    expect(tercera).toMatchObject({ estado: 'SIN_CAMBIOS' });
    expect(tercera.detalle.semanasNuevas).toBe(0);
    expect(await filas()).toBe(34);
  });

  it('una semana nueva: solo esa', async () => {
    await importar(await serie([S1, S2]));
    const nueva = await importar(await serie([S1, S2, S3()]));
    expect(nueva).toMatchObject({ estado: 'OK', semanaDesde: '2026-11-15' });
    expect(nueva.detalle.semanasNuevas).toBe(1);
    expect(await filas()).toBe(51);
  });
});

describe('en revisión y aprobar', () => {
  it('una variación grande: se guarda sin publicar; al aprobar se publica', async () => {
    await importar(await serie([S1, S2]));
    const revisar = await importar(await serie([S1, S2, S3({ ...VALORES_BASE, VACA_4TA: 6.84 })]));
    expect(revisar.estado).toBe('EN_REVISION');
    expect(revisar.detalle.marcas).toEqual([expect.objectContaining({ indicador: 'VACA_4TA', motivo: 'VARIACION', variacion: 20 })]);
    expect(await filas({ publicado: false })).toBe(17);

    // La pantalla sigue mostrando la semana anterior, y avisa la revisión.
    const antes = (await jefe.get('/api/pecuaria/precios/ultimos').expect(200)).body;
    expect(antes.semana).toEqual({ desde: '2026-11-08', hasta: '2026-11-14' });
    expect(antes.ultimaImportacion).toMatchObject({ id: revisar.id, estado: 'EN_REVISION' });

    await mirador.post(`/api/pecuaria/precios/importaciones/${revisar.id}/aprobar`).expect(403);
    const { body: aprobada } = await jefe.post(`/api/pecuaria/precios/importaciones/${revisar.id}/aprobar`).expect(200);
    expect(aprobada).toMatchObject({ estado: 'OK', aprobadaPor: { nombre: 'Jefe Precios' } });
    expect(await filas({ publicado: false })).toBe(0);

    const despues = (await jefe.get('/api/pecuaria/precios/ultimos').expect(200)).body;
    expect(despues.semana).toEqual({ desde: '2026-11-15', hasta: '2026-11-21' });
    expect(despues.precios.find((p) => p.indicador === 'VACA_4TA')).toMatchObject({ valor: 6.84, anterior: 5.7, variacion: 20 });

    await jefe.post(`/api/pecuaria/precios/importaciones/${revisar.id}/aprobar`).expect(409);
    await jefe.post('/api/pecuaria/precios/importaciones/9999/aprobar').expect(404);
    const [a] = await auditoria('PRECIOS_APROBADOS');
    expect(a.detalle).toMatchObject({ semana: '2026-11-15', precios: 17 });
  });
});

describe('cuando el Excel no sirve', () => {
  const sinVaca = (hojas) => { delete hojas.VACA; };

  it('sin ANTHROPIC_API_KEY: ERROR con un mensaje claro y no se guarda nada', async () => {
    const r = await importar(await serie([S1, S2], sinVaca));
    expect(r.estado).toBe('ERROR');
    expect(r.detalle.errores).toEqual([
      'El Excel no se pudo leer: Falta la hoja VACA (Vaca en pie, Vaca en 4ta balanza, Vaca 45 días a levantar). No hay ANTHROPIC_API_KEY: no se puede usar Claude de respaldo.',
    ]);
    expect(await filas()).toBe(0);
  });

  it('con Claude: le manda el Excel en CSV y la semana queda en revisión', async () => {
    const claude = claudeQueContesta({ semanaDesde: '2026-11-15', semanaHasta: '2026-11-21', precios: Object.entries(VALORES_BASE).map(([indicador, valor]) => ({ indicador, valor })) });
    usar({ fetch: webInac({ excel: await serie([S1, S2], sinVaca) }), claude: () => claude });
    const { body } = await conToken().expect(200);
    expect(body).toMatchObject({ estado: 'EN_REVISION', origen: 'CLAUDE', semanaDesde: '2026-11-15' });
    expect(body.detalle.leidoCon).toBe('Claude, con el Excel en CSV');
    expect(body.detalle.marcas).toEqual([expect.objectContaining({ motivo: 'CLAUDE' })]);
    expect(body.detalle.marcas[0].texto).toMatch(/^Leído con Claude \(con el Excel en CSV\) porque el Excel no se pudo leer: Falta la hoja VACA/);
    expect(claude.messages.parse.mock.calls[0][0].messages[0].content[0].text).toContain('### Hoja NOVILLO');
    expect(await filas({ publicado: false, origen: 'CLAUDE' })).toBe(17);
  });

  it('si el Excel no baja: Claude con el PDF', async () => {
    const claude = claudeQueContesta({ semanaDesde: '2026-11-15', semanaHasta: '2026-11-21', precios: [{ indicador: 'NOVILLO_4TA', valor: 6.1 }, { indicador: 'VACA_4TA', valor: 5.7 }, { indicador: 'VAQUILLONA_4TA', valor: 5.98 }] });
    const pdf = Buffer.from('%PDF-1.4 informe de prueba');
    usar({ fetch: webInac({ pdf }), claude: () => claude });
    const { body } = await conToken().expect(200);
    expect(body).toMatchObject({ estado: 'EN_REVISION', origen: 'CLAUDE' });
    expect(body.detalle.leidoCon).toBe('Claude, con el PDF del informe');
    expect(body.detalle.respaldo).toMatch(/^No pude bajar el Excel: .*404/);
    expect(claude.messages.parse.mock.calls[0][0].messages[0].content[0]).toMatchObject({ type: 'document', source: { data: pdf.toString('base64') } });
    expect(await filas()).toBe(3);
  });

  it('si Claude no trae los obligatorios: ERROR', async () => {
    const claude = claudeQueContesta({ semanaDesde: '2026-11-15', semanaHasta: '2026-11-21', precios: [{ indicador: 'NOVILLO_PIE', valor: 3.4 }] });
    usar({ fetch: webInac({ pdf: Buffer.from('%PDF-1.4') }), claude: () => claude });
    const { body } = await conToken().expect(200);
    expect(body.estado).toBe('ERROR');
    expect(body.detalle.errores).toContain('Falta el precio de Novillo en 4ta balanza.');
    expect(await filas()).toBe(0);
  });

  it('la página sin el enlace: usa la dirección conocida y lo avisa', async () => {
    const r = await importar(await serie([S1]), { pagina: '<html>nada</html>' });
    expect(r.estado).toBe('OK');
    expect(r.detalle.avisos).toContain('No encontré el enlace del Excel en la página de INAC; usé la dirección conocida.');
  });
});

describe('dos corridas a la vez', () => {
  it('con una EN_CURSO: 409; una EN_CURSO vieja se da por cortada', async () => {
    usar({ fetch: webInac({ excel: await serie([S1]) }) });
    const enCurso = await prisma.importacionPrecio.create({ data: { fuente: 'INAC', disparadoPor: 'BOTON' } });
    const { body } = await conToken().expect(409);
    expect(body).toEqual({ errors: ['Ya hay una actualización de precios en curso. Probá en unos minutos.'], code: 'EN_CURSO' });

    await prisma.importacionPrecio.update({ where: { id: enCurso.id }, data: { inicio: new Date(Date.now() - 20 * 60_000) } });
    const { body: corrida } = await conToken().expect(200);
    expect(corrida.estado).toBe('OK');
    const vieja = await prisma.importacionPrecio.findUnique({ where: { id: enCurso.id } });
    expect(vieja.estado).toBe('ERROR');
    expect(vieja.detalle.errores).toEqual(['Se cortó sin terminar.']);
  });
});

describe('corregir y cargar a mano', () => {
  it('corregir: con nota obligatoria, queda marcado y auditado', async () => {
    await importar(await serie([S1, S2]));
    const precio = await prisma.precioMercado.findFirst({ where: { indicador: 'NOVILLO_PIE', semanaDesde: new Date('2026-11-08') } });
    const ruta = `/api/pecuaria/precios/${precio.id}`;
    expect((await jefe.patch(ruta).send({ valor: 3.5 }).expect(400)).body.errors).toEqual(['Escribí por qué lo corregís']);
    await mirador.patch(ruta).send({ valor: 3.5, nota: 'Dato del remate' }).expect(403);
    const { body } = await jefe.patch(ruta).send({ valor: 3.5, nota: 'INAC lo corrigió el jueves' }).expect(200);
    expect(body).toMatchObject({ valor: 3.5, corregido: true, nota: 'INAC lo corrigió el jueves' });

    const ultimos = (await jefe.get('/api/pecuaria/precios/ultimos').expect(200)).body;
    expect(ultimos.precios.find((p) => p.indicador === 'NOVILLO_PIE')).toMatchObject({ valor: 3.5, corregido: true, anterior: 3.4 });
    const [a] = await auditoria('PRECIO_CORREGIDO');
    expect(a.detalle).toEqual({ indicador: 'NOVILLO_PIE', semana: '2026-11-08', antes: { valor: 3.4, nota: null }, despues: { valor: 3.5, nota: 'INAC lo corrigió el jueves' } });
    await jefe.patch('/api/pecuaria/precios/999999').send({ valor: 3.5, nota: 'nada' }).expect(404);

    // Una importación nueva no pisa lo corregido.
    await importar(await serie([S1, S2, S3()]));
    expect(Number((await prisma.precioMercado.findUnique({ where: { id: precio.id } })).valor)).toBe(3.5);
  });

  it('cargar a mano: semana de domingo, no repetida; manda sobre INAC', async () => {
    await importar(await serie([S1, S2]));
    const cargar = (datos) => jefe.post('/api/pecuaria/precios').send({ indicador: 'NOVILLO_PIE', semanaDesde: '2026-11-08', valor: 3.6, ...datos });
    expect((await cargar({ semanaDesde: '2026-11-09' }).expect(400)).body.errors).toEqual(['La semana tiene que empezar un domingo (como las de INAC).']);
    expect((await cargar({ semanaDesde: '2099-01-04' }).expect(400)).body.errors).toEqual(['La semana todavía no empezó.']);
    expect((await cargar({ indicador: 'TERNERO_PIE' }).expect(400)).body.errors).toEqual(['Ese indicador no existe']);
    await mirador.post('/api/pecuaria/precios').send({ indicador: 'NOVILLO_PIE', semanaDesde: '2026-11-08', valor: 3.6 }).expect(403);

    const { body } = await cargar({ nota: 'Remate de la semana' }).expect(201);
    expect(body).toMatchObject({ fuente: 'MANUAL', origen: 'MANUAL', semanaHasta: '2026-11-14', valor: 3.6, unidad: 'USD_KG_PIE' });
    await cargar().expect(409);

    const ultimos = (await jefe.get('/api/pecuaria/precios/ultimos').expect(200)).body;
    expect(ultimos.precios.find((p) => p.indicador === 'NOVILLO_PIE')).toMatchObject({ fuente: 'MANUAL', valor: 3.6 });
    expect(ultimos.fuente).toBe('INAC');
    expect((await auditoria('PRECIO_CARGADO'))[0].detalle).toEqual({ indicador: 'NOVILLO_PIE', semana: '2026-11-08', valor: 3.6, nota: 'Remate de la semana' });
  });
});

describe('historial y lista de importaciones', () => {
  it('historial de un indicador, sin lo que está en revisión', async () => {
    await importar(await serie([S1, S2]));
    await importar(await serie([S1, S2, S3({ ...VALORES_BASE, NOVILLO_PIE: 5 })]));
    const { body } = await mirador.get('/api/pecuaria/precios?indicador=NOVILLO_PIE').expect(200);
    expect(body.map((p) => [p.semanaDesde, p.valor])).toEqual([['2026-11-01', 3.4], ['2026-11-08', 3.4]]);
    expect((await mirador.get('/api/pecuaria/precios?indicador=NADA').expect(400)).body.errors).toEqual(['Ese indicador no existe']);
    expect((await mirador.get('/api/pecuaria/precios?desde=2026-11-08&hasta=2026-11-08').expect(200)).body).toHaveLength(17);

    const { body: lista } = await mirador.get('/api/pecuaria/precios/importaciones').expect(200);
    expect(lista.map((i) => i.estado)).toEqual(['EN_REVISION', 'OK']);
  });
});

describe('al abrir la pantalla', () => {
  it('sin ninguna corrida que haya andado: dispara una en segundo plano; después no', async () => {
    usar({ fetch: webInac({ excel: await serie([S1]) }) });
    const primera = (await mirador.get('/api/pecuaria/precios/ultimos').expect(200)).body;
    expect(primera).toMatchObject({ actualizando: true, semana: null, precios: [] });
    await servicio._enSegundoPlano;
    const imp = await prisma.importacionPrecio.findFirst();
    expect(imp).toMatchObject({ estado: 'OK', disparadoPor: 'AL_ABRIR' });

    const segunda = (await mirador.get('/api/pecuaria/precios/ultimos').expect(200)).body;
    expect(segunda).toMatchObject({ actualizando: false, semana: { desde: '2026-11-01' } });
  });

  it('más de 8 días desde la última que anduvo: sí; con una corrida hace menos de 6 horas: no', async () => {
    const hace = (ms) => new Date(Date.now() - ms);
    const DIA = 86_400_000;
    await prisma.importacionPrecio.create({ data: { fuente: 'INAC', disparadoPor: 'PROGRAMADO', estado: 'OK', inicio: hace(9 * DIA), fin: hace(9 * DIA) } });
    expect(await servicio.debeActualizarAlAbrir()).toBe(true);
    await prisma.importacionPrecio.create({ data: { fuente: 'INAC', disparadoPor: 'AL_ABRIR', estado: 'ERROR', inicio: hace(2 * 3_600_000), fin: hace(2 * 3_600_000) } });
    expect(await servicio.debeActualizarAlAbrir()).toBe(false);
    expect(await servicio.debeActualizarAlAbrir(new Date(Date.now() + 5 * 3_600_000))).toBe(true);
  });
});

describe('la primera vez, con el Excel real', () => {
  it('entra todo el histórico y la última semana es la del 15/11 al 21/11/2026', LENTO, async () => {
    const r = await importar(await readFile(REAL));
    expect(r).toMatchObject({ estado: 'OK', origen: 'EXCEL', semanaDesde: '2026-11-15' });
    expect(r.detalle.semanasNuevas).toBeGreaterThan(1390);
    expect(await filas()).toBeGreaterThan(15_000);

    const { body } = await mirador.get('/api/pecuaria/precios/ultimos').expect(200);
    expect(body.semana).toEqual({ desde: '2026-11-15', hasta: '2026-11-21' });
    expect(body.anterior).toEqual({ desde: '2026-11-08', hasta: '2026-11-14' });
    expect(body.precios).toHaveLength(17);
    expect(body.precios.find((p) => p.indicador === 'NOVILLO_PIE')).toMatchObject({ valor: 3.412, anterior: 3.449, variacion: -1.1, grupo: 'Novillo', fuente: 'INAC', origen: 'EXCEL' });
  });
});
