import "dotenv/config";
import { defineConfig } from "prisma/config";

// DATABASE_URL é obrigatória para migrations; o placeholder permite rodar
// `prisma generate` (ex.: no build Docker) sem um banco disponível.
const databaseUrl =
  process.env.DATABASE_URL ?? "mysql://placeholder:placeholder@localhost:3306/placeholder";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: databaseUrl,
    // Banco "sombra" usado apenas por `prisma migrate dev` em desenvolvimento.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
