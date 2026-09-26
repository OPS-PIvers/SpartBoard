#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const isObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const inRange = (value, min, max) =>
  Number.isFinite(value) && value >= min && value <= max;
const fail = (message) => {
  throw new Error(message);
};
// Rounding slack for regions measured from pixel bounds, in image-%.
const EDGE_SLACK = 0.01;
const BBOX_SLACK = 0.5;
// Callout size and colour fields; any of them requires schemaVersion 4.
const CALLOUT_STYLE_FIELDS = ['calloutWidthPct', 'calloutScale', 'calloutTone'];
// Dark is the default and is stored as an absent field.
const CALLOUT_TONES = ['light', 'accent'];

const hasCallout = (step) =>
  step.interactionType === 'tooltip' ||
  step.interactionType === 'text-popover' ||
  (['pan-zoom', 'spotlight', 'pan-zoom-spotlight'].includes(
    step.interactionType
  ) &&
    ['popover', 'tooltip'].includes(step.showOverlay));

function validateCalloutStyle(step, path) {
  const used = CALLOUT_STYLE_FIELDS.filter((key) => step[key] !== undefined);
  if (used.length === 0) return false;
  if (!hasCallout(step)) {
    fail(
      `${path}.${used[0]} only applies to tooltip and text-popover steps, or a popover or tooltip showOverlay`
    );
  }
  if (
    step.calloutWidthPct !== undefined &&
    !inRange(step.calloutWidthPct, 10, 95)
  ) {
    fail(`${path}.calloutWidthPct must be a number from 10 to 95`);
  }
  if (step.calloutScale !== undefined && !inRange(step.calloutScale, 0.75, 2)) {
    fail(`${path}.calloutScale must be a number from 0.75 to 2`);
  }
  if (step.calloutTone === 'dark') {
    fail(`${path}.calloutTone: omit it for the default dark card`);
  }
  if (
    step.calloutTone !== undefined &&
    !CALLOUT_TONES.includes(step.calloutTone)
  ) {
    fail(`${path}.calloutTone must be light or accent`);
  }
  return true;
}

// Fields an explicit calloutBox replaces; the app clears them when it writes a box.
const BOX_REPLACED_FIELDS = [
  'calloutPin',
  'calloutWidthPct',
  'calloutScale',
  'tooltipPosition',
  'tooltipOffset',
];

function validateCalloutBox(step, path) {
  const box = step.calloutBox;
  if (box === undefined) return false;
  if (!hasCallout(step)) {
    fail(
      `${path}.calloutBox only applies to tooltip and text-popover steps, or a popover or tooltip showOverlay`
    );
  }
  if (!isObject(box)) fail(`${path}.calloutBox must be an object`);
  for (const key of ['xPct', 'yPct']) {
    if (!inRange(box[key], -500, 500)) {
      fail(`${path}.calloutBox.${key} must be a number from -500 to 500`);
    }
  }
  for (const key of ['wPct', 'hPct']) {
    if (!inRange(box[key], 1, 500)) {
      fail(`${path}.calloutBox.${key} must be a number from 1 to 500`);
    }
  }
  const replaced = BOX_REPLACED_FIELDS.find((key) => step[key] !== undefined);
  if (replaced) fail(`${path}.${replaced}: omit it when calloutBox is set`);
  return true;
}

