import "server-only";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import type { AccessUser } from "@/lib/auth/permissions";
import { JourneyAIConfigurationError, JourneyAIProviderError } from "@/lib/journey-ai/provider";
import { formatDuration, formatTerritories } from "@/lib/journey/format";
import {
  buildPublicOrganization,
  buildPublicResults,
  PUBLIC_ID_PATTERN,
  type PublicOrganizationView,
  type PublicResultsView,
} from "@/lib/results/public";
import type { JourneySnapshot } from "@/lib/journey/types";
import { computePercentage, figuresComplete } from "@/lib/results/indicator";
import {
  indicatorSlots,
  itemKey,
  plannedItems,
  RESULT_SECTIONS,
  RESULT_SOURCE_TYPES,
  type ItemReference,
} from "@/lib/results/items";
import {
  allIndicatorsComplete,
  organizeResultSchema,
  resultRecordActionSchema,
  type ResultData,
} from "@/lib/results/schemas";
import {
  afterApprove,
  afterDiscard,
  afterProposal,
  afterSave,
  dataChanged,
  evaluationStatusFor,
  RESULTS_LOCKED_MESSAGE,
  resultsUnlocked,
  type RecordTextState,
} from "@/lib/results/status";
import {
  buildResultCard,
  recordData,
  synthesisReady,
  type ResultCardView,
  type ResultRecordRow,
  type ResultsViewState,
} from "@/lib/results/view";
import { checkResultText } from "@/lib/results-ai/text-guards";
import { getResultTextProvider } from "@/lib/results-ai/provider";
import type {
  ResultFormRequest,
  ResultLogicContext,
  ResultTextProvider,
  ResultTextRequest,
} from "@/lib/results-ai/types";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { loadSnapshot } from "@/server/journey/snapshot";
import { assertProjectAccess } from "@/server/projects";
import type { Prisma } from "@/generated/prisma/client";

const WITH_INDICATORS = { indicators: { orderBy: { order: "asc" } } } as const satisfies Prisma.ResultRecordInclude;
type RecordModel = Prisma.ResultRecordGetPayload<{ include: typeof WITH_INDICATORS }>;

const toNumber = (v: Prisma.Decimal | null) => (v === null ? null : Number(v));

/** Uma geração de formulário parada há mais tempo que isso pode ser retomada. */
const FORM_GENERATION_STALE_MS = 3 * 60_000;

const LEVEL_LABELS = {
  ACTIVITY: "Atividade",
  OUTCOME: "Resultado de médio prazo",
  IMPACT: "Impacto de longo prazo",
} as const;

function toRow(r: RecordModel): ResultRecordRow {
  return {
    id: r.id,
    sourceType: r.sourceType,
    sourceId: r.sourceId,
    order: r.order,
    itemSnapshot: r.itemSnapshot,
    targetSnapshot: r.targetSnapshot,
    baselineSnapshot: r.baselineSnapshot,
    verificationSnapshot: r.verificationSnapshot,
    periodSnapshot: r.periodSnapshot,
    formSpec: r.formSpec,
    indicators: r.indicators.map((i) => ({
      id: i.id,
      order: i.order,
      name: i.name,
      kind: i.kind,
      denominator: i.denominator,
      numerator: i.numerator,
      achievedValue: toNumber(i.achievedValue),
      unit: i.unit,
      achievedText: i.achievedText,
    })),
    teamPerception: r.teamPerception,
    additionalContext: r.additionalContext,
    proposedText: r.proposedText,
    proposalIsMock: r.proposalIsMock,
    approvedText: r.approvedText,
    approvedAt: r.approvedAt ? r.approvedAt.toISOString() : null,
    status: r.status,
  };
}

function projectForAI(snapshot: JourneySnapshot): ResultTextRequest["project"] {
  const { project } = snapshot;
  return {
    name: project.name,
    areaLabel: project.areaLabel,
    targetAudience: project.targetAudience,
    problem: project.problem,
    territory: formatTerritories(project.territories),
    durationMonths: project.durationMonths,
    strategy: project.strategy?.trim() || null,
  };
}

