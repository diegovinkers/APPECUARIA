// Eventos (docs/superpowers/specs/2026-11-20-eventos-design.md): pesada,
// recuento, sanidad, reproducción y manejo. Uno por lote, con atajos (la
// estancia, un potrero, una categoría), el sexo del tipo, el efecto de la
// pesada y del recuento en el stock, anular, el alcance, la lista con el
// filtro "Todo / Movimientos / Eventos", el feedlot con pesada y el destete.
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { lineaDelLote, textoDatos } from '../src/pecuaria/eventos.datos.js';
import { analisisFeedlot, pesoReal } from '../src/pecuaria/feedlot.service.js';
import { BOB, loggedAgent, useTestDatabase, usuarioCon } from './helpers.js';
import { auditoria, dia, hoy, prepararCampo } from './pecuaria-helpers.js';

useTestDatabase();

const API = '/api/pecuaria';

// Campo ficticio:
//   P1  100 ha: lote A = 100 Terneros de 250 kg · lote V = 80 Vacas de 420 kg
//   P2   50 ha: lote B =  60 Terneras de 200 kg
//   P3   40 ha: lote N =  30 Novillos sin peso
async function preparar() {
  const base = await prepararCampo();
  const p1 = await base.potrero('P1', { hectareas: 100, usoNombre: 'Campo natural', lotes: [['Lote A', 'Terneros', 100, 250], ['Lote V', 'Vacas', 80, 420]] });
  const p2 = await base.potrero('P2', { hectareas: 50, usoNombre: 'Raygras', lotes: [['Lote B', 'Terneras', 60, 200]] });
  const p3 = await base.potrero('P3', { hectareas: 40, usoNombre: 'Raygras', lotes: [['Lote N', 'Novillos', 30, null]] });
  const tipos = Object.fromEntries((await base.agent.get(`${API}/tipos-movimiento`).expect(200)).body.map((t) => [t.clave, t]));
  return {
    ...base,
    tipos,
    P1: p1.potrero,
    P2: p2.potrero,
    P3: p3.potrero,
    A: p1.lote['Lote A'],
    V: p1.lote['Lote V'],
    B: p2.lote['Lote B'],
    N: p3.lote['Lote N'],
  };
}

const anotar = async (agent, body, esperado = 201) => (await agent.post(`${API}/eventos-registro`).send(body).expect(esperado)).body;
const previa = async (agent, body, esperado = 200) => (await agent.post(`${API}/eventos-registro/vista-previa`).send(body).expect(esperado)).body;
const lineas = async (agent, potrero) =>
  (await agent.get(`${API}/potreros/${potrero.id}`).expect(200)).body.stock?.lineas.map((l) => [l.lote, l.cabezas, l.pesoPromedioKg]) ?? [];
const versiones = (potrero) => prisma.versionStock.count({ where: { potreroId: potrero.id } });

describe('datos por tipo (puro)', () => {
  const lote = { nombre: 'A', cabezas: 100, pesoPromedioKg: 250 };

  it('pesada: pide el peso; por defecto se pesaron todas; una muestra es parte del lote', () => {
    expect(lineaDelLote('PESADA', {}, lote).error).toMatch(/peso promedio/);
    expect(lineaDelLote('PESADA', { pesoPromedioKg: '262,5' }, lote)).toMatchObject({
      cabezas: 100,
      parte: false,
      datos: { pesoPromedioKg: 262.5, pesoAnteriorKg: 250, pesadas: 100 },
      cambia: { pesoPromedioKg: 262.5 },
    });
    expect(lineaDelLote('PESADA', { pesoPromedioKg: 260, pesadas: 20 }, lote)).toMatchObject({ cabezas: 20, parte: true });
    expect(lineaDelLote('PESADA', { pesoPromedioKg: 260, pesadas: 101 }, lote).error).toMatch(/tiene 100 cabezas/);
  });

  it('recuento: sin diferencia no cambia nada; con diferencia pide motivo', () => {
    expect(lineaDelLote('RECUENTO', {}, lote)).toMatchObject({ cabezas: 100, cambia: null, datos: { diferencia: 0 } });
    expect(lineaDelLote('RECUENTO', { contadas: 96 }, lote).error).toMatch(/motivo/);
    expect(lineaDelLote('RECUENTO', { contadas: 96, motivo: 'Se perdieron' }, lote)).toMatchObject({ cabezas: 96, cambia: { cabezas: 96 } });
  });

  it('ecografía: preñadas + vacías, como máximo las del lote', () => {
    expect(lineaDelLote('ECOGRAFIA', { prenadas: 70, vacias: 30 }, lote)).toMatchObject({ cabezas: 100, parte: false, datos: { prenadas: 70, vacias: 30 } });
    expect(lineaDelLote('ECOGRAFIA', { prenadas: 70, vacias: 31 }, lote).error).toMatch(/suman 101/);
    expect(lineaDelLote('ECOGRAFIA', {}, lote).error).toMatch(/preñadas y cuántas vacías/);
  });

  it('los demás: cabezas, por defecto las del lote', () => {
    expect(lineaDelLote('INSEMINACION', {}, lote)).toMatchObject({ cabezas: 100, parte: false });
    expect(lineaDelLote('INSEMINACION', { cabezas: 40 }, lote)).toMatchObject({ cabezas: 40, parte: true });
    expect(lineaDelLote('INSEMINACION', { cabezas: 0 }, lote).error).toMatch(/al menos 1/);
  });

  it('el texto corto de cada uno', () => {
    expect(textoDatos('PESADA', { pesoPromedioKg: 262, pesoAnteriorKg: 250, pesadas: 100, cabezasLote: 100 })).toBe('262 kg (antes 250)');
    expect(textoDatos('RECUENTO', { anteriores: 120, contadas: 116, diferencia: -4, motivo: 'abigeato' })).toBe('había 120, se contaron 116 (abigeato)');
    expect(textoDatos('ECOGRAFIA', { prenadas: 45, vacias: 5 })).toBe('45 preñadas · 5 vacías');
    expect(textoDatos('VACUNA_AFTOSA', { producto: 'Bivalente' })).toBe('Producto: Bivalente');
    expect(textoDatos('ALIMENTACION', { racion: 'Silo', kgPorCabezaDia: 2.5 })).toBe('Silo · 2,5 kg/cab/día');
  });
});