function validateRegion(step, path) {
  const region = step.region;
  if (!isObject(region)) fail(`${path}.region must be an object`);
  if (!['rect', 'ellipse', 'polygon'].includes(region.shape)) {
    fail(`${path}.region.shape must be rect, ellipse, or polygon`);
  }
  for (const key of ['wPct', 'hPct']) {
    if (
      !Number.isFinite(region[key]) ||
      region[key] <= 0 ||
      region[key] > 100
    ) {
      fail(`${path}.region.${key} must be a number above 0 and at most 100`);
    }
  }
  const halfW = region.wPct / 2;
  const halfH = region.hPct / 2;
  if (
    step.xPct - halfW < -EDGE_SLACK ||
    step.xPct + halfW > 100 + EDGE_SLACK ||
    step.yPct - halfH < -EDGE_SLACK ||
    step.yPct + halfH > 100 + EDGE_SLACK
  ) {
    fail(`${path}.region extends outside the image`);
  }
  if (region.cornerPct !== undefined && !inRange(region.cornerPct, 0, 50)) {
    fail(`${path}.region.cornerPct must be a number from 0 to 50`);
  }
  if (region.shape !== 'polygon') {
    if (region.points !== undefined) {
      fail(`${path}.region.points is only allowed on a polygon`);
    }
    return;
  }
  const points = region.points;
  if (!Array.isArray(points) || points.length < 3 || points.length > 24) {
    fail(`${path}.region.points must have 3 to 24 vertices`);
  }
  points.forEach((point, i) => {
    if (
      !isObject(point) ||
      !inRange(point.x, 0, 100) ||
      !inRange(point.y, 0, 100)
    ) {
      fail(`${path}.region.points[${i}] must have x and y from 0 to 100`);
    }
  });
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  if (
    Math.abs((minX + maxX) / 2 - step.xPct) > BBOX_SLACK ||
    Math.abs((minY + maxY) / 2 - step.yPct) > BBOX_SLACK ||
    Math.abs(maxX - minX - region.wPct) > BBOX_SLACK ||
    Math.abs(maxY - minY - region.hPct) > BBOX_SLACK
  ) {
    fail(
      `${path}.region box must match its polygon points (xPct/yPct at the centre, wPct/hPct the size)`
    );
  }
}

// Tour bindings: the recorder writes `unmapped`; widget content never travels with a tour.
const TOUR_KEYS = new Set([
  'anchor',
  'action',
  'fallback',
  'teacherMustClick',
  'slot',
  'spawns',
  'layoutKeyframes',
]);
// Proportional layouts are fractions of the safe board; allow rounding at the edges.
const PROP_SLACK = 0.01;
// row-<n> and list.<n>.field refs point at whatever sits in that position on the teacher's board.
const POSITIONAL_FIELD = /(^|\.)row-\d+$|\.\d+(\.|$)/;

const isSlot = (value) => Number.isInteger(value) && value >= 0;

function validateLayout(layout, path, ctx, { keyframe = false } = {}) {
  if (!isObject(layout)) fail(`${path} must be an object`);
  if (!isSlot(layout.slot)) fail(`${path}.slot must be an integer from 0`);
  if (!keyframe) {
    if (typeof layout.type !== 'string') fail(`${path}.type must be a widget type`);
    if (ctx.widgetTypes && !ctx.widgetTypes.has(layout.type)) {
      fail(`${path}.type "${layout.type}" is not a widget type`);
    }
    if (layout.appearance !== undefined) {
      fail(`${path}.appearance is recorder-only: leave it out`);
    }
    if (
      layout.aspectRatio !== undefined &&
      !(Number.isFinite(layout.aspectRatio) && layout.aspectRatio > 0)
    ) {
      fail(`${path}.aspectRatio must be a positive number`);
    }
  }
  for (const key of ['xProp', 'yProp']) {
    if (!inRange(layout[key], -PROP_SLACK, 1 + PROP_SLACK)) {
      fail(`${path}.${key} must be a fraction of the board from 0 to 1`);
    }
  }
  for (const key of ['wProp', 'hProp']) {
    if (
      !Number.isFinite(layout[key]) ||
      layout[key] <= 0 ||
      layout[key] > 1 + PROP_SLACK
    ) {
      fail(`${path}.${key} must be a fraction of the board above 0, at most 1`);
    }
  }
  if (
    layout.xProp + layout.wProp > 1 + PROP_SLACK ||
    layout.yProp + layout.hProp > 1 + PROP_SLACK
  ) {
    fail(`${path} extends past the board`);
  }
}

function validateTourSetup(setup, ctx) {
  if (!isObject(setup)) fail('tourSetup must be an object');
  if (!Array.isArray(setup.widgets)) fail('tourSetup.widgets must be an array');
  setup.widgets.forEach((type, i) => {
    if (typeof type !== 'string' || (ctx.widgetTypes && !ctx.widgetTypes.has(type))) {
      fail(`tourSetup.widgets[${i}] must be a widget type`);
    }
  });
  if (setup.layouts === undefined) return;
  if (!Array.isArray(setup.layouts)) fail('tourSetup.layouts must be an array');
  setup.layouts.forEach((layout, i) => {
    const path = `tourSetup.layouts[${i}]`;
    validateLayout(layout, path, ctx);
    if (ctx.slots.has(layout.slot)) fail(`${path}.slot is used twice`);
    ctx.slots.set(layout.slot, layout.type);
  });
}

