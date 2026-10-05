import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { importRecords, parseSource, walk } from './static/source.ts';

export interface RegistryInfo {
  /** Widget type to the module path of its front-face component, as written in the registry. */
  components: Record<string, string>;
  /** Widget type to the module path of its settings schema. */
  settingsSchemas: Record<string, string>;
  /** Widget type to `skipScaling: true` in WIDGET_SCALING_CONFIG. */
  skipScaling: Record<string, boolean>;
}

export interface WidgetFiles {
  type: string;
  /** Repo-relative folder under components/widgets; null for a flat single-file widget. */
  folder: string | null;
  /** Repo-relative front-face entry module. */
  entry: string;
  frontFace: string[];
  settings: string[];
  other: string[];
  /** Tests in the widget folder. */
  tests: string[];
  /** Tests elsewhere (tests/**) that import from the widget folder. */
  externalTests: string[];
  /** null when the type has no WIDGET_SCALING_CONFIG entry. */
  skipScaling: boolean | null;
}

const WIDGETS_DIR = 'components/widgets';
const REGISTRY = `${WIDGETS_DIR}/WidgetRegistry.ts`;
const SOURCE_RE = /\.(ts|tsx)$/;
const TEST_RE = /\.(test|spec)\.tsx?$|(^|\/)__tests__\//;

const propName = (p: ts.ObjectLiteralElementLike): string | null =>
  p.name && (ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name))
    ? p.name.text
    : null;

const findObject = (
  sf: ts.SourceFile,
  varName: string
): ts.ObjectLiteralExpression | null => {
  let found: ts.ObjectLiteralExpression | null = null;
  walk(sf, (n) => {
    if (
      !found &&
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === varName &&
      n.initializer &&
      ts.isObjectLiteralExpression(n.initializer)
    ) {
      found = n.initializer;
    }
  });
  return found;
};

const firstDynamicImport = (node: ts.Node): string | null => {
  let spec: string | null = null;
  walk(node, (n) => {
    if (
      spec === null &&
      ts.isCallExpression(n) &&
      n.expression.kind === ts.SyntaxKind.ImportKeyword &&
      n.arguments.length > 0 &&
      ts.isStringLiteralLike(n.arguments[0])
    ) {
      spec = n.arguments[0].text;
    }
  });
  return spec;
};

export function parseRegistry(text: string): RegistryInfo {
  const sf = parseSource(REGISTRY, text);
  const info: RegistryInfo = {
    components: {},
    settingsSchemas: {},
    skipScaling: {},
  };
  for (const [varName, target] of [
    ['WIDGET_COMPONENTS', info.components],
    ['WIDGET_SETTINGS_SCHEMAS', info.settingsSchemas],
  ] as const) {
    const obj = findObject(sf, varName);
    if (!obj) continue;
    for (const p of obj.properties) {
      const name = propName(p);
      const spec = ts.isPropertyAssignment(p)
        ? firstDynamicImport(p.initializer)
        : null;
      if (name && spec) target[name] = spec;
    }
  }
  const scaling = findObject(sf, 'WIDGET_SCALING_CONFIG');
  if (scaling) {
    for (const p of scaling.properties) {
      const name = propName(p);
      if (!name || !ts.isPropertyAssignment(p)) continue;
      const cfg = p.initializer;
      info.skipScaling[name] =
        ts.isObjectLiteralExpression(cfg) &&
        cfg.properties.some(
          (q) =>
            ts.isPropertyAssignment(q) &&
            propName(q) === 'skipScaling' &&
            q.initializer.kind === ts.SyntaxKind.TrueKeyword
        );
    }
  }
  return info;
}

const isFile = (p: string): boolean => existsSync(p) && statSync(p).isFile();

/** Resolves a relative or `@/` specifier to an absolute source file, or null for packages and misses. */
export function resolveModule(
  repoRoot: string,
  fromFile: string,
  spec: string
): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(repoRoot, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
  else return null;
  if (SOURCE_RE.test(base) && isFile(base)) return base;
  for (const candidate of [
    `${base}.tsx`,
    `${base}.ts`,
    join(base, 'index.tsx'),
    join(base, 'index.ts'),
  ]) {
    if (isFile(candidate)) return candidate;
  }
  return null;
}

