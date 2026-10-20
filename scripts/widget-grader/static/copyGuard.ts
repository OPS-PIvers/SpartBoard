import ts from 'typescript';

// Rules shared with tests/copyGuard.test.ts so the guard and the rubric scan cannot drift.
export const MAX_WORDS = 30;
export const TEXT_PROPS =
  /^(placeholder|description|subtitle|hint|helperText|helpText|label|emptyMessage|emptyText|message|caption|body|detail|note|heading|text|blurb|prompt|defaultValue)$/;

export const copyProblem = (text: string): string | null => {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!/[A-Za-z]{2}/.test(clean)) return null;
  if (clean.includes('—')) return 'em dash';
  if (/^(Pro-tip|Tip|Note):/i.test(clean)) return 'Tip/Note prefix';
  if (clean.split(' ').length > MAX_WORDS) return `over ${MAX_WORDS} words`;
  return null;
};

/** On-screen strings in a source file that break the copy rules. */
export const copyProblemTexts = (sf: ts.SourceFile): string[] => {
  const out: string[] = [];
  const check = (text: string) => {
    if (copyProblem(text)) out.push(text);
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      check(node.text);
    } else if (ts.isJsxAttribute(node) && node.initializer) {
      let init: ts.Node | undefined = node.initializer;
      if (ts.isJsxExpression(init)) init = init.expression;
      if (
        init &&
        ts.isStringLiteralLike(init) &&
        TEXT_PROPS.test(node.name.getText(sf))
      ) {
        check(init.text);
      }
    } else if (
      ts.isJsxExpression(node) &&
      node.expression &&
      ts.isStringLiteralLike(node.expression) &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
    ) {
      check(node.expression.text);
    } else if (
      ts.isPropertyAssignment(node) &&
      ts.isStringLiteralLike(node.initializer) &&
      TEXT_PROPS.test(node.name.getText(sf))
    ) {
      check(node.initializer.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
};

// "Try"/"take" used as a noun for an attempt; the app always says "attempt" (components/CLAUDE.md).
const COUNT = String.raw`(?:\d+|\{\{\s*\w+\s*\}\}|\$\{[^}]*\}|one|two|three|unlimited|more|extra|max|maximum|number of|per|first|second|last|another|your|my|their)`;
const ATTEMPT_NOUN = [
  /\btries\b(?!\s+(?:to|again)\b)/i,
  new RegExp(String.raw`\b${COUNT}\s+(?:tries|takes|try|take)\b`, 'i'),
  /\b(?:try|take)\s+(?:\d+|\{\{\s*\w+\s*\}\}|\$\{[^}]*\})\s+of\b/i,
  /\btakes\s+(?:left|remaining|allowed|used)\b/i,
  /\b(?:first|second|last|single|one)-(?:try|take)\b/i,
];

export const attemptWordingProblem = (text: string): boolean =>
  ATTEMPT_NOUN.some((re) => re.test(text));

/** Every string literal, template and JSX text in a source file that calls an attempt a try or take. */
export const attemptWordingTexts = (sf: ts.SourceFile): string[] => {
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    let text: string | null = null;
    if (ts.isJsxText(node) || ts.isStringLiteralLike(node)) text = node.text;
    else if (ts.isTemplateExpression(node))
      text = node.getText(sf).slice(1, -1);
    if (text !== null && attemptWordingProblem(text)) out.push(text);
    if (!ts.isTemplateExpression(node)) ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
};