// The same rules as anchorProblem() in components/tours/tourHealth.ts.
function anchorProblem(ref, ctx) {
  const { TOUR_ANCHORS, parseTourAnchorRef } = ctx.tourAnchors;
  const { id, widgetType, fieldKey } = parseTourAnchorRef(ref);
  if (!Object.prototype.hasOwnProperty.call(TOUR_ANCHORS, id)) {
    return 'is not a registered anchor in config/tourAnchors.ts';
  }
  const def = TOUR_ANCHORS[id];
  if (!def.perWidgetType && !def.perField && !(def.perWidget && widgetType)) {
    return widgetType ? 'names a widget type this anchor does not take' : null;
  }
  if (!widgetType) return 'needs a widget type (id:type)';
  if (def.perField) return fieldKey ? null : 'needs a field key (id:type#field)';
  return ctx.widgetTypes && !ctx.widgetTypes.has(widgetType)
    ? `names an unknown widget type "${widgetType}"`
    : null;
}

function validateTour(step, path, ctx) {
  const tour = step.tour;
  if (!ctx.tourAnchors) {
    fail(`${path}.tour cannot be checked: config/tourAnchors.ts was not found`);
  }
  if (!isObject(tour)) fail(`${path}.tour must be an object`);
  if (tour.unmapped !== undefined) fail(`${path}.tour.unmapped is recorder-only`);
  const extra = Object.keys(tour).find((key) => !TOUR_KEYS.has(key));
  if (extra) fail(`${path}.tour.${extra} is not a tour field`);
  if (typeof tour.anchor !== 'string' || !tour.anchor) {
    fail(`${path}.tour.anchor must be an anchor ref`);
  }
  const problem = anchorProblem(tour.anchor, ctx);
  if (problem) fail(`${path}.tour.anchor "${tour.anchor}" ${problem}`);
  if (!['click', 'observe'].includes(tour.action)) {
    fail(`${path}.tour.action must be click or observe`);
  }
  if (
    tour.teacherMustClick !== undefined &&
    typeof tour.teacherMustClick !== 'boolean'
  ) {
    fail(`${path}.tour.teacherMustClick must be a boolean`);
  }
  if (
    tour.fallback !== undefined &&
    (!isObject(tour.fallback) ||
      typeof tour.fallback.role !== 'string' ||
      !tour.fallback.role ||
      typeof tour.fallback.name !== 'string' ||
      !tour.fallback.name)
  ) {
    fail(`${path}.tour.fallback must have a role and a name`);
  }

  const { TOUR_ANCHORS, parseTourAnchorRef } = ctx.tourAnchors;
  const { id, widgetType, fieldKey } = parseTourAnchorRef(tour.anchor);
  const def = TOUR_ANCHORS[id];
  if (tour.slot !== undefined) {
    if (!isSlot(tour.slot)) fail(`${path}.tour.slot must be an integer from 0`);
    if (!ctx.slots.has(tour.slot)) {
      fail(
        `${path}.tour.slot ${tour.slot} has no layout in tourSetup.layouts or an earlier step's spawns`
      );
    }
    const slotType = ctx.slots.get(tour.slot);
    if (widgetType && slotType !== widgetType) {
      fail(
        `${path}.tour.slot ${tour.slot} holds a ${slotType}, not the anchor's ${widgetType}`
      );
    }
  } else if (def.perWidget) {
    ctx.warn(
      `${path}.tour.anchor "${tour.anchor}" is per widget: without a slot it matches the first such widget on the teacher's board`
    );
  }
  if (fieldKey && POSITIONAL_FIELD.test(fieldKey)) {
    ctx.warn(
      `${path}.tour.anchor "${tour.anchor}" is positional: bind it only to a row the tour itself sets up`
    );
  }
  if (def.destructive && tour.action === 'click' && tour.teacherMustClick === false) {
    ctx.warn(
      `${path}.tour.anchor "${tour.anchor}" is destructive: autopilot will click it for the teacher`
    );
  }
  if (tour.layoutKeyframes !== undefined) {
    if (!Array.isArray(tour.layoutKeyframes) || tour.layoutKeyframes.length === 0) {
      fail(`${path}.tour.layoutKeyframes must be a non-empty array`);
    }
    tour.layoutKeyframes.forEach((kf, i) => {
      const kfPath = `${path}.tour.layoutKeyframes[${i}]`;
      validateLayout(kf, kfPath, ctx, { keyframe: true });
      if (!ctx.slots.has(kf.slot)) fail(`${kfPath}.slot ${kf.slot} is not set up yet`);
    });
  }
  if (tour.spawns !== undefined) {
    validateLayout(tour.spawns, `${path}.tour.spawns`, ctx);
    if (tour.action !== 'click') {
      fail(`${path}.tour.spawns needs action click: the click opens the widget`);
    }
    if (ctx.slots.has(tour.spawns.slot)) {
      fail(`${path}.tour.spawns.slot ${tour.spawns.slot} is already used`);
    }
    // Later steps can bind the spawned widget; this one cannot, it is not open yet.
    ctx.slots.set(tour.spawns.slot, tour.spawns.type);
  }
}

