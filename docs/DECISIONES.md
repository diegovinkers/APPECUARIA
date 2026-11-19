# Decisiones, visión y pendientes

Este registro junta lo que se habló entre Diego, Claude Code y Claude Desktop, que es quien define los requisitos. Hay que actualizarlo cada vez que se decida algo.

## 1. Decisiones de base (06/11/2026)

- **Base de datos:** PostgreSQL instalado en Windows, con una base aparte para los tests.
- **Proyecto:** está en `C:\dev\sapsa-app`, que es una copia de auth-kit y queda fuera de Google Drive. auth-kit sigue intacto como plantilla.
- **Usuarios:**
  - Se entra con nombre de usuario; el email es opcional.
  - `codigoCigam` también es opcional. Sirve para vincular cada usuario con su código en CIGAM, que se ve en la barra inferior de CIGAM.
  - Superadmin es un indicador del usuario, no un rol.
  - No hay registro público: los usuarios los crea un administrador.
  - Los usuarios no se borran: se desactivan.
- **Sesiones:**
  - El token es opaco y vive en la tabla `Sesion`.
  - Vencen a los 30 minutos de inactividad o a las 8 horas como máximo. Los dos valores se configuran en el `.env`.
  - 30 minutos puede quedar corto para la gente de campo que usa el celular. Es un supuesto, a revisar.
- **Módulos provisorios:** Gestão de Materiais, Compras, Recebimento/Pré Nota, Gestão Financeira, Usuarios, Roles y Auditoría.
  - Cada módulo tiene 5 acciones: VER, CREAR, EDITAR, APROBAR y ANULAR.
- **Roles de ejemplo:** Administrador, Solicitante, Comprador, Aprobador, Recepción y Financiero.

## 2. Fase 3: decisiones (aplicadas)

- El mensaje de bloqueo es claro: "Tu usuario quedó bloqueado…". Se acepta que así se sepa que la cuenta existe.
- **Bloqueo por cuenta:** 5 intentos fallidos seguidos bloquean la cuenta 15 minutos.
  - No cierra las sesiones que ya estaban abiertas.
  - Un administrador puede desbloquearla.
- **Límite por IP:** 100 logins fallidos cada 15 minutos.
- **Contraseñas:**
  - De 10 caracteres a 72 bytes, sin reglas de composición.
  - Se guardan con bcrypt de costo 12.
- La contraseña que pone un administrador (al crear un usuario o al restablecerla) es temporal: hay que cambiarla en el primer ingreso.
- Los usuarios del seed no tienen que cambiarla, para que sea más cómodo trabajar en desarrollo.
- Desde la app no se puede restablecer la contraseña de un superadmin.
- **Requisitos para producción:**
  - El front y la API en el mismo sitio, por SameSite=Strict.
  - HTTPS.
  - `TRUST_PROXY=1` si hay un proxy delante.

## 3. Fase 4: plan aprobado (sin arrancar)

- **Permisos en las rutas:**
  - `requirePermission(modulo, accion)` en cada ruta de administración. El superadmin pasa siempre.
  - Un test que falle si alguna ruta queda sin permiso declarado.
  - Idea tomada de appe, a confirmar: que un permiso mal escrito haga fallar la API al arrancar.
- **Mapeo de acciones:**
  - **Usuarios:**
    - VER: listar.
    - CREAR: dar de alta.
    - EDITAR: asignar roles, restablecer la contraseña y desbloquear.
    - ANULAR: activar y desactivar.
  - **Roles:** VER, CREAR, EDITAR y ANULAR (borrar).
  - **Auditoría:** VER.
- **Roles:**
  - ABM de roles con una matriz de permisos (módulo × acción).
  - No se borra un rol que tenga usuarios asignados.
- **Módulos:** el catálogo vive en el código. Desde la app solo se cambian el nombre y el orden.
- **Reglas de administración:**
  - El administrador crea y desactiva usuarios, y asigna roles que ya existen.
  - Solo el superadmin puede:
    - asignar roles con permisos sobre Usuarios, Roles o Auditoría;
    - editar los permisos de un rol.
  - Nadie puede cambiar sus propios roles.
- **Auditoría de cambios:**
  - altas de usuarios;
  - roles asignados, con el antes y el después;
  - activaciones y desactivaciones;
  - altas, ediciones y bajas de roles;
  - cambios de permisos.
- **Comando de consola** para recuperar la contraseña del superadmin, que la lee del `.env`.
- **Endpoint** con los permisos del usuario actual, para armar el menú de la fase 5.
- **La pantalla de consulta de la auditoría** va en la fase 5.

## 4. Visión a largo plazo (todavía sin especificar)

