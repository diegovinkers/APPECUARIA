-- AlterTable
ALTER TABLE "lote" ADD COLUMN     "fecha_entrada" DATE,
ADD COLUMN     "peso_entrada_kg" DECIMAL(7,2);

-- AlterTable
ALTER TABLE "potrero" ADD COLUMN     "metros_comedero" DECIMAL(8,2);
