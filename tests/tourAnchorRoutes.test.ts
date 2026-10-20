import { existsSync, statSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  TOUR_ANCHORS,
  isTourAnchorId,
  parseTourAnchorRef,
  type TourAnchorDef,
} from '@/config/tourAnchors';
import {
  TOUR_SURFACE_AREAS,
  TOUR_SURFACE_KINDS,
  TOUR_SURFACE_NEEDS,
  TOUR_SURFACES,
  type TourSurfaceDef,
} from '@/config/tourSurfaces';
import { TOUR_ANCHOR_SURFACES } from '@/config/tourAnchorSurfaces.generated';
import { openerSurface, surfacePath } from '@/config/tourAnchorRoutes';
import {
  anchorKeys,
  anchorRenderFiles,
  repoRoot,
} from './helpers/tourAnchorSources';
import { writeGenerated } from './helpers/writeGenerated';

type Area = keyof typeof TOUR_SURFACE_AREAS;

/** The folders each area file maps; the longest root owns a file. */
const AREA_ROOTS: Record<Area, readonly string[]> = {
  board: [
    'App.tsx',
    'context/',
    'components/',
    'components/common/',
    'components/layout/',
    'components/settings/',
    'components/settingsModal/',
    'components/boardsModal/',
    'components/classes/',
    'components/share/',
    'components/help/',
    'components/tours/',
  ],
  admin: ['components/admin/'],
  plc: ['components/plc/'],
  quiz: ['components/widgets/QuizWidget/'],
  library: [
    'components/common/library/',
    'components/widgets/VideoActivityWidget/',
    'components/widgets/Flashcards/',
    'components/widgets/ActivityWall/',
    'components/widgets/MiniApp/',
  ],
  guidedLearning: [
    'components/widgets/GuidedLearning/',
    'components/gradebook/',
    'components/student/',
  ],
  widgets: ['components/widgets/'],
};

const longest = <T>(path: string, entries: [string, T][]): T | undefined => {
  let best: [string, T] | undefined;
  for (const entry of entries) {
    const [prefix] = entry;
    const hit = prefix.endsWith('/')
      ? path.startsWith(prefix)
      : path === prefix;
    if (hit && (!best || prefix.length > best[0].length)) best = entry;
  }
  return best?.[1];
};

const AREA_OF = Object.entries(AREA_ROOTS).flatMap(([area, roots]) =>
  roots.map((root): [string, Area] => [root, area as Area])
);
const areaOf = (file: string) => longest(file, AREA_OF);

const SURFACE_OF = Object.entries(TOUR_SURFACES).flatMap(([id, def]) =>
  def.files.map((file): [string, string] => [file, id])
);
const surfaceOf = (file: string) => longest(file, SURFACE_OF);

const RENDERS = anchorRenderFiles();

function expectedAnchorSurfaces(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const id of Object.keys(TOUR_ANCHORS)) {
    const surfaces = new Set<string>();
    for (const file of RENDERS.get(id) ?? []) {
      const surface = surfaceOf(file);
      if (surface) surfaces.add(surface);
    }
    if (surfaces.size) out[id] = [...surfaces].sort();
  }
  return out;
}

// Checks read the live map, so an area can be filled in before the generated file is rewritten.
const LIVE = expectedAnchorSurfaces();

// A surface behind an untagged control waits for the anchor sweep, so it is a known gap, not a broken path.
const blockedByMissingOpener = (start: string): boolean => {
  const seen = new Set<string>();
  for (let id: string | undefined = start; id && !seen.has(id);) {
    seen.add(id);
    const def: TourSurfaceDef | undefined = TOUR_SURFACES[id];
    if (!def) return false;
    if (def.openerMissing) return true;
    id = openerSurface(def, LIVE);
  }
  return false;
};

const isRegisteredRef = (ref: string) =>
  isTourAnchorId(parseTourAnchorRef(ref).id);

const KEYS = anchorKeys();

// A path ref may leave out a row key, but not its type when it names a key or every tag uses one type.
const refShapeProblem = (ref: string): string | undefined => {
  const { id, widgetType, fieldKey } = parseTourAnchorRef(ref);
  if (!isTourAnchorId(id) || widgetType) return undefined;
  const def: TourAnchorDef = TOUR_ANCHORS[id];
  if (!def.perField && !def.perWidgetType) return undefined;
  if (fieldKey)
    return `${ref} names a key without its type; write ${id}:<type>#${fieldKey}`;
  const scanned = KEYS.get(id);
  if (scanned?.typesComplete && scanned.types.length === 1)
    return `${ref} leaves out the type every tag uses; write ${id}:${scanned.types[0]}`;
  return undefined;
};