function validateNarration(step, path, warn) {
  const narration = step.narration;
  if (!isObject(narration) || narration.source !== 'generated') {
    fail(
      `${path}.narration: only generated narration from an export passes through; recorded takes are dropped on import`
    );
  }
  if (
    typeof narration.url !== 'string' ||
    !/^https:\/\//.test(narration.url) ||
    typeof narration.storagePath !== 'string' ||
    !Number.isFinite(narration.durationMs)
  ) {
    fail(`${path}.narration must keep the exported url, storagePath and durationMs`);
  }
  warn(
    `${path}.narration was generated for the exported text; regenerate it in the Studio if you changed the step's text`
  );
}

// Markup the player renders: **bold** and [label](https://...) count as their visible words.
const plainText = (text) =>
  text
    .replace(/\*\*([^*\n]+?)\*\*/g, '$1')
    .replace(/\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)/g, '$1');

/**
 * Throws on the first problem; returns the decoded image summary and warnings.
 * @param {unknown} set
 * @param {{ tourAnchors?: { TOUR_ANCHORS: Record<string, object>, parseTourAnchorRef: (ref: string) => { id: string, widgetType?: string, fieldKey?: string } } | null, widgetTypes?: Set<string> | null }} [options]
 * @returns {{ images: Array<Record<string, unknown>>, warnings: string[] }}
 */
