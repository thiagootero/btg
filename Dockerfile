# syntax=docker/dockerfile:1.7
# Imagem de produção da Jornada de Impacto (Next.js standalone + Prisma).

FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Dependências (inclui as de desenvolvimento, necessárias para o build e o Prisma CLI)
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci --ignore-scripts && npx prisma generate

# Build da aplicação
FROM deps AS builder
COPY . .
RUN npx prisma generate && npm run build

# Imagem usada para migrations e scripts administrativos (prisma CLI + tsx)
FROM deps AS migrator
COPY . .
RUN npx prisma generate
CMD ["npx", "prisma", "migrate", "deploy"]

# Imagem final, enxuta, apenas com o servidor standalone
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
