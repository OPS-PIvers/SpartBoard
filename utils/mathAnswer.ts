/** Marks an equation inside a written response; the value is its LaTeX, the text its plain math. */
export const MATH_ATTR = 'data-math';

/** Drops the brackets MathLive puts around single-token fractions: "(3)/(4)" → "3/4". */
export function tidyAsciiMath(ascii: string): string {
  let out = ascii;
  // "((x+1))" → "(x+1)": a typed bracket inside MathLive's own fraction bracket.
  for (let prev = ''; prev !== out;) {
    prev = out;
    out = out.replace(/\(\(([^()]*)\)\)/g, '($1)');
  }
  return out
    .replace(/\(([A-Za-z0-9.]+)\)(?=\/)/g, '$1')
    .replace(/(?<=\/)\(([A-Za-z0-9.]+)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
