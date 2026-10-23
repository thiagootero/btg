"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { saveProjectAction } from "@/app/(app)/projetos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field, TextAreaField, TextField } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { ConfirmDialog } from "@/components/form/confirm-dialog";
import { AREA_LABELS, BRAZILIAN_STATES, PROJECT_AREAS } from "@/lib/journey/areas";
import { projectInputSchema } from "@/lib/validation/project";
import { zodFieldErrors } from "@/lib/validation/zod-errors";
import { cn } from "@/lib/utils";

export interface ProjectFormValues {
  organizationId: string;
  name: string;
  area: string;
  areaOther: string;
  territories: { city: string; state: string }[];
  targetAudience: string;
  durationMonths: string;
  problem: string;
}

export const emptyProjectValues: ProjectFormValues = {
  organizationId: "",
  name: "",
  area: "",
  areaOther: "",
  territories: [{ city: "", state: "" }],
  targetAudience: "",
  durationMonths: "",
  problem: "",
};

const selectClass =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";

function Example({ children }: { children: React.ReactNode }) {
  return (
    <details className="group text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none rounded text-primary underline-offset-4 hover:underline">
        Ver um exemplo
      </summary>
      <p className="mt-1.5 rounded-md bg-muted/70 px-3 py-2 leading-relaxed">{children}</p>
    </details>
  );
}

