import { cn } from "@/lib/utils";

/** Marca neutra da plataforma (não reproduz identidade visual oficial). */
export function BrandMark({ size = "md", className }: { size?: "md" | "lg"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground",
        size === "lg" ? "size-12" : "size-8",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className={size === "lg" ? "size-7" : "size-5"} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 18c3-1 4-4 6-7s4-5 10-6" />
        <circle cx="4" cy="18" r="1.6" fill="currentColor" />
        <circle cx="12" cy="9.5" r="1.6" fill="currentColor" />
        <circle cx="20" cy="5" r="1.6" fill="currentColor" />
      </svg>
    </span>
  );
}

export function BrandName() {
  return (
    <span className="flex flex-col leading-tight">
      <span className="text-sm font-semibold">Jornada de Impacto</span>
      <span className="text-[11px] text-muted-foreground">BTG Soma</span>
    </span>
  );
}
