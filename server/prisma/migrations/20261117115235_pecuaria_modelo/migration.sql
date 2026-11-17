-- CreateEnum
CREATE TYPE "TipoCampo" AS ENUM ('ESTANCIA', 'GRANJA', 'CONFINAMIENTO');

-- CreateEnum
CREATE TYPE "TipoPotrero" AS ENUM ('POTRERO', 'CORRAL');

-- CreateEnum
CREATE TYPE "GrupoUsoSuelo" AS ENUM ('CN', 'VERDEO', 'CORRAL', 'OTRO');

-- CreateEnum
CREATE TYPE "Especie" AS ENUM ('VACUNO', 'OVINO');

-- CreateEnum
CREATE TYPE "OrigenStock" AS ENUM ('PLANILLA', 'MANUAL');

-- CreateEnum
CREATE TYPE "TipoImportacion" AS ENUM ('PLANILLA', 'BASTON');

-- CreateEnum
CREATE TYPE "EstadoImportacion" AS ENUM ('PENDIENTE', 'CONFIRMADA', 'DESCARTADA');

-- CreateTable
CREATE TABLE "campo" (
    "id" SERIAL NOT NULL,
    "sigla" VARCHAR(10) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "tipo" "TipoCampo" NOT NULL DEFAULT 'ESTANCIA',
    "id_fazenda_cigam" VARCHAR(30),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "campo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "potrero" (
    "id" SERIAL NOT NULL,
    "campo_id" INTEGER NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,
    "tipo" "TipoPotrero" NOT NULL DEFAULT 'POTRERO',
    "hectareas" DECIMAL(10,2),
    "hectareas_a_confirmar" BOOLEAN NOT NULL DEFAULT false,
    "id_area_manejo_cigam" VARCHAR(30),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "potrero_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "potrero_subdivision" (
    "id" SERIAL NOT NULL,
    "potrero_id" INTEGER NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "id_talhao_cigam" VARCHAR(30),

    CONSTRAINT "potrero_subdivision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uso_suelo" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,
    "grupo" "GrupoUsoSuelo" NOT NULL DEFAULT 'OTRO',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "uso_suelo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uso_suelo_alias" (
    "id" SERIAL NOT NULL,
    "uso_suelo_id" INTEGER NOT NULL,
    "texto" VARCHAR(60) NOT NULL,

    CONSTRAINT "uso_suelo_alias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categoria" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,
    "especie" "Especie" NOT NULL DEFAULT 'VACUNO',
    "id_categoria_cigam" VARCHAR(30),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categoria_alias" (
    "id" SERIAL NOT NULL,
    "categoria_id" INTEGER NOT NULL,
    "texto" VARCHAR(60) NOT NULL,

    CONSTRAINT "categoria_alias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parametro" (
    "clave" VARCHAR(50) NOT NULL,
    "valor" DECIMAL(12,4) NOT NULL,
    "descripcion" VARCHAR(255),
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "parametro_pkey" PRIMARY KEY ("clave")
);

-- CreateTable
CREATE TABLE "potrero_uso" (
    "id" SERIAL NOT NULL,
    "potrero_id" INTEGER NOT NULL,
    "uso_suelo_id" INTEGER NOT NULL,
    "desde" DATE NOT NULL,
    "hasta" DATE,
    "usuario_id" INTEGER,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "potrero_uso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "version_stock" (
    "id" SERIAL NOT NULL,
    "potrero_id" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "origen" "OrigenStock" NOT NULL,
    "importacion_id" INTEGER,
    "usuario_id" INTEGER,
    "nota" VARCHAR(255),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "version_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "version_stock_linea" (
    "id" SERIAL NOT NULL,
    "version_id" INTEGER NOT NULL,
    "categoria_id" INTEGER NOT NULL,
    "cabezas" INTEGER NOT NULL,
    "peso_promedio_kg" DECIMAL(7,2),

    CONSTRAINT "version_stock_linea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "importacion" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoImportacion" NOT NULL,
    "archivo" VARCHAR(255) NOT NULL,
    "hash_archivo" CHAR(64) NOT NULL,
    "hoja" VARCHAR(60),
    "fecha_datos" DATE,
    "estado" "EstadoImportacion" NOT NULL DEFAULT 'PENDIENTE',
    "datos" JSONB NOT NULL,
    "advertencias" JSONB,
    "usuario_id" INTEGER,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmada_en" TIMESTAMPTZ(3),

    CONSTRAINT "importacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sesion_baston" (
    "id" SERIAL NOT NULL,
    "importacion_id" INTEGER NOT NULL,
    "campo_id" INTEGER,
    "potrero_id" INTEGER,
    "categoria_id" INTEGER,
    "fecha" DATE NOT NULL,
    "inicio" TIMESTAMPTZ(3),
    "fin" TIMESTAMPTZ(3),
    "cantidad" INTEGER NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sesion_baston_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lectura_baston" (
    "id" SERIAL NOT NULL,
    "sesion_id" INTEGER NOT NULL,
    "eid" VARCHAR(32) NOT NULL,
    "leido_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lectura_baston_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "campo_sigla_key" ON "campo"("sigla");

-- CreateIndex
CREATE UNIQUE INDEX "campo_id_fazenda_cigam_key" ON "campo"("id_fazenda_cigam");

-- CreateIndex
CREATE UNIQUE INDEX "potrero_campo_id_nombre_key" ON "potrero"("campo_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "potrero_subdivision_potrero_id_codigo_key" ON "potrero_subdivision"("potrero_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "uso_suelo_nombre_key" ON "uso_suelo"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "uso_suelo_alias_texto_key" ON "uso_suelo_alias"("texto");

-- CreateIndex
CREATE UNIQUE INDEX "categoria_nombre_key" ON "categoria"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "categoria_id_categoria_cigam_key" ON "categoria"("id_categoria_cigam");

-- CreateIndex
CREATE UNIQUE INDEX "categoria_alias_texto_key" ON "categoria_alias"("texto");

-- CreateIndex
CREATE INDEX "potrero_uso_potrero_id_desde_idx" ON "potrero_uso"("potrero_id", "desde");

-- CreateIndex
CREATE INDEX "version_stock_potrero_id_fecha_idx" ON "version_stock"("potrero_id", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "version_stock_linea_version_id_categoria_id_key" ON "version_stock_linea"("version_id", "categoria_id");

-- CreateIndex
CREATE INDEX "importacion_hash_archivo_idx" ON "importacion"("hash_archivo");

-- CreateIndex
CREATE UNIQUE INDEX "sesion_baston_importacion_id_key" ON "sesion_baston"("importacion_id");

-- CreateIndex
CREATE INDEX "lectura_baston_eid_idx" ON "lectura_baston"("eid");

-- CreateIndex
CREATE UNIQUE INDEX "lectura_baston_sesion_id_eid_key" ON "lectura_baston"("sesion_id", "eid");

-- AddForeignKey
ALTER TABLE "potrero" ADD CONSTRAINT "potrero_campo_id_fkey" FOREIGN KEY ("campo_id") REFERENCES "campo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "potrero_subdivision" ADD CONSTRAINT "potrero_subdivision_potrero_id_fkey" FOREIGN KEY ("potrero_id") REFERENCES "potrero"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uso_suelo_alias" ADD CONSTRAINT "uso_suelo_alias_uso_suelo_id_fkey" FOREIGN KEY ("uso_suelo_id") REFERENCES "uso_suelo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categoria_alias" ADD CONSTRAINT "categoria_alias_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "potrero_uso" ADD CONSTRAINT "potrero_uso_potrero_id_fkey" FOREIGN KEY ("potrero_id") REFERENCES "potrero"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "potrero_uso" ADD CONSTRAINT "potrero_uso_uso_suelo_id_fkey" FOREIGN KEY ("uso_suelo_id") REFERENCES "uso_suelo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "potrero_uso" ADD CONSTRAINT "potrero_uso_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "version_stock" ADD CONSTRAINT "version_stock_potrero_id_fkey" FOREIGN KEY ("potrero_id") REFERENCES "potrero"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "version_stock" ADD CONSTRAINT "version_stock_importacion_id_fkey" FOREIGN KEY ("importacion_id") REFERENCES "importacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "version_stock" ADD CONSTRAINT "version_stock_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "version_stock_linea" ADD CONSTRAINT "version_stock_linea_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "version_stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "version_stock_linea" ADD CONSTRAINT "version_stock_linea_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "importacion" ADD CONSTRAINT "importacion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesion_baston" ADD CONSTRAINT "sesion_baston_importacion_id_fkey" FOREIGN KEY ("importacion_id") REFERENCES "importacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesion_baston" ADD CONSTRAINT "sesion_baston_campo_id_fkey" FOREIGN KEY ("campo_id") REFERENCES "campo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesion_baston" ADD CONSTRAINT "sesion_baston_potrero_id_fkey" FOREIGN KEY ("potrero_id") REFERENCES "potrero"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesion_baston" ADD CONSTRAINT "sesion_baston_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lectura_baston" ADD CONSTRAINT "lectura_baston_sesion_id_fkey" FOREIGN KEY ("sesion_id") REFERENCES "sesion_baston"("id") ON DELETE CASCADE ON UPDATE CASCADE;
