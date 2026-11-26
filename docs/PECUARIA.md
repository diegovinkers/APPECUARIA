# Pecuaria: fuentes de datos y hallazgos

Ficha técnica del módulo Pecuaria (DECISIONES §10). Actualizada: 17/11/2026.
Las fuentes viven en `docs/info santi/` y `docs/img/` (fuera de git).
Regla de confidencialidad: los datos del campo y del ganado se usan completos; los sensibles, nunca (CLAUDE.md).

## 1. Los campos y sus siglas

| Sigla | Campo | Estado | Notas |
|---|---|---|---|
| GG | Granja La Gateada | Confirmada | |
| EG | Estancia La Gateada | Confirmada (Diego, 17/11) | En la planilla el bloque EG incluye los pivots de la granja; el feedlot va en hoja aparte |
| ES | Estancia El Silencio | Confirmada | "ES wagyu" en el DICOSE: cría Wagyu |
| ER | Estancia El Rincón | Confirmada | Vacas Wagyu en campo natural (Cinco Bomba, Albano) |
| ELS | La Seda | **Confirmada por datos (17/11)** | Novillos 559≈554 y vaquillonas 298≈300 contra la foto de stock del 12/11; feedlot propio |
| ELP | La Palma | Campo confirmado; la sigla ELP es supuesta | En la planilla figura "LA PALMA", con un solo potrero cargado ("altiplano", 390 terneros). **No está en el DICOSE del 30/06** |
| ESP | ¿? | **Nombre desconocido** | 522 ha, 9 potreros; "ESP wagyu" en el DICOSE; nota "54 CUT" |

"Cerro" es un potrero de campo natural de EG (575 terneros al 13/11), no un establecimiento aparte (a confirmar; CONTEXTO lo tenía como "Estancia Cerro").

## 2. Planilla de cargas (`cargas ganado sapsa.xlsx`)

- **Hojas:** una por fecha (`13.11.2026`, `3.11.2026`) más `corral 12.11.2026` (feedlots). En el celular del encargado se ven las pestañas "Carga Actual" y "Moviminetos" (sic): esa versión todavía no la tenemos.
- **Columnas** (leer por nombre; el orden y la presencia cambian entre versiones): Campo, Uso de Suelo, Potrero, Has, Categoria, N° cabezas, Cab./ha, Promedio, Kilos lote, Kg PV/ha, UG/ha, Fecha (siempre vacía).
- **Fórmulas:** Cab./ha = cabezas ÷ has · Kilos lote = cabezas × promedio · Kg PV/ha = kilos ÷ has · UG/ha = Kg PV/ha ÷ 380.
- **Usos de suelo vistos:** Arroz, C. Natural (CN), PP+ (pradera permanente), Raygras, Avena, Sorgo, S. Silero, Megamix, Festuca (nueva/vieja), Semillero, Pivot (sin uso cargado). En el resumen por campo de la foto se agrupan en CN / Verdeos / Corral.

### Trampas confirmadas (17/11/2026)

1. **Tipos mezclados:** en `13.11` los números son números; en `3.11`, texto con coma decimal ("82,83"). Hay que normalizar al importar.
2. **Totales viejos:** las filas "Total" no siempre se recalculan. En `13.11`: ER dice 1.183 ha pero las filas suman 1.880 (se agregaron has reales de Cuaro Grande, Cinco Bomba y Albano sin tocar el total); ER dice 285.460 kg y las filas suman 350.240 (el total quedó del 3/11); EG dice 1.357.300 kg y suman 1.216.300; ELS dice 374.700 kg y suman 429.450. **La app recalcula todo, nunca lee totales.**
3. **Hectáreas "1" de relleno:** 4 potreros de ER (Cuaro chico, Fondo, cuatro, Casilla) y 13 filas de EG (P 1…P 55, Cerro, Pastoreo). Generan Kg PV/ha y UG/ha absurdos (ej.: 112.500 kg/ha). Las has reales tienen que salir de TEA3TALHAO.
4. **UG/ha roto en la hoja nueva:** en `3.11`, UG/ha = Kg PV/ha ÷ 380 en 61 filas (consistente). En `13.11`, UG/ha repite Cab./ha en 60 filas: la fórmula se pisó.
5. **Kilos pegados:** en ESP (`13.11`) se editaron cabezas sin recalcular kilos (ej.: "4 y 5" dice 19.000 kg = 50 cab × 380, pero hay 44 cabezas). En ELS (`3.11`) hay kilos sin cabezas (hoja 6: 132.000 kg con 0 cabezas) y campo natural con cabezas pero 0 kilos.
6. **2.352 cabezas sin promedio** en `13.11` (10 filas, casi todas vacas de cría de EG): sus kilos quedan en 0 y el total de kilos subestima.
7. **Potreros agrupados con notaciones distintas:** "2 / 3 /3,1", "8 y 10", "9/9.1", "P12/P13", "8.2/3/4/5", "18.1/2/3/4". El `Abreveatura` de TEA3TALHAO agrupa subdivisiones: es el candidato para mapearlos.
8. **Categorías en texto libre:** 20+ variantes (Vacas/vacas, Ternero chicos/Terneros chicos/terneras, VAQ. PARIDA, vacas primiparas, vacas CUT, Vacas invernar, vacas wagyu, Toros, Semillero…). Hace falta un catálogo con alias.
9. **Sospecha de error de carga:** en `13.11`, ES "8 y 10" dice "vacas" con promedio 200 kg (en `3.11` eran Terneras). A confirmar.
10. **#DIV/0!** en varias filas (promedio u has vacíos): el import tiene que tolerar errores de fórmula.

