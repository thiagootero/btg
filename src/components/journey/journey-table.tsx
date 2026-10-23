import type { ReactNode } from "react";
import { ValueOrToDefine } from "@/components/journey/to-define";

export interface JourneyColumn {
  /** Pergunta orientadora, exibida acima do título da coluna. */
  question: string;
  title: string;
  className?: string;
}

/**
 * Tabela das sínteses aprovadas: cada coluna traz a pergunta que orienta o
 * preenchimento e o nome do campo. As linhas chegam prontas de quem a usa, e
 * a última coluna (sem título) recebe as ações de editar e excluir.
 */
export function JourneyTable({
  label,
  columns,
  emptyText,
  withActions,
  children,
}: {
  label: string;
  columns: JourneyColumn[];
  emptyText: string;
  withActions: boolean;
  children: ReactNode;
}) {
  const isEmpty = Array.isArray(children) ? children.length === 0 : !children;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[640px] border-collapse text-sm" aria-label={label}>
        <thead className="bg-muted/60">
          <tr>
            {columns.map((c) => (
              <th
                key={c.title}
                scope="col"
                className={`border-b px-3 py-2.5 text-left align-bottom ${c.className ?? ""}`}
              >
                <span className="block text-[11px] font-normal italic leading-tight text-muted-foreground">
                  {c.question}
                </span>
                <span className="mt-0.5 block font-semibold">{c.title}</span>
              </th>
            ))}
            {withActions && (
              <th scope="col" className="w-px border-b">
                <span className="sr-only">Ações</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {isEmpty ? (
            <tr>
              <td
                colSpan={columns.length + (withActions ? 1 : 0)}
                className="px-3 py-6 text-center text-muted-foreground"
              >
                {emptyText}
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Célula de lista (indicadores, meios de verificação); vazia mostra "a definir". */
export function ListCell({ items }: { items: string[] }) {
  if (!items.length) return <ValueOrToDefine value={null} />;
  if (items.length === 1) return <>{items[0]}</>;
  return (
    <ul className="list-disc space-y-1 pl-4">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