describe('cada tipo de evento', () => {
  it('se anota cada tipo del catálogo con sus datos, sin tocar el stock (salvo la pesada)', async () => {
    const { agent, tipos, A, V, B, P1 } = await preparar();
    const casos = [
      ['VACUNA_AFTOSA', { datos: { producto: 'Bivalente' }, lineas: [{ loteId: A.id }] }, { producto: 'Bivalente' }],
      ['VACUNA_CARBUNCLO', { lineas: [{ loteId: A.id }] }, { producto: null }],
      ['TRATAMIENTO', { datos: { producto: 'Ivermectina' }, lineas: [{ loteId: A.id, cabezas: 10 }] }, { producto: 'Ivermectina' }],
      ['ECOGRAFIA', { lineas: [{ loteId: V.id, prenadas: 60, vacias: 20 }] }, { prenadas: 60, vacias: 20 }],
      ['INSEMINACION', { lineas: [{ loteId: B.id, cabezas: 30 }] }, {}],
      ['ENTORE', { lineas: [{ loteId: V.id }] }, {}],
      ['ABORTO', { lineas: [{ loteId: V.id, cabezas: 2 }] }, {}],
      ['CASTRACION', { lineas: [{ loteId: A.id, cabezas: 50 }] }, {}],
      ['IDENTIFICACION', { lineas: [{ loteId: A.id }] }, {}],
      ['ALIMENTACION', { datos: { racion: 'Silo de maíz', kgPorCabezaDia: '3,5' }, lineas: [{ loteId: A.id }] }, { racion: 'Silo de maíz', kgPorCabezaDia: 3.5 }],
    ];
    for (const [clave, body, datos] of casos) {
      const res = await anotar(agent, { tipoId: tipos[clave].id, ...body });
      expect(res.eventos, clave).toHaveLength(1);
      expect(res.eventos[0], clave).toMatchObject({ tipo: { clave }, datos, cambiaStock: false, anulado: false, puedeAnular: true });
    }
    // Ninguno de estos tocó el stock: P1 sigue con su versión de la planilla.
    expect(await versiones(P1)).toBe(1);
    expect(await prisma.eventoRegistro.count()).toBe(casos.length);
    // Diez cargas seguidas: con toda la suite corriendo, pasa los 5 s por defecto.
  }, 30_000);

  it('un tipo que no es un evento, o desactivado, no se anota', async () => {
    const { agent, tipos, A } = await preparar();
    expect((await anotar(agent, { tipoId: tipos.MUERTE.id, lineas: [{ loteId: A.id }] }, 400)).errors[0]).toMatch(/no es un evento/);
    await prisma.tipoMovimiento.update({ where: { id: tipos.ENTORE.id }, data: { activo: false } });
    expect((await anotar(agent, { tipoId: tipos.ENTORE.id, lineas: [{ loteId: A.id }] }, 400)).errors[0]).toMatch(/desactivado/);
  });

  it('un tipo nuevo de Configuración (efecto REGISTRO) se anota con las cabezas', async () => {
    const { agent, A } = await preparar();
    const tipo = (await agent.post(`${API}/tipos-movimiento`).send({ nombre: 'Baño', efecto: 'REGISTRO', niveles: ['LOTE', 'PARTE_LOTE'] }).expect(201)).body;
    const res = await anotar(agent, { tipoId: tipo.id, lineas: [{ loteId: A.id, cabezas: 40 }] });
    expect(res.eventos[0]).toMatchObject({ tipo: { nombre: 'Baño' }, cabezas: 40, nivel: 'PARTE_LOTE' });
  });

  it('la fecha no puede ser futura', async () => {
    const { agent, tipos, A } = await preparar();
    await anotar(agent, { tipoId: tipos.ENTORE.id, fecha: '2999-01-01', lineas: [{ loteId: A.id }] }, 400);
  });
});

