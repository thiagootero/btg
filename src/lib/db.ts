import "server-only";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";

// O adaptador MariaDB é o driver oficial do Prisma para MySQL; ele aceita
// URLs no formato mysql://usuario:senha@host:3306/banco.
function createPrismaClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL não está definida. Consulte o .env.example.");
  }
  return new PrismaClient({ adapter: new PrismaMariaDb(withPublicKeyRetrieval(url)) });
}

// O MySQL 8 autentica com caching_sha2_password; sem TLS, o driver mariadb só
// conclui o login se puder buscar a chave RSA do servidor. Sem esta opção o
// pool falha com "pool failed to retrieve a connection" (erro 45028).
function withPublicKeyRetrieval(url: string): string {
  if (/[?&]allowPublicKeyRetrieval=/i.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}allowPublicKeyRetrieval=true`;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getClient(): PrismaClient {
  globalForPrisma.prisma ??= createPrismaClient();
  return globalForPrisma.prisma;
}

/**
 * Cliente criado sob demanda: o build (`next build`) importa os módulos sem
 * precisar de DATABASE_URL; a conexão só é aberta na primeira consulta.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getClient();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
