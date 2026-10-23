/**
 * Erros de domínio com mensagens seguras para exibição. Qualquer outro erro é
 * registrado no servidor e devolvido ao usuário como mensagem genérica.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Sua sessão expirou. Entre novamente para continuar.") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Você não tem permissão para realizar esta ação.") {
    super(message, 403, "FORBIDDEN");
  }
}

/** Usado também quando o recurso existe mas pertence a outra organização. */
export class NotFoundError extends AppError {
  constructor(message = "Não encontramos o que você procurava.") {
    super(message, 404, "NOT_FOUND");
  }
}

export class ValidationError extends AppError {
  constructor(message: string, fieldErrors?: Record<string, string[]>) {
    super(message, 422, "VALIDATION_ERROR", fieldErrors);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "CONFLICT");
  }
}