- **Una sola app** que concentre todo lo que maneja SAPSA: compras, flota, finanzas y más.
  - Para el usuario: un solo login y un menú con lo que le corresponde.
  - Por dentro: **módulos separados**, que comparten el login, los permisos y la auditoría.
- **Muy segura:** concentra toda la información, y el acceso a cada parte lo decide Diego, con aprobación del dueño para lo más sensible.
- **GPS de los vehículos**, para controles centralizados:
  - recorridos, zonas permitidas y tiempos parados;
  - velocidad, mantenimiento y combustible.
  - Se haría con un conector por proveedor de GPS y PostgreSQL con su extensión para mapas.
  - La ubicación de un vehículo con su chofer es un dato personal (Ley 18.331).
- **Asistente con IA (chatbot)** que responde según quién pregunta:
  - el dueño y Diego, todo;
  - después cada sector, lo suyo.
  - Reglas:
    - el bot actúa en nombre del usuario, con sus mismos permisos y su mismo alcance; nunca tiene acceso libre a la base;
    - no consulta CIGAM directamente: usa una copia para consultas;
    - trabaja con indicadores definidos, y los números los calcula el servidor;
    - cada respuesta dice de dónde sale el dato;
    - se audita y se mide el costo, con un tope.
  - Orden: primero solo para el dueño y Diego, después por sector, y por último WhatsApp.
- **Alcance por sector:** además del módulo y la acción, hay que definir de qué parte de los datos ve cada uno (establecimiento, área, empresa). Ese filtro lo aplica el servidor.
  - Distinguir "superadmin" (el que administra el sistema) de "ve todo el negocio" (el dueño).
- **Panel de administración "tipo Django"** para Diego:
  - usuarios, roles y la matriz de permisos;
  - qué módulos están activos;
  - el estado de las conexiones;
  - la auditoría y el costo de la IA.
  - Cada pantalla tiene su permiso y queda registrada: el panel no puede ser una puerta trasera.
- **Después, ofrecerla a otras empresas:**
  - Pensar desde temprano en varias empresas. SAPSA ya es un grupo.
  - Para clientes con datos sensibles, una base separada por empresa.
  - Cada cliente va a tener su ERP: CIGAM es el primer conector, no el único.
  - **Aclarar con SAPSA, por escrito, de quién es el código** antes de revenderlo.
- **El mayor riesgo es hacer todo a la vez.** El camino es:
  1. un módulo que resuelva un problema real de punta a punta;
  2. que la gente lo use todos los días;
  3. recién ahí, el siguiente.
  - Las ideas nuevas van a una lista, no al código.

## 5. Tecnología: recomendaciones aceptadas

- **Seguir con Node**, no pasar a Django.
  - La inteligencia de negocios se hace aparte, en Python (pandas), Power BI o Metabase, leyendo la copia de los datos con un usuario de solo lectura.
  - El único motivo fuerte para cambiar sería que quien mantenga la app sepa Python y no JavaScript.
- **PC:** web y después **PWA instalable**. No se hace una app de escritorio.
  - Electron, descartado: trae su propio navegador y consume más.
  - Que CIGAM sea de escritorio no importa: la app lee su base de datos, no sus pantallas.
- **Equipos conectados por cable** (por ejemplo, el sector que ingresa ganado o granos):
  1. primero, leerlos desde Edge por puerto serie o USB;
  2. si tienen que leer solos, sin nadie mirando, un **programita en Go** que corra como servicio de Windows;
  3. Tauri, solo si esa PC necesita una pantalla especial.
  - Antes de elegir, averiguar qué equipo o qué programa usan. El nombre que dijo Diego fue "PSIJ"; ¿puede ser el SNIG?
