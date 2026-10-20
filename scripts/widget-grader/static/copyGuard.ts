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
const NUM = String.raw`(?:\d+|\{\{\s*\w+\s*\}\})`;
const COUNT = String.raw`(?:${NUM}|unlimited|more|extra|max|maximum|number of|per|total)`;
const ORDINAL = String.raw`(?:\d+(?:st|nd|rd|th)|first|second|third|fourth|fifth|last|final|best|another|one more)`;
const NOT_VERB_OBJECT = String.raw`(?!\s+(?:the|a|an|this|that|these|those|it|them|your|their|my|our|on|at|in|out|over|up|part)\b)`;
const ATTEMPT_NOUN = [
  /\btries\b(?!\s+(?:to|again|the|a|an|it|this|that|out|on)\b)/i,
  new RegExp(String.raw`\b${COUNT}\s+(?:tries|takes|try|take)\b`, 'i'),
  new RegExp(
    String.raw`\b${ORDINAL}[\s-]+(?:try|take)\b${NOT_VERB_OBJECT}`,
    'i'
  ),
  /\b(?:my|your|their)\s+try\b/i,
  new RegExp(String.raw`\b(?:try|take)\s+#?\s*${NUM}\s*(?:of|/)\s*${NUM}`, 'i'),
  /\b(?:try|take)\s+#\s*\d/i,
  /\b(?:try|take)\s+(?:count|limit|number)\b/i,
  /\btakes\s+(?:remaining|allowed|used|per)\b/i,
  /^\s*Takes\s*$/,
];

export const attemptWordingProblem = (text: string): boolean =>
  ATTEMPT_NOUN.some((re) => re.test(text));

const ATTR_TEXT = /^(title|aria-label|alt)$/;
const isCodeLiteral = (node: ts.StringLiteralLike, sf: ts.SourceFile) => {
  const parent = node.parent;
  if (/^[\w-]+(?:\.[\w-]+)+$/.test(node.text)) return true;
  if (
    ts.isImportDeclaration(parent) ||
    ts.isExportDeclaration(parent) ||
    ts.isExternalModuleReference(parent) ||
    ts.isElementAccessExpression(parent) ||
    ts.isLiteralTypeNode(parent)
  ) {
    return true;
  }
  if (ts.isJsxAttribute(parent) || ts.isJsxAttribute(parent.parent)) {
    const attr = ts.isJsxAttribute(parent) ? parent : parent.parent;
    const name = (attr as ts.JsxAttribute).name.getText(sf);
    return !TEXT_PROPS.test(name) && !ATTR_TEXT.test(name);
  }
  return false;
};

/** String literals, templates and JSX text in a source file that call an attempt a try or take. */
export const attemptWordingTexts = (sf: ts.SourceFile): string[] => {
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    let text: string | null = null;
    if (ts.isJsxText(node)) text = node.text;
    else if (ts.isStringLiteralLike(node) && !isCodeLiteral(node, sf)) {
      text = node.text;
    } else if (ts.isTemplateExpression(node)) {
      text =
        node.head.text +
        node.templateSpans.map((s) => `{{x}}${s.literal.text}`).join('');
    }
    if (text !== null && attemptWordingProblem(text)) out.push(text);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
};