## 3. La regla UG (deducida)

**1 UG = 380 kg de peso vivo.** Surge de la hoja `3.11`: UG/ha = Kg PV/ha ÷ 380 en todas las filas con datos, para todas las categorías (el "factor por categoría" es solo promedio ÷ 380: vacas 450/380 ≈ 1,18; toros 500/380 ≈ 1,32; terneros 200/380 ≈ 0,53; novillos 220/380 ≈ 0,58). No hay tabla fija por categoría: la UG sigue al peso. **Confirmar con el encargado** y avisarle de la fórmula rota en `13.11`.

## 4. Hoja de corrales (feedlots, al 12/11/2026)

Dos bloques: **FEEDLOT LA SEDA** (10 corrales, 891 cabezas) y **FEEDLOT LA GATEADA** (11 corrales, 1.097 cabezas).
Columnas: Corral, Comederos (Hormigón), mts.com., Mt/cabeza, Cabezas, fecha inicio, kg inicio, DIAS, salidas, observación (gordos, terneros nuevos, vaquillonas, toros nuevos, "ter. 15M"). La fecha de inicio a veces es texto ("24-sep", "15-sep") y "kg inicio" a veces es rango ("230-250"): otro import tolerante.

## 5. DICOSE al 30/06/2026 (`DICOSE 30.2026. PRECIOS 30.2026.xlsx`)

- **Hoja STOCK:** stock por establecimiento (EG, "ES wagyu", ER, "ESP wagyu", ELS) con categorías finas por franja de edad, como TEA4CATANIMAIS: Toros, Vacas Inv, Vacas Cría, Corral, Nov Wagyu, Nov 1-2 / 2-3 / +3, Vaq +2 preñada / vacía, Vaq 1-2, Terneros, Terneras. **También ovinos** (carneros, ovejas, capones, borregos, corderos).
- **Totales vacunos:** EG 8.140 (incl. corral 1.345, +250 salidas) · ES 1.317 · ER 1.345 · ESP 307 · ELS 3.791 (incl. corral 953, +200 salidas) → **14.900**. Ovinos: 436.
- **Hoja KG.$:** por categoría: cantidad, kg, $/kg o precio/bulto y total USD. Valuación: EG 10,09 M + ES 1,49 M + ER 1,37 M + ESP 0,40 M + ELS 4,18 M ≈ **USD 17,5 M** (+ USD 35,7 mil de ovinos).
- Detalle menor: en ER hay 41 cabezas (¿vaq 2-3?) en STOCK que no aparecen valuadas en KG.$, y el encabezado repite "NOV. 2-3".

## 6. Bastón True Test

- **Formato** (export de Data Link, `.txt`): una lectura por línea, sin encabezado:
  `[|A0000000858000066574797|21092026|102436||.|.|.|.|.|.|.|.|.|.|]`
  Campos separados por `|`: EID de la caravana electrónica (A + ceros + **858** = código de Uruguay + número), fecha DDMMAAAA, hora HHMMSS, y 11 campos vacíos (`.`): **estas sesiones no traen peso**.
- **Sesiones analizadas:**
  - `TERA.EG..txt`: 948 lecturas el 21/09/2026, de 10:24 a 18:43. Sin caravanas repetidas.
  - `VAQ.WAG.1.txt`: 125 lecturas el 09/11/2026, de 15:09 a 16:43. Sin repetidas.
  - Sin cruce entre las dos sesiones (0 caravanas en común).
- **El nombre del archivo codifica la sesión:** TERA.EG = terneras de EG; VAQ.WAG = vaquillonas Wagyu (supuestos). Falta: modelo del equipo y si otras sesiones exportan peso.

## 7. Cruce planilla (13/11) ↔ DICOSE (30/06)

Separados por 4,5 meses: no tienen por qué cerrar; sirven para ver magnitudes y movimientos.

| Campo | DICOSE 30/06 | Planilla 13/11 (+corral 12/11) | Diferencia | Lectura |
|---|---|---|---|---|
| EG | 8.140 | 6.255 + 1.097 = 7.352 | −788 | Vacas de cría bajan (3.892 → 2.430) y terneros suben (2.201 → 3.825): pariciones de primavera + ventas |
| ES | 1.317 | 1.144 | −173 | Salieron toros y otras categorías |
| ER | 1.345 | 1.172 | −173 | Al 30/06: 678 vaq 1-2 y 464 nov 1-2; al 13/11: 370 vaquillonas y 732 novillos (recategorización + movimientos) |
| ESP | 307 | 312 | +5 | **Prácticamente cierra** |
| ELS | 3.791 | 1.661 + 891 = 2.552 | −1.239 | Terneros 1.819 → 804: la mayor salida (ventas del feedlot: "gordos") |
| La Palma | no está | 390 | +390 | ¿En qué DICOSE declara? |
| **Total** | **14.900** | **12.922** | **−1.978 (−13 %)** | Compatible con ventas de gordos; el DICOSE ya anota 450 salidas de corral |

