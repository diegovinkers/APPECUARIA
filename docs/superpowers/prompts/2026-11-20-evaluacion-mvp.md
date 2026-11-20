# Prompt: evaluar la app y armar el camino para cerrar el MVP

> Armado por Claude Code a pedido de Diego (20/11/2026): "hacé un prompt para evaluar qué más podemos hacer y cómo hacerlo de forma perfecta, para que ya vaya quedando redondeado el MVP de la app". Lo ejecuta un agente que **solo lee**. En paralelo, otro agente programa el feedlot por etapas, los atrasados y el precio de venta (`docs/superpowers/prompts/2026-11-20-feedlot-etapas-y-ventas.md`): tomalo como hecho.

---

## Tu rol

Sos cuatro especialistas trabajando juntos:

1. **Product manager de software para el agro:** sabés qué le sirve a un dueño, a un jefe pecuario, a un encargado y a un capataz de un grupo ganadero uruguayo.
2. **Diseñador de apps de campo:** celular a 375 px, sol, guantes, poca señal, poco tiempo.
3. **Ingeniero senior:** Node, Express, Prisma, PostgreSQL, React y PWA.
4. **QA y seguridad.**

## Qué es la app

- **SAPSA** es un grupo ganadero de Uruguay con 6 estancias y 2 feedlots, unas 13.300 cabezas.
- **La app** es una PWA. Lleva el stock por potrero y por lote, los movimientos, el valor del ganado y el análisis de los feedlots.
- **Está publicada en Render:**
  - el plan es gratis;
  - **la base `sapsa-db` vence a los 30 días: se creó el 17/11/2026**;
  - cada push a `main` publica.
- **El dueño usa iPhone.** Diego es quien la construye. No es programador de carrera: hay que explicarle de a un paso.

## Antes de opinar, leé

- `CLAUDE.md`, entero: es el estado del proyecto, día por día.
- `docs/DECISIONES.md`, sobre todo §6 (patrones que valora Diego), §10 y §11.
- `docs/PECUARIA.md`.
- `docs/PROPUESTA_MOVIMIENTOS.md`.
- `docs/LOGISTICA_MOVIMIENTOS.md`: tiene un plan de 8 fases; la fase 1 ya está hecha.
- **El código:**
  - `server/prisma/schema.prisma`;
  - `server/src/` (pecuaria, auth, users, roles, audit);
  - `client/src/` (pages, components, navegacion, context, hooks);
  - `render.yaml`;
  - los tests en `server/test/` y `client/src/**/*.test.*`.

## Qué tenés que evaluar

1. **Para qué es el MVP.** Por cada persona (dueño, jefe pecuario, encargado, capataz), qué tarea hace en la app, con qué frecuencia y si hoy la puede hacer de punta a punta sin trabarse. Marcá los huecos.
2. **Inventario de lo que hay:** pantallas, acciones y datos. Una tabla corta.
3. **Lo que falta para un MVP redondo.** Funciones, ordenadas por valor ÷ esfuerzo. Pensá, entre otras cosas, en:
   - la carga diaria desde el celular;
   - el "+" con "Todas las estancias";
   - el bastón (`LOGISTICA_MOVIMIENTOS.md`);
   - recuentos;
   - descargar a Excel;
   - el informe para el dueño;
   - avisos;
   - trabajar sin señal;
   - la conexión con CIGAM, solo lectura;
   - el módulo Parcelas (`DECISIONES.md` §9).
4. **Problemas en el código.** Bugs probables, casos borde y textos en inglés o sin voseo, citando `archivo:línea`. Mirá cálculos, fechas (zona horaria de Uruguay), reversiones, permisos y alcance por estancia.
5. **Experiencia en el celular, leyendo el código:** pantallas que no entran a 375 px, botones chicos, pasos de más y mensajes que no se entienden.
6. **Operación y seguridad.** Por ejemplo:
   - **el vencimiento de la base gratis de Render**: qué pasa y qué hacer, con costos aproximados en USD si los sabés, y si no, "a confirmar";
   - backups;
   - el plan gratis que se duerme;
   - claves expuestas: el 19/11 la URL de la base quedó escrita en un chat y hay que rotar la clave;
   - límites de uso, logs, monitoreo y dependencias con avisos.
7. **Calidad:** tests que faltan, en qué partes y de qué tipo.
8. **Datos:** qué datos faltan o están supuestos (pesos, precios, categorías de corral, área utilizable, "kg por UG" = 250 en Render y 380 en la base local) y cómo completarlos.

## Lo que entregás

Un solo archivo nuevo, `docs/EVALUACION_MVP.md`, en español rioplatense (voseo), claro para Diego. Con esta estructura:

1. **Resumen en 10 renglones:** qué está bien, qué falta y qué es urgente.
2. **Urgente**, en una semana: lo que, si no se hace, puede hacer perder datos o dejar la app caída. Con los pasos concretos.
3. **Huecos por persona:** una tabla.
4. **Inventario:** una tabla.
5. **Bugs y riesgos en el código:** una tabla con `archivo:línea`, qué pasa, gravedad y arreglo propuesto.
6. **Experiencia en el celular:** una lista corta.
7. **Hoja de ruta para cerrar el MVP:**
   - fases chicas, ordenadas;
   - cada una con qué incluye, por qué va en ese lugar, un esfuerzo aproximado (chico, medio o grande) y **cómo lo prueba Diego**: el criterio de aceptación.
   - Respetá cómo trabaja Diego: de a un paso y con un OK al final de cada fase.
8. **Lo que dejaría para después del MVP.**
9. **Preguntas para Diego, el jefe o el encargado:** como máximo 10, las que cambian lo que se construye.

## Reglas que no se negocian

- **No cambies código, schema, base ni git.** Solo creás `docs/EVALUACION_MVP.md`.
- **No corras tests ni servidores:** el otro agente está usando la base de test.
- **No leas** `.env`, `server/.env*`, ni nada con contraseñas, ni `docs/info santi/` ni `docs/img/`.
- **Confidencialidad:** nunca nombres de personas, datos de clientes o proveedores, ni servidores o claves. Los datos del campo y del ganado sí se pueden usar.
- Si buscás en internet (por ejemplo los precios de Render), no mandes datos de SAPSA en las búsquedas.
- **Al terminar,** contestá en un párrafo corto con lo más importante y dónde quedó el archivo.
