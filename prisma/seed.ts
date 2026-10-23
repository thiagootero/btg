/**
 * Seed de DESENVOLVIMENTO.
 *
 * - Cria uma pessoa administradora da plataforma para uso local.
 *   E-mail: SEED_ADMIN_EMAIL (padrão admin@jornada.local)
 *   Senha:  SEED_ADMIN_PASSWORD ou, se ausente, uma senha aleatória exibida
 *           uma única vez no terminal. Não há senha padrão.
 * - Opcionalmente (SEED_DEMO=true), cria a organização fictícia e o projeto
 *   "Sertão Verde", marcados como demonstração.
 *
 * Recusa rodar com NODE_ENV=production. Em produção use `npm run admin:create`.
 */
import { randomBytes } from "node:crypto";
import { addMembership, createPasswordUser, normalizeEmail } from "../src/lib/accounts";
import { consolidateEvidencePlan } from "../src/lib/journey/progress";
import type { JourneySnapshot } from "../src/lib/journey/types";
import { JOURNEY_STAGES } from "../src/lib/journey/stages";
import type { PrismaClient } from "../src/generated/prisma/client";
import { createScriptPrisma } from "./client";

const DEMO_ORG_NAME = "Associação Sertão Vivo (organização fictícia de demonstração)";
const DEMO_PROJECT_NAME = "Sertão Verde (demonstração)";

function randomPassword(): string {
  return randomBytes(12).toString("base64url");
}

async function ensureUser(
  prisma: PrismaClient,
  input: { name: string; email: string; password?: string; platformAdmin?: boolean },
) {
  const email = normalizeEmail(input.email);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`• ${email}: já existe (senha mantida).`);
    return existing;
  }
  const password = input.password || randomPassword();
  const user = await createPasswordUser(prisma, { ...input, email, password });
  console.log(`• ${email}: criado. Senha${input.password ? " definida no .env" : `: ${password}`}`);
  return user;
}

