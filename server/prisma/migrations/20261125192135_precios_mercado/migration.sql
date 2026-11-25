-- CreateEnum
CREATE TYPE "FuentePrecio" AS ENUM ('INAC', 'MANUAL');

-- CreateEnum
CREATE TYPE "UnidadPrecio" AS ENUM ('USD_KG_PIE', 'USD_KG_4TA', 'USD_KG_GANCHO');

-- CreateEnum
CREATE TYPE "OrigenPrecio" AS ENUM ('EXCEL', 'PDF', 'CLAUDE', 'MANUAL');

-- CreateEnum
CREATE TYPE "EstadoImportacionPrecio" AS ENUM ('EN_CURSO', 'OK', 'SIN_CAMBIOS', 'EN_REVISION', 'ERROR');

-- CreateEnum
CREATE TYPE "DisparoImportacion" AS ENUM ('PROGRAMADO', 'AL_ABRIR', 'BOTON');

-- CreateTable
CREATE TABLE "precio_mercado" (
    "id" SERIAL NOT NULL,
    "fuente" "FuentePrecio" NOT NULL,
    "indicador" VARCHAR(40) NOT NULL,
    "semana_desde" DATE NOT NULL,
    "semana_hasta" DATE NOT NULL,
    "valor" DECIMAL(8,3) NOT NULL,
    "unidad" "UnidadPrecio" NOT NULL,
    "cabezas" INTEGER,
    "origen" "OrigenPrecio" NOT NULL,
    "publicado" BOOLEAN NOT NULL DEFAULT true,
    "importacion_id" INTEGER,
    "corregido_por_id" INTEGER,
    "nota" VARCHAR(255),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "precio_mercado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "importacion_precio" (
    "id" SERIAL NOT NULL,
    "fuente" "FuentePrecio" NOT NULL,
    "inicio" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fin" TIMESTAMPTZ(3),
    "estado" "EstadoImportacionPrecio" NOT NULL DEFAULT 'EN_CURSO',
    "origen" "OrigenPrecio",
    "semana_desde" DATE,
    "hash_archivo" CHAR(64),
    "detalle" JSONB,
    "disparado_por" "DisparoImportacion" NOT NULL,
    "usuario_id" INTEGER,
    "aprobada_por_id" INTEGER,
    "aprobada_en" TIMESTAMPTZ(3),

    CONSTRAINT "importacion_precio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "precio_mercado_indicador_semana_desde_idx" ON "precio_mercado"("indicador", "semana_desde");

-- CreateIndex
CREATE UNIQUE INDEX "precio_mercado_fuente_indicador_semana_desde_key" ON "precio_mercado"("fuente", "indicador", "semana_desde");

-- CreateIndex
CREATE INDEX "importacion_precio_fuente_inicio_idx" ON "importacion_precio"("fuente", "inicio");

-- AddForeignKey
ALTER TABLE "precio_mercado" ADD CONSTRAINT "precio_mercado_importacion_id_fkey" FOREIGN KEY ("importacion_id") REFERENCES "importacion_precio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "precio_mercado" ADD CONSTRAINT "precio_mercado_corregido_por_id_fkey" FOREIGN KEY ("corregido_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "importacion_precio" ADD CONSTRAINT "importacion_precio_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "importacion_precio" ADD CONSTRAINT "importacion_precio_aprobada_por_id_fkey" FOREIGN KEY ("aprobada_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Una sola corrida EN_CURSO por fuente: dos importaciones a la vez no se pisan
-- (la segunda falla al crear su fila). Prisma no lo ve; lo controla la base.
CREATE UNIQUE INDEX "importacion_precio_una_en_curso" ON "importacion_precio"("fuente") WHERE "estado" = 'EN_CURSO';
