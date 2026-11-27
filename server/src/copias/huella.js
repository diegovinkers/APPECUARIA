// La huella de la base (27/11, copias de seguridad): un resumen de su
// contenido para saber si algo cambió desde la última copia. Si la huella es
// la misma, esa noche no se guarda otra copia (pedido de Diego: "solo los
// cambios", sin guardar lo mismo todos los días).
//
// La copia guarda TODO. La huella deja afuera lo que cambia solo con que
// alguien entre a la app, sin cargar nada:
// - la tabla de sesiones;
// - de la auditoría, entrar, salir, los intentos fallidos y el bloqueo automático;
// - del usuario, el último acceso, los intentos fallidos y el bloqueo;
// - las revisiones automáticas de precios de INAC (si traen precios nuevos,
//   cambia precio_mercado y eso sí cuenta).
// De las migraciones cuenta solo cuáles están aplicadas.
import { createHash } from 'node:crypto';

export const SIN_HUELLA = {
  tablas: ['sesion', 'importacion_precio'],
  columnas: { usuario: ['intentos_fallidos', 'bloqueado_hasta', 'ultimo_acceso', 'actualizado_en'] },
  filas: { auditoria: `accion NOT IN ('LOGIN_OK', 'LOGIN_FALLIDO', 'USUARIO_BLOQUEADO', 'LOGOUT', 'PASSWORD_CAMBIO_FALLIDO')` },
};

const comillas = (nombre) => `"${String(nombre).replaceAll('"', '""')}"`;

// cliente: algo con query(sql) → { rows } (un pg.Client).
// Devuelve { huella, tablas: { nombre: { filas, md5 } } }.
export async function calcularHuella(cliente, reglas = SIN_HUELLA) {
  const { rows } = await cliente.query(
    `SELECT table_name AS nombre FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
  );
  const tablas = {};
  for (const { nombre } of rows) {
    if (reglas.tablas.includes(nombre)) continue;
    let sql;
    if (nombre === '_prisma_migrations') {
      sql = `SELECT migration_name AS x FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    } else {
      const sacar = reglas.columnas[nombre] ?? [];
      const fila = sacar.length ? `(to_jsonb(t) - ARRAY[${sacar.map((c) => `'${c}'`).join(', ')}]::text[])::text` : 'to_jsonb(t)::text';
      const donde = reglas.filas[nombre] ? ` WHERE ${reglas.filas[nombre]}` : '';
      sql = `SELECT ${fila} AS x FROM public.${comillas(nombre)} t${donde}`;
    }
    const r = await cliente.query(`SELECT md5(coalesce(string_agg(x, E'\\n' ORDER BY x), '')) AS md5, count(*)::int AS filas FROM (${sql}) s`);
    tablas[nombre] = r.rows[0];
  }
  const huella = createHash('sha256')
    .update(Object.entries(tablas).map(([n, t]) => `${n}:${t.filas}:${t.md5}`).join('\n'))
    .digest('hex');
  return { huella, tablas };
}
