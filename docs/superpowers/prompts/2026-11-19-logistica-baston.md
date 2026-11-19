# Prompt: logística de movimientos y uso del bastón

> Armado por Claude Code a pedido de Diego (19/11/2026). Lo ejecuta un agente aparte. El resultado va en `docs/LOGISTICA_MOVIMIENTOS.md`.

---

## Tu rol

Sos dos expertos trabajando juntos:

1. **Experto en logística de ganadería vacuna extensiva en Uruguay.** Conocés el manejo del rodeo, los potreros, los encierres, los corrales y el feedlot. También conocés los traslados entre campos, las ventas a frigorífico, la trazabilidad con caravana electrónica (SNIG) y la guía de propiedad y tránsito (DICOSE).
2. **Diseñador de apps para el campo.** Pensás en un capataz o en un encargado que usa el celular a caballo o en la manga, con sol, con guantes, sin señal y con poco tiempo.

## Qué es la app

- **SAPSA** es un grupo agroindustrial de Uruguay con 6 estancias (siglas EG, ES, ER, ESP, ELS y LA PALMA) y unas 11.000 cabezas de vacunos.
- **La app** es una PWA para el celular. El dueño usa iPhone, así que no hay Bluetooth desde el navegador.
- **Qué hace hoy:** lleva el stock por potrero y por **lote**, y registra los movimientos.
- **Quién la usa:** Dirección, el jefe pecuario, los encargados de estancia y los capataces.
- **Cómo se trabaja:** los textos de la app van en español rioplatense, con voseo. Diego valora ir de a un paso y que cada cosa tenga su motivo.

### Antes de opinar, leé esto

- `docs/DECISIONES.md`: §10 (módulo Pecuaria: la definición de lote, mover animales, el bastón) y §11 (rediseño, traslados, plan).
- `docs/PECUARIA.md`:
  - §6: el formato real del archivo del bastón True Test.
  - §7c y §7d: lo relevado en CIGAM (12 tipos de evento, causas, bastón ya configurado allá).
- `docs/PROPUESTA_MOVIMIENTOS.md`: todos los tipos de movimiento y evento, a qué nivel se aplica cada uno y las preguntas abiertas para el encargado.
- `server/prisma/schema.prisma`: los modelos `Lote`, `VersionStock`, `VersionStockLinea`, `Movimiento`, `EventoMovimiento`, `TipoMovimiento`, `SesionBaston` y `LecturaBaston`. Las dos últimas existen en la base, pero todavía no tienen código.
- `server/src/seed/pecuaria.catalog.js`: los 27 tipos de movimiento, con su efecto (MUEVE, ENTRA, SALE, CATEGORIA, REGISTRO) y sus niveles (CAMPO, POTRERO, CATEGORIA, LOTE, PARTE_LOTE).
- `server/src/pecuaria/movimientos.service.js`: la función `planificar()` y los modos SUMAR, NUEVO, ENTERO, CATEGORIA, entre campos y múltiple.
- `client/src/pages/MoverPage.jsx`: la pantalla de mover.

### Reglas del modelo hoy

- **Un lote** es un grupo que arma el encargado porque los animales cumplen las mismas condiciones. Tiene una sola categoría y está en un solo potrero a la vez. Un potrero puede tener varios lotes.
- **La app no conoce los animales uno por uno.** Cuenta cabezas por lote, con un peso promedio opcional.
- **Para mover**, se elige un lote de origen y cuántas cabezas salen. En el destino hay tres opciones: sumarlas a un lote que ya está, formar un lote nuevo, o mover el lote entero si van todas.
- **El bastón** (True Test, exportado con Data Link a un `.txt`) trae una caravana electrónica por línea, con la fecha y la hora, sin peso.

## El problema que planteó Diego

1. **La falla.** Si mueve **parte** de un lote a un potrero vacío, la app solo lo deja si forma un lote nuevo. Él quiere poder **repartir un mismo lote entre varios potreros**. El riesgo es que, en ese caso, la app solo cuenta cabezas y no sabe qué animales quedaron en cada potrero.
2. **El bastón cuesta trabajo:** juntar el ganado, pasarlo por la manga y leer cada caravana. Diego quiere que la app sea **lo más fácil de usar posible**:
   - El bastón **solo cuando hace falta de verdad**: siempre cuando entra o sale ganado del establecimiento, y en lo demás, las menos veces posible.
   - Además, las veces que un experto en logística lo considere necesario.
3. **Subir el archivo:** en los movimientos donde se use el bastón, poder subir el archivo de lecturas dentro del mismo registro en la app.

## Qué tenés que evaluar

Analizá **todas las posibilidades**, no solo la obvia. Como mínimo:

