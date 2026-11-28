# Copias de seguridad: lo que falta para que anden

> Estado al 27/11/2026. El programa de las copias ya está hecho, probado y publicado (commits `bd83c7d` y `5ac3482`). Cómo funciona y cómo recuperar una copia: `docs/COPIAS.md`.
> Faltan solo estos pasos, que hace Diego en los paneles de Railway y de Cloudflare. Ir tachando (`[x]`).

**Regla:** la llave de R2 y la clave de las copias van **solo en Railway**. Nunca en el chat, en un archivo de Documentos (se sincroniza con Drive) ni en git.

## Ya hecho

- [x] Cuenta de Cloudflare y bucket `sapsa-copias` (Standard, sin acceso público).
- [x] El programa (`server/src/copias/`), los tests y la prueba en la compu (copia, "sin cambios", abrir y restaurar con la base idéntica).
- [x] El Dockerfile de la rama `railway` con `pg_dump` 18.
- [ ] Confirmar en Railway → **APPECUARIA** → **Deployments** que el deploy "Dockerfile: pg_dump y pg_restore de PostgreSQL 18…" quedó en verde.

## Paso 5: crear el servicio "copias" en Railway

En el proyecto **gracious-youthfulness**:

- [ ] **+ Create** (o **New**) → **GitHub Repo** → **APPECUARIA**.
- [ ] En el servicio nuevo, **Settings**:
  - **Name:** `copias`
  - **Source → Branch:** `railway`
  - **Deploy → Custom Start Command:** `node src/copias/copia.js`
  - **Deploy → Cron Schedule:** `0 6 * * *` (todos los días a las 3:00 de Uruguay)
  - **Deploy → Restart Policy:** **Never**
  - **Healthcheck:** vacío. **Networking:** sin dirección pública.

## Paso 6: las variables del servicio "copias"

En **copias → Variables**:

- [ ] `DATABASE_URL`: **Add Reference** → **Postgres** → `DATABASE_URL` (no escribirla a mano).
- [ ] `COPIAS_R2_BUCKET`: `sapsa-copias`
- [ ] `COPIAS_R2_CUENTA`: el **Account ID** de Cloudflare (R2 Object Storage → Overview, a la derecha, en "Account Details").
- [ ] `COPIAS_R2_ACCESS_KEY_ID` y `COPIAS_R2_SECRET_ACCESS_KEY`, de la llave de R2:
  1. Cloudflare → R2 Object Storage → Overview → **API Tokens → Manage** → **Create Account API Token**.
  2. Completar:
     - **Name:** `sapsa-copias-railway`
     - **Permissions:** **Object Read & Write**
     - **Specify bucket(s):** **Apply to specific buckets only** → `sapsa-copias`
     - **TTL:** **Forever**
  3. **Create API Token**. Copiar **Access Key ID** y **Secret Access Key** a las dos variables. El "Token value" no se usa.
  4. Cloudflare las muestra **una sola vez**: no cerrar la pantalla hasta pegarlas en Railway.
- [ ] `COPIAS_CLAVE`: una frase de **20 caracteres o más**. Guardarla en un lugar seguro, como un gestor de contraseñas o en papel en un lugar seguro. **Si se pierde, las copias no se pueden abrir.**
- [ ] Tocar **Deploy** para aplicar los cambios.

## Paso 7: la primera copia

- [ ] Si en el servicio **copias** hay un botón **Run now**, tocarlo. Si no, la primera sale esa noche a las 3:00.
- [ ] Ver en Cloudflare → `sapsa-copias` que aparezca **copias/AAAA/MM/** con un archivo `.dump.cifrada`, y **estado/ultima-copia.json**.
- Si falla, mirar los logs del servicio **copias**:
  - "Faltan variables…" dice cuál falta (solo el nombre, nunca el valor);
  - "pg_dump terminó con error" es un problema de la conexión a la base;
  - "R2 no guardó…" es un problema de la llave o del bucket.

## Paso 8: el candado (después de ver la primera copia)

- [ ] Cloudflare → R2 → **sapsa-copias** → **Settings** → **Bucket lock rules** → **Add rule**:
  - **Name:** `copias-para-siempre`
  - **Prefix:** `copias/`. Solo esa carpeta: `estado/` se actualiza cada noche y no puede llevar candado.
  - **Retention:** **Indefinitely** (para siempre)

## Paso 9: la prueba de recuperar (con Claude)

- [ ] Bajar la primera copia de Cloudflare (**Download**) y, con Claude, abrirla y restaurarla en la base de tests (`docs/COPIAS.md`, "Cómo recuperar una copia"). Cuando la base quede igual, tachar "Copia de seguridad automática" en `docs/PENDIENTES.md`.