describe('a quién: niveles, varios a la vez y sexo', () => {
  it('la estancia entera: un registro por lote, todos con el mismo grupo, y la oración de la vista previa', async () => {
    const { agent, tipos, campo, A, V, B, N } = await preparar();
    const body = { tipoId: tipos.VACUNA_AFTOSA.id, nivel: 'CAMPO', campoId: campo.id, fecha: hoy(), datos: { producto: 'Bivalente' } };
    const vista = await previa(agent, body);
    const [a, m, d] = hoy().split('-');
    expect(vista.oracion).toBe(`Vas a anotar Vacuna aftosa en toda la estancia Estancia Ejemplo (4 lotes), 270 cabezas, el ${d}/${m}/${a}`);
    expect(vista).toMatchObject({ lotes: 4, cabezas: 270, cambiaStock: false, avisos: [] });

    const res = await anotar(agent, body);
    expect(res.eventos).toHaveLength(4);
    expect(new Set(res.eventos.map((e) => e.grupoId)).size).toBe(1);
    expect(res.eventos.every((e) => e.nivel === 'CAMPO')).toBe(true);
    expect(res.eventos.map((e) => e.lote.id).sort()).toEqual([A.id, V.id, B.id, N.id].sort());

    const [fila] = await auditoria('EVENTO_REGISTRADO');
    expect(fila).toMatchObject({ entidad: 'evento_registro', entidadId: res.grupoId });
    expect(fila.detalle).toMatchObject({ tipo: 'Vacuna aftosa', nivel: 'CAMPO', lotes: 4, cabezas: 270, cambiaStock: false });
  });

  it('varios lotes elegidos uno por uno, y una parte de un lote', async () => {
    const { agent, tipos, A, B } = await preparar();
    const vista = await previa(agent, { tipoId: tipos.TRATAMIENTO.id, lineas: [{ loteId: A.id }, { loteId: B.id, cabezas: 20 }] });
    expect(vista.oracion).toMatch(/^Vas a anotar Otros tratamientos sanitarios en 2 lotes, 120 cabezas, el /);
    const res = await anotar(agent, { tipoId: tipos.TRATAMIENTO.id, lineas: [{ loteId: A.id }, { loteId: B.id, cabezas: 20 }] });
    expect(res.eventos.map((e) => [e.lote.nombre, e.nivel, e.cabezas]).sort()).toEqual([
      ['Lote A', 'LOTE', 100],
      ['Lote B', 'PARTE_LOTE', 20],
    ]);
  });

  it('un potrero entero (todos sus lotes) y una categoría', async () => {
    const { agent, tipos, campo, cat, P1 } = await preparar();
    const pot = await anotar(agent, { tipoId: tipos.IDENTIFICACION.id, nivel: 'POTRERO', potreroIds: [P1.id] });
    expect(pot.eventos.map((e) => e.lote.nombre).sort()).toEqual(['Lote A', 'Lote V']);
    expect(pot.oracion).toMatch(/^Anotaste Caravaneo o señalada en el potrero P1 \(2 lotes\), 180 cabezas/);

    const porCat = await anotar(agent, { tipoId: tipos.CASTRACION.id, nivel: 'CATEGORIA', campoId: campo.id, categoriaId: cat.Terneros });
    expect(porCat.eventos.map((e) => [e.lote.nombre, e.nivel])).toEqual([['Lote A', 'CATEGORIA']]);
  });

  it('respeta los niveles del tipo', async () => {
    const { agent, tipos, campo, P1, A } = await preparar();
    // La pesada no se anota a la estancia entera; la alimentación no va a una parte de un lote.
    expect((await anotar(agent, { tipoId: tipos.PESADA.id, nivel: 'CAMPO', campoId: campo.id }, 400)).errors[0]).toMatch(/no se anota a la estancia entera/);
    expect((await anotar(agent, { tipoId: tipos.ALIMENTACION.id, lineas: [{ loteId: A.id, cabezas: 10 }] }, 400)).errors[0]).toMatch(/se anota al lote entero/);
    // El aborto no se anota por potrero.
    expect((await anotar(agent, { tipoId: tipos.ABORTO.id, nivel: 'POTRERO', potreroIds: [P1.id] }, 400)).errors[0]).toMatch(/por potrero entero/);
  });

  it('respeta el sexo: un tipo de hembras no va con lotes de machos', async () => {
    const { agent, tipos, campo, cat, A, V } = await preparar();
    expect((await anotar(agent, { tipoId: tipos.ECOGRAFIA.id, lineas: [{ loteId: A.id, prenadas: 1 }] }, 400)).errors[0]).toMatch(/solo para hembras: el lote Lote A es de Terneros/);
    expect((await anotar(agent, { tipoId: tipos.CASTRACION.id, lineas: [{ loteId: V.id }] }, 400)).errors[0]).toMatch(/solo para machos/);
    expect((await anotar(agent, { tipoId: tipos.INSEMINACION.id, nivel: 'CATEGORIA', campoId: campo.id, categoriaId: cat.Terneros }, 400)).errors[0]).toMatch(
      /solo para hembras: Terneros no corresponde/,
    );
    // En la estancia entera, los de machos se saltean y se avisa ("Novillos" y "Terneros": machos).
    await prisma.tipoMovimiento.update({ where: { id: tipos.INSEMINACION.id }, data: { niveles: ['CAMPO', 'LOTE', 'PARTE_LOTE'] } });
    const vista = await previa(agent, { tipoId: tipos.INSEMINACION.id, nivel: 'CAMPO', campoId: campo.id });
    expect(vista.lineas.map((l) => l.lote).sort()).toEqual(['Lote B', 'Lote V']);
    expect(vista.avisos[0]).toMatch(/No se incluyen 2 lotes de machos/);
  });

  it('los lotes tienen que ser de una estancia, con animales, y los datos de un lote de lo elegido', async () => {
    const { agent, tipos, cat, P1, A, B } = await preparar();
    const otro = await prisma.campo.create({ data: { sigla: 'OT', nombre: 'Otra' } });
    const p = await prisma.potrero.create({ data: { campoId: otro.id, nombre: 'X' } });
    const l = await prisma.lote.create({ data: { campoId: otro.id, potreroId: p.id, categoriaId: cat.Vacas, nombre: 'Otro lote' } });
    await prisma.versionStock.create({ data: { potreroId: p.id, fecha: dia('2026-11-13'), origen: 'MANUAL', lineas: { create: [{ loteId: l.id, categoriaId: cat.Vacas, cabezas: 5 }] } } });
    expect((await anotar(agent, { tipoId: tipos.ENTORE.id, lineas: [{ loteId: A.id }, { loteId: l.id }] }, 400)).errors[0]).toMatch(/misma estancia/);
    expect((await anotar(agent, { tipoId: tipos.ENTORE.id, nivel: 'POTRERO', potreroIds: [P1.id], lineas: [{ loteId: B.id }] }, 400)).errors[0]).toMatch(
      /no es parte de lo elegido/,
    );
    expect((await anotar(agent, { tipoId: tipos.ENTORE.id, lineas: [] }, 400)).errors[0]).toMatch(/Elegí a qué lotes/);
  });
});