- **Celular: solo web** (decidido por Diego el 07/11/2026). La app se adapta a la pantalla del celular y se instala como **PWA**. No se hace app nativa.
  - Motivo: en la empresa hay muchos iPhone. Una web llega a iPhone y Android con un solo código, sin pasar por la App Store, sin la cuenta de Apple (USD 99 por año) y sin esperar revisiones para cada cambio.
  - React Native también sirve para iPhone. Se descartó **por ahora**, no porque no funcione ahí.
  - Capacitor, descartado.
  - **Flutter, evaluado el 10/11/2026:** no se adopta. Se sigue con React web + PWA (decidido por Diego).
    - Sus ventajas son las de cualquier app nativa frente a la PWA, y en la web rinde poco.
    - Si hace falta una app nativa, la opción preferida es **React Native con Expo**:
      - usa el mismo lenguaje que la API y la web, y comparte con ellas las validaciones y los tipos;
      - se actualiza sin pasar por la tienda;
      - compila para iPhone en la nube, desde Windows.
    - Flutter convendría solo si se quisiera una app nativa también en la PC, o si quien mantenga la app supiera Dart.
  - **Cómo es la PWA en iPhone** (iOS 16.4 o más nuevo):
    - Se instala desde Safari con Compartir → "Agregar a inicio". No aparece un aviso de instalación automático: hay que enseñarle a la gente.
    - Las notificaciones solo llegan si la app está instalada en la pantalla de inicio y el usuario las aceptó.
    - Funcionan la cámara (fotos y escaneo de códigos) y el GPS del teléfono **mientras la app está abierta**.
    - No funcionan Bluetooth, USB ni el puerto serie. Los equipos por cable se leen desde una PC.
    - Se puede trabajar sin señal, pero con límites. Hay que probarlo en un iPhone real si el campo lo necesita.
  - **Se reconsidera la app nativa solo si aparece algo que la web en iPhone no cubre:**
    - seguir la ubicación del teléfono en segundo plano;
    - trabajo pesado sin señal en el campo;
    - equipos Bluetooth conectados al teléfono;
    - notificaciones confiables para gente que no instala la PWA.
    - Si eso pasa: la app nativa guardaría el token en el almacenamiento seguro del teléfono y lo mandaría por header. Es un ajuste chico en la autenticación.
  - El GPS de los vehículos no depende de esto: se lee de la plataforma de los rastreadores, no de los celulares.
  - **Producción:** la web y la API tienen que estar en el **mismo dominio** (por ejemplo, `app.dominio/` y `app.dominio/api`). Safari bloquea las cookies de terceros: con la API en otro dominio, el login fallaría en los iPhone.
  - **Fase 5:** el front se diseña primero para el celular y se prueba también en Safari, en un iPhone real.
- **Pasar el código a TypeScript** de a poco, al principio de la fase 4 o justo después. **[decidir]**
- **Regla general:** las reglas del negocio viven en la API. La web (en la PC o instalada en el celular) y el bot de WhatsApp son canales que la usan.

## 6. Patrones de las otras apps de Diego que conviene repetir

Vienen de agenda-uy y appe, en `Documents\code`:
- **El bot usa exactamente la misma lógica que la web:** nunca se duplican reglas.
  - La IA no inventa precios, productos ni ids.
  - Siempre pide confirmación antes de actuar.
  - Puede pasarle la conversación a una persona.
- **Primero se prueba con un simulador** dentro de la app; recién después, WhatsApp oficial, con un proveedor que se pueda cambiar.
- **Se mide el costo de la IA** por conversación y por cliente, con un tope mensual.
- **Aislamiento por cliente y privacidad:** el superadmin no ve los datos sensibles de nadie.
- **Auditoría de los cambios sensibles.**
- **Forma de trabajar:**
  - una fase 0 de diagnóstico antes de programar;
  - las decisiones abiertas, marcadas con **[decidir]**;
  - una checklist de lanzamiento;
  - seguimiento con el primer cliente real.

## 7. Seguridad: qué falta para el nivel que se busca

| Cuándo | Qué |
| ------ | --- |
| Fase 4 | Permisos en cada ruta, con un test que falle si falta alguno. Alcance por sector, cuando se sepa cuáles son los sectores. |
| Antes de producción | **2FA** para administradores y dueños. Copias de seguridad cifradas y probadas, restaurando al menos una. Servidor y red configurados con cuidado. HTTPS. Los secretos de producción, fuera del `.env`. |
| Siempre | Actualizar las dependencias y revisar sus vulnerabilidades. Alertas ante accesos raros. Dar de baja enseguida a quien se va. Auditar también las acciones del superadmin. |
| Antes de vender | Una base separada por empresa. Una revisión de seguridad externa (pentest). Un plan para incidentes. Contratos y cumplimiento de la Ley 18.331. |

Nadie puede garantizar seguridad absoluta. El objetivo es un nivel alto, mantenido en el tiempo y revisado por alguien de afuera.

## 8. Preguntas abiertas

Van al documento de alcance con Claude Desktop.

1. **Qué tiene que resolver la app**, proceso por proceso:
   - qué lo dispara, sus pasos y quién hace cada uno;
   - qué datos usa y qué reglas tiene;
   - qué excepciones pueden pasar.
2. **Hay que confirmar el circuito de compras que se supuso**, porque nadie lo confirmó todavía:
   1. alguien solicita;
   2. compras gestiona;
   3. un aprobador autoriza;
   4. recepción recibe (pré-nota);
   5. finanzas paga.
3. **Cómo llega a CIGAM lo que se decide en la app**, si la app no escribe en CIGAM. ¿Alguien lo carga a mano?
4. **El acceso técnico a CIGAM:**
   - motor de base de datos y versión;
   - si nos pueden dar un usuario de solo lectura, vistas preparadas o una copia;
   - si hay un ambiente de prueba;
   - con quién de sistemas hay que hablar.
