# Jornada de Impacto · BTG Soma

Plataforma web que ajuda organizações sociais a organizar a lógica de impacto de
cada projeto: atividades ofertadas, mudanças esperadas no público, impacto de
longo prazo e um plano de evidências — com apoio de um consultor virtual e
aprovação explícita de cada decisão.

> Esta primeira versão usa um consultor virtual **em modo de teste** (sem IA
> externa). A camada de IA está pronta para ser conectada depois — veja
> [docs/AI_INTEGRATION.md](docs/AI_INTEGRATION.md).

## Sumário

- [Arquitetura](#arquitetura)
- [Pré-requisitos](#pré-requisitos)
- [Rodar localmente (WSL + MySQL)](#rodar-localmente-wsl--mysql)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Migrations e seed](#migrations-e-seed)
- [Scripts](#scripts)
- [Subir em um servidor Linux (Docker Compose)](#subir-em-um-servidor-linux-docker-compose)
- [Configurar o domínio no Caddy](#configurar-o-domínio-no-caddy)
- [Backup do banco (mysqldump)](#backup-do-banco-mysqldump)
- [Trocar AI_PROVIDER de mock para external](#trocar-ai_provider-de-mock-para-external)
- [Perfis e permissões](#perfis-e-permissões)

## Arquitetura

Monólito modular em um único repositório:

| Camada | Pasta | Responsabilidade |
|---|---|---|
| Interface | `src/app`, `src/components` | Páginas (App Router), formulários, chat da jornada |
| Rotas de servidor | `src/app/api/**`, `actions.ts` | Validação de entrada, sessão e respostas JSON |
| Serviços | `src/server/**` | Autorização por organização, persistência, fluxo da jornada |
| Domínio | `src/lib/journey/**` | Etapas, schemas das propostas, regras metodológicas (funções puras) |
| Adaptador de IA | `src/lib/journey-ai/**` | Contrato, provedor mock, estrutura do provedor externo, prompt |
| Autenticação | `src/lib/auth/**` | Better Auth (e-mail e senha), sessão e permissões |
| Banco | `prisma/` | Schema MySQL, migrations, seed |

Tecnologias: Next.js 16 (App Router, TypeScript), React 19, Prisma 7 (MySQL 8,
driver `@prisma/adapter-mariadb`), Better Auth, Tailwind CSS 4 + shadcn/ui
(Radix), Zod, Vitest. Produção: Docker Compose (app + MySQL + Caddy).

## Pré-requisitos

Desenvolvimento (WSL/Linux):

- Node.js 20.19+ (recomendado 22 ou 24) e npm
- MySQL 8 instalado e em execução no WSL (`sudo service mysql start`)

Docker, Caddy e containers **não** são necessários para desenvolver.

Produção: servidor Linux com Docker Engine e Docker Compose v2, portas 80 e 443
liberadas e um domínio apontando para o servidor.

## Rodar localmente (WSL + MySQL)

1. Crie o banco e um usuário dedicado no MySQL (troque a senha):

   ```bash
   sudo mysql <<'SQL'
   CREATE DATABASE IF NOT EXISTS jornada_impacto CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE DATABASE IF NOT EXISTS jornada_impacto_shadow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER IF NOT EXISTS 'jornada'@'localhost' IDENTIFIED BY 'TROQUE_ESTA_SENHA';
   GRANT ALL PRIVILEGES ON jornada_impacto.* TO 'jornada'@'localhost';
   GRANT ALL PRIVILEGES ON jornada_impacto_shadow.* TO 'jornada'@'localhost';
   FLUSH PRIVILEGES;
   SQL
   ```

   O banco `jornada_impacto_shadow` é usado só pelo `prisma migrate dev`.

2. Configure as variáveis:

   ```bash
   cp .env.example .env
   # edite DATABASE_URL, SHADOW_DATABASE_URL e BETTER_AUTH_SECRET
   openssl rand -base64 32   # use a saída como BETTER_AUTH_SECRET
   ```

3. Instale, aplique as migrations, popule e rode:

   ```bash
   npm install
   npx prisma migrate dev
   npx prisma db seed
   npm run dev
   ```

4. Acesse <http://localhost:3000> e entre com as credenciais exibidas pelo seed.

## Variáveis de ambiente

Todas estão documentadas em [`.env.example`](.env.example).

| Variável | Uso |
|---|---|
| `DATABASE_URL` | Conexão MySQL: `mysql://USUARIO:SENHA@localhost:3306/jornada_impacto` |
| `SHADOW_DATABASE_URL` | Banco sombra do `prisma migrate dev` (apenas desenvolvimento) |
| `BETTER_AUTH_SECRET` | Segredo da autenticação (≥ 32 caracteres aleatórios) |
| `BETTER_AUTH_URL` | URL pública da aplicação (ex.: `http://localhost:3000`) |
| `AI_PROVIDER` | `mock` (padrão) ou `external` |
| `OPENAI_API_KEY` | Chave da OpenAI, obrigatória com `AI_PROVIDER=external` (só no servidor) |
| `OPENAI_MODEL` | Modelo da OpenAI (padrão `gpt-6.1-sol`; `gpt-5.4` testado; evite `gpt-5.4-mini`, que gera caracteres de outro alfabeto) |
| `OPENAI_TIMEOUT_MS`, `OPENAI_REASONING_EFFORT` | Opcionais (ver docs) |
| `SEED_*` | Opções do seed de desenvolvimento |
| `APP_DOMAIN`, `MYSQL_*` | Usadas pelo `docker-compose.yml` em produção |

Senhas com caracteres especiais na `DATABASE_URL` devem ser codificadas para URL
(`@` → `%40`, `#` → `%23`…).

## Migrations e seed

```bash
npx prisma migrate dev          # desenvolvimento: aplica e cria migrations
npx prisma migrate deploy       # produção/homologação: só aplica as existentes
npx prisma db seed              # seed de desenvolvimento
npm run admin:create            # cria/promove admin da plataforma (sem senha padrão)
```

O **seed** (`prisma/seed.ts`) é só para desenvolvimento e recusa rodar com
`NODE_ENV=production`. Ele cria:

- uma pessoa **administradora da plataforma**: e-mail `SEED_ADMIN_EMAIL`
  (padrão `admin@jornada.local`) e senha `SEED_ADMIN_PASSWORD` — se a senha não
  estiver definida, uma senha aleatória é gerada e exibida **uma única vez**;
- com `SEED_DEMO=true`, a organização fictícia “Associação Sertão Vivo” e o
  projeto **Sertão Verde (demonstração)** (Ninheira/MG, 12 meses, 5 atividades,
  3 resultados, impacto e plano de evidências), com a pessoa
  `coordenacao@demo.jornada.local` como administradora da organização. Todo esse
  conteúdo é marcado como demonstração.

Rodar o seed de novo não duplica dados nem troca senhas existentes.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build e servidor de produção |
| `npm run lint` | ESLint |
| `npm run typecheck` | Gera tipos de rotas e roda `tsc --noEmit` |
| `npm run test` | Testes (Vitest): schemas, regras metodológicas, permissões e fluxo do consultor |
| `npm run admin:create` | Cria/promove administrador da plataforma |

## Subir em um servidor Linux (Docker Compose)

Serviços do `docker-compose.yml`:

- `db` — MySQL 8.4, volume persistente, **sem porta publicada** (rede interna);
  healthcheck com `mysqladmin ping`;
- `migrate` — aplica `prisma migrate deploy` e encerra;
- `app` — Next.js standalone (sem porta publicada), healthcheck em `/api/health`;
- `caddy` — proxy reverso com HTTPS automático (únicas portas expostas: 80/443).

Passo a passo:

```bash
git clone <repositório> jornada && cd jornada
cp .env.example .env
# Edite .env: APP_DOMAIN, MYSQL_PASSWORD, MYSQL_ROOT_PASSWORD, BETTER_AUTH_SECRET.
# Use senhas fortes e exclusivas (ex.: openssl rand -base64 24).
docker compose up -d --build
docker compose ps                 # db, app e caddy "healthy"/"running"; migrate "exited (0)"
```

Crie a primeira pessoa administradora da plataforma (não existe usuário padrão):

```bash
docker compose run --rm \
  -e ADMIN_NAME="Nome da pessoa" \
  -e ADMIN_EMAIL="pessoa@dominio.org" \
  -e ADMIN_PASSWORD="uma-senha-forte" \
  migrate npm run admin:create
```

Depois, pela interface (menu **Administração**), crie as organizações e suas
pessoas administradoras. Atualizações: `git pull && docker compose up -d --build`
(as migrations rodam automaticamente pelo serviço `migrate`).

Logs: `docker compose logs -f app`.

## Configurar o domínio no Caddy

1. Crie um registro DNS `A` (e `AAAA`, se houver IPv6) do domínio apontando para
   o IP do servidor.
2. Defina `APP_DOMAIN=seu.dominio.org.br` no `.env`. A aplicação usa
   `https://${APP_DOMAIN}` como `BETTER_AUTH_URL` automaticamente.
3. `docker compose up -d` — o Caddy (`deploy/Caddyfile`) obtém e renova o
   certificado HTTPS sozinho. As portas 80 e 443 precisam estar acessíveis.

Para testar sem domínio público, use `APP_DOMAIN=localhost` (certificado local
do Caddy, não confiável fora da máquina).

## Backup do banco (mysqldump)

Desenvolvimento (MySQL local no WSL):

```bash
mysqldump -u jornada -p --single-transaction --routines --triggers jornada_impacto > backup-$(date +%F).sql
# Restaurar:
mysql -u jornada -p jornada_impacto < backup-AAAA-MM-DD.sql
```

Produção (container `db`):

```bash
docker compose exec -T db sh -c 'exec mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers "$MYSQL_DATABASE"' \
  | gzip > backup-jornada-$(date +%F).sql.gz

# Restaurar:
gunzip -c backup-jornada-AAAA-MM-DD.sql.gz | docker compose exec -T db sh -c 'exec mysql -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"'
```

Recomendação: agende o backup (ex.: `cron` diário), mantenha cópias fora do
servidor e teste a restauração periodicamente.

## Consultor virtual: mock ou OpenAI

O consultor tem dois modos, escolhidos por `AI_PROVIDER`:

- `mock` (padrão): respostas simuladas e determinísticas, sem chave, sem rede e
  sem custo. Use para desenvolvimento e testes.
- `external`: OpenAI (Responses API com Structured Outputs).

Para ativar a OpenAI:

1. No `.env` do servidor, defina:
   ```env
   AI_PROVIDER="external"
   OPENAI_API_KEY="sua-chave"
   OPENAI_MODEL="gpt-6.1-sol"   # opcional; este é o padrão
   ```
   A chave é lida só no servidor. Nunca use `NEXT_PUBLIC_OPENAI_API_KEY`.
2. Teste a integração com uma chamada real (projeto fictício, sem tocar no banco):
   ```bash
   npm run ai:check
   ```
3. Reinicie a aplicação (`npm run dev` ou `docker compose up -d --build app`).

Para voltar ao modo sem custo, troque para `AI_PROVIDER="mock"` e reinicie.

A IA apenas propõe: atividades, resultados e impacto só são gravados quando a
pessoa aprova. Cada chamada registra no banco (tabela `ai_usage`) o modelo, os
tokens de entrada e saída, a data, o projeto e o status — nunca a chave ou o
conteúdo. Detalhes em [docs/AI_INTEGRATION.md](docs/AI_INTEGRATION.md).

## Perfis e permissões

| Perfil | Pode |
|---|---|
| `platform_admin` | Ver todas as organizações e projetos (somente leitura); criar organizações |
| `organization_admin` | Criar e editar projetos da própria organização; gerenciar pessoas da organização |
| `organization_member` | Criar e editar projetos da própria organização |

Toda checagem acontece no servidor (`src/lib/auth/permissions.ts`,
`src/server/projects.ts`). Projetos de outras organizações respondem como “não
encontrado”. Não há cadastro público: contas são criadas pelo seed, pelo
`admin:create` ou pelas telas de administração.