const toRel = (repoRoot: string, abs: string): string =>
  relative(repoRoot, abs).split(sep).join('/');

const listSources = (dir: string): string[] => {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) out.push(...listSources(abs));
    else if (SOURCE_RE.test(name)) out.push(abs);
  }
  return out;
};

export const isTestFile = (rel: string): boolean => TEST_RE.test(rel);

export const isSettingsFile = (rel: string): boolean => {
  const base = rel.slice(rel.lastIndexOf('/') + 1).toLowerCase();
  return base.includes('settings') || base.includes('.schema.');
};

let testIndexCache: { root: string; files: [string, string][] } | null = null;

const topLevelTests = (repoRoot: string): [string, string][] => {
  if (testIndexCache?.root === repoRoot) return testIndexCache.files;
  const dir = join(repoRoot, 'tests');
  const files: [string, string][] = existsSync(dir)
    ? listSources(dir)
        .filter((abs) => {
          const rel = toRel(repoRoot, abs);
          return isTestFile(rel) && !rel.startsWith('tests/e2e/');
        })
        .map((abs) => [toRel(repoRoot, abs), readFileSync(abs, 'utf8')])
    : [];
  testIndexCache = { root: repoRoot, files };
  return files;
};

const frontFaceClosure = (
  repoRoot: string,
  entryAbs: string,
  folderAbs: string | null
): string[] => {
  const seen = new Set<string>([entryAbs]);
  if (folderAbs === null) return [entryAbs];
  const queue = [entryAbs];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    const sf = parseSource(file, readFileSync(file, 'utf8'));
    for (const rec of importRecords(sf)) {
      const next = resolveModule(repoRoot, file, rec.spec);
      if (!next || seen.has(next) || !next.startsWith(folderAbs + sep))
        continue;
      const rel = toRel(repoRoot, next);
      if (isTestFile(rel) || isSettingsFile(rel)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return [...seen];
};

export function resolveWidgetFiles(
  repoRoot: string,
  registry?: RegistryInfo
): Record<string, WidgetFiles> {
  const info =
    registry ?? parseRegistry(readFileSync(join(repoRoot, REGISTRY), 'utf8'));
  const registryAbs = join(repoRoot, REGISTRY);
  const widgetsAbs = join(repoRoot, WIDGETS_DIR);
  const out: Record<string, WidgetFiles> = {};
  for (const [type, spec] of Object.entries(info.components)) {
    const entryAbs = resolveModule(repoRoot, registryAbs, spec);
    if (!entryAbs) continue;
    const segments = relative(widgetsAbs, entryAbs).split(sep);
    const folderAbs =
      segments.length > 1 ? join(widgetsAbs, segments[0]) : null;
    const frontAbs = frontFaceClosure(repoRoot, entryAbs, folderAbs);
    const front = new Set(frontAbs);
    const all = folderAbs ? listSources(folderAbs) : [entryAbs];
    const schemaSpec = info.settingsSchemas[type];
    const schemaAbs = schemaSpec
      ? resolveModule(repoRoot, registryAbs, schemaSpec)
      : null;
    const settings: string[] = [];
    const other: string[] = [];
    const tests: string[] = [];
    for (const abs of all) {
      const rel = toRel(repoRoot, abs);
      if (isTestFile(rel)) tests.push(rel);
      else if (front.has(abs)) continue;
      else if (isSettingsFile(rel) || abs === schemaAbs) settings.push(rel);
      else other.push(rel);
    }
    if (schemaAbs && !all.includes(schemaAbs)) {
      settings.push(toRel(repoRoot, schemaAbs));
    }
    const folder = folderAbs ? toRel(repoRoot, folderAbs) : null;
    const externalTests = folder
      ? topLevelTests(repoRoot)
          .filter(([, text]) => text.includes(`${folder}/`))
          .map(([rel]) => rel)
      : [];
    out[type] = {
      type,
      folder,
      entry: toRel(repoRoot, entryAbs),
      frontFace: frontAbs.map((abs) => toRel(repoRoot, abs)).sort(),
      settings: settings.sort(),
      other: other.sort(),
      tests: tests.sort(),
      externalTests,
      skipScaling: type in info.skipScaling ? info.skipScaling[type] : null,
    };
  }
  return out;
}