describe('tour surfaces', () => {
  it('gives each surface id to one area only', () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const [area, surfaces] of Object.entries(TOUR_SURFACE_AREAS)) {
      for (const id of Object.keys(surfaces)) {
        if (seen.has(id)) dupes.push(`${id} (${seen.get(id)}, ${area})`);
        seen.set(id, area);
      }
    }
    expect(dupes).toEqual([]);
  });

  it('matches where each anchor renders (UPDATE_TOUR_ANCHOR_LIST=1 rewrites it)', async () => {
    const map = expectedAnchorSurfaces();
    if (process.env.UPDATE_TOUR_ANCHOR_LIST) {
      await writeGenerated(
        join(repoRoot, 'config/tourAnchorSurfaces.generated.ts'),
        `// Generated by tests/tourAnchorRoutes.test.ts from where each anchor renders; rerun it with UPDATE_TOUR_ANCHOR_LIST=1.\nexport const TOUR_ANCHOR_SURFACES: Readonly<Record<string, readonly string[]>> = ${JSON.stringify(map, null, 2)};\n`
      );
      return;
    }
    expect(TOUR_ANCHOR_SURFACES).toEqual(map);
  });

  it('reaches every surface from the board without a loop', () => {
    const broken = Object.keys(TOUR_SURFACES).filter(
      (id) => !surfacePath(id, LIVE) && !blockedByMissingOpener(id)
    );
    expect(broken, `No path from the board to: ${broken.join(', ')}`).toEqual(
      []
    );
  });

  describe.each(Object.keys(TOUR_SURFACE_AREAS) as Area[])(
    'area %s',
    (area) => {
      const surfaces: Readonly<Record<string, TourSurfaceDef>> =
        TOUR_SURFACE_AREAS[area];

      it('maps every file in the area that renders an anchor', () => {
        const files = new Set([...RENDERS.values()].flat());
        const problems = [...files]
          .filter((file) => areaOf(file) === area)
          .flatMap((file) => {
            const surface = surfaceOf(file);
            if (!surface) return [`${file}: on no surface`];
            return surface in surfaces
              ? []
              : [`${file}: on ${surface}, another area's surface`];
          })
          .sort();
        expect(problems, problems.join('\n')).toEqual([]);
      });

      it('describes each surface completely', () => {
        const problems: string[] = [];
        for (const [id, def] of Object.entries(surfaces)) {
          const fail = (why: string) => problems.push(`${id}: ${why}`);
          if (!(TOUR_SURFACE_KINDS as readonly string[]).includes(def.kind))
            fail(`kind ${def.kind}`);
          if (!def.label.trim()) fail('no label');
          if (!def.files.length) fail('no files');
          for (const file of def.files) {
            const abs = join(repoRoot, file);
            if (!existsSync(abs)) fail(`file ${file} does not exist`);
            else if (file.endsWith('/') !== statSync(abs).isDirectory())
              fail(`${file}: folders end in /, files do not`);
            if (areaOf(file) !== area)
              fail(`${file} belongs to area ${areaOf(file)}`);
          }
          for (const need of def.needs ?? [])
            if (!(TOUR_SURFACE_NEEDS as readonly string[]).includes(need))
              fail(`need ${need}`);
          for (const ref of def.alsoOpensWith ?? [])
            if (!isRegisteredRef(ref))
              fail(`alsoOpensWith ${ref} is not a registered anchor`);
          for (const ref of [
            def.opensWith,
            ...(def.alsoOpensWith ?? []),
            ...Object.values(def.inner ?? {}),
          ]) {
            const shape = ref && refShapeProblem(ref);
            if (shape) fail(shape);
          }
          if (def.opensWith) {
            if (!isRegisteredRef(def.opensWith))
              fail(`opensWith ${def.opensWith} is not a registered anchor`);
            else if (def.parent && !(def.parent in TOUR_SURFACES))
              fail(`parent ${def.parent} is not a surface`);
            else if (!openerSurface(def, LIVE)) {
              const on = LIVE[parseTourAnchorRef(def.opensWith).id] ?? [];
              fail(
                on.length
                  ? `opensWith ${def.opensWith} renders on ${on.join(', ')}; set parent`
                  : `opensWith ${def.opensWith} renders on no surface`
              );
            } else if (openerSurface(def, LIVE) === id) fail('opens itself');
          } else if (def.openerMissing) {
            if (def.parent && !(def.parent in TOUR_SURFACES))
              fail(`parent ${def.parent} is not a surface`);
          } else if (
            def.kind === 'page'
              ? !def.url
              : !['board', 'widget', 'shared'].includes(def.kind)
          ) {
            fail(def.kind === 'page' ? 'page without url' : 'no opensWith');
          }
          for (const [anchor, opener] of Object.entries(def.inner ?? {})) {
            // Or it opens a child surface from here, rendered by a shared component.
            const opensChild = Object.values(TOUR_SURFACES).some(
              (child) =>
                child.opensWith &&
                parseTourAnchorRef(child.opensWith).id === anchor &&
                openerSurface(child, LIVE) === id
            );
            if (!(LIVE[anchor] ?? []).includes(id) && !opensChild)
              fail(`inner ${anchor} does not render here`);
            if (!isRegisteredRef(opener))
              fail(`inner opener ${opener} is not a registered anchor`);
          }
        }
        expect(problems, problems.join('\n')).toEqual([]);
      });
    }
  );
});
