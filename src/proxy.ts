import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Verificação otimista: sem cookie de sessão, redireciona ao login. A
 * autorização real (sessão válida, organização, papel) acontece no servidor,
 * em cada página e rota (src/lib/auth/session.ts e src/server/*).
 */
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const url = new URL("/login", request.url);
    url.searchParams.set("callbackUrl", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/projetos/:path*", "/organizacao/:path*", "/admin/:path*"],
};
