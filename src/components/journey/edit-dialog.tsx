"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { ZodType } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/form/confirm-dialog";
import { FormAlert } from "@/components/form/form-alert";
import type { Errors } from "@/components/journey/forms";
import { ApiError } from "@/lib/client/api";
import { zodFieldErrors } from "@/lib/validation/zod-errors";

export interface EditDialogProps<T, P> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  initial: T;
  /** Valida no cliente com o mesmo schema usado no servidor. */
  schema: ZodType<P>;
  toInput?: (value: T) => unknown;
  render: (value: T, setValue: (value: T) => void, errors: Errors) => React.ReactNode;
  onSubmit: (parsed: P) => Promise<ApiError | null>;
  submitLabel: string;
  /** Confirmação extra antes de substituir conteúdo aprovado. */
  confirmReplace?: { title: string; description: string; label: string };
}

export function EditDialog<T, P>(props: EditDialogProps<T, P>) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && <EditDialogBody {...props} />}
    </Dialog>
  );
}

function EditDialogBody<T, P>({
  onOpenChange,
  title,
  description,
  initial,
  schema,
  toInput,
  render,
  onSubmit,
  submitLabel,
  confirmReplace,
}: EditDialogProps<T, P>) {
  const [value, setValue] = useState<T>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [parsed, setParsed] = useState<P | null>(null);

  async function submit(data: P) {
    setPending(true);
    const error = await onSubmit(data);
    setPending(false);
    if (error) {
      setErrors(error.fieldErrors ?? {});
      setFormError(error.message);
      return;
    }
    onOpenChange(false);
  }

  function onFormSubmit(event: React.FormEvent) {
    event.preventDefault();
    const result = schema.safeParse(toInput ? toInput(value) : value);
    if (!result.success) {
      setErrors(zodFieldErrors(result.error));
      setFormError("Revise os campos destacados.");
      return;
    }
    setErrors({});
    setFormError(null);
    if (confirmReplace) setParsed(result.data);
    else void submit(result.data);
  }

  return (
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
      <form onSubmit={onFormSubmit} noValidate className="space-y-5">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {formError && <FormAlert>{formError}</FormAlert>}
        {render(value, setValue, errors)}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
      {confirmReplace && (
        <ConfirmDialog
          open={parsed !== null}
          onOpenChange={(open) => !open && setParsed(null)}
          title={confirmReplace.title}
          description={confirmReplace.description}
          confirmLabel={confirmReplace.label}
          onConfirm={() => {
            const data = parsed;
            setParsed(null);
            if (data) void submit(data);
          }}
        />
      )}
    </DialogContent>
  );
}

export { ApiError };