describe('pesada', () => {
  it('anota el peso y deja una versión de stock con el peso nuevo (las cabezas no cambian)', async () => {
    const { agent, tipos, P1, A, V } = await preparar();
    const body = { tipoId: tipos.PESADA.id, lineas: [{ loteId: A.id, pesoPromedioKg: 262 }, { loteId: V.id, pesoPromedioKg: 430, pesadas: 40 }] };
    const vista = await previa(agent, body);
    expect(vista.cambiaStock).toBe(true);
    expect(vista.lineas.find((l) => l.lote === 'Lote A')).toMatchObject({ antes: { cabezas: 100, pesoPromedioKg: 250 }, despues: { cabezas: 100, pesoPromedioKg: 262 } });

    const res = await anotar(agent, body);
    expect(res.eventos.every((e) => e.cambiaStock)).toBe(true);
    expect(await lineas(agent, P1)).toEqual([
      ['Lote A', 100, 262],
      ['Lote V', 80, 430],
    ]);
    // Una sola versión para el potrero, con origen EVENTO.
    expect(await versiones(P1)).toBe(2);
    const detalle = (await agent.get(`${API}/potreros/${P1.id}`).expect(200)).body;
    expect(detalle.stock.origen).toBe('EVENTO');

    // El historial del potrero y el del lote lo cuentan.
    const hist = (await agent.get(`${API}/potreros/${P1.id}/historial`).expect(200)).body;
    expect(hist.versiones[0].evento).toBe('Pesada del lote Lote A: de 250 a 262 kg; Pesada del lote Lote V: de 420 a 430 kg');
    expect(hist.eventos).toHaveLength(2);
    const lote = (await agent.get(`${API}/lotes/${V.id}`).expect(200)).body;
    expect(lote.eventos[0]).toMatchObject({ tipo: { clave: 'PESADA' }, cabezas: 40, texto: '430 kg (antes 420) · 40 de 80 pesadas' });
  });

  it('la fecha no puede ser anterior al último dato del potrero', async () => {
    const { agent, tipos, A } = await preparar();
    const res = await anotar(agent, { tipoId: tipos.PESADA.id, fecha: '2026-11-10', lineas: [{ loteId: A.id, pesoPromedioKg: 262 }] }, 400);
    expect(res.errors[0]).toMatch(/anterior al último dato de P1/);
  });
});

