/**
 * Bit-grid marker printed on every paper answer sheet (plan Q6/Q7/Q12).
 *
 * A custom grid rather than a QR code: the same pixel sampling that reads
 * bubbles reads these cells, so no encoder, decoder or third-party call is
 * needed. The payload is deliberately opaque — a batch tag, a seat and a page,
 * never a student, roster or quiz id.
 */

import { MARKER_CELL_COUNT } from './paperSheetLayout';

/** Asymmetric so a 180°-rotated read fails to match instead of decoding wrong. */
const MAGIC = 0xb2;

const MAGIC_BITS = 8;
const BATCH_TAG_BITS = 20;
const SEAT_BITS = 10;
const PAGE_BITS = 6;
const FLAG_BITS = 2;
const RESERVED_BITS = 6;
const CRC_BITS = 8;

const DATA_BITS =
  MAGIC_BITS +
  BATCH_TAG_BITS +
  SEAT_BITS +
  PAGE_BITS +
  FLAG_BITS +
  RESERVED_BITS;

/** Compile-time-ish guard: the grid must hold the payload exactly. */
const TOTAL_BITS = DATA_BITS + CRC_BITS;

export const MAX_SEAT = (1 << SEAT_BITS) - 1;
export const MAX_PAGE = (1 << PAGE_BITS) - 1;
export const BATCH_TAG_MASK = (1 << BATCH_TAG_BITS) - 1;

const FLAG_KEY_SHEET = 0b01;

export interface PaperMarkerPayload {
  /** 20-bit digest of the batch id — see `paperBatchTag`. */
  batchTag: number;
  /** 1-based seat within the batch. Spares get a seat too, so every sheet is unique. */
  seat: number;
  /** 1-based page of this student's sheet. */
  page: number;
  /** Set on the bubbled ANSWER KEY sheet that rides in the same stack (Q16). */
  isKeySheet: boolean;
}

/**
 * Stable 20-bit digest of a batch UUID (FNV-1a, folded). The reader only has
 * to confirm a sheet belongs to the batch being imported, never to identify a
 * batch globally, so a short tag keeps the grid small.
 */
export function paperBatchTag(batchId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < batchId.length; i += 1) {
    hash ^= batchId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return ((hash >>> BATCH_TAG_BITS) ^ hash) & BATCH_TAG_MASK;
}

function pushBits(bits: boolean[], value: number, width: number): void {
  for (let i = width - 1; i >= 0; i -= 1) {
    bits.push(((value >>> i) & 1) === 1);
  }
}

function readBits(bits: readonly boolean[], at: number, width: number): number {
  let value = 0;
  for (let i = 0; i < width; i += 1) {
    value = (value << 1) | (bits[at + i] ? 1 : 0);
  }
  return value >>> 0;
}

/** CRC-8/ATM (poly 0x07) over the data bits, zero-padded to whole bytes. */
function crc8(bits: readonly boolean[]): number {
  let crc = 0;
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let b = 0; b < 8; b += 1) {
      // Past the end counts as a zero pad bit — 52 data bits is not a whole
      // number of bytes, and encode and decode must pad identically.
      byte = (byte << 1) | (i + b < bits.length && bits[i + b] ? 1 : 0);
    }
    crc ^= byte;
    for (let b = 0; b < 8; b += 1) {
      crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
  }
  return crc;
}

/** Encode a payload into the grid's cells, row-major, true = inked. */
export function encodePaperMarker(payload: PaperMarkerPayload): boolean[] {
  if (
    !Number.isInteger(payload.seat) ||
    payload.seat < 1 ||
    payload.seat > MAX_SEAT
  ) {
    throw new RangeError(`seat ${payload.seat} out of range`);
  }
  if (
    !Number.isInteger(payload.page) ||
    payload.page < 1 ||
    payload.page > MAX_PAGE
  ) {
    throw new RangeError(`page ${payload.page} out of range`);
  }
  const bits: boolean[] = [];
  pushBits(bits, MAGIC, MAGIC_BITS);
  pushBits(bits, payload.batchTag & BATCH_TAG_MASK, BATCH_TAG_BITS);
  pushBits(bits, payload.seat, SEAT_BITS);
  pushBits(bits, payload.page, PAGE_BITS);
  pushBits(bits, payload.isKeySheet ? FLAG_KEY_SHEET : 0, FLAG_BITS);
  pushBits(bits, 0, RESERVED_BITS);
  pushBits(bits, crc8(bits), CRC_BITS);
  return bits;
}

function decodeOriented(bits: readonly boolean[]): PaperMarkerPayload | null {
  if (readBits(bits, 0, MAGIC_BITS) !== MAGIC) return null;
  const expected = crc8(bits.slice(0, DATA_BITS));
  if (readBits(bits, DATA_BITS, CRC_BITS) !== expected) return null;
  let at = MAGIC_BITS;
  const batchTag = readBits(bits, at, BATCH_TAG_BITS);
  at += BATCH_TAG_BITS;
  const seat = readBits(bits, at, SEAT_BITS);
  at += SEAT_BITS;
  const page = readBits(bits, at, PAGE_BITS);
  at += PAGE_BITS;
  const flags = readBits(bits, at, FLAG_BITS);
  if (seat < 1 || page < 1) return null;
  return { batchTag, seat, page, isKeySheet: (flags & FLAG_KEY_SHEET) !== 0 };
}

/**
 * Decode grid cells back to a payload, or null if the sheet is unreadable.
 *
 * Tries the page as fed and rotated 180°, because a scanner stack routinely
 * contains upside-down sheets. The magic prefix plus the CRC mean at most one
 * orientation can verify, so an unreadable marker fails loudly into the review
 * queue rather than decoding as the wrong student (plan Q18).
 */
export function decodePaperMarker(
  cells: readonly boolean[]
): PaperMarkerPayload | null {
  if (cells.length !== MARKER_CELL_COUNT) return null;
  return decodeOriented(cells) ?? decodeOriented([...cells].reverse());
}

/** True when the grid is sized to hold exactly one encoded payload. */
export function markerFitsGrid(): boolean {
  return TOTAL_BITS === MARKER_CELL_COUNT;
}