5. **Qué son los "sectores"** en SAPSA: establecimientos, áreas, empresas del grupo, o una mezcla.
6. **La gente de campo:**
   - cuántos son y qué dispositivo usan;
   - si tienen señal;
   - si les sirve WhatsApp, por ejemplo para pedir materiales o aprobar desde el celular.
7. **El sector que trabaja con cable:**
   - qué ingresan;
   - qué equipo o qué programa usan;
   - si el programa le manda datos a algún organismo;
   - si guarda o exporta los datos en algún lado.
8. **El GPS:** qué proveedores o equipos tienen los vehículos.
9. **Dónde va a correr la app** (un servidor de la empresa o la nube), los plazos y quién la va a mantener.
10. **De quién es el código**, y si se puede reutilizar para otras empresas.
11. **Qué datos no toca nunca el asistente**, sin importar quién pregunte (sueldos, datos personales…), y qué se le puede mandar al proveedor de IA.

## 9. Módulo Parcelas (en diseño, 09/11/2026)

- **Pedido del jefe de Diego:** consultar en el campo, desde el celular, qué hay y qué hubo en cada área (parcela) de CIGAM, con sus operaciones.
- **Decidido:** es un **módulo de esta app**, no una app aparte.
  - Motivo: necesita login, permisos y auditoría, que acá ya están hechos.
  - Puede ser el primer módulo que resuelva un problema real de punta a punta (§4).
- **Lo que pidió Diego:**
  - un mapa con las parcelas dibujadas;
  - crear, modificar y controlar procesos (operaciones) en cada parcela;
  - el historial de cada parcela;
  - la ubicación del usuario en tiempo real respecto a las parcelas ("dónde estoy parado").
- **Arquitectura propuesta (sin aprobar):**
  - La base de CIGAM no se toca. Se lee con un usuario de solo lectura, casi seguro de SQL Server (a confirmar).
  - Un sincronizador copia lo nuevo a nuestra base cada tantos minutos. La app lee esa copia.
  - Los dibujos de las parcelas y lo que se cargue desde el campo viven en nuestra base, vinculados por el código de la parcela en CIGAM. Para los mapas, PostgreSQL con su extensión PostGIS.
  - Claude se suma después, con las reglas del asistente (§4).
- **Orden:** el diseño se hace ahora. El código va después de la fase 4, porque necesita los permisos.
- **Lo que se carga desde el campo (decidido por Diego, 09/11/2026):**
  - Se guarda en la app.
  - Alguien de la oficina lo pasa a CIGAM, desde una lista de "pendientes de cargar".
  - El sincronizador detecta cuando ya aparece en CIGAM y lo marca como cargado.
  - **Automatizar la carga:** solo por una vía oficial de CIGAM (importación de archivos o API), si existe. Hay que preguntarle al proveedor.
    - Usar esa vía cambia la regla de "solo lectura": hay que decidirlo de forma explícita.
  - **Descartado:** escribir directo en las tablas de CIGAM, porque saltea sus reglas de stock y costos.
  - **Último recurso:** un robot que tipea en las pantallas (RPA), porque es frágil.
- **Lo que muestra CIGAM** (video de Diego del 09/11/2026; acá va solo la estructura):
  - CIGAM tiene un **módulo BI** con una carpeta Agro. Dos tableros ya muestran casi lo que pide el dueño, pero solo en la PC, sin mapa y sin ubicación:
    - **"Agro - Lavoura":** filtros por safra y cultura-safra. Lista las granjas con su código gerencial, el área y la cantidad de talhões. Por cada talhão: código de lavoura, gerencial, fechas de siembra y de cosecha (prevista y real), cultivar, área en ha y en cuadras, y su porcentaje sobre la granja.
    - **"AGRO - Analise Operacao":** por safra, cultura y granja. Por cada talhão y operación: el % concluido, las hectáreas cerradas y las planificadas, el estado, la situación y el motivo de parada.
  - **Cómo se organizan los datos:**
    - Safra (ej. "ZF 26/27") → cultura-safra (ej. "ARROZ - 26/27") → fazenda/granja → talhão → lavoura.
    - El **talhão** es el lote físico y no cambia. La **lavoura** es ese talhão en una cultura-safra, con su propio id.
    - Por eso **el dibujo va en el talhão**, y el historial se arma con sus lavouras.
  - **Orden de operación múltiple** (pantalla del ERP):
    - Abarca varios talhões. Tiene una operación (ej. "UREA"), una fecha prevista y una de conclusión, y una situación (ej. "Aberto/Liberada").
    - Cada talhão de la orden se puede cancelar por separado.
    - Lleva una composición (máquina + implemento) y los insumos, con la cantidad por ha y el total.
    - Se cierra con **apontamentos** (lo realizado).
  - **Unidades:** se usan hectáreas y **cuadras**. En los datos, 1 cuadra = 1,7424 ha (132 m × 132 m).
  - **Atajo:** el BI ya consulta la base de CIGAM. Si el proveedor o quien administra el BI nos pasa el SQL de esos dos tableros, nos ahorramos adivinar las tablas.
  - Se entra a CIGAM por **escritorio remoto**: la base está en ese servidor.
