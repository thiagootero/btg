import { Fragment } from "react";

/**
 * Renderiza o texto do consultor com um subconjunto mínimo de marcação
 * (**negrito**, parágrafos e quebras de linha). Nada é interpretado como HTML.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  const paragraphs = text.split(/\n{2,}/);
  return (
    <div className={className}>
      {paragraphs.map((p, i) => (
        <p key={i} className="mb-3 last:mb-0">
          {p.split("\n").map((line, j, lines) => (
            <Fragment key={j}>
              <Inline text={line} />
              {j < lines.length - 1 && <br />}
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-semibold">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}
