import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';

// Fails when a scroller's direct child is pinned to its height, which drops the scroller's end padding.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_ROOTS = ['components', 'App.tsx'];
const SCROLLS = /(^|\s)(overflow-y-auto|overflow-auto|overflow-y-scroll)(\s|$)/;
const PINNED = /(^|\s)(h-full|h-screen)(\s|$)/;
const CLIPS = /(^|\s)overflow-(y-)?(auto|scroll|hidden|clip)(\s|$)/;
// Centered loading and empty states never overflow.
const CENTERED = /(^|\s)justify-center(\s|$)/;
// AssignStudentPicker: empty states sizing a container query box. PlcDashboard: the pinned panel scrolls itself.
const ALLOWED_FILES = [
  'components/common/library/AssignStudentPicker.tsx',
  'components/plc/PlcDashboard.tsx',
];

const listFiles = (path: string): string[] => {
  const abs = join(repoRoot, path);
  if (statSync(abs).isFile()) return [path];
  return readdirSync(abs).flatMap((name) => {
    const child = join(path, name);
    if (statSync(join(repoRoot, child)).isDirectory()) return listFiles(child);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [child] : [];
  });
};

// Every class literal in the className, including both arms of a conditional.
const classNameOf = (el: ts.JsxOpeningLikeElement): string => {
  const parts: string[] = [];
  const collect = (n: ts.Node) => {
    if (ts.isStringLiteralLike(n)) parts.push(n.text);
    else if (ts.isTemplateExpression(n)) {
      parts.push(n.head.text, ...n.templateSpans.map((s) => s.literal.text));
      n.templateSpans.forEach((s) => collect(s.expression));
    } else if (ts.isConditionalExpression(n)) {
      collect(n.whenTrue);
      collect(n.whenFalse);
    } else if (ts.isBinaryExpression(n)) {
      collect(n.left);
      collect(n.right);
    } else if (ts.isParenthesizedExpression(n) || ts.isJsxExpression(n)) {
      if (n.expression) collect(n.expression);
    }
  };
  for (const prop of el.attributes.properties) {
    if (
      ts.isJsxAttribute(prop) &&
      prop.name.getText() === 'className' &&
      prop.initializer
    )
      collect(prop.initializer);
  }
  return parts.join(' ');
};

const openingOf = (node: ts.Node): ts.JsxOpeningLikeElement | undefined =>
  ts.isJsxElement(node)
    ? node.openingElement
    : ts.isJsxSelfClosingElement(node)
      ? node
      : undefined;

// JSX children, looking through `cond && <X/>`, ternaries and fragments.
const childElements = (node: ts.Node): ts.JsxOpeningLikeElement[] => {
  const out: ts.JsxOpeningLikeElement[] = [];
  const visit = (n: ts.Node) => {
    const open = openingOf(n);
    if (open) {
      out.push(open);
      return;
    }
    if (ts.isJsxFragment(n)) n.children.forEach(visit);
    else if (ts.isJsxExpression(n) && n.expression) visit(n.expression);
    else if (ts.isParenthesizedExpression(n)) visit(n.expression);
    else if (ts.isBinaryExpression(n)) visit(n.right);
    else if (ts.isConditionalExpression(n)) {
      visit(n.whenTrue);
      visit(n.whenFalse);
    }
  };
  if (ts.isJsxElement(node)) node.children.forEach(visit);
  return out;
};

const findViolations = (): string[] => {
  const out: string[] = [];
  for (const file of SCAN_ROOTS.flatMap(listFiles)) {
    const text = readFileSync(join(repoRoot, file), 'utf8');
    if (!text.includes('overflow')) continue;
    const source = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
    const walk = (node: ts.Node) => {
      if (
        ts.isJsxElement(node) &&
        SCROLLS.test(classNameOf(node.openingElement))
      ) {
        for (const child of childElements(node)) {
          const cls = classNameOf(child);
          const tag = child.tagName.getText();
          if (
            PINNED.test(cls) &&
            !CLIPS.test(cls) &&
            !CENTERED.test(cls) &&
            tag !== 'table' &&
            !ALLOWED_FILES.includes(file)
          ) {
            const line =
              source.getLineAndCharacterOfPosition(child.getStart()).line + 1;
            out.push(`${relative(repoRoot, join(repoRoot, file))}:${line}`);
          }
        }
      }
      ts.forEachChild(node, walk);
    };
    walk(source);
  }
  return out;
};

describe('scroll end padding (static)', () => {
  it('no scroller has a direct child pinned to its height', () => {
    expect(
      findViolations(),
      'Use min-h-full on the child (or let it size to content) so the scroller keeps its end padding.'
    ).toEqual([]);
  });
});