- **Lo que dijo Diego (09/11/2026):**
  - La base de CIGAM es **SQL Server**, alojada en Brasil. Diego entra por un enlace remoto de Windows.
  - Las consultas de los tableros del BI están guardadas **dentro de esa base**.
  - Se arma una **base propia** con lo que necesitan esos tableros, y la app trabaja solo contra ella. Por ahora solo se lee; cómo pasar a CIGAM lo que se cargue en la app se resuelve más adelante.
  - **Lo central es el asistente:** el usuario pregunta en lenguaje natural y la app responde. Diego hará además BI por su cuenta.
  - Todo tiene que ser ultra sencillo y fácil de leer, pero completo y efectivo.
  - **Cómo se ve:** la pantalla principal es un mapa con las zonas (parcelas) dibujadas; al tocar una, aparece su información. El asistente se abre con un **botón flotante** (posición a definir), en un **panel lateral derecho** con la conversación.
- **Preguntas abiertas:**
  - ¿Nos pueden pasar las consultas SQL de los tableros "Agro - Lavoura" y "AGRO - Analise Operacao"?
  - ¿Hay límites de las parcelas ya dibujados en algún lado (Google Earth/KML, el equipo de la maquinaria, el plan de uso de suelos)?
  - ¿Son chacras agrícolas, potreros de ganado o las dos cosas?
  - ¿Hay señal donde se va a usar?
    - Diego cree que en el campo hay **Starlink** (10/11/2026). A confirmar: dónde están las antenas, si la señal llega a las parcelas o solo cerca de los galpones, y si hay señal de celular en las parcelas.
    - Starlink da internet alrededor de la antena (por wifi), no en todo el campo. Por eso la app tiene que aguantar cortes: mostrar lo último que bajó y guardar lo que se cargue hasta recuperar la señal. Eso la PWA lo hace; hay que probarlo en un iPhone real.

## 10. Módulo Pecuaria (en diseño, 16-17/11/2026)

Comparte la arquitectura del módulo Parcelas (§9): base propia sincronizada desde CIGAM en solo lectura y PWA mobile primero. La ficha técnica de las fuentes está en `docs/PECUARIA.md`.

- **Decisiones de alcance (Diego, 17/11/2026):**
  - **La fase 4 (permisos por módulo y acción) queda postergada.** En la v1, el jefe, el dueño y el encargado pueden hacer lo mismo. Alcanza con el login, los usuarios y la auditoría que ya existen. Pecuaria v1 se programa **antes** de la fase 4 (esto cambia lo dicho en §9 para Parcelas).
  - **Sin bandeja de solicitudes en la v1:** los cambios de categoría se hacen directo y la auditoría registra quién, qué y cuándo. La bandeja pasa a ideas para después.
  - **Ovinos fuera de la v1.**
  - **La v1 arranca solo con La Gateada (EG).** Las demás estancias se suman después.
  - **Alcance de la v1:** campos y potreros de EG con hectáreas y uso de suelo; importación de la planilla de cargas con vista previa; stock por potrero (cabezas por categoría y peso promedio) con historial por fecha; cálculos de Cab./ha, Kilos lote, Kg PV/ha y UG/ha (1 UG = 380 kg PV, configurable); resumen por campo y categoría en CN / Verdeos / Corral / Total (agrupación configurable); importación del archivo del bastón (sesión de lecturas) para contar cabezas y compararlas con el stock; categorías editables; PWA para el celular.
  - **Catálogo inicial de uso de suelo** (leyenda del mapa de La Gateada): arroz, festuca, maíz, maíz REF, sorgo F, sorgo S, PP+, PP1, semillero RG, campo natural.
  - **Fuera de la v1:** mapa, movimientos entre potreros, chatbot e IA, conexión real con CIGAM (los potreros entran desde la planilla, con claves compatibles con Id_Fazenda e Id_Talhao para unir después), corrales del feedlot y las demás estancias.
  - **Ideas para después:** bandeja de solicitudes de cambio (el encargado propone, el jefe aprueba); ovinos; permisos por rol (fase 4); **movimientos entre potreros** en un solo paso (hoy son dos ediciones a mano: restar en uno y sumar en el otro).