describe('recuento', () => {
  it('sin diferencia: solo el registro', async () => {
    const { agent, tipos, P1, A } = await preparar();
    const res = await anotar(agent, { tipoId: tipos.RECUENTO.id, lineas: [{ loteId: A.id, contadas: 100 }] });
    expect(res.eventos[0]).toMatchObject({ cambiaStock: false, datos: { diferencia: 0 } });
    expect(await versiones(P1)).toBe(1);
  });

  it('con diferencia pide el motivo y deja las cabezas contadas en el stock', async () => {
    const { agent, tipos, P1, A } = await preparar();
    expect((await anotar(agent, { tipoId: tipos.RECUENTO.id, lineas: [{ loteId: A.id, contadas: 96 }] }, 400)).errors[0]).toMatch(/motivo/);
    const res = await anotar(agent, { tipoId: tipos.RECUENTO.id, lineas: [{ loteId: A.id, contadas: 96, motivo: 'Abigeato' }] });
    expect(res.eventos[0]).toMatchObject({ cambiaStock: true, cabezas: 96, texto: 'había 100, se contaron 96 (Abigeato)' });
    expect(await lineas(agent, P1)).toEqual([
      ['Lote A', 96, 250],
      ['Lote V', 80, 420],
    ]);
    const hist = (await agent.get(`${API}/potreros/${P1.id}/historial`).expect(200)).body;
    expect(hist.versiones[0].evento).toBe('Recuento del lote Lote A: había 100, se contaron 96 (Abigeato)');
  });

  it('un recuento en 0 cierra el lote; al anularlo vuelve', async () => {
    const { agent, tipos, P3, N } = await preparar();
    const res = await anotar(agent, { tipoId: tipos.RECUENTO.id, lineas: [{ loteId: N.id, contadas: 0, motivo: 'Se habían vendido' }] });
    expect(await lineas(agent, P3)).toEqual([]);
    expect((await prisma.lote.findUnique({ where: { id: N.id } })).activo).toBe(false);
    await agent.post(`${API}/eventos-registro/${res.eventos[0].id}/anular`).expect(200);
    expect(await lineas(agent, P3)).toEqual([['Lote N', 30, null]]);
    expect((await prisma.lote.findUnique({ where: { id: N.id } })).activo).toBe(true);
  });
});

describe('anular', () => {
  it('un evento sin efecto en el stock se anula (y no dos veces)', async () => {
    const { agent, tipos, A } = await preparar();
    const { eventos } = await anotar(agent, { tipoId: tipos.VACUNA_AFTOSA.id, lineas: [{ loteId: A.id }] });
    const res = (await agent.post(`${API}/eventos-registro/${eventos[0].id}/anular`).expect(200)).body;
    expect(res.eventos[0]).toMatchObject({ anulado: true, puedeAnular: false, anuladoPor: 'Alice Test' });
    expect((await agent.post(`${API}/eventos-registro/${eventos[0].id}/anular`).expect(409)).body.errors[0]).toMatch(/ya está anulado/);
    const [fila] = await auditoria('EVENTO_ANULADO');
    expect(fila.detalle).toMatchObject({ tipo: 'Vacuna aftosa', registros: [eventos[0].id], cambiaStock: false });
    await agent.post(`${API}/eventos-registro/999999/anular`).expect(404);
  });

  it('una pesada se anula si después no hubo otro cambio en el potrero: el stock vuelve a como estaba', async () => {
    const { agent, tipos, P1, A, V } = await preparar();
    const { eventos } = await anotar(agent, { tipoId: tipos.PESADA.id, lineas: [{ loteId: A.id, pesoPromedioKg: 262 }, { loteId: V.id, pesoPromedioKg: 430 }] });
    // Anular uno anula los dos del mismo potrero (dejaron una sola versión).
    const res = (await agent.post(`${API}/eventos-registro/${eventos[0].id}/anular`).expect(200)).body;
    expect(res.eventos).toHaveLength(2);
    expect(await lineas(agent, P1)).toEqual([
      ['Lote A', 100, 250],
      ['Lote V', 80, 420],
    ]);
    const hist = (await agent.get(`${API}/potreros/${P1.id}/historial`).expect(200)).body;
    expect(hist.versiones[0].evento).toMatch(/^Anulación: Pesada del lote Lote A/);
  });

  it('si después hubo otro cambio en el potrero, no se puede anular', async () => {
    const { agent, tipos, P1, A } = await preparar();
    const { eventos } = await anotar(agent, { tipoId: tipos.PESADA.id, lineas: [{ loteId: A.id, pesoPromedioKg: 262 }] });
    await agent
      .post(`${API}/movimientos`)
      .send({ loteOrigenId: A.id, cabezas: 10, destinoPotreroId: P1.id, modo: 'NUEVO', nuevoLote: { categoriaId: (await prisma.lote.findUnique({ where: { id: A.id } })).categoriaId } })
      .expect(201);
    const lista = (await agent.get(`${API}/lotes/${A.id}`).expect(200)).body.eventos;
    expect(lista[0].puedeAnular).toBe(false);
    expect((await agent.post(`${API}/eventos-registro/${eventos[0].id}/anular`).expect(409)).body.errors[0]).toMatch(/hubo otros cambios en P1/);
  });

  it('una carga entera (una campaña) se anula junta', async () => {
    const { agent, tipos, campo } = await preparar();
    const { grupoId, eventos } = await anotar(agent, { tipoId: tipos.VACUNA_CARBUNCLO.id, nivel: 'CAMPO', campoId: campo.id });
    const res = (await agent.post(`${API}/eventos-registro/grupo/${grupoId}/anular`).expect(200)).body;
    expect(res.eventos).toHaveLength(eventos.length);
    expect(await prisma.eventoRegistro.count({ where: { anulado: true } })).toBe(eventos.length);
    await agent.post(`${API}/eventos-registro/grupo/no-existe/anular`).expect(404);
  });

  it('anular pide el permiso de revertir (ANULAR)', async () => {
    const { agent, tipos, A } = await preparar();
    const { eventos } = await anotar(agent, { tipoId: tipos.ENTORE.id, lineas: [{ loteId: A.id }] });
    await usuarioCon(BOB, { permisos: ['pecuaria:VER', 'pecuaria:CREAR'], todas: true });
    const bob = await loggedAgent(BOB);
    await bob.post(`${API}/eventos-registro/${eventos[0].id}/anular`).expect(403);
  });
});

