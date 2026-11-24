# Prompt: la página Procesos en 4 secciones (tablero del ciclo)

> Armado por Claude Code a pedido de Diego (24/11/2026), a partir de su dibujo y de la charla. Lo ejecuta Claude Code en esta carpeta, por fases.

---

## Tu rol

Sos el desarrollador full-stack de `C:\dev\sapsa-app` y cuidás que la app sea simple en el celular (375 px). Antes de tocar nada, leé:
- `CLAUDE.md` entero (sobre todo Procesos, fases 1 a 8).
- `docs/PECUARIA.md` §9.

El código que tocás:
- **Front:** `client/src/pages/pecuaria/ProcesosPage.jsx`, `components/ProcesosLista.jsx`, `components/procesos.js` y `pages/pecuaria/NuevoProcesoPage.jsx`.
- **Servidor:** `server/src/pecuaria/procesos.service.js` (`listar`, `ficha`, `lotesParaEmpezar`, `planCrear`), `procesos.sugerencias.js` y `procesos.plazos.js`.

## Lo que pidió Diego

La página Procesos se reorganiza en **4 secciones**, que siguen el ciclo de la vaca. Las vacas van pasando de una sección a otra a medida que se cargan las etapas. Cada sección muestra el tiempo que falta para lo que sigue, calculado desde la fecha de inicio y los plazos de Configuración → Procesos.

**La ecografía no es una sección.** Diego: "si la pregunta es vacía o preñada, es sube o baja; no tiene por qué quedarse ahí". La ecografía reparte en el momento: las preñadas pasan a 3 y las vacías a 2.

## Las 4 secciones

| # | Nombre | Subtítulo | Quiénes | Cuenta regresiva hasta |
|---|---|---|---|---|
| 1 | **En servicio** | Entore · IATF | Los vientres de un proceso nuevo (rol SIN_SERVIR o VIENTRES), hasta su ecografía | El fin del entore y después la ecografía (por tanda en IATF) |
| 2 | **Reentore** | Vacías que se vuelven a servir | Las vacías con destino "volver a servir" (todavía sin proceso nuevo) y los vientres de un proceso de reentore | Igual que la 1, con los plazos de su proceso |
| 3 | **Preñadas** | Hasta el parto | Rol PRENADAS, de cualquier proceso | La ventana de parición (por mes esperado) |
| 4 | **Con cría al pie** | Hasta el destete | Rol PARIDAS (con sus CRIAS) | El destete (6 meses desde el parto) |

Cómo se pasa de una a otra:
- **1 → 3 / 2:** la ecografía manda las preñadas a 3 y las vacías marcadas "volver a servir" a 2.
- **2 → 3 / 2:** lo mismo con la ecografía del reentore. Las vacías otra vez a 2 o, con "Solo moverlas", afuera.
- **3 → 4:** la parición.
- **4 → afuera:** el destete. Una parida puede estar a la vez en 4 y en un entore nuevo (1), como ya permite la app.
- Las vacías que "solo se mueven" (LIBRES) salen del tablero.

## Decisiones

1. **Una tarjeta por grupo (proceso × estado), no por proceso.** Un proceso aparece en varias secciones a la vez (sus preñadas en 3, sus vacías en 2). La tarjeta lleva a la ficha del proceso, que tiene el historial completo. En el reentore, la ficha muestra "Viene de: <proceso>" (ya existe: procesos enganchados).
2. **Qué muestra la tarjeta:**
   - Nombre del proceso, Entore o IATF, estancia y potreros, y cabezas.
   - La barra del tiempo estimado (de la fecha de inicio a la fecha esperada) con "faltan N días" / "hoy" / "atrasada N días", con los colores de hoy (`estiloSugerencia`).
   - El botón de lo que sigue: Ecografía, Registrar parición, Destetar o **Empezar el reentore** (en 2, para las vacías sin proceso nuevo: abre Nuevo proceso con `?desde=`).
3. **Reentore marcado en el servidor:** un proceso creado con vacías REENTORE de otro guarda `datos.reentore = true` al crearse (en `planCrear`/crear, cuando `anteriores` no está vacío). Los procesos ya existentes se deducen: con `procesoAnteriorId` y sin `conCria`.
4. **API nueva `GET /procesos/tablero`** (y la de una estancia, con los mismos filtros de estancia/grupo que la lista). Devuelve `{ secciones: { servicio, reentore, prenadas, cria }, totales }`. Cada tarjeta trae: procesoId, nombre, modalidad, campo, estado del grupo, lotes, potreros, cabezas, `desde`, `hasta` (fecha esperada) y `proxima` (del motor de sugerencias). Es pura en lo posible: una función que arma las secciones desde los procesos abiertos y sus lotes, con tests.
5. **Pantalla:**
   - **Celular:** 4 pestañas arriba con las cabezas de cada una ("Servicio 400 · Reentore 35 · Preñadas 165 · Cría 40"); la pestaña va en la URL (`?seccion=`).
   - **Compu:** las 4 columnas lado a lado.
   - Dentro de cada sección, las tarjetas ordenadas por lo que vence primero.
6. **La lista de hoy** (abiertos, cerrados, anulados, con filtros) queda como 5ª pestaña **"Todos"**, para buscar procesos cerrados o anulados. Si Diego prefiere sacarla, se saca.
7. "+ Nuevo proceso" sigue arriba, igual que hoy.

## Fases (parar al final de cada una)

1. **Servidor:** la marca de reentore, `tablero` (función pura + rutas) y tests con el ejemplo de §9 (entore → ecografía 165 + 35 → 35 a reentore → parición → destete; en cada paso, las cabezas de cada sección).
2. **Pantalla:** pestañas o columnas, tarjetas con la barra y el botón, "Todos", tests del front, `vite build` y revisión a 375 px.
3. Publicar cuando Diego lo apruebe.