export function ProjectForm({
  initial = emptyProjectValues,
  organizations,
  projectId,
  contextApproved = false,
}: {
  initial?: ProjectFormValues;
  organizations: { id: string; name: string }[];
  projectId?: string;
  contextApproved?: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState<ProjectFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof ProjectFormValues>(key: K, value: ProjectFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  function toInput() {
    return {
      organizationId: values.organizationId || (organizations.length === 1 ? organizations[0].id : undefined),
      name: values.name,
      area: values.area || undefined,
      areaOther: values.areaOther || null,
      territories: values.territories,
      targetAudience: values.targetAudience,
      durationMonths: values.durationMonths,
      problem: values.problem,
    };
  }

  function validate(): boolean {
    const parsed = projectInputSchema.safeParse(toInput());
    const fieldErrors = parsed.success ? {} : zodFieldErrors(parsed.error);
    if (organizations.length > 1 && !values.organizationId) {
      fieldErrors.organizationId = ["Selecione a organização."];
    }
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) {
      setFormError("Revise os campos destacados.");
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
      return false;
    }
    setFormError(null);
    return true;
  }

  function save(confirmReplace: boolean) {
    startTransition(async () => {
      const result = await saveProjectAction(toInput(), projectId, confirmReplace);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.message);
        return;
      }
      router.push(`/projetos/${result.id}/jornada`);
      router.refresh();
    });
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    if (projectId && contextApproved) setConfirmOpen(true);
    else save(false);
  }

  const err = (key: string) => errors[key];

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-8">
      {formError && <FormAlert>{formError}</FormAlert>}

      <section className="space-y-5 rounded-xl border bg-card p-5 sm:p-6" aria-labelledby="sec-identificacao">
        <h2 id="sec-identificacao" className="text-base font-semibold">
          Dados do projeto
        </h2>
        {organizations.length > 1 && !projectId && (
          <Field label="Organização" required error={err("organizationId")}>
            {({ id, describedBy, invalid }) => (
              <select
                id={id}
                className={selectClass}
                value={values.organizationId}
                onChange={(e) => set("organizationId", e.target.value)}
                aria-describedby={describedBy}
                aria-invalid={invalid}
              >
                <option value="">Selecione…</option>
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        <TextField
          label="Nome do projeto"
          required
          value={values.name}
          onChange={(v) => set("name", v)}
          error={err("name")}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Área do projeto" required error={err("area")}>
            {({ id, describedBy, invalid }) => (
              <select
                id={id}
                className={selectClass}
                value={values.area}
                onChange={(e) => set("area", e.target.value)}
                aria-describedby={describedBy}
                aria-invalid={invalid}
              >
                <option value="">Selecione…</option>
                {PROJECT_AREAS.map((a) => (
                  <option key={a} value={a}>
                    {AREA_LABELS[a]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <TextField
            label="Duração (em meses)"
            required
            type="number"
            inputMode="numeric"
            value={values.durationMonths}
            onChange={(v) => set("durationMonths", v)}
            error={err("durationMonths")}
          />
        </div>
        {values.area === "OUTRA" && (
          <TextField
            label="Qual área?"
            required
            value={values.areaOther}
            onChange={(v) => set("areaOther", v)}
            error={err("areaOther")}
          />
        )}
        <div className="space-y-2">
          <TextAreaField
            label="Público-alvo"
            required
            hint="Quem participa do projeto? Descreva o grupo, sem nomes ou dados pessoais."
            value={values.targetAudience}
            onChange={(v) => set("targetAudience", v)}
            error={err("targetAudience")}
          />
          <Example>Famílias agricultoras em situação de vulnerabilidade social da zona rural do município.</Example>
        </div>
        <div className="space-y-2">
          <TextAreaField
            label="Problema enfrentado"
            required
            rows={4}
            hint="A situação que existe hoje no território e que motiva o projeto. Fale da realidade, não das ações."
            value={values.problem}
            onChange={(v) => set("problem", v)}
            error={err("problem")}
          />
          <Example>
            As famílias produzem pouco por causa da escassez de água e de técnicas adaptadas ao semiárido, e têm
            dificuldade de vender o excedente.
          </Example>
        </div>
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-medium">
              Local de atuação
              <span className="text-destructive" aria-hidden>
                {" "}
                *
              </span>
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">Inclua todas as cidades onde o projeto atua.</p>
          </div>
          {err("territories") && <p className="text-sm text-destructive">{err("territories")?.[0]}</p>}
          <ul className="space-y-3">
            {values.territories.map((t, i) => (
              <li key={i} className="grid grid-cols-[1fr_7rem_auto] items-end gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`city-${i}`}>Cidade {values.territories.length > 1 ? i + 1 : ""}</Label>
                  <Input
                    id={`city-${i}`}
                    value={t.city}
                    className="h-10"
                    aria-invalid={Boolean(err(`territories.${i}.city`))}
                    aria-describedby={err(`territories.${i}.city`) ? `city-${i}-error` : undefined}
                    onChange={(e) =>
                      set(
                        "territories",
                        values.territories.map((x, j) => (j === i ? { ...x, city: e.target.value } : x)),
                      )
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`uf-${i}`}>UF</Label>
                  <select
                    id={`uf-${i}`}
                    className={selectClass}
                    value={t.state}
                    aria-invalid={Boolean(err(`territories.${i}.state`))}
                    aria-describedby={err(`territories.${i}.state`) ? `city-${i}-error` : undefined}
                    onChange={(e) =>
                      set(
                        "territories",
                        values.territories.map((x, j) => (j === i ? { ...x, state: e.target.value } : x)),
                      )
                    }
                  >
                    <option value="">UF</option>
                    {BRAZILIAN_STATES.map(([code, name]) => (
                      <option key={code} value={code} title={name}>
                        {code}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  disabled={values.territories.length === 1}
                  aria-label={`Remover cidade ${i + 1}`}
                  onClick={() =>
                    set(
                      "territories",
                      values.territories.filter((_, j) => j !== i),
                    )
                  }
                >
                  <Trash2 aria-hidden />
                </Button>
                {(err(`territories.${i}.city`) || err(`territories.${i}.state`)) && (
                  <p id={`city-${i}-error`} className="col-span-3 text-sm text-destructive">
                    {err(`territories.${i}.city`)?.[0] ?? err(`territories.${i}.state`)?.[0]}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="outline"
            onClick={() => set("territories", [...values.territories, { city: "", state: "" }])}
          >
            <Plus aria-hidden />
            Acrescentar cidade
          </Button>
        </div>
      </section>

      <div className={cn("flex flex-wrap items-center gap-3", projectId ? "justify-between" : "justify-end")}>
        {projectId && (
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancelar
          </Button>
        )}
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {projectId ? "Salvar alterações" : "Salvar e iniciar a jornada"}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Substituir o contexto aprovado?"
        description="O contexto do projeto já foi aprovado. Ao salvar, a versão atual será substituída por esta."
        confirmLabel="Substituir versão aprovada"
        onConfirm={() => {
          setConfirmOpen(false);
          save(true);
        }}
      />
    </form>
  );
}
