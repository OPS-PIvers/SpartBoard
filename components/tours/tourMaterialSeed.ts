import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type {
  GuidedLearningStep,
  TourMaterial,
  TourMaterialContent,
  TourMaterialKind,
  TourOpenMaterial,
} from '@/types';
import {
  bindTourMaterial,
  getTourSandbox,
  sandboxGet,
  sandboxId,
  sandboxPut,
  setSandboxPassthrough,
  tourMaterialItem,
} from '@/utils/tourSandbox';

/** Each kind's personal library collection under `users/{uid}`. */
export const MATERIAL_COLLECTIONS: Record<TourMaterialKind, string> = {
  quiz: 'quizzes',
  'video-activity': 'video_activities',
  'guided-learning': 'guided_learning',
  'mini-app': 'miniapps',
  'activity-wall': 'activity_wall_activities',
};

/** Kinds whose library entry points at a Drive file. */
const DRIVE_KINDS: ReadonlySet<TourMaterialKind> = new Set([
  'quiz',
  'video-activity',
  'guided-learning',
]);

/** A copy of an item under a fresh id, so every run starts from the same content. */
export const withItemId = (
  kind: TourMaterialKind,
  content: TourMaterialContent,
  id: string
): TourMaterialContent => ({
  meta: {
    ...content.meta,
    id,
    ...(DRIVE_KINDS.has(kind) ? { driveFileId: `sandbox:${id}` } : {}),
  },
  data: { ...content.data, id },
});

/** Puts the tour's materials in the sandbox: samples as fresh copies, teachers' picks as real items. */
export function seedTourMaterials(
  materials: readonly TourMaterial[],
  opts: { edit: boolean; picks?: Readonly<Record<string, string>> }
): void {
  const passthrough: string[] = [];
  for (const m of materials) {
    const pick = opts.edit ? undefined : opts.picks?.[m.id];
    if (m.source === 'teacher' && pick) {
      bindTourMaterial(m.id, m.kind, pick);
      passthrough.push(pick);
      continue;
    }
    if (!m.sample) continue;
    const id = sandboxId();
    sandboxPut(m.kind, id, withItemId(m.kind, m.sample, id), 'sample');
    bindTourMaterial(m.id, m.kind, id);
  }
  setSandboxPassthrough(passthrough);
}

/** The item a step's open editor shows, recreating a made-in-the-tour item from its saved content. */
export function resolveOpenMaterial(
  open: TourOpenMaterial,
  materials: readonly TourMaterial[]
): { kind: TourMaterialKind; itemId: string } | null {
  const bound = tourMaterialItem(open.materialId);
  if (bound) return { kind: bound.kind, itemId: bound.id };
  const material = materials.find((m) => m.id === open.materialId);
  if (!material || !open.content || !getTourSandbox().active) return null;
  const id = sandboxId();
  sandboxPut(
    material.kind,
    id,
    withItemId(material.kind, open.content, id),
    'created'
  );
  bindTourMaterial(material.id, material.kind, id);
  return { kind: material.kind, itemId: id };
}

/** The material an open item belongs to, adding a made-in-the-tour material when it has none. */
export function materialForOpenItem(
  kind: TourMaterialKind,
  itemId: string,
  materials: readonly TourMaterial[],
  label: string
): { material: TourMaterial; added: boolean; content?: TourMaterialContent } {
  const sandbox = getTourSandbox();
  const bound = [...sandbox.bound].find(
    ([, item]) => item.kind === kind && item.id === itemId
  );
  const known = bound && materials.find((m) => m.id === bound[0]);
  const item = sandboxGet(kind, itemId);
  const content =
    item && item.origin !== 'sample'
      ? { meta: item.meta, data: item.data }
      : undefined;
  if (known) return { material: known, added: false, content };
  const material: TourMaterial = {
    id: crypto.randomUUID(),
    kind,
    source: 'created',
    label,
  };
  bindTourMaterial(material.id, kind, itemId);
  return { material, added: true, content };
}

/** The teacher's own items of a kind, newest first, for the start-of-tour picker. */
export async function listTeacherMaterials(
  uid: string,
  kind: TourMaterialKind
): Promise<{ id: string; title: string }[]> {
  const snap = await getDocs(
    collection(db, 'users', uid, MATERIAL_COLLECTIONS[kind])
  );
  return snap.docs
    .map((d) => {
      const data = d.data() as { title?: unknown; updatedAt?: unknown };
      return {
        id: d.id,
        title: typeof data.title === 'string' ? data.title : '',
        at: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
      };
    })
    .sort((a, b) => b.at - a.at)
    .map(({ id, title }) => ({ id, title }));
}

/** The nearest step at or before `index` with a starting board, or 0. */
export const checkpointAt = (
  steps: readonly GuidedLearningStep[],
  index: number
): number => {
  for (let i = Math.min(index, steps.length - 1); i > 0; i--) {
    if (steps[i]?.tour?.start) return i;
  }
  return 0;
};
