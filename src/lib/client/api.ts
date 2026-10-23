"use client";

/** Erro devolvido pelas rotas da API, já com mensagem em português. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.", 0);
  }
  if (response.status === 401) {
    // Sessão expirada: recarrega a página inteira para limpar o estado do cliente.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`;
    throw new ApiError("Sua sessão expirou. Entre novamente.", 401);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = data?.error;
    throw new ApiError(
      error?.message ?? "Algo não saiu como esperado. Tente novamente.",
      response.status,
      error?.fieldErrors,
    );
  }
  return data as T;
}
