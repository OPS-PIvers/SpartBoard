// FR `sidebar.nav.plcs` still used the raw English acronym "PLC" ("Mes PLCs") instead of the
// established FR term "CAP" used throughout plc.errors.* (e.g. plc.errors.plcNotFound: "CAP
// introuvable.") and plcRoute.* (e.g. plcRoute.hubTitle: "Mes CAP"). This is the FR sibling of
// the DE PLC->PLG (#2193) and ES PLC->Comunidad (#2229) sidebar.nav.plcs drift fixes.

import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import fr from '@/locales/fr.json';

function getLeaf(root: unknown, path: string): string | undefined {
  let node: unknown = root;
  for (const segment of path.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return typeof node === 'string' ? node : undefined;
}

describe('EN locale — sidebar.nav.plcs baseline', () => {
  it('en.sidebar.nav.plcs exists', () => {
    expect(getLeaf(en, 'sidebar.nav.plcs')).toBeDefined();
  });
});

describe('FR locale — "PLC" terminology replaced with "CAP" in sidebar.nav.plcs', () => {
  it('fr.sidebar.nav.plcs is the CAP-based translation, not the PLC drift', () => {
    const value = getLeaf(fr, 'sidebar.nav.plcs');
    expect(value, 'fr.sidebar.nav.plcs is missing').toBeDefined();
    expect(
      value,
      `fr.sidebar.nav.plcs should be "Mes CAP" (this namespace's established French term is ` +
        `"CAP", matching plc.errors.* and plcRoute.hubTitle, not the untranslated English ` +
        `acronym "PLC") but got "${value}"`
    ).toBe('Mes CAP');
  });

  it('sidebar.nav.plcs has no remaining "PLC"/"PLCs" usage', () => {
    const value = getLeaf(fr, 'sidebar.nav.plcs') ?? '';
    expect(/\bPLCs?\b/i.test(value)).toBe(false);
  });
});