describe('alcance por estancia', () => {
  it('lo de otra estancia contesta 404: anotar, anular y la lista no lo muestra', async () => {
    const { agent, tipos, campo, A } = await preparar();
    const { eventos } = await anotar(agent, { tipoId: tipos.ENTORE.id, lineas: [{ loteId: A.id }] });
    const otra = await prisma.campo.create({ data: { sigla: 'OT', nombre: 'Otra' } });
    await usuarioCon(BOB, { permisos: ['pecuaria:VER', 'pecuaria:CREAR', 'pecuaria:ANULAR'], campoIds: [otra.id] });
    const bob = await loggedAgent(BOB);
    await bob.post(`${API}/eventos-registro`).send({ tipoId: tipos.ENTORE.id, lineas: [{ loteId: A.id }] }).expect(404);
    await bob.post(`${API}/eventos-registro/vista-previa`).send({ tipoId: tipos.ENTORE.id, nivel: 'CAMPO', campoId: campo.id }).expect(404);
    await bob.post(`${API}/eventos-registro/${eventos[0].id}/anular`).expect(404);
    await bob.post(`${API}/eventos-registro/grupo/${eventos[0].grupoId}/anular`).expect(404);
    const lista = (await bob.get(`${API}/movimientos`).query({ ver: 'todo' }).expect(200)).body;
    expect(lista.eventos).toEqual([]);
  });
});

describe('la lista: Todo / Movimientos / Eventos', () => {
  it('por defecto, los movimientos (un evento que no cambió cabezas no va); con ver=eventos o ver=todo, los eventos', async () => {
    const { agent, tipos, campo, cat, P2, A } = await preparar();
    await anotar(agent, { tipoId: tipos.VACUNA_AFTOSA.id, lineas: [{ loteId: A.id }] });
    await agent.post(`${API}/movimientos`).send({ loteOrigenId: A.id, cabezas: 10, destinoPotreroId: P2.id, modo: 'NUEVO', nuevoLote: { categoriaId: cat.Terneros } }).expect(201);

    const def = (await agent.get(`${API}/campos/${campo.id}/movimientos`).expect(200)).body;
    expect(def.movimientos).toHaveLength(1);
    expect(def.eventos).toEqual([]);
    const ev = (await agent.get(`${API}/campos/${campo.id}/movimientos`).query({ ver: 'eventos' }).expect(200)).body;
    expect(ev.movimientos).toEqual([]);
    expect(ev.eventos).toHaveLength(1);
    expect(ev.resumen.eventos).toBe(1);
    const todo = (await agent.get(`${API}/campos/${campo.id}/movimientos`).query({ ver: 'todo' }).expect(200)).body;
    expect([todo.movimientos.length, todo.eventos.length]).toEqual([1, 1]);
    // Los filtros también valen para los eventos.
    const otroTipo = (await agent.get(`${API}/campos/${campo.id}/movimientos`).query({ ver: 'todo', tipoId: tipos.PESADA.id }).expect(200)).body;
    expect(otroTipo.eventos).toEqual([]);
    await agent.get(`${API}/campos/${campo.id}/movimientos`).query({ ver: 'otra' }).expect(400);
  });

  it('Movimientos trae también los eventos que cambiaron las cabezas (recuento con diferencia), no la pesada', async () => {
    const { agent, tipos, campo, A } = await preparar();
    await anotar(agent, { tipoId: tipos.PESADA.id, lineas: [{ loteId: A.id, pesoPromedioKg: 262 }] });
    await anotar(agent, { tipoId: tipos.VACUNA_AFTOSA.id, lineas: [{ loteId: A.id }] });
    await anotar(agent, { tipoId: tipos.RECUENTO.id, lineas: [{ loteId: A.id, contadas: 100 }] });
    await anotar(agent, { tipoId: tipos.RECUENTO.id, lineas: [{ loteId: A.id, contadas: 96, motivo: 'Abigeato' }] });

    const mov = (await agent.get(`${API}/campos/${campo.id}/movimientos`).expect(200)).body;
    expect(mov.eventos.map((e) => [e.tipo.clave, e.datos.contadas, e.cambiaCabezas])).toEqual([['RECUENTO', 96, true]]);
    const ev = (await agent.get(`${API}/campos/${campo.id}/movimientos`).query({ ver: 'eventos' }).expect(200)).body;
    expect(ev.eventos.map((e) => e.tipo.clave).sort()).toEqual(['PESADA', 'RECUENTO', 'RECUENTO', 'VACUNA_AFTOSA']);
    expect(ev.eventos.find((e) => e.tipo.clave === 'PESADA')).toMatchObject({ cambiaStock: true, cambiaCabezas: false });
  });

  it('"Todas las estancias" y "Todos los feedlots": cada grupo con lo suyo, con la sigla', async () => {
    const { agent, tipos, cat, A } = await preparar();
    await anotar(agent, { tipoId: tipos.VACUNA_AFTOSA.id, lineas: [{ loteId: A.id }] });
    const fx = await prisma.campo.create({ data: { sigla: 'FX', nombre: 'Feedlot X', tipo: 'CONFINAMIENTO' } });
    const c = await prisma.potrero.create({ data: { campoId: fx.id, nombre: 'Corral 1', tipo: 'CORRAL' } });
    const l = await prisma.lote.create({ data: { campoId: fx.id, potreroId: c.id, categoriaId: cat.Novillos, nombre: 'C1' } });
    await prisma.versionStock.create({ data: { potreroId: c.id, fecha: dia('2026-11-13'), origen: 'MANUAL', lineas: { create: [{ loteId: l.id, categoriaId: cat.Novillos, cabezas: 20 }] } } });
    await anotar(agent, { tipoId: tipos.TRATAMIENTO.id, lineas: [{ loteId: l.id }] });

    const est = (await agent.get(`${API}/movimientos`).query({ ver: 'eventos' }).expect(200)).body;
    expect(est.eventos.map((e) => [e.campo.sigla, e.potrero.campo.sigla, e.tipo.clave])).toEqual([['EJ', 'EJ', 'VACUNA_AFTOSA']]);
    const fl = (await agent.get(`${API}/movimientos`).query({ ver: 'eventos', grupo: 'feedlots' }).expect(200)).body;
    expect(fl.eventos.map((e) => [e.campo.sigla, e.tipo.clave])).toEqual([['FX', 'TRATAMIENTO']]);
  });
});

