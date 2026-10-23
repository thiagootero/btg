/**
 * Cria (ou promove) uma pessoa administradora da plataforma (platform_admin).
 *
 * Uso (desenvolvimento ou produção):
 *   ADMIN_NAME="Nome" ADMIN_EMAIL="pessoa@dominio" ADMIN_PASSWORD="senha-forte" npm run admin:create
 *
 * Nenhuma credencial padrão existe: nome, e-mail e senha são obrigatórios.
 */
import { createPasswordUser, normalizeEmail } from "../src/lib/accounts";
import { PASSWORD_MIN_LENGTH } from "../src/lib/auth/password-policy";
import { createScriptPrisma } from "./client";


async function main() {
  const name = process.env.ADMIN_NAME?.trim();
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!name || !email) throw new Error("Defina ADMIN_NAME e ADMIN_EMAIL.");
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Defina ADMIN_PASSWORD com pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`);
  }
  const prisma = createScriptPrisma();
  try {
    const existing = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
    if (existing) {
      await prisma.user.update({ where: { id: existing.id }, data: { platformRole: "PLATFORM_ADMIN" } });
      console.log(`Conta existente ${existing.email} promovida a administradora da plataforma (senha mantida).`);
      return;
    }
    const user = await createPasswordUser(prisma, { name, email, password, platformAdmin: true });
    console.log(`Administradora da plataforma criada: ${user.email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
