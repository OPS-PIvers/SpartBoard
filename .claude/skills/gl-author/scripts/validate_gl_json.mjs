#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
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
const CALLOUT_TONES = ['dark', 'light', 'accent'];

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
  if (
    step.calloutTone !== undefined &&
    !CALLOUT_TONES.includes(step.calloutTone)
  ) {
    fail(`${path}.calloutTone must be dark, light, or accent`);
  }
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

/**
 * Throws on the first problem; returns the decoded image summary.
 * @param {unknown} set
 * @param {{ tourAnchorIds?: Set<string> | null }} [options] null until the registry exists
 * @returns {Array<Record<string, unknown>>}
 */
export function validateGlSet(set, { tourAnchorIds = null } = {}) {
  if (!isObject(set)) fail('The file must contain one JSON object');
  if (typeof set.title !== 'string' || !set.title.trim()) {
    fail('title must be a non-empty string');
  }
  if (![2, 3, 4].includes(set.schemaVersion)) {
    fail('schemaVersion must be 2, 3 or 4');
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
  for (const forbidden of ['imagePaths', 'isBuilding', 'authorUid']) {
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
      const textWords = step.text.trim().split(/\s+/).filter(Boolean).length;
      if (textWords > 25) fail(`${path}.text exceeds 25 words`);
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
    if (
      step.cursor !== undefined &&
      (!isObject(step.cursor) ||
        (step.cursor.hide !== undefined &&
          typeof step.cursor.hide !== 'boolean'))
    ) {
      fail(`${path}.cursor must be an object with an optional boolean hide`);
    }
    if (step.narration !== undefined) {
      fail(
        `${path}.narration is not importable: record or generate it in the Studio`
      );
    }
    if (step.tour !== undefined) {
      if (!tourAnchorIds) {
        fail(
          `${path}.tour is not supported yet: the tour anchor registry does not exist`
        );
      }
      if (!isObject(step.tour) || !tourAnchorIds.has(step.tour.anchor)) {
        fail(`${path}.tour.anchor must be a registered tour anchor id`);
      }
    }

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
  if (usesCalloutStyle && set.schemaVersion !== 4) {
    fail(
      'schemaVersion must be 4 when a step sets calloutWidthPct, calloutScale or calloutTone'
    );
  }
  if (!usesCalloutStyle && set.schemaVersion === 4) {
    fail(
      'schemaVersion must be 3 unless a step sets calloutWidthPct, calloutScale or calloutTone'
    );
  }
  return decodedImages;
}

/**
 * Anchor ids from config/tourAnchors.ts, or null when the registry does not exist yet.
 * @param {string} [registryPath]
 * @returns {Set<string> | null}
 */
export function readTourAnchorIds(
  registryPath = fileURLToPath(
    new URL('../../../../config/tourAnchors.ts', import.meta.url)
  )
) {
  if (!existsSync(registryPath)) return null;
  const source = readFileSync(registryPath, 'utf8');
  const start = source.indexOf('TOUR_ANCHORS');
  const block = start === -1 ? '' : source.slice(start);
  return new Set(
    [...block.matchAll(/^\s*'([^']+)':\s*\{/gm)].map((match) => match[1])
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
  const decodedImages = validateGlSet(set, {
    tourAnchorIds: readTourAnchorIds(),
  });
  console.log(
    JSON.stringify(
      {
        file: filename,
        fileBytes: Buffer.byteLength(source),
        title: set.title,
        schemaVersion: set.schemaVersion,
        steps: set.steps.length,
        images: decodedImages,
      },
      null,
      2
    )
  );
}
