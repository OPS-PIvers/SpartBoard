import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';

// Fails when a srcDoc iframe could run with the parent's origin: allow-same-origin, no sandbox, or a sandbox it can't read.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Root-level folders that never ship to the browser.
const SKIP_ROOTS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  'functions',
  'remotion',
  'tests',
  'public',
  'docs',
  'scripts',
]);

const listFiles = (dir: string): string[] =>
  readdirSync(join(repoRoot, dir)).flatMap((name) => {
    const child = dir ? join(dir, name) : name;
    if (name.startsWith('.')) return [];
    const abs = join(repoRoot, child);
    if (statSync(abs).isDirectory())
      return !dir && SKIP_ROOTS.has(name) ? [] : listFiles(child);
    return /\.[jt]sx?$/.test(name) && !/\.(test|spec)\.[jt]sx?$/.test(name)
      ? [child]
      : [];
  });

const attrName = (prop: ts.JsxAttribute): string => prop.name.getText();

const isSrcDoc = (name: string) => name.toLowerCase() === 'srcdoc';

// The literal sandbox value, or null when it is computed and can't be checked here.
const literalSandbox = (prop: ts.JsxAttribute): string | null => {
  const init = prop.initializer;
  if (!init) return '';
  if (ts.isStringLiteral(init)) return init.text;
  if (ts.isJsxExpression(init) && init.expression) {
    const e = init.expression;
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e))
      return e.text;
  }
  return null;
};

type Problem = { where: string; why: string };

const problemsIn = (file: string, text: string): Problem[] => {
  if (!/srcdoc/i.test(text)) return [];
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const out: Problem[] = [];
  const at = (n: ts.Node) =>
    `${file}:${source.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;

  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const props = node.attributes.properties;
      const hasSrcDoc = props.some(
        (p) => ts.isJsxAttribute(p) && isSrcDoc(attrName(p))
      );
      if (hasSrcDoc) {
        if (node.tagName.getText() !== 'iframe')
          out.push({
            where: at(node),
            why: 'srcDoc passed to a component; render the <iframe> directly so its sandbox can be checked',
          });
        if (props.some(ts.isJsxSpreadAttribute))
          out.push({
            where: at(node),
            why: 'spread props on a srcDoc iframe can carry a sandbox; list each prop',
          });
        const sandboxes = props.filter(
          (p): p is ts.JsxAttribute =>
            ts.isJsxAttribute(p) && attrName(p).toLowerCase() === 'sandbox'
        );
        const sandbox = sandboxes[0];
        if (sandboxes.length > 1)
          out.push({
            where: at(node),
            why: 'srcDoc iframe has more than one sandbox prop',
          });
        if (!sandbox) {
          out.push({
            where: at(node),
            why: 'srcDoc iframe without a sandbox runs with the parent origin',
          });
        } else {
          const value = literalSandbox(sandbox);
          if (value === null)
            out.push({
              where: at(sandbox),
              why: 'srcDoc iframe sandbox must be a string literal',
            });
          else if (/(^|\s)allow-same-origin(\s|$)/i.test(value))
            out.push({
              where: at(sandbox),
              why: 'srcDoc iframe sandbox includes allow-same-origin',
            });
        }
      }
    }
    // createElement and DOM writes skip the JSX checks above.
    if (
      ts.isCallExpression(node) &&
      node.arguments.some(
        (a) =>
          ts.isObjectLiteralExpression(a) &&
          a.properties.some(
            (p) =>
              p.name !== undefined &&
              (ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name)) &&
              isSrcDoc(p.name.text)
          )
      )
    )
      out.push({
        where: at(node),
        why: 'srcDoc passed in a props object; use a JSX <iframe srcDoc> with a literal sandbox',
      });
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
      ((ts.isPropertyAccessExpression(node.left) &&
        isSrcDoc(node.left.name.text)) ||
        (ts.isElementAccessExpression(node.left) &&
          ts.isStringLiteralLike(node.left.argumentExpression) &&
          isSrcDoc(node.left.argumentExpression.text)))
    )
      out.push({
        where: at(node),
        why: 'srcdoc set through the DOM; use a JSX <iframe srcDoc> with a literal sandbox',
      });
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'setAttribute' &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      isSrcDoc(node.arguments[0].text)
    )
      out.push({
        where: at(node),
        why: 'srcdoc set through setAttribute; use a JSX <iframe srcDoc> with a literal sandbox',
      });
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
};

describe('srcDoc iframes never share the parent origin', () => {
  const files = listFiles('');

  it('scans the app source', () => {
    expect(files).toContain(
      join('components', 'widgets', 'Embed', 'Widget.tsx')
    );
    expect(files).toContain('App.tsx');
  });

  it('every srcDoc iframe has a literal sandbox without allow-same-origin', () => {
    const problems = files.flatMap((f) =>
      problemsIn(f, readFileSync(join(repoRoot, f), 'utf8'))
    );
    expect(problems.map((p) => `${p.where}: ${p.why}`)).toEqual([]);
  });

  it('flags each unsafe pattern', () => {
    const bad = [
      '<iframe srcDoc={h} sandbox="allow-scripts allow-same-origin" />',
      "<iframe srcDoc={h} sandbox={'allow-same-origin'} />",
      '<iframe srcDoc={h} />',
      '<iframe srcDoc={h} sandbox={box} />',
      '<iframe srcDoc={h} sandbox="allow-scripts" {...rest} />',
      '<Frame srcDoc={h} sandbox="allow-scripts" />',
      'frame.srcdoc = h;',
      "frame.setAttribute('srcdoc', h);",
      "frame['srcdoc'] = h;",
      "React.createElement('iframe', { srcDoc: h, sandbox: 'allow-scripts' });",
      '<iframe srcDoc={h} sandbox="allow-scripts" sandbox={box} />',
    ];
    for (const code of bad)
      expect(problemsIn('x.tsx', `const a = ${code}`), code).not.toEqual([]);
    expect(
      problemsIn('x.tsx', '<iframe srcDoc={h} sandbox="allow-scripts" />')
    ).toEqual([]);
    expect(problemsIn('x.tsx', '<iframe srcDoc={h} sandbox="" />')).toEqual([]);
  });
});