async function seedDemo(prisma: PrismaClient, adminId: string) {
  let org = await prisma.organization.findFirst({ where: { name: DEMO_ORG_NAME } });
  if (!org) org = await prisma.organization.create({ data: { name: DEMO_ORG_NAME, isDemo: true } });

  const coordinator = await ensureUser(prisma, {
    name: "Coordenação (demonstração)",
    email: process.env.SEED_DEMO_EMAIL || "coordenacao@demo.jornada.local",
    password: process.env.SEED_DEMO_PASSWORD,
  });
  await addMembership(prisma, coordinator.id, org.id, "ORGANIZATION_ADMIN");

  if (await prisma.project.findFirst({ where: { organizationId: org.id, name: DEMO_PROJECT_NAME } })) {
    console.log("• Projeto Sertão Verde (demonstração): já existe.");
    return;
  }

  const approved = { approvalStatus: "APPROVED" as const, approvedAt: new Date(), approvedById: coordinator.id };
  const project = await prisma.project.create({
    data: {
      organizationId: org.id,
      name: DEMO_PROJECT_NAME,
      area: "INCLUSAO_PRODUTIVA",
      targetAudience: "Famílias agricultoras em situação de vulnerabilidade social da zona rural de Ninheira.",
      durationMonths: 12,
      problem:
        "As famílias agricultoras convivem com longos períodos de estiagem, têm pouco acesso a técnicas de produção adaptadas ao semiárido e a insumos de qualidade, e encontram poucos canais para vender o excedente. Isso limita a produção de alimentos e a renda das famílias.",
      strategy:
        "Fortalecer a produção e a comercialização da agricultura familiar combinando formação técnica adaptada ao semiárido, acesso a mudas e sementes e a criação de canais de venda locais e digitais",
      journeyStatus: "COMPLETED",
      currentStage: "EVIDENCE_PLAN",
      isDemo: true,
      createdById: coordinator.id,
      territories: { create: [{ city: "Ninheira", state: "MG", order: 0 }] },
    },
  });

  const activitiesData = [
    {
      description: "Realizar capacitações técnicas sobre produção agrícola adaptada ao semiárido para as famílias participantes.",
      target: { description: "12 encontros de 4 horas com 40 famílias participantes", deadline: "ao longo dos 12 meses do projeto", quantity: 12, unit: "encontros" },
      indicators: [
        ["Número de encontros realizados", "Observa se a oferta prevista foi cumprida."],
        ["Número de famílias participantes por encontro", "Observa o alcance da atividade junto ao público."],
      ],
      evidences: ["Lista de presença", "Registro fotográfico dos encontros"],
    },
    {
      description: "Fornecer mudas e sementes adaptadas ao semiárido para os quintais produtivos das famílias.",
      target: { description: "Kits de mudas e sementes para 40 famílias", deadline: "até o 4º mês", quantity: 40, unit: "kits" },
      indicators: [
        ["Quantidade de kits entregues", "Observa se a oferta prevista foi cumprida."],
        ["Número de famílias que receberam os kits", "Observa o alcance da atividade junto ao público."],
      ],
      evidences: ["Termo de recebimento", "Registro fotográfico das entregas"],
    },
    {
      description: "Apoiar a participação das famílias em feiras da agricultura familiar no município.",
      target: { description: "Apoio logístico para a participação em 10 feiras", deadline: "entre o 5º e o 12º mês", quantity: 10, unit: "feiras" },
      indicators: [
        ["Número de feiras apoiadas", "Observa se a oferta prevista foi cumprida."],
        ["Número de famílias expositoras por feira", "Observa o alcance da atividade junto ao público."],
      ],
      evidences: ["Registro das feiras (data, local e número de famílias)", "Registro fotográfico"],
    },
    {
      description: "Implantar pontos de venda comunitários para os produtos das famílias.",
      target: { description: "2 pontos de venda em funcionamento", deadline: "até o 8º mês", quantity: 2, unit: "pontos de venda" },
      indicators: [
        ["Número de pontos de venda implantados", "Observa se a oferta prevista foi cumprida."],
        ["Número de famílias com produtos nos pontos de venda", "Observa o alcance da atividade junto ao público."],
      ],
      evidences: ["Relatório de implantação dos pontos de venda", "Registro fotográfico"],
    },
    {
      description: "Disponibilizar um aplicativo comunitário para divulgação e venda dos produtos das famílias.",
      target: { description: "Aplicativo publicado, com cadastro das famílias interessadas", deadline: "até o 9º mês", quantity: null, unit: null },
      indicators: [
        ["Aplicativo disponibilizado para uso", "Observa se a oferta prevista foi cumprida."],
        ["Número de famílias cadastradas no aplicativo", "Observa o alcance da atividade junto ao público."],
      ],
      evidences: ["Relatório de cadastros do aplicativo", "Registro da publicação do aplicativo"],
    },
  ];

  const activities: { id: string }[] = [];
  for (const [order, a] of activitiesData.entries()) {
    activities.push(
      await prisma.activity.create({
        data: {
          projectId: project.id,
          description: a.description,
          order,
          ...approved,
          target: { create: a.target },
          indicators: { create: a.indicators.map(([name, explanation], i) => ({ name, explanation, order: i })) },
          evidences: { create: a.evidences.map((description, i) => ({ description, order: i })) },
        },
      }),
    );
  }

  const outcomesData = [
    {
      description: "as famílias participantes passem a utilizar, em suas áreas produtivas, as técnicas de produção adaptadas ao semiárido",
      related: [0],
      target: "Até o final do projeto, 70% das famílias participantes utilizam ao menos duas técnicas trabalhadas nas capacitações",
      indicator: "Percentual de famílias que aplicam as técnicas trabalhadas",
      verification: "Relatório de evolução das famílias",
    },
    {
      description: "as famílias participantes ampliem a produção de alimentos em seus quintais produtivos",
      related: [0, 1],
      target: "Até o final do projeto, 60% das famílias participantes com aumento da produção nos quintais",
      indicator: "Percentual de famílias com aumento da produção nos quintais",
      verification: "Relatório de evolução das famílias",
    },
    {
      description: "as famílias participantes passem a utilizar novos canais de comercialização para vender sua produção",
      related: [2, 3, 4],
      target: "Até o final do projeto, 50% das famílias participantes vendem por ao menos um novo canal",
      indicator: "Percentual de famílias que utilizam ao menos um novo canal de comercialização",
      verification: "Relatório de utilização dos canais de comercialização",
    },
  ];

  for (const [order, o] of outcomesData.entries()) {
    await prisma.expectedOutcome.create({
      data: {
        projectId: project.id,
        description: o.description,
        target: o.target,
        order,
        ...approved,
        activities: { create: o.related.map((i) => ({ activityId: activities[i].id })) },
        indicators: {
          create: [{ name: o.indicator, explanation: "Mostra quanto do público alcançou a mudança ao final do projeto.", order: 0 }],
        },
        evidences: { create: [{ description: o.verification, order: 0 }] },
      },
    });
  }

  await prisma.longTermImpact.create({
    data: {
      projectId: project.id,
      statement:
        "Contribuir para que as famílias agricultoras de Ninheira tenham mais segurança alimentar e uma renda mais estável a partir da agricultura familiar adaptada ao semiárido.",
      followUpOption: "FOLLOW_UP_CHANGE",
      ...approved,
      followUps: {
        create: [
          {
            description: "Famílias que mantêm os quintais produtivos após o encerramento do projeto",
            target: "Metade das famílias participantes mantém o quintal produtivo",
            indicator: "Percentual de famílias que mantêm o quintal produtivo",
            verification: "Relatório de acompanhamento pós-projeto",
            periodAfterEnd: "12 meses após o encerramento",
            order: 0,
          },
        ],
      },
    },
  });

  // Plano de evidências consolidado com a mesma regra usada pela aplicação.
  const full = await prisma.project.findUniqueOrThrow({
    where: { id: project.id },
    include: {
      activities: { orderBy: { order: "asc" }, include: { target: true, indicators: true, evidences: true } },
      outcomes: { orderBy: { order: "asc" }, include: { activities: true, indicators: true, evidences: true } },
      impact: { include: { followUps: true } },
    },
  });
  const snapshot = {
    project: { id: project.id },
    approvedStages: [...JOURNEY_STAGES],
    currentStage: null,
    activities: full.activities.map((a) => ({
      id: a.id,
      order: a.order,
      description: a.description,
      target: a.target
        ? { description: a.target.description, deadline: a.target.deadline, quantity: a.target.quantity === null ? null : Number(a.target.quantity), unit: a.target.unit }
        : null,
      indicators: a.indicators.map((i) => ({ name: i.name, explanation: i.explanation })),
      evidences: a.evidences.map((e) => e.description),
    })),
    outcomes: full.outcomes.map((o) => ({
      id: o.id,
      order: o.order,
      description: o.description,
      target: o.target,
      relatedActivityIds: o.activities.map((x) => x.activityId),
      indicators: o.indicators.map((i) => ({ name: i.name, explanation: i.explanation })),
      evidences: o.evidences.map((e) => e.description),
    })),
    impact: full.impact
      ? {
          id: full.impact.id,
          statement: full.impact.statement,
          followUpOption: full.impact.followUpOption,
          followUps: full.impact.followUps.map((f) => ({ ...f })),
        }
      : null,
    evidencePlan: [],
  } as unknown as JourneySnapshot;

  for (const item of consolidateEvidencePlan(snapshot)) {
    await prisma.evidencePlanItem.create({
      data: {
        projectId: project.id,
        sourceType: item.sourceType,
        activityId: item.sourceType === "ACTIVITY" ? item.sourceId : null,
        outcomeId: item.sourceType === "OUTCOME" ? item.sourceId : null,
        impactId: item.sourceType === "IMPACT" ? full.impact?.id : null,
        impactFollowUpId: item.sourceType === "IMPACT" ? item.sourceId : null,
        target: item.target,
        indicator: item.indicator,
        verification: item.verification,
        collectionTiming: item.collectionTiming,
        responsible: item.sourceType === "ACTIVITY" ? "Equipe técnica do projeto" : null,
        instrument: item.instrument,
        pending: item.sourceType === "ACTIVITY" ? null : item.pending,
        order: item.order,
      },
    });
  }

  for (const stage of JOURNEY_STAGES) {
    await prisma.journeyStageApproval.create({ data: { projectId: project.id, stage, approvedById: coordinator.id } });
  }

  await prisma.journeyConversation.create({
    data: {
      projectId: project.id,
      messages: {
        create: [
          {
            role: "ASSISTANT",
            stage: "EVIDENCE_PLAN",
            isMock: true,
            content:
              "Este é um projeto de **demonstração**, com dados fictícios criados pelo seed. A jornada já está concluída: explore as etapas aprovadas no painel lateral, o plano de evidências e o relatório geral.",
          },
        ],
      },
    },
  });

  void adminId;
  console.log("• Projeto Sertão Verde (demonstração): criado e com a jornada concluída.");
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("O seed é apenas para desenvolvimento. Em produção, use `npm run admin:create`.");
  }
  const prisma = createScriptPrisma();
  try {
    console.log("Seed de desenvolvimento — Jornada de Impacto");
    const admin = await ensureUser(prisma, {
      name: "Administração (desenvolvimento)",
      email: process.env.SEED_ADMIN_EMAIL || "admin@jornada.local",
      password: process.env.SEED_ADMIN_PASSWORD,
      platformAdmin: true,
    });
    if (process.env.SEED_DEMO !== "false") await seedDemo(prisma, admin.id);
    console.log("Concluído. Anote as senhas exibidas acima: elas não serão mostradas novamente.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
