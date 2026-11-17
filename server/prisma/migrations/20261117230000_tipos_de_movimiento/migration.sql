-- Paso 1 del "libro del rodeo": tipos de movimiento, causas y sexo de las
-- categorías. Generado con `prisma migrate diff` y reordenado a mano para
-- vincular los movimientos que ya existen (la columna nueva es obligatoria).

-- CreateEnum
CREATE TYPE "Sexo" AS ENUM ('MACHO', 'HEMBRA');

-- CreateEnum
CREATE TYPE "SexoAplica" AS ENUM ('CUALQUIERA', 'HEMBRA', 'MACHO');

-- CreateEnum
CREATE TYPE "EfectoMovimiento" AS ENUM ('ENTRA', 'SALE', 'MUEVE', 'CATEGORIA', 'REGISTRO');

-- CreateEnum
CREATE TYPE "NivelMovimiento" AS ENUM ('CAMPO', 'POTRERO', 'CATEGORIA', 'LOTE', 'PARTE_LOTE');

-- CreateTable
CREATE TABLE "tipo_movimiento" (
    "id" SERIAL NOT NULL,
    "clave" VARCHAR(30) NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,
    "efecto" "EfectoMovimiento" NOT NULL,
    "pide_causa" BOOLEAN NOT NULL DEFAULT false,
    "pide_guia" BOOLEAN NOT NULL DEFAULT false,
    "sexo" "SexoAplica" NOT NULL DEFAULT 'CUALQUIERA',
    "niveles" "NivelMovimiento"[],
    "id_tipo_evento_cigam" VARCHAR(30),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tipo_movimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "causa_movimiento" (
    "id" SERIAL NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "causa_movimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "causa_tipo_movimiento" (
    "causa_id" INTEGER NOT NULL,
    "tipo_movimiento_id" INTEGER NOT NULL,

    CONSTRAINT "causa_tipo_movimiento_pkey" PRIMARY KEY ("causa_id","tipo_movimiento_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tipo_movimiento_clave_key" ON "tipo_movimiento"("clave");

-- CreateIndex
CREATE UNIQUE INDEX "tipo_movimiento_nombre_key" ON "tipo_movimiento"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "causa_movimiento_codigo_key" ON "causa_movimiento"("codigo");

-- CreateIndex
CREATE INDEX "causa_tipo_movimiento_tipo_movimiento_id_idx" ON "causa_tipo_movimiento"("tipo_movimiento_id");

-- AddForeignKey
ALTER TABLE "causa_tipo_movimiento" ADD CONSTRAINT "causa_tipo_movimiento_causa_id_fkey" FOREIGN KEY ("causa_id") REFERENCES "causa_movimiento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "causa_tipo_movimiento" ADD CONSTRAINT "causa_tipo_movimiento_tipo_movimiento_id_fkey" FOREIGN KEY ("tipo_movimiento_id") REFERENCES "tipo_movimiento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Los 5 tipos que usa la app para mover (iguales a TIPOS_MOVIMIENTO en
-- src/seed/pecuaria.catalog.js). El resto del catálogo lo crea el seed.
INSERT INTO "tipo_movimiento" ("clave", "nombre", "efecto", "niveles", "id_tipo_evento_cigam", "orden") VALUES
    ('SUMAR_LOTE', 'Sumar a otro lote', 'MUEVE', '{POTRERO,CATEGORIA,LOTE,PARTE_LOTE}', '5', 10),
    ('LOTE_NUEVO', 'Formar un lote nuevo', 'MUEVE', '{POTRERO,CATEGORIA,LOTE,PARTE_LOTE}', '5', 20),
    ('LOTE_ENTERO', 'Mover el lote entero', 'MUEVE', '{POTRERO,CATEGORIA,LOTE}', '4', 30),
    ('CAMBIO_CATEGORIA', 'Cambio de categoría', 'CATEGORIA', '{POTRERO,CATEGORIA,LOTE,PARTE_LOTE}', NULL, 40),
    ('REVERSION', 'Reversión', 'MUEVE', '{LOTE,PARTE_LOTE}', NULL, 50);

-- AlterTable: primero vacía, se completa según el modo y recién ahí es obligatoria.
ALTER TABLE "movimiento" ADD COLUMN "tipo_movimiento_id" INTEGER;

UPDATE "movimiento" m SET "tipo_movimiento_id" = t."id"
FROM "tipo_movimiento" t
WHERE t."clave" = CASE m."modo"
    WHEN 'SUMAR' THEN 'SUMAR_LOTE'
    WHEN 'NUEVO' THEN 'LOTE_NUEVO'
    WHEN 'ENTERO' THEN 'LOTE_ENTERO'
    WHEN 'CATEGORIA' THEN 'CAMBIO_CATEGORIA'
    WHEN 'REVERSION' THEN 'REVERSION'
END;

ALTER TABLE "movimiento" ALTER COLUMN "tipo_movimiento_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "movimiento_tipo_movimiento_id_idx" ON "movimiento"("tipo_movimiento_id");

-- AddForeignKey
ALTER TABLE "movimiento" ADD CONSTRAINT "movimiento_tipo_movimiento_id_fkey" FOREIGN KEY ("tipo_movimiento_id") REFERENCES "tipo_movimiento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "categoria" ADD COLUMN "sexo" "Sexo";

-- El sexo de las categorías que ya existen, deducido de la primera palabra del
-- nombre, en singular (la misma regla que src/pecuaria/sexo.js).
WITH palabra AS (
    SELECT "id", split_part(translate(lower(trim("nombre")), 'áéíóúü', 'aeiouu'), ' ', 1) AS p FROM "categoria"
), formas AS (
    SELECT "id", ARRAY[p, regexp_replace(p, 's$', ''), regexp_replace(p, 'es$', '')] AS f FROM palabra
)
UPDATE "categoria" c SET "sexo" = CASE
    WHEN formas.f && ARRAY['ternero','terneiro','novillo','toro','torito','borrego','carnero','cordero','capon','padrillo','potrillo','potro','caballo'] THEN 'MACHO'::"Sexo"
    WHEN formas.f && ARRAY['ternera','terneira','vaca','vaquillona','vaquilla','novilla','borrega','oveja','cordera','yegua','potranca'] THEN 'HEMBRA'::"Sexo"
END
FROM formas WHERE formas."id" = c."id";