Validación con la foto del 12/11 (resumen por campo): La Seda novillos 554 ≈ 559 y vaquillonas 300 ≈ 298 de ELS ✓; El Rincón vaquillonas 370 = 370 ✓ (y llama "terneros" a los 732 novillos de la planilla); Gateada "CN terneros" 982 = potrero Frente A ✓; La Palma 390 = 390 ✓.

## 7b. Mapa de La Gateada (`docs/img/MAPA CULTURAS GATEADA ZF 26-27 VERANO 261008 DF.pdf`, 17/11/2026)

Mapa del plan agrícola (título "ZF 2026-27 verano", 08/10/2026; la leyenda dice "Safra 25/26"). El PDF no tiene texto: las etiquetas se leen de la imagen.

- **Resuelve:**
  - "8.8/9" = 8.8 (6,98 ha) + 8.9 (7,32) = 14,30, igual que la planilla.
  - El "72.1" de 1,31 ha de la planilla es el **72.10** (Excel borró el cero). El 72.1 real tiene 32,89 ha y con el 72.2 (53,76) da los 86,65 de "72.1/2". El importador lo corrige solo y avisa.
  - "81.1/2/3/4" en realidad abarca 81.1 a 81.6 (185,99 ha ≈ 186).
  - Coinciden las hectáreas de: pivots 1-7, 8.1, 10.2, 10.3, grupo 42, 45, 45.1, 46, 46.1, 52.x, 62.2/3, todos los 72, 74, 76.1/2, 91, 91.1, 91.1B, Oliveira (909).
- **No resuelve:** las hectáreas de los potreros de campo natural (P1, P2, P3, P4, P6, P9, P10, P15, P43, P53, P55, Cerro, Pastoreio aparecen sin número) y Frente A / Frente B (no están en el mapa).
- **No cierra:** 44.1 (mapa 30,1 / planilla 39,32), 44.2a (11,89 / 24,22), 51 (planilla 95,78; en el mapa 51.1 + 51.2 + 51.3 ≈ 86,78).
- **Uso de suelo:** el mapa muestra el plan agrícola (maíz, sorgo F/S, PP1); la planilla, el pastoreo actual. El catálogo de la app sale de la planilla (decisión del 17/11).

## 7c. Categorías de animales en CIGAM (`TEA4CATANIMAIS`, consulta de Diego, 17/11/2026)

- **Columnas:** ID_CATEGORIA (decimal), DESCRICAO (char), ID_FAIXA_IDADE, ID_SEXO, CD_MATERIAL (varchar), ID_ESPECIE.
- **ID_FAIXA_IDADE e ID_SEXO están vacíos (NULL) en todas las filas:** la edad solo está en el nombre ("1-2", "2-3"). Las reglas de cambio de categoría por edad no salen de CIGAM: hay que definirlas con el encargado.
- **Cada categoría es un material de stock:** CD_MATERIAL 401.001.0000xx (grupo 401, subgrupo 001 de Gestão de Materiais). Las compras y ventas de hacienda podrían pasar por CIGAM como movimientos de esos materiales (a revisar).
- **Primeras 20 categorías** (ID · nombre): 1 TERNEIRO · 2 NOVILLO 1-2 · 3 NOVILLO 2-3 · 4 TERNEIRA · 5 VACA INV · 6 TORO GENERAL · 7 TORO PURO ANGUS · 8 TORO PURO BRANGUS · 9 TORO PURO BRANGUS 1-2 · 10 TORO PURO WAGYU · 11 TORO PURO WAGYU 1-2 · 12 VACA CRIA · 13 VACA CRIA WAGYU · 14 VACA INV WAGYU · 15 NOVILLO WAGYU 1-2 · 16 TERNERO WAGYU · 17 TERNERA WAGYU · 18 VAQUILLONA 1-2 · 19 VAQUILLONA 1-2 PRENA · 20 VAQUILLONA 1-2 INV. **Son 37 en total.** Del 21 al 37: 21 VAQUILLONA +2 · 22 VAQUILLONA +2 PRENA · 23 VAQUILLONA +2 INV · 24 BORREGA · 25 BORREGO · 26 CABALLO · 27 CABALLO DOMADO · 28 CARNERO · 29 CORDERO · 30 CORDERA · 31 NOVILLO +3 · 32 NOVILLO WAGYU · 33 OVEJA · 34 OVEJA CRIA · 35 PADRILLO · 36 POTRILLO · 37 YEGUA.
- **La especie está mal cargada:** las 37 tienen ID_ESPECIE = 1 (BOVINO), también las ovejas y los caballos. La especie real sale del **subgrupo del material**: 401.**001** = bovinos, 401.**002** = ovinos, 401.**003** = equinos.
- **TEA4ESPECIES** tiene una sola especie: 1 BOVINO, creada el 27/08/2025 (cuando se configuró la pecuaria en CIGAM). No exige caravana (EXIGIR_INFORMAR_BRINCO = 0). Material del macho: TERNEIRO (401001000016); de la hembra: TERNEIRA (401001000017). NUM_PESAGEM_CLASSIF = 2.
- **TEA4SEXO:** 1 MACHO (M), 2 FEMEA (F), para la especie 1.
- **Separa por raza (Wagyu) y por estado (cría, invernada, preñada);** la planilla no. La app todavía no tiene la raza como dato aparte.
- **Equivalencias propuestas con la app** (a confirmar con el encargado): Terneros = TERNEIRO (1); Terneras = TERNEIRA (4); Vacas invernar = VACA INV (5); Vacas y Vacas paridas = ¿VACA CRIA (12)?; Vaquillonas paridas = ¿alguna VAQUILLONA?; Terneros chicos, Terneras chicas y Vacas CUT no existen en CIGAM.
- **Otras tablas TEA4 encontradas:** TEA4ESPECIES, TEA4SEXO, TEA4SEXOITGTAXMVTO, TEA4VW_SEXOXESPECIES, TEA4VW_ANIMALXCATEG, TEA4DIETAESPECIE (dietas, ¿feedlot?), TEA4PRECOSESPECIE y TEA4REGPRECOESPECIE (precios por especie), TEA4CAPACBAIXAXESPECIE.

