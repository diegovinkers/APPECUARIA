# Pendientes

> Lista armada el 27/11/2026 a partir de `CLAUDE.md` (todas las sesiones). Se tacha lo que se hace (`~~así~~`) y se suma lo nuevo. Orden: lo más urgente arriba.

## 1. Urgente: seguridad y datos

- [ ] **Copia de seguridad automática de la base de Railway**, una por noche, cifrada, a Cloudflare R2 (gratis). En el plan Hobby Railway no hace copias; hoy la única es la manual del 26/11 (`C:\backups-sapsa\`). — *Claude, con Diego para crear la cuenta de R2.*
- [ ] **Cambiar las contraseñas que se vieron en el chat:** la de la base local (`sapsa_app`) y la de `sapsa-db` de Render. — *Diego (Claude lo guía).*
- [ ] **Verificación en dos pasos** en Railway y en GitHub. — *Diego.*

## 2. Orden y limpieza

- [ ] Borrar el proyecto de Railway que quedó con un Postgres solo.
- [ ] Apagar Render cuando ya no se use (la producción es Railway: `https://appecuaria-production.up.railway.app`).
- [ ] Mirar en la auditoría de Railway que la IP registrada sea la real (`IP_HEADER=X-Real-IP`).
- [ ] Instalar la app en el celular de Diego desde la dirección de Railway; el dueño, en su iPhone (Safari → Compartir → Agregar a inicio).

## 3. Respuestas que esperan de Diego

- [ ] **Tandas de parición:** las 7 preguntas de `docs/superpowers/prompts/2026-11-27-tandas-de-paricion.md`.
- [ ] **Avisos de mezcla:** confirmar la tabla de grupos de manejo (`server/src/pecuaria/mezcla.js`: qué categorías pueden compartir potrero).
- [ ] **Feedlot:** las 7 preguntas para el jefe en `docs/FEEDLOT.md`. Con eso siguen las fases 2 a 5.
- [ ] **Precios de INAC:** el email para el User-Agent y el secreto `PRECIOS_TOKEN` en GitHub. Con eso sigue la actualización automática semanal (fase 3 de `docs/PRECIOS_INAC.md`).
- [ ] **Movimientos y bastón:** las preguntas para el encargado en `docs/PROPUESTA_MOVIMIENTOS.md` y `docs/LOGISTICA_MOVIMIENTOS.md`.
- [ ] **Asistente (bot), fase 1 hecha:** probarlo y dar el OK (`docs/superpowers/specs/2026-11-27-asistente-design.md`). ~~Clave de Anthropic en `server/.env`~~ (hecho, 27/11). Para publicar: cargar `ANTHROPIC_API_KEY` en Railway.
- [ ] **Clave de Anthropic de prueba (`sapsa-appecuaria`) vence el 27/12/2026** (30 días, espacio Default, USD 3 de saldo de la cuenta de Diego). Si el asistente sirve: crear una definitiva (espacio SAPSA, sin vencimiento o 1 año, límite de gasto, ¿tarjeta de SAPSA?) y cargarla en Railway.
- [ ] **Logo de Pecuaria en mejor calidad** (el original grande o en SVG), para regenerar el ícono de 512 px.

## 4. Revisar en el celular (publicado, falta el OK de Diego)

- [ ] Procesos: tablero, reglas del campo (IATF → ecografía → entore una vez → engorde) y transferencia de embriones.
- [ ] Ficha del potrero rehecha (movimientos con la variación de cada número).
- [ ] Pasto de los potreros (al mover y en una recorrida; Pasto y Descanso en la tabla).
- [ ] Tabla de Corrales del feedlot (nunca se miró en el navegador).

## 5. Funcionalidades que siguen

- [ ] **Asistente (bot que entiende lo que le pedís):** ~~fase 1, solo preguntas~~ (hecha 27/11, sin commitear). Sigue la fase 2: acciones con Confirmar. Fase 3: procesos, foto del bastón, WhatsApp. Después: probar las mismas preguntas con Sonnet 5.5 para comparar (`docs/superpowers/specs/2026-11-27-asistente-design.md`).
- [ ] **Tandas de parición** (cabeza / cuerpo / cola), cuando Diego conteste las preguntas.
- [ ] **Pasto, pasos 2 y 3:** rendimiento por potrero y datos de afuera (`docs/superpowers/plans/2026-11-26-pasto.md`).
- [ ] **Feedlot, fases 2 a 5** (`docs/FEEDLOT.md`).
- [ ] **Logística y bastón:** fases 2 a 8 (`docs/LOGISTICA_MOVIMIENTOS.md`; la 1, familia de lotes, está hecha).
- [ ] **Libro del rodeo:** atajos por nivel, balance y solicitudes (`docs/DECISIONES.md` §11).
- [ ] **"Descargar Excel"** de las tablas (Potreros, Historial).
- [ ] **El "+" con "Todas las estancias"** (hoy pide elegir una).
- [ ] **Módulo Parcelas:** mapa, GPS y operaciones; en diseño (`docs/DECISIONES.md` §9).