describe('feedlot con pesada', () => {
  it('pesoReal: la ganancia diaria entre la entrada (o la pesada anterior) y la última pesada', () => {
    const l = { fechaEntrada: '2026-10-01', pesoEntradaKg: 300, pesadas: [{ fecha: '2026-10-31', pesoKg: 345 }] };
    expect(pesoReal(l)).toEqual({ pesada: { fecha: '2026-10-31', pesoKg: 345 }, gmdKg: 1.5 });
    const dos = { ...l, pesadas: [{ fecha: '2026-11-10', pesoKg: 365 }, { fecha: '2026-10-31', pesoKg: 345 }] };
    expect(pesoReal(dos).gmdKg).toBe(2);
    expect(pesoReal({ fechaEntrada: null, pesoEntradaKg: null, pesadas: [{ fecha: '2026-10-31', pesoKg: 345 }] }).gmdKg).toBeNull();
    expect(pesoReal({ pesadas: [] })).toEqual({ pesada: null, gmdKg: null });
  });

  it('analisisFeedlot: con una pesada, el peso de hoy sale de la pesada', () => {
    const FX = { id: 9, sigla: 'FX', nombre: 'Feedlot X' };
    const linea = { loteId: 1, lote: 'L1', categoriaId: 1, categoria: 'Novillos', cabezas: 100, pesoPromedioKg: 345, fechaEntrada: '2026-10-01', pesoEntradaKg: 300 };
    const sin = analisisFeedlot({ corrales: [{ id: 1, nombre: 'C1', campo: FX, fecha: '2026-11-01', lineas: [linea] }], hoy: '2026-11-10', gmdKg: 1 });
    // Sin pesada: 300 + 40 días × 1.
    expect(sin.filas[0]).toMatchObject({ pesoEstimadoKg: 340, ultimaPesada: null, gmdRealKg: null });
    const con = analisisFeedlot({
      corrales: [{ id: 1, nombre: 'C1', campo: FX, fecha: '2026-11-01', lineas: [{ ...linea, pesadas: [{ fecha: '2026-10-31', pesoKg: 345 }] }] }],
      hoy: '2026-11-10',
      gmdKg: 1,
    });
    // Con pesada: 345 + 10 días × 1; la ganancia real, (345 − 300) / 30 = 1,5.
    expect(con.filas[0]).toMatchObject({ pesoEstimadoKg: 355, ultimaPesada: { fecha: '2026-10-31', pesoKg: 345 }, gmdRealKg: 1.5 });
    expect(con.totales.gmdRealPromedio).toBe(1.5);
  });

  it('en la API: el análisis del corral trae la última pesada y la ganancia real', async () => {
    const { agent, tipos, cat } = await preparar();
    const fx = await prisma.campo.create({ data: { sigla: 'FX', nombre: 'Feedlot X', tipo: 'CONFINAMIENTO' } });
    const c = await prisma.potrero.create({ data: { campoId: fx.id, nombre: 'Corral 1', tipo: 'CORRAL' } });
    const hace30 = new Date(Date.parse(`${hoy()}T00:00:00Z`) - 30 * 86_400_000).toISOString().slice(0, 10);
    const l = await prisma.lote.create({ data: { campoId: fx.id, potreroId: c.id, categoriaId: cat.Novillos, nombre: 'C1', fechaEntrada: dia(hace30), pesoEntradaKg: 300 } });
    await prisma.versionStock.create({ data: { potreroId: c.id, fecha: dia(hace30), origen: 'MANUAL', lineas: { create: [{ loteId: l.id, categoriaId: cat.Novillos, cabezas: 50, pesoPromedioKg: 300 }] } } });
    await anotar(agent, { tipoId: tipos.PESADA.id, lineas: [{ loteId: l.id, pesoPromedioKg: 354 }] });
    const analisis = (await agent.get(`${API}/campos/${fx.id}/feedlot`).expect(200)).body;
    // (354 − 300) / 30 días = 1,8 kg por día; hoy pesa lo de la pesada (es de hoy).
    expect(analisis.filas[0]).toMatchObject({ ultimaPesada: { fecha: hoy(), pesoKg: 354 }, gmdRealKg: 1.8, pesoEstimadoKg: 354 });
    expect(analisis.totales.gmdRealPromedio).toBe(1.8);
  });
});

