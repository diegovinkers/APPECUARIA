// Arma un campo ficticio (EJ) con potreros, usos y lotes, directo en la base.
import { prisma } from '../src/db.js';
import { seedPecuaria } from '../src/seed/seed.js';
import { ALICE, PECUARIA_TODO, loggedAgent, usuarioCon } from './helpers.js';

export const dia = (iso) => new Date(`${iso}T00:00:00Z`);
export const hoy = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Montevideo' });

export async function prepararCampo() {
  await seedPecuaria(prisma, () => {});
  await usuarioCon(ALICE, { permisos: PECUARIA_TODO, todas: true });
  const agent = await loggedAgent(ALICE);
  const cat = Object.fromEntries((await prisma.categoria.findMany()).map((c) => [c.nombre, c.id]));
  const uso = Object.fromEntries((await prisma.usoSuelo.findMany()).map((u) => [u.nombre, u.id]));
  const campo = await prisma.campo.create({ data: { sigla: 'EJ', nombre: 'Estancia Ejemplo' } });

  // lotes: [[nombre, categoría, cabezas, peso]]. Crea el potrero, su uso y una
  // versión de stock con esos lotes. Devuelve { potrero, lote: { nombre: lote } }.
  async function potrero(nombre, { hectareas = null, tipo = 'POTRERO', usoNombre, fecha = '2026-11-13', lotes = [] } = {}) {
    const p = await prisma.potrero.create({
      data: { campoId: campo.id, nombre, tipo, hectareas, hectareasAConfirmar: hectareas == null },
    });
    if (usoNombre) await prisma.potreroUso.create({ data: { potreroId: p.id, usoSueloId: uso[usoNombre], desde: dia('2026-11-01') } });
    const lote = {};
    for (const [nombreLote, categoria] of lotes) {
      lote[nombreLote] = await prisma.lote.create({
        data: { campoId: campo.id, potreroId: p.id, categoriaId: cat[categoria], nombre: nombreLote },
      });
    }
    if (lotes.length) {
      await prisma.versionStock.create({
        data: {
          potreroId: p.id,
          fecha: dia(fecha),
          origen: 'PLANILLA',
          lineas: {
            create: lotes.map(([nombreLote, categoria, cabezas, peso]) => ({
              loteId: lote[nombreLote].id,
              categoriaId: cat[categoria],
              cabezas,
              pesoPromedioKg: peso,
            })),
          },
        },
      });
    }
    return { potrero: p, lote };
  }

  return { agent, campo, cat, uso, potrero };
}

export const auditoria = (accion) => prisma.auditoria.findMany({ where: { accion }, orderBy: { id: 'asc' } });
