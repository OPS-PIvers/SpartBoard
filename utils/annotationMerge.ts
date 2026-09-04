import type { DrawableObject } from '@/types';

/**
 * Three-way merge of annotation objects when a snapshot arrives while local
 * ink is unsaved. Local adds/edits/deletes win for the objects they touch;
 * remote adds, edits, and deletes are accepted everywhere else.
 */
export const mergeAnnotationObjects = (
  local: DrawableObject[],
  server: DrawableObject[],
  baseline: DrawableObject[]
): DrawableObject[] => {
  const baseById = new Map(baseline.map((o) => [o.id, JSON.stringify(o)]));
  const serverById = new Map(server.map((o) => [o.id, o]));
  const localIds = new Set(local.map((o) => o.id));

  const merged: DrawableObject[] = [];
  for (const o of local) {
    const base = baseById.get(o.id);
    if (base === undefined) {
      merged.push(o); // Local add.
      continue;
    }
    const unchangedLocally = JSON.stringify(o) === base;
    const remote = serverById.get(o.id);
    if (!remote) {
      // Deleted remotely: honor it unless it was edited locally.
      if (!unchangedLocally) merged.push(o);
      continue;
    }
    merged.push(unchangedLocally ? remote : o);
  }
  // Remote adds: on the server, unknown to the baseline, not present locally
  // (absent locally + in baseline means a local delete).
  for (const o of server) {
    if (!baseById.has(o.id) && !localIds.has(o.id)) merged.push(o);
  }
  return merged;
};