- **Qué necesitan primero:** el stock de ganado por categoría, por campo (estancia) y por potrero, más los datos de cada campo y potrero.
- **Decisiones (Diego, 16/11/2026):**
  - PWA instalable con login, mobile primero (pedido del jefe; hay iPhone y Android).
  - Base de datos propia para lo pecuario con **claves compatibles** con las tablas TEA4 de CIGAM (Id_Fazenda, Id_Talhao, categoría), para poder unir en el futuro. **No** se clona la estructura de CIGAM (por licencias y tamaño; CONTEXTO_SAPSA §6).
  - Campos y potreros se leen de CIGAM, **solo lectura**. El uso de suelo por período **lo carga la app**: en CIGAM casi no hay ocupación cargada (solo 2025, tipo "P", sin cultivo).
  - Bastón True Test **por archivo** (export de Data Link), con validación de estructura y vista previa. Sin Bluetooth ni API: la PWA en iPhone no tiene Bluetooth (§5).
- **Confirmado en CIGAM (16/11/2026):** TEA3FAZENDA (registros separados por granja, estancia y confinamiento del mismo lugar; Unidade_Negocio no es la sigla), TEA3TALHAO (al día, con Abreveatura, Area_Util y Area_Total), TEA3TIPOOCUPACAO, TEA4AREAMANEJO(+XTALHOES), TEA4DIMENOCUPACAO(+XTALHOES), TEA4SAFRAPECUARIA (una sola zafra, 2025, año calendario) y TEA4CATANIMAIS. **Lo operativo de ganado está vacío: el ganado no se registra en CIGAM**; vive en la planilla del encargado y en el bastón. La agricultura sí se registra.
- **Confirmado con los archivos reales (17/11/2026, detalle en `docs/PECUARIA.md`):**
  - **1 UG = 380 kg de peso vivo** (UG/ha = Kg PV/ha ÷ 380), deducido de la hoja del 3/11, consistente en 61 filas. En la hoja del 13/11 la fórmula quedó rota: UG/ha repite Cab./ha.
  - **Los totales de la planilla quedan viejos** cuando se editan filas (hectáreas y kilos de ER, EG y ELS no cierran): la app tiene que recalcular todo, nunca confiar en totales.
  - **Siglas:** GG, EG, ES y ER confirmadas; **ELS = La Seda** (confirmada cruzando planilla y foto de stock); **La Palma** es un campo real ("LA PALMA" en la planilla); **ESP** sigue sin nombre (campo Wagyu de 522 ha).
  - **Dos feedlots** con hoja de corrales propia: La Seda (10 corrales) y La Gateada (11), con metros de comedero por cabeza, kg de inicio y días.
  - **DICOSE al 30/06/2026:** 14.900 vacunos + 436 **ovinos** (especie nueva para el modelo), valuación ≈ USD 17,5 M. Categorías finas por franja de edad, como TEA4CATANIMAIS.
  - **Bastón:** sesiones limpias (sin caravanas repetidas, sin cruce entre sesiones) y **sin peso** en las dos vistas.
- **Lotes y movimientos (Diego, 17/11/2026), antes del bastón:**
  - **Lote:** grupo de animales que el encargado arma porque cumplen las mismas condiciones, y lo identifica para seguirlo. Tiene **una sola categoría** y está en **un solo potrero** a la vez. **Un potrero puede tener varios lotes** (opción B: por ejemplo, vacas con ternero al pie, o los grupos del feedlot).
  - Ningún Excel trae lotes: al empezar, cada fila de la planilla (potrero + categoría) pasa a ser un lote con nombre automático ("10.3 · Terneros"), que el encargado cambia en la app. Una planilla nueva actualiza el lote que coincide en potrero y categoría, o crea uno.
  - **Mover animales:** elegís el lote de origen y la cantidad, con el peso de los que salen (opcional: la app recalcula los promedios). En el destino se pueden **sumar a un lote que ya está** (toman su categoría; es la opción que se propone primero), **formar un lote nuevo** (nombre y categoría), o mover el **lote entero** (mantiene su nombre; se le puede cambiar la categoría). Antes de confirmar se ve el antes y el después de los dos potreros (cabezas, cab/ha, UG/ha).
  - Un movimiento cambia los dos potreros en un solo paso (los dos o ninguno), queda en el historial de los dos y en la auditoría. La fecha no puede ser anterior al último dato de los potreros.
  - Más adelante: alertas de carga máxima por uso de suelo (cuando el encargado las defina), y registrar movimientos leyendo las caravanas con el bastón.
