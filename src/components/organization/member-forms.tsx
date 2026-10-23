"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import {
  addMemberAction,
  createOrganizationAction,
  removeMemberAction,
  type ActionResult,
} from "@/app/(app)/organizacao/actions";
import { Button } from "@/components/ui/button";
import { Field, TextField } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { ConfirmDialog } from "@/components/form/confirm-dialog";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password-policy";
import { newMemberSchema, newOrganizationSchema } from "@/lib/validation/members";
import { zodFieldErrors } from "@/lib/validation/zod-errors";

function useActionForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  function run(action: () => Promise<ActionResult>, onSuccess?: () => void) {
    startTransition(async () => {
      const r = await action();
      setResult(r);
      setErrors(r.ok ? {} : (r.fieldErrors ?? {}));
      if (r.ok) {
        onSuccess?.();
        router.refresh();
      }
    });
  }
  return { pending, result, errors, setErrors, setResult, run };
}

const passwordHint = `Senha provisória com pelo menos ${PASSWORD_MIN_LENGTH} caracteres. Necessária apenas se a pessoa ainda não tiver conta.`;

export function AddMemberForm({ organizationId }: { organizationId: string }) {
  const empty = { name: "", email: "", password: "", role: "ORGANIZATION_MEMBER" };
  const [values, setValues] = useState(empty);
  const form = useActionForm();

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = newMemberSchema.safeParse(values);
    if (!parsed.success) {
      form.setErrors(zodFieldErrors(parsed.error));
      form.setResult({ ok: false, message: "Revise os campos destacados." });
      return;
    }
    form.run(() => addMemberAction(organizationId, parsed.data), () => setValues(empty));
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {form.result && <FormAlert tone={form.result.ok ? "success" : "error"}>{form.result.message}</FormAlert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Nome" required value={values.name} onChange={(name) => setValues({ ...values, name })} error={form.errors.name} />
        <TextField label="E-mail" type="email" required value={values.email} onChange={(email) => setValues({ ...values, email })} error={form.errors.email} />
        <TextField
          label="Senha provisória"
          type="password"
          hint={passwordHint}
          value={values.password}
          onChange={(password) => setValues({ ...values, password })}
          error={form.errors.password}
        />
        <Field label="Perfil" required error={form.errors.role}>
          {({ id, describedBy }) => (
            <select
              id={id}
              aria-describedby={describedBy}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              value={values.role}
              onChange={(e) => setValues({ ...values, role: e.target.value })}
            >
              <option value="ORGANIZATION_MEMBER">Membro (cria e edita projetos)</option>
              <option value="ORGANIZATION_ADMIN">Administrador da organização</option>
            </select>
          )}
        </Field>
      </div>
      <Button type="submit" disabled={form.pending}>
        {form.pending && <Loader2 className="animate-spin" aria-hidden />}
        Acrescentar pessoa
      </Button>
    </form>
  );
}

export function RemoveMemberButton({
  organizationId,
  memberId,
  name,
}: {
  organizationId: string;
  memberId: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const form = useActionForm();
  return (
    <>
      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setOpen(true)} aria-label={`Remover ${name}`}>
        <Trash2 aria-hidden /> Remover
      </Button>
      {form.result && !form.result.ok && <p className="text-xs text-destructive">{form.result.message}</p>}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Remover o acesso de ${name}?`}
        description="A pessoa deixará de ver os projetos desta organização. A conta não é excluída."
        confirmLabel="Remover acesso"
        destructive
        onConfirm={() => {
          setOpen(false);
          form.run(() => removeMemberAction(organizationId, memberId));
        }}
      />
    </>
  );
}

export function CreateOrganizationForm() {
  const empty = { name: "", adminName: "", adminEmail: "", adminPassword: "" };
  const [values, setValues] = useState(empty);
  const form = useActionForm();

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = newOrganizationSchema.safeParse(values);
    if (!parsed.success) {
      form.setErrors(zodFieldErrors(parsed.error));
      form.setResult({ ok: false, message: "Revise os campos destacados." });
      return;
    }
    form.run(() => createOrganizationAction(parsed.data), () => setValues(empty));
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {form.result && <FormAlert tone={form.result.ok ? "success" : "error"}>{form.result.message}</FormAlert>}
      <TextField label="Nome da organização" required value={values.name} onChange={(name) => setValues({ ...values, name })} error={form.errors.name} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Pessoa administradora" required value={values.adminName} onChange={(adminName) => setValues({ ...values, adminName })} error={form.errors.adminName} />
        <TextField label="E-mail" type="email" required value={values.adminEmail} onChange={(adminEmail) => setValues({ ...values, adminEmail })} error={form.errors.adminEmail} />
      </div>
      <TextField
        label="Senha provisória"
        type="password"
        hint={passwordHint}
        value={values.adminPassword}
        onChange={(adminPassword) => setValues({ ...values, adminPassword })}
        error={form.errors.adminPassword ?? form.errors.password}
      />
      <Button type="submit" disabled={form.pending}>
        {form.pending && <Loader2 className="animate-spin" aria-hidden />}
        Criar organização
      </Button>
    </form>
  );
}
