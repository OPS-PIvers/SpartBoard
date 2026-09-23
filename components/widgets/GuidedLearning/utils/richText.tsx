import React from 'react';

// **bold** or [label](https://…); anything else is literal text.
const TOKEN = /\*\*([^*\n]+?)\*\*|\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)/g;

/** Renders step text with `**bold**` and https links only; never injects HTML. */
export function renderStepText(
  text: string | undefined | null
): React.ReactNode {
  if (!text) return text ?? null;
  const out: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    if (m[1] !== undefined) {
      out.push(<strong key={key++}>{m[1]}</strong>);
    } else {
      out.push(
        <a
          key={key++}
          href={m[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 pointer-events-auto"
        >
          {m[2]}
        </a>
      );
    }
    last = at + m[0].length;
  }
  if (out.length === 0) return text;
  if (last < text.length) out.push(text.slice(last));
  return out;
}
