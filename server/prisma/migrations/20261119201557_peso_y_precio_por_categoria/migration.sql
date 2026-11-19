-- CreateEnum
CREATE TYPE "PrecioPor" AS ENUM ('KG', 'CABEZA');

-- AlterTable
ALTER TABLE "categoria" ADD COLUMN     "peso_promedio_kg" DECIMAL(8,2),
ADD COLUMN     "precio_por" "PrecioPor" NOT NULL DEFAULT 'KG',
ADD COLUMN     "precio_usd" DECIMAL(12,2);
