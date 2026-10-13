import { describe, expect, it } from 'vitest';
import {
  KEEP_MS,
  MAX_BUILDS,
  isSafeAssetName,
  planCarryForward,
} from './carryForwardAssets.mjs';

const NOW = Date.parse('2026-10-13T19:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('planCarryForward', () => {
  it('starts a manifest on the first deploy and fetches nothing', () => {
    const { toFetch, manifest } = planCarryForward(
      null,
      { id: 'new', files: ['index-A.js'] },
      NOW
    );
    expect(toFetch).toEqual([]);
    expect(manifest.builds).toEqual([
      {
        id: 'new',
        deployedAt: new Date(NOW).toISOString(),
        files: ['index-A.js'],
      },
    ]);
  });

  it("fetches the previous build's chunks the new build no longer has", () => {
    const previous = {
      builds: [
        {
          id: 'old',
          deployedAt: ago(60_000),
          files: ['index-OLD.js', 'Embed-OLD.js', 'react-vendor-SAME.js'],
        },
      ],
    };
    const { toFetch, manifest } = planCarryForward(
      previous,
      { id: 'new', files: ['index-NEW.js', 'react-vendor-SAME.js'] },
      NOW
    );
    expect(toFetch).toEqual(['index-OLD.js', 'Embed-OLD.js']);
    expect(manifest.builds.map((b) => b.id)).toEqual(['new', 'old']);
  });

  it('keeps carried files across several deploys until a build ages out', () => {
    const previous = {
      builds: [
        { id: 'b2', deployedAt: ago(3_600_000), files: ['b2.js'] },
        { id: 'b1', deployedAt: ago(KEEP_MS + 1), files: ['b1.js'] },
      ],
    };
    const { toFetch, manifest } = planCarryForward(
      previous,
      { id: 'b3', files: ['b3.js'] },
      NOW
    );
    expect(toFetch).toEqual(['b2.js']);
    expect(manifest.builds.map((b) => b.id)).toEqual(['b3', 'b2']);
  });

  it('caps how many builds it keeps', () => {
    const previous = {
      builds: Array.from({ length: MAX_BUILDS + 5 }, (_, i) => ({
        id: `b${i}`,
        deployedAt: ago(i * 1000),
        files: [`b${i}.js`],
      })),
    };
    const { manifest } = planCarryForward(
      previous,
      { id: 'new', files: [] },
      NOW
    );
    expect(manifest.builds).toHaveLength(MAX_BUILDS);
  });

  it('does not list the same build twice when the same commit redeploys', () => {
    const previous = {
      builds: [{ id: 'same', deployedAt: ago(1000), files: ['a.js'] }],
    };
    const { toFetch, manifest } = planCarryForward(
      previous,
      { id: 'same', files: ['a.js'] },
      NOW
    );
    expect(toFetch).toEqual([]);
    expect(manifest.builds).toHaveLength(1);
  });

  it('ignores a malformed manifest', () => {
    const { toFetch, manifest } = planCarryForward(
      { builds: [{ id: 3 }, null, { id: 'x', deployedAt: 'nope', files: [] }] },
      { id: 'new', files: [] },
      NOW
    );
    expect(toFetch).toEqual([]);
    expect(manifest.builds).toHaveLength(1);
  });
});

describe('isSafeAssetName', () => {
  it('accepts hashed chunk names and rejects paths', () => {
    expect(isSafeAssetName('Embed-Cx9_a-1.js')).toBe(true);
    expect(isSafeAssetName('../firebase.json')).toBe(false);
    expect(isSafeAssetName('a/b.js')).toBe(false);
    expect(isSafeAssetName('..')).toBe(false);
  });
});
