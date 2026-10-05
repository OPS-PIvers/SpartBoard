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
