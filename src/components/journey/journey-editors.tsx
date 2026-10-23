"use client";

import { EditDialog } from "@/components/journey/edit-dialog";
import {
  ActivityForm,
  EvidencePlanForm,
  ImpactFollowUpForm,
  ImpactStatementForm,
  OutcomeFullForm,
  ActivityListForm,
  OutcomeDetailForm,
  OutcomeIndicatorForm,
  OutcomeStatementsForm,
  OutcomeTargetForm,
  type OutcomeFullValue,
} from "@/components/journey/forms";
import { proposalTitle } from "@/components/journey/proposal-view";
import type { JourneyController } from "@/components/journey/use-journey";
import { activityEditSchema, impactEditSchema, outcomeEditSchema } from "@/lib/journey/api-schemas";
import {
  activityListPayloadSchema,
  activityPayloadSchema,
  type ActivityListPayload,
  evidencePlanPayloadSchema,
  impactPayloadSchema,
  outcomePayloadSchema,
  type ActivityPayload,
  type EvidencePlanPayload,
  type ImpactFollowUpInput,
  type ImpactOption,
  type ImpactPayload,
  type OutcomePayload,
} from "@/lib/journey/proposal-schemas";
import type { ActivityView } from "@/lib/journey/types";
import type { ProposalView } from "@/lib/journey/view-types";

const REPLACE_CONFIRM = {
  title: "Substituir a versão aprovada?",
  description: "Este conteúdo já foi aprovado. Ao confirmar, a versão atual será substituída pela versão editada.",
  label: "Substituir versão aprovada",
};

/** Edição de uma proposta pendente antes de aprová-la. */
export function ProposalEditorDialog({
  proposal,
  open,
  onOpenChange,
  journey,
}: {
  proposal: ProposalView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  journey: JourneyController;
}) {
  const { snapshot } = journey.view;
  const common = {
    open,
    onOpenChange,
    title: `Editar: ${proposalTitle(proposal.type, proposal.payload)}`,
    description: "Ajuste o que for necessário. Ao salvar, a versão editada é aprovada e registrada.",
    submitLabel: "Aprovar versão editada",
  };
  const approve = (payload: unknown) => journey.decideProposal(proposal.id, "APPROVE", payload);

  if (proposal.type === "ACTIVITY") {
    const list = activityListPayloadSchema.safeParse(proposal.payload);
    if (list.success) {
      const initialList: ActivityListPayload = list.data;
      return (
        <EditDialog
          {...common}
          initial={initialList}
          schema={activityListPayloadSchema}
          onSubmit={approve}
          render={(v, set, errors) => (
            <ActivityListForm value={v} onChange={set} errors={errors} existingCount={snapshot.activities.length} />
          )}
        />
      );
    }
    const parsed = activityPayloadSchema.safeParse(proposal.payload);
    const initial: ActivityPayload = parsed.success
      ? parsed.data
      : { description: "", target: { description: "", deadline: null, quantity: null, unit: null, durationMonths: null, period: null }, indicators: [{ name: "", explanation: null }], evidences: [{ description: "" }] };
    return (
      <EditDialog
        {...common}
        initial={initial}
        schema={activityPayloadSchema}
        onSubmit={approve}
        render={(v, set, errors) => <ActivityForm value={v} onChange={set} errors={errors} />}
      />
    );
  }

  if (proposal.type === "OUTCOME") {
    const parsed = outcomePayloadSchema.safeParse(proposal.payload);
    if (!parsed.success) return null;
    const initial: OutcomePayload = parsed.data;
    return (
      <EditDialog
        {...common}
        initial={initial}
        schema={outcomePayloadSchema}
        onSubmit={approve}
        render={(v, set, errors) =>
          v.step === "STATEMENTS" ? (
            <OutcomeStatementsForm value={v} onChange={set} errors={errors} activities={snapshot.activities} existingCount={snapshot.outcomes.length} />
          ) : v.step === "DETAIL" ? (
            <OutcomeDetailForm value={v} onChange={set} errors={errors} />
          ) : v.step === "TARGET" ? (
            <OutcomeTargetForm value={v} onChange={set} errors={errors} />
          ) : (
            <OutcomeIndicatorForm value={v} onChange={set} errors={errors} />
          )
        }
      />
    );
  }

  if (proposal.type === "IMPACT") {
    const parsed = impactPayloadSchema.safeParse(proposal.payload);
    if (!parsed.success) return null;
    const initial: ImpactPayload = parsed.data;
    return (
      <EditDialog
        {...common}
        initial={initial}
        schema={impactPayloadSchema}
        onSubmit={approve}
        render={(v, set, errors) =>
          v.step === "STATEMENT" ? (
            <ImpactStatementForm value={v.statement} onChange={(statement) => set({ ...v, statement })} errors={errors} />
          ) : (
            <ImpactFollowUpForm
              option={v.option}
              followUps={v.followUps}
              errors={errors}
              onChange={(option, followUps) =>
                set({ ...v, option: option ?? "VISION_ONLY", followUps: option === "VISION_ONLY" ? [] : followUps })
              }
            />
          )
        }
      />
    );
  }

  const parsed = evidencePlanPayloadSchema.safeParse(proposal.payload);
  if (!parsed.success) return null;
  const initial: EvidencePlanPayload = parsed.data;
  return (
    <EditDialog
      {...common}
      initial={initial}
      schema={evidencePlanPayloadSchema}
      onSubmit={approve}
      render={(v, set, errors) => <EvidencePlanForm value={v} onChange={set} errors={errors} />}
    />
  );
}

