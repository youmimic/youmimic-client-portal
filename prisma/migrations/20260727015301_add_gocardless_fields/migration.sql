-- AlterTable
ALTER TABLE "users" ADD COLUMN     "gocardlessCustomerId" TEXT,
ADD COLUMN     "gocardlessMandateActive" BOOLEAN NOT NULL DEFAULT false;
