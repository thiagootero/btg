import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AREA_LABELS, BRAZILIAN_STATES, PROJECT_AREAS } from "@/lib/journey/areas";

const selectClass =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none";

/** Filtros por GET: funcionam sem JavaScript e mantêm a URL compartilhável. */
export function ProjectFiltersForm({
  defaults,
  organizations,
}: {
  defaults: { q: string; area: string; uf: string; org: string };
  organizations: [string, string][];
}) {
  return (
    <form
      role="search"
      action="/projetos"
      className="mt-6 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto] lg:items-end"
    >
      <div className="space-y-1.5">
        <Label htmlFor="filter-q">Buscar por nome</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input id="filter-q" name="q" defaultValue={defaults.q} placeholder="Nome do projeto" className="h-10 pl-9" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="filter-area">Área</Label>
        <select id="filter-area" name="area" defaultValue={defaults.area} className={selectClass}>
          <option value="">Todas</option>
          {PROJECT_AREAS.map((a) => (
            <option key={a} value={a}>
              {AREA_LABELS[a]}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="filter-uf">Estado</Label>
        <select id="filter-uf" name="uf" defaultValue={defaults.uf} className={selectClass}>
          <option value="">Todos</option>
          {BRAZILIAN_STATES.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </div>
      {organizations.length > 0 && (
        <div className="space-y-1.5 lg:col-span-1">
          <Label htmlFor="filter-org">Organização</Label>
          <select id="filter-org" name="org" defaultValue={defaults.org} className={selectClass}>
            <option value="">Todas</option>
            {organizations.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
      )}
      <Button type="submit" variant="secondary" className="h-10">
        Filtrar
      </Button>
    </form>
  );
}
