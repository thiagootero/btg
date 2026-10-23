import { isToDefine } from "@/lib/journey/rules";
import { cn } from "@/lib/utils";

/** Mostra o valor ou um marcador visual "a definir". */
export function ValueOrToDefine({ value, className }: { value: string | null | undefined; className?: string }) {
  if (isToDefine(value)) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-md border border-warning/30 bg-warning-soft px-1.5 py-0.5 text-xs font-medium text-warning",
          className,
        )}
      >
        a definir
      </span>
    );
  }
  return <span className={className}>{value}</span>;
}
