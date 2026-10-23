import { ValueOrToDefine } from "@/components/journey/to-define";
import { cn } from "@/lib/utils";

/** Ficha no formato "Rótulo: valor" usado nas sínteses aprovadas. */
export function Ficha({ lines, className }: { lines: Array<[string, string | null | undefined]>; className?: string }) {
  return (
    <dl className={cn("space-y-1.5 text-sm", className)}>
      {lines.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[9.5rem_1fr] gap-2">
          <dt className="font-medium text-muted-foreground">{label}:</dt>
          <dd className="min-w-0 break-words">
            <ValueOrToDefine value={value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