/** Onde o item se encaixa na lógica de impacto aprovada (vazio se saiu da Jornada). */
export function logicFor(
  snapshot: JourneySnapshot,
  row: Pick<ResultRecordRow, "sourceType" | "sourceId">,
): ResultLogicContext {
  const impact = snapshot.impact?.statement.trim() || null;
  switch (row.sourceType) {
    case "ACTIVITY":
      return {
        contributesTo: snapshot.outcomes
          .filter((o) => o.relatedActivityIds.includes(row.sourceId))
          .map((o) => o.description),
        builtOn: [],
        impact,
      };
    case "OUTCOME": {
      const outcome = snapshot.outcomes.find((o) => o.id === row.sourceId);
      return {
        contributesTo: impact ? [impact] : [],
        builtOn: snapshot.activities
          .filter((a) => outcome?.relatedActivityIds.includes(a.id))
          .map((a) => a.description),
        impact,
      };
    }
    case "IMPACT":
      return { contributesTo: [], builtOn: snapshot.outcomes.map((o) => o.description), impact };
  }
}

/**
 * Inicia a avaliação final (uma por projeto) e cria um registro para cada item
 * previsto que ainda não tem um, gravando o snapshot da Jornada neste momento.
 * Registros existentes nunca têm o snapshot reescrito.
 */
async function ensureEvaluation(snapshot: JourneySnapshot): Promise<string> {
  const projectId = snapshot.project.id;
  const evaluation = await prisma.projectFinalEvaluation
    .upsert({ where: { projectId }, create: { projectId }, update: {}, select: { id: true } })
    // Duas requisições simultâneas: a segunda encontra a avaliação já criada.
    .catch(() => prisma.projectFinalEvaluation.findUniqueOrThrow({ where: { projectId }, select: { id: true } }));
  const existing = await prisma.resultRecord.findMany({
    where: { evaluationId: evaluation.id },
    select: { sourceType: true, sourceId: true },
  });
  const covered = new Set(existing.map((r) => itemKey(r.sourceType, r.sourceId)));
  const missing = plannedItems(snapshot).filter((i) => !covered.has(itemKey(i.sourceType, i.sourceId)));
  if (missing.length > 0) {
    for (const i of missing) {
      await prisma.resultRecord
        .create({
          data: {
            evaluationId: evaluation.id,
            sourceType: i.sourceType,
            sourceId: i.sourceId,
            order: i.order,
            itemSnapshot: i.reference.item,
            targetSnapshot: i.reference.target,
            baselineSnapshot: i.reference.baseline,
            verificationSnapshot: i.reference.verification,
            periodSnapshot: i.reference.period,
            // Um dado por indicador aprovado (ou um único, sem indicador).
            indicators: { create: indicatorSlots(i.reference).map((name, order) => ({ order, name })) },
          },
        })
        // Requisição simultânea já criou este registro: nada a fazer.
        .catch((error: unknown) => {
          if ((error as { code?: string })?.code !== "P2002") throw error;
        });
    }
    await refreshEvaluationStatus(evaluation.id);
  }
  return evaluation.id;
}

async function refreshEvaluationStatus(evaluationId: string) {
  const evaluation = await prisma.projectFinalEvaluation.findUniqueOrThrow({
    where: { id: evaluationId },
    include: { records: { where: { sourceType: "OUTCOME" }, select: { status: true, approvedText: true } } },
  });
  const status = evaluationStatusFor(evaluation.status, evaluation.records);
  if (status !== evaluation.status) {
    await prisma.projectFinalEvaluation.update({
      where: { id: evaluationId },
      data: { status, ...(status !== "COMPLETED" && { completedAt: null, completedById: null }) },
    });
  }
}

// ---------------------------------------------------------------------------
// Formulário personalizado: gerado UMA vez, ao concluir a Jornada
// ---------------------------------------------------------------------------

/**
 * Gera as perguntas personalizadas de todos os itens em uma única chamada à IA.
 * Só roda se a avaliação ainda não tem formulário (ou se uma geração anterior
 * travou). Se a IA falhar, os itens ficam com o formulário padrão.
 */