## 7d. Tablas TEA4 con datos en CIGAM (consulta de Diego, 17/11/2026)

Con filas (tabla · filas): AREAMANEJO 154 · AREAMANEJOXTALHOES 2 · AREAMANXCAPESP 134 · CATANIMAIS 37 · CAUSAMOTIVOCONSTACAO 4 · CORANIMAIS 3 · DEFMODTRUETEST 10 · DEPARATRUETEST 4 · DIETAESPECIE 7 · DIMENOCUPACAO 88 · DIMENOCUPXTALHOES 115 · ESPECIES 1 · EVENTOSANIMAL 1 · FAIXASIDADE 4 · FINLOTEMANEJO 4 · LOGUTILBRINCO 94 · MODPLANMANEJO 1 · PARAMFRIGORIFICO 1 · RACA 5 · REGDIETAESP 4 · SAFRAPECUARIA 1 · SEXO 2 · SIMBOLOTATUAGEM 1 · SISTMANEJO 3 · TIPOEVENTO 12 · TIPOLAYOUTTRUETEST 5 · TIPOLEITCOCHO 7 (todas con prefijo TEA4).

- **Eventos:** TIPOEVENTO (12 tipos), CAUSAMOTIVOCONSTACAO (4 causas o motivos), EVENTOSANIMAL (1 evento de ejemplo). Vacías: ANIMDOEVENTO, LOTMANEVENT, PARTESCOND, PESAGEMVEICULOS, CAPACBAIXAXESPECIE.
- **Franjas de edad:** FAIXASIDADE (4), aunque las categorías no las usen (ID_FAIXA_IDADE en NULL).
- **Bastón True Test ya configurado en CIGAM:** DEFMODTRUETEST (10), TIPOLAYOUTTRUETEST (5), DEPARATRUETEST (4). Sirve para la fase 5.
- **Catálogos:** RACA (5), CORANIMAIS (3), FINLOTEMANEJO (4, finalidad del lote), SISTMANEJO (3), DIETAESPECIE (7) y REGDIETAESP (4), TIPOLEITCOCHO (7, lecturas de comedero del feedlot), LOGUTILBRINCO (94, uso de caravanas), PARAMFRIGORIFICO (1).
### Contenido (consulta de Diego, 17/11/2026)

- **Tipos de evento (TEA4TIPOEVENTO), id · nombre · clase · operación de stock · pide causa:**
  1 IDENTIFICAÇÃO INICIAL · 2 · — · sí — 2 INSEMINAÇÃO · Y — 3 PESAGEM · P — 4 TRANSFERÊNCIA DE ÁREA · 1 · 82500 — 5 TRANSFERÊNCIA DE LOTE · M · 82500 — 6 MORTE · X · 85010 · sí — 7 CONSUMO · C · 85010 · sí — 8 VACINA CARBÚNCULO · V — 9 VACINA AFTOSA · V — 11 ECOGRAFIA · I — 12 NASCIMENTO / PARTO · N — 13 ALIMENTAÇÃO · A (no hay id 10; son 12 en total).
  - La operación 82500 (transferencias) y 85010 (muerte, consumo) parecen tipos de operación de stock: el animal es un material, y la muerte o el consumo serían una salida de stock.
