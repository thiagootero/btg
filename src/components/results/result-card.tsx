"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Pencil, RefreshCw, Save, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { FormAlert } from "@/components/form/form-alert";
import { TextAreaField, TextField } from "@/components/form/field";
import {
  achievedSummary,
  INDICATOR_KIND_HINTS,
  INDICATOR_KIND_LABELS,
  percentageErrors,
  RESULT_INDICATOR_KINDS,
  type ResultIndicatorKind,
} from "@/lib/results/indicator";
import type { ResultSourceType } from "@/lib/results/items";
import type { IndicatorData, ResultData } from "@/lib/results/schemas";
import { dataChanged, type OutcomeResultStatus } from "@/lib/results/status";
import type { IndicatorCardView, ResultCardView } from "@/lib/results/view";

export type CardRequest =
  | { kind: "save"; data: ResultData }
  | { kind: "organize"; data: ResultData }
  | { kind: "approve"; text: string }
  | { kind: "discard" };

const STATUS_BADGE: Record<OutcomeResultStatus, { label: string; className: string }> = {
  DRAFT: {
    label: "Rascunho",
    className: "border-border bg-muted text-muted-foreground",
  },
  AI_PROPOSED: {
    label: "Proposta da IA para revisão",
    className: "border-warning/30 bg-warning-soft text-warning",
  },
  APPROVED: {
    label: "Texto aprovado",
    className: "border-success/30 bg-success-soft text-success",
  },
};

const ITEM_REFERENCE_LABEL: Record<ResultSourceType, string> = {
  ACTIVITY: "Atividade prevista",
  OUTCOME: "Resultado esperado",
  IMPACT: "Mudança de longo prazo",
};

/** Campos de um indicador como digitados (texto livre até a validação). */
interface IndicatorFormState {
  id: string;
  kind: ResultIndicatorKind;
  denominator: string;
  numerator: string;
  achievedValue: string;
  unit: string;
  achievedText: string;
}

interface FormState {
  indicators: IndicatorFormState[];
  teamPerception: string;
  additionalContext: string;
}

function toForm(card: ResultCardView): FormState {
  return {
    indicators: card.data.indicators.map((d, i) => ({
      id: d.id,
      kind: d.kind ?? card.indicators[i].form.kind,
      denominator: d.denominator?.toString() ?? "",
      numerator: d.numerator?.toString() ?? "",
      achievedValue: d.achievedValue === null ? "" : String(d.achievedValue).replace(".", ","),
      unit: d.unit ?? card.indicators[i].form.unit,
      achievedText: d.achievedText ?? "",
    })),
    teamPerception: card.data.teamPerception ?? "",
    additionalContext: card.data.additionalContext ?? "",
  };
}

/** "" → null; inteiro → número; qualquer outra coisa → NaN (erro exibido). */
function parseInteger(value: string): number | null {
  const v = value.trim();
  if (!v) return null;
  return /^\d+$/.test(v) ? Number(v) : Number.NaN;
}

/** Aceita "12,5", "1.200,5" e "12.5". */
function parseDecimal(value: string): number | null {
  const v = value.trim().replace(/\s/g, "");
  if (!v) return null;
  const normalized = v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
  return /^\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : Number.NaN;
}

const text = (s: string) => s.trim() || null;

function toIndicatorData(f: IndicatorFormState): IndicatorData {
  const k = f.kind;
  return {
    id: f.id,
    kind: k,
    denominator: k === "PERCENTAGE" ? parseInteger(f.denominator) : null,
    numerator: k === "PERCENTAGE" ? parseInteger(f.numerator) : null,
    achievedValue: k === "COUNT" ? parseDecimal(f.achievedValue) : null,
    unit: k === "TEXT" ? null : text(f.unit),
    achievedText: k === "TEXT" ? text(f.achievedText) : null,
  };
}

function toData(form: FormState): ResultData {
  return {
    indicators: form.indicators.map(toIndicatorData),
    teamPerception: text(form.teamPerception),
    additionalContext: text(form.additionalContext),
  };
}

