/** Cliente Prisma para scripts executados fora do Next.js (seed, admin). */
import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";

export function createScriptPrisma(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não está definida. Copie .env.example para .env e ajuste.");
  return new PrismaClient({ adapter: new PrismaMariaDb(url) });
}