- **Qué permite cambiar cada evento** (categoría, lote, área, sexo, raza, caravana, mueve stock): 1 Identificación: categ, sexo, raza, caravana · 2 Inseminación y 3 Pesada: categ, sexo, raza · 4 Transferencia de área: categ, área, sexo, raza, caravana, stock · 5 Transferencia de lote: lote, área, caravana, stock · 6 Muerte y 7 Consumo: categ, sexo, raza, caravana, stock · 8 Vacuna: categ, sexo, raza.
- **Causas o motivos (TEA4CAUSAMOTIVOCONSTACAO):** CA-001 COBRA (tipo C) · MO-001 MORDIDA (M) · CO-001 APÓS 3 DIAS (T) · CO-002 APÓS 7 DIAS (T).
- **Franjas de edad (TEA4FAIXASIDADE), en meses:** 1 hasta 12 · macho · TERNEIRO (1) — 2 de 13 a 24 · macho · NOVILLO 1-2 (2) — 3 de 25 a 36 · macho · NOVILLO 2-3 (3) — 4 de 25 a 36 · hembra · VACA INV (5). Es la regla de edad de los machos; para las hembras está incompleta.
- **Razas (TEA4RACA):** Black Angus, Brangus, Red Angus, Wagyu, Hereford.
- **Finalidad del lote (TEA4FINLOTEMANEJO):** 1 Engorda · 2 Destete · 3 Terminación (gordura) · 4 Recría.
- **Sistemas de manejo (TEA4SISTMANEJO), ciclo en días · GMD esperada · animales/ha:** Confinamiento 120 · 1,5 · 500 — Campo natural 360 · 0,4 · 0,7 — Pastura 0 · 0 · 0.
- **El único evento cargado (TEA4EVENTOSANIMAL):** tipo 13, del 17/11/2026 14:45, situación P (¿pendiente?), origen A, sin descripción. Parece una prueba.
- **Bastón en CIGAM (TEA4TIPOLAYOUTTRUETEST + TEA4DEFMODTRUETEST):** 5 formatos (TRUE-TEST (TESTE), MODELO 2, TRUE-TESTE (MO…), EXCEL INTERNO con ";", MODELO PESAGEM), todos desde la línea 2 (con encabezado), para los eventos 1 (identificación), 5 (transferencia de lote) y 3 (pesada). Cada formato dice en qué columna va cada dato: I = identificación (caravana), D = fecha (YYYY-MM-DD o dd-mm-yyyy), S = ¿sexo?, P = peso. **Ninguno coincide con los archivos reales del bastón** (separados por "|", sin encabezado, fecha DDMMAAAA): parecen pruebas de configuración.

## 8. Preguntas para el encargado

1. ¿Cuándo empieza y termina la zafra pecuaria?
2. ¿Qué campo es ESP? ¿Dónde declara La Palma su DICOSE?
3. ¿1 UG = 380 kg de peso vivo? (Y avisarle: en la hoja del 13/11 la fórmula de UG/ha quedó rota.)
4. Modelo exacto del bastón; ¿exporta peso en otras sesiones?
5. La hoja "Moviminetos": conseguirla y ver qué registra.
6. "WAG" = ¿Wagyu? ¿"TERA" = terneras?
7. Hectáreas reales de los potreros con "1" de relleno (ER y EG) y de "altiplano" (La Palma).
8. ES "8 y 10" del 13/11: ¿son vacas de 200 kg o terneras?
9. ¿Los ovinos entran en la app?

## 9. Procesos de reproducción con eventos sugeridos (pedido del 22/11/2026)

"Proyecto" y "proceso" son lo mismo: el `Proceso` de la tabla `proceso` (diseño `docs/superpowers/specs/2026-11-20-procesos-design.md`). Lo nuevo se construye encima, sin duplicar.

### Decisiones (aprobadas por Diego, 23/11/2026)

- **Menú:** Procesos es una página propia (`/pecuaria/procesos`), con su botón en la barra de abajo donde estaba Eventos. Eventos queda dentro de Registro (pestaña Eventos, botón "Anotar evento") y en las fichas del potrero y del lote. Los eventos de un proceso se cargan desde la página del proceso.
- **Dos tipos:** entore e inseminación (la `modalidad` TOROS / IATF que ya existe).
- **Vacas y terneros por lote**, como cantidades; un evento puede tocar solo una parte del lote. **El toro, uno por uno** (identificación y genética), dentro de un lote de toros: asignarlo a un proceso mueve 1 cabeza con el mecanismo de siempre. Los toros cuentan en el stock del potrero mientras están ahí.
- **Categoría y estado, separados.** La madre queda en su categoría ("Vacas de cría") y no cambia; el estado (vacía, preñada, parida con ternero al pie) sale del rol del lote en el proceso, con nombres editables. Los lotes que ya están en "Vacas paridas" o "Vacas preñadas" quedan como están.
- **Una vaca en dos procesos:** una parida con cría al pie puede entrar a un entore nuevo (a los ~70 días del parto). El stock es del lote: el proceso solo lo vincula, no se duplica.
- **Ecografía en varios días y por partes**, en los dos tipos. Después de cada parte: mover las preñadas, mover las vacías o dejar todo. Toros: sacarlos, el mismo otra vez o traer otro.
- **Vacías:** se mueven o se dejan, y pueden empezar un proceso nuevo enganchado al de origen.
- **Parición** en tandas, machos y hembras por separado, al lote del mes en que nacieron (los primeros, "de punta", se venden primero). Quedan en el potrero o van al de paridas. Caravana del ternero: dato opcional.
- **Destete** sugerido según la lactancia (5 a 7 meses, en meses).
- **Bajas** (muerte de la vaca, del ternero, aborto) en todas las etapas, dentro de "Más opciones". En un aborto, la vaca vuelve a vacía y se ofrece moverla.
- La fecha real manda (se recalcula lo que sigue); la app propone y el usuario confirma; si la realidad se sale del plan, avisa pero no bloquea. El proceso queda abierto hasta que cada vaca tiene destino. Estados de una sugerencia: pendiente, próxima, hoy, atrasada, hecha, descartada.
- Jefe, dueño y encargado pueden hacer lo mismo. El encargado carga desde el celular.

