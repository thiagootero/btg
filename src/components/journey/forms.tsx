"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Field, TextAreaField, TextField } from "@/components/form/field";
import { stripTrailingPeriod, twoDigits } from "@/lib/journey/format";
import type {
  ActivityPayload,
  EvidencePlanPayload,
  ImpactFollowUpInput,
  ImpactOption,
  ActivityListPayload,
  OutcomeDetailPayload,
  OutcomeIndicatorPayload,
  OutcomeStatementsPayload,
  OutcomeTargetPayload,
} from "@/lib/journey/proposal-schemas";
import { MAX_OUTCOMES } from "@/lib/journey/rules";
import type { ActivityView, IndicatorView } from "@/lib/journey/types";
import { IMPACT_OPTION_LABELS } from "@/lib/journey/proposal-schemas";

export type Errors = Record<string, string[]>;

const TO_DEFINE_HINT = "Deixe em branco para registrar como “a definir”.";

// ---------------------------------------------------------------------------
// Listas
// ---------------------------------------------------------------------------

export function IndicatorsEditor({
  value,
  onChange,
  errors,
  prefix,
  max,
  label = "Indicadores",
}: {
  value: IndicatorView[];
  onChange: (value: IndicatorView[]) => void;
  errors: Errors;
  prefix: string;
  max: number;
  label?: string;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">{label}</legend>
      {errors[prefix] && <p className="text-sm text-destructive">{errors[prefix][0]}</p>}
      {value.map((indicator, i) => (
        <div key={i} className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <div className="flex items-start gap-2">
            <TextField
              className="flex-1"
              label={`Indicador ${i + 1}`}
              required
              value={indicator.name}
              onChange={(name) => onChange(value.map((x, j) => (j === i ? { ...x, name } : x)))}
              error={errors[`${prefix}.${i}.name`]}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              className="mt-6"
              aria-label={`Excluir indicador ${i + 1}`}
              disabled={value.length <= 1}
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
          <TextField
            label="O que ele observa (opcional)"
            value={indicator.explanation ?? ""}
            onChange={(explanation) => onChange(value.map((x, j) => (j === i ? { ...x, explanation } : x)))}
            error={errors[`${prefix}.${i}.explanation`]}
          />
        </div>
      ))}
      {value.length < max && (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, { name: "", explanation: null }])}>
          <Plus aria-hidden /> Acrescentar indicador
        </Button>
      )}
    </fieldset>
  );
}

export function TextListEditor({
  value,
  onChange,
  errors,
  prefix,
  label,
  itemLabel,
  max,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  errors: Errors;
  prefix: string;
  label: string;
  itemLabel: string;
  max: number;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">{label}</legend>
      {errors[prefix] && <p className="text-sm text-destructive">{errors[prefix][0]}</p>}
      {value.map((item, i) => (
        <div key={i} className="flex items-end gap-2">
          <TextField
            className="flex-1"
            label={`${itemLabel} ${i + 1}`}
            required
            value={item}
            onChange={(v) => onChange(value.map((x, j) => (j === i ? v : x)))}
            error={errors[`${prefix}.${i}.description`] ?? errors[`${prefix}.${i}`]}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            aria-label={`Excluir ${itemLabel.toLowerCase()} ${i + 1}`}
            disabled={value.length <= 1}
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      ))}
      {value.length < max && (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, ""])}>
          <Plus aria-hidden /> Acrescentar
        </Button>
      )}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Atividade
// ---------------------------------------------------------------------------