function indicatorErrors(data: IndicatorData): Record<string, string> {
  const errors: Record<string, string> = {};
  if (Number.isNaN(data.denominator)) errors.denominator = "Use um número inteiro.";
  if (Number.isNaN(data.numerator)) errors.numerator = "Use um número inteiro.";
  if (Number.isNaN(data.achievedValue)) errors.achievedValue = "Informe um número (ex.: 120 ou 12,5).";
  if (data.kind === "PERCENTAGE" && !errors.denominator && !errors.numerator) {
    Object.assign(errors, percentageErrors(data.numerator, data.denominator));
  }
  return errors;
}

function Reference({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm leading-relaxed">{value}</dd>
    </div>
  );
}

export function ResultCard({
  card,
  canEdit,
  busy,
  onRequest,
  onDirtyChange,
}: {
  card: ResultCardView;
  canEdit: boolean;
  /** Ação em andamento neste card (ou null). */
  busy: CardRequest["kind"] | null;
  onRequest: (request: CardRequest) => Promise<Record<string, string[]> | null>;
  /** Avisa quando há dados digitados e ainda não salvos. */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [form, setForm] = useState<FormState>(() => toForm(card));
  const [draftText, setDraftText] = useState(card.proposedText ?? card.approvedText ?? "");
  const [writing, setWriting] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string[]>>({});

  const data = toData(form);
  const errors = data.indicators.map(indicatorErrors);
  const hasErrors = errors.some((e) => Object.keys(e).length > 0);
  const dirty = dataChanged(card.data, data);
  const ref = card.reference;
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));
  const setIndicator = (index: number, patch: Partial<IndicatorFormState>) =>
    setForm((f) => ({ ...f, indicators: f.indicators.map((x, i) => (i === index ? { ...x, ...patch } : x)) }));
  const questions = card.form;
  const isBusy = busy !== null;

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  async function submit(kind: "save" | "organize") {
    if (hasErrors) return;
    const result = await onRequest({ kind, data });
    setServerErrors(result ?? {});
  }

  async function approve() {
    const result = await onRequest({ kind: "approve", text: draftText });
    setServerErrors(result ?? {});
    if (!result) setWriting(false);
  }

  const badge = STATUS_BADGE[card.status];
  const editingText = card.status === "AI_PROPOSED" || writing;

  return (
    <div>
      <Badge variant="outline" className={badge.className}>
        {badge.label}
      </Badge>

      {(card.journeyChanged || card.itemRemoved) && (
        <p className="mt-3 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          {card.itemRemoved
            ? "Este item foi retirado da Jornada depois do início da avaliação."
            : "A Jornada foi alterada depois do início da avaliação."}{" "}
          Abaixo está a versão aprovada no momento da avaliação.
        </p>
      )}

      {/* Referência aprovada na Jornada (somente consulta). O item ocupa a 1ª linha e os demais vão em pares;
          o último, se ficar sozinho, ocupa a linha inteira. */}
      <dl className="mt-4 grid gap-4 rounded-lg bg-muted/50 p-4 sm:grid-cols-2 sm:[&>:last-child:nth-child(even)]:col-span-2">
        <div className="sm:col-span-2">
          <Reference label={ITEM_REFERENCE_LABEL[card.sourceType]} value={ref.item} />
        </div>
        <Reference label="Meta prevista" value={ref.target ?? "Não registrada na Jornada"} />
        {ref.period && <Reference label="Período de acompanhamento" value={ref.period} />}
        {ref.baseline && <Reference label="Linha de base" value={ref.baseline} />}
        {ref.verification && <Reference label="Meio de verificação (consulta)" value={ref.verification} />}
      </dl>

      {canEdit ? (
        <div className="mt-6 space-y-5">
          <p className="text-sm leading-relaxed text-muted-foreground">{questions.intro}</p>
          {form.indicators.map((indicator, index) => (
            <IndicatorFields
              key={indicator.id}
              index={index}
              total={form.indicators.length}
              view={card.indicators[index]}
              value={indicator}
              suggested={card.data.indicators[index].kind === null}
              errors={errors[index]}
              serverErrors={serverErrors}
              onChange={(patch) => setIndicator(index, patch)}
            />
          ))}

          <TextAreaField
            label="O que esse resultado mostra na prática?"
            hint={questions.perceptionHint}
            rows={4}
            value={form.teamPerception}
            onChange={(teamPerception) => set({ teamPerception })}
            error={serverErrors.teamPerception}
          />
          <TextAreaField
            label="Há algum contexto que ajuda a compreender este resultado? (opcional)"
            hint={questions.contextHint}
            value={form.additionalContext}
            onChange={(additionalContext) => set({ additionalContext })}
            error={serverErrors.additionalContext}
          />

          {dirty && card.status !== "DRAFT" && (
            <FormAlert tone="info">
              Ao salvar dados diferentes, o texto técnico atual deixa de valer e precisará ser organizado e aprovado de
              novo.
            </FormAlert>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => submit("save")} disabled={isBusy}>
              {busy === "save" ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} Salvar
              rascunho
            </Button>
            <Button onClick={() => submit("organize")} disabled={isBusy}>
              {busy === "organize" ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}{" "}
              {card.proposedText || card.approvedText ? "Gerar nova versão com a IA" : "Organizar resultado com a IA"}
            </Button>
          </div>

          {/* Texto técnico: proposta da IA ou texto aprovado */}
          {editingText ? (
            <section
              className="space-y-3 rounded-lg border border-warning/30 bg-warning-soft/40 p-4"
              aria-label="Texto técnico"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold">
                  {card.status === "AI_PROPOSED" ? "Proposta de texto técnico (não aprovada)" : "Texto técnico"}
                </h4>
                {card.status === "AI_PROPOSED" && card.proposalIsMock && (
                  <Badge variant="outline">Texto simulado (modo de teste)</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Revise e edite à vontade. O texto só passa a valer quando for aprovado e nunca é publicado
                automaticamente.
              </p>
              <Textarea
                value={draftText}
                rows={6}
                onChange={(e) => setDraftText(e.target.value)}
                aria-label="Texto técnico do resultado"
              />
              {serverErrors.text && <p className="text-sm text-destructive">{serverErrors.text[0]}</p>}
              {dirty && <p className="text-xs text-warning">Salve os dados alterados antes de aprovar o texto.</p>}
              <div className="flex flex-wrap gap-2">
                <Button onClick={approve} disabled={isBusy || dirty || !draftText.trim()}>
                  {busy === "approve" ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}{" "}
                  Aprovar texto
                </Button>
                {card.status === "AI_PROPOSED" ? (
                  <Button variant="ghost" onClick={() => onRequest({ kind: "discard" })} disabled={isBusy}>
                    <Trash2 aria-hidden /> Descartar proposta
                  </Button>
                ) : (
                  <Button variant="ghost" onClick={() => setWriting(false)} disabled={isBusy}>
                    Cancelar
                  </Button>
                )}
              </div>
            </section>
          ) : card.status === "APPROVED" && card.approvedText ? (
            <section
              className="space-y-3 rounded-lg border border-success/30 bg-success-soft/40 p-4"
              aria-label="Texto técnico aprovado"
            >
              <h4 className="text-sm font-semibold">Texto técnico aprovado</h4>
              <p className="whitespace-pre-line text-sm leading-relaxed">{card.approvedText}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDraftText(card.approvedText ?? "");
                    setWriting(true);
                  }}
                  disabled={isBusy}
                >
                  <Pencil aria-hidden /> Editar texto
                </Button>
                <Button variant="ghost" size="sm" onClick={() => submit("organize")} disabled={isBusy}>
                  <RefreshCw aria-hidden /> Gerar nova versão
                </Button>
              </div>
            </section>
          ) : (
            card.complete &&
            !dirty && (
              <button
                type="button"
                className="text-sm text-primary underline-offset-4 hover:underline"
                onClick={() => {
                  setDraftText("");
                  setWriting(true);
                }}
              >
                Prefiro escrever o texto técnico sem a IA
              </button>
            )
          )}
        </div>
      ) : (
        <ReadOnlyResult card={card} />
      )}
    </div>
  );
}

