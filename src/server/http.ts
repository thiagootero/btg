import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "@/server/errors";
import { zodFieldErrors } from "@/lib/validation/zod-errors";

/**
 * Envolve um route handler: converte erros de domínio e de validação em
 * respostas JSON com mensagens em português e nunca expõe stack traces.
 */
export async function handleRoute(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    return errorResponse(error);
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: { message: error.message, code: error.code, fieldErrors: error.fieldErrors } },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          message: "Alguns dados enviados não são válidos. Revise os campos destacados.",
          code: "VALIDATION_ERROR",
          fieldErrors: zodFieldErrors(error),
        },
      },
      { status: 422 },
    );
  }
  console.error("[api] erro inesperado", error);
  return NextResponse.json(
    { error: { message: "Algo não saiu como esperado. Tente novamente em instantes.", code: "INTERNAL" } },
    { status: 500 },
  );
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError("Não foi possível ler os dados enviados.", 400, "BAD_REQUEST");
  }
}
