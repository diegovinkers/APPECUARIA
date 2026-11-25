// Lo que controla la base: un precio por fuente, indicador y semana, y una sola
// importación EN_CURSO por fuente (el bloqueo entre corridas).
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { useTestDatabase } from './helpers.js';

useTestDatabase();

const fecha = (iso) => new Date(`${iso}T00:00:00Z`);
const precio = (datos = {}) => ({
  fuente: 'INAC', indicador: 'NOVILLO_4TA', semanaDesde: fecha('2026-11-15'), semanaHasta: fecha('2026-11-21'),
  valor: '6.135', unidad: 'USD_KG_4TA', origen: 'EXCEL', ...datos,
});

describe('precio_mercado e importacion_precio', () => {
  it('un solo precio por fuente, indicador y semana', async () => {
    await prisma.precioMercado.create({ data: precio() });
    await expect(prisma.precioMercado.create({ data: precio({ valor: '6.2' }) })).rejects.toMatchObject({ code: 'P2002' });
    // Otra fuente u otra semana, sí.
    await prisma.precioMercado.create({ data: precio({ fuente: 'MANUAL', origen: 'MANUAL' }) });
    await prisma.precioMercado.create({ data: precio({ semanaDesde: fecha('2026-11-08'), semanaHasta: fecha('2026-11-14') }) });
    const guardado = await prisma.precioMercado.findFirst({ where: { fuente: 'INAC', semanaDesde: fecha('2026-11-15') } });
    expect(guardado.valor.toString()).toBe('6.135');
    expect(guardado.publicado).toBe(true);
  });

  it('una sola importación EN_CURSO por fuente', async () => {
    const primera = await prisma.importacionPrecio.create({ data: { fuente: 'INAC', disparadoPor: 'PROGRAMADO' } });
    expect(primera.estado).toBe('EN_CURSO');
    await expect(prisma.importacionPrecio.create({ data: { fuente: 'INAC', disparadoPor: 'BOTON' } })).rejects.toThrow();
    // Otra fuente puede correr a la vez.
    await prisma.importacionPrecio.create({ data: { fuente: 'MANUAL', disparadoPor: 'BOTON' } });
    // Terminada la primera, puede empezar otra.
    await prisma.importacionPrecio.update({ where: { id: primera.id }, data: { estado: 'OK', fin: new Date() } });
    await prisma.importacionPrecio.create({ data: { fuente: 'INAC', disparadoPor: 'BOTON' } });
    expect(await prisma.importacionPrecio.count({ where: { fuente: 'INAC' } })).toBe(2);
  });
});
