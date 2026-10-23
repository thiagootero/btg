import { NextResponse, connection } from "next/server";
import { prisma } from "@/lib/db";

/** Healthcheck usado pelo Docker: verifica a aplicação e a conexão com o banco. */
export async function GET() {
  await connection();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "error", database: "unavailable" }, { status: 503 });
  }
}