function IndicatorFields({
  index,
  total,
  view,
  value,
  suggested,
  errors,
  serverErrors,
  onChange,
}: {
  index: number;
  total: number;
  view: IndicatorCardView;
  value: IndicatorFormState;
  /** O tipo ainda não foi escolhido: marca a sugestão. */
  suggested: boolean;
  errors: Record<string, string>;
  serverErrors: Record<string, string[]>;
  onChange: (patch: Partial<IndicatorFormState>) => void;
}) {
  const q = view.form;
  const serverError = (field: string) => serverErrors[`indicators.${index}.${field}`];
  const fieldError = (field: string) => errors[field] ?? serverError(field);
  const data = toIndicatorData(value);
  const preview = Object.keys(errors).length === 0 ? achievedSummary(data) : null;

  return (
    <fieldset className="space-y-3 rounded-lg border p-4">
      <legend className="px-1 text-sm font-semibold">
        {total > 1 && (
          <span className="mr-1 font-normal text-muted-foreground">
            Indicador {index + 1} de {total}:
          </span>
        )}
        {view.name}
      </legend>
      <RadioGroup
        value={value.kind}
        onValueChange={(v) => onChange({ kind: v as ResultIndicatorKind })}
        className="grid gap-2 sm:grid-cols-3"
        aria-label={`Tipo de dado: ${view.name}`}
      >
        {RESULT_INDICATOR_KINDS.map((k) => (
          <Label
            key={k}
            className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-normal has-[[data-state=checked]]:border-primary"
          >
            <RadioGroupItem value={k} />
            <span>
              {INDICATOR_KIND_LABELS[k]}
              {suggested && k === q.kind && <span className="ml-1 text-xs text-muted-foreground">(sugerido)</span>}
            </span>
          </Label>
        ))}
      </RadioGroup>
      <p className="text-xs text-muted-foreground">{INDICATOR_KIND_HINTS[value.kind]}</p>

      {value.kind === "PERCENTAGE" && (
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label="Quem foi avaliado?"
            hint="Ex.: famílias, pessoas, jovens."
            value={value.unit}
            onChange={(unit) => onChange({ unit })}
            error={serverError("unit")}
          />
          <TextField
            label={q.denominatorQuestion}
            inputMode="numeric"
            value={value.denominator}
            onChange={(denominator) => onChange({ denominator })}
            error={fieldError("denominator")}
          />
          <TextField
            label={q.numeratorQuestion}
            inputMode="numeric"
            value={value.numerator}
            onChange={(numerator) => onChange({ numerator })}
            error={fieldError("numerator")}
          />
        </div>
      )}
      {value.kind === "COUNT" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={q.valueQuestion}
            inputMode="decimal"
            value={value.achievedValue}
            onChange={(achievedValue) => onChange({ achievedValue })}
            error={fieldError("achievedValue")}
          />
          <TextField
            label="Unidade"
            hint="Famílias, pessoas, oficinas, horas etc."
            value={value.unit}
            onChange={(unit) => onChange({ unit })}
            error={serverError("unit")}
          />
        </div>
      )}
      {value.kind === "TEXT" && (
        <TextAreaField
          label={q.textQuestion}
          value={value.achievedText}
          onChange={(achievedText) => onChange({ achievedText })}
          error={serverError("achievedText")}
        />
      )}
      {value.kind === "PERCENTAGE" && preview && (
        <p className="rounded-md bg-secondary px-3 py-2 text-sm" role="status">
          <span className="font-semibold">Resultado calculado:</span> {preview}.
        </p>
      )}
      {serverError("result") && <p className="text-sm text-destructive">{serverError("result")![0]}</p>}
    </fieldset>
  );
}

function ReadOnlyResult({ card }: { card: ResultCardView }) {
  return (
    <div className="mt-5 space-y-3 text-sm">
      {card.indicators.map((i) => (
        <Reference key={i.id} label={i.name} value={i.achievedSummary ?? "Ainda não registrado"} />
      ))}
      {card.data.teamPerception && (
        <Reference label="O que esse resultado mostra na prática?" value={card.data.teamPerception} />
      )}
      {card.data.additionalContext && <Reference label="Contexto" value={card.data.additionalContext} />}
      <Reference
        label="Texto técnico"
        value={card.status === "APPROVED" && card.approvedText ? card.approvedText : "Ainda não aprovado"}
      />
    </div>
  );
}