1. **Lote partido entre potreros.** Pesá estas opciones y cualquier otra que se te ocurra, y recomendá una:
   - (a) Un lote puede estar en varios potreros, con cabezas por potrero.
   - (b) Las partes son "sub-lotes" de un mismo lote madre.
   - (c) Se forma un lote nuevo, pero con un nombre automático y sin pasos de más.
   - (d) Otra.

   Pensá qué pasa después:
   - cuando se vuelve a juntar;
   - cuando una parte cambia de categoría;
   - con el peso promedio;
   - en el Resumen y en los cálculos de carga por potrero;
   - cuando una parte sale de la estancia.
2. **El bastón, tipo por tipo.** Para cada uno de los 27 tipos de movimiento y evento, clasificalo así:
   - **Obligatorio:** sin el archivo no se puede registrar.
   - **Recomendado:** la app lo sugiere y avisa si falta.
   - **Opcional.**
   - **No aplica.**

   Para cada uno, explicá el **porqué logístico**: el riesgo de error, el costo de equivocarse, lo que se exige por trazabilidad o por guía, y lo que cuesta juntar el ganado. Distinguí movimientos internos, entre estancias del mismo grupo, y entradas y salidas del grupo.
3. **Cuándo alcanza con contar.** Qué situaciones se pueden registrar solo con cabezas sin perder control, y qué controles baratos los compensan:
   - un recuento periódico por potrero;
   - el cierre contra la planilla del encargado;
   - el control contra DICOSE al 30/06;
   - avisos de diferencias.
4. **Cómo sería subir el archivo dentro del movimiento:**
   - En qué paso del formulario va.
   - Qué valida la app: el formato, las caravanas repetidas, la fecha contra la del movimiento, si la cantidad coincide con las cabezas cargadas.
   - Qué hace si hay diferencias.
   - Qué se guarda.
   - Cómo llega el archivo al celular o a la compu. Si no lo sabés, dejalo como pregunta.
5. **El registro por animal, de a poco.** Cómo ir armando "qué caravana está en qué lote y en qué potrero" con cada uso del bastón, sin obligar a caravanear todo de golpe. Qué podría avisar la app cuando lo sepa ("esta caravana figura en otro potrero", "faltan N del lote"). Y qué cambia en el modelo de datos. Contalo en palabras, sin escribir código.
6. **Lo más fácil de usar.** Para el flujo más común de cada nivel (capataz, encargado), cuántos toques y qué datos pide la app, y qué puede deducir o sugerir sola.
7. **Riesgos y trampas:**
   - lecturas fallidas del bastón;
   - animales sin caravana o con la caravana perdida;
   - terneros sin caravanear;
   - el mismo archivo subido dos veces;
   - una sesión que mezcla dos lotes;
   - trabajo sin señal.

Si no estás seguro de una norma de Uruguay (SNIG, DICOSE, guías), **decilo**: marcala como "a confirmar con el encargado" o con el escribano o el veterinario. No la des por cierta.

## Lo que entregás

Un solo archivo nuevo, `docs/LOGISTICA_MOVIMIENTOS.md`, en español rioplatense (voseo), claro para alguien que no es programador. Con esta estructura:

1. **Resumen en 10 renglones**, con las recomendaciones principales.
2. **Lote partido entre potreros:** las opciones con sus pros y contras, tu recomendación y por qué.
3. **Tabla del bastón:** una fila por cada uno de los 27 tipos, con estas columnas:
   - tipo;
   - interno / entre estancias / entra o sale del grupo;
   - nivel de bastón (Obligatorio / Recomendado / Opcional / No aplica);
   - porqué, en una línea.
4. **Cuándo alcanza con contar** y los controles que lo compensan.
5. **Subir el archivo del bastón al registrar:** el flujo paso a paso, como texto. Si ayuda, un boceto en texto de la pantalla del celular.
6. **Registro por animal de a poco:** qué se gana en cada etapa.
7. **Cambios al modelo de datos:** solo en palabras, con las tablas y los campos que tocaría.
8. **Plan por fases:** cada fase chica, con algo que Diego pueda probar, ordenadas por valor y por esfuerzo.
9. **Preguntas para el encargado o el jefe pecuario:** como máximo 10, las que cambian lo que se construye.
10. **Riesgos.**

## Reglas que no se negocian

- **No toques el código, el schema, la base ni git.** Solo creás `docs/LOGISTICA_MOVIMIENTOS.md`.
- **No leas** `.env`, `server/.env*` ni nada con contraseñas.
- **Confidencialidad:**
  - Los datos del campo y del ganado (hectáreas, potreros, cabezas, categorías) se pueden usar.
  - **Nunca:** nombres de personas, datos de clientes o proveedores, RUT o CNPJ, servidores, usuarios ni contraseñas.
  - No leas `docs/info santi/` ni `docs/img/`.
- Si buscás en internet (normativa de SNIG o DICOSE, prácticas de manejo), no mandes datos de SAPSA en las búsquedas.
- Al terminar, contestá en un párrafo corto con lo más importante y dónde quedó el archivo.