- **Página de movimientos y solicitudes (Diego, 17/11/2026):**
  - **Paso 1, página de Movimientos:** registra todos los cambios en un solo lugar: entre potreros, entre lotes y de **categoría** (un cambio de categoría es un movimiento más). Filtros por fecha, potrero, lote y categoría, y un resumen de lo filtrado. "Nuevo movimiento" desde ahí. Historial de cada lote.
  - **Revertir:** registra el movimiento inverso, que deja los potreros como estaban antes. Nada se borra: quedan el original y la corrección. Solo se puede si después no hubo otros cambios en esos potreros.
  - **Paso 2, Solicitudes** (vuelve la bandeja, que estaba para después de la v1): la app propone cambios de categoría según reglas (por peso y por fecha fija primero; por edad cuando los lotes tengan su fecha de nacimiento) y el encargado los confirma o rechaza. Que solo el encargado pueda confirmar requiere adelantar una parte de los permisos: a decidir.
  - A averiguar con el encargado: con qué criterio cambia hoy de categoría (edad, peso, fecha fija) y qué cambios hace.
- **Tres calendarios separados en el modelo:** ejercicio fiscal (1/7-30/6), zafra agrícola ("ZF 26/27") y zafra pecuaria (a definir con el encargado).
- **Preguntas abiertas:** en CONTEXTO_SAPSA §8 ("Sobre la pecuaria") y al final de `docs/PECUARIA.md`.

## 11. Rediseño, permisos, estancias e IA (Diego, 18/11/2026)

Diego siente que la app no es intuitiva. Antes de la pestaña Registro se rediseñan la navegación y el estilo, pensando desde ya en usuarios con distintos permisos, en todas las estancias y en un asistente con IA.

- **Navegación (propuesta, a confirmar en el boceto):**
  - **Trabajo diario** (Resumen · Potreros · Movimientos + botón **"+"** para registrar): en el celular, barra abajo; en la compu, en el navbar de arriba. Dejan de estar "dentro" de Pecuaria.
  - **Todo lo demás** (otros módulos, Configuración, Importar, Administración): **panel izquierdo**, agrupado por área. Se abre con una flechita al medio del borde izquierdo (y un ☰ arriba) y se cierra con una X.
  - **Barra de arriba:** logo, selector de estancia (solo para quien ve más de una), botón ✦ del asistente, usuario.
  - **Panel derecho:** el chat del asistente.
  - El menú sale de **una lista donde cada ítem dice qué permiso pide**: se diseña para el usuario que ve todo y cada uno ve su parte.
  - Ocultar en el front no protege: el servidor filtra por permiso y por estancia (paso 3).
- **Traslado entre estancias:** hoy es una salida y una entrada sueltas. Pasa a ser un solo paso: los dos movimientos se graban juntos y enlazados, y revertir deshace los dos. Seguir un animal por su caravana es otro modelo (por animal) y queda para el bastón.
- **Asistente con IA:** arma movimientos y entradas/salidas desde texto o dictado, muestra la vista previa y **nada se graba sin Confirmar**. Reglas de §4 (permisos del usuario, auditoría "vía asistente", tope de costo). Necesita la fase 4 antes.
- **Plan (cada paso para y espera el OK):**
  0. Definir los roles: qué ve y qué hace cada uno (tabla abajo).
  1. Boceto de la navegación en celular y compu, para el usuario que ve todo y para el encargado; colores y logo.
  2. Rediseño de la navegación (solo front; al principio distingue solo superadmin).
  3. Fase 4 reducida: permisos de Pecuaria en cada ruta, alcance por estancia, endpoint "mis permisos", pantalla de roles. Obligatoria antes de que entre un encargado.
  4. Las otras estancias: importador, carga en desarrollo y en Render, Resumen con "Todas".
  5. Traslado entre estancias en un paso.
  6. Libro del rodeo, paso 3: pestaña Registro; "Editar stock" → "Corrección".
  7. Asistente con IA: primero para Diego y el dueño, después para el encargado.
  - **Con fecha:** pasar la base de Render a pago antes del ~17/12/2026.