export async function prepareResultsForm(
  projectId: string,
  provider: ResultTextProvider = resultTextProviderFor(projectId),
): Promise<void> {
  const snapshot = await loadSnapshot(projectId);
  if (!resultsUnlocked(snapshot.approvedStages)) return;
  const evaluationId = await ensureEvaluation(snapshot);

  const now = new Date();
  const claimed = await prisma.projectFinalEvaluation.updateMany({
    where: {
      id: evaluationId,
      OR: [
        { formStatus: "PENDING" },
        { formStatus: "GENERATING", formStartedAt: { lt: new Date(now.getTime() - FORM_GENERATION_STALE_MS) } },
      ],
    },
    data: { formStatus: "GENERATING", formStartedAt: now },
  });
  if (claimed.count === 0) return;

  const records = await prisma.resultRecord.findMany({ where: { evaluationId }, include: WITH_INDICATORS });
  const request: ResultFormRequest = {
    project: projectForAI(snapshot),
    items: records.map((r) => ({
      id: r.id,
      sourceType: r.sourceType,
      level: LEVEL_LABELS[r.sourceType],
      item: r.itemSnapshot,
      target: r.targetSnapshot,
      indicators: r.indicators.map((x) => x.name).filter((n): n is string => Boolean(n)),
      period: r.periodSnapshot,
    })),
  };

  let source = provider.isMock ? "mock" : "ai";
  let forms: Record<string, unknown> = {};
  try {
    forms = (await provider.generateForms(request)).forms;
  } catch (error) {
    source = "fallback";
    console.error(
      "[results-ai] formulário personalizado indisponível; usando perguntas padrão",
      error instanceof JourneyAIProviderError
        ? `${error.status}: ${error.detail}`
        : error instanceof Error
          ? error.message
          : error,
    );
  }
  await prisma.$transaction([
    ...Object.entries(forms).map(([id, spec]) =>
      prisma.resultRecord.update({ where: { id }, data: { formSpec: spec as Prisma.InputJsonValue } }),
    ),
    prisma.projectFinalEvaluation.update({
      where: { id: evaluationId },
      data: { formStatus: "READY", formGeneratedAt: new Date(), formSource: source },
    }),
  ]);
}

/** Agenda a geração do formulário para depois da resposta (não bloqueia a tela). */
export function schedulePrepareResultsForm(projectId: string) {
  after(async () => {
    try {
      await prepareResultsForm(projectId);
    } catch (error) {
      console.error("[results-ai] falha ao preparar o formulário", error instanceof Error ? error.message : error);
    }
  });
}

// ---------------------------------------------------------------------------
// Visão
// ---------------------------------------------------------------------------

/** Cards em ordem de nível (atividades, resultados, impacto), comparados com a Jornada atual. */
function buildCards(snapshot: JourneySnapshot, records: RecordModel[]): ResultCardView[] {
  const live = new Map<string, ItemReference>(
    plannedItems(snapshot).map((i) => [itemKey(i.sourceType, i.sourceId), i.reference]),
  );
  const cards: ResultCardView[] = [];
  for (const type of RESULT_SOURCE_TYPES) {
    records
      .filter((r) => r.sourceType === type)
      .forEach((r, i) =>
        cards.push(buildResultCard(toRow(r), i + 1, live.get(itemKey(r.sourceType, r.sourceId)) ?? null)),
      );
  }
  return cards;
}

async function buildResultsView(
  snapshot: JourneySnapshot,
  canEdit: boolean,
  aiError?: string,
): Promise<ResultsViewState> {
  const { project } = snapshot;
  const base = {
    project: {
      id: project.id,
      name: project.name,
      organizationId: project.organizationId,
      organizationName: project.organizationName,
      isDemo: project.isDemo,
    },
    canEdit,
  };
  if (!resultsUnlocked(snapshot.approvedStages)) {
    return { ...base, unlocked: false, evaluation: null, cards: [], readyForSynthesis: false };
  }
  const evaluation = await prisma.projectFinalEvaluation.findUnique({
    where: { projectId: project.id },
    include: { records: { orderBy: [{ order: "asc" }, { createdAt: "asc" }], include: WITH_INDICATORS } },
  });
  const cards = buildCards(snapshot, evaluation?.records ?? []);
  return {
    ...base,
    unlocked: true,
    evaluation: evaluation
      ? {
          status: evaluation.status,
          startedAt: evaluation.startedAt.toISOString(),
          completedAt: evaluation.completedAt ? evaluation.completedAt.toISOString() : null,
          formReady: evaluation.formStatus === "READY",
          formSource: evaluation.formSource,
        }
      : null,
    cards,
    readyForSynthesis: synthesisReady(cards),
    ...(aiError && { aiError }),
  };
}

