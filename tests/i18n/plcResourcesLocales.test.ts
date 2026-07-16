// Regression: plcDashboard.resources was entirely absent from every locale (even en.json), so all PLC Resources t() calls silently rendered their defaultValue in every language — see PR description for full root cause / fix.

import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

type LocaleFile = typeof en;

/** Dotted path walker — returns the leaf string or undefined. */
function getLeaf(root: unknown, path: string): string | undefined {
  let node: unknown = root;
  for (const segment of path.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return typeof node === 'string' ? node : undefined;
}

/** Recursively collect every leaf (string-valued) dotted key path. */
function collectLeafPaths(root: unknown, prefix = ''): string[] {
  if (root == null || typeof root !== 'object') return [];
  const paths: string[] = [];
  for (const [key, value] of Object.entries(root as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value != null && typeof value === 'object' && !Array.isArray(value)) {
      paths.push(...collectLeafPaths(value, path));
    } else {
      paths.push(path);
    }
  }
  return paths;
}

/** Extract {{var}} interpolation placeholders from a value. */
function interpolationVars(value: string | undefined): Set<string> {
  if (!value) return new Set();
  return new Set(value.match(/\{\{[^}]+\}\}/g) ?? []);
}

const NAMESPACE = 'plcDashboard.resources';

// Keys where the DE/ES/FR translation is *intentionally* identical to the EN
// source — established cognates/loanwords already used elsewhere in these
// locale files (e.g. plcDashboard.trash.type.quiz keeps "Quiz" untranslated
// in DE and FR). Listed explicitly so a future accidental verbatim-EN
// regression on a *different* key is still caught.
const EXPECTED_COGNATE_MATCHES: Record<string, string[]> = {
  // NOTE: an earlier version of this allowlist also carried
  // 'targetSelectedBadge_one'/'_other' for de, on the theory that "PLC" is an
  // intentional untranslated acronym there (citing admin.plc.recovery as
  // precedent). That was wrong: the DE locale's own established term for PLC
  // is "PLG" (see plcDashboard.subtitle: "PLG-Dashboard", plcDashboard.members.*,
  // sidebar.plcs.*, plcDirectory.*), used 45+ times across plcDashboard. The
  // admin.plc.recovery panel is a separate, admin-only namespace and is not a
  // valid precedent for the teacher-facing plcDashboard. Fixed in
  // deDashboardPlgTerminologyLocales.test.ts; do not re-add "PLC" here.
  // ES's established term is "Comunidad" (same mistake as de above). Fixed in esDashboardComunidadTerminologyLocales.test.ts.
  de: ['kindBadge.quiz'],
  es: [],
  fr: ['kindBadge.quiz', 'kind.doc'],
};

describe('EN locale — plcDashboard.resources namespace exists', () => {
  it('the namespace itself is present (was entirely absent pre-fix)', () => {
    expect(
      (en.plcDashboard as Record<string, unknown>).resources,
      'en.plcDashboard.resources is missing — the whole PLC Resources ' +
        'feature has no real translation namespace, only inline defaultValue ' +
        'strings baked into component source'
    ).toBeDefined();
  });

  const leafPaths = collectLeafPaths(
    (en.plcDashboard as Record<string, unknown>).resources
  );

  it('has a substantial number of leaf keys (sanity check on this test itself)', () => {
    expect(leafPaths.length).toBeGreaterThanOrEqual(50);
  });

  it.each(leafPaths)('en: %s resolves to a non-empty string', (leaf) => {
    const value = getLeaf(en, `${NAMESPACE}.${leaf}`);
    expect(value, `en.${NAMESPACE}.${leaf} is missing or empty`).toBeTruthy();
  });
});

describe.each([
  { code: 'de', locale: de as unknown as LocaleFile },
  { code: 'es', locale: es as unknown as LocaleFile },
  { code: 'fr', locale: fr as unknown as LocaleFile },
])('$code locale — plcDashboard.resources translations', ({ code, locale }) => {
  const enLeafPaths = collectLeafPaths(
    (en.plcDashboard as Record<string, unknown>).resources
  );
  const cognateAllowlist = new Set(EXPECTED_COGNATE_MATCHES[code] ?? []);

  it.each(enLeafPaths)(`${code}: %s key is present`, (leaf) => {
    const value = getLeaf(locale, `${NAMESPACE}.${leaf}`);
    expect(value, `${code}.${NAMESPACE}.${leaf} is missing`).toBeDefined();
  });

  it.each(enLeafPaths)(
    `${code}: %s preserves EN interpolation variables`,
    (leaf) => {
      const enValue = getLeaf(en, `${NAMESPACE}.${leaf}`);
      const localeValue = getLeaf(locale, `${NAMESPACE}.${leaf}`);
      const enVars = interpolationVars(enValue);
      const localeVars = interpolationVars(localeValue);
      for (const v of enVars) {
        expect(
          localeVars.has(v),
          `${code}.${NAMESPACE}.${leaf} is missing interpolation var ${v} ` +
            `(en="${enValue}", ${code}="${localeValue}")`
        ).toBe(true);
      }
    }
  );

  it.each(enLeafPaths.filter((leaf) => !cognateAllowlist.has(leaf)))(
    `${code}: %s is not verbatim English`,
    (leaf) => {
      const enValue = getLeaf(en, `${NAMESPACE}.${leaf}`);
      const localeValue = getLeaf(locale, `${NAMESPACE}.${leaf}`);
      expect(
        localeValue,
        `${code}.${NAMESPACE}.${leaf} is missing — this test must not pass ` +
          `vacuously against an undefined value.`
      ).toBeTruthy();
      expect(
        localeValue,
        `${code}.${NAMESPACE}.${leaf} is still the verbatim EN string ` +
          `"${enValue}" — this key is present so i18next's defaultValue ` +
          `fallback never fires, and ${code} users silently see English.`
      ).not.toBe(enValue);
    }
  );

  it.each([...cognateAllowlist])(
    `${code}: %s is the documented intentional cognate match`,
    (leaf) => {
      const enValue = getLeaf(en, `${NAMESPACE}.${leaf}`);
      const localeValue = getLeaf(locale, `${NAMESPACE}.${leaf}`);
      expect(
        localeValue,
        `${code}.${NAMESPACE}.${leaf} was expected to intentionally match ` +
          `the EN cognate "${enValue}" but diverged to "${localeValue}" — ` +
          `update EXPECTED_COGNATE_MATCHES if this was a deliberate change.`
      ).toBe(enValue);
    }
  );
});