export function validateGlSet(set, { tourAnchors = null, widgetTypes = null } = {}) {
  const warnings = [];
  const ctx = {
    tourAnchors,
    widgetTypes,
    slots: new Map(),
    warn: (message) => warnings.push(message),
  };
  if (!isObject(set)) fail('The file must contain one JSON object');
  if (typeof set.title !== 'string' || !set.title.trim()) {
    fail('title must be a non-empty string');
  }
  if (![2, 3, 4, 5].includes(set.schemaVersion)) {
    fail('schemaVersion must be 2, 3, 4 or 5');
  }
  if (
    set.watchPace !== undefined &&
    !['calm', 'standard'].includes(set.watchPace)
  ) {
    fail('watchPace must be calm or standard');
  }
  if (!['structured', 'guided', 'explore'].includes(set.mode)) {
    fail('mode must be structured, guided, or explore');
  }
  for (const forbidden of [
    'imagePaths',
    'isBuilding',
    'authorUid',
    'driveFileIds',
    'slideThumbnails',
    'helpCenter',
    'hasLiveTour',
  ]) {
    if (forbidden in set) fail(`Remove importer-specific field: ${forbidden}`);
  }

  if (!Array.isArray(set.imageUrls) || set.imageUrls.length === 0) {
    fail('imageUrls must contain at least one embedded image');
  }
  if (
    set.imageKinds !== undefined &&
    (!Array.isArray(set.imageKinds) ||
      set.imageKinds.length !== set.imageUrls.length ||
      set.imageKinds.some((kind) => !['image', 'video'].includes(kind)))
  ) {
    fail('imageKinds must align with imageUrls and contain image or video');
  }
  if (set.videoTrims !== undefined) {
    if (
      !Array.isArray(set.videoTrims) ||
      set.videoTrims.length !== set.imageUrls.length
    ) {
      fail('videoTrims must align with imageUrls');
    }
    set.videoTrims.forEach((trim, index) => {
      if (trim === null) return;
      if (set.imageKinds?.[index] !== 'video') {
        fail(`videoTrims[${index}] must be null on an image slide`);
      }
      if (
        !isObject(trim) ||
        !Number.isFinite(trim.start) ||
        !Number.isFinite(trim.end) ||
        trim.start < 0 ||
        trim.start >= trim.end
      ) {
        fail(`videoTrims[${index}] must have 0 <= start < end, in seconds`);
      }
    });
  }

  const decodedImages = set.imageUrls.map((url, index) => {
    if (typeof url !== 'string') fail(`imageUrls[${index}] must be a string`);
    if (url.startsWith('blob:'))
      fail(`imageUrls[${index}] contains a blob URL`);

    const kind = set.imageKinds?.[index] ?? 'image';
    if (kind === 'video') {
      if (!/^https:\/\//.test(url)) {
        fail(`imageUrls[${index}] must be an https URL for a video slide`);
      }
      return { index, kind, url: true };
    }

    const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(url);
    if (!match) {
      fail(`imageUrls[${index}] must be an embedded PNG or JPEG data URI`);
    }

    const bytes = Buffer.from(match[2], 'base64');
    const signature = bytes.subarray(0, 8).toString('hex');
    const validPng = match[1] === 'png' && signature === '89504e470d0a1a0a';
    const validJpeg =
      match[1] === 'jpeg' &&
      bytes.length >= 3 &&
      signature.startsWith('ffd8ff');
    if (!validPng && !validJpeg) {
      fail(`imageUrls[${index}] has an invalid ${match[1]} payload`);
    }

    return { index, kind: match[1], bytes: bytes.length };
  });

  if (!Array.isArray(set.steps) || set.steps.length === 0) {
    fail('steps must contain at least one step');
  }

  const interactionTypes = new Set([
    'tooltip',
    'text-popover',
    'pan-zoom',
    'spotlight',
    'pan-zoom-spotlight',
    'audio',
    'video',
    'question',
  ]);
  const ids = new Set();
  let usesCalloutStyle = false;
  let usesCalloutBox = false;
  const hasTour = set.steps.some((step) => isObject(step) && step.tour !== undefined);
  if (set.tourSetup !== undefined) {
    if (!hasTour) fail('tourSetup is only for a set with tour steps');
    validateTourSetup(set.tourSetup, ctx);
  }

  set.steps.forEach((step, index) => {
    const path = `steps[${index}]`;
    if (!isObject(step)) fail(`${path} must be an object`);
    if (typeof step.id !== 'string' || !step.id.trim()) {
      fail(`${path}.id must be a non-empty string`);
    }
    if (ids.has(step.id)) fail(`${path}.id must be unique`);
    ids.add(step.id);

    for (const key of ['xPct', 'yPct']) {
      if (!Number.isFinite(step[key]) || step[key] < 0 || step[key] > 100) {
        fail(`${path}.${key} must be a number from 0 to 100`);
      }
    }
    if (
      !Number.isInteger(step.imageIndex) ||
      step.imageIndex < 0 ||
      step.imageIndex >= set.imageUrls.length
    ) {
      fail(`${path}.imageIndex is outside imageUrls`);
    }
    if (!interactionTypes.has(step.interactionType)) {
      fail(`${path}.interactionType is invalid`);
    }

    if (step.label !== undefined) {
      if (typeof step.label !== 'string' || !step.label.trim()) {
        fail(`${path}.label must be a non-empty string when present`);
      }
      const labelWords = step.label.trim().split(/\s+/).length;
      if (labelWords > 4) fail(`${path}.label exceeds four words`);
    }

    if (typeof step.text === 'string') {
      if (step.text.includes('\n')) {
        fail(`${path}.text must be one paragraph: the player ignores line breaks`);
      }
      const textWords = plainText(step.text).trim().split(/\s+/).filter(Boolean).length;
      if (textWords > 25) fail(`${path}.text exceeds 25 words`);
      if ((step.text.match(/\*\*[^*\n]+?\*\*/g) ?? []).length > 1) {
        ctx.warn(`${path}.text bolds more than one term`);
      }
    }
    if (step.aiDraft !== undefined && typeof step.aiDraft !== 'boolean') {
      fail(`${path}.aiDraft must be a boolean`);
    }

    if (step.region !== undefined) validateRegion(step, path);
    if (step.calloutPin !== undefined) {
      if (!isObject(step.calloutPin))
        fail(`${path}.calloutPin must be an object`);
      for (const key of ['xPct', 'yPct']) {
        if (!inRange(step.calloutPin[key], 0, 100)) {
          fail(`${path}.calloutPin.${key} must be a number from 0 to 100`);
        }
      }
    }
    if (validateCalloutStyle(step, path)) usesCalloutStyle = true;
    if (validateCalloutBox(step, path)) usesCalloutBox = true;
    if (
      step.cursor !== undefined &&
      (!isObject(step.cursor) ||
        (step.cursor.hide !== undefined &&
          typeof step.cursor.hide !== 'boolean'))
    ) {
      fail(`${path}.cursor must be an object with an optional boolean hide`);
    }
    if (step.narration !== undefined) validateNarration(step, path, ctx.warn);
    if (step.tour !== undefined) validateTour(step, path, ctx);

    if (step.interactionType === 'question') {
      if (!isObject(step.question)) fail(`${path}.question must be an object`);
      if (step.question.type === 'multiple-choice') {
        if (!Array.isArray(step.question.choices)) {
          fail(`${path}.question.choices must be an array`);
        }
        if (!step.question.choices.includes(step.question.correctAnswer)) {
          fail(`${path}.question.correctAnswer must appear in choices`);
        }
      }
      if (
        step.question.type === 'matching' &&
        (!Array.isArray(step.question.matchingPairs) ||
          step.question.matchingPairs.length === 0)
      ) {
        fail(`${path}.question.matchingPairs must not be empty`);
      }
      if (
        step.question.type === 'sorting' &&
        (!Array.isArray(step.question.sortingItems) ||
          step.question.sortingItems.length === 0)
      ) {
        fail(`${path}.question.sortingItems must not be empty`);
      }
    }
  });
  if (usesCalloutBox && set.schemaVersion !== 5) {
    fail('schemaVersion must be 5 when a step sets calloutBox');
  }
  if (!usesCalloutBox && set.schemaVersion === 5) {
    fail('schemaVersion must be 5 only when a step sets calloutBox');
  }
  if (!usesCalloutBox && usesCalloutStyle && set.schemaVersion !== 4) {
    fail(
      'schemaVersion must be 4 when a step sets calloutWidthPct, calloutScale or calloutTone'
    );
  }
  if (!usesCalloutStyle && set.schemaVersion === 4) {
    fail(
      'schemaVersion must be 3 unless a step sets calloutWidthPct, calloutScale or calloutTone'
    );
  }
  return { images: decodedImages, warnings };
}