### Reglas del campo (25/11/2026, revisadas con Diego con dibujos)

Encargo: `docs/superpowers/prompts/2026-11-25-procesos-reglas-del-campo.md`. Reemplazan lo que diga distinto en las decisiones de arriba (el "decidir después", el repaso con toro en la IATF, las vacías que "se dejan").

```
IATF ──► Ecografía ──► Preñadas: siguen el ciclo (parición → cría al pie → destete)
                  └──► Vacías ──► Engorde (salen del proceso)
                             └──► Entore con toros (1 sola vez) ──► Ecografía ──► Preñadas: siguen el ciclo
                                                                             └──► Vacías: engorde
Un rodeo que empieza con entore entra directo en "Entore con toros".
```

1. **Al separar, una de las partes cambia de potrero** (en el campo no se distinguen): inseminadas y sin inseminar, preñadas y vacías, ecografiadas y sin ecografiar, terneros y vacas en el destete. El servidor lo controla y la pantalla no deja seguir. **Excepción:** las paridas con su cría y las preñadas conviven hasta el destete (también unas vacías que todavía tienen su ternero al pie en otro proceso).
2. **IATF de una parte:** la app dice "En P8 hay 103"; con 80, no se ofrece quedarse: "Las 80 inseminadas a…" o "Las 23 sin inseminar a…". Con todas, se quedan o se mueven. Lo mismo en otro día de inseminación.
3. **Terminar la inseminación:** las sin inseminar salen del proceso, o se dejan para otro día (no se anota nada). Ya no hay "repaso con toro": si meten un toro antes de la ecografía, se hace por fuera de la app.
4. **Ecografía:** se decide y se separa en el momento ("¿Quiénes se van?": las vacías, las preñadas o las dos). Las vacías de una IATF van a entore con toros o a engorde; las de un entore, solo a engorde (salen del proceso con la categoría de invernar sugerida). Preñadas de varios meses: "¿Las separás por mes?" (sí: un lote por mes, cada uno a su potrero). Por partes: las sin ecografiar se quedan y el proceso dice "Diagnóstico a medias: faltan N" hasta terminar. La revisión mueve las que cambian al lote de su grupo nuevo.
5. **Nunca dos entores seguidos.** Las vacías que se vuelven a servir vienen de una IATF y entran a un entore con toros (nuevo, con "+ Nuevo proceso", o en curso, con una tanda). Los dos procesos lo muestran ("25 vacías → entore X", "25 vienen de la IATF Y").
6. **Abortos y falladas a engorde**, a otro potrero si quedan otras del proceso.
7. **Destete:** los terneros a un potrero y las vacas se quedan o se mueven, con su categoría; no al mismo potrero.
8. **Avisos de mezcla** en la vista previa (no bloquean): dos estados del mismo proceso en un potrero, y categorías que no se suelen juntar según los grupos de manejo de `server/src/pecuaria/mezcla.js` (cría al pie, vientres, engorde de hembras, recría, destetados, engorde de machos; falta que Diego confirme la tabla).
9. **Lo de antes se sigue mostrando:** vacías sin destino (con "Decidir": solo entore, si es de una IATF, o engorde), el repaso con toro de una IATF, y la venta, invernada o reentore viejos.

### Supuestos (valores iniciales, editables en Configuración)

| Plazo | Valor |
|---|---|
| Fin del entore (salida de los toros) | 90 días desde el inicio |
| Ecografía | 30 días después del fin del entore o de cada tanda de inseminación (antes eran 45) |
| Gestación | 283 días |
| Ventana de parición | entore: inicio + 283 a fin + 283; inseminación: cada tanda + 283 |
| Nuevo entore de la parida | 70 días después del parto |
| Destete (lactancia) | 6 meses (antes eran 180 días) |
| Aviso | 7 días antes |

Ejemplo de control (ficticio): inicio 01/12/2026 → fin del entore 01/03/2027 → ecografía 31/03/2027 → parición 10/09 al 09/12/2027; tanda del 15/09/2027 → nuevo entore 24/11/2027 y destete 15/03/2028.

### A averiguar con el encargado

1. Los nombres de los estados y los plazos reales.
2. En la inseminación, ¿hay protocolo previo y toro de repaso?
3. Los cambios de categoría: la vaquillona que pare, los terneros al destete.
4. ¿Hay vacas de cría en la estancia con la que arranca la app?
5. Quién carga los toros de cada estancia (identificación y genética), y cuándo.

### Fuera de esta versión

