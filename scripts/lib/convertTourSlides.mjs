// Pure transform for scripts/convert-tour-slides.mjs (LIVE_TOUR_EDITOR.md E11).

export const STEP_SLIDE_FIELDS = [
  'imageIndex',
  'xPct',
  'yPct',
  'region',
  'calloutPin',
  'calloutWidthPct',
  'calloutScale',
  'calloutTone',
  'calloutBox',
];

// Per-slide data on GuidedLearningSet; imagePaths stay so deleting a set still cleans up Storage.
export const SET_SLIDE_FIELDS = [
  'imageUrls',
  'imageKinds',
  'slideThumbnails',
  'videoTrims',
  'driveFileIds',
  'imageUrl',
];

export const WHOLE_BOARD_ANCHOR = 'board.whole';

const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

function slideUrls(set) {
  if (Array.isArray(set.imageUrls) && set.imageUrls.length > 0)
    return set.imageUrls;
  return typeof set.imageUrl === 'string' && set.imageUrl ? [set.imageUrl] : [];
}

function stillSlideFor(step, urls, kinds) {
  // Clamp like normalizeGuidedLearningSet, so drafts and published snapshots agree.
  const raw = typeof step.imageIndex === 'number' ? step.imageIndex : 0;
  const index = Math.min(Math.max(raw, 0), Math.max(urls.length - 1, 0));
  const url = urls[index];
  if (typeof url !== 'string' || !url.trim()) return null;
  if (Array.isArray(kinds) && kinds[index] === 'video') return null;
  return url;
}

function thumbnailFor(step, urls, kinds) {
  const anchor = step.tour.anchor;
  if (typeof anchor !== 'string' || !anchor.trim()) return null;
  if (anchor === WHOLE_BOARD_ANCHOR) return null;
  const url = stillSlideFor(step, urls, kinds);
  // No set stores slide dimensions, so w/h start at 0 until a Retake.
  return url ? { url, anchor, w: 0, h: 0 } : null;
}

/** Moves each tour step's slide into `tour.thumbnail` and drops slide data; `changed` is false when there was nothing to do. */
export function convertTourSet(set, { requireTourMode = true } = {}) {
  const stats = {
    stepsConverted: 0,
    thumbnailsAdded: 0,
    droppedSetFields: [],
    droppedStepFields: 0,
    picturesDropped: 0,
  };
  if (!isObject(set) || (requireTourMode && set.mode !== 'tour')) {
    return { set, changed: false, stats };
  }
  const urls = slideUrls(set);
  const steps = Array.isArray(set.steps) ? set.steps : [];
  const nextSteps = steps.map((step) => {
    if (!isObject(step)) return step;
    const next = { ...step };
    let touched = false;
    if (isObject(step.tour) && !isObject(step.tour.thumbnail)) {
      const thumbnail = thumbnailFor(step, urls, set.imageKinds);
      if (thumbnail) {
        next.tour = { ...step.tour, thumbnail };
        stats.thumbnailsAdded++;
        touched = true;
      } else if (stillSlideFor(step, urls, set.imageKinds)) {
        stats.picturesDropped++;
      }
    }
    for (const key of STEP_SLIDE_FIELDS) {
      if (has(next, key)) {
        delete next[key];
        stats.droppedStepFields++;
        touched = true;
      }
    }
    if (touched) stats.stepsConverted++;
    return next;
  });
  const next = { ...set, steps: nextSteps };
  for (const key of SET_SLIDE_FIELDS) {
    if (has(next, key)) {
      delete next[key];
      stats.droppedSetFields.push(key);
    }
  }
  const changed = stats.stepsConverted > 0 || stats.droppedSetFields.length > 0;
  return { set: changed ? next : set, changed, stats };
}

/** One line per converted doc for the dry-run and apply logs. */
export function formatChange(label, id, title, stats) {
  const dropped = stats.droppedSetFields.length
    ? stats.droppedSetFields.join(', ')
    : 'none';
  return `${label} ${id}  "${title}"  steps converted: ${stats.stepsConverted}  thumbnails added: ${stats.thumbnailsAdded}  pictures dropped: ${stats.picturesDropped}  step fields dropped: ${stats.droppedStepFields}  set fields dropped: ${dropped}`;
}