// Indirect so bundlers leave the runtime import alone.
const importModule = new Function("href", "return import(href)");
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const repoFile = (relative) => join(REPO_ROOT, relative);

/**
 * The live registry from config/tourAnchors.ts (Node strips its types), or null when it is absent.
 * @param {string} [registryPath]
 */
export async function loadTourAnchors(registryPath = repoFile('config/tourAnchors.ts')) {
  if (!existsSync(registryPath)) return null;
  const mod = await importModule(pathToFileURL(registryPath).href);
  return {
    TOUR_ANCHORS: mod.TOUR_ANCHORS,
    parseTourAnchorRef: mod.parseTourAnchorRef,
  };
}

/**
 * Widget types in the TOOLS list of config/tools.ts, or null when it is absent.
 * @param {string} [toolsPath]
 * @returns {Set<string> | null}
 */
export function readWidgetTypes(toolsPath = repoFile('config/tools.ts')) {
  if (!existsSync(toolsPath)) return null;
  const source = readFileSync(toolsPath, 'utf8');
  const start = source.indexOf('export const TOOLS');
  const end = start === -1 ? -1 : source.indexOf('\n];', start);
  if (start === -1 || end === -1) return null;
  return new Set(
    [...source.slice(start, end).matchAll(/^\s*type: '([^']+)',$/gm)].map(
      (match) => match[1]
    )
  );
}

const isCli =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCli) {
  const [filename] = process.argv.slice(2);
  if (!filename) {
    console.error('Usage: node validate_gl_json.mjs <file.gl.json>');
    process.exit(1);
  }
  const source = await readFile(filename, 'utf8');
  let set;
  try {
    set = JSON.parse(source);
  } catch (error) {
    throw new Error(`File is not valid JSON: ${error.message}`);
  }
  const { images, warnings } = validateGlSet(set, {
    tourAnchors: await loadTourAnchors(),
    widgetTypes: readWidgetTypes(),
  });
  console.log(
    JSON.stringify(
      {
        file: filename,
        fileBytes: Buffer.byteLength(source),
        title: set.title,
        schemaVersion: set.schemaVersion,
        steps: set.steps.length,
        tourSteps: set.steps.filter((step) => step.tour).length,
        images,
        warnings,
      },
      null,
      2
    )
  );
}
