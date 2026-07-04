/**
 * Regression test for the `plcDashboard.resources` namespace being entirely
 * absent from ALL locale files (including en.json) despite being used
 * extensively by the "PLC Resources" admin panel and its consumers.
 *
 * ROOT CAUSE
 * ----------
 * `components/admin/PlcResourcesManager/PlcResourcesManager.tsx`,
 * `components/admin/PlcResourcesManager/PlcTargetPicker.tsx`, and
 * `components/admin/PlcResourcesManager/PlcRecoveryPanel.tsx` (admin push
 * side) plus `components/plc/resources/PlcResourcesBody.tsx` (teacher-facing
 * receiving side) all call `t('plcDashboard.resources.<key>', { defaultValue:
 * '<English text>' })` — but no locale file (not even en.json) ever defined
 * a `plcDashboard.resources` object. i18next's lookup order is:
 *   1. current language resource
 *   2. fallbackLng ('en') resource
 *   3. the inline `defaultValue`
 * Because step 2 also came up empty (en.json never had the key either), EVERY
 * locale — including English — rendered the same hardcoded `defaultValue`
 * string. In other words this wasn't a DE/ES/FR-only gap: the whole "PLC
 * Resources" feature (admin push panel, target picker, teacher inbox) was
 * permanently locked to English defaultValue text for every user, in every
 * language, with no way to localize it short of editing component source.
 *
 * AFFECTED CALL SITES (defaultValue present, but no real resource ever
 * existed to override it in ANY locale — a strictly worse variant of the
 * usual "present in EN, missing in DE/ES/FR" bug):
 *   - components/admin/PlcResourcesManager/PlcResourcesManager.tsx (~30 keys)
 *   - components/admin/PlcResourcesManager/PlcTargetPicker.tsx (~7 keys)
 *   - components/admin/PlcResourcesManager/PlcRecoveryPanel.tsx (2 shared keys)
 *   - components/plc/resources/PlcResourcesBody.tsx (~17 keys, teacher side)
 *
 * FIX
 * ---
 * Added the full `plcDashboard.resources` namespace (60 leaf keys) to all
 * four locale files with real, professionally translated DE/ES/FR values.
 * Also fixed two related bugs in PlcResourcesManager.tsx while in the file:
 *   - `KIND_LABELS` was a hardcoded English-only lookup never passed through
 *     `t()` at all (not even a missing-key bug — it never called i18next).
 *     Replaced with `getKindLabel()`, which resolves
 *     `plcDashboard.resources.kindBadge.<kind>`.
 *   - `editAction`/`deleteAction` baked the resource title into the
 *     `defaultValue` via a template literal without passing `title` as an
 *     interpolation variable, making proper translation impossible (word
 *     order differs by language). Now passes `{ title: res.title }` and the
 *     locale strings use `{{title}}`.
 *   - The resource list's `aria-label="Pushed resources"` was a raw JSX
 *     string, not run through `t()` at all. Localized as
 *     `plcDashboard.resources.listAriaLabel`.
 *
 * HOW TO VERIFY WITHOUT THIS TEST
 * --------------------------------
 * Before the fix, `en.plcDashboard.resources` was `undefined`, so every
 * assertion below that dereferences a key under it fails immediately
 * (namespace presence check fails first). After the fix, all 60 keys resolve
 * in all four locales, and DE/ES/FR values differ from the EN source except
 * for a documented allowlist of legitimate cross-language cognates/loanwords
 * (e.g. "Quiz", which the project already treats as an unchanged loanword in
 * German and French elsewhere — see plcDashboard.trash.type.quiz).
 */

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
  de: [
    'kindBadge.quiz',
    // "PLC" is kept as an untranslated acronym in German, matching the
    // sibling admin.plc.recovery panel rendered on the same admin screen —
    // so "{{count}} PLC"/"{{count}} PLCs" is the correct DE translation.
    'targetSelectedBadge_one',
    'targetSelectedBadge_other',
  ],
  es: [
    // Spanish also keeps "PLC" as an invariant, untranslated acronym
    // (matches admin.plc.recovery.empty: "No hay PLC recuperables…").
    'targetSelectedBadge_one',
  ],
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