Seguimiento animal por animal (la caravana queda como dato opcional), genética detallada, destete temporario, notificaciones push, ovinos e IA. Los formularios de evento quedan reutilizables para un bot futuro (con confirmación humana y control de costo).

## Anexo: potreros por campo (hoja 13.11.2026)

Generado desde la planilla el 17/11/2026. Has "1" = relleno (ver trampa 3).

### ES

| Potrero | Has | Uso de suelo | Categoría | Cabezas |
|---|---|---|---|---|
| 1 | 82.83 | Arroz | — | 0 |
| 1.1 | 38.42 | C. Natural | Vacas | 40 |
| 2 / 3 /3,1 | 63.4 | PP+ | Vacas | 165 |
| 4 | 61.66 | Raygras | Vacas | 0 |
| 5 / 5,3 / 6 | 52.34 | Sorgo | — | 0 |
| 5.1/2 | 51.42 | Raygras | Terneros | 113 |
| 8 y 10 | 32.08 | Avena | vacas | 70 |
| 9 | 15.77 | Megamix | terneras | 35 |
| 11.1/2/3 | 43.23 | Arroz | — | 0 |
| P12/P13 | 54.88 | Raygras | Vaquillona | 0 |
| Molino | 62.2 | C. Natural | Vacas | 100 |
| Invernadit | 46 | C. Natural | vacas | 70 |
| Panteon | 171 | C. Natural | Vacas | 220 |
| Largo | 66 | C. Natural | Terneras | 95 |
| Represa | 61 | C. Natural | vacas | 91 |
| Piquete | 78 | C. Natural | Terneros | 145 |

### ER

| Potrero | Has | Uso de suelo | Categoría | Cabezas |
|---|---|---|---|---|
| 1 | 51.3 | Sorgo | — | 0 |
| 2 / 2b | 84.28 | Arroz | — | 0 |
| 3 | 56.53 | — | — | 0 |
| 4 y 5 | 50.15 | Raygras | Novillos | 60 |
| 8 | 53.84 | Arroz | Novillos | 0 |
| 9/9.1 | 33.57 | Raygras | Novillos | 52 |
| 10 | 73.04 | Raygras | Novillos | 40 |
| 12 | 37.48 | Raygras | Novillos | 40 |
| 14 | 77.12 | Arroz | — | 0 |
| 15 | 44.26 | Arroz | — | 0 |
| 16 | 39.02 | PP+ | Vaquillonas | 160 |
| 18.1/2/3/4 | 51.17 | Arroz | — | 0 |
| 19 y 19.1 | 56.82 | Arroz | — | 0 |
| 20 y 21 | 50.36 | Arroz | — | 0 |
| 23/33 | 61.45 | PP+ | Novillos | 40 |
| 22/22.1 | 51.73 | Raygras | Novillos | 50 |
| 24 y 25 | 21.28 | Raygras | Novillos | 0 |
| 26 y 27 | 56.57 | — | — | 0 |
| 34 | 48.53 | Raygras | Novillos | 50 |
| A1 | 33.29 | Raygras | Vaquillonas | 0 |
| A2 | 39.11 | Raygras | Vaquillonas | 0 |
| A3 | 12.44 | Raygras | Vaquillonas | 0 |
| A4 | 48.51 | Sorgo | — | 0 |
| A5 | 44.03 | Arroz | — | 0 |
| Cuaro chico | 1 | C. Natural | — | 0 |
| Cuaro Grande | 500 | C. Natural | Novillos | 400 |
| Fondo | 1 | C. Natural | — | 0 |
| cuatro | 1 | C. Natural | — | 0 |
| Cinco Bomba | 80 | C. Natural | vacas wagyu | 70 |
| Casilla | 1 | C. Natural | — | 0 |
| Albano CN | 120 | C. Natural | Vaquillonas | 210 |

### EG