/**
 * Aba de Resultados. Quem edita inicia a avaliação no primeiro acesso; se o
 * formulário personalizado ainda não existe (projetos concluídos antes desta
 * funcionalidade), ele é gerado em segundo plano uma única vez.
 */
export async function getResultsView(user: AccessUser, projectId: string): Promise<ResultsViewState> {
  const { access } = await assertProjectAccess(user, projectId, "view");
  const snapshot = await loadSnapshot(projectId);
  const canEdit = access === "edit";
  if (canEdit && resultsUnlocked(snapshot.approvedStages)) {
    await ensureEvaluation(snapshot);
    const evaluation = await prisma.projectFinalEvaluation.findUnique({
      where: { projectId },
      select: { formStatus: true, formStartedAt: true },
    });
    const stale =
      evaluation?.formStatus === "GENERATING" &&
      (evaluation.formStartedAt?.getTime() ?? 0) < Date.now() - FORM_GENERATION_STALE_MS;
    if (evaluation?.formStatus === "PENDING" || stale) schedulePrepareResultsForm(projectId);
  }
  return buildResultsView(snapshot, canEdit);
}

// ---------------------------------------------------------------------------
// Registro
// ---------------------------------------------------------------------------

/** Acesso de edição + Jornada aprovada + registro pertencente ao projeto. */
async function editableRecord(user: AccessUser, projectId: string, recordId: string) {
  await assertProjectAccess(user, projectId, "edit");
  const snapshot = await loadSnapshot(projectId);
  if (!resultsUnlocked(snapshot.approvedStages)) throw new ConflictError(RESULTS_LOCKED_MESSAGE);
  const record = await prisma.resultRecord.findFirst({
    where: { id: recordId, evaluation: { projectId } },
    include: WITH_INDICATORS,
  });
  if (!record) throw new NotFoundError("Resultado não encontrado.");
  return { snapshot, record };
}

const textState = (r: RecordModel): RecordTextState => ({
  status: r.status,
  proposedText: r.proposedText,
  approvedText: r.approvedText,
});

/**
 * Grava os dados; se mudaram, a proposta e a aprovação anteriores deixam de valer.
 * O envio precisa trazer exatamente os indicadores do registro, na mesma ordem.
 */
async function saveData(record: RecordModel, data: ResultData): Promise<RecordModel> {
  const ids = record.indicators.map((i) => i.id);
  if (data.indicators.length !== ids.length || data.indicators.some((d, i) => d.id !== ids[i])) {
    throw new ConflictError("Os indicadores deste item mudaram. Recarregue a página e preencha de novo.");
  }
  const changed = dataChanged(recordData(toRow(record)), data);
  const next = afterSave(textState(record), changed);
  await prisma.$transaction([
    ...data.indicators.map((d) =>
      prisma.resultIndicator.update({
        where: { id: d.id },
        data: {
          kind: d.kind,
          denominator: d.denominator,
          numerator: d.numerator,
          percentage: d.kind === "PERCENTAGE" ? computePercentage(d.numerator, d.denominator) : null,
          achievedValue: d.achievedValue,
          unit: d.unit,
          achievedText: d.achievedText,
        },
      }),
    ),
    prisma.resultRecord.update({
      where: { id: record.id },
      data: {
        teamPerception: data.teamPerception,
        additionalContext: data.additionalContext,
        ...(changed && {
          status: next.status,
          proposedText: next.proposedText,
          approvedText: next.approvedText,
          proposalIsMock: false,
          aiProposedAt: null,
          approvedAt: null,
          approvedById: null,
        }),
      },
    }),
  ]);
  return prisma.resultRecord.findUniqueOrThrow({ where: { id: record.id }, include: WITH_INDICATORS });
}

