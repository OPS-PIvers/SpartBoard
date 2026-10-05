import ts from 'typescript';

export const parseSource = (path: string, text: string): ts.SourceFile =>
  ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

export const walk = (node: ts.Node, visit: (n: ts.Node) => void): void => {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
};

const isModuleSpecifier = (node: ts.Node): boolean => {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) {
    return true;
  }
  if (ts.isExternalModuleReference(parent)) return true;
  return (
    ts.isCallExpression(parent) &&
    parent.expression.kind === ts.SyntaxKind.ImportKeyword
  );
};

/** Every string and template chunk in the file, excluding module specifiers and JSX text. */
export const stringLiterals = (sf: ts.SourceFile): string[] => {
  const out: string[] = [];
  walk(sf, (n) => {
    if (
      ts.isStringLiteral(n) ||
      ts.isNoSubstitutionTemplateLiteral(n) ||
      ts.isTemplateHead(n) ||
      ts.isTemplateMiddle(n) ||
      ts.isTemplateTail(n)
    ) {
      if (!isModuleSpecifier(n)) out.push(n.text);
    }
  });
  return out;
};

export interface ImportRecord {
  spec: string;
  names: string[];
  typeOnly: boolean;
  dynamic: boolean;
}

/** Static imports, re-exports and string-literal dynamic imports. */
export const importRecords = (sf: ts.SourceFile): ImportRecord[] => {
  const out: ImportRecord[] = [];
  walk(sf, (n) => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      const clause = n.importClause;
      const names: string[] = [];
      if (clause?.name) names.push(clause.name.text);
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) names.push(el.name.text);
      } else if (bindings && ts.isNamespaceImport(bindings)) {
        names.push(bindings.name.text);
      }
      out.push({
        spec: n.moduleSpecifier.text,
        names,
        typeOnly: Boolean(clause?.isTypeOnly),
        dynamic: false,
      });
    } else if (
      ts.isExportDeclaration(n) &&
      n.moduleSpecifier &&
      ts.isStringLiteral(n.moduleSpecifier)
    ) {
      out.push({
        spec: n.moduleSpecifier.text,
        names: [],
        typeOnly: n.isTypeOnly,
        dynamic: false,
      });
    } else if (
      ts.isCallExpression(n) &&
      n.expression.kind === ts.SyntaxKind.ImportKeyword &&
      n.arguments.length > 0 &&
      ts.isStringLiteralLike(n.arguments[0])
    ) {
      out.push({
        spec: n.arguments[0].text,
        names: [],
        typeOnly: false,
        dynamic: true,
      });
    }
  });
  return out;
};

export const lineCount = (text: string): number =>
  text.length === 0
    ? 0
    : text.split('\n').length - (text.endsWith('\n') ? 1 : 0);

export interface SourceFileText {
  path: string;
  text: string;
}