| Potrero | Has | Uso de suelo | Categoría | Cabezas |
|---|---|---|---|---|
| Pivot 1 | 83.45 | — | — | 0 |
| Pivot 2 | 48.51 | — | — | 0 |
| Pivot 3 | 48.51 | — | — | 0 |
| Pivot 4 | 93.23 | — | — | 0 |
| Pivot 5 | 42 | — | — | 0 |
| Pivot 6 | 80 | — | — | 0 |
| Pivot 7 | 32 | — | — | 0 |
| 8.1 | 85.47 | FESTUCA NUEVA | Ternero chicos | 272 |
| 8.2/3/4/5 | 171.73 | FESTUCA VIEJA | Ternero chicos | 200 |
| 8.8/9 | 14.3 | Raygras | Ternero | 40 |
| 10.2 | 72.35 | Raygras | Ternero | 78 |
| 10.3 | 144.5 | Raygras | Ternero | 350 |
| 42 | 102.43 | Raygras | Ternera | 213 |
| 42.1 | 40.41 | Raygras | Ternera | 117 |
| 42.2 | 5.56 | Raygras | Ternera | 30 |
| 42.3 | 62.12 | Raygras | Vacas invernar | 40 |
| 44 | 31.7 | SEMILLERO | — | 0 |
| 44.1 | 39.32 | SORGO | — | 0 |
| 44.2a | 24.22 | Raygras | Ternera | 0 |
| 44.2b | 33.47 | Raygras | Ternera | 103 |
| 45 | 27.02 | Raygras | Ternera | 0 |
| 45,1 | 63.18 | SORGO | — | 0 |
| 46 | 42.23 | Raygras | Vacas invernar | 45 |
| 46.1 | 47.29 | Raygras | Vacas invernar | 50 |
| 51 | 95.78 | SORGO | Ternero | 0 |
| 52.2/3/4 | 126.28 | Raygras | Ternero chico | 0 |
| 52.1 | 57.02 | Raygras | Ternero chico | 0 |
| 62.2/3 | 136.7 | Arroz | — | 0 |
| 72.1/2 | 86.65 | pp+ | VAQ. PARIDA | 380 |
| 72.3 | 29.6 | Raygras | Ternero chico | 83 |
| 72.4 | 18.84 | Raygras | Ternero chico | 75 |
| 72.5 | 25.76 | Raygras | Ternero chico | 80 |
| 72.6 | 8.23 | Raygras | Semillero | 0 |
| 72.7 | 43.52 | Raygras | Semillero | 0 |
| 72.8 | 20.48 | Raygras | Semillero | 0 |
| 72.1 | 1.31 | Raygras | Semillero | 0 |
| 74 | 78.82 | Raygras | Terneras chicas | 253 |
| 76.1/2 | 53.5 | sorgo | — | 0 |
| 81.1/2/3/4 | 186 | Raygras | Ternero | 124 |
| 91 | 23.94 | Raygras | Ternero | 150 |
| 91.1 | 42.64 | Raygras | — | 0 |
| 91.1B | 50.3 | Raygras | Ternero | 100 |
| Cerro | 1 | CN | Terneros | 575 |
| P 1 | 1 | CN | Vacas | 250 |
| P 2 | 1 | CN | — | 0 |
| P 3 | 1 | CN | Vacas paridas | 198 |
| P 4 | 1 | CN | Vacas | 0 |
| P 6 | 1 | CN | Vacas paridas | 156 |
| P 9 | 1 | CN | Vacas | 103 |
| P 10 | 1 | CN | Vacas | 95 |
| P 15 | 1 | CN | Vacas | 0 |
| P 43 | 1 | CN | Vacas paridas | 187 |
| P 53 | 1 | CN | Vacas | 104 |
| P 55 | 1 | CN | vacas CUT | 112 |
| Frente A | 1000 | CN | Terneros | 982 |
| Frente B | 920 | CN | Vacas paridas | 160 |
| Olivera | 909 | CN | Vacas paridas | 550 |
| Pastoreo | 1 | CN | — | 0 |

### ESP

| Potrero | Has | Uso de suelo | Categoría | Cabezas |
|---|---|---|---|---|
| 1 | 41.31 | Sorgo | — | 0 |
| 2 | 46 | Arroz | — | 0 |
| 3 y 6 | 57.6 | Arroz | — | 0 |
| 4 y 5 | 63 | Avena | vacas primiparas | 44 |
| 7 | 80.19 | Raygras | Terneras | 81 |
| P. Grande | 87 | C. Natural | Vacas | 80 |
| P. Rep | 48 | C. Natural | vacas primiparas | 61 |
| Piqueton | 26 | C. Natural | Vacas | 14 |
| Espinillo | 73 | C. Natural | Vacas | 32 |

### ELS

| Potrero | Has | Uso de suelo | Categoría | Cabezas |
|---|---|---|---|---|
| P. Grande | 40 | Sorgo | Terneros chicos | 0 |
| Vesiculoso | 12 | Raygras | Terneros chicos | 45 |
| Pradera 1 | 8 | Raygras | Terneros chicos | 40 |
| Sem. Blanco | 16 | Raygras | Terneros chicos | 40 |
| P. chica | 23 | Raygras | Terneros chicos | 50 |
| 6 | 137 | Sorgo | — | 0 |
| 7.1 | 40 | Raygras | Terneros | 120 |
| 7.2 | 40 | Raygras | Terneros | 125 |
| 8 | 110 | PP+ | Terneros chicos | 249 |
| 9.1 | 40 | Sorgo | — | 0 |
| 9.2 | 40 | Sorgo | — | 0 |
| 9.3 | 10 | Sorgo | — | 0 |
| 10 | 70 | S. Silero | — | 0 |
| 11 | 30 | Raygras | vaquillonas | 58 |
| 1 | 100 | C. Natural | Novillos | 100 |
| 2 | 80 | C. Natural | Novillos | 63 |
| 3 | 113 | C. Natural | vaquillonas | 240 |
| C. Nuevo | 130 | C. Natural | Novillos | 158 |
| Molino | 110 | C. Natural | Novillos | 138 |
| Frente | 50 | C. Natural | Novillos | 64 |
| C. 7 | 67 | C. Natural | terneros | 135 |
| C. 8 | 38 | C. Natural | Novillos | 36 |

### LA PALMA

| Potrero | Has | Uso de suelo | Categoría | Cabezas |
|---|---|---|---|---|
| altiplano | — | CN | terneros | 390 |