/** Edição de uma atividade já aprovada (exige confirmação). */
export function ActivityEditDialog({
  activity,
  open,
  onOpenChange,
  journey,
}: {
  activity: ActivityView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  journey: JourneyController;
}) {
  const initial: ActivityPayload = {
    description: activity.description,
    target: activity.target ? { ...activity.target, period: null } : { description: "", deadline: null, quantity: null, unit: null, durationMonths: null, period: null },
    indicators: activity.indicators.length ? activity.indicators : [{ name: "", explanation: null }],
    evidences: (activity.evidences.length ? activity.evidences : [""]).map((description) => ({ description })),
  };
  return (
    <EditDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Editar atividade aprovada"
      initial={initial}
      schema={activityEditSchema}
      toInput={(v) => ({ ...v, confirmReplace: true })}
      confirmReplace={REPLACE_CONFIRM}
      submitLabel="Salvar"
      onSubmit={(data) => journey.updateActivity(activity.id, data)}
      render={(v, set, errors) => <ActivityForm value={v} onChange={set} errors={errors} />}
    />
  );
}

export function OutcomeEditDialog({
  outcomeId,
  open,
  onOpenChange,
  journey,
}: {
  outcomeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  journey: JourneyController;
}) {
  const { snapshot } = journey.view;
  const outcome = snapshot.outcomes.find((o) => o.id === outcomeId);
  if (!outcome) return null;
  const initial: OutcomeFullValue = {
    statement: outcome.description,
    relatedActivityIds: outcome.relatedActivityIds,
    target: outcome.target,
    indicators: outcome.indicators,
    verification: outcome.evidences.join("; ") || null,
  };
  return (
    <EditDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Editar resultado aprovado"
      initial={initial}
      schema={outcomeEditSchema}
      toInput={(v) => ({ ...v, confirmReplace: true })}
      confirmReplace={REPLACE_CONFIRM}
      submitLabel="Salvar"
      onSubmit={(data) => journey.updateOutcome(outcomeId, data)}
      render={(v, set, errors) => <OutcomeFullForm value={v} onChange={set} errors={errors} activities={snapshot.activities} />}
    />
  );
}

export function ImpactEditDialog({
  open,
  onOpenChange,
  journey,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  journey: JourneyController;
}) {
  const impact = journey.view.snapshot.impact;
  if (!impact) return null;
  const initial: { statement: string; followUpOption: ImpactOption | null; followUps: ImpactFollowUpInput[] } = {
    statement: impact.statement,
    followUpOption: impact.followUpOption,
    followUps: impact.followUps.map(({ description, target, indicator, verification, periodAfterEnd, notes }) => ({
      description,
      target,
      indicator,
      verification,
      periodAfterEnd,
      notes,
    })),
  };
  return (
    <EditDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Editar impacto de longo prazo"
      initial={initial}
      schema={impactEditSchema}
      toInput={(v) => ({ ...v, confirmReplace: true })}
      confirmReplace={REPLACE_CONFIRM}
      submitLabel="Salvar"
      onSubmit={(data) => journey.updateImpact(data)}
      render={(v, set, errors) => (
        <div className="space-y-5">
          <ImpactStatementForm value={v.statement} onChange={(statement) => set({ ...v, statement })} errors={errors} />
          <ImpactFollowUpForm
            allowNoOption
            option={v.followUpOption}
            followUps={v.followUps}
            errors={errors}
            onChange={(followUpOption, followUps) =>
              set({ ...v, followUpOption, followUps: followUpOption === "VISION_ONLY" ? [] : followUps })
            }
          />
        </div>
      )}
    />
  );
}
