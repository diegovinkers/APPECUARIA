# Copias de seguridad de la base

> Armado el 27/11/2026, a pedido de Diego. Reemplaza a los backups del plan Pro de Railway (USD 20 por mes) por algo gratis.

## Qué hace

Todas las noches Railway corre un servicio chico (**copias**) que arranca, hace esto y termina:

1. **Saca la huella de la base**: un resumen de su contenido.
   - Si es igual a la de la última copia, **no guarda nada** (ese día no hubo cambios).
   - Entrar o salir de la app no cuenta como cambio. La huella no mira las sesiones, los logins y logouts de la auditoría, el último acceso de cada usuario ni las revisiones de precios de INAC que no trajeron nada.
2. **Copia la base entera** con `pg_dump`.
3. **La cifra** con la clave de las copias (AES-256). Sin esa clave no se puede abrir.
4. **La sube a Cloudflare R2**, al bucket `sapsa-copias`, en `copias/AAAA/MM/sapsa-AAAA-MM-DD-HHMM.dump.cifrada` (hora de Uruguay).
5. **La vuelve a bajar, la abre y la compara.** Si no coincide, el servicio falla.
6. **Anota la huella** en `estado/ultima-copia.json`.

**Nunca se borra ninguna copia** (decisión de Diego). Cada copia pesa unos pocos cientos de KB, así que los 10 GB gratis de R2 alcanzan para muchos años. El bucket tiene un candado (*bucket lock*) sobre `copias/`, para que nadie pueda borrarlas ni pisarlas.

Código: `server/src/copias/` (`copia.js`, `huella.js`, `cifrado.js`, `destino.js`, `abrir.js`). Tests: `server/test/copias.test.js`.

## Variables del servicio en Railway

| Variable | Qué es |
|---|---|
| `DATABASE_URL` | Referencia a la base (**Add Reference** → Postgres → `DATABASE_URL`, la interna) |
| `COPIAS_CLAVE` | La clave del cifrado (20 caracteres o más). **La guarda Diego en un lugar seguro: si se pierde, las copias no se pueden abrir.** |
| `COPIAS_R2_CUENTA` | El *Account ID* de Cloudflare |
| `COPIAS_R2_BUCKET` | `sapsa-copias` |
| `COPIAS_R2_ACCESS_KEY_ID` y `COPIAS_R2_SECRET_ACCESS_KEY` | La llave de R2, solo para ese bucket |

Opcional: `COPIAS_FORZAR=1` copia aunque no haya cambios.

## Cómo recuperar una copia

1. En Cloudflare: **R2 → sapsa-copias → copias/…**, elegir la copia y **Download**.
2. Abrirla. Desde `server/`:
   ```
   node src/copias/abrir.js <archivo.dump.cifrada>
   ```
   Pide la clave, que no se ve al escribirla, y deja el `.dump` al lado.
3. Restaurarla en otra base:
   - para probar, en la de tests: `node "docs/info santi/probar-copia.mjs" <archivo.dump>`;
   - en otro PostgreSQL, igual que ese script.

   **Trampa:** el Postgres de Railway le pone a cada columna la opción `pg_attver`, que otro PostgreSQL no conoce. Hay que pasar la copia a SQL y sacar esas líneas, que es lo que hace `probar-copia.mjs`.

## Probado (27/11)

En la compu, contra la base de tests con datos ficticios:
- la primera copia se guardó y se comprobó;
- la segunda dijo "sin cambios" y no guardó otra;
- se abrió con la clave;
- se restauró, y la huella quedó **idéntica** a la del principio.

## Para revisar de vez en cuando

- **Una vez por mes:** bajar la última copia y restaurarla en la base de tests (pasos de arriba). Una copia que nunca se probó no sirve.
- **Si el servicio falla**, Railway lo marca en rojo en el proyecto.