export async function updateResultRecord(
  user: AccessUser,
  projectId: string,
  recordId: string,
  body: unknown,
): Promise<ResultsViewState> {
  const action = resultRecordActionSchema.parse(body);
  const { snapshot, record } = await editableRecord(user, projectId, recordId);

  if (action.action === "save") {
    await saveData(record, action.data);
  } else if (action.action === "approve") {
    if (!allIndicatorsComplete(recordData(toRow(record)))) {
      throw new ValidationError(
        "Registre e salve o resultado alcançado em todos os indicadores antes de aprovar o texto técnico.",
      );
    }
    const next = afterApprove(action.text);
    await prisma.resultRecord.update({
      where: { id: record.id },
      data: { ...next, approvedAt: new Date(), approvedById: user.id },
    });
  } else {
    await prisma.resultRecord.update({ where: { id: record.id }, data: afterDiscard(textState(record)) });
  }
  await refreshEvaluationStatus(record.evaluationId);
  return buildResultsView(snapshot, true);
}

/** Monta o que vai à IA: somente os campos previstos para esta etapa. */
export function buildResultTextRequest(snapshot: JourneySnapshot, row: ResultRecordRow): ResultTextRequest {
  const data = recordData(row);
  if (!allIndicatorsComplete(data))
    throw new ValidationError("Registre o resultado alcançado em todos os indicadores.");
  return {
    project: projectForAI(snapshot),
    level: LEVEL_LABELS[row.sourceType],
    item: row.itemSnapshot,
    target: row.targetSnapshot,
    baseline: row.baselineSnapshot,
    logic: logicFor(snapshot, row),
    indicators: row.indicators.map((i) => ({
      indicator: i.name,
      kind: i.kind!,
      denominator: i.denominator,
      numerator: i.numerator,
      percentage: i.kind === "PERCENTAGE" ? computePercentage(i.numerator, i.denominator) : null,
      achievedValue: i.achievedValue,
      unit: i.unit,
      achievedText: i.achievedText,
    })),
    teamPerception: data.teamPerception,
    additionalContext: data.additionalContext,
  };
}

/**
 * "Organizar resultado com a IA": salva os dados, pede a proposta de texto e a
 * grava como PENDENTE (AI_PROPOSED). Nunca aprova nada.
 */
export async function organizeResult(
  user: AccessUser,
  projectId: string,
  recordId: string,
  body: unknown,
  provider: ResultTextProvider = resultTextProviderFor(projectId),
): Promise<ResultsViewState> {
  const { data } = organizeResultSchema.parse(body);
  const { snapshot, record } = await editableRecord(user, projectId, recordId);
  const saved = await saveData(record, data);

  const missing = data.indicators.findIndex((i) => !figuresComplete(i));
  if (missing >= 0) {
    throw new ValidationError(
      "Registre o resultado alcançado em todos os indicadores antes de organizar o texto com a IA.",
      {
        [`indicators.${missing}.result`]: ["Preencha o resultado alcançado deste indicador."],
      },
    );
  }
  if (!data.teamPerception) {
    throw new ValidationError("Conte o que esse resultado mostra na prática antes de organizar o texto com a IA.", {
      teamPerception: ["Descreva o que a equipe percebeu sobre o resultado."],
    });
  }

  const request = buildResultTextRequest(snapshot, toRow(saved));
  let text: string;
  try {
    text = (await provider.organize(request)).text.trim();
    // Travas do servidor valem para qualquer provedor, inclusive o mock.
    const guard = checkResultText(text, request);
    if (!guard.ok) {
      throw new JourneyAIProviderError(
        "A proposta da IA alterava os números registrados ou usava afirmações não sustentadas pelos dados, por isso foi descartada. Tente novamente.",
        "INVALID_RESPONSE",
        `texto recusado pelas travas: ${guard.problems.join("; ")}`,
      );
    }
  } catch (error) {
    if (error instanceof JourneyAIConfigurationError) return buildResultsView(snapshot, true, error.message);
    if (error instanceof JourneyAIProviderError) {
      console.error(`[results-ai] ${error.status}: ${error.detail}`);
      return buildResultsView(snapshot, true, error.userMessage);
    }
    console.error("[results-ai] falha inesperada", error instanceof Error ? error.message : error);
    return buildResultsView(snapshot, true, "A IA não conseguiu organizar o texto agora. Seus dados foram salvos.");
  }

  await prisma.resultRecord.update({
    where: { id: saved.id },
    data: {
      ...afterProposal(textState(saved), text),
      proposalIsMock: provider.isMock,
      aiProposedAt: new Date(),
    },
  });
  await refreshEvaluationStatus(saved.evaluationId);
  return buildResultsView(snapshot, true);
}

