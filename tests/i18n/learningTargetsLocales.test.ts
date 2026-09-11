import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

type Tree = Record<string, unknown>;

function leafPaths(node: Tree, prefix = ''): string[] {
  return Object.entries(node).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return v && typeof v === 'object' ? leafPaths(v as Tree, path) : [path];
  });
}

const LOCALES: Record<string, Tree> = { de, es, fr };

describe('learningTargets locale parity', () => {
  const enTop = leafPaths((en as Tree).learningTargets as Tree);
  const enPlc = leafPaths(
    ((en as Tree).plcDashboard as Tree).learningTargets as Tree
  );

  it('EN defines the namespace', () => {
    expect(enTop.length).toBeGreaterThan(20);
    expect(enPlc).toEqual(['heading', 'description']);
    expect(((en as Tree).plcDashboard as Tree).tabs).toHaveProperty('targets');
  });

  for (const [lang, tree] of Object.entries(LOCALES)) {
    it(`${lang} mirrors every learningTargets key`, () => {
      expect(leafPaths(tree.learningTargets as Tree).sort()).toEqual(
        [...enTop].sort()
      );
      const plc = leafPaths(
        (tree.plcDashboard as Tree).learningTargets as Tree
      );
      expect(plc.sort()).toEqual([...enPlc].sort());
      expect((tree.plcDashboard as Tree).tabs).toHaveProperty('targets');
    });
  }
});