describe('destete (en el "+")', () => {
  async function conMadres() {
    const base = await prepararCampo();
    const p1 = await base.potrero('P1', { hectareas: 100, lotes: [['Vacas paridas', 'Vacas paridas', 80, 450], ['Terneros al pie', 'Terneros chicos', 75, 150]] });
    const p2 = await base.potrero('P2', { hectareas: 50 });
    return { ...base, P1: p1.potrero, P2: p2.potrero, madres: p1.lote['Vacas paridas'], terneros: p1.lote['Terneros al pie'] };
  }
  const mover = async (agent, body, esperado = 201) => (await agent.post(`${API}/movimientos`).send(body).expect(esperado)).body;

  it('lleva a los terneros a otro potrero, con su tipo, el lote de las madres y la categoría al llegar', async () => {
    const { agent, cat, P2, madres, terneros } = await conMadres();
    const res = await mover(agent, {
      loteOrigenId: terneros.id,
      cabezas: 75,
      destinoPotreroId: P2.id,
      modo: 'ENTERO',
      categoriaId: cat.Terneros,
      destete: true,
      loteMadresId: madres.id,
    });
    expect(res.movimiento).toMatchObject({ tipo: 'DESTETE', loteMadres: 'Vacas paridas', categoriaDestino: 'Terneros' });
    const lista = (await agent.get(`${API}/lotes/${terneros.id}`).expect(200)).body.movimientos;
    expect(lista[0]).toMatchObject({ tipo: { clave: 'DESTETE', nombre: 'Destete' }, loteMadres: { id: madres.id, nombre: 'Vacas paridas' }, categoriaDestino: 'Terneros' });
    const [fila] = await auditoria('MOVIMIENTO_REGISTRADO');
    expect(fila.detalle).toMatchObject({ tipo: 'Destete', loteMadres: 'Vacas paridas' });
    // Se revierte como cualquier movimiento.
    await agent.post(`${API}/movimientos/${lista[0].id}/revertir`).expect(201);
  });

  it('una parte puede formar un lote nuevo; la categoría al llegar es opcional', async () => {
    const { agent, cat, P2, madres, terneros } = await conMadres();
    const res = await mover(agent, { loteOrigenId: terneros.id, cabezas: 40, destinoPotreroId: P2.id, modo: 'NUEVO', nuevoLote: { categoriaId: cat['Terneros chicos'] }, destete: true, loteMadresId: madres.id });
    expect(res.movimiento).toMatchObject({ tipo: 'DESTETE', cabezas: 40, categoriaDestino: 'Terneros chicos' });
  });

  it('las madres tienen que estar en el mismo potrero, ser hembras y los terneros irse a otro potrero', async () => {
    const { agent, cat, P1, P2, madres, terneros, potrero } = await conMadres();
    const base = { loteOrigenId: terneros.id, cabezas: 75, destinoPotreroId: P2.id, modo: 'ENTERO', destete: true };
    expect((await mover(agent, base, 400)).errors[0]).toMatch(/lote de las madres/);
    expect((await mover(agent, { ...base, loteMadresId: terneros.id }, 400)).errors[0]).toMatch(/no puede ser el mismo/);
    expect((await mover(agent, { ...base, destinoPotreroId: P1.id, modo: 'NUEVO', cabezas: 10, nuevoLote: { categoriaId: cat.Terneros }, loteMadresId: madres.id }, 400)).errors[0]).toMatch(
      /otro potrero/,
    );
    const p3 = await potrero('P3', { hectareas: 10, lotes: [['Toros', 'Novillos', 3, 600]] });
    expect((await mover(agent, { ...base, loteMadresId: p3.lote.Toros.id }, 400)).errors[0]).toMatch(/tiene que estar en P1/);
    const machos = await prisma.lote.create({ data: { campoId: madres.campoId, potreroId: P1.id, categoriaId: cat.Novillos, nombre: 'Machos' } });
    expect((await mover(agent, { ...base, loteMadresId: machos.id }, 400)).errors[0]).toMatch(/tiene que ser de hembras/);
  });
});