- **Roles (propuesta, paso 0 en curso):** ver la tabla que sigue.
- **Roles (respuestas de Diego, 18/11/2026):**

  | Qué | Superadmin (Diego) | Dirección (dueño) | Jefe pecuario | Encargado de estancia | Capataz / peón | Administrador |
  |---|---|---|---|---|---|---|
  | Estancias | todas | todas | todas | la suya | la suya | — |
  | Resumen, Potreros, Movimientos | ✅ | ✅ (solo ver) | ✅ | ✅ | ✅ | — |
  | Mover, entrada/salida, categoría, corrección | ✅ | — | ✅ | ✅ | ✅ | — |
  | Revertir | ✅ | — | ✅ | ✅ | — | — |
  | Importar planilla | ✅ | — | ✅ | ✅ (su estancia) | — | — |
  | Configuración Pecuaria | ✅ | — | ✅ | ✅ | — | — |
  | Usuarios, Roles | ✅ | — | — | — | — | ✅ |
  | Auditoría | ✅ | ✅ (propuesta) | — | — | — | ✅ |
  | Asistente IA | ✅ | ✅ | ✅ | ✅ | ✅ | — |

  - **Diego** es el superadmin que ya existe: pasa todos los permisos y ve todas las estancias. Se distingue de **Dirección**, que ve todo el negocio pero no carga nada.
  - **El encargado puede todo en su estancia**: la app es para que alimente la información.
  - **Configuración:** categorías, kg por UG, grupos de uso y tipos de movimiento son **de todas las estancias**. Decidido: el encargado configura igual, aunque cambie para todas; queda en la auditoría.
  - **Capataz / peón:** ve y registra en su estancia, sin revertir, importar ni configurar (confirmado).
  - **Cada persona tiene su propio usuario** (encargado, capataz, peón, jefe, dueño). El **rol** dice *qué* puede hacer; las **estancias asignadas al usuario** dicen *dónde*. Un usuario puede tener más de una estancia (por ejemplo, un capataz que trabaja en dos campos).
  - **Traslado entre estancias:** lo registra **uno solo**, con la salida y la entrada juntas. Puede hacerlo quien tiene la estancia de origen, aunque no tenga la de destino; la auditoría dice quién fue.
  - **El Administrador** que ya está en el seed queda como está (usuarios, roles y auditoría). Los roles de compras del seed siguen siendo de ejemplo.
- **Boceto del celular aprobado (Diego, 18/11/2026):**
  - **Paleta "de campo", tema claro por defecto** (al sol se lee mejor; el oscuro puede quedar como opción): verde campo `#2E5E3A` (barra y principal), pasto claro `#E4EEDC` (seleccionado, fondos suaves), trigo `#C8922E` (botón +, logo), tierra `#7A5232` (correcciones), hueso `#F6F3EC` (fondo), rojo `#B3412E` (salidas y errores). SAPSA no tiene logo: ícono provisorio "S" en trigo sobre verde.
  - **Barra de arriba:** logo, SAPSA, selector de estancia (fijo y sin flechita para quien tiene una sola), ✦ del asistente.
  - **Barra de abajo, igual para todos:** Resumen · Potreros · **+** · Movimientos · Menú.
  - **Botón +** (hoja que sube desde abajo): mover entre potreros, traslado a otra estancia, cambio de categoría, entrada, salida, corrección de stock. Cada opción aparece solo si el usuario tiene el permiso.
  - **Panel izquierdo:** se abre con la flechita al medio del borde, con "Menú" o deslizando, y se cierra con la X o tocando afuera. Grupos: Campo (Pecuaria; Parcelas "pronto"), Pecuaria (Importar planilla, Configuración), Administración (Usuarios, Roles y permisos, Auditoría); abajo Mi perfil y Salir. A quien tiene una sola estancia le muestra su estancia y su rol.
  - **Asistente:** panel derecho a pantalla completa en el celular; vista previa con Confirmar / Cambiar; escribir o dictar.
  - **En la compu:** Resumen · Potreros · Movimientos en el navbar, con "+ Registrar" (abre el mismo menú que el + del celular), el ✦ y el usuario a la derecha. El panel izquierdo queda fijo y se achica a íconos con «. El asistente se abre a la derecha y corre la pantalla, sin taparla. Desde 1024 px de ancho; por debajo, como en el celular.
- **Paso 5, mover entre campos y movimiento múltiple (Diego, 18/11/2026):** plan en `docs/superpowers/plans/2026-11-18-traslados.md`.
  - **Todos los eventos se registran solo desde el "+"**: se sacan Mover / Entrada / Salida de las fichas de potrero y lote y de arriba de Movimientos.
  - **"Mover entre campos"**: el campo de origen se elige adentro (desde cualquier estancia elegida arriba); destino: cualquier campo activo; lote nuevo o lote entero; guía opcional.
  - **"Movimiento múltiple"**: cadena de movimientos simples dentro de una estancia (A → B, B → C...), con "Agregar otro movimiento" siempre; si se mezclan categorías, avisa sin bloquear; cada paso mueve lo que había antes de empezar.
  - **Historial:** un evento padre con sus pasos; cada paso es un movimiento normal (historial de potrero y lote, filtros y totales); en la lista, una fila que se despliega; se revierte el evento entero; todo o nada.
