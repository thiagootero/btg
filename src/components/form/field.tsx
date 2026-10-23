"use client";

import { useId } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface BaseProps {
  label: string;
  hint?: React.ReactNode;
  error?: string[] | string;
  required?: boolean;
  className?: string;
}

function errorText(error?: string[] | string) {
  if (!error) return null;
  return Array.isArray(error) ? error[0] : error;
}

/** Campo com label, ajuda contextual e erro associados por aria-describedby. */
export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
}: BaseProps & { children: (props: { id: string; describedBy?: string; invalid: boolean }) => React.ReactNode }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const message = errorText(error);
  const errorId = message ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
        {required && (
          <span className="text-destructive" aria-hidden>
            {" "}*
          </span>
        )}
      </Label>
      {hint && (
        <p id={hintId} className="text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      )}
      {children({ id, describedBy, invalid: Boolean(message) })}
      {message && (
        <p id={errorId} className="text-sm text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}

export function TextField({
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
  ...base
}: BaseProps & {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <Field {...base}>
      {({ id, describedBy, invalid }) => (
        <Input
          id={id}
          type={type}
          inputMode={inputMode}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          aria-required={base.required}
          className="h-10"
        />
      )}
    </Field>
  );
}

export function TextAreaField({
  value,
  onChange,
  placeholder,
  rows = 3,
  ...base
}: BaseProps & { value: string; onChange: (value: string) => void; placeholder?: string; rows?: number }) {
  return (
    <Field {...base}>
      {({ id, describedBy, invalid }) => (
        <Textarea
          id={id}
          value={value}
          rows={rows}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          aria-required={base.required}
        />
      )}
    </Field>
  );
}