export function ActivityForm({
  value,
  onChange,
  errors,
}: {
  value: ActivityPayload;
  onChange: (value: ActivityPayload) => void;
  errors: Errors;
}) {
  const setTarget = (patch: Partial<ActivityPayload["target"]>) => onChange({ ...value, target: { ...value.target, ...patch } });
  return (
    <div className="space-y-5">
      <TextAreaField
        label="Atividade"
        required
        hint="Ação concreta que a equipe realizará."
        value={value.description}
        onChange={(description) => onChange({ ...value, description })}
        error={errors.description}
      />
      <TextAreaField
        label="Meta"
        required
        hint="Quantidade, público e prazo. O que não estiver definido pode ficar como “a definir”."
        value={value.target.description}
        onChange={(description) => setTarget({ description })}
        error={errors["target.description"]}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Duração em meses"
          type="number"
          inputMode="numeric"
          hint="Não pode ultrapassar a duração do projeto. Em branco: a definir."
          value={value.target.durationMonths === null || value.target.durationMonths === undefined ? "" : String(value.target.durationMonths)}
          onChange={(d) => setTarget({ durationMonths: d === "" ? null : Number(d) })}
          error={errors["target.durationMonths"]}
        />
        <TextField
          label="Prazo"
          hint={TO_DEFINE_HINT}
          value={value.target.deadline ?? ""}
          onChange={(deadline) => setTarget({ deadline })}
          error={errors["target.deadline"]}
        />
        <TextField
          label="Quantidade (opcional)"
          type="number"
          inputMode="decimal"
          value={value.target.quantity === null || value.target.quantity === undefined ? "" : String(value.target.quantity)}
          onChange={(q) => setTarget({ quantity: q === "" ? null : Number(q) })}
          error={errors["target.quantity"]}
        />
        <TextField
          label="Unidade (opcional)"
          value={value.target.unit ?? ""}
          onChange={(unit) => setTarget({ unit })}
          error={errors["target.unit"]}
        />
      </div>
      <IndicatorsEditor
        value={value.indicators}
        onChange={(indicators) => onChange({ ...value, indicators })}
        errors={errors}
        prefix="indicators"
        max={5}
      />
      <TextListEditor
        label="Meio de verificação"
        itemLabel="Meio de verificação"
        value={value.evidences.map((e) => e.description)}
        onChange={(list) => onChange({ ...value, evidences: list.map((description) => ({ description })) })}
        errors={errors}
        prefix="evidences"
        max={5}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mudanças esperadas
// ---------------------------------------------------------------------------

export function ActivityChecklist({
  activities,
  selected,
  onChange,
  error,
  legend = "Atividades relacionadas",
}: {
  activities: ActivityView[];
  selected: string[];
  onChange: (ids: string[]) => void;
  error?: string[];
  legend?: string;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{legend}</legend>
      {error && <p className="text-sm text-destructive">{error[0]}</p>}
      {activities.map((a, i) => {
        const id = `act-${a.id}-${legend.length}`;
        return (
          <div key={a.id} className="flex items-start gap-2">
            <Checkbox
              id={id}
              checked={selected.includes(a.id)}
              onCheckedChange={(checked) =>
                onChange(checked ? [...selected, a.id] : selected.filter((x) => x !== a.id))
              }
              className="mt-0.5"
            />
            <Label htmlFor={id} className="text-sm font-normal leading-snug">
              Atividade {twoDigits(i + 1)} — {stripTrailingPeriod(a.description)}
            </Label>
          </div>
        );
      })}
    </fieldset>
  );
}

export function ActivityListForm({
  value,
  onChange,
  errors,
  existingCount,
}: {
  value: ActivityListPayload;
  onChange: (value: ActivityListPayload) => void;
  errors: Errors;
  existingCount: number;
}) {
  const update = (i: number, description: string) =>
    onChange({ ...value, activities: value.activities.map((a, j) => (j === i ? { description } : a)) });
  return (
    <div className="space-y-4">
      {errors.activities && <p className="text-sm text-destructive">{errors.activities[0]}</p>}
      {value.activities.map((a, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="flex-1">
            <TextField
              label={`Atividade ${twoDigits(existingCount + i + 1)}`}
              required
              hint={i === 0 ? "Ação concreta da equipe, começando por verbo no infinitivo." : undefined}
              value={a.description}
              onChange={(description) => update(i, description)}
              error={errors[`activities.${i}.description`]}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="mt-7"
            disabled={value.activities.length <= 1}
            onClick={() => onChange({ ...value, activities: value.activities.filter((_, j) => j !== i) })}
            aria-label={`Excluir atividade ${twoDigits(existingCount + i + 1)}`}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange({ ...value, activities: [...value.activities, { description: "" }] })}
      >
        <Plus aria-hidden /> Acrescentar atividade
      </Button>
    </div>
  );
}

export function OutcomeStatementsForm({
  value,
  onChange,
  errors,
  activities,
  existingCount,
}: {
  value: OutcomeStatementsPayload;
  onChange: (value: OutcomeStatementsPayload) => void;
  errors: Errors;
  activities: ActivityView[];
  existingCount: number;
}) {
  const update = (i: number, patch: Partial<OutcomeStatementsPayload["outcomes"][number]>) =>
    onChange({ ...value, outcomes: value.outcomes.map((o, j) => (j === i ? { ...o, ...patch } : o)) });
  const atLimit = existingCount + value.outcomes.length >= MAX_OUTCOMES && !value.explicitRequestForMore;
  return (
    <div className="space-y-5">
      {errors.outcomes && <p className="text-sm text-destructive">{errors.outcomes[0]}</p>}
      {value.outcomes.map((o, i) => (
        <div key={i} className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Resultado {twoDigits(existingCount + i + 1)}</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={value.outcomes.length <= 1}
              onClick={() => onChange({ ...value, outcomes: value.outcomes.filter((_, j) => j !== i) })}
            >
              <Trash2 aria-hidden /> Excluir
            </Button>
          </div>
          <TextAreaField
            label="Mudança esperada"
            required
            hint="Público + verbo concreto + mudança observável (ex.: passem a utilizar, ampliem, passem a acessar)."
            value={o.statement}
            onChange={(statement) => update(i, { statement })}
            error={errors[`outcomes.${i}.statement`]}
          />
          <ActivityChecklist
            activities={activities}
            selected={o.relatedActivityIds}
            onChange={(relatedActivityIds) => update(i, { relatedActivityIds })}
            error={errors[`outcomes.${i}.relatedActivityIds`]}
          />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={atLimit}
          onClick={() =>
            onChange({ ...value, outcomes: [...value.outcomes, { statement: "", relatedActivityIds: [] }] })
          }
        >
          <Plus aria-hidden /> Acrescentar mudança
        </Button>
        <div className="flex items-center gap-2">
          <Checkbox
            id="explicit-more"
            checked={value.explicitRequestForMore}
            onCheckedChange={(checked) => onChange({ ...value, explicitRequestForMore: Boolean(checked) })}
          />
          <Label htmlFor="explicit-more" className="text-xs font-normal text-muted-foreground">
            Solicitamos expressamente mais de {MAX_OUTCOMES} mudanças
          </Label>
        </div>
      </div>
    </div>
  );
}

export function OutcomeTargetForm({
  value,
  onChange,
  errors,
}: {
  value: OutcomeTargetPayload;
  onChange: (value: OutcomeTargetPayload) => void;
  errors: Errors;
}) {
  return (
    <div className="space-y-5">
      <TextAreaField
        label="Meta"
        required
        hint="Quanto do público deve alcançar a mudança até o final do projeto."
        value={value.target}
        onChange={(target) => onChange({ ...value, target })}
        error={errors.target}
      />
    </div>
  );
}

export function OutcomeIndicatorForm({
  value,
  onChange,
  errors,
}: {
  value: OutcomeIndicatorPayload;
  onChange: (value: OutcomeIndicatorPayload) => void;
  errors: Errors;
}) {
  return (
    <div className="space-y-5">
      <IndicatorsEditor
        label="Indicador"
        value={value.indicators}
        onChange={(indicators) => onChange({ ...value, indicators })}
        errors={errors}
        prefix="indicators"
        max={3}
      />
      <TextField
        label="Meio de verificação"
        required
        hint="Forma breve e institucional (ex.: Relatório de evolução das famílias)."
        value={value.verification}
        onChange={(verification) => onChange({ ...value, verification })}
        error={errors.verification}
      />
    </div>
  );
}

export function OutcomeDetailForm({
  value,
  onChange,
  errors,
}: {
  value: OutcomeDetailPayload;
  onChange: (value: OutcomeDetailPayload) => void;
  errors: Errors;
}) {
  return (
    <div className="space-y-5">
      <TextAreaField
        label="Meta"
        required
        hint="Quanto do público deve alcançar a mudança até o final do projeto."
        value={value.target}
        onChange={(target) => onChange({ ...value, target })}
        error={errors.target}
      />
      <IndicatorsEditor
        label="Indicador"
        value={value.indicators}
        onChange={(indicators) => onChange({ ...value, indicators })}
        errors={errors}
        prefix="indicators"
        max={3}
      />
      <TextField
        label="Meio de verificação"
        required
        hint="Forma breve e institucional (ex.: Relatório de evolução das famílias)."
        value={value.verification}
        onChange={(verification) => onChange({ ...value, verification })}
        error={errors.verification}
      />
    </div>
  );
}

export interface OutcomeFullValue {
  statement: string;
  relatedActivityIds: string[];
  target: string | null;
  indicators: IndicatorView[];
  verification: string | null;
}

export function OutcomeFullForm({
  value,
  onChange,
  errors,
  activities,
}: {
  value: OutcomeFullValue;
  onChange: (value: OutcomeFullValue) => void;
  errors: Errors;
  activities: ActivityView[];
}) {
  return (
    <div className="space-y-5">
      <TextAreaField
        label="Resultado"
        required
        value={value.statement}
        onChange={(statement) => onChange({ ...value, statement })}
        error={errors.statement}
      />
      <ActivityChecklist
        activities={activities}
        selected={value.relatedActivityIds}
        onChange={(relatedActivityIds) => onChange({ ...value, relatedActivityIds })}
        error={errors.relatedActivityIds}
      />
      <TextAreaField label="Meta" hint={TO_DEFINE_HINT} value={value.target ?? ""} onChange={(target) => onChange({ ...value, target })} error={errors.target} />
      <IndicatorsEditor
        label="Indicador"
        value={value.indicators}
        onChange={(indicators) => onChange({ ...value, indicators })}
        errors={errors}
        prefix="indicators"
        max={3}
      />
      <TextField
        label="Meio de verificação"
        value={value.verification ?? ""}
        onChange={(verification) => onChange({ ...value, verification })}
        error={errors.verification}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Impacto
// ---------------------------------------------------------------------------

export function ImpactStatementForm({
  value,
  onChange,
  errors,
}: {
  value: string;
  onChange: (value: string) => void;
  errors: Errors;
}) {
  return (
    <TextAreaField
      label="Impacto de longo prazo"
      required
      rows={4}
      hint="Formule como contribuição do projeto para uma transformação maior, sem prometer resolver sozinho o problema."
      value={value}
      onChange={onChange}
      error={errors.statement}
    />
  );
}

const emptyFollowUp: ImpactFollowUpInput = {
  description: "",
  target: null,
  indicator: null,
  verification: null,
  periodAfterEnd: null,
  notes: null,
};

export function ImpactFollowUpForm({
  option,
  followUps,
  onChange,
  errors,
  allowNoOption = false,
}: {
  option: ImpactOption | null;
  followUps: ImpactFollowUpInput[];
  onChange: (option: ImpactOption | null, followUps: ImpactFollowUpInput[]) => void;
  errors: Errors;
  allowNoOption?: boolean;
}) {
  const update = (i: number, patch: Partial<ImpactFollowUpInput>) =>
    onChange(option, followUps.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  return (
    <div className="space-y-5">
      <Field label="Acompanhamento após o projeto" required={!allowNoOption} error={errors.option ?? errors.followUpOption}>
        {({ id, describedBy, invalid }) => (
          <select
            id={id}
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            value={option ?? ""}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            onChange={(e) => {
              const next = (e.target.value || null) as ImpactOption | null;
              onChange(next, next && next !== "VISION_ONLY" && followUps.length === 0 ? [emptyFollowUp] : followUps);
            }}
          >
            {allowNoOption && <option value="">Ainda não definido</option>}
            {(Object.keys(IMPACT_OPTION_LABELS) as ImpactOption[]).map((key) => (
              <option key={key} value={key}>
                {IMPACT_OPTION_LABELS[key]}
              </option>
            ))}
          </select>
        )}
      </Field>
      {option && option !== "VISION_ONLY" && (
        <div className="space-y-4">
          {errors.followUps && <p className="text-sm text-destructive">{errors.followUps[0]}</p>}
          {followUps.map((f, i) => (
            <div key={i} className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">
                  {option === "FUTURE_EVALUATION" ? "Avaliação" : "Mudança acompanhada"} {i + 1}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={followUps.length <= 1}
                  onClick={() => onChange(option, followUps.filter((_, j) => j !== i))}
                >
                  <Trash2 aria-hidden /> Excluir
                </Button>
              </div>
              <TextAreaField
                label={option === "FUTURE_EVALUATION" ? "O que será avaliado" : "Mudança acompanhada"}
                required
                value={f.description}
                onChange={(description) => update(i, { description })}
                error={errors[`followUps.${i}.description`]}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Meta" hint={TO_DEFINE_HINT} value={f.target ?? ""} onChange={(target) => update(i, { target })} error={errors[`followUps.${i}.target`]} />
                <TextField label="Indicador" hint={TO_DEFINE_HINT} value={f.indicator ?? ""} onChange={(indicator) => update(i, { indicator })} error={errors[`followUps.${i}.indicator`]} />
                <TextField label="Meio de verificação" hint={TO_DEFINE_HINT} value={f.verification ?? ""} onChange={(verification) => update(i, { verification })} error={errors[`followUps.${i}.verification`]} />
                <TextField label="Período após o fim do projeto" hint="Ex.: 12 meses após o encerramento." value={f.periodAfterEnd ?? ""} onChange={(periodAfterEnd) => update(i, { periodAfterEnd })} error={errors[`followUps.${i}.periodAfterEnd`]} />
              </div>
              <TextAreaField label="Observações" value={f.notes ?? ""} onChange={(notes) => update(i, { notes })} error={errors[`followUps.${i}.notes`]} />
            </div>
          ))}
          {followUps.length < 5 && (
            <Button type="button" variant="outline" size="sm" onClick={() => onChange(option, [...followUps, emptyFollowUp])}>
              <Plus aria-hidden /> Acrescentar
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plano de evidências (revisão da proposta)
// ---------------------------------------------------------------------------

export function EvidencePlanForm({
  value,
  onChange,
  errors,
}: {
  value: EvidencePlanPayload;
  onChange: (value: EvidencePlanPayload) => void;
  errors: Errors;
}) {
  const update = (i: number, patch: Partial<EvidencePlanPayload["items"][number]>) =>
    onChange({ items: value.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Meta, indicador e verificação vêm das etapas aprovadas e não são editados aqui. Ajuste quando coletar,
        quem registrará, o instrumento e as pendências.
      </p>
      {errors.items && <p className="text-sm text-destructive">{errors.items[0]}</p>}
      {value.items.map((item, i) => (
        <div key={`${item.sourceType}:${item.sourceId}`} className="space-y-3 rounded-lg border p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold">{item.sourceLabel}</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={value.items.length <= 1}
              onClick={() => onChange({ items: value.items.filter((_, j) => j !== i) })}
            >
              <Trash2 aria-hidden /> Remover
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SmallInput label="Quando coletar" value={item.collectionTiming} onChange={(collectionTiming) => update(i, { collectionTiming })} />
            <SmallInput label="Quem registrará" value={item.responsible} onChange={(responsible) => update(i, { responsible })} />
            <SmallInput label="Instrumento necessário" value={item.instrument} onChange={(instrument) => update(i, { instrument })} />
            <SmallInput label="Pendências" value={item.pending} onChange={(pending) => update(i, { pending })} />
          </div>
        </div>
      ))}
    </div>
  );
}

function SmallInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (value: string | null) => void;
}) {
  return (
    <Field label={label} hint={!value ? "a definir" : undefined}>
      {({ id, describedBy }) => (
        <Input id={id} value={value ?? ""} aria-describedby={describedBy} onChange={(e) => onChange(e.target.value || null)} />
      )}
    </Field>
  );
}