/** Conclui a avaliação final: exige todos os resultados de médio prazo com texto aprovado. */
export async function finalizeEvaluation(user: AccessUser, projectId: string): Promise<ResultsViewState> {
  await assertProjectAccess(user, projectId, "edit");
  const snapshot = await loadSnapshot(projectId);
  if (!resultsUnlocked(snapshot.approvedStages)) throw new ConflictError(RESULTS_LOCKED_MESSAGE);
  const evaluationId = await ensureEvaluation(snapshot);
  const records = await prisma.resultRecord.findMany({
    where: { evaluationId },
    select: { sourceType: true, status: true, approvedText: true },
  });
  if (!synthesisReady(records)) {
    throw new ConflictError(
      `Aprove o texto técnico de todos os itens de “${RESULT_SECTIONS.OUTCOME.title}” antes de finalizar o registro.`,
    );
  }
  await prisma.projectFinalEvaluation.update({
    where: { id: evaluationId },
    data: { status: "COMPLETED", completedAt: new Date(), completedById: user.id },
  });
  return buildResultsView(snapshot, true);
}

// ---------------------------------------------------------------------------
// Página pública (protótipo: todos os projetos abertos por link, sem login)
// ---------------------------------------------------------------------------

/** Detalhe público de um projeto a partir da Jornada e dos registros atuais. */
async function loadPublicProject(projectId: string): Promise<PublicResultsView> {
  const [snapshot, evaluation] = await Promise.all([
    loadSnapshot(projectId),
    prisma.projectFinalEvaluation.findUnique({
      where: { projectId },
      include: { records: { orderBy: [{ order: "asc" }, { createdAt: "asc" }], include: WITH_INDICATORS } },
    }),
  ]);
  const { project } = snapshot;
  return buildPublicResults({
    organization: { id: project.organizationId, name: project.organizationName },
    project: {
      id: project.id,
      name: project.name,
      areaLabel: project.areaLabel,
      territory: formatTerritories(project.territories),
      targetAudience: project.targetAudience,
      duration: formatDuration(project.durationMonths),
      problem: project.problem,
      impact: snapshot.impact?.statement.trim() || null,
    },
    journeyConcluded: resultsUnlocked(snapshot.approvedStages),
    evaluationStatus: evaluation?.status ?? null,
    completedAt: evaluation?.completedAt?.toISOString() ?? null,
    cards: buildCards(snapshot, evaluation?.records ?? []),
  });
}

/** Vitrine pública da organização: todos os projetos e seus resultados. null se não existe. */
export async function getPublicOrganization(organizationId: string): Promise<PublicOrganizationView | null> {
  if (!PUBLIC_ID_PATTERN.test(organizationId)) return null;
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, projects: { select: { id: true } } },
  });
  if (!organization) return null;
  const projects = await Promise.all(organization.projects.map((p) => loadPublicProject(p.id)));
  return buildPublicOrganization({ id: organization.id, name: organization.name }, projects);
}

/** Detalhe público de um projeto, só quando pertence à organização do link. */
export async function getPublicProject(organizationId: string, projectId: string): Promise<PublicResultsView | null> {
  if (!PUBLIC_ID_PATTERN.test(organizationId) || !PUBLIC_ID_PATTERN.test(projectId)) return null;
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { organizationId: true } });
  if (project?.organizationId !== organizationId) return null;
  return loadPublicProject(projectId);
}

/** Provedor configurado; no modo externo, cada chamada registra modelo, tokens e status. */
function resultTextProviderFor(projectId: string): ResultTextProvider {
  try {
    return getResultTextProvider(process.env, {
      recordUsage: async (usage) => {
        await prisma.aiUsage.create({ data: { projectId, ...usage } });
      },
    });
  } catch (error) {
    if (error instanceof JourneyAIConfigurationError) {
      const message = error.message;
      const fail = async (): Promise<never> => {
        throw new JourneyAIConfigurationError(message);
      };
      return { name: "unconfigured", isMock: false, organize: fail, generateForms: fail };
    }
    throw error;
  }
}
